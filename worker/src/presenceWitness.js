// presenceWitness.js — Build W5 (BUILD_PLAN_WITNESS_FLEET_2.md): matches a
// still-unlocated ref against ITS OWN AUTHOR's recorded presence-trail crumbs
// (migration 020's presence_trail — NOT YET APPLIED to prod D1 as of this
// build; see the migration's own header). "Your phone was at the parade at
// 2:03, so this 2:05 photo belongs there."
//
// GATED, on env.PHOTO_PRESENCE_MODE (presence.js's photoPresenceMode):
// mode==='off' → this function returns immediately WITHOUT EVER QUERYING
// presence_trail — the load-bearing inertness property against the
// not-yet-applied table (the scope boundary this build ships under). A
// missing table degrades to a no-op too (isNoTable, mirroring presence.js's
// own degrade posture) — belt + braces alongside the mode gate, since a
// mode flipped ahead of the migration being applied must still never 500 the
// sweep. mode !== 'off' → the read runs (shadow AND on both need it, to
// report would-match stats); the MEMORY-mutating write
// (prov.gps='inferred-presence') fires only when mode==='on', mirroring
// momentGpsPropagation.js's applyWrites shape exactly.
//
// MATCHING (decided in the plan, not executor discretion):
//   • nearest same-traveler crumb within a ±15-MIN HARD window;
//   • a bracketing pair (one crumb before, one after the photo) ≤90 min
//     apart that agree within 250m of EACH OTHER may WIDEN the window to
//     ±60 min — two crumbs close together in time and space say the phone
//     (and its owner) stayed put, so a slightly-more-distant photo still
//     counts. The widened match's position is the bracket's midpoint (the
//     two already agree within 250m — same centroid-of-agreeing-members
//     shape momentGpsPropagation.js uses);
//   • accuracy worse than 100m REFUSES (a bad GPS fix is not a witness) —
//     applied to every crumb this module ever uses as evidence, single or
//     bracketed;
//   • meta.make/model corroboration against the AirDrop-import wrinkle —
//     seqName.js's own framing: "author+meta.make+meta.model" is WRONG under
//     an AirDropped import, because the person who ADDED the photo to the app
//     isn't necessarily the person who CARRIED the phone that shot it. This
//     module builds each traveler's own device signature from their
//     REFERENCE-tier (exif/scan) refs elsewhere in the trip — real EXIF
//     reads, genuinely that traveler's phone — and a candidate whose
//     meta.make/model CONTRADICTS that signature is refused (probably not
//     this traveler's phone, so their crumbs are the wrong witness). Per the
//     plan's pre-authorized contingency: when there is no signature to check
//     against yet (no reference-tier refs with meta) OR the candidate itself
//     carries no meta, that is an ABSENCE of corroboration data, not a
//     contradiction — the match still stands on the time window alone,
//     counted separately (matchedLowConfidence) rather than fabricating an
//     agreement that was never checked.
// Writes ONLY prov.gps — never a confidence field (sanitizeProv's strict
// enum has no such key, in either sanitizer); confidence lives in this run's
// STATS only, never persisted onto a ref.
//
// Additive/gap-fill-only by construction: needsGps() only ever selects a ref
// with NO lat/lng at all, so this can never overwrite a reference-tier (or
// any other tier's) coordinate — the same safety shape as
// momentGpsPropagation.js. 'inferred-presence' is never added to this
// module's own REFERENCE_GPS_PROV (kept local, {'exif','scan'} only, exactly
// like every sibling engine module) — an inferred-presence ref can never
// itself become a propagation/witness SOURCE later (the cascade-hazard
// guard, same rule as 'propagated').

import { photoPresenceMode, isNoTable } from './presence.js'
import { isAdult } from './auth.js'

export { photoPresenceMode }

const SKIP_TRIP_IDS = new Set(['volleyball-2026'])
const HARD_WINDOW_MS = 15 * 60 * 1000
const WIDEN_WINDOW_MS = 60 * 60 * 1000
const BRACKET_MAX_GAP_MS = 90 * 60 * 1000
const BRACKET_AGREE_M = 250
const MAX_ACCURACY_M = 100
// + 'confirmed' (S1 Level 2): a confirmed real-stop coord is a human-affirmed
// reference-tier location, valid as a witness SOURCE like a real read.
const REFERENCE_GPS_PROV = new Set(['exif', 'scan', 'confirmed'])

