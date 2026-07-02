import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, Star, X, Footprints, Car, Send } from 'lucide-react'
import { isStayTrip, stayPlaceCoords, stayLabel, stayGeocodeQuery } from '../lib/tripShape'
import { isCompositeTrip, deriveCurrentLeg, currentPartCoords, partPlaceLabel, legGeocodeQuery } from '../lib/tripParts'
import { searchNearby, formatDistance } from '../lib/placesNearby'
import { sunTimes } from '../lib/sunTimes'
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
  rankByConditions,
} from '../lib/weCould'
import { useConditions, tideLine } from '../lib/conditions'
import { useNowTick } from '../hooks/useNowTick'

// WeCouldNearby — the never-empty "We could…" tray for a STAY home, and (per-
// leg) for a composite/multi-city trip.
//
// FAMILY_TRIPS_VISION §2/§3: on a stay the home leads with possibility. When
// the trip has no curated "things to do" (a brand-new trip), this surfaces a
// handful of nearby ideas from the place's coordinates so the tab is never
// blank. Each person curates their own device's tray (keep / hide). On a
// composite trip the tray re-anchors to the CURRENT leg ("in Florence, not
// Rome") — hangout-first Design 03 "the live home, scoped to the current leg".
//
// The cards follow the design authority (app/docs/design/family-trips-hangout,
// "We could…" / the Pantry): a category-tinted header, a category kicker, the
// title, a detail line, the who-it's-for face row, travel time, and an action.
// Rafa gets the big-card variant. (The propose→decide multiplayer action is a
// later slice; here the action is the client-local "Keep". Real place photos
// need a worker change and are a flagged follow-on — the header band stands in.)
//
// G5: renders ONLY on a stay OR composite trip that has coordinates for its
// current place — a plain route trip and a coordinate-less stay still get
// nothing (byte-identical to before this leg-model work). All network
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

// A nearby card → the compact spot snapshot a proposal carries, so every family
// device renders the same card without re-deriving the per-device nearby list.
function toSpotSnapshot(card) {
  return {
    id: card.id,
    title: card.name,
    cat: card.cat,
    tint: card.tint || null,
    photoUrl: card.photoUrl || null,
    travel: estimateTravel(card.distanceMeters),
  }
}

export function WeCouldNearby({ trip, traveler, onPropose, onLocate, onLocateLeg }) {
  // A composite (multi-city) trip anchors to WHERE IT IS NOW — the current
  // leg's own coords — instead of one whole-trip place; a plain stay is
  // unaffected (stayPlaceCoords, byte-identical, G5). legCtx also names the
  // leg for the header + the per-leg "Locate this leg" fallback below. `now`
  // is a real dependency: without it this only re-picks the leg when `trip`'s
  // object reference changes, so a family that leaves the tray open across a
  // leg's midnight handoff would stay pinned to yesterday's city.
  const isStay = isStayTrip(trip)
  const isComposite = isCompositeTrip(trip)
  const now = useNowTick()
  const legCtx = useMemo(() => (isComposite ? deriveCurrentLeg(trip, now) : null), [isComposite, trip, now])
  const coords = useMemo(
    () => (isComposite ? currentPartCoords(trip, legCtx?.todayIso) : stayPlaceCoords(trip)),
    [isComposite, trip, legCtx?.todayIso]
  )
  const enabled = (isStay || isComposite) && !!coords
  const big = traveler === 'rafa'

  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [tray, setTray] = useState([])
  const [curation, setCuration] = useState(() => loadCuration(trip?.id))
  const [catFilter, setCatFilter] = useState(null) // 'meal' | 'energy' | 'look' | 'treat' | null
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

  // Real conditions (slice 7): fetch weather/tide for the place, re-rank the tray
  // by them, and show an honest one-line reason when the order actually changed.
  const conditions = useConditions(enabled ? coords : null)

  if (!enabled) {
    // A stay with a lodging ADDRESS but no coords yet (AI/screenshot trips store
    // an address, not coords) → offer a one-tap "Locate this stay" so the tray can
    // fill. Route trips and address-less stays still render nothing (G5: byte-
    // identical to before — the prompt needs isStay + a geocodable address + the
    // handler).
    if (isStay && !coords && onLocate && stayGeocodeQuery(trip)) {
      return <LocatePrompt placeName={stayLabel(trip)} buttonLabel="Locate this stay" onLocate={onLocate} />
    }
    // The composite mirror: the current leg has a place NAME but no coords yet
    // (no current producer — AI or manual — geocodes a leg at creation time in
    // every case) → the same one-tap fallback, scoped to just this leg.
    if (isComposite && !coords && onLocateLeg && legCtx?.part && legGeocodeQuery(legCtx.part)) {
      const partId = legCtx.part.id
      return (
        <LocatePrompt
          placeName={partPlaceLabel(legCtx.part) || legCtx.part.title || 'here'}
          buttonLabel="Locate this leg"
          onLocate={() => onLocateLeg(partId)}
        />
      )
    }
    return null
  }

  const placeName = isComposite ? (partPlaceLabel(legCtx?.part) || legCtx?.part?.title || 'here') : stayLabel(trip)
  const { tray: rankedTray, reason: conditionReason } = rankByConditions(tray, conditions)
  const view = applyCuration(rankedTray, curation) // condition order → pins/hides applied
  const shown = view.filter((c) => !catFilter || c.cat === catFilter) // + category filter

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
      <ConditionsStrip placeName={placeName} coords={coords} conditions={conditions} />

      {status === 'ready' && !catFilter && conditionReason && <ConditionReason text={conditionReason} />}

      {status === 'ready' && view.length > 0 && (
        <CategoryChips value={catFilter} onChange={setCatFilter} />
      )}

      {status === 'loading' && <SkeletonRows />}

      {status === 'error' && (
        <Notice>
          Couldn&rsquo;t load nearby ideas right now. They&rsquo;ll be here when you&rsquo;re back online.
        </Notice>
      )}

      {status === 'ready' && view.length === 0 && (
        <Notice>Nothing turned up nearby — try the curated list below.</Notice>
      )}

      {status === 'ready' && view.length > 0 && shown.length === 0 && (
        <Notice>Nothing nearby under that filter — try another, or clear it.</Notice>
      )}

      {status === 'ready' && shown.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: big ? 12 : 11 }}>
          {shown.map((card) =>
            big ? (
              <RafaCard
                key={card.id}
                card={card}
                traveler={traveler}
                onPin={() => onPin(card.id)}
                onHide={() => onHide(card.id)}
                onPropose={onPropose ? () => onPropose(toSpotSnapshot(card)) : undefined}
              />
            ) : (
              <NearbyCard
                key={card.id}
                card={card}
                traveler={traveler}
                onPin={() => onPin(card.id)}
                onHide={() => onHide(card.id)}
                onPropose={onPropose ? () => onPropose(toSpotSnapshot(card)) : undefined}
              />
            ),
          )}
        </div>
      )}
    </section>
  )
}

