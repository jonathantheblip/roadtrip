// momentGpsPropagation.js — Build 5 (BUILD_PLAN_SIGNAL_FLEET.md): propagate
// GPS within the LEDGER MOMENT (not the scene-cluster — a scene hash at
// ≤10 bits is a near-duplicate detector, not a same-place one; the grounding
// measured scene-scoped spreading at 0 refs archive-wide either way). A
// moment whose located members all agree within finalizeMoment's own 250m
// radius (sessions.js) propagates that centroid onto its unlocated members.
//
// MEASURED REACH TODAY: ZERO (plan-review-corrected) — the one apparent
// candidate sits in a moment whose located members span ~42km across two
// people's phones/towns in the same minute (legitimate — moments merge
// across people) and correctly REFUSES via the 250m-disagreement rule. This
// is a pure STANDING FORWARD MECHANISM: every new GPS-bearing photo/video
// (Build 1 now captures video GPS too) becomes a spreader into whatever
// unlocated refs share its moment, forever. A shadow report claiming > 0 on
// today's archive is a bug, not a feature working harder.
//
// SOURCE-TIER RULE (no guess cascades), TIGHTENED per plan review: propagate
// ONLY from members with EXPLICIT `ref.prov.gps` ∈ {'exif','scan'} —
// absent-prov does NOT count as reference-presumed here (unlike the general
// Build 2 rule), because absent-prov creates a cascade hazard: if a future
// bug ever stripped 'propagated' at the sync round-trip, the bare value
// would arrive prov-absent and, under the looser rule, become an eligible
// SOURCE — a guess seeding guesses. NEVER from a Build-4 pin, an inferred
// offset/GPS, or another propagated value (none of those are 'exif'/'scan').
//
// SAFE by construction, same shape as offsetInference.js:
//  • idempotent — needsGps() only ever selects a ref currently lacking BOTH
//    lat and lng, so a re-run resumes exactly where a bounded call left off;
//  • OCC-guarded — each memory UPDATE matches its stored updated_at;
//  • does NOT bump updated_at — a computed enrichment, not a family edit;
//  • bounded — at most `limit` propagation writes considered per call.
//
// THE KNOB: the GLOBAL PHOTO_HEAL_MODE directly (mirrors offsetInference.js/
// tripTzBackfill.js — MANDATORY gating, not the per-lever pattern BUILD 4
// introduces for 4a, since Build 5 has no independent pre-authorization to
// promote separately). mode !== 'on' computes the full would-write count but
// writes nothing; ref lat/lng is family-visible through FOUR ungated client
// consumers (settle-card evidence pins, quiet-day classification, album
// coordinate labels, the re-file affordance), so this needs the same shadow
// discipline as Build 2's offset/tz backfills.

import { buildTripDecisions } from './sessionHeal.js'

const SKIP_TRIP_IDS = new Set(['volleyball-2026'])
const INHERIT_RADIUS_M = 250 // mirrors sessions.js's SESSION_DEFAULTS/MOMENT_DEFAULTS.inheritRadiusMeters
const REFERENCE_GPS_PROV = new Set(['exif', 'scan'])

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function propagateMomentGpsLimit(env) {
  const raw = env?.PHOTO_GPS_PROPAGATION_LIMIT
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 60
}

// A REFERENCE-tier propagation SOURCE: real coords, EXPLICIT exif/scan prov.
function isReferenceSource(ref) {
  return (
    !!ref &&
    Number.isFinite(ref.lat) &&
    Number.isFinite(ref.lng) &&
    typeof ref.prov?.gps === 'string' &&
    REFERENCE_GPS_PROV.has(ref.prov.gps)
  )
}

// A ref this engine may ever WRITE: no lat/lng at all yet, a stable key, and
// a photo/video (never a note/voice piece, which carries no coordinates).
function needsGps(ref) {
  return (
    !!ref &&
    typeof ref === 'object' &&
    !Number.isFinite(ref.lat) &&
    !Number.isFinite(ref.lng) &&
    typeof ref.key === 'string' &&
    !!ref.key &&
    (!ref.kind || ref.kind === 'photo' || ref.kind === 'video')
  )
}

