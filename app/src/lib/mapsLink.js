// Per-traveler Maps deep linking. Jonathan → Waze, others → Apple Maps.
// Spec §10. Returns a URL string suitable for an <a href> — iOS will
// hand off waze:// and maps:// URLs to the native apps.

import { TRAVELERS } from '../data/travelers'

export function mapsLink(stop, travelerId) {
  const traveler = TRAVELERS[travelerId] || TRAVELERS.jonathan
  const hasCoords = stop?.lat != null && stop?.lng != null
  if (traveler.maps === 'waze') {
    if (hasCoords) {
      return `https://waze.com/ul?ll=${stop.lat},${stop.lng}&navigate=yes`
    }
    return `https://waze.com/ul?q=${encodeURIComponent(stop.address || stop.name || '')}&navigate=yes`
  }
  // Apple Maps universal link — works on iOS, opens Maps.app; on macOS opens Maps;
  // on other devices renders the maps.apple.com fallback page.
  const target = stop.address || (hasCoords ? `${stop.lat},${stop.lng}` : stop.name || '')
  return `https://maps.apple.com/?daddr=${encodeURIComponent(target)}`
}
