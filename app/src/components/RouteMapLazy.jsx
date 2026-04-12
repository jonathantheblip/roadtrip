import { lazy, Suspense, useState } from 'react'
import { MapCard } from './MapCard'
import './RouteMap.css'

const RouteMap = lazy(() =>
  import('./RouteMap').then((m) => ({ default: m.RouteMap }))
)

export function RouteMapLazy({ mode, stops, activePerson, children }) {
  const [selectedStop, setSelectedStop] = useState(null)

  return (
    <div className={`route-map-wrap mode-${mode}`}>
      <Suspense
        fallback={<div className="route-map-loading">Loading map…</div>}
      >
        <RouteMap
          mode={mode}
          stops={stops}
          activePerson={activePerson}
          onStopSelect={setSelectedStop}
          selectedStopId={selectedStop?.id}
        />
      </Suspense>
      {children}
      <MapCard
        stop={selectedStop}
        activePerson={activePerson}
        onDismiss={() => setSelectedStop(null)}
        mode={mode}
      />
    </div>
  )
}
