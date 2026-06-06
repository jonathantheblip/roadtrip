// Leave-when iteration logic, shared by the Worker endpoint and the
// unit tests. Pure function: takes a callRoutes(departureTimeISO)
// callback so tests can mock the network without touching Google.
//
// Background: Routes API doesn't support arrivalTime for DRIVE mode
// (only TRANSIT). So to answer "when should I leave to arrive by X?"
// we iterate on departureTime:
//
//   1. Start with a naive guess: targetArrival - seedDurationMinutes.
//   2. Call Routes with that departureTime + TRAFFIC_AWARE.
//   3. predictedArrival = departureTime + actualDuration.
//   4. If predictedArrival is within ±2 min of target, done.
//   5. Else adjust departureTime by the delta, re-call.
//   6. Cap at maxIterations (default 3) to bound cost.
//
// Typical case converges in 1–2 calls.

const TOLERANCE_MS = 2 * 60 * 1000
const TRAFFIC_NOTE_RATIO = 1.25

export async function iterateLeaveBy({
  targetArrival,
  seedDurationMinutes,
  callRoutes,
  maxIterations = 3,
  now = Date.now(),
}) {
  const targetMs = targetArrival instanceof Date
    ? targetArrival.getTime()
    : new Date(targetArrival).getTime()

  if (!Number.isFinite(targetMs)) {
    throw new Error('Invalid targetArrival')
  }
  if (targetMs <= now) {
    throw new Error('Target arrival is already past')
  }
  if (!Number.isFinite(seedDurationMinutes) || seedDurationMinutes <= 0) {
    throw new Error('seedDurationMinutes must be a positive number')
  }

  let depMs = targetMs - seedDurationMinutes * 60_000
  let durationMinutes = seedDurationMinutes
  let iterations = 0

  for (let i = 0; i < maxIterations; i++) {
    iterations += 1
    // Routes rejects departure times in the past. Snap to now+30s in
    // that edge case (target is close enough that any seed already
    // gets us "leaving immediately").
    if (depMs <= now) depMs = now + 30_000

    const departureISO = new Date(depMs).toISOString()
    const r = await callRoutes(departureISO)
    if (!Number.isFinite(r?.durationMinutes) || r.durationMinutes <= 0) {
      throw new Error('Routes returned no duration')
    }
    durationMinutes = r.durationMinutes

    const predictedMs = depMs + durationMinutes * 60_000
    const deltaMs = predictedMs - targetMs

    if (Math.abs(deltaMs) <= TOLERANCE_MS) break

    // Adjust by the full delta. Overshoots can happen with chaotic
    // traffic but converge by the next iteration in practice.
    depMs -= deltaMs
  }

  const trafficNote =
    durationMinutes > TRAFFIC_NOTE_RATIO * seedDurationMinutes
      ? `Heavier traffic than usual — typical is ~${Math.round(seedDurationMinutes)} min`
      : null

  return {
    leaveByISO: new Date(depMs).toISOString(),
    durationMinutes,
    iterations,
    trafficNote,
  }
}

// Haversine straight-line distance fallback when the caller has no
// seed duration. 30 mph is a reasonable suburban-arterial default.
export function straightLineMinutes(originLat, originLng, destLat, destLng, mph = 30) {
  const toRad = (d) => (d * Math.PI) / 180
  const R = 3959 // miles
  const dLat = toRad(destLat - originLat)
  const dLng = toRad(destLng - originLng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(originLat)) *
      Math.cos(toRad(destLat)) *
      Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const miles = R * c
  return Math.max(1, Math.round((miles / mph) * 60))
}

