// Per-traveler Maps deep linking. Jonathan → Waze, others → Apple Maps.
// Spec §10.
//
// Always prefer a verified street address over lat/lng. Coordinates in
// the trip data are sometimes city centroids or approximate venue
// pins, and Waze in particular routes you to the literal coordinate
// rather than the named place. The address is the source of truth;
// coordinates are only a last-resort fallback.

import { TRAVELERS } from '../data/travelers'

function looksLikeFullAddress(addr) {
  if (!addr) return false
  // Heuristic: a real street address has a number prefix or a comma
  // separating street + city (e.g. "200 W 45th St, New York, NY").
  // Bare city strings like "Catskill, NY" or "Belmont, MA" lack a
  // street number and shouldn't be trusted to geocode precisely.
  return /\d/.test(addr) && /,/.test(addr)
}

export function mapsLink(stop, travelerId) {
  const traveler = TRAVELERS[travelerId] || TRAVELERS.jonathan
  const address = (stop?.address || '').trim()
  const hasCoords = stop?.lat != null && stop?.lng != null
  const useAddress = looksLikeFullAddress(address)

  if (traveler.maps === 'waze') {
    // Waze: q= takes a search query; the app geocodes against its own
    // place index. ll= takes raw coordinates and routes to that exact
    // point — wrong if the coord was a city centroid.
    if (useAddress) {
      return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`
    }
    if (hasCoords) {
      return `https://waze.com/ul?ll=${stop.lat},${stop.lng}&navigate=yes`
    }
    return `https://waze.com/ul?q=${encodeURIComponent(address || stop?.name || '')}&navigate=yes`
  }

  // Apple Maps universal link. daddr= accepts an address string or
  // "lat,lng"; the app picks the best match.
  if (useAddress) {
    return `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`
  }
  if (hasCoords) {
    return `https://maps.apple.com/?daddr=${stop.lat},${stop.lng}`
  }
  return `https://maps.apple.com/?daddr=${encodeURIComponent(address || stop?.name || '')}`
}
