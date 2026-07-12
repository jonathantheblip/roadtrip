// offsetInference.js — the worker-side OFFSET INFERENCE ENGINE (Build 2,
// FAMILY_TRIPS_VISION §14): for every photo/video ref lacking `offsetMinutes`
// on a trip with a resolved `trip.tz`, propose the zone's real DST-correct
// offset at that ref's capture instant, corroborate it (agenda-free — the
// photo is the reference, the stay-timezone hypothesis is what's on trial),
// and write it ONLY when corroborated.
//
// THE KNOB, explicitly (mirrors photoHealRunner.js's v1 contract exactly —
// this file's own earlier ambiguity here is what caused a real live bug: an
// unconditional real write under 'shadow'. Never leave this ambiguous again):
// `mode` is one of the SAME env.PHOTO_HEAL_MODE values the v1 heal engine
// uses, threaded in by the caller (never read from env directly here, so a
// caller can also drive it in tests):
//   • mode !== 'on' (i.e. 'shadow', or — defensively — anything missing or
//     unrecognized) → COMPUTE the full tier breakdown (auto/confirm/leave —
//     here: corroborated/conflicting/no-signal, with counts + per-conflict
//     detail) so Jonathan can review what the engine WOULD do, but WRITE
//     NOTHING to any ref. This must be a true no-op on the database: not one
//     byte of `photo_r2_keys_json` changes. offsetMinutes is NOT inert
//     metadata (unlike the scene hash or vision labels, which only ever feed
//     an internal shadow ledger nothing currently surfaces) — it directly
//     drives photoMatch.js's wall-clock day-binning and sessionHeal.js's time
//     reasoning, both of which are family-visible, so this engine's writes
//     get the SAME shadow discipline as v1's stop-moves.
//   • mode === 'on' → compute AND apply the auto-tier (corroborated) writes
//     for real, exactly as before this fix (when it was, wrongly,
//     unconditional). Confirm-tier and conflicting-tier candidates NEVER
//     write regardless of mode — that was already correct and is unchanged.
//
// SAFE by construction, same shape as sceneBackfill.js/visionBackfill.js:
//  • idempotent — needsOffset() only ever selects a ref that still lacks the
//    field, so a re-run picks up exactly where a bounded call left off;
//  • OCC-guarded — the UPDATE matches the stored updated_at, so a concurrent
//    memory edit (or another device's own gap-fill) is never clobbered;
//  • does NOT bump updated_at — a computed enrichment, not a family edit;
//  • bounded — at most `limit` refs actually considered per call;
//  • no permanent-failure sentinel needed — this is pure math over data
//    already in hand, no external I/O to fail and retry.
// This engine only ever TARGETS refs currently lacking offsetMinutes (the
// `needsOffset` read-time filter), so it never needs the full provenance
// write-seam tiering rule (memoryStore.js's tieredWriteAllowed) — only the
// OCC race guard above, per the plan.

import { tzOffsetMinutes } from './tzOffset.js'
import { sunTimes } from './sunTimes.js'
import { stayPlaceCoords } from './stayPlaceCoords.js'
import { weatherConflict } from './weatherBackfill.js'
import { findSequenceInversions } from './seqName.js'

const HOUR_MS = 3600000
// Confirmed fixture/test data (CLAUDE.md's explicit TRAP warning) — never
// derive or write anything for it, in either direction.
const SKIP_TRIP_IDS = new Set(['volleyball-2026'])

const MODES = new Set(['off', 'shadow', 'on'])

// THE PER-LEVER KNOB (BUILD_PLAN_WITNESS_FLEET_2.md W0) — copies 4a's proven
// photoStopGeocodeMode shape verbatim (stopGeocodeBackfill.js). Read this
// module's OWN var, defaulting to the caller-supplied fallback (the already-
// resolved global mode) when unset/unrecognized, so an unconfigured install
// behaves exactly like every other backfill; Jonathan promotes R2
// independently by setting PHOTO_OFFSET_MODE specifically. Never imports
// photoHealMode itself (photoHealRunner.js imports THIS module; a back-
// import would cycle) — the caller (healSweep) passes its own already-
// computed mode down instead.
export function photoOffsetMode(env, fallback) {
  const raw = typeof env?.PHOTO_OFFSET_MODE === 'string' ? env.PHOTO_OFFSET_MODE.trim() : ''
  if (MODES.has(raw)) return raw
  return MODES.has(fallback) ? fallback : 'off'
}

export function offsetInferenceLimit(env) {
  const raw = env?.PHOTO_OFFSET_BACKFILL_LIMIT
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 120
}

