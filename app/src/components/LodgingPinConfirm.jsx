import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { TILE_URLS } from '../data/route'

// Confirm-the-pin map for a geocoded LODGING address (Phase 2). A wrong
// geocode would silently mis-place the whole stay — the geofence ("At [place]")
// AND no-GPS photo filing both read this point — so the family gets to SEE
// where it landed and drag it if it's off. Lazy-loaded by TripEditor (leaflet
// is heavy; only pulled in when a trip has a located lodging).
//
// Uses a divIcon (HTML pin) rather than Leaflet's default marker image, which
// 404s under the bundler — the same approach RouteMap.jsx takes.
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:28px;line-height:1">📍</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28], // tip of the pin sits on the point
})

export default function LodgingPinConfirm({ lat, lng, onMove }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const center = [lat, lng]
  return (
    <div
      style={{ height: 170, borderRadius: 8, overflow: 'hidden', marginTop: 6, border: '1px solid var(--border)' }}
      role="img"
      aria-label="Map showing where the lodging address was located"
    >
      <MapContainer
        center={center}
        zoom={14}
        scrollWheelZoom={false}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url={TILE_URLS.light}
        />
        <Marker
          position={center}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const m = e.target.getLatLng()
              if (Number.isFinite(m.lat) && Number.isFinite(m.lng)) {
                onMove({ lat: m.lat, lng: m.lng })
              }
            },
          }}
        />
      </MapContainer>
    </div>
  )
}
