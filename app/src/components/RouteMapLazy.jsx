import { lazy, Suspense, useState } from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { PIN_COLORS } from '../data/route'
import { RouteSvg } from './RouteSvg'
import { MapCard } from './MapCard'
import './RouteMap.css'

const RouteMap = lazy(() =>
  import('./RouteMap').then((m) => ({ default: m.RouteMap }))
)

const KEY_LABELS = {
  food: 'Food',
  energy: 'Energy',
  photo: 'Photo',
  poi: 'POI',
  gas: "Buc-ee's",
  viral: 'Viral',
}

const KEY_ORDER = ['food', 'energy', 'photo', 'poi', 'gas', 'viral']

function ColorKey() {
  return (
    <div className="map-color-key">
      {KEY_ORDER.map((k) => (
        <span key={k} className="map-key-item">
          <span className="map-key-dot" style={{ background: PIN_COLORS[k] }} />
          {KEY_LABELS[k]}
        </span>
      ))}
    </div>
  )
}

export function RouteMapLazy({ mode, stops, activePerson, children }) {
  const [selectedStop, setSelectedStop] = useState(null)
  const { isOnline } = useOnlineStatus()

  return (
    <div className={`route-map-wrap mode-${mode}`}>
      <ColorKey />
      {isOnline ? (
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
      ) : (
        <RouteSvg
          stops={stops}
          onStopSelect={setSelectedStop}
          selectedStopId={selectedStop?.id}
        />
      )}
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
