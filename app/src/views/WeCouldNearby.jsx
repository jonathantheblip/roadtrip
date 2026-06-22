import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, Star, X, Footprints, Car } from 'lucide-react'
import { isStayTrip, stayPlaceCoords, stayLabel } from '../lib/tripShape'
import { searchNearby, formatDistance } from '../lib/placesNearby'
import { TRAVELERS } from '../data/travelers'
import {
  WE_COULD_CATEGORIES,
  buildTray,
  estimateTravel,
  applyCuration,
  loadCuration,
  saveCuration,
  togglePinned,
  toggleHidden,
} from '../lib/weCould'

// WeCouldNearby — the never-empty "We could…" tray for a STAY home.
//
// FAMILY_TRIPS_VISION §2/§3: on a stay the home leads with possibility. When
// the trip has no curated "things to do" (a brand-new trip), this surfaces a
// handful of nearby ideas from the place's coordinates so the tab is never
// blank. Each person curates their own device's tray (keep / hide).
//
// G5: renders ONLY on a stay that has coordinates — route trips and
// coordinate-less stays get nothing (byte-identical to before). All network
// failure modes degrade quietly; the tray never shows a broken state.
//
// Reuses the existing Worker /places/nearby proxy (Google key server-side)
// via searchNearby. Results are cached in-memory per trip so navigating away
// and back doesn't re-pay for the Places calls within a session.

const trayCache = new Map() // key -> built tray (session lifetime)

function cacheKey(tripId, coords) {
  return `${tripId || '?'}@${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}`
}

async function fetchTray(coords) {
  const settled = await Promise.allSettled(
    WE_COULD_CATEGORIES.map((category) =>
      searchNearby({ query: category.query, location: coords, radius: 10000, limit: 5 })
        .then((res) => ({ category, results: Array.isArray(res?.results) ? res.results : [] })),
    ),
  )
  // If EVERY category call rejected, treat it as a real error (offline / key
  // missing) rather than "nothing nearby". A single success → we have a tray.
  const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value)
  if (ok.length === 0) throw new Error('all nearby queries failed')
  return buildTray(ok)
}

function mapsHref(card, travelerId) {
  if (!Number.isFinite(card?.lat) || !Number.isFinite(card?.lng)) return null
  if (TRAVELERS[travelerId]?.maps === 'waze') {
    return `https://waze.com/ul?ll=${card.lat},${card.lng}&navigate=yes`
  }
  return `https://maps.apple.com/?q=${encodeURIComponent(card.name || '')}&ll=${card.lat},${card.lng}`
}

