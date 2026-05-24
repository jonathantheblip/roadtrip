// Worker-proxied leave-when query.
//
// The iteration logic + Routes API calls live in the Worker
// (worker/src/leaveWhen.js + /leave-when endpoint) so the
// GOOGLE_PLACES_API_KEY stays out of the client bundle and we get a
// single place to rate-limit, log, and evolve the algorithm.
//
// Client responsibilities:
//   - Shape the request (Dates → ISO strings).
//   - 5-minute TTL cache keyed on origin+destination+target-minute, so
//     re-renders and the "Re-check in 15 min" link don't burn quota.
//   - Surface a typed result (Date in/Date out).

import { workerFetch } from './workerSync'

const TTL_MS = 5 * 60 * 1000
const cache = new Map() // key → { result, expiresAt }

function cacheKey(origin, destination, targetArrival) {
  const t = Math.round(targetArrival.getTime() / 60_000) // minute granularity
  const o = `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}`
  const d = `${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`
  return `${o}→${d}@${t}`
}

export function clearLeaveWhenCache() {
  cache.clear()
}

/**
 * Compute the leave-by time for a driving trip with a target arrival.
 * @param {object} params
 * @param {{lat:number, lng:number}} params.origin
 * @param {{lat:number, lng:number}} params.destination
 * @param {Date} params.targetArrival
 * @param {number} [params.seedDurationMinutes]
 *   Initial duration guess (typically activity.drivingMinutesComputed).
 *   Worker falls back to a haversine/30mph estimate if omitted.
 * @returns {Promise<{
 *   leaveBy: Date,
 *   durationMinutes: number,
 *   iterations: number,
 *   trafficNote: string | null,
 * }>}
 */
export async function computeLeaveWhen({
  origin,
  destination,
  targetArrival,
  seedDurationMinutes,
  bypassCache = false,
}) {
  if (!(targetArrival instanceof Date)) {
    targetArrival = new Date(targetArrival)
  }
  if (Number.isNaN(targetArrival.getTime())) {
    throw new Error('Invalid targetArrival')
  }
  if (targetArrival.getTime() <= Date.now()) {
    throw new Error('Target arrival is already past')
  }

  const key = cacheKey(origin, destination, targetArrival)
  if (!bypassCache) {
    const hit = cache.get(key)
    if (hit && hit.expiresAt > Date.now()) return hit.result
  }

  const body = {
    origin: { lat: origin.lat, lng: origin.lng },
    destination: { lat: destination.lat, lng: destination.lng },
    targetArrivalISO: targetArrival.toISOString(),
  }
  if (Number.isFinite(seedDurationMinutes)) {
    body.seedDurationMinutes = seedDurationMinutes
  }

  const res = await workerFetch('/leave-when', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const data = await res.json()

  const result = {
    leaveBy: new Date(data.leaveByISO),
    durationMinutes: data.durationMinutes,
    iterations: data.iterations,
    trafficNote: data.trafficNote || null,
  }
  cache.set(key, { result, expiresAt: Date.now() + TTL_MS })
  return result
}

// Best-effort parser for a stop's free-text `time` ("3:45PM", "10:00 AM",
// "Late", "Evening"). Returns a Date combined with `isoDate` (YYYY-MM-DD)
// or null if unparseable.
export function parseStopTime(timeStr, isoDate) {
  if (typeof timeStr !== 'string' || typeof isoDate !== 'string') return null
  const m = timeStr.trim().match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const mins = m[2] ? parseInt(m[2], 10) : 0
  const ampm = m[3].toLowerCase()
  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  // isoDate is "YYYY-MM-DD"; treat the time as local (the family's tz).
  const d = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(h, mins, 0, 0)
  return d
}

// Default arrival buffer per stop kind. Tournament/duty get Aurelia's
// standing 60-min warmup window; everything else gets 15 min.
export function defaultBufferMinutes(kind) {
  if (kind === 'tournament' || kind === 'duty') return 60
  return 15
}

// Round a Date up to the next n-minute boundary. Used to produce a
// sensible default target arrival in the modal.
export function roundToNextNMinutes(d, n) {
  const out = new Date(d)
  out.setSeconds(0, 0)
  const mins = out.getMinutes()
  const rounded = Math.ceil((mins + 0.001) / n) * n
  out.setMinutes(rounded, 0, 0)
  return out
}

// Format a Date as "h:mmam/pm" — matches the rest of the app's casing.
export function formatTimeOfDay(d) {
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'pm' : 'am'
  let h12 = h % 12
  if (h12 === 0) h12 = 12
  return m === 0
    ? `${h12}${ampm}`
    : `${h12}:${String(m).padStart(2, '0')}${ampm}`
}
