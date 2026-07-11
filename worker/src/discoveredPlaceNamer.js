// discoveredPlaceNamer.js — Build 4b (BUILD_PLAN_SIGNAL_FLEET.md): names the
// __discovered__ clusters sessionHeal.js locates but can't name — persisted
// today as a literal "a place near 42.0621, -70.1633" string. Runs at RECORD
// time (photoHealRunner.js's recordHealDecisions), AFTER buildTripDecisions,
// so the pure clustering engine (sessions.js/sessionHeal.js — parity-tested,
// byte-identical client/worker mirrors) stays untouched: this module only
// ever REPLACES a decision's already-computed place_name for the ledger.
// Ledger-only, REPLACED every run (memory_heal_decisions is a full
// DELETE+INSERT per trip, photoHealRunner.js) — family-invisible, so this
// needs no PHOTO_HEAL_MODE gate; it runs whenever recordHealDecisions does.
//
// Resolver, in strict order (the fleet principle — use signals already held
// before buying any):
//  1. The trip's OWN places (lodging/homeBase/coord-bearing stops) within
//     ~150m. Exactly one candidate → name it from that. Multiple (the
//     Provincetown lodging/beach/parade stack — `provincetown-stacked-places`
//     memory, the FOUNDING test case for this whole arc) → the cluster's own
//     dominant vision placeType DISAMBIGUATES; still ambiguous → keep the
//     coords name (NEVER a silent nearest-name pick — proximity only
//     PROPOSES, per Jonathan's repeated correction).
//  2. External reverse-lookup for the residue (0 candidates): worker-side
//     Nominatim `reverse` (keyless; mirrors app/src/lib/geocode.js's existing
//     client-side precedent + User-Agent, low volume). Cached on
//     trip.data_json's `placeNames` map (`"<lat4>,<lng4>": name`) so a
//     repeat cluster never re-bills — clobber-recomputable, no-bump write
//     (the tripTzBackfill.js precedent).

const NEARBY_METERS = 150

// The EXACT string sessionHeal.js's buildTripDecisions stamps on a fresh
// __discovered__ place, BOTH mirrors, byte-identical (see their header):
// `a place near ${lat.toFixed(4)}, ${lng.toFixed(4)}`. A decision not
// matching this format was never a discovered place, or was already renamed
// by a prior run of this module — never touched here either way.
const DISCOVERED_NAME_RE = /^a place near (-?\d+\.\d{4}), (-?\d+\.\d{4})$/

// mirror-safe copy (sessions.js keeps its own too, rather than importing
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

// Parse a discovered place's coords + the raw 4-decimal strings (reused
// verbatim as the placeNames cache key, so no separate rounding step can
// ever drift from what the name itself encodes). Returns null for anything
// that isn't exactly the discovered-name format.
export function parseDiscoveredCoords(placeName) {
  const m = typeof placeName === 'string' ? placeName.match(DISCOVERED_NAME_RE) : null
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, key: `${m[1]},${m[2]}` }
}

// A small, explicit, bounded classifier: what KIND of place is this named
// trip place, for matching against the cluster's dominant vision placeType?
// Deliberately narrow — an unmatched candidate returns null and therefore
// NEVER wins a disambiguation (fails safe, same posture as the clustering
// bridge's catch-all rule, BUILD 3).
const FLAVOR_PATTERNS = [
  ['beach', /\bbeach\b/i],
  ['event', /\b(parade|festival|fireworks|concert|celebration)\b/i],
  ['museum', /\bmuseum\b/i],
  ['restaurant', /\b(restaurant|dinner|lunch|breakfast|caf[eé]|dining)\b/i],
  ['shop', /\b(shop|store|market|boutique)\b/i],
  ['park', /\b(park|garden)\b/i],
  ['waterfront', /\b(waterfront|harbor|harbour|pier|dock|wharf)\b/i],
]
function flavorOf(kind, name) {
  if (kind === 'lodging') return 'stay'
  for (const [flavor, re] of FLAVOR_PATTERNS) if (re.test(name)) return flavor
  return null
}

