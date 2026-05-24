// Canonical identity helpers for activities. Lives in its own file
// (rather than sideActivities/index.js) so the Node-based test runner
// can import these without triggering Vite-only features like
// `import.meta.glob`.

// Stable identity for an activity, used by the duplicate check and the
// runtime findExisting() helper that future Share-In will route through.
// Three layers of signal, strongest first:
//   1. `placeId`             — observed value from Places (most reliable).
//   2. `placeIdOverride`     — asserted by the seed author.
//   3. name + rounded coords — fallback for activities that never
//      resolved via Places (4 decimals ≈ 11m precision).
// Returns null when there's not enough signal to identify the activity.
export function canonicalKey(activity) {
  if (!activity) return null
  if (typeof activity.placeId === 'string' && activity.placeId) {
    return `place:${activity.placeId}`
  }
  if (typeof activity.placeIdOverride === 'string' && activity.placeIdOverride) {
    return `place:${activity.placeIdOverride}`
  }
  const name = (activity.name || '').toLowerCase().trim().replace(/\s+/g, ' ')
  const lat = Number.isFinite(activity.lat) ? activity.lat.toFixed(4) : null
  const lng = Number.isFinite(activity.lng) ? activity.lng.toFixed(4) : null
  if (!name && (lat == null || lng == null)) return null
  return `nm:${name}|${lat ?? ''},${lng ?? ''}`
}

// Find an activity in `activities` that shares a canonical key with
// `candidate`. Returns the existing record or null. Used by Share-In
// to surface "you already have this" before adding a new entry.
export function findExisting(activities, candidate) {
  const candKey = canonicalKey(candidate)
  if (!candKey) return null
  for (const a of activities || []) {
    if (canonicalKey(a) === candKey) return a
  }
  return null
}
