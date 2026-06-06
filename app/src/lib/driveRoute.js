import { workerFetch, isWorkerConfigured } from './workerSync'

// Real road route for an ordered list of {lat,lng} stops, via the worker
// /route endpoint (Google Routes, content-addressed cache). Returns
// { miles, durationMinutes, points:[{lat,lng}…] } or null. Callers fall back
// to the straight-line geometry on null (unconfigured worker / offline /
// error) — the map and the travel stat degrade gracefully, never block.
export async function fetchRoadRoute(stops) {
  const pts = (Array.isArray(stops) ? stops : [])
    .filter((s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lng))
    .map((s) => ({ lat: s.lat, lng: s.lng }))
  if (pts.length < 2 || !isWorkerConfigured()) return null
  try {
    const r = await workerFetch('/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops: pts }),
    })
    if (!r.ok) return null
    const data = await r.json()
    if (!Array.isArray(data?.points) || data.points.length < 2) return null
    return {
      miles: data.miles,
      durationMinutes: data.durationMinutes,
      points: data.points,
    }
  } catch {
    return null
  }
}
