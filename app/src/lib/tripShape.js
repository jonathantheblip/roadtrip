// Trip SHAPE — the first step of the family-trips shift (FAMILY_TRIPS_VISION.md).
//
// The app was built for a road trip, but most family trips aren't that shape. The
// shape is what lets every surface stop wearing road-trip clothing for a stay (the
// drive ticker, the "nearest bathroom" queue, the clock-picks-the-stop live rail).
//
// Phase 1 distinguishes the two shapes that matter most, by the most intuitive
// signal: DO YOU SLEEP IN THE SAME PLACE EVERY NIGHT?
//   - 'route' — you move through 2+ distinct overnight places (a road trip).
//   - 'stay'  — one base you return to (a cabin weekend, a city break, Grandma's).
// Inferred, never asked. Defaults to 'route' (today's behavior) when unsure, so a
// real road trip can never be mislabeled and lose its drive scaffolding (G5).
//
// (Itinerary/flight + hangout get their own treatment later; for now they fold
// into 'stay' when anchored at one place, 'route' otherwise.)

// "home" / "(home)" / "— (home)" — a night spent at home, not an overnight stay.
const HOME = /^[\s—–-]*\(?\s*home\s*\)?[\s—–-]*$/i

function lodgingName(v) {
  if (v && typeof v === 'object') return String(v.name || v.address || '').trim()
  if (typeof v === 'string') return v.trim()
  return ''
}

