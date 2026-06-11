import { useEffect, useMemo, useRef, useState } from 'react'
import { allStops } from '../data/trips'
import { buildRouteGeometry, projectOntoRoute } from '../lib/routeProgress'
import { useGeolocationPassive } from './useGeolocation'
import { fetchDriveEta } from '../lib/driveEta'

// The device must be within ~3 km of the trip's route line to count as "on the
// trip" — far enough to tolerate the straight-line-vs-road divergence of a real
// drive, tight enough to exclude a family member watching from home 100+ km
// away (they keep the schedule readout, never a wrong ETA).
const OFF_ROUTE_LIMIT_M = 3000
// Recompute the ETA at most once a minute (or when the next stop changes) — a
// moving car would otherwise re-bill Routes every GPS tick.
const ETA_TTL_MS = 60_000

// Local "h:mm" for the ETA clock on the dock readout.
function clock(d) {
  let h = d.getHours() % 12
  if (h === 0) h = 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Live, GPS-derived ETA for the LiveDock readout. Returns { now, next } ONLY
// when THIS device is actually on the trip route (and location was already
// granted — read passively, so the dock never prompts); null otherwise, and the
// dock keeps its honest schedule readout. The ETA is the traffic-aware drive
// time to the stop the device is heading toward, recomputed ≤ once a minute.
export function useLiveEta(trip, enabled) {
  const { position, status } = useGeolocationPassive()
  const geometry = useMemo(
    () => buildRouteGeometry(allStops(trip || { days: [] })),
    [trip?.id]
  )
  const livePos = enabled && status === 'granted' ? position : null
  const projection = useMemo(
    () => projectOntoRoute(livePos, geometry),
    [livePos?.lat, livePos?.lng, geometry]
  )
  const onRoute =
    !!projection && projection.offRouteMeters < OFF_ROUTE_LIMIT_M && !!projection.toStop

  const [eta, setEta] = useState(null) // { stopId, arriveMs }
  const lastRef = useRef({ stopId: null, at: 0 })

  useEffect(() => {
    if (!onRoute) {
      setEta(null)
      return
    }
    const toStop = projection.toStop
    if (lastRef.current.stopId === toStop.id && Date.now() - lastRef.current.at < ETA_TTL_MS) {
      return // throttled — keep the current ETA
    }
    let cancelled = false
    fetchDriveEta(livePos, toStop).then((mins) => {
      if (cancelled || !Number.isFinite(mins)) return
      lastRef.current = { stopId: toStop.id, at: Date.now() }
      setEta({ stopId: toStop.id, arriveMs: Date.now() + mins * 60_000 })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRoute, projection?.toStop?.id, livePos?.lat, livePos?.lng])

  if (!onRoute || !eta || eta.stopId !== projection.toStop?.id) return null
  return {
    now: projection.toStop?.name || '',
    next: `ETA ${clock(new Date(eta.arriveMs))}`,
  }
}
