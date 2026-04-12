import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ROUTE_WAYPOINTS, PIN_COLORS, TILE_URLS, THEME_TILE } from '../data/route'
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

export function RouteMap({ mode, stops, activePerson, onStopSelect, selectedStopId }) {
  const tileStyle = THEME_TILE[activePerson] || 'light'
  const tileUrl = TILE_URLS[tileStyle]
  const accent = ACCENT_COLORS[activePerson] || '#6b8f8f'
  const mobile = useMemo(() => isMobile(), [])

  const validStops = useMemo(
    () => stops.filter((s) => s.lat != null && s.lng != null),
    [stops]
  )

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
    </MapContainer>
  )
}
