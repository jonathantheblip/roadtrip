import { useEffect, useMemo, useState } from 'react'
import { allStops } from '../data/trips'
import { useGeolocation } from '../hooks/useGeolocation'
import { useVisited } from '../hooks/useVisited'
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

  const { position, status } = useGeolocation()
  const { visited, markVisited } = useVisited(trip?.id)
  const [selectedStopId, setSelectedStopId] = useState(null)

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

  // Where next: first unvisited stop in trip order.
  const nextStop = useMemo(
    () => stops.find((s) => !visited.includes(s.id)) || null,
    [stops, visited]
  )
  // What we've done: count only ids that belong to THIS trip's stops.
  const visitedCount = useMemo(
    () => stops.filter((s) => visited.includes(s.id)).length,
    [stops, visited]
  )

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
              <>
                <strong className="mapview-next-name">{nextStop.name}</strong>
                <button
                  type="button"
                  className="mapview-visit"
                  onClick={() => markVisited(nextStop.id)}
                >
                  Mark visited →
                </button>
              </>
            ) : (
              <strong className="mapview-next-name">All stops visited</strong>
            )}
          </div>
          <div className="mapview-cell mapview-done">
            <span className="mapview-label">Done</span>
            <strong>
              {visitedCount}<span className="mapview-muted">/{stops.length}</span>
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
            {!hasRoute
              ? 'No route to track yet'
              : live
                ? "You're not on the route right now"
                : 'Live progress needs location'}
          </div>
        )}
      </div>
    </div>
  )
}
