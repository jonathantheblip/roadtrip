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
const REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse'

// Tiny client-side throttle so a burst of stop edits can't exceed
// Nominatim's 1 req/s policy.
let lastCall = 0
async function throttle() {
  const now = Date.now()
  const wait = Math.max(0, 1100 - (now - lastCall))
  if (wait) await new Promise((r) => setTimeout(r, wait))
  lastCall = Date.now()
}

// Reverse-geocode a lat/lng to a short human place name suitable
// for a deviation-cluster bucket label (e.g. "Vicksburg, Mississippi",
// "Buc-ee's, Baytown"). Never throws; returns null on any failure.
//
// Picks the most useful name fields available from Nominatim's
// `address` object — town/city, then state/region. Caller decides
// how to fold null into UI copy ("Off-route stop" etc).
export async function reverseGeocode(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  try {
    await throttle()
    const url = `${REVERSE_ENDPOINT}?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lng)}&zoom=14&addressdetails=1`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
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
      // Last-resort: first two comma-separated components of display_name
      const parts = data.display_name.split(',').map((s) => s.trim()).filter(Boolean)
      return parts.slice(0, 2).join(', ') || null
    }
    return null
  } catch {
    return null
  }
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
