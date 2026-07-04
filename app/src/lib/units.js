// units.js — the honest, keyless "which measurement system this leg reads in"
// fact + display formatting. Same blunt "abroad" framing as legOrientation.js
// (home = US, everywhere else = metric) — mirrors the design's rule (04-copy-
// and-conditions.md): "Distances/temps follow the leg's locale (km/°C abroad),
// with a home-unit hint where useful." Pure: no network, no globals.

const HOME_REGION = 'US'

// Metric if the leg names a region subtag and it isn't home. No region (a
// domestic leg, or a pre-keystone trip with no locale) → imperial, unchanged
// from today ("no delta → no module", Design 05).
export function isMetricLocale(locale) {
  const region = typeof locale === 'string' ? locale.trim().split('-')[1] : ''
  return !!region && region.toUpperCase() !== HOME_REGION
}

// °F → a display string. Metric leads with the local reading, with the home
// unit as a parenthetical hint; home stays byte-identical to today. Never
// fabricates precision the source int (Open-Meteo, rounded once) doesn't have.
export function formatTemp(tempF, metric) {
  if (!Number.isFinite(tempF)) return ''
  const f = Math.round(tempF)
  if (!metric) return `${f}°F`
  const c = Math.round(((f - 32) * 5) / 9)
  return `${c}°C · ${f}°F`
}

// Format a distance in meters as a short human label. Walks the
// metric → imperial line the family uses — under 0.1 mi shows feet so
// "two blocks away" reads right. (Moved here from placesNearby.js so it stays
// pure/dependency-free and unit-testable; re-exported there for callers.)
export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return ''
  const feet = meters * 3.28084
  const miles = meters / 1609.344
  if (feet < 528) return `${Math.round(feet / 10) * 10} ft`
  if (miles < 10) return `${miles.toFixed(1)} mi`
  return `${Math.round(miles)} mi`
}

// The metric mirror of formatDistance — under 1km shows meters (rounded to
// the nearest 10m) so a short walk still reads in round numbers.
export function formatDistanceMetric(meters) {
  if (!Number.isFinite(meters)) return ''
  const km = meters / 1000
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

// Locale-aware dispatcher — the one call sites should use once they know
// whether the current leg reads metric (isMetricLocale above). `metric`
// false/undefined is byte-identical to the plain formatDistance.
export function formatDistanceLocale(meters, metric) {
  return metric ? formatDistanceMetric(meters) : formatDistance(meters)
}
