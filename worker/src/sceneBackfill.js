// sceneBackfill.js — populate the COMPOSITION dimension across the archive. For every
// photo ref that lacks a `scene` signature, compute one from the stored bytes and write
// it back into photo_r2_keys_json (mig-less, the same sidecar GPS rides). The engine
// (sessionHeal → buildMoments) then has composition to overlap with time + GPS + faces,
// which is the lever for the ~92 no-GPS Provincetown photos the agenda engine leaves.
//
// SAFE by construction:
//  • idempotent — a ref that already has `scene` is skipped, so re-runs are cheap and
//    the pass resumes exactly where a bounded call left off;
//  • reversible — `scene` is an ADDITIVE field; clearing it restores the prior JSON;
//  • OCC-guarded — the UPDATE matches the stored updated_at, so a concurrent memory edit
//    is never clobbered (the ref just gets picked up on the next run);
//  • it does NOT bump updated_at — the signature is an internal engine input read
//    server-side, not something devices need, so no mass cross-device re-sync;
//  • bounded — at most `limit` decodes per call (Photon WASM is CPU-heavy).
// Only real photos are touched (note/voice/video refs are skipped).
//
// `computeSig` is injectable so the runner's idempotency/OCC/bounding logic unit-tests
// without the WASM decoder; it defaults to the real Photon path.

import { sceneSignatureFromBytes } from './sceneSignature.js'

// A still photo we can hash — NOT a note/voice, and NOT a video. The writer only sets
// `kind` on SOME paths (the pieces path stamps kind:'video'; the single-video path
// emits {key:'…mp4', mime:'video/…', posterKey} with NO kind), so relying on kind alone
// would feed an .mp4 to the decoder — which can panic the WASM instance for the rest of
// the run. Skip anything carrying a poster or a video/* mime too.
export function isStillPhoto(ref) {
  if (ref.kind && ref.kind !== 'photo') return false
  if (ref.posterKey) return false
  const mime = typeof ref.mime === 'string' ? ref.mime : ''
  if (mime.startsWith('video')) return false
  return true
}

export async function backfillSceneSignatures(
  env,
  { tripId, dryRun = false, limit = 120, computeSig = sceneSignatureFromBytes } = {}
) {
  const sql = tripId
    ? 'SELECT id, photo_r2_keys_json, updated_at FROM memories WHERE trip_id = ? AND deleted_at IS NULL'
    : 'SELECT id, photo_r2_keys_json, updated_at FROM memories WHERE deleted_at IS NULL'
  const stmt = tripId ? env.DB.prepare(sql).bind(tripId) : env.DB.prepare(sql)
  const { results: rows } = await stmt.all()
  const stats = {
    dryRun,
    tripId: tripId || null,
    memories: rows?.length || 0,
    photoRefs: 0,
    alreadyHad: 0,
    computed: 0,
    wrote: 0,
    failed: 0,
    memsWritten: 0,
    hitLimit: false,
  }
  for (const r of rows || []) {
    let refs
    try {
      refs = JSON.parse(r.photo_r2_keys_json || '[]')
    } catch {
      continue
    }
    if (!Array.isArray(refs) || !refs.length) continue
    let changed = false
    for (const ref of refs) {
      if (!ref || typeof ref !== 'object') continue
      if (!isStillPhoto(ref)) continue // note / voice / video → not a still image
      stats.photoRefs++
      // Skip a ref already resolved — a real signature, OR a prior hard failure we gave
      // up on (the sentinel below), so a permanently-undecodable ref stops re-burning
      // the bounded decode budget every night.
      if ((typeof ref.scene === 'string' && ref.scene) || ref.sceneFail) {
        stats.alreadyHad++
        continue
      }
      if (!ref.key) continue
      if (stats.computed >= limit) {
        stats.hitLimit = true
        continue
      }
      // A hard failure (R2 miss / undecodable) stamps a REVERSIBLE sentinel so it isn't
      // retried forever (clear `sceneFail` to re-attempt).
      const markFail = () => {
        stats.failed++
        if (!dryRun) {
          ref.sceneFail = true
          changed = true
        }
      }
      let bytes = null
      try {
        const obj = await env.ASSETS.get(ref.key)
        if (!obj) {
          markFail()
          continue
        }
        bytes = new Uint8Array(await obj.arrayBuffer())
      } catch {
        markFail()
        continue
      }
      const sig = computeSig(bytes)
      stats.computed++
      if (typeof sig !== 'string' || !sig) {
        markFail()
        continue
      }
      if (!dryRun) {
        ref.scene = sig
        changed = true
      }
      stats.wrote++
    }
    if (changed && !dryRun) {
      const upd = await env.DB.prepare(
        'UPDATE memories SET photo_r2_keys_json = ? WHERE id = ? AND updated_at = ? AND deleted_at IS NULL'
      )
        .bind(JSON.stringify(refs), r.id, r.updated_at)
        .run()
      if ((upd?.meta?.changes ?? 0) > 0) stats.memsWritten++
    }
    if (stats.hitLimit) break
  }
  return stats
}
