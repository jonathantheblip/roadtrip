// stayPlaceCoords.js — WORKER MIRROR of app/src/lib/tripShape.js's
// stayPlaceCoords (lines ~193-210 there). THE one source of "where the stay
// is", in meters — Build 2's trip-timezone derivation needs this worker-side
// to geocode the STAY's IANA zone, without pulling the rest of tripShape.js
// (React-facing helpers with a much larger surface) into the worker bundle.
// PURE, self-contained, byte-identical logic to the client — never imported
// across the boundary (separate deployables).
//
// Returns { lat, lng, label } | null, most authoritative source first:
//   1. a deliberately-set homeBase (the located anchor),
//   2. the geocoded lodging ADDRESS,
//   3. a located lodging STOP.
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