export function WeCouldNearby({ trip, traveler }) {
  const coords = useMemo(() => stayPlaceCoords(trip), [trip])
  const isStay = isStayTrip(trip)
  const enabled = isStay && !!coords

  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [tray, setTray] = useState([])
  const [curation, setCuration] = useState(() => loadCuration(trip?.id))
  const reqId = useRef(0)

  useEffect(() => {
    if (!enabled) return
    setCuration(loadCuration(trip?.id))
    const key = cacheKey(trip?.id, coords)
    if (trayCache.has(key)) {
      setTray(trayCache.get(key))
      setStatus('ready')
      return
    }
    const myReq = ++reqId.current
    setStatus('loading')
    fetchTray(coords)
      .then((built) => {
        if (myReq !== reqId.current) return // a newer trip won the race
        trayCache.set(key, built)
        setTray(built)
        setStatus('ready')
      })
      .catch(() => {
        if (myReq !== reqId.current) return
        setStatus('error')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, trip?.id, coords?.lat, coords?.lng])

  if (!enabled) return null

  const placeName = stayLabel(trip)
  const view = applyCuration(tray, curation)

  // Compute next from the current state, then set + persist — keeping the
  // localStorage write OUT of the setState updater (updaters must be pure;
  // React StrictMode double-invokes them).
  function onPin(id) {
    const next = togglePinned(curation, id)
    setCuration(next)
    saveCuration(trip?.id, next)
  }
  function onHide(id) {
    const next = toggleHidden(curation, id)
    setCuration(next)
    saveCuration(trip?.id, next)
  }

  return (
    <section data-testid="wecould-nearby" style={{ padding: '14px 14px 4px' }}>
      <div
        style={{
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          opacity: 0.65,
          fontWeight: 700,
          color: 'var(--text)',
          padding: '0 4px 4px',
        }}
      >
        We could…
      </div>
      <div
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 13,
          fontStyle: 'italic',
          // Full-contrast token, not --muted: small text must clear WCAG AA on
          // every lens surface, and --muted lands at ~4.1:1 on the card fill.
          // (No opacity — it would silently drop the effective contrast.)
          color: 'var(--text)',
          padding: '0 4px 12px',
        }}
      >
        {placeName ? `Ideas near ${placeName}` : 'Ideas nearby'}
      </div>

      {status === 'loading' && <SkeletonRows />}

      {status === 'error' && (
        <Notice>
          Couldn&rsquo;t load nearby ideas right now. They&rsquo;ll be here when you&rsquo;re back online.
        </Notice>
      )}

      {status === 'ready' && view.length === 0 && (
        <Notice>Nothing turned up nearby — try the curated list below.</Notice>
      )}

      {status === 'ready' && view.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {view.map((card) => (
            <NearbyCard
              key={card.id}
              card={card}
              traveler={traveler}
              onPin={() => onPin(card.id)}
              onHide={() => onHide(card.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function NearbyCard({ card, traveler, onPin, onHide }) {
  const travel = estimateTravel(card.distanceMeters)
  const href = mapsHref(card, traveler)
  return (
    <article
      data-testid="wecould-card"
      style={{
        borderRadius: 'min(var(--radius, 12px), 16px)',
        border: '1px solid var(--border)',
        background: 'var(--card, transparent)',
        padding: '12px 12px 12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        // a thin category-tinted left edge gives each card a quiet identity
        borderLeft: `3px solid ${card.tint}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              // Category is carried by the tinted left edge (decorative); the
              // LABEL is full-contrast --text (not the raw tint, which fails
              // contrast on the dark lenses; not --muted, which lands ~4.1:1 on
              // the card fill).
              color: 'var(--text)',
              fontWeight: 700,
            }}
          >
            {card.catLabel}
          </span>
          {typeof card.openNow === 'boolean' && <OpenPill open={card.openNow} />}
        </div>

        <h3
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 17,
            fontWeight: 700,
            lineHeight: 1.2,
            margin: 0,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {card.name}
        </h3>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 6,
            fontFamily: 'Inter Tight, system-ui, sans-serif',
            fontSize: 12.5,
            // Full-contrast --text (not --muted) — see the kicker note.
            color: 'var(--text)',
            flexWrap: 'wrap',
          }}
        >
          {travel && (
            // The mode icon is a soft HINT, not an asserted fact — the minutes
            // are a straight-line estimate (the "~"), not a routed ETA (G6).
            // The full honest detail lives in the title tooltip.
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              title={`about ${travel.minutes} min by ${travel.mode} — straight-line estimate`}
            >
              {travel.mode === 'walk' ? <Footprints size={13} /> : <Car size={13} />}
              ~{travel.minutes} min
            </span>
          )}
          {Number.isFinite(card.distanceMeters) && (
            <span>· {formatDistance(card.distanceMeters)}</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="wecould-keep"
            onClick={onPin}
            aria-pressed={!!card.pinned}
            aria-label={card.pinned ? `Stop keeping ${card.name}` : `Keep ${card.name}`}
            className="btn-pill"
            style={{
              cursor: 'pointer',
              background: card.pinned ? 'var(--accent)' : 'transparent',
              // Accent fill needs the lens's dark INK, never white — Rafa's
              // ochre + Jonathan's clay are too light for white text.
              color: card.pinned ? 'var(--accent-ink)' : 'inherit',
              borderColor: card.pinned ? 'var(--accent)' : 'var(--border)',
            }}
          >
            <Star size={12} fill={card.pinned ? 'currentColor' : 'none'} />
            {card.pinned ? 'Kept' : 'Keep'}
          </button>
          {href && (
            <a className="btn-pill" href={href} target="_blank" rel="noreferrer" style={{ cursor: 'pointer' }}>
              <MapPin size={12} />
              {TRAVELERS[traveler]?.maps === 'waze' ? 'Waze' : 'Maps'}
            </a>
          )}
        </div>
      </div>

      <button
        type="button"
        data-testid="wecould-hide"
        onClick={onHide}
        aria-label={`Hide ${card.name}`}
        style={{
          flexShrink: 0,
          background: 'transparent',
          border: 0,
          padding: 4,
          cursor: 'pointer',
          // Full-strength --muted (no opacity): the icon must clear the
          // WCAG 1.4.11 non-text 3:1 bar on Helen's light lens, where the
          // 0.7 opacity dropped it to ~2.7:1.
          color: 'var(--muted)',
        }}
      >
        <X size={16} />
      </button>
    </article>
  )
}

function OpenPill({ open }) {
  // A colored DOT carries the open/closed signal; the LABEL stays neutral
  // (var(--muted)) so it's contrast-safe on every lens surface. The dot is
  // decorative (aria-hidden) — the word "Open now"/"Closed" is the a11y text.
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 8.5,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        fontWeight: 700,
        // Full-contrast label; the colored DOT carries the open/closed signal.
        color: 'var(--text)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: open ? '#2E9E5B' : 'var(--muted)',
          display: 'inline-block',
        }}
      />
      {open ? 'Open now' : 'Closed'}
    </span>
  )
}

function Notice({ children }) {
  return (
    <div
      style={{
        padding: '14px 14px',
        borderRadius: 10,
        border: '1px dashed var(--border)',
        fontFamily: 'Fraunces, Georgia, serif',
        fontStyle: 'italic',
        fontSize: 14,
        lineHeight: 1.5,
        color: 'var(--text)',
      }}
    >
      {children}
    </div>
  )
}

function SkeletonRows() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 78,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background:
              'linear-gradient(90deg, color-mix(in srgb, var(--text) 4%, transparent), color-mix(in srgb, var(--text) 8%, transparent), color-mix(in srgb, var(--text) 4%, transparent))',
            opacity: 0.5,
          }}
        />
      ))}
    </div>
  )
}
