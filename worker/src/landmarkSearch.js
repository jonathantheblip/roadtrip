// landmarkSearch.js — Build 4c (BUILD_PLAN_SIGNAL_FLEET.md): resolve a
// signage-bearing moment to a real, pinnable landmark via Google Places,
// using the signage TEXT (a real searchable name) rather than the vision
// caption — the grounding proved warmth-optimized captions ("Beach Day Fun")
// are unsearchable (0–1 hits archive-wide), while storefront signage read
// off the photo itself is a genuine venue name. Runs at RECORD time
// (photoHealRunner.js's recordHealDecisions), same posture as Build 4b's
// discovered-place naming: ledger-only, never a ref write, never auto — a
// confirm-tier `signals_json.pin` for a human to confirm later.
//
// Mechanism: placesTextSearch with a stayPlaceCoords BIAS (soft — a famous
// name can match another state) PLUS a caller-side HARD distanceMeters gate
// (tighter than the bias radius, so a same-named venue two states away is
// rejected even though Places' soft bias might still surface it) and
// requireOperational:false (an archive photo's venue may have since
// closed — see placesGeocode.js). Every lookup — hit or miss — is cached on
// trip.data_json's `landmarkLookups` map so a repeat query never re-bills; a
// MISS retries after a cooldown (resolveTripHero's 7-day precedent, in case
// Places later indexes the venue), a HIT never expires (stable once found).

import { placesTextSearch } from './placesGeocode.js'
import { stayPlaceCoords } from './stayPlaceCoords.js'

// Soft bias radius — the scale of "somewhere in this town/region", not a
// pinpoint (Places ranks by distance within this but can still return
// farther if nothing closer matches the text).
const SEARCH_RADIUS_M = 30000
// Caller-side HARD cutoff — deliberately tighter than the bias radius above,
// since the bias alone cannot be trusted to exclude a same-named venue in
// another state (the plan's explicit "candy store in two towns" concern).
const HARD_DISTANCE_GATE_M = 5000
const MISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

// mirror-safe copy (see placesGeocode.js/discoveredPlaceNamer.js — every
// pure/adapter module in this arc keeps its own rather than importing
// geo-math across a module boundary that isn't meant to carry it).
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

// Resolve ONE signage query to a pin, or null (no hit / hit rejected by the
// hard distance gate / a search error). `search` injectable for tests.
export async function resolveLandmarkPin(env, query, coords, { search = placesTextSearch } = {}) {
  if (!query || !coords) return null
  let out
  try {
    out = await search(env, {
      query,
      lat: coords.lat,
      lng: coords.lng,
      radius: SEARCH_RADIUS_M,
      limit: 1,
      requireOperational: false,
    })
  } catch {
    return null
  }
  const hit = out?.results?.[0]
  if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) return null
  const d = haversineMeters(coords.lat, coords.lng, hit.lat, hit.lng)
  if (d > HARD_DISTANCE_GATE_M) return null
  return { lat: hit.lat, lng: hit.lng, name: hit.name }
}

// The dominant signage text across a decision's photos — mode-across-photos,
// same shape as discoveredPlaceNamer.js's dominantPlaceType, applied to
// signage instead. Ties break to first-seen (deterministic, insertion order).
export function dominantSignage(photoIds, signageByRef) {
  const counts = new Map()
  for (const id of photoIds || []) {
    const sig = signageByRef?.get ? signageByRef.get(id) : undefined
    if (!sig) continue
    counts.set(sig, (counts.get(sig) || 0) + 1)
  }
  let best = null
  let bestN = 0
  for (const [sig, n] of counts) {
    if (n > bestN) {
      best = sig
      bestN = n
    }
  }
  return best
}

// Build a photoId(ref key) → vision.signage index from the trip's raw memory
// rows — same shape as discoveredPlaceNamer.js's buildPlaceTypeIndex.
export function buildSignageIndex(rows) {
  const map = new Map()
  for (const r of rows || []) {
    let refs
    try {
      refs = JSON.parse(r.photo_r2_keys_json || '[]')
    } catch {
      continue
    }
    if (!Array.isArray(refs)) continue
    for (const ref of refs) {
      if (!ref || !ref.key) continue
      const sig = typeof ref.vision?.signage === 'string' ? ref.vision.signage : null
      if (sig) map.set(ref.key, sig)
    }
  }
  return map
}

// Resolve landmark pins for every decision in `days` carrying dominant
// signage, mutating each matched decision's signals.pin in place. Best-
// effort, bounded (`limit` fresh Places calls per invocation — cache hits
// are free and unbounded), negative+positive cached on trip.landmarkLookups.
// Returns { pinned, misses, cacheHits, landmarkLookups } — landmarkLookups
// is the merged cache to persist (OCC-guarded, no-bump), or null when
// nothing changed. A trip with no resolvable stay coords is skipped
// entirely (an honest abstention — the bias/gate both need an anchor).
export async function resolveLandmarkPins(env, trip, days, signageByRef, { limit = 10, search = placesTextSearch, now = Date.now() } = {}) {
  const coords = stayPlaceCoords(trip)
  const stats = { pinned: 0, misses: 0, cacheHits: 0, landmarkLookups: null }
  if (!coords) return stats
  const cache = { ...(trip?.landmarkLookups && typeof trip.landmarkLookups === 'object' ? trip.landmarkLookups : {}) }
  let cacheDirty = false
  let attempted = 0
  for (const day of days || []) {
    for (const dec of day.decisions || []) {
      const query = dominantSignage(dec.photoIds, signageByRef)
      if (!query) continue
      const cached = cache[query]
      if (cached) {
        if (cached.pin) {
          stats.cacheHits++
          stats.pinned++
          dec.signals = { ...dec.signals, pin: { ...cached.pin, source: 'landmark', query } }
          continue
        }
        // A cached MISS — retry only after the cooldown (resolveTripHero's
        // 7-day precedent); a cached HIT above never expires.
        if (Number.isFinite(cached.missAt) && now - cached.missAt < MISS_COOLDOWN_MS) {
          stats.cacheHits++
          continue
        }
      }
      if (attempted >= limit) continue
      attempted++
      const pin = await resolveLandmarkPin(env, query, coords, { search })
      cacheDirty = true
      if (pin) {
        stats.pinned++
        const cachedPin = { lat: pin.lat, lng: pin.lng, name: pin.name }
        cache[query] = { pin: cachedPin }
        // Same shape as the cache-hit branch above (adversarial review,
        // 2026-07-11: a fresh hit was dropping `name` while a cache-replayed
        // hit carried it — the record's shape must not depend on cache state).
        dec.signals = { ...dec.signals, pin: { ...cachedPin, source: 'landmark', query } }
      } else {
        stats.misses++
        cache[query] = { missAt: now }
      }
    }
  }
  stats.landmarkLookups = cacheDirty ? cache : null
  return stats
}
