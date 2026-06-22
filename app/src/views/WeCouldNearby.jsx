import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, Star, X, Footprints, Car } from 'lucide-react'
import { isStayTrip, stayPlaceCoords, stayLabel } from '../lib/tripShape'
import { searchNearby, formatDistance } from '../lib/placesNearby'
import { TRAVELERS, TRAVELER_DOT, TRAVELER_ORDER } from '../data/travelers'
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
// The cards follow the design authority (app/docs/design/family-trips-hangout,
// "We could…" / the Pantry): a category-tinted header, a category kicker, the
// title, a detail line, the who-it's-for face row, travel time, and an action.
// Rafa gets the big-card variant. (The propose→decide multiplayer action is a
// later slice; here the action is the client-local "Keep". Real place photos
// need a worker change and are a flagged follow-on — the header band stands in.)
//
// G5: renders ONLY on a stay that has coordinates — route trips and
// coordinate-less stays get nothing (byte-identical to before). All network
// failure modes degrade quietly; the tray never shows a broken state.

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
  const big = traveler === 'rafa'

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
    <section data-testid="wecould-nearby" style={{ padding: '4px 14px 4px' }}>
      <div
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 13,
          fontStyle: 'italic',
          // Full-contrast token, not --muted: small text must clear WCAG AA on
          // every lens surface, and --muted lands at ~4.1:1 on the card fill.
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: big ? 12 : 11 }}>
          {view.map((card) =>
            big ? (
              <RafaCard
                key={card.id}
                card={card}
                traveler={traveler}
                onPin={() => onPin(card.id)}
                onHide={() => onHide(card.id)}
              />
            ) : (
              <NearbyCard
                key={card.id}
                card={card}
                traveler={traveler}
                onPin={() => onPin(card.id)}
                onHide={() => onHide(card.id)}
              />
            ),
          )}
        </div>
      )}
    </section>
  )
}

// The four family dots — "who it's for". In this slice a nearby idea suits
// everyone (Claude-scoped suits is a later slice), so the row reads as "the
// whole family". Decorative; the labels live on the buttons + card text.
function FaceDots({ ids = TRAVELER_ORDER, size = 16 }) {
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex' }}>
      {ids.map((id, i) => (
        <span
          key={id}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: TRAVELER_DOT[id] || 'var(--muted)',
            border: '1.5px solid var(--card)',
            marginLeft: i === 0 ? 0 : -size * 0.33,
            display: 'inline-block',
          }}
        />
      ))}
    </span>
  )
}

// A category-tinted header band — stands in for the real place photo (a worker
// change is needed to fetch Places photos; that's a flagged follow-on). The
// tints are dark enough that white overlay text clears WCAG AA.
function CategoryBand({ card, height = 52, children }) {
  return (
    <div
      style={{
        position: 'relative',
        height,
        background: `linear-gradient(135deg, ${card.tint}, color-mix(in srgb, ${card.tint} 70%, #000))`,
        display: 'flex',
        alignItems: 'flex-end',
        padding: '8px 10px',
      }}
    >
      <span
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 8.5,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          fontWeight: 700,
          color: '#fff',
        }}
      >
        {card.catLabel}
      </span>
      {children}
    </div>
  )
}

function HideButton({ name, onHide, onBand }) {
  return (
    <button
      type="button"
      data-testid="wecould-hide"
      onClick={onHide}
      aria-label={`Hide ${name}`}
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        background: onBand ? 'rgba(0,0,0,0.28)' : 'transparent',
        border: 0,
        borderRadius: '50%',
        padding: 3,
        cursor: 'pointer',
        // Full-strength so the icon clears WCAG 1.4.11 (3:1) on every lens.
        color: onBand ? '#fff' : 'var(--muted)',
        display: 'inline-flex',
      }}
    >
      <X size={15} />
    </button>
  )
}

function KeepButton({ pinned, name, onPin, accentFill }) {
  return (
    <button
      type="button"
      data-testid="wecould-keep"
      onClick={onPin}
      aria-pressed={!!pinned}
      aria-label={pinned ? `Stop keeping ${name}` : `Keep ${name}`}
      className="btn-pill"
      style={{
        cursor: 'pointer',
        flexShrink: 0,
        background: pinned ? 'var(--accent)' : accentFill ? 'rgba(255,255,255,0.22)' : 'transparent',
        // Accent fill needs the lens's dark INK, never white.
        color: pinned ? 'var(--accent-ink)' : accentFill ? '#fff' : 'inherit',
        borderColor: pinned ? 'var(--accent)' : accentFill ? 'transparent' : 'var(--border)',
      }}
    >
      <Star size={12} fill={pinned ? 'currentColor' : 'none'} />
      {pinned ? 'Kept' : 'Keep'}
    </button>
  )
}