// Pure: 'corroborated' | 'conflicting' | 'no-signal' for one ref against the
// trip's stay coords. Only an 'outdoor'-labeled ref (Build 1's vision
// backfill) carries a daylight signal at all; everything else (no vision,
// vision but not outdoor, or no usable sunrise/sunset at extreme latitudes)
// is honestly 'no-signal' — neither corroborates nor disproves.
//
// Compares the ref's REAL capturedAt UTC instant directly against the real
// UTC sunrise/sunset window at the stay's coords — mathematically identical
// to converting both sides to "local wall clock" first (the SAME proposed
// offset would cancel out of both sides of the inequality), so no offset is
// needed for this check at all — only for what gets WRITTEN once a ref clears
// 'corroborated'. capturedAt is never touched by any of this (ground truth:
// it's always a real, correct UTC instant already).
//
// `weatherCtx` (BUILD_PLAN_WITNESS_FLEET_2.md W1) is the trip's cached
// `weatherDays` object (weatherBackfill.js) — an ADDITIVE, OPTIONAL third arg:
// absent/undefined, this function's behavior is byte-identical to before W1.
// VETO-ONLY, decided (the plan's own "Design rules" bullet, taken as
// authoritative over its more general "combined conservatively" framing
// elsewhere): weather may only ever DEMOTE an already-daylight-corroborated
// tier to 'conflicting' when the ref's own vision-claimed weather (e.g. a
// "sunny day" label) is contradicted by the cached observed weather at its
// capture hour. It can never promote 'no-signal' or 'conflicting' toward
// 'corroborated' on its own — so it needs no new write-promotion knob; a
// missing claim or missing cached data abstains (weatherConflict returns
// false), leaving the daylight-only tier untouched.
export function corroborationTier(ref, coords, weatherCtx) {
  if (!ref || ref.vision?.setting !== 'outdoor') return 'no-signal'
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return 'no-signal'
  const capturedAtMs = Date.parse(ref?.capturedAt)
  if (!Number.isFinite(capturedAtMs)) return 'no-signal'
  const { sunrise, sunset } = sunTimes(new Date(capturedAtMs), coords.lat, coords.lng)
  if (!sunrise || !sunset) return 'no-signal' // polar day/night — no usable window
  const lo = sunrise.getTime() - HOUR_MS
  const hi = sunset.getTime() + HOUR_MS
  const tier = capturedAtMs >= lo && capturedAtMs <= hi ? 'corroborated' : 'conflicting'
  if (tier === 'corroborated' && weatherConflict(ref, weatherCtx)) return 'conflicting'
  return tier
}

// A ref this engine may ever touch: no offsetMinutes yet, a real capturedAt to
// compute against, a stable key to identify it in the report, and either a
// photo or a video (never a note/voice E4 piece, which carries no capture
// clock at all).
function needsOffset(ref) {
  return (
    !!ref &&
    typeof ref === 'object' &&
    !Number.isFinite(ref.offsetMinutes) &&
    typeof ref.capturedAt === 'string' &&
    !!ref.capturedAt &&
    typeof ref.key === 'string' &&
    !!ref.key &&
    (!ref.kind || ref.kind === 'photo' || ref.kind === 'video')
  )
}

