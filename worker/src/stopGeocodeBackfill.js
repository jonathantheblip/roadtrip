// stopGeocodeBackfill.js — Build 4a (BUILD_PLAN_SIGNAL_FLEET.md): addresses →
// coordinates for agenda stops that carry a street address but no lat/lng.
// SAFE by construction, same shape as tripTzBackfill.js/offsetInference.js:
//  • idempotent — a stop that already carries lat/lng is NEVER touched
//    (manual-presumed, reference-tier — NO duplicate-coords heuristics of any
//    kind; identical coords across stops can be geographic reality, e.g. the
//    lodging/beach/parade stack on Commercial St — see the
//    `provincetown-stacked-places` memory), and a stop whose `geoFor` already
//    matches its current address is skipped too (covers a genuine no-match
//    miss: a failed geocode still stamps `geoFor` so a bad address isn't
//    re-billed every sweep, without ever writing coords for it);
//  • OCC-guarded — the trip UPDATE matches the stored updated_at;
//  • does NOT bump updated_at — worker-side consumers (4b's resolver, the
//    matcher) see it immediately; clients converge on their next pull (an
//    up-to-24h flap window, acceptable because the write is idempotent and
//    mechanically re-derivable — tripTzBackfill precedent);
//  • bounded — at most `limit` geocode attempts per call.
//
// THE KNOB: its OWN env.PHOTO_STOP_GEOCODE_MODE, independent of the global
// PHOTO_HEAL_MODE (the per-lever promotion rule, BUILD 4 — flipping this knob
// must never also arm v1's photo-moving or Build 2's offset-inference writes).
// Defaults to INHERITING whatever mode the caller resolved for the global
// knob, so an unconfigured install behaves exactly like every other backfill;
// Jonathan promotes 4a independently by setting this var specifically.
//   • mode !== 'on' → compute (so stats report real coverage) but write
//     NOTHING to any trip row — stop coordinates feed FOUR-plus ungated
//     family-visible surfaces (photoMatch GPS filing, evidence pins,
//     LeaveWhen destinations, 4b's own-places resolver), so this gets the
//     same shadow discipline as Build 2's offset/tz backfills.
//   • mode === 'on' → geocode AND persist for real.
//
// `geocode` is injectable so the runner unit-tests without hitting the API.

import { geocodePlace } from './placesGeocode.js'

// Confirmed fixture/test data (CLAUDE.md's explicit TRAP warning) — never
// derive or write anything for it.
const SKIP_TRIP_IDS = new Set(['volleyball-2026'])

// A transit/drive leg ("Drive Home to Belmont") doesn't merit a pin — the
// live grounding named this explicitly. Re-verified 2026-07-11 against LIVE
// production data (not a fixture): the real stop's kind is 'transit', not
// 'drive' — 'drive' alone (a stale assumption from an app/src/data/trips.js
// fixture grep) would have silently let it through. Both kept: 'transit' for
// what live data actually uses, 'drive' for fixture-shape forward safety.
// Any other stop kind (lodging, activity, sights, food, logistics, unset) is
// in scope — a 'logistics' stop (e.g. an Airbnb checkout) can carry the only
// address this app has for that stay, so it is deliberately NOT excluded.
const EXCLUDED_KINDS = new Set(['drive', 'transit'])

const MODES = new Set(['off', 'shadow', 'on'])

// Read the knob, defaulting to the caller-supplied fallback (the already-
// resolved global mode) when unset/unrecognized — the per-lever promotion
// rule. Never imports photoHealMode itself (photoHealRunner.js imports THIS
// module; a back-import would cycle) — the caller (healSweep) passes its own
// already-computed mode down instead.
export function photoStopGeocodeMode(env, fallback) {
  const raw = typeof env?.PHOTO_STOP_GEOCODE_MODE === 'string' ? env.PHOTO_STOP_GEOCODE_MODE.trim() : ''
  if (MODES.has(raw)) return raw
  return MODES.has(fallback) ? fallback : 'off'
}

export function stopGeocodeBackfillLimit(env) {
  const raw = env?.PHOTO_STOP_GEOCODE_LIMIT
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 20
}

// A stop this engine may ever touch: a real address, no coords yet, not a
// transit leg, and not already attempted for this exact address (geoFor is
// the attempted/resolved marker — see header).
function needsGeocode(stop) {
  if (!stop || typeof stop !== 'object') return false
  const address = typeof stop.address === 'string' ? stop.address.trim() : ''
  if (!address) return false
  if (EXCLUDED_KINDS.has(stop.kind)) return false
  if (Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) return false
  if (typeof stop.geoFor === 'string' && stop.geoFor === address) return false
  return true
}

export async function backfillStopGeocodes(env, { mode, limit, geocode = geocodePlace } = {}) {
  // ONLY 'on' ever writes for real — see header.
  const applyWrites = mode === 'on'
  const cap = Number.isFinite(limit) ? limit : stopGeocodeBackfillLimit(env)
  const { results: tripRows } = await env.DB.prepare(
    'SELECT id, data_json, updated_at FROM trips WHERE deleted_at IS NULL'
  ).all()
  const stats = {
    mode: mode ?? null,
    tripsConsidered: 0,
    stopsScanned: 0,
    geocoded: 0,
    noMatch: 0,
    wrote: 0,
    tripsWritten: 0,
    hitLimit: false,
    // Small archive-wide volume (single digits) — full detail is cheap and is
    // exactly what the shadow report needs to show Jonathan before promotion.
    wouldWrite: [],
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
    if (!Array.isArray(trip?.days) || !trip.days.length) continue
    stats.tripsConsidered++
    let changed = false
    for (const day of trip.days) {
      if (!Array.isArray(day?.stops)) continue
      for (const stop of day.stops) {
        if (!needsGeocode(stop)) continue
        stats.stopsScanned++
        if (attempted >= cap) {
          stats.hitLimit = true
          continue
        }
        attempted++
        let hit = null
        try {
          hit = await geocode(env, stop.address.trim())
        } catch (e) {
          console.error('[stop-geocode] geocode failed', tr.id, stop.id, e?.stack || e)
        }
        if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
          stats.geocoded++
          stats.wrote++
          stats.wouldWrite.push({
            tripId: tr.id,
            stopId: stop.id || null,
            name: stop.name || stop.title || null,
            address: stop.address,
            lat: hit.lat,
            lng: hit.lng,
          })
          if (applyWrites) {
            stop.lat = hit.lat
            stop.lng = hit.lng
            stop.geoFor = stop.address.trim()
            changed = true
          }
        } else {
          // No match — stamp geoFor as the attempted marker so a bad/
          // unmatchable address isn't re-billed every sweep. NEVER writes
          // coords on a miss.
          stats.noMatch++
          if (applyWrites) {
            stop.geoFor = stop.address.trim()
            changed = true
          }
        }
      }
    }
    if (changed && applyWrites) {
      const upd = await env.DB.prepare(
        'UPDATE trips SET data_json = ? WHERE id = ? AND updated_at = ? AND deleted_at IS NULL'
      )
        .bind(JSON.stringify(trip), tr.id, tr.updated_at)
        .run()
      if ((upd?.meta?.changes ?? 0) > 0) stats.tripsWritten++
    }
  }
  return stats
}