// The distinct, real overnight places of a trip (lowercased; "home" + blanks
// dropped). Layered by reliability so we don't double-count the SAME place under
// two names (a per-day note "Murray Hill Airbnb" + a lodging stop "40 E 38th St"):
// prefer the per-day lodging notes; fall back to kind:'lodging' stops only when
// there are no day notes; then the trip-level lodging.
export function overnightBases(trip) {
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

// A clean LOCALITY out of a destination string, for the "AT [place]" card. Drops
// a leading street/unit segment ("613 Forest Mountain Road" / "Apt 4B") and a
// trailing state/country code ("VT" / "USA"), then takes the first of what's
// left: "613 Forest Mountain Road, Peru, VT" → "Peru"; "New York, NY" → "New
// York"; "Apt 4B, 200 Main St, Boston, MA" → "Boston". Empty/garbage → '' (the
// caller then falls back to the trip title rather than rendering punctuation).
const STREET_SEG = /^\d|^(apt|apartment|unit|suite|ste|flat|fl|floor|rm|room|po box|#)\b/i
const REGION_CODE = /^[a-z]{2}$/i // a trailing 2-letter state/province/country code
const COUNTRY_SEG = /^(usa|u\.s\.a\.?|us|uk|u\.k\.)$/i
export function destinationLabel(endCity) {
  let segs = String(endCity || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!segs.length) return ''
  while (segs.length > 1 && STREET_SEG.test(segs[0])) segs = segs.slice(1)
  while (segs.length > 1 && (REGION_CODE.test(segs[segs.length - 1]) || COUNTRY_SEG.test(segs[segs.length - 1]))) {
    segs = segs.slice(0, -1)
  }
  const cand = segs[0] || ''
  // A street/unit, a bare number, punctuation-only, or a lone state/country code
  // is NOT a place name (a one-segment "Suite 500" / "90210" / "!!!" / "VT" /
  // "USA" skips the strip loops above) → '' so the caller falls back to the title.
  if (!cand || STREET_SEG.test(cand) || !/[a-z]/i.test(cand) || REGION_CODE.test(cand) || COUNTRY_SEG.test(cand)) return ''
  return cand
}

// A comparison key for a place string — its first comma-segment, lowercased. So
// "Belmont, MA", "Belmont", and "Belmont, Massachusetts" all key to "belmont"
// (the byte-exact match was brittle: a cabin trip whose return leg said "Belmont"
// while startCity was "Belmont, MA" wrongly read as a route).
function placeKey(s) {
  return String(s || '').split(',')[0].trim().toLowerCase()
}

// A trip with NO recorded lodging (the bases-empty case) but a clear single
// DESTINATION it's anchored at — the place typed as the trip's end — that it
// STAYS at rather than drives past. The Vermont cabin trip: its address sat in
// `endCity` with a blank lodging, so it read as a route. The guards below keep a
// real road trip from mis-flipping (G5): a road trip records where it sleeps (≥2
// bases → handled before this), OR drives to / visits MORE than the one
// destination, OR is a long one-way haul (caught here). Conservative — when
// unsure it stays a route.
const STAY_RADIUS_MILES = 60 // a stay's stops cluster; a route's span farther + a
//                              long no-return haul reads as a road trip, not a stay
// The farthest any two LOCATED stops sit apart, in miles — a stay's stops cluster
// near the place; a road trip's stops span far.
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
function destinationOnlyStay(trip) {
  const home = placeKey(trip?.startCity)
  const dest = String(trip?.endCity || '').trim()
  // Need a real, named destination (not blank/garbage, not "home", not a trip
  // that ends back where it started).
  if (!destinationLabel(dest) || HOME.test(dest) || placeKey(dest) === home) return false
  // The one signal that holds up: how many DISTINCT places does the trip touch?
  // One place = a stay (anchored there); several = a route through them. Count is
  // the reliable signal — distance and one-way-vs-round-trip are NOT (a stay can
  // be a long haul; "did you record the drive home" shouldn't change the answer).
  //   • We DON'T match drive endpoints against endCity (the cabin's address/venue
  //     and the geocoded town are different strings — that wrongly routed
  //     "Grandma's House, Peru, VT").
  //   • Home is matched by first-segment ("Belmont" == "Belmont, MA"); away-places
  //     are keyed by FULL string ("Portland, ME" != "Portland, OR" — first-segment
  //     would collide and flatten a real cross-country route).
  // Tradeoff (conservative, G5-safe): a stay whose RECORDED drives visit 2+ named
  // places (a city stay logging borough hops) reads as a route — the safe miss;
  // the family can pin shape='stay'. The dangerous miss (a real multi-stop route
  // → stay) can't happen: a route records 2+ places (→ here) or 2+ bases (→ above).
  const awayPlaces = new Set()
  for (const d of trip?.days || []) {
    const dr = d?.drive || {}
    for (const raw of [dr.from, dr.to]) {
      const full = String(raw || '').trim().toLowerCase()
      if (full && placeKey(raw) !== home) awayPlaces.add(full)
    }
  }
  if (awayPlaces.size >= 2) return false // drives move through 2+ places → route
  // Located stops spread far apart → the stops ARE a route's places → a route.
  return maxStopSpreadMiles(trip) <= STAY_RADIUS_MILES
}

// 'stay' | 'route'. An explicit trip.shape always wins (so a future hand-override
// or a mislabeled trip can be corrected without code).
export function inferTripShape(trip) {
  if (!trip) return 'route'
  if (trip.shape === 'stay' || trip.shape === 'route') return trip.shape
  const bases = overnightBases(trip)
  if (bases.size >= 2) return 'route' // you move → road trip
  if (bases.size === 1 || hasLocatedAnchor(trip)) return 'stay' // one base / a home anchor
  // No lodging recorded, but a single destination you don't drive past → a stay
  // at that place (the cabin-address-in-endCity case). Auto-recognition.
  if (destinationOnlyStay(trip)) return 'stay'
  return 'route' // nothing to tell from → keep road-trip behavior (safe)
}

export function isStayTrip(trip) {
  return inferTripShape(trip) === 'stay'
}

// Display name of where a stay is anchored (no coords required — for the home
// view, which should name the place even before it's geocoded).
export function stayLabel(trip) {
  let name = lodgingName(trip?.lodging)
  if (!name || HOME.test(name)) {
    name = ''
    for (const d of trip?.days || []) { const n = lodgingName(d?.lodging); if (n && !HOME.test(n)) { name = n; break } }
  }
  if (!name) name = (String(trip?.homeBase?.label || '').split(',')[0]).trim()
  // A destination-only stay (no lodging set) names from the place typed as the
  // trip's end — better than the trip title for the "AT [place]" card.
  if (!name) name = destinationLabel(trip?.endCity)
  return name || trip?.title || 'where we’re staying'
}

// Nights away at a place = days minus the nights spent at home (the per-day "home"
// notes). 0 when we can't tell it's an away stay (the home view then hides the
// nights line rather than claim a wrong count).
export function stayNights(trip) {
  const days = trip?.days || []
  const homeNights = days.filter((d) => { const l = lodgingName(d?.lodging); return l && HOME.test(l) }).length
  return Math.max(0, days.length - homeNights)
}

// THE one source of "where the stay is", in meters — so the live rail and the
// photo filer can never disagree about the place (FAMILY_TRIPS_VISION §5; the
// "mishmash" was each surface finding the place its own way). Returns
// { lat, lng, label } | null, most authoritative source first:
//   1. a deliberately-set homeBase (the located anchor, e.g. volleyball-2026),
//   2. the geocoded + confirmed lodging ADDRESS (Phase 2 — the real-world
//      address-only stay where P1.5 silently no-op'd for lack of coords),
//   3. a located lodging STOP.
// NOTE: coords live on `trip.lodging.lat/lng`, NOT `trip.homeBase` — homeBase
// feeds road-trip scaffolding (drive-home ETA, the "nearest fast-food" queue),
// which a stay must shed, so we never auto-populate it.
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

// The located place a stay is anchored on — { lat, lng, name } or null. Coords
// from the shared stayPlaceCoords; name from the lodging label (friendly),
// falling back to the first address segment.
export function stayPlace(trip) {
  const coords = stayPlaceCoords(trip)
  if (!coords) return null
  let name = lodgingName(trip?.lodging)
  if (!name) for (const d of trip?.days || []) { const n = lodgingName(d?.lodging); if (n && !HOME.test(n)) { name = n; break } }
  if (!name) name = (coords.label.split(',')[0] || '').trim()
  return { lat: coords.lat, lng: coords.lng, name: name || 'where we’re staying' }
}

// How close (meters) counts as "at the place". A generous default — a rural cabin
// set back from its mapped address + GPS wobble argue for breathing room; the
// device's own accuracy is added so a fuzzy fix is treated leniently.
export const AT_PLACE_METERS = 300

function haversineM(aLat, aLng, bLat, bLng) {
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return Infinity
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

// Is this device position within the place's footprint? Lenient by the fix's own
// accuracy. Returns false for a missing place or position (→ honest clock fallback).
export function atPlace(place, position, radius = AT_PLACE_METERS) {
  if (!place || !position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return false
  const d = haversineM(place.lat, place.lng, position.lat, position.lng)
  return d <= radius + (Number.isFinite(position.accuracy) ? Math.min(position.accuracy, 200) : 0)
}

// The live rail's question: is THIS device at the stay place right now? Returns
// the place ({lat,lng,name}) when it's a stay AND we have a fix AND it's inside
// the footprint; else null (→ the live rail falls back to its honest clock
// readout). One named, tested function so the rail no longer re-derives this
// inline. The photo filer asks a DIFFERENT question — does this PHOTO belong
// here — but both read the SAME place via stayPlace/stayPlaceCoords, so they
// can never tell two different stories about where "here" is.
export function detectCurrentPlace(trip, position) {
  if (!isStayTrip(trip) || !position) return null
  const place = stayPlace(trip)
  return place && atPlace(place, position) ? place : null
}
