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