// The conditions strip — the place, a live clock, the day's light (golden hour +
// sunset, a free on-device calc), and — when the worker has it — REAL weather and
// tide (slice 7). Honest: weather/tide show only when actually present; on a
// landlocked or offline place they simply aren't there (no fabricated values).
function ConditionsStrip({ placeName, coords, conditions }) {
  const sun = useMemo(
    () => (coords ? sunTimes(new Date(), coords.lat, coords.lng) : null),
    [coords?.lat, coords?.lng],
  )
  const fmt = (d) => (d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null)
  const w = conditions?.weather
  const tide = tideLine(conditions?.tide)
  const META = {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 9,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--text)',
    marginTop: 5,
  }
  return (
    <div
      data-testid="wecould-conditions"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '2px 4px 12px' }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 13, fontStyle: 'italic', color: 'var(--text)' }}>
          {placeName ? `Ideas near ${placeName}` : 'Ideas nearby'}
        </div>
        {w && (
          <div data-testid="wecould-weather" style={{ ...META, marginTop: 6, fontSize: 11, letterSpacing: '0.04em', textTransform: 'none' }}>
            <span aria-hidden="true">{w.icon}</span> {w.tempF}°F · {w.label}
            {Number.isFinite(w.precipProbPct) && w.precipProbPct >= 30 ? ` · ${w.precipProbPct}% rain` : ''}
          </div>
        )}
        {tide && (
          <div style={{ ...META, marginTop: 3, fontSize: 11, letterSpacing: '0.04em', textTransform: 'none', color: 'var(--muted)' }}>
            🌊 {tide}
          </div>
        )}
        {sun?.sunset && (
          <div style={META}>
            {sun.goldenHour ? `Golden ${fmt(sun.goldenHour)} · ` : ''}Sunset {fmt(sun.sunset)}
          </div>
        )}
      </div>
      <LiveClock />
    </div>
  )
}

// A one-line, plain-language banner explaining a conditions re-rank ("Rain
// around — indoor ideas moved up"). Only rendered when the order actually moved.
function ConditionReason({ text }) {
  return (
    <div
      data-testid="wecould-condition-reason"
      style={{
        fontSize: 11.5,
        color: 'var(--muted)',
        background: 'var(--card, rgba(0,0,0,0.03))',
        border: '1px solid var(--line, rgba(0,0,0,0.08))',
        borderRadius: 8,
        padding: '7px 10px',
        margin: '0 0 10px',
      }}
    >
      {text}
    </div>
  )
}

// A second-ticking clock, scoped to its own state so the whole tray doesn't
// re-render each second. (Under the e2e clock stub `new Date()` is frozen, so
// it renders a fixed time — no test churn.)
function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 13,
        color: 'var(--accent-text)',
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
      }}
    >
      {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}