export function presenceWitnessLimit(env) {
  const raw = env?.PHOTO_PRESENCE_WITNESS_LIMIT
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 60
}

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

// A REFERENCE-tier ref (real EXIF/scan coords) — the only kind allowed to
// seed a traveler's device signature below.
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

// Each traveler's own device signature: the "make|model" pairs seen on their
// REFERENCE-tier refs elsewhere in the trip. Map<traveler, Set<string>>; a
// traveler absent from the map has no signature yet (never refuse for that —
// see header).
function buildDeviceSignature(refs, travelerOfKey) {
  const sig = new Map()
  for (const ref of refs) {
    if (!isReferenceSource(ref)) continue
    const traveler = travelerOfKey.get(ref.key)
    if (!traveler) continue
    const make = typeof ref.meta?.make === 'string' ? ref.meta.make : ''
    const model = typeof ref.meta?.model === 'string' ? ref.meta.model : ''
    if (!make && !model) continue
    if (!sig.has(traveler)) sig.set(traveler, new Set())
    sig.get(traveler).add(`${make}|${model}`)
  }
  return sig
}

// { known: false } = no corroboration data either way (no signature yet, or
// this ref carries no meta) — proceed, but the caller marks lowConfidence.
// { known: true, agrees } = there WAS a signature to check against; `agrees`
// says whether this ref's meta matches it (agrees:false → refuse).
function deviceCorroborates(signatureSet, ref) {
  const make = typeof ref.meta?.make === 'string' ? ref.meta.make : ''
  const model = typeof ref.meta?.model === 'string' ? ref.meta.model : ''
  if (!make && !model) return { known: false, agrees: false }
  if (!signatureSet || !signatureSet.size) return { known: false, agrees: false }
  return { known: true, agrees: signatureSet.has(`${make}|${model}`) }
}