// Every named, coord-bearing place the trip itself already knows about —
// homeBase, the lodging object/address, and any day stop carrying real
// lat/lng — the search field for "is this cluster somewhere we already have
// a name for".
export function collectTripPlaces(trip) {
  const out = []
  const hb = trip?.homeBase
  if (hb && Number.isFinite(hb.lat) && Number.isFinite(hb.lng)) {
    out.push({ lat: hb.lat, lng: hb.lng, name: hb.label || 'the place we stayed', flavor: 'stay' })
  }
  const lod = trip?.lodging
  if (lod && typeof lod === 'object' && Number.isFinite(lod.lat) && Number.isFinite(lod.lng)) {
    out.push({ lat: lod.lat, lng: lod.lng, name: lod.name || lod.address || 'the place we stayed', flavor: 'stay' })
  }
  for (const d of trip?.days || []) {
    for (const s of d?.stops || []) {
      if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue
      const name = (s.name || s.title || '').trim()
      if (!name) continue
      out.push({ lat: s.lat, lng: s.lng, name, flavor: flavorOf(s.kind, name) })
    }
  }
  return out
}

// The cluster's dominant placeType — the mode across its photos' vision
// labels, excluding catch-all values (never a meaningful disambiguator, same
// fail-safe posture as the clustering bridge's own catch-all rule, BUILD 3).
// null when no photo in the cluster carries a meaningful placeType.
const CATCHALL = new Set(['indoor-other', 'outdoor-other'])
export function dominantPlaceType(photoIds, placeTypeByRef) {
  const counts = new Map()
  for (const id of photoIds || []) {
    const pt = placeTypeByRef?.get ? placeTypeByRef.get(id) : undefined
    if (!pt || CATCHALL.has(pt)) continue
    counts.set(pt, (counts.get(pt) || 0) + 1)
  }
  let best = null
  let bestN = 0
  for (const [pt, n] of counts) {
    if (n > bestN) {
      best = pt
      bestN = n
    }
  }
  return best
}

const FLAVOR_MATCHES_PLACETYPE = {
  stay: new Set(['residential', 'indoor-other']),
  beach: new Set(['beach']),
  event: new Set(['event']),
  museum: new Set(['museum']),
  restaurant: new Set(['restaurant']),
  shop: new Set(['shop']),
  park: new Set(['park']),
  waterfront: new Set(['waterfront']),
}

// Resolve ONE discovered cluster's name from the trip's own places. Returns
// a name string, or null when no confident resolution exists (no candidate
// at all, or an ambiguous stack the placeType signal can't cleanly settle —
// the caller falls through to Nominatim / keeps the coords name).
// The AMBIGUOUS sentinel — a distinct return value from "zero candidates"
// (bare null). This distinction is load-bearing: zero candidates means the
// caller should try the EXTERNAL residue path (Nominatim); AMBIGUOUS means
// the plan's rule fires — "still ambiguous → KEEP the coords-derived name
// ... never a silent nearest-name pick" — a TERMINAL outcome that must NOT
// fall through to Nominatim either (an external reverse-geocode would itself
// be a silent nearest-name pick, just performed by a different service).
// Adversarial review (2026-07-11) caught the original version of this
// function collapsing both cases to bare `null`, which let an ambiguous
// stacked-places cluster — the FOUNDING test case this build exists to
// serve — silently fall through to Nominatim instead of staying unresolved.
export const AMBIGUOUS = Symbol('ambiguous')

export function resolveFromTripPlaces(trip, lat, lng, dominantType) {
  const candidates = collectTripPlaces(trip).filter(
    (c) => haversineMeters(lat, lng, c.lat, c.lng) <= NEARBY_METERS
  )
  if (candidates.length === 1) return candidates[0].name
  if (candidates.length === 0) return null
  // Stacked places (provincetown-stacked-places, the founding test case):
  // proximity only PROPOSES — the cluster's own placeType DISAMBIGUATES.
  if (!dominantType) return AMBIGUOUS
  const matching = candidates.filter(
    (c) => c.flavor && FLAVOR_MATCHES_PLACETYPE[c.flavor]?.has(dominantType)
  )
  return matching.length === 1 ? matching[0].name : AMBIGUOUS
}

// Worker-side Nominatim reverse geocode — mirrors app/src/lib/geocode.js's
// client-side reverseGeocode exactly (same field-preference order), with an
// identifying User-Agent (required server-side; a browser's implicit Referer
// covers the client path but a worker fetch carries none). Keyless, free,
// low volume (STOP-AND-ASK list: RESOLVED YES, Jonathan 2026-07-11). Never
// throws; null on any failure.
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse'
const USER_AGENT = 'roadtrip-family-trip-app/1.0 (private family use, low volume)'

