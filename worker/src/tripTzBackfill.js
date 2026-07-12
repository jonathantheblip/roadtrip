// tripTzBackfill.js — derive + durably write a trip's STAY timezone (Build 2,
// FAMILY_TRIPS_VISION §14). `trip.tz` is read all over (tripParts.js's
// legField default) but, until this build, only ever WRITTEN by an AI-created
// international leg — a hangout/stay trip's own tz was never resolved at all.
// This is the FIRST writer of a bare `trip.tz` at the trip level.
//
// Geocodes stayPlaceCoords(trip) via Open-Meteo's `timezone=auto` (the SAME
// keyless dependency + fetch pattern conditions.js already uses for weather —
// no new dependency, no API key). A trip with no resolvable stay coords is
// skipped — an honest abstention, never a guessed default zone.
//
// THE KNOB, explicitly: unlike the scene/vision backfills, trip.tz is NOT
// inert metadata — app/src/lib/photoEntries.js's buildDayTz/dayForCapture
// reads `trip.tz` directly (falling back to the DEVICE's own local date when
// absent) to decide which DAY a photo's album section falls under and what
// its "JUL 2 · 2–5" time-band label reads. That is a real, family-visible
// consequence TODAY, independent of the offset-inference engine downstream —
// so this backfill gets the exact same off/shadow/on write discipline as v1's
// stop-moves and the offset engine (offsetInference.js):
//   • mode !== 'on' (shadow, or — defensively — anything missing/unrecognized)
//     → COMPUTE (geocode, so stats report real coverage) but WRITE NOTHING to
//     any trip row. A trip lacking `tz` stays lacking it in shadow — the
//     offset-inference engine (which needs trip.tz to run at all) correctly
//     sees `tripsNoTz` for that trip until mode flips to 'on'.
//   • mode === 'on' → geocode AND persist for real, exactly as before this
//     fix (when the write was, wrongly, unconditional).
//
// SAFE by construction, same shape as sceneBackfill.js:
//  • idempotent — a trip that already carries `tz` is skipped;
//  • OCC-guarded — the UPDATE matches the stored updated_at;
//  • does NOT bump updated_at — this is a worker enrichment (feeds the
//    offset-inference engine below), not a trip-content family edit — but
//    IS itself consumed by the family-visible album grouping above, hence
//    the mode-gating.
//  • bounded — at most `limit` geocodes per call (an external fetch each).
// `fetchTz` is injectable so the runner's idempotency/OCC/bounding logic
// unit-tests without a real network call.

import { stayPlaceCoords } from './stayPlaceCoords.js'

// Confirmed fixture/test data (CLAUDE.md's explicit TRAP warning) — never
// derive or write anything for it.
const SKIP_TRIP_IDS = new Set(['volleyball-2026'])

const MODES = new Set(['off', 'shadow', 'on'])

// THE PER-LEVER KNOB (BUILD_PLAN_WITNESS_FLEET_2.md W0) — copies 4a's proven
// photoStopGeocodeMode shape verbatim (stopGeocodeBackfill.js). Read this
// module's OWN var, defaulting to the caller-supplied fallback (the already-
// resolved global mode) when unset/unrecognized, so an unconfigured install
// behaves exactly like every other backfill; Jonathan promotes R1
// independently by setting PHOTO_TZ_MODE specifically. Never imports
// photoHealMode itself (photoHealRunner.js imports THIS module; a back-
// import would cycle) — the caller (healSweep) passes its own already-
// computed mode down instead.
export function photoTzMode(env, fallback) {
  const raw = typeof env?.PHOTO_TZ_MODE === 'string' ? env.PHOTO_TZ_MODE.trim() : ''
  if (MODES.has(raw)) return raw
  return MODES.has(fallback) ? fallback : 'off'
}

export function timezoneUrl(lat, lng) {
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'temperature_2m',
    timezone: 'auto',
    forecast_days: '1',
  })
  return `https://api.open-meteo.com/v1/forecast?${p.toString()}`
}

export function tripTzBackfillLimit(env) {
  const raw = env?.PHOTO_TZ_BACKFILL_LIMIT
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 20
}

async function defaultFetchTz(lat, lng) {
  try {
    const res = await fetch(timezoneUrl(lat, lng))
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.timezone === 'string' && data.timezone ? data.timezone : null
  } catch {
    return null
  }
}

export async function backfillTripTimezones(env, { mode, limit, fetchTz = defaultFetchTz } = {}) {
  // ONLY 'on' ever persists a geocoded tz. 'shadow' and anything missing/
  // unrecognized are treated identically — fail safe (see header).
  const applyWrites = mode === 'on'
  const cap = Number.isFinite(limit) ? limit : tripTzBackfillLimit(env)
  const { results: rows } = await env.DB.prepare(
    'SELECT id, data_json, updated_at FROM trips WHERE deleted_at IS NULL'
  ).all()
  const stats = {
    mode: mode ?? null,
    trips: rows?.length || 0,
    skippedFixture: 0,
    alreadyHad: 0,
    noCoords: 0,
    geocoded: 0,
    failed: 0,
    wrote: 0,
    hitLimit: false,
  }
  let attempted = 0
  for (const r of rows || []) {
    if (SKIP_TRIP_IDS.has(r.id)) {
      stats.skippedFixture++
      continue
    }
    let trip
    try {
      trip = JSON.parse(r.data_json)
    } catch {
      continue
    }
    if (trip?.tz) {
      stats.alreadyHad++
      continue
    }
    const coords = stayPlaceCoords(trip)
    if (!coords) {
      stats.noCoords++
      continue
    }
    if (attempted >= cap) {
      stats.hitLimit = true
      continue
    }
    attempted++
    const tz = await fetchTz(coords.lat, coords.lng)
    if (!tz) {
      stats.failed++
      continue
    }
    stats.geocoded++
    if (applyWrites) {
      const updated = { ...trip, tz, tzSource: 'geocoded' }
      const upd = await env.DB.prepare(
        'UPDATE trips SET data_json = ? WHERE id = ? AND updated_at = ? AND deleted_at IS NULL'
      )
        .bind(JSON.stringify(updated), r.id, r.updated_at)
        .run()
      if ((upd?.meta?.changes ?? 0) > 0) stats.wrote++
    }
  }
  return stats
}