// Routes API call (DRIVE, TRAFFIC_AWARE). Returns durationMinutes.
// Caller owns error handling — throw on non-2xx so iterateLeaveBy can
// short-circuit.
export async function callRoutesDriveDuration({
  apiKey,
  origin,
  destination,
  departureISO,
  fetchImpl = fetch,
}) {
  const body = {
    origin: {
      location: {
        latLng: { latitude: origin.lat, longitude: origin.lng },
      },
    },
    destination: {
      location: {
        latLng: { latitude: destination.lat, longitude: destination.lng },
      },
    },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    departureTime: departureISO,
  }
  const r = await fetchImpl(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
        'x-goog-fieldmask': 'routes.duration',
      },
      body: JSON.stringify(body),
    }
  )
  if (!r.ok) {
    const detail = await r.text().catch(() => '')
    throw new Error(`Routes ${r.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }
  const data = await r.json()
  const dur = data.routes?.[0]?.duration
  if (!dur || typeof dur !== 'string') {
    throw new Error('Routes returned no duration string')
  }
  const seconds = parseFloat(dur)
  if (!Number.isFinite(seconds)) {
    throw new Error(`Unparseable duration: ${dur}`)
  }
  return { durationMinutes: Math.round(seconds / 60) }
}

// Real road route for an ORDERED list of stops, via Google Routes
// computeRoutes with waypoints. Returns DISTANCE (meters), DURATION
// (minutes), and the decoded road GEOMETRY (points) — one tool that serves
// the family travel stat (distance), the Weave, AND the maps (the polyline
// that replaces today's straight lines). Distance/geometry are traffic-
// INDEPENDENT, so this uses TRAFFIC_UNAWARE — stable (→ cacheable) and
// cheaper than the traffic-aware duration tool. Routes allows ≤25
// intermediates (27 points) per call; longer routes (a whole trip) are
// chunked at a 1-point seam — the seam leg + seam geometry point are counted
// exactly once. `stops` are {lat, lng} (we already hold them — no geocoding
// round-trip, unlike the name-based compute_drive_time tool).
export async function callRoutesDistance({ apiKey, stops, fetchImpl = fetch }) {
  if (!Array.isArray(stops) || stops.length < 2) {
    throw new Error('callRoutesDistance needs at least 2 stops')
  }
  const MAX_POINTS = 27 // origin + 25 intermediates + destination
  let distanceMeters = 0
  let seconds = 0
  const points = []
  for (let start = 0; start < stops.length - 1; start += MAX_POINTS - 1) {
    const chunk = stops.slice(start, start + MAX_POINTS)
    if (chunk.length < 2) break
    const leg = await oneRouteChunk(apiKey, chunk, fetchImpl)
    distanceMeters += leg.meters
    seconds += leg.seconds
    // Stitch the geometry; drop the first point of later chunks (it
    // duplicates the seam stop that ended the previous chunk).
    const fresh = points.length && leg.points.length ? leg.points.slice(1) : leg.points
    for (const p of fresh) points.push(p)
  }
  return { distanceMeters, durationMinutes: Math.round(seconds / 60), points }
}

async function oneRouteChunk(apiKey, chunk, fetchImpl) {
  const pt = (s) => ({ location: { latLng: { latitude: s.lat, longitude: s.lng } } })
  const body = {
    origin: pt(chunk[0]),
    destination: pt(chunk[chunk.length - 1]),
    intermediates: chunk.slice(1, -1).map(pt),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE',
  }
  const r = await fetchImpl('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
      'x-goog-fieldmask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const detail = await r.text().catch(() => '')
    throw new Error(`Routes ${r.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }
  const data = await r.json()
  const route = data.routes?.[0]
  const meters = Number(route?.distanceMeters)
  const seconds = parseFloat(route?.duration)
  if (!Number.isFinite(meters)) throw new Error('Routes returned no distanceMeters')
  return {
    meters,
    seconds: Number.isFinite(seconds) ? seconds : 0,
    points: decodePolyline(route?.polyline?.encodedPolyline),
  }
}

// Decode a Google "encoded polyline" string to [{lat,lng}] (the standard
// algorithm). Returns [] for empty/missing input.
export function decodePolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') return []
  const points = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let b, shift = 0, result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1
    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points
}
