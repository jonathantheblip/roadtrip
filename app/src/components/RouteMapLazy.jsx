import { lazy, Suspense } from 'react'
import './RouteMap.css'

// Slim lazy wrapper. Leaflet is heavy, so RouteMap stays code-split.
// The pre-refactor road-trip chrome (the curated-type ColorKey legend,
// the RouteSvg offline fallback, the rich MapCard bottom-sheet) is left
// behind per the salvage boundary — selection is surfaced inline by the
// parent surface via onStopSelect instead.
const RouteMap = lazy(() =>
  import('./RouteMap').then((m) => ({ default: m.RouteMap }))
)

export function RouteMapLazy({
  mode = 'trip',
  stops,
  activePerson,
  routeLine,
  traveledLine,
  onStopSelect,
  selectedStopId,
  children,
}) {
  return (
    <div className={`route-map-wrap mode-${mode}`}>
      <div className="route-map-inner">
        <Suspense fallback={<div className="route-map-loading">Loading map…</div>}>
          <RouteMap
            mode={mode}
            stops={stops}
            activePerson={activePerson}
            routeLine={routeLine}
            traveledLine={traveledLine}
            onStopSelect={onStopSelect}
            selectedStopId={selectedStopId}
          />
        </Suspense>
        {children}
      </div>
    </div>
  )
}
