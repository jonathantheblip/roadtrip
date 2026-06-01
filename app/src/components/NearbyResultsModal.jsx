import { useEffect, useState } from 'react'
import { MapPin, Phone, Navigation, X, RotateCw, AlertCircle } from 'lucide-react'
import { TRAVELERS } from '../data/travelers'
import { searchNearby, formatDistance } from '../lib/placesNearby'

// "Where's the nearest one?" modal.
//
// Given a category (Bathroom / Fast food / Outside / Emergency), hits
// the Worker's /places/nearby endpoint and shows the top results
// distance-ranked. Geolocation is the preferred origin; the trip's
// home base is the fallback when geolocation is denied or unavailable.
//
// "Search wider" doubles the radius up to 50km — for empty results in
// dense outdoor cases (e.g. Outside at a stadium with no parks nearby).
//
// Emergency stays explicit about the ambiguity (hospital vs urgent
// care vs pharmacy) — see the QUEUE_CATEGORIES note for that label.

const DEFAULT_RADIUS_METERS = 1500
const MAX_RADIUS_METERS = 50000
const LIMIT = 5

export function NearbyResultsModal({
  category,
  homeBase,
  traveler,
  onClose,
}) {
  const [originMode, setOriginMode] = useState('here') // 'here' | 'home'
  const [hereCoords, setHereCoords] = useState(null)
  const [geoError, setGeoError] = useState(null)
  const [radius, setRadius] = useState(DEFAULT_RADIUS_METERS)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [refreshCounter, setRefreshCounter] = useState(0)

  // Geolocation request when the modal opens (or when the user toggles
  // back to "here" after a denial). If the browser denies or times out,
  // fall through to home base silently — the modal still works.
  useEffect(() => {
    if (originMode !== 'here' || hereCoords) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Location not available — using home base.')
      setOriginMode('home')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHereCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoError(null)
      },
      () => {
        setGeoError('Location denied — using home base.')
        setOriginMode('home')
      },
      { timeout: 8000, maximumAge: 60_000 }
    )
  }, [originMode, hereCoords])

  const effectiveOrigin =
    originMode === 'here' && hereCoords ? hereCoords : homeBase

  useEffect(() => {
    if (!effectiveOrigin) return
    let cancelled = false
    setLoading(true)
    setError(null)
    searchNearby({
      query: category.query,
      location: effectiveOrigin,
      radius,
      limit: LIMIT,
    })
      .then((r) => {
        if (!cancelled) setData(r)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message || 'Search failed.')
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [category.query, effectiveOrigin, radius, refreshCounter])

  function widenSearch() {
    // Double the radius, capped at the worker's max. If we're already
    // at the cap, force a refresh in case a transient API hiccup
    // hid results on the first call.
    setRadius((r) => {
      const next = Math.min(r * 2, MAX_RADIUS_METERS)
      if (next === r) setRefreshCounter((c) => c + 1)
      return next
    })
  }

  const results = data?.results || []

  return (
    <div
      role="dialog"
      aria-label={`${category.label} — nearby search`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'color-mix(in srgb, var(--bg, #000) 70%, transparent)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'var(--bg)',
          color: 'var(--text)',
          width: '100%',
          maxWidth: 480,
          maxHeight: '92vh',
          overflowY: 'auto',
          borderRadius: '16px 16px 0 0',
          padding: '22px 22px 30px',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.32)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              opacity: 0.6,
            }}
          >
            Nearest · {category.label}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 0,
              padding: 4,
              cursor: 'pointer',
              color: 'var(--muted)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {category.note && (
          <p
            style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontStyle: 'italic',
              fontSize: 13.5,
              color: 'var(--muted)',
              marginTop: 0,
              marginBottom: 14,
              lineHeight: 1.4,
            }}
          >
            {category.note}
          </p>
        )}

        <OriginRow
          mode={originMode}
          onSetMode={setOriginMode}
          homeLabel={homeBase?.label || 'Home base'}
          geoError={geoError}
          loadingHere={originMode === 'here' && !hereCoords && !geoError}
        />

        {!effectiveOrigin && (
          <Empty text="No origin available — give the app location permission, or set the trip's home base." />
        )}

        {effectiveOrigin && loading && !data && <Skeleton />}

        {effectiveOrigin && error && (
          <div
            style={{
              marginTop: 16,
              padding: '10px 12px',
              border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
              borderRadius: 8,
              color: 'var(--accent-text)',
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 14,
              fontStyle: 'italic',
            }}
          >
            {error}
          </div>
        )}

        {effectiveOrigin && !error && data && results.length === 0 && (
          <Empty text={`No ${category.label.toLowerCase()} within ${formatRadius(radius)}.`} />
        )}

        {effectiveOrigin && results.length > 0 && (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '14px 0 0',
              display: 'flex',
              flexDirection: 'column',
              gap: 0,
            }}
          >
            {results.map((r) => (
              <ResultRow key={r.placeId || `${r.lat},${r.lng}`} result={r} traveler={traveler} />
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-pill"
            onClick={widenSearch}
            disabled={loading || radius >= MAX_RADIUS_METERS}
            style={{ cursor: radius >= MAX_RADIUS_METERS ? 'default' : 'pointer' }}
            title={`Currently ${formatRadius(radius)} — tap to double.`}
          >
            <RotateCw size={12} />
            Search wider ({formatRadius(radius)})
          </button>
        </div>
      </div>
    </div>
  )
}

function OriginRow({ mode, onSetMode, homeLabel, geoError, loadingHere }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <Pill
          active={mode === 'here'}
          onClick={() => onSetMode('here')}
          icon={<Navigation size={11} />}
          label="From here"
        />
        <Pill
          active={mode === 'home'}
          onClick={() => onSetMode('home')}
          label={homeLabel}
        />
      </div>
      {geoError && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: 'var(--muted)',
            fontStyle: 'italic',
          }}
        >
          {geoError}
        </div>
      )}
      {loadingHere && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: 'var(--muted)',
            fontStyle: 'italic',
          }}
        >
          Locating…
        </div>
      )}
    </div>
  )
}

