// visionBackfill.js — populate the VISION dimension across the archive: for each still-
// photo ref lacking `vision`, ask Claude what it shows and store {name, labels, setting}
// back into photo_r2_keys_json. Same SAFE shape as the scene backfill (idempotent /
// reversible / OCC-guarded / no updated_at bump / bounded) — see sceneBackfill.js.
//
// TWO extra guards vision needs that scene didn't:
//  • CONSENT + COST GATE. Vision sends photos to the CLOUD (Claude) and costs per call,
//    so it's gated by its OWN knob PHOTO_VISION_MODE (default OFF — a no-op until
//    Jonathan enables it), separate from PHOTO_HEAL_MODE. It never runs autonomously
//    until turned on.
//  • Smaller default limit (network + $/call, not just CPU), and concurrency so a
//    bounded batch still fits a cron: refs are labeled in small parallel groups.
//
// `label` is injectable so the runner unit-tests without hitting the API.

import { visionLabel } from './visionLabel.js'
import { isStillPhoto } from './sceneBackfill.js'

export function photoVisionMode(env) {
  const raw = typeof env?.PHOTO_VISION_MODE === 'string' ? env.PHOTO_VISION_MODE.trim() : ''
  return raw === 'shadow' || raw === 'on' ? raw : 'off'
}

export function visionBackfillLimit(env) {
  const raw = env?.PHOTO_VISION_BACKFILL_LIMIT
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 24
}

const CONCURRENCY = 6

export async function backfillVisionLabels(
  env,
  { tripId, dryRun = false, limit, label = visionLabel } = {}
) {
  const mode = photoVisionMode(env)
  if (mode === 'off') return { skipped: 'off' }
  if (!env?.ANTHROPIC_API_KEY) return { skipped: 'no-key' }
  const cap = Number.isFinite(limit) ? limit : visionBackfillLimit(env)
  const sql = tripId
    ? 'SELECT id, photo_r2_keys_json, updated_at FROM memories WHERE trip_id = ? AND deleted_at IS NULL'
    : 'SELECT id, photo_r2_keys_json, updated_at FROM memories WHERE deleted_at IS NULL'
  const stmt = tripId ? env.DB.prepare(sql).bind(tripId) : env.DB.prepare(sql)
  const { results: rows } = await stmt.all()
  const stats = { mode, tripId: tripId || null, photoRefs: 0, alreadyHad: 0, labeled: 0, failed: 0, retryable: 0, memsWritten: 0, hitLimit: false }

  // Gather the refs to label (up to cap), keyed to their memory, so we can label in
  // parallel batches, then write each touched memory once with an OCC guard.
  const parsed = new Map() // memId -> { refs, updated_at }
  const pending = [] // { memId, ref }
  for (const r of rows || []) {
    let refs
    try {
      refs = JSON.parse(r.photo_r2_keys_json || '[]')
    } catch {
      continue
    }
    if (!Array.isArray(refs) || !refs.length) continue
    parsed.set(r.id, { refs, updated_at: r.updated_at })
    for (const ref of refs) {
      if (!ref || typeof ref !== 'object' || !isStillPhoto(ref)) continue
      stats.photoRefs++
      if (ref.vision || ref.visionFail) {
        stats.alreadyHad++
        continue
      }
      if (!ref.key) continue
      if (pending.length >= cap) {
        stats.hitLimit = true
        continue
      }
      pending.push({ memId: r.id, ref })
    }
    if (stats.hitLimit) break
  }

  const touched = new Set()
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async ({ memId, ref }) => {
        let bytes = null
        try {
          const obj = await env.ASSETS.get(ref.key)
          if (obj) bytes = new Uint8Array(await obj.arrayBuffer())
        } catch {
          bytes = null
        }
        if (!bytes) {
          // R2 miss/throw — permanent for an archived object (mirrors the scene backfill)
          stats.failed++
          if (!dryRun) {
            ref.visionFail = true
            touched.add(memId)
          }
          return
        }
        let v
        try {
          v = await label(env, bytes)
        } catch {
          // API non-2xx (429/529 overload) / network error — RETRYABLE: skip WITHOUT a
          // sentinel so the ref is re-attempted next sweep (a transient blip must not
          // permanently cap vision coverage).
          stats.retryable++
          return
        }
        if (v && typeof v.name === 'string' && v.name) {
          stats.labeled++
          if (!dryRun) {
            ref.vision = v
            touched.add(memId)
          }
        } else {
          // a reply with no usable name — a genuine, permanent no-label
          stats.failed++
          if (!dryRun) {
            ref.visionFail = true
            touched.add(memId)
          }
        }
      })
    )
  }

  if (!dryRun) {
    for (const memId of touched) {
      const { refs, updated_at } = parsed.get(memId)
      const upd = await env.DB.prepare(
        'UPDATE memories SET photo_r2_keys_json = ? WHERE id = ? AND updated_at = ? AND deleted_at IS NULL'
      )
        .bind(JSON.stringify(refs), memId, updated_at)
        .run()
      if ((upd?.meta?.changes ?? 0) > 0) stats.memsWritten++
    }
  }
  return stats
}
