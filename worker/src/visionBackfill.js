// visionBackfill.js — populate the VISION dimension across the archive: for each still-
// photo ref lacking `vision`, ask Claude what it shows and store {name, labels, setting,
// placeType} back into photo_r2_keys_json. Same SAFE shape as the scene backfill
// (idempotent / reversible / OCC-guarded / no updated_at bump / bounded) — see
// sceneBackfill.js.
//
// TWO extra guards vision needs that scene didn't:
//  • CONSENT + COST GATE. Vision sends photos to the CLOUD (Claude) and costs per call,
//    so it's gated by its OWN knob PHOTO_VISION_MODE (default OFF — a no-op until
//    Jonathan enables it), separate from PHOTO_HEAL_MODE. It never runs autonomously
//    until turned on.
//  • Smaller default limit (network + $/call, not just CPU), and concurrency so a
//    bounded batch still fits a cron: refs are labeled in small parallel groups.
//
// THIRD backfill-eligible state (BUILD 3, §16): a ref that already carries `vision`
// from BEFORE placeType existed has an "old-shape" label — `'placeType' in ref.vision`
// is false. That ref is re-asked (same call, same prompt, same already-consented
// PHOTO_VISION_MODE — a real second spend, surfaced to Jonathan before an archive-wide
// run) but the reply's name/labels/setting are DISCARDED; only `placeType` is merged
// onto the EXISTING vision object. This is the hard rule from the second-opinion review:
// re-running vision must NEVER regenerate/overwrite the already-reviewed, family-facing
// name/labels/setting — additive-only, one new field, nothing else touched. Whether the
// determination lands on a real enum value or `null` (invalid/unusable reply), the
// `placeType` KEY itself is the completion sentinel — its mere presence (even null)
// means "already asked," so a permanently-ambiguous photo is never re-billed forever.
//
// FOURTH backfill-eligible state (BUILD 4c): a ref that already carries `placeType`
// (i.e. cleared the third state above) but predates `signage` — `'signage' in
// ref.vision` is false. Same additive-only re-run pattern, one more time: re-asked,
// reply's name/labels/setting/placeType DISCARDED, only `signage` merged onto the
// EXISTING vision object. Same completion-sentinel posture (the `signage` key's mere
// presence, even null, means "already asked").
//
// `label` is injectable so the runner unit-tests without hitting the API.