export async function reverseGeocodeWorker(lat, lng, { fetchImpl = fetch } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  try {
    const url = `${NOMINATIM_REVERSE}?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=14&addressdetails=1`
    const res = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || typeof data !== 'object') return null
    const a = data.address || {}
    const locality = a.city || a.town || a.village || a.hamlet || a.suburb || a.county
    const region = a.state || a.region || a.country
    if (locality && region && locality !== region) return `${locality}, ${region}`
    if (locality) return locality
    if (region) return region
    if (typeof data.display_name === 'string' && data.display_name) {
      const parts = data.display_name.split(',').map((s) => s.trim()).filter(Boolean)
      return parts.slice(0, 2).join(', ') || null
    }
    return null
  } catch {
    return null
  }
}

// Build a photoId(ref key) → vision.placeType index from the trip's raw
// memory rows — the same shape recordHealDecisions already loads to call
// buildTripDecisions, reused here rather than re-querying.
export function buildPlaceTypeIndex(rows) {
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
      const pt = typeof ref.vision?.placeType === 'string' ? ref.vision.placeType : null
      if (pt) map.set(ref.key, pt)
    }
  }
  return map
}

// Resolve names for every discovered decision across `days` (buildTripDecisions'
// output), mutating each matched decision's place.name/signals in place —
// safe because these are freshly-built objects, never shared/frozen, and the
// only consumer is the ledger write right after this runs. Returns
// { renamed, external, cacheHits, placeNames } — placeNames is the merged
// cache to persist (OCC-guarded, no-bump), or null when nothing changed.
//
// `limit` bounds FRESH Nominatim calls only (trip-place resolution and cache
// hits are free/local and stay unbounded) — matching every sibling backfill
// in this batch (stopGeocodeBackfill.js/momentGpsPropagation.js/
// landmarkSearch.js all cap external/DB work per call). Without this, a
// hangout day that develops many un-name-able discovered clusters at once
// (several separated GPS bursts, no matching agenda place) could fire that
// many sequential, un-throttled requests against Nominatim's public
// endpoint in one pass — this runs on EVERY memory save (recordHealDecisions
// via index.js's post-save waitUntil), not just the nightly sweep, so an
// unbounded loop here is a real risk to Nominatim's 1-req/sec usage policy
// (adversarial review, 2026-07-11).
const DEFAULT_LIMIT = 10

export async function nameDiscoveredPlaces(trip, days, placeTypeByRef, { reverseGeocode = reverseGeocodeWorker, limit = DEFAULT_LIMIT } = {}) {
  const cache = { ...(trip?.placeNames && typeof trip.placeNames === 'object' ? trip.placeNames : {}) }
  let cacheDirty = false
  let renamed = 0
  let external = 0
  let cacheHits = 0
  let attempted = 0
  let hitLimit = false
  for (const day of days || []) {
    for (const dec of day.decisions || []) {
      if (dec.naming !== 'needs-name' || !dec.place) continue
      const coords = parseDiscoveredCoords(dec.place.name)
      if (!coords) continue
      const dominantType = dominantPlaceType(dec.photoIds, placeTypeByRef)
      const resolved = resolveFromTripPlaces(trip, coords.lat, coords.lng, dominantType)
      // AMBIGUOUS is TERMINAL — never falls through to Nominatim (that would
      // itself be a silent nearest-name pick, just via an external service).
      // Leave this decision's place.name exactly as buildTripDecisions left
      // it (the coords string) and move on to the next decision.
      if (resolved === AMBIGUOUS) continue
      let name = resolved
      let source = name ? 'trip-place' : null
      if (!name && cache[coords.key]) {
        name = cache[coords.key]
        source = 'nominatim-cached'
        cacheHits++
      }
      if (!name) {
        if (attempted >= limit) {
          hitLimit = true
        } else {
          attempted++
          name = await reverseGeocode(coords.lat, coords.lng)
          if (name) {
            source = 'nominatim'
            external++
            cache[coords.key] = name
            cacheDirty = true
          }
        }
      }
      if (name) {
        renamed++
        dec.place = { ...dec.place, name }
        dec.signals = { ...dec.signals, discoveredNameSource: source }
      }
    }
  }
  return { renamed, external, cacheHits, hitLimit, placeNames: cacheDirty ? cache : null }
}
