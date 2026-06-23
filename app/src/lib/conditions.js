// "Real conditions" (slice 7) — the thin client seam to the worker's /conditions
// proxy (Open-Meteo weather + tide). The TESTABLE logic — the tray re-rank — lives
// in lib/weCould.js (rankByConditions, pure + node-tested); this file is just the
// fetch + a small hook, so it carries React/workerSync and isn't unit-tested here.
//
// Best-effort + honest: a null result means "no conditions" and the tray simply
// doesn't re-rank (no fabricated weather, no banner).

import { useEffect, useState } from 'react'
import { workerFetch, isWorkerConfigured } from './workerSync'

export async function fetchConditions(coords) {
  if (!isWorkerConfigured() || !coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
    return null
  }
  try {
    const r = await workerFetch('/conditions', {
      method: 'POST',
      body: JSON.stringify({ lat: coords.lat, lng: coords.lng }),
    })
    const data = await r.json()
    // Only surface a payload that actually carries something to show.
    return data && (data.weather || data.tide) ? data : null
  } catch {
    return null
  }
}

// useConditions(coords) → the conditions object (or null). Re-fetches when the
// place changes. The worker caches ~30 min, so a tab re-open is cheap.
export function useConditions(coords) {
  const [conditions, setConditions] = useState(null)
  const lat = coords?.lat
  const lng = coords?.lng
  useEffect(() => {
    // Clear the previous place's data IMMEDIATELY on any change, so a trip switch
    // never shows place A's weather/tide under place B's name while B's fetch runs.
    setConditions(null)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
    let alive = true
    fetchConditions({ lat, lng }).then((c) => {
      if (alive) setConditions(c)
    })
    return () => {
      alive = false
    }
  }, [lat, lng])
  return conditions
}

// Plain-language tide line for the conditions strip, or null. e.g. "High tide ~3:45 PM".
// `at` is the place's LOCAL time string from the worker (already in the right zone).
export function tideLine(tide) {
  if (!tide || !tide.next || !tide.next.at) return null
  const t = new Date(tide.next.at)
  const time = Number.isNaN(t.getTime())
    ? null
    : t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const word = tide.next.type === 'high' ? 'High tide' : 'Low tide'
  return time ? `${word} ~${time}` : word
}
