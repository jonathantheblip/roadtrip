import { workerFetch, isWorkerConfigured } from './workerSync'

// Live drive time (minutes) from a GPS position to a destination stop, via the
// worker /drive-eta endpoint (traffic-aware Google Routes, short-cached). The
// worker holds the API key + the cache; the client only shapes the request.
// Returns a finite number, or null (unconfigured worker / offline / bad input /
// error) — callers fall back to the dock's honest schedule readout on null.
export async function fetchDriveEta(origin, destination) {
  if (!isWorkerConfigured()) return null
  if (
    ![origin?.lat, origin?.lng, destination?.lat, destination?.lng].every((n) =>
      Number.isFinite(n)
    )
  ) {
    return null
  }
  try {
    const r = await workerFetch('/drive-eta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
      }),
    })
    if (!r.ok) return null
    const data = await r.json()
    return Number.isFinite(data?.durationMinutes) ? data.durationMinutes : null
  } catch {
    return null
  }
}
