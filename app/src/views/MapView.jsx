import { useEffect, useMemo, useState } from 'react'
import { allStops } from '../data/trips'
import { useGeolocation } from '../hooks/useGeolocation'
import { useNowTick } from '../hooks/useNowTick'
import { selectScheduleNowNext } from '../lib/liveDock'
import {
  buildRouteGeometry,
  projectOntoRoute,
  traveledPolyline,
} from '../lib/routeProgress'
import { fetchRoadRoute } from '../lib/driveRoute'
import { RouteMapLazy } from '../components/RouteMapLazy'
import './MapView.css'

// The device must be within ~3 km of the route line to count as "on the trip"
// before we show a live position + progress % as fact. Same threshold as the
// LiveDock ETA (useLiveEta): loose enough for straight-line-vs-road divergence
// on a real drive, tight enough to exclude a family member watching from home
// (who would otherwise be projected onto the nearest segment and shown a
// fabricated "this drive 73%" / trip bar as if they were driving it).
const OFF_ROUTE_LIMIT_M = 3000

// Generalized live map. Works for ANY trip: route line, pins, and framing
// all come from the active trip's stops (allStops flattens days + adds
// .day). Straight-line live progress per the decided scope — directionally
// right, not road-accurate. Themed to the active traveler via the existing
// activePerson-keyed tile/accent in RouteMap.
export function MapView({ trip, traveler = 'everyone', onBack }) {
  const stops = useMemo(() => allStops(trip), [trip])
  const geometry = useMemo(() => buildRouteGeometry(stops), [stops])

  // Real road route (Google Routes via the worker /route, async + cached).
  // The drawn route + traveled overlay upgrade from straight-line to real
  // roads when it resolves; everything falls back to `geometry` until then /
  // when the worker is unconfigured or offline.
  const [road, setRoad] = useState(null)
  useEffect(() => {
    let cancelled = false
    setRoad(null)
    fetchRoadRoute(stops).then((r) => {
      if (!cancelled) setRoad(r)
    })
    return () => {
      cancelled = true
    }
  }, [stops])

  const routeLine = useMemo(
    () =>
      road?.points?.length
        ? road.points.map((p) => [p.lat, p.lng])
        : geometry.waypoints.map((w) => [w.lat, w.lng]),
    [road, geometry]
  )

  const { position, status, request: requestLocation } = useGeolocation()
  const [selectedStopId, setSelectedStopId] = useState(null)
  // The wall clock, ticking — so "up next" / "done" advance through the day on
  // their own instead of being frozen to a manual checkbox nobody taps.
  const now = useNowTick()
  const schedule = useMemo(() => selectScheduleNowNext(trip, now), [trip, now])

  const projection = useMemo(
    () => projectOntoRoute(position, geometry),
    [position, geometry]
  )
  const traveled = useMemo(() => {
    // Only draw a traveled portion when the device is actually ON the route —
    // off-route the projection point is fabricated (nearest-segment snap of a
    // viewer at home), so drawing from it would paint a fake "you've driven
    // this far" line. Off-route / no fix → no traveled overlay.
    const onRouteHere =
      !!projection &&
      Number.isFinite(projection.offRouteMeters) &&
      projection.offRouteMeters < OFF_ROUTE_LIMIT_M
    if (!onRouteHere) return []
    // With a real road line, draw the traveled portion ALONG it — its extent
    // set by the stop-based trip fraction, so it stays on the road instead of
    // cutting straight across. Falls back to the straight-line traveled poly.
    if (road?.points?.length) {
      const n = Math.max(
        0,
        Math.min(road.points.length, Math.round((projection.tripFraction || 0) * road.points.length))
      )
      return road.points.slice(0, n).map((p) => [p.lat, p.lng])
    }
    return traveledPolyline(geometry, projection)
  }, [road, geometry, projection])

  // Where next — truthful precedence: where GPS says we're actually heading
  // (on-route) → the schedule's next stop by the clock → and only as a last
  // resort the trip's first stop. The old "first stop nobody tapped 'visited'
  // on" pinned to day 1 for the whole trip.
  const nextStop = useMemo(() => {
    const onRouteHere =
      !!projection &&
      Number.isFinite(projection.offRouteMeters) &&
      projection.offRouteMeters < OFF_ROUTE_LIMIT_M
    if (onRouteHere && projection.toStop) return projection.toStop
    if (schedule.nextStop) {
      return stops.find((s) => s.id === schedule.nextStop.id) || schedule.nextStop
    }
    // Schedule exists but nothing's ahead → the trip is done (null). No schedule
    // at all (a timeless trip, no GPS) → fall back to the first stop.
    if (schedule.totalCount > 0) return null
    return stops[0] || null
  }, [projection, schedule, stops])
  // What's done: stops whose scheduled time has already passed — clock-based and
  // auto-advancing, not a manual tally.
  const doneCount = schedule.passedCount

  const hasRoute = geometry.waypoints.length >= 2 && geometry.totalMeters > 0
  const live = status === 'granted' && !!position
  // On-route = the device is actually near the route line. Only then are the
  // live position + progress % honest; off-route (e.g. watching from home) we
  // refuse to fabricate a position/percentage. Mirrors useLiveEta's gate.
  const onRoute =
    !!projection &&
    Number.isFinite(projection.offRouteMeters) &&
    projection.offRouteMeters < OFF_ROUTE_LIMIT_M
  const tripPct = hasRoute && onRoute ? Math.round(projection.tripFraction * 100) : null
  const legPct = onRoute ? Math.round(projection.legFraction * 100) : null

  const selectedStop = selectedStopId
    ? stops.find((s) => s.id === selectedStopId) || null
    : null

  const statusLabel =
    live && onRoute ? 'Live'
    : live ? 'Off route'
    : status === 'denied' ? 'Location off'
    : status === 'unavailable' ? 'Location unavailable'
    : 'Locating…'

  return (
    <div className="mapview" data-mode="trip">
      <button
        type="button"
        className="mapview-back"
        onClick={onBack}
        aria-label="Back to trip"
      >
        ← Back
      </button>

      <div className="mapview-map">
        <RouteMapLazy
          stops={stops}
          activePerson={traveler}
          routeLine={routeLine}
          traveledLine={traveled}
          onStopSelect={(s) => setSelectedStopId(s.id)}
          selectedStopId={selectedStopId}
        />
      </div>

      <div className="mapview-panel">
        {/* Where we are */}
        <div className="mapview-status">
          <span className={`mapview-dot ${live && onRoute ? 'on' : 'off'}`} />
          {statusLabel}
          {road?.miles ? (
            <span className="mapview-sel" data-testid="map-road-miles"> · {Math.round(road.miles)} mi by road</span>
          ) : null}
          {selectedStop && <span className="mapview-sel"> · {selectedStop.name}</span>}
        </div>

        {/* Where next + what we've done */}
        <div className="mapview-row">
          <div className="mapview-cell">
            <span className="mapview-label">Up next</span>
            {nextStop ? (
              <strong className="mapview-next-name">{nextStop.name}</strong>
            ) : (
              <strong className="mapview-next-name">Trip complete</strong>
            )}
          </div>
          <div className="mapview-cell mapview-done">
            <span className="mapview-label">Done</span>
            <strong>
              {doneCount}<span className="mapview-muted">/{stops.length}</span>
            </strong>
          </div>
        </div>

        {/* % of this drive + % of whole trip — only when ON the route, so a
            viewer at home never sees a fabricated live position/percentage. */}
        {live && onRoute && projection ? (
          <div className="mapview-progress">
            <div className="mapview-cell">
              <span className="mapview-label">This drive</span>
              <strong>{legPct}%</strong>
              {projection.fromStop && projection.toStop && (
                <span className="mapview-leg-ends">
                  {projection.fromStop.name} → {projection.toStop.name}
                </span>
              )}
            </div>
            {tripPct != null && (
              <div className="mapview-cell mapview-trip">
                <span className="mapview-label">Trip · {tripPct}%</span>
                <div className="mapview-bar">
                  <div className="mapview-bar-fill" style={{ width: `${tripPct}%` }} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mapview-progress-muted">
            {!hasRoute ? (
              'No route to track yet'
            ) : live ? (
              // Granted but off the route — a family member following from home,
              // not a failure. Don't scold them about not being on the route.
              'Following along from here'
            ) : status === 'denied' ? (
              'Location is off — turn it on in your settings to follow the drive live.'
            ) : status === 'unavailable' ? (
              'Live location isn’t available on this device.'
            ) : (
              <>
                Turn on location to follow the drive live.{' '}
                <button type="button" className="mapview-visit" onClick={requestLocation}>
                  Turn on location
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