import { visionLabel, isValidPlaceType, isValidSignage } from './visionLabel.js'
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
  const stats = {
    mode, tripId: tripId || null, photoRefs: 0, alreadyHad: 0, labeled: 0, failed: 0,
    retryable: 0, memsWritten: 0, hitLimit: false,
    // BUILD 3 (§16) — the third backfill-eligible state: an already-labeled ref that
    // predates placeType. Counted separately from `labeled` (a brand-new full label)
    // since it writes only one additive field, never the reviewed name/labels/setting.
    placeTyped: 0, placeTypeFailed: 0,
    // BUILD 4c — the fourth backfill-eligible state: an already-placeTyped ref that
    // predates signage. Same posture, one field further.
    signaged: 0, signageFailed: 0,
  }
  const needsPlaceTypeOnly = (ref) =>
    ref.vision && typeof ref.vision === 'object' && !('placeType' in ref.vision)
  const needsSignageOnly = (ref) =>
    ref.vision && typeof ref.vision === 'object' && 'placeType' in ref.vision && !('signage' in ref.vision)

  // Gather the refs to label (up to cap), keyed to their memory, so we can label in
  // parallel batches, then write each touched memory once with an OCC guard.
  const parsed = new Map() // memId -> { refs, updated_at }
  const pending = [] // { memId, ref, placeTypeOnly, signageOnly }
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
      const placeTypeOnly = needsPlaceTypeOnly(ref)
      const signageOnly = !placeTypeOnly && needsSignageOnly(ref)
      if ((ref.vision || ref.visionFail) && !placeTypeOnly && !signageOnly) {
        stats.alreadyHad++
        continue
      }
      if (!ref.key) continue
      if (pending.length >= cap) {
        stats.hitLimit = true
        continue
      }
      pending.push({ memId: r.id, ref, placeTypeOnly, signageOnly })
    }
    if (stats.hitLimit) break
  }

  const touched = new Set()
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async ({ memId, ref, placeTypeOnly, signageOnly }) => {
        let bytes = null
        try {
          const obj = await env.ASSETS.get(ref.key)
          if (obj) bytes = new Uint8Array(await obj.arrayBuffer())
        } catch {
          bytes = null
        }
        if (!bytes) {
          // R2 miss/throw — permanent for an archived object (mirrors the scene backfill).
          if (placeTypeOnly) {
            // The ref already has a real, reviewed label — rule #1 forbids touching
            // name/labels/setting, but placeType itself is new and gets the SAME
            // permanent-miss treatment as the primary path: stamp the completion
            // sentinel (null) so a deleted/missing object isn't re-fetched every sweep.
            stats.placeTypeFailed++
            if (!dryRun) {
              ref.vision = { ...ref.vision, placeType: null }
              touched.add(memId)
            }
            return
          }
          if (signageOnly) {
            // Same permanent-miss sentinel, one field further (BUILD 4c).
            stats.signageFailed++
            if (!dryRun) {
              ref.vision = { ...ref.vision, signage: null }
              touched.add(memId)
            }
            return
          }
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
        if (placeTypeOnly) {
          // BUILD 3 (§16) rule #1: ONLY placeType is ever written here. `v` is a fresh
          // full reply (same call as the primary path) but name/labels/setting are
          // discarded — the existing, already-reviewed object is spread forward
          // untouched and just gains one field. A reply with no usable placeType (or
          // no usable reply at all, `v === null`) still counts as a completed, PERMANENT
          // determination — the `placeType` key's mere presence (even null) is the
          // completion sentinel, so an ambiguous photo is asked once, not re-billed
          // every sweep.
          // Independent server-side-style re-validation at the write site — never trust
          // that `v.placeType` already passed the enum check just because the one wired
          // `label` impl (parseVisionReply/extractPlaceType) happens to enforce it. A
          // hostile/malformed value from a future `label` implementation (or a test
          // stub) is dropped here too, same posture as photoSidecar.js's independent
          // re-validation of every sidecar field.
          const pt = v && isValidPlaceType(v.placeType) ? v.placeType : null
          if (pt) stats.placeTyped++
          else stats.placeTypeFailed++
          if (!dryRun) {
            ref.vision = { ...ref.vision, placeType: pt }
            touched.add(memId)
          }
          return
        }
        if (signageOnly) {
          // BUILD 4c, same rule one field further: ONLY signage is ever written here.
          // Independent re-validation at the write site (never trust the wired `label`
          // impl already enforced it), same completion-sentinel posture as placeType.
          const sig = v && isValidSignage(v.signage) ? v.signage : null
          if (sig) stats.signaged++
          else stats.signageFailed++
          if (!dryRun) {
            ref.vision = { ...ref.vision, signage: sig }
            touched.add(memId)
          }
          return
        }
        if (v && typeof v.name === 'string' && v.name) {
          stats.labeled++
          if (!dryRun) {
            // Independent re-validation of placeType/signage before storing —
            // same defense-in-depth posture as the placeTypeOnly/signageOnly
            // branches below (adversarial review, 2026-07-11: this primary
            // path was trusting `v` verbatim, the one write site in this file
            // that didn't re-check). name/labels/setting are the pre-existing,
            // already-reviewed shape and are stored as-is (unaffected).
            ref.vision = {
              ...v,
              placeType: isValidPlaceType(v.placeType) ? v.placeType : null,
              signage: isValidSignage(v.signage) ? v.signage : null,
            }
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
