// worker/src/dayStopIds.js — the SERVER-SIDE "which stop ids can a memory be
// filed to on this day" derivation.
// ----------------------------------------------------------------------------
// The mirror of the client's dayStopIds family (app/src/lib/photoMatch.js) and
// the tripShape helpers its gates ride on (app/src/lib/tripShape.js) — the
// lib/surprises.js precedent, this time WITH a parity test
// (test/dayStopIds-parity.test.js) that runs BOTH copies over one fixture
// corpus and asserts identical per-day id sets. Change either side → keep the
// other in step, and extend the corpus.
//
// Why the worker needs this at all: on a STAY (the settled core trip shape),
// footprint photos file to the trip's IMPLICIT base — a per-day, date-keyed id
// (`__trip_base__:<iso>`) that exists in NO day.stops list. A server consumer
// that derives a day's ids from bare `day.stops` silently drops every
// base-filed memory: the nightly weave never sees a stay day as "having"
// memories, and the /weave/latest freshness signature can never match again
// after a base move. Every weave-side id-set derivation goes through here.
//
// Deliberately the MINIMAL subset the server consumes today (dayStopIds + the
// full gate chain it needs, verbatim). The place-NAME/coords outputs are kept
// on tripImplicitBase so a future server reader (findStopName, VISION §4's
// resolver) inherits them rather than re-deriving.

// ── tripShape mirrors (app/src/lib/tripShape.js) ─────────────────────────────

// "home" / "(home)" / "— (home)" — a night spent at home, not an overnight stay.
const HOME = /^[\s—–-]*\(?\s*home\s*\)?[\s—–-]*$/i

function lodgingName(v) {
  if (v && typeof v === 'object') return String(v.name || v.address || '').trim()
  if (typeof v === 'string') return v.trim()
  return ''
}

// The distinct, real overnight places of a trip (lowercased; "home" + blanks
// dropped). Layered by reliability: per-day lodging notes → kind:'lodging'
// stops (only when no day notes) → the trip-level lodging.
function overnightBases(trip) {
  const collect = (fn) => {
    const s = new Set()
    const add = (v) => { const n = lodgingName(v); if (n && !HOME.test(n)) s.add(n.toLowerCase()) }
    fn(add)
    return s
  }
  const fromDays = collect((add) => { for (const d of trip?.days || []) add(d?.lodging) })
  if (fromDays.size) return fromDays
  const fromStops = collect((add) => {
    for (const d of trip?.days || []) for (const s of d?.stops || []) if (s?.kind === 'lodging') add(s.name || s.title)
  })
  if (fromStops.size) return fromStops
  return collect((add) => add(trip?.lodging))
}

function hasLocatedAnchor(trip) {
  const hb = trip?.homeBase
  return !!hb && Number.isFinite(hb.lat) && Number.isFinite(hb.lng)
}