export async function backfillOffsetInference(env, { tripId, mode, limit } = {}) {
  // ONLY 'on' ever writes for real. 'shadow' and anything missing/unrecognized
  // (a typo'd knob, an omitted argument) are treated identically — fail safe,
  // same posture as photoHealMode's own unrecognized-value handling.
  const applyWrites = mode === 'on'
  const cap = Number.isFinite(limit) ? limit : offsetInferenceLimit(env)
  const tripSql = tripId
    ? 'SELECT id, data_json FROM trips WHERE id = ? AND deleted_at IS NULL'
    : 'SELECT id, data_json FROM trips WHERE deleted_at IS NULL'
  const tripStmt = tripId ? env.DB.prepare(tripSql).bind(tripId) : env.DB.prepare(tripSql)
  const { results: tripRows } = await tripStmt.all()
  const stats = {
    mode: mode ?? null,
    tripsConsidered: 0,
    tripsNoTz: 0,
    refsScanned: 0,
    corroborated: 0,
    conflicting: 0,
    noSignal: 0,
    wrote: 0,
    memsWritten: 0,
    hitLimit: false,
    // W1: how many of the 'conflicting' refs below were flipped THERE by the
    // weather veto specifically (i.e. daylight alone said 'corroborated') —
    // distinct from `conflicting`'s total, so a shadow report can show the
    // veto's OWN contribution rather than conflating it with daylight
    // conflicts. Structurally zero until a trip carries both `trip.tz` (R1)
    // and cached `weatherDays` — see this build's HONEST REACH note.
    weatherVetoes: 0,
    // Enough detail per conflict for a human to investigate later (the plan's
    // explicit ask) — no persistent storage invented for it, this run's
    // report IS the deliverable for this tier.
    conflicts: [],
    // W2 (BUILD_PLAN_WITNESS_FLEET_2.md) — the filename-SEQUENCE order-
    // consistency diagnostic: a same-device-key capturedAt-order vs filename-
    // order inversion is clock suspicion on that span. REPORT ONLY — never
    // read by anything that writes; shares this function's existing trip.tz
    // gate above (same structural-zero honesty as the weather veto: it
    // evaluates zero refs until a trip has trip.tz).
    sequenceInversions: [],
  }
  let attempted = 0
  for (const tr of tripRows || []) {
    if (stats.hitLimit) break
    if (SKIP_TRIP_IDS.has(tr.id)) continue
    let trip
    try {
      trip = JSON.parse(tr.data_json)
    } catch {
      continue
    }
    if (!trip?.tz) {
      stats.tripsNoTz++
      continue
    }
    const coords = stayPlaceCoords(trip)
    if (!coords) continue
    stats.tripsConsidered++
    const { results: memRows } = await env.DB.prepare(
      'SELECT id, photo_r2_keys_json, updated_at, author_traveler FROM memories WHERE trip_id = ? AND deleted_at IS NULL'
    )
      .bind(tr.id)
      .all()
    // W2 — collected across EVERY ref this trip carries (not just those still
    // lacking offsetMinutes below), so the order-consistency diagnostic sees
    // the whole device-key picture. Report-only: nothing here is written.
    const seqRefs = []
    for (const r of memRows || []) {
      let refs
      try {
        refs = JSON.parse(r.photo_r2_keys_json || '[]')
      } catch {
        continue
      }
      if (!Array.isArray(refs) || !refs.length) continue
      for (const ref of refs) {
        if (typeof ref?.srcName === 'string' && ref.srcName) {
          seqRefs.push({ key: ref.key, srcName: ref.srcName, capturedAt: ref.capturedAt, meta: ref.meta, author: r.author_traveler })
        }
      }
      let changed = false
      for (const ref of refs) {
        if (!needsOffset(ref)) continue
        stats.refsScanned++
        if (attempted >= cap) {
          stats.hitLimit = true
          continue
        }
        attempted++
        const capturedAtMs = Date.parse(ref.capturedAt)
        const proposed = tzOffsetMinutes(new Date(capturedAtMs), trip.tz)
        if (proposed === null) {
          stats.noSignal++
          continue
        }
        const tier = corroborationTier(ref, coords, trip.weatherDays)
        if (tier === 'corroborated') {
          stats.corroborated++
          stats.wrote++
          if (applyWrites) {
            ref.offsetMinutes = proposed
            ref.prov = { ...ref.prov, off: 'inferred-place' }
            changed = true
          }
        } else if (tier === 'conflicting') {
          stats.conflicting++
          // Was this SPECIFICALLY the weather veto (daylight alone said
          // 'corroborated', weather flipped it), vs. a daylight conflict on
          // its own? Re-derives the daylight-only tier (no weatherCtx — the
          // exact pre-W1 call shape) rather than threading a side-channel out
          // of corroborationTier, so its public contract stays a plain tier
          // string. Cheap: sunTimes is pure math, and this only runs for refs
          // already inside the bounded `cap`.
          if (corroborationTier(ref, coords) === 'corroborated') stats.weatherVetoes++
          stats.conflicts.push({
            tripId: tr.id,
            memoryId: r.id,
            refKey: ref.key,
            proposedOffsetMinutes: proposed,
            capturedAt: ref.capturedAt,
          })
        } else {
          stats.noSignal++
        }
      }
      if (changed && applyWrites) {
        // OCC-guarded, never bumps updated_at — a computed enrichment, not a
        // family-visible edit (matches sceneBackfill/visionBackfill exactly).
        // `changed` can only ever be true when applyWrites was true when it
        // was set (above), so this second check is redundant-by-construction
        // — kept anyway as a belt-and-suspenders guard against this write
        // ever firing under a mode this function didn't mean to write for.
        const upd = await env.DB.prepare(
          'UPDATE memories SET photo_r2_keys_json = ? WHERE id = ? AND updated_at = ? AND deleted_at IS NULL'
        )
          .bind(JSON.stringify(refs), r.id, r.updated_at)
          .run()
        if ((upd?.meta?.changes ?? 0) > 0) stats.memsWritten++
      }
    }
    // W2 — report-only; a positive here never demotes/promotes any tier
    // above, never affects `applyWrites`, never touches the DB.
    for (const inv of findSequenceInversions(seqRefs)) {
      stats.sequenceInversions.push({ tripId: tr.id, ...inv })
    }
  }
  return stats
}
