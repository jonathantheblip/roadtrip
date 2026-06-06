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
    // With a real road line, draw the traveled portion ALONG it — its extent
    // set by the stop-based trip fraction, so it stays on the road instead of
    // cutting straight across. Falls back to the straight-line traveled poly.
    if (road?.points?.length && projection) {
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
  const tripPct = hasRoute && projection ? Math.round(projection.tripFraction * 100) : null
  const legPct = projection ? Math.round(projection.legFraction * 100) : null

  const selectedStop = selectedStopId
    ? stops.find((s) => s.id === selectedStopId) || null
    : null

  const statusLabel =
    live ? 'Live'
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
          <span className={`mapview-dot ${live ? 'on' : 'off'}`} />
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

        {/* % of this drive + % of whole trip (live only) */}
        {live && projection ? (
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
            {hasRoute ? 'Live progress needs location' : 'No route to track yet'}
          </div>
        )}
      </div>
    </div>
  )
}
