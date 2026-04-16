// Quick-search URL builders for the persistent navigation bar.
//
// Jonathan drives, so his quick-search actions open Waze. Everyone else
// opens Apple Maps. These rely on the phone's GPS — we pass the query
// through and let the nav app handle "near me".

const QUERIES = {
  gas: 'gas station near me',
  outside: 'playground near me',
  food: 'restaurant near me',
  rest: 'rest stop near me',
  emergency: 'emergency room near me',
}

export const QUICK_SEARCHES = [
  { key: 'gas', label: 'Gas', icon: '⛽' },
  { key: 'outside', label: 'Outside', icon: '🌳' },
  { key: 'food', label: 'Food', icon: '🍔' },
  { key: 'rest', label: 'Rest Stop', icon: '🚻' },
  { key: 'emergency', label: 'ER', icon: '🏥', emergency: true },
]

export function quickSearchUrl(key, activePerson) {
  const q = encodeURIComponent(QUERIES[key] || QUERIES.rest)
  if (activePerson === 'jonathan') {
    return `https://waze.com/ul?q=${q}&navigate=yes`
  }
  return `https://maps.apple.com/?q=${q}`
}

// Resolve a stop to a person-appropriate navigation URL.
// Jonathan → Waze (lat/lng preferred). Everyone else → Apple Maps (address).
export function personNavUrl(activePerson, stop) {
  if (!stop) return '#'
  if (activePerson === 'jonathan') {
    if (stop.lat != null && stop.lng != null) {
      return `https://waze.com/ul?ll=${stop.lat},${stop.lng}&navigate=yes`
    }
    return `https://waze.com/ul?q=${encodeURIComponent(stop.address || stop.name)}&navigate=yes`
  }
  return `https://maps.apple.com/?daddr=${encodeURIComponent(stop.address || stop.name)}`
}