function NearbyCard({ card, traveler, onPin, onHide }) {
  const travel = estimateTravel(card.distanceMeters)
  const href = mapsHref(card, traveler)
  return (
    <article
      data-testid="wecould-card"
      style={{
        position: 'relative',
        borderRadius: 'min(var(--radius, 12px), 16px)',
        border: '1px solid var(--border)',
        background: 'var(--card, transparent)',
        overflow: 'hidden',
      }}
    >
      <CategoryBand card={card} />
      <HideButton name={card.name} onHide={onHide} onBand />

      <div style={{ padding: '10px 12px 12px' }}>
        <h3
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 17,
            fontWeight: 700,
            lineHeight: 1.18,
            margin: 0,
            color: 'var(--text)',
          }}
        >
          {card.name}
        </h3>

        {card.address && (
          <div
            style={{
              fontFamily: 'Inter Tight, system-ui, sans-serif',
              fontSize: 12,
              lineHeight: 1.35,
              color: 'var(--text)',
              opacity: 0.92,
              marginTop: 4,
            }}
          >
            {card.address}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
            fontFamily: 'Inter Tight, system-ui, sans-serif',
            fontSize: 12.5,
            color: 'var(--text)',
            flexWrap: 'wrap',
          }}
        >
          {travel && (
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              title={`about ${travel.minutes} min by ${travel.mode} — straight-line estimate`}
            >
              {travel.mode === 'walk' ? <Footprints size={13} /> : <Car size={13} />}
              ~{travel.minutes} min
            </span>
          )}
          {Number.isFinite(card.distanceMeters) && <span>· {formatDistance(card.distanceMeters)}</span>}
          {typeof card.openNow === 'boolean' && <OpenPill open={card.openNow} />}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginTop: 11,
          }}
        >
          <FaceDots />
          <span style={{ display: 'inline-flex', gap: 8 }}>
            {href && (
              <a className="btn-pill" href={href} target="_blank" rel="noreferrer" style={{ cursor: 'pointer' }}>
                <MapPin size={12} />
                {TRAVELERS[traveler]?.maps === 'waze' ? 'Waze' : 'Maps'}
              </a>
            )}
            <KeepButton pinned={card.pinned} name={card.name} onPin={onPin} />
          </span>
        </div>
      </div>
    </article>
  )
}

// Rafa's big-card variant — a tall tinted card with the title over a gradient,
// per the design (Rafa gets bigger, bolder cards and a candy action).
function RafaCard({ card, traveler, onPin, onHide }) {
  const travel = estimateTravel(card.distanceMeters)
  return (
    <article
      data-testid="wecould-card"
      style={{
        position: 'relative',
        borderRadius: 'min(var(--radius, 22px), 24px)',
        overflow: 'hidden',
        height: 150,
        background: `linear-gradient(135deg, ${card.tint}, color-mix(in srgb, ${card.tint} 60%, #000))`,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 10,
          left: 12,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 8.5,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          fontWeight: 700,
          color: '#fff',
        }}
      >
        {card.catLabel}
      </span>
      <HideButton name={card.name} onHide={onHide} onBand />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
          padding: '22px 14px 13px',
        }}
      >
        <div style={{ fontFamily: 'var(--font-display, Fredoka), sans-serif', fontWeight: 700, fontSize: 23, color: '#fff', lineHeight: 1.05 }}>
          {card.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <FaceDots />
          {travel && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'rgba(255,255,255,0.9)' }}>
              ~{travel.minutes} MIN {travel.mode.toUpperCase()}
            </span>
          )}
          <span style={{ marginLeft: 'auto' }}>
            <KeepButton pinned={card.pinned} name={card.name} onPin={onPin} accentFill />
          </span>
        </div>
      </div>
    </article>
  )
}

function OpenPill({ open }) {
  // A colored DOT carries the open/closed signal; the LABEL stays neutral
  // (var(--text)) so it's contrast-safe on every lens surface.
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 120,
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
