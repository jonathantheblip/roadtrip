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
import { dominantPlaceType } from './discoveredPlaceNamer.js'

// Soft bias radius — the scale of "somewhere in this town/region", not a
// pinpoint (Places ranks by distance within this but can still return
// farther if nothing closer matches the text).
const SEARCH_RADIUS_M = 30000
// Caller-side HARD cutoff — deliberately tighter than the bias radius above,
// since the bias alone cannot be trusted to exclude a same-named venue in
// another state (the plan's explicit "candy store in two towns" concern).
const HARD_DISTANCE_GATE_M = 5000
const MISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

// ── W0b — the landmark type-gate (BUILD_PLAN_WITNESS_FLEET_2.md) ──────────
// A free corroboration the Places response already carries in the same paid
// call: venue TYPES (placesGeocode.js's field mask now requests them). The
// moment's own dominant vision placeType — already computed for 4b's
// discovered-place naming, threaded in here via `placeTypeByRef` (see
// resolveLandmarkPins) — must not CONTRADICT the returned venue's type: a
// `restaurant`-typed moment must not pin a liquor store from a misread
// "Spirits" sign. This is the constitution's non-conflict clause applied to
// pins: the pin already needed signage + proximity; a type contradiction
// now vetoes. Per rule 4, the type-gate does NOT make the pin count as an
// extra evidence dimension — placeType is the pin's vetting input, and
// venue `types` never rides the ledger-facing signals.pin object, only the
// internal cache entry.
// Deliberately SMALL and explicit — never a positive identity check (a type
// MATCH never adds confidence, only a CONTRADICTION removes it). Mapping,
// per the plan: restaurant↔restaurant/cafe/bar/bakery; shop↔store types;
// beach/park/museum direct (venue types must include the same token);
// event/street/residential → no Places category maps cleanly, so always
// abstain. Absent venue types, or an absent/unmapped placeType (including
// the vision enum's own indoor-other/outdoor-other catch-alls) → abstain,
// never block.
const RESTAURANT_VENUE_TYPES = new Set(['restaurant', 'cafe', 'bar', 'bakery'])
function isShopVenueType(t) {
  return (
    t === 'store' ||
    t === 'shopping_mall' ||
    t === 'market' ||
    t === 'supermarket' ||
    (typeof t === 'string' && t.endsWith('_store'))
  )
}
const DIRECT_PLACE_TYPES = new Set(['beach', 'park', 'museum'])
const NO_CONSTRAINT_PLACE_TYPES = new Set(['event', 'street', 'residential'])