// finalizeMoment's exact centroid/spread rule (sessions.js), reapplied to
// ONLY the reference-tier subset of a moment's members: agree within radius
// → the centroid; disagree → refuse (never fabricate one location for a
// burst that moved — the same refusal the live ledger already records as
// evidence='time-only').
function centroidIfAgreeing(sources) {
  if (!sources.length) return null
  const lat = sources.reduce((s, p) => s + p.lat, 0) / sources.length
  const lng = sources.reduce((s, p) => s + p.lng, 0) / sources.length
  const spread = sources.reduce((mx, p) => Math.max(mx, haversineMeters(lat, lng, p.lat, p.lng)), 0)
  return spread <= INHERIT_RADIUS_M ? { lat, lng } : null
}

export async function propagateMomentGps(env, { mode, limit } = {}) {
  // ONLY 'on' ever writes for real — see header.
  const applyWrites = mode === 'on'
  const cap = Number.isFinite(limit) ? limit : propagateMomentGpsLimit(env)
  const { results: tripRows } = await env.DB.prepare(
    'SELECT id, data_json FROM trips WHERE deleted_at IS NULL'
  ).all()
  const stats = {
    mode: mode ?? null,
    tripsConsidered: 0,
    momentsScanned: 0,
    sourceMoments: 0,
    disagreements: 0,
    wouldPropagate: 0,
    wrote: 0,
    memsWritten: 0,
    hitLimit: false,
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
    const { results: memRows } = await env.DB.prepare(
      'SELECT id, photo_r2_keys_json, updated_at FROM memories WHERE trip_id = ? AND deleted_at IS NULL'
    )
      .bind(tr.id)
      .all()
    if (!memRows || !memRows.length) continue
    stats.tripsConsidered++

    let days
    try {
      days = buildTripDecisions(trip, memRows)
    } catch {
      continue
    }

    // Index every ref by its stable key, and remember which memory (+ its
    // parsed refs array + OCC stamp) owns it — a moment can span multiple
    // memories, so writes are batched per-memory after the scan below.
    const refByKey = new Map()
    const memOfKey = new Map()
    const parsedMems = new Map() // memId -> { refs, updated_at }
    for (const r of memRows) {
      let refs
      try {
        refs = JSON.parse(r.photo_r2_keys_json || '[]')
      } catch {
        continue
      }
      if (!Array.isArray(refs)) continue
      parsedMems.set(r.id, { refs, updated_at: r.updated_at })
      for (const ref of refs) {
        if (!ref || !ref.key) continue
        refByKey.set(ref.key, ref)
        memOfKey.set(ref.key, r.id)
      }
    }

    const touchedMems = new Set()
    for (const day of days) {
      for (const dec of day.decisions) {
        stats.momentsScanned++
        const members = (dec.photoIds || []).map((id) => refByKey.get(id)).filter(Boolean)
        const sources = members.filter(isReferenceSource)
        if (!sources.length) continue
        stats.sourceMoments++
        const centroid = centroidIfAgreeing(sources)
        if (!centroid) {
          stats.disagreements++
          continue
        }
        const targets = members.filter(needsGps)
        for (const ref of targets) {
          if (attempted >= cap) {
            stats.hitLimit = true
            continue
          }
          attempted++
          stats.wouldPropagate++
          stats.wrote++
          if (applyWrites) {
            ref.lat = centroid.lat
            ref.lng = centroid.lng
            ref.prov = { ...ref.prov, gps: 'propagated' }
            const memId = memOfKey.get(ref.key)
            if (memId) touchedMems.add(memId)
          }
        }
      }
    }

    if (applyWrites) {
      for (const memId of touchedMems) {
        const entry = parsedMems.get(memId)
        if (!entry) continue
        const upd = await env.DB.prepare(
          'UPDATE memories SET photo_r2_keys_json = ? WHERE id = ? AND updated_at = ? AND deleted_at IS NULL'
        )
          .bind(JSON.stringify(entry.refs), memId, entry.updated_at)
          .run()
        if ((upd?.meta?.changes ?? 0) > 0) stats.memsWritten++
      }
    }
  }
  return stats
}
