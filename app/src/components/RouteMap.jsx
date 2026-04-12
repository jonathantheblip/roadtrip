import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Circle, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ROUTE_WAYPOINTS, PIN_COLORS, TILE_URLS, THEME_TILE } from '../data/route'
import { useGeolocation } from '../hooks/useGeolocation'
import './RouteMap.css'

const ACCENT_COLORS = {
  jonathan: '#fdd835',
  helen: '#6b8f8f',
  aurelia: '#c2185b',
  rafa: '#d32f2f',
  everyone: '#6b8f8f',
}

function isMobile() {
  return window.matchMedia('(pointer: coarse)').matches
}

function pinColor(stop) {
  if (stop.name?.toLowerCase().includes('buc-ee')) return '#fdd835'
  for (const t of ['viral', 'energy', 'food', 'photo', 'poi', 'gas']) {
    if (stop.types?.includes(t)) return PIN_COLORS[t]
  }
  return '#6b7280'
}

function FitBounds({ stops, selectedId }) {
  const map = useMap()
  const prevStopsLen = useRef(stops.length)

  useEffect(() => {
    if (selectedId) {
      const s = stops.find((s) => s.id === selectedId)
      if (s) map.flyTo([s.lat, s.lng], Math.max(map.getZoom(), 10), { duration: 0.5 })
      return
    }
    if (stops.length === 0) {
      map.fitBounds(ROUTE_WAYPOINTS.map((w) => [w[0], w[1]]), { padding: [30, 30] })
      return
    }
    const bounds = L.latLngBounds(stops.map((s) => [s.lat, s.lng]))
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
    }
    prevStopsLen.current = stops.length
  }, [stops, selectedId, map])

  return null
}

const liveDotIcon = L.divIcon({
  className: '',
  html: '<div class="live-dot"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

function LiveDot({ position, onOffScreen }) {
  const map = useMap()

  useEffect(() => {
    if (!position) return
    const check = () => {
      const bounds = map.getBounds()
      const inside = bounds.contains([position.lat, position.lng])
      onOffScreen(!inside)
    }
    check()
    map.on('moveend zoomend', check)
    return () => map.off('moveend zoomend', check)
  }, [position, map, onOffScreen])

  if (!position) return null
  return (
    <>
      {position.accuracy > 500 && (
        <Circle
          center={[position.lat, position.lng]}
          radius={position.accuracy}
          pathOptions={{
            color: '#1976d2',
            weight: 1,
            opacity: 0.4,
            fillColor: '#1976d2',
            fillOpacity: 0.1,
          }}
        />
      )}
      <Marker position={[position.lat, position.lng]} icon={liveDotIcon} interactive={false} />
    </>
  )
}

function RecenterControl({ position, onDone }) {
  const map = useMap()
  const handle = useCallback(() => {
    if (!position) return
    map.flyTo([position.lat, position.lng], Math.max(map.getZoom(), 11), { duration: 0.5 })
    onDone?.()
  }, [position, map, onDone])
  return (
    <button
      type="button"
      className="recenter-btn"
      onClick={handle}
      aria-label="Recenter on my location"
      title="Recenter"
    >
      ◉
    </button>
  )
}

function podcastIcon(accent) {
  return L.divIcon({
    className: '',
    html: `<div class="podcast-pin" style="border-color:${accent}">🎧</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

export function RouteMap({ mode, stops, activePerson, onStopSelect, selectedStopId }) {
  const tileStyle = THEME_TILE[activePerson] || 'light'
  const tileUrl = TILE_URLS[tileStyle]
  const accent = ACCENT_COLORS[activePerson] || '#6b8f8f'
  const mobile = useMemo(() => isMobile(), [])
  const isMedia = mode === 'media'
  const { position, status } = useGeolocation()
  const [offScreen, setOffScreen] = useState(false)

  const validStops = useMemo(
    () => stops.filter((s) => s.lat != null && s.lng != null),
    [stops]
  )

  const headphoneIcon = useMemo(() => podcastIcon(accent), [accent])

  return (
    <MapContainer
      center={[36.5, -84]}
      zoom={5}
      scrollWheelZoom={!mobile}
      zoomControl={!mobile}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url={tileUrl}
      />
      <Polyline
        positions={ROUTE_WAYPOINTS}
        pathOptions={{ color: accent, weight: 3, opacity: 0.7 }}
      />
      <FitBounds stops={validStops} selectedId={selectedStopId} />
      {validStops.map((stop) => {
        if (isMedia) {
          return (
            <Marker
              key={stop.id}
              position={[stop.lat, stop.lng]}
              icon={headphoneIcon}
              eventHandlers={{
                click: () => onStopSelect?.(stop),
              }}
            />
          )
        }
        const color = pinColor(stop)
        const isBucees = stop.name?.toLowerCase().includes('buc-ee')
        const isSelected = stop.id === selectedStopId
        const r = isBucees ? 9 : stop.star ? 8 : 6
        const activeR = isSelected ? 10 : r
        return (
          <CircleMarker
            key={stop.id}
            center={[stop.lat, stop.lng]}
            radius={activeR}
            pathOptions={{
              fillColor: color,
              fillOpacity: 1,
              color: stop.star ? color : 'rgba(0,0,0,0.3)',
              weight: stop.star ? 3 : 1,
              opacity: stop.star ? 0.5 : 0.6,
            }}
            eventHandlers={{
              click: () => onStopSelect?.(stop),
            }}
          />
        )
      })}
      <LiveDot position={position} onOffScreen={setOffScreen} />
      {position && offScreen && (
        <RecenterControl position={position} onDone={() => setOffScreen(false)} />
      )}
      {status === 'denied' && (
        <a
          href="https://support.apple.com/guide/iphone/control-which-apps-can-access-your-location-iph3dd5f9be/ios"
          target="_blank"
          rel="noopener"
          className="location-muted"
        >
          Location off — tap to enable
        </a>
      )}
      {status === 'unavailable' && !position && (
        <span className="location-muted">Location unavailable</span>
      )}
    </MapContainer>
  )
}
