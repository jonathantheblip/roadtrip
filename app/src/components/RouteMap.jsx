import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Circle, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PIN_COLORS, TILE_URLS, THEME_TILE } from '../data/route'
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

// Map a trip stop's `kind` (trips.js schema) onto the existing pin
// palette. Curated road-trip stops carry `types[]` instead; both are
// handled below. Anything unrecognized falls back to the active accent —
// never a silent gray pin.
const KIND_COLORS = {
  lodging: PIN_COLORS.poi,
  breakfast: PIN_COLORS.food,
  lunch: PIN_COLORS.food,
  dinner: PIN_COLORS.food,
  snack: PIN_COLORS.food,
  food: PIN_COLORS.food,
  museum: PIN_COLORS.photo,
  art: PIN_COLORS.photo,
  gallery: PIN_COLORS.photo,
  drive: PIN_COLORS.gas,
  travel: PIN_COLORS.gas,
  logistics: PIN_COLORS.gas,
  arrival: PIN_COLORS.gas,
  departure: PIN_COLORS.gas,
}

function pinColor(stop, accent) {
  if (stop.name?.toLowerCase().includes('buc-ee')) return '#fdd835'
  // Curated stops: types[] against the original palette.
  if (Array.isArray(stop.types)) {
    for (const t of ['viral', 'energy', 'food', 'photo', 'poi', 'gas']) {
      if (stop.types.includes(t)) return PIN_COLORS[t]
    }
  }
  // Trip stops: single `kind` string.
  if (stop.kind && KIND_COLORS[stop.kind]) return KIND_COLORS[stop.kind]
  return accent
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
      // No coords to frame — leave the current view rather than snap to a
      // hardcoded route (the old ROUTE_WAYPOINTS fallback was Jackson-only).
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
  const centeredRef = useRef(false)

  useEffect(() => {
    if (!position) return
    // First location fix: move the map to the user. FitBounds framed the ROUTE on
    // mount, so without this the dot just appears off in the corner and the map
    // never goes to it (Jonathan: "the dot shows up but the map doesn't move to
    // where the dot is"). Pan once, gently, keeping a sensible zoom; the manual
    // recenter button still re-snaps on demand. Runs once — FitBounds ignores the
    // position, so there's no fight/loop.
    if (!centeredRef.current) {
      centeredRef.current = true
      map.flyTo([position.lat, position.lng], Math.max(map.getZoom(), 11), { duration: 0.5 })
    }
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

export function RouteMap({
  mode,
  stops,
  activePerson,
  onStopSelect,
  selectedStopId,
  routeLine = [],
  traveledLine = [],
}) {
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

  // Initial center derived from the route/stops (FitBounds adjusts on
  // mount). US centroid as a last resort — never the Jackson hardcode.
  const center = useMemo(() => {
    const pts = routeLine.length ? routeLine : validStops.map((s) => [s.lat, s.lng])
    if (!pts.length) return [39.5, -98.35]
    const lat = pts.reduce((a, p) => a + p[0], 0) / pts.length
    const lng = pts.reduce((a, p) => a + p[1], 0) / pts.length
    return [lat, lng]
  }, [routeLine, validStops])

  const headphoneIcon = useMemo(() => podcastIcon(accent), [accent])

  return (
    <MapContainer
      center={center}
      zoom={5}
      scrollWheelZoom={!mobile}
      zoomControl={!mobile}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url={tileUrl}
      />
      {routeLine.length >= 2 && (
        <Polyline
          positions={routeLine}
          pathOptions={{ color: accent, weight: 3, opacity: 0.35 }}
        />
      )}
      {traveledLine.length >= 2 && (
        <Polyline
          positions={traveledLine}
          pathOptions={{ color: accent, weight: 4, opacity: 0.9 }}
        />
      )}
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
        const color = pinColor(stop, accent)
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