// The category filter — single-select, tap again to clear (matches the design's
// "A bite · Burn energy · …" row). Narrows the tray by card.cat.
function CategoryChips({ value, onChange }) {
  return (
    <div data-testid="wecould-cats" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 4px 14px' }}>
      {WE_COULD_CATEGORIES.map((c) => {
        const on = c.key === value
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : c.key)}
            style={{
              padding: '6px 11px',
              borderRadius: 20,
              border: '1px solid',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'Inter Tight, system-ui, sans-serif',
              fontSize: 11.5,
              fontWeight: 600,
              borderColor: on ? 'var(--accent)' : 'var(--border)',
              background: on ? 'var(--accent)' : 'transparent',
              // accent fill → dark ink (never white); off → full-contrast text
              color: on ? 'var(--accent-ink)' : 'var(--text)',
            }}
          >
            {c.label}
          </button>
        )
      })}
    </div>
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

// The card's header band: the place's real photo when we have one, falling
// back to a category-tinted gradient. A dark scrim keeps the white category
// label readable over any photo; the tint is dark enough on its own too.
function CategoryBand({ card, height = 64, children }) {
  const [imgFailed, setImgFailed] = useState(false)
  const showPhoto = !!card.photoUrl && !imgFailed
  return (
    <div
      style={{
        position: 'relative',
        height,
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${card.tint}, color-mix(in srgb, ${card.tint} 70%, #000))`,
        display: 'flex',
        alignItems: 'flex-end',
        padding: '8px 10px',
      }}
    >
      {showPhoto && (
        <img
          src={card.photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: showPhoto ? 'linear-gradient(transparent 35%, rgba(0,0,0,0.6))' : 'none',
        }}
      />
      <span
        style={{
          position: 'relative',
          zIndex: 1,
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

function NearbyCard({ card, traveler, onPin, onHide, onPropose }) {
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
            {onPropose && (
              <button
                type="button"
                className="btn-pill"
                onClick={onPropose}
                data-testid="propose-card"
                aria-label={`Propose ${card.name} to the family`}
                style={{ cursor: 'pointer' }}
              >
                <Send size={12} />
                Propose
              </button>
            )}
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
function RafaCard({ card, traveler, onPin, onHide, onPropose }) {
  const travel = estimateTravel(card.distanceMeters)
  const [imgFailed, setImgFailed] = useState(false)
  const showPhoto = !!card.photoUrl && !imgFailed
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
      {showPhoto && (
        <img
          src={card.photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      <span
        style={{
          position: 'absolute',
          zIndex: 1,
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
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
            {onPropose && (
              <button
                type="button"
                onClick={onPropose}
                data-testid="propose-card"
                aria-label={`Ask to go to ${card.name}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: 0,
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.92)',
                  color: '#1A1614',
                  fontFamily: 'Fredoka, system-ui, sans-serif',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                <Send size={14} /> Ask!
              </button>
            )}
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

// Shown on a stay that has a lodging address but no coordinates yet (an older
// AI/screenshot trip). One tap geocodes the lodging (onLocate → App upserts
// trip.lodging.lat/lng); on success the trip prop gains coords and this unmounts,
// the real tray taking over. A miss lands back here with a "Try again" + an
// editor hint. (New trips auto-locate on create, so this is mainly a backfill.)
function LocatePrompt({ placeName, onLocate, buttonLabel = 'Locate this stay' }) {
  const [status, setStatus] = useState('idle') // idle | locating | error
  async function locate() {
    setStatus('locating')
    let ok = false
    try {
      ok = !!(await onLocate())?.ok
    } catch {
      ok = false
    }
    // On success the parent re-renders WITH coords and unmounts this; only a
    // failure lands back here (still mounted — no setState-after-unmount).
    if (!ok) setStatus('error')
  }
  return (
    <section data-testid="wecould-nearby" style={{ padding: '8px 14px 4px' }}>
      <div
        data-testid="wecould-locate"
        style={{
          padding: '16px',
          borderRadius: 12,
          border: '1px dashed var(--border)',
          background: 'var(--card, transparent)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 15, lineHeight: 1.45, color: 'var(--text)' }}>
          See what you could do near {placeName || 'your stay'} — pin it on the map first.
        </div>
        {status === 'error' && (
          <div style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--muted)' }}>
            Couldn&rsquo;t find this place automatically. Add or refine the address in Edit, then drag the pin.
          </div>
        )}
        <button
          type="button"
          data-testid="wecould-locate-btn"
          onClick={locate}
          disabled={status === 'locating'}
          className="btn-pill"
          style={{
            cursor: status === 'locating' ? 'default' : 'pointer',
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            borderColor: 'var(--accent)',
            opacity: status === 'locating' ? 0.7 : 1,
          }}
        >
          <MapPin size={13} />
          {status === 'locating' ? 'Locating…' : status === 'error' ? 'Try again' : buttonLabel}
        </button>
      </div>
    </section>
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