// Pure, mutation-testable: does `venueTypes` NOT contradict `placeType`?
// Returns true for "no veto" (agreement OR abstention) — false is the
// gate's only assertive answer, and it means REJECT this pin for this
// moment. Never throws on malformed input.
export function typeGateAgrees(placeType, venueTypes) {
  if (!placeType || NO_CONSTRAINT_PLACE_TYPES.has(placeType)) return true
  const types = Array.isArray(venueTypes) ? venueTypes.filter((t) => typeof t === 'string' && t) : []
  if (!types.length) return true // absent venue types → abstain, don't block
  if (placeType === 'restaurant') return types.some((t) => RESTAURANT_VENUE_TYPES.has(t))
  if (placeType === 'shop') return types.some(isShopVenueType)
  if (DIRECT_PLACE_TYPES.has(placeType)) return types.includes(placeType)
  return true // an unmapped placeType (indoor-other/outdoor-other/future) → abstain
}

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
  // W0b — carry the venue's types along so the caller can gate + cache them;
  // this function itself stays a pure proximity resolver, no gating here.
  return { lat: hit.lat, lng: hit.lng, name: hit.name, types: Array.isArray(hit.types) ? hit.types : [] }
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
// `placeTypeByRef` is the SAME photoId→vision.placeType index
// recordHealDecisions already builds for 4b's discovered-place naming
// (photoHealRunner.js) — passed in here, never recomputed, so the W0b
// type-gate (above) has the moment's dominant placeType to vet against.
// Returns { pinned, misses, cacheHits, typeVetoed, legacyTypelessCacheEntries,
// landmarkLookups } — landmarkLookups is the merged cache to persist
// (OCC-guarded, no-bump), or null when nothing changed. A trip with no
// resolvable stay coords is skipped entirely (an honest abstention — the
// bias/gate both need an anchor).
export async function resolveLandmarkPins(
  env,
  trip,
  days,
  signageByRef,
  placeTypeByRef,
  { limit = 10, search = placesTextSearch, now = Date.now() } = {}
) {
  const coords = stayPlaceCoords(trip)
  const stats = { pinned: 0, misses: 0, cacheHits: 0, typeVetoed: 0, legacyTypelessCacheEntries: 0, landmarkLookups: null }
  if (!coords) return stats
  const cache = { ...(trip?.landmarkLookups && typeof trip.landmarkLookups === 'object' ? trip.landmarkLookups : {}) }
  let cacheDirty = false
  let attempted = 0
  for (const day of days || []) {
    for (const dec of day.decisions || []) {
      const query = dominantSignage(dec.photoIds, signageByRef)
      if (!query) continue
      const dominantType = dominantPlaceType(dec.photoIds, placeTypeByRef)
      const cached = cache[query]

      // NEW-SHAPE cache HIT (carries `types`, W0b+) — gate using the stored
      // types, no network cost. Cache hits gate PER-MOMENT (review-confirmed
      // correction): the same signage text could in principle attach to
      // decisions with different dominant placeTypes.
      if (cached?.pin && Array.isArray(cached.pin.types)) {
        stats.cacheHits++
        if (typeGateAgrees(dominantType, cached.pin.types)) {
          stats.pinned++
          dec.signals = { ...dec.signals, pin: { lat: cached.pin.lat, lng: cached.pin.lng, name: cached.pin.name, source: 'landmark', query } }
        } else {
          stats.typeVetoed++
        }
        continue
      }

      // OLD-SHAPE cache HIT (pre-W0b — no stored types, so the gate cannot
      // be evaluated from the cache alone; this is the exact
      // "cached hits bypass the gate forever" gap the review caught) — a
      // cached HIT itself never expires, but its TYPE-lessness forces a
      // bounded re-resolve so the cache upgrades to the new shape. If this
      // call's budget is already spent, pass it through UNGATED (counted
      // here, never silently dropped) rather than discarding a previously-
      // confirmed pin.
      let legacyFallbackPin = null
      if (cached?.pin) {
        stats.legacyTypelessCacheEntries++
        if (attempted >= limit) {
          stats.cacheHits++
          stats.pinned++
          dec.signals = { ...dec.signals, pin: { lat: cached.pin.lat, lng: cached.pin.lng, name: cached.pin.name, source: 'landmark', query } }
          continue
        }
        // else: fall through to the fresh-resolution block below, which
        // re-attempts this exact query and — on a hit — REPLACES the cache
        // entry with the new, typed shape. Remembered so a FAILED re-resolve
        // (adversarial review, 2026-07-12: network error/quota/gate miss on
        // a coordinate that drifted) falls back to this pin instead of being
        // written over as a fresh miss — a cached HIT never expires, and a
        // failed re-resolve attempt must not silently defeat that invariant.
        legacyFallbackPin = cached.pin
      } else if (cached && Number.isFinite(cached.missAt) && now - cached.missAt < MISS_COOLDOWN_MS) {
        // A cached MISS — retry only after the cooldown (resolveTripHero's
        // 7-day precedent).
        stats.cacheHits++
        continue
      } else if (attempted >= limit) {
        continue
      }

      attempted++
      const pin = await resolveLandmarkPin(env, query, coords, { search })
      if (pin) {
        // Fresh hits STORE the returned types in the cache entry (review-
        // confirmed correction) — cache hits gate per-moment thereafter.
        const cachedPin = { lat: pin.lat, lng: pin.lng, name: pin.name, types: pin.types || [] }
        cache[query] = { pin: cachedPin }
        cacheDirty = true
        if (typeGateAgrees(dominantType, cachedPin.types)) {
          stats.pinned++
          // Same shape as the cache-hit branch above (adversarial review,
          // 2026-07-11: a fresh hit was dropping `name` while a cache-
          // replayed hit carried it — the record's shape must not depend
          // on cache state). `types` stays cache-internal — never rides the
          // ledger-facing pin object (rule 4: it's the vetting input, not a
          // dimension of its own).
          dec.signals = { ...dec.signals, pin: { lat: cachedPin.lat, lng: cachedPin.lng, name: cachedPin.name, source: 'landmark', query } }
        } else {
          stats.typeVetoed++
        }
      } else if (legacyFallbackPin) {
        // The legacy entry's re-resolve attempt failed — the OLD cache
        // entry is still the best evidence we have, so leave `cache[query]`
        // untouched (do NOT overwrite it with a miss marker) and pass the
        // previously-confirmed pin through ungated, same as the
        // budget-exhausted branch above.
        stats.cacheHits++
        stats.pinned++
        dec.signals = { ...dec.signals, pin: { lat: legacyFallbackPin.lat, lng: legacyFallbackPin.lng, name: legacyFallbackPin.name, source: 'landmark', query } }
      } else {
        stats.misses++
        cache[query] = { missAt: now }
        cacheDirty = true
      }
    }
  }
  stats.landmarkLookups = cacheDirty ? cache : null
  return stats
}