// The pure matcher — no D1, unit-testable directly. `crumbs` is this
// traveler's presence_trail rows (any order); `capturedAtMs` is the target
// ref's real UTC capture instant. Returns a discriminated outcome:
//   { outcome: 'no-crumb' }  — this traveler has no crumb at all
//   { outcome: 'window' }    — a crumb exists but outside both windows
//   { outcome: 'accuracy' }  — the only usable crumb(s) fail the 100m rule
//   { outcome: 'match', lat, lng, widened }
export function findWitnessPosition(capturedAtMs, crumbs) {
  if (!Number.isFinite(capturedAtMs) || !Array.isArray(crumbs) || !crumbs.length) {
    return { outcome: 'no-crumb' }
  }
  let before = null
  let after = null
  for (const c of crumbs) {
    if (!c || !Number.isFinite(c.at) || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue
    if (c.at <= capturedAtMs && (!before || c.at > before.at)) before = c
    if (c.at >= capturedAtMs && (!after || c.at < after.at)) after = c
  }
  const candidates = [before, after].filter(Boolean)
  if (!candidates.length) return { outcome: 'no-crumb' }
  const nearest = candidates.sort((a, b) => Math.abs(a.at - capturedAtMs) - Math.abs(b.at - capturedAtMs))[0]
  const nearestGap = Math.abs(nearest.at - capturedAtMs)

  if (nearestGap <= HARD_WINDOW_MS) {
    if (!Number.isFinite(nearest.accuracy) || nearest.accuracy > MAX_ACCURACY_M) return { outcome: 'accuracy' }
    return { outcome: 'match', lat: nearest.lat, lng: nearest.lng, widened: false }
  }

  // The widen rule: needs BOTH a before and after crumb (a true bracketing
  // pair — a single far-off crumb can never widen its own window), close
  // together in time and agreeing in space.
  if (before && after && before !== after && nearestGap <= WIDEN_WINDOW_MS) {
    const gapBetween = Math.abs(after.at - before.at)
    if (gapBetween <= BRACKET_MAX_GAP_MS) {
      const dist = haversineMeters(before.lat, before.lng, after.lat, after.lng)
      if (dist <= BRACKET_AGREE_M) {
        if (![before, after].every((c) => Number.isFinite(c.accuracy) && c.accuracy <= MAX_ACCURACY_M)) {
          return { outcome: 'accuracy' }
        }
        return { outcome: 'match', lat: (before.lat + after.lat) / 2, lng: (before.lng + after.lng) / 2, widened: true }
      }
    }
  }
  return { outcome: 'window' }
}

// Run the witness for every active trip. `mode` is the CALLER-resolved
// photoPresenceMode(env) — passed in, never re-derived here, matching the W0
// per-lever pattern's shape (though this knob itself has no fallback-inherit;
// see photoPresenceMode's own header).
export async function witnessPresence(env, { mode, limit } = {}) {
  if (mode !== 'shadow' && mode !== 'on') return { skipped: 'off' }
  const cap = Number.isFinite(limit) ? limit : presenceWitnessLimit(env)
  const applyWrites = mode === 'on'
  const stats = {
    mode,
    tripsConsidered: 0,
    refsScanned: 0,
    refusedNoCrumb: 0,
    refusedWindow: 0,
    refusedAccuracy: 0,
    refusedDeviceMismatch: 0,
    matched: 0,
    matchedWidened: 0,
    matchedLowConfidence: 0,
    memsWritten: 0,
    hitLimit: false,
  }
  let attempted = 0
  try {
    const { results: tripRows } = await env.DB.prepare('SELECT id FROM trips WHERE deleted_at IS NULL').all()
    for (const tr of tripRows || []) {
      if (stats.hitLimit) break
      if (SKIP_TRIP_IDS.has(tr.id)) continue
      const { results: memRows } = await env.DB.prepare(
        'SELECT id, author_traveler, photo_r2_keys_json, updated_at FROM memories WHERE trip_id = ? AND deleted_at IS NULL'
      )
        .bind(tr.id)
        .all()
      if (!memRows || !memRows.length) continue

      const parsedMems = new Map() // memId -> { refs, updated_at }
      const travelerOfKey = new Map() // ref.key -> author_traveler
      const allRefs = []
      const targets = [] // { ref, memId, traveler }
      for (const r of memRows) {
        let refs
        try {
          refs = JSON.parse(r.photo_r2_keys_json || '[]')
        } catch {
          continue
        }
        if (!Array.isArray(refs)) continue
        parsedMems.set(r.id, { refs, updated_at: r.updated_at })
        const traveler = r.author_traveler
        for (const ref of refs) {
          if (!ref || !ref.key) continue
          allRefs.push(ref)
          if (traveler) travelerOfKey.set(ref.key, traveler)
          if (traveler && isAdult(traveler) && needsGps(ref)) {
            targets.push({ ref, memId: r.id, traveler })
          }
        }
      }
      if (!targets.length) continue
      stats.tripsConsidered++

      const travelers = new Set(targets.map((t) => t.traveler))
      const { results: crumbRows } = await env.DB.prepare(
        'SELECT traveler, lat, lng, accuracy, at FROM presence_trail WHERE trip_id = ? ORDER BY traveler, at'
      )
        .bind(tr.id)
        .all()
      const crumbsByTraveler = new Map()
      for (const c of crumbRows || []) {
        if (!travelers.has(c.traveler)) continue
        if (!crumbsByTraveler.has(c.traveler)) crumbsByTraveler.set(c.traveler, [])
        crumbsByTraveler.get(c.traveler).push(c)
      }

      const deviceSignature = buildDeviceSignature(allRefs, travelerOfKey)
      const touchedMems = new Set()
      for (const { ref, memId, traveler } of targets) {
        if (stats.hitLimit) break
        stats.refsScanned++
        const capturedAtMs = Date.parse(ref.capturedAt)
        const found = findWitnessPosition(capturedAtMs, crumbsByTraveler.get(traveler))
        if (found.outcome === 'no-crumb') {
          stats.refusedNoCrumb++
          continue
        }
        if (found.outcome === 'window') {
          stats.refusedWindow++
          continue
        }
        if (found.outcome === 'accuracy') {
          stats.refusedAccuracy++
          continue
        }
        const corrob = deviceCorroborates(deviceSignature.get(traveler), ref)
        if (corrob.known && !corrob.agrees) {
          stats.refusedDeviceMismatch++
          continue
        }
        if (attempted >= cap) {
          stats.hitLimit = true
          continue
        }
        attempted++
        stats.matched++
        if (found.widened) stats.matchedWidened++
        if (!corrob.known) stats.matchedLowConfidence++
        if (applyWrites) {
          ref.lat = found.lat
          ref.lng = found.lng
          ref.prov = { ...ref.prov, gps: 'inferred-presence' }
          touchedMems.add(memId)
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
  } catch (err) {
    if (isNoTable(err)) return { ...stats, skipped: 'no-table' }
    throw err
  }
  return stats
}