// A clean LOCALITY out of a destination string. Drops a leading street/unit
// segment and a trailing state/country code; garbage → '' (caller falls back).
const STREET_SEG = /^\d|^(apt|apartment|unit|suite|ste|flat|fl|floor|rm|room|po box|#)\b/i
const REGION_CODE = /^[a-z]{2}$/i // a trailing 2-letter state/province/country code
const COUNTRY_SEG = /^(usa|u\.s\.a\.?|us|uk|u\.k\.)$/i
function destinationLabel(endCity) {
  let segs = String(endCity || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!segs.length) return ''
  while (segs.length > 1 && STREET_SEG.test(segs[0])) segs = segs.slice(1)
  while (segs.length > 1 && (REGION_CODE.test(segs[segs.length - 1]) || COUNTRY_SEG.test(segs[segs.length - 1]))) {
    segs = segs.slice(0, -1)
  }
  const cand = segs[0] || ''
  if (!cand || STREET_SEG.test(cand) || !/[a-z]/i.test(cand) || REGION_CODE.test(cand) || COUNTRY_SEG.test(cand)) return ''
  return cand
}

// A comparison key for a place string — its first comma-segment, lowercased.
function placeKey(s) {
  return String(s || '').split(',')[0].trim().toLowerCase()
}

const STAY_RADIUS_MILES = 60 // a stay's stops cluster; a route's span farther

function haversineM(aLat, aLng, bLat, bLng) {
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return Infinity
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

// The farthest any two LOCATED stops sit apart, in miles.
function maxStopSpreadMiles(trip) {
  const pts = []
  for (const d of trip?.days || []) for (const s of d?.stops || []) {
    if (Number.isFinite(s?.lat) && Number.isFinite(s?.lng)) pts.push(s)
  }
  let max = 0
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    max = Math.max(max, haversineM(pts[i].lat, pts[i].lng, pts[j].lat, pts[j].lng) / 1609.34)
  }
  return max
}

// A trip with NO recorded lodging but a clear single DESTINATION it STAYS at
// (the cabin-address-in-endCity case). Conservative — when unsure it stays a
// route; the full reasoning lives on the client copy.
function destinationOnlyStay(trip) {
  const home = placeKey(trip?.startCity)
  const dest = String(trip?.endCity || '').trim()
  if (!destinationLabel(dest) || HOME.test(dest) || placeKey(dest) === home) return false
  const awayPlaces = new Set()
  for (const d of trip?.days || []) {
    const dr = d?.drive || {}
    for (const raw of [dr.from, dr.to]) {
      const full = String(raw || '').trim().toLowerCase()
      if (full && placeKey(raw) !== home) awayPlaces.add(full)
    }
  }
  if (awayPlaces.size >= 2) return false // drives move through 2+ places → route
  return maxStopSpreadMiles(trip) <= STAY_RADIUS_MILES
}

// 'stay' | 'route'. An explicit trip.shape always wins.
export function inferTripShape(trip) {
  if (!trip) return 'route'
  if (trip.shape === 'stay' || trip.shape === 'route') return trip.shape
  const bases = overnightBases(trip)
  if (bases.size >= 2) return 'route' // you move → road trip
  if (bases.size === 1 || hasLocatedAnchor(trip)) return 'stay' // one base / a home anchor
  if (destinationOnlyStay(trip)) return 'stay'
  return 'route' // nothing to tell from → keep road-trip behavior (safe)
}

export function isStayTrip(trip) {
  return inferTripShape(trip) === 'stay'
}

// THE one source of "where the stay is", most authoritative first: a set
// homeBase → the geocoded lodging address → a located lodging stop.
export function stayPlaceCoords(trip) {
  const hb = trip?.homeBase
  if (hb && Number.isFinite(hb.lat) && Number.isFinite(hb.lng)) {
    return { lat: hb.lat, lng: hb.lng, label: hb.label || '' }
  }
  const lod = trip?.lodging
  if (lod && typeof lod === 'object' && Number.isFinite(lod.lat) && Number.isFinite(lod.lng)) {
    return { lat: lod.lat, lng: lod.lng, label: lod.name || lod.address || '' }
  }
  for (const d of trip?.days || []) {
    for (const s of d?.stops || []) {
      if (s?.kind === 'lodging' && Number.isFinite(s.lat) && Number.isFinite(s.lng)) {
        return { lat: s.lat, lng: s.lng, label: s.address || s.name || '' }
      }
    }
  }
  return null
}

// ── photoMatch mirrors (app/src/lib/photoMatch.js) ───────────────────────────

export const IMPLICIT_BASE_PREFIX = '__trip_base__'
export function implicitBaseIdForDay(isoDate) {
  return `${IMPLICIT_BASE_PREFIX}:${isoDate}`
}
export function isImplicitBaseId(id) {
  return typeof id === 'string' && id.startsWith(`${IMPLICIT_BASE_PREFIX}:`)
}

// A stop is a "BASE" — a place you're staying/hanging out at. A place you STAY
// is a base automatically (kind 'lodging'); an explicit `isBase` (true OR
// false) always overrides that default.
export function stopIsBase(stop) {
  if (!stop) return false
  if (typeof stop.isBase === 'boolean') return stop.isBase
  return stop.kind === 'lodging'
}

// Human name of where you're staying — the lodging (object or legacy string).
function lodgingLabel(trip) {
  const lod = trip?.lodging
  if (lod && typeof lod === 'object') return ((lod.name || lod.address) || '').trim()
  if (typeof lod === 'string') return lod.trim()
  return ''
}

function hasPlannedBaseStop(trip) {
  for (const day of trip?.days || []) {
    for (const s of day.stops || []) {
      if (stopIsBase(s) && Number.isFinite(s.lat) && Number.isFinite(s.lng)) return true
    }
  }
  return false
}

// Returns the implicit-base TEMPLATE {name, lat, lng, isBase} or null.
// GATES (verbatim from the client): (1) stay shape; (2) a located anchor
// exists; (3) no planned base stop already covers it; (4) a real STAY signal —
// a set lodging that isn't literally "home", OR a multi-day trip.
export function tripImplicitBase(trip) {
  if (!isStayTrip(trip)) return null
  const coords = stayPlaceCoords(trip)
  if (!coords) return null
  if (hasPlannedBaseStop(trip)) return null
  const name = lodgingLabel(trip)
  const namedStay = !!name && !HOME.test(name)
  const multiDay = Array.isArray(trip?.days) && trip.days.length >= 2
  if (!namedStay && !multiDay) return null
  return {
    name: namedStay ? name : (coords.label ? coords.label.split(',')[0].trim() : 'Where we’re staying'),
    lat: coords.lat,
    lng: coords.lng,
    isBase: true,
    _implicitBase: true,
  }
}

// A night spent at home — the per-day lodging note literally says "home". The
// implicit base is SUPPRESSED on these days (never file your own house).
export function isHomeDay(day) {
  const lod = typeof day?.lodging === 'string' ? day.lodging.trim() : ''
  return !!lod && HOME.test(lod)
}

// THE one source of truth for "which stop ids a memory can be filed to on this
// day" — the planned stops PLUS the trip's implicit base (when it applies to
// the day). Every server surface that groups memories by stop must use this,
// or a base-filed "At the cabin" photo gets silently dropped.
export function dayStopIds(trip, day) {
  const ids = new Set((day?.stops || []).map((s) => s.id))
  if (day?.isoDate && !isHomeDay(day) && tripImplicitBase(trip)) {
    ids.add(implicitBaseIdForDay(day.isoDate))
  }
  return ids
}
