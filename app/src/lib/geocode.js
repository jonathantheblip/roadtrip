// Address → lat/lng. No geocoder was wired in this codebase (the change
// order 2026-05-17 §4.1 allowed a TODO; we do best-effort instead since
// it also said "do not silently drop lat/lng").
//
// Nominatim (OpenStreetMap) is keyless and CORS-enabled. This is a
// 4-person family app at trivial volume — well inside Nominatim's usage
// policy (<1 req/s, identifying Referer). It is BEST EFFORT: failures
// (offline, rate-limit, no match) resolve to null and never block a
// save. The editor stores the address regardless and only fills
// lat/lng when a confident match comes back.

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'

// Tiny client-side throttle so a burst of stop edits can't exceed
// Nominatim's 1 req/s policy.
let lastCall = 0
async function throttle() {
  const now = Date.now()
  const wait = Math.max(0, 1100 - (now - lastCall))
  if (wait) await new Promise((r) => setTimeout(r, wait))
  lastCall = Date.now()
}

// Returns { lat, lng } or null. Never throws.
export async function geocodeAddress(address) {
  const q = (address || '').trim()
  if (q.length < 4) return null
  try {
    await throttle()
    const url = `${ENDPOINT}?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const arr = await res.json()
    const hit = Array.isArray(arr) ? arr[0] : null
    if (!hit) return null
    const lat = parseFloat(hit.lat)
    const lng = parseFloat(hit.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch {
    // Offline / blocked / rate-limited — caller keeps the address and
    // leaves lat/lng as-is. Not an error the user needs to see.
    return null
  }
}