function Pill({ active, onClick, label, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '7px 12px',
        borderRadius: 14,
        border: '1px solid',
        borderColor: active ? 'var(--text)' : 'var(--border)',
        background: active ? 'var(--text)' : 'transparent',
        color: active ? 'var(--bg)' : 'inherit',
        cursor: 'pointer',
        fontFamily: 'Inter Tight, system-ui, sans-serif',
        fontSize: 12,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        maxWidth: 220,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

function ResultRow({ result, traveler }) {
  const mapsUrl = mapsLinkFor(result, traveler)
  const telHref = result.phone ? `tel:${String(result.phone).replace(/[^\d+]/g, '')}` : null
  const openLabel = TRAVELERS[traveler]?.maps === 'waze' ? 'Waze' : 'Maps'
  return (
    <li
      style={{
        borderTop: '1px solid var(--border)',
        padding: '14px 0',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.2,
            color: 'var(--text)',
          }}
        >
          {result.name}
        </div>
        {result.address && (
          <div
            style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 12.5,
              color: 'var(--muted)',
              marginTop: 2,
              lineHeight: 1.35,
            }}
          >
            {result.address}
          </div>
        )}
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          <span>{formatDistance(result.distanceMeters)}</span>
          {result.openNow === false && (
            <span style={{ color: 'var(--accent-text)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <AlertCircle size={10} /> Closed now
            </span>
          )}
          {result.openNow === true && (
            <span style={{ color: 'var(--accent-text)', opacity: 0.85 }}>Open</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        {mapsUrl && (
          <a className="btn-pill" href={mapsUrl} target="_blank" rel="noreferrer">
            <MapPin size={12} />
            {openLabel}
          </a>
        )}
        {telHref && (
          <a className="btn-pill" href={telHref}>
            <Phone size={12} />
            Call
          </a>
        )}
      </div>
    </li>
  )
}

function Skeleton() {
  return (
    <div
      style={{
        marginTop: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 56,
            background:
              'linear-gradient(90deg, var(--border) 0%, color-mix(in srgb, var(--border) 50%, transparent) 50%, var(--border) 100%)',
            backgroundSize: '200% 100%',
            borderRadius: 6,
            animation: 'pulseShimmer 1.4s ease-in-out infinite',
            opacity: 0.7,
          }}
        />
      ))}
    </div>
  )
}

function Empty({ text }) {
  return (
    <div
      style={{
        marginTop: 14,
        padding: '14px 12px',
        border: '1px dashed var(--border)',
        borderRadius: 8,
        fontFamily: 'Fraunces, Georgia, serif',
        fontStyle: 'italic',
        fontSize: 14,
        color: 'var(--muted)',
        textAlign: 'center',
      }}
    >
      {text}
    </div>
  )
}

function mapsLinkFor(result, traveler) {
  if (TRAVELERS[traveler]?.maps === 'waze') {
    return `https://waze.com/ul?ll=${result.lat},${result.lng}&navigate=yes`
  }
  return `https://maps.apple.com/?q=${encodeURIComponent(result.name)}&ll=${result.lat},${result.lng}`
}

function formatRadius(meters) {
  const miles = meters / 1609.344
  if (miles < 1) return `${(miles * 5280).toFixed(0)} ft`
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`
}
