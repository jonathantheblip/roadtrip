import { useState, useMemo } from 'react'
import { Mic } from 'lucide-react'
import { allStops } from '../data/trips'
import { RafaMap, stopArt } from './RafaMap'
import { RafaGames } from './RafaGames'
import { RafaSound } from '../lib/rafaSound'
import { WeaveReady, SurpriseReveal } from '../components/EntryCues'
import { isStayTrip, stayLabel, stayNights } from '../lib/tripShape'
import { isCompositeTrip, deriveCurrentLeg, partPlaceLabel } from '../lib/tripParts'
import { flightSegments } from '../lib/flightSegments'

// RafaPad — Rafa's iPad "command center" home (design_handoff_rafa_adventure_map).
// Landscape 4×4 quadrant of chunky candy tiles: two BIG tiles (My games / Show
// me, me — randomized corners) + eight small tiles (Tell a story, the "Our trip!"
// Adventure-Map tile, and six video highlights). Shown only on iPad-sized touch
// screens (App.jsx useIsIpad); phones keep RafaView. The app's top bar is hidden
// for Rafa-on-iPad (immersive), so this surface owns the whole screen.
//
// REAL now: Tell a story (the stop recorder), the Adventure Map (RafaMap + sound),
//   the countdown (computed; absorbed into the map tile). Settings (the avatar).
// PLACEHOLDER until their own increments: "My games" (a "soon" pop, Increment B),
//   "Show me, me" (opens the album, Increment C), the highlights (real stops).

const FREDOKA = "'Fredoka', 'Inter Tight', system-ui, sans-serif"
const ST = ['#FFB12E', '#3DA5E0', '#4CC36E', '#FF6B4D', '#C77DFF']
const CANDY_INK = '#1B1108'

export function RafaPad({
  trip, traveler = 'rafa', onOpenStop, onOpenSettings, onOpenPhotos, onShowMe,
  onOpenWeave, onOpenReplay, onOpenBook, onOpenSurprises,
  weaveReady, bookHasPages, surpriseRevealCue, presencePeople = [], nowMs,
}) {
  const [gamesOpen, setGamesOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  // randomized big-tile corners each visit (the design's "where is it today?" game)
  const bigsOrder = useMemo(() => (Math.random() < 0.5 ? ['games', 'person'] : ['person', 'games']), [])
  const vehicle = useMemo(() => RafaSound.vehicle(), [])

  const allRafaStops = useMemo(
    () =>
      (trip.days || [])
        .flatMap((d) => (d.stops || []).map((s) => ({ ...s, day: d.n })))
        .filter((s) => !s.for || s.for.length === 0 || s.for.includes('rafa')),
    [trip],
  )
  const featured =
    (trip.heroStopId && allRafaStops.find((s) => s.id === trip.heroStopId)) ||
    allRafaStops.find((s) => /monster|truck|rocket|circus|zoo|park|beach/i.test(s.name)) ||
    allRafaStops[0]
  // the trip's big event (hero/anchor) drives the map tile's destination emoji + the countdown
  const destStop = useMemo(() => {
    const ss = allStops(trip)
    return ss.find((s) => s.id === trip.heroStopId) || ss[ss.length - 1]
  }, [trip])
  const destEmoji = destStop ? stopArt(destStop).emoji : '🚩'
  const countdown = useMemo(() => tripCountdown(trip, destStop), [trip, destStop])
  const highlights = allRafaStops.slice(0, 6)

  // Family-trips shift: on a STAY there are no exciting stops to fill the grid,
  // and the road/countdown map tile points at nothing. The PLACE becomes a tile
  // (🏡 Our cabin! N nights) — still opens the adventure map (stay empty-state).
  const stay = isStayTrip(trip)
  const stayName = stayLabel(trip)
  const nights = stayNights(trip)
  // A composite (multi-city) trip has the same gap: no "exciting stop" concept
  // spans a whole multi-leg trip evenly, and it isn't a stay either, so it got
  // no place tile at all. Show the CURRENT leg's place instead (deriveCurrentLeg
  // — same "where we are now" resolver the adult views use); additive, so real
  // stop tiles still fill the rest of the grid. No nights count (a leg's own
  // date window isn't "nights at a place" the way a stay's is).
  const composite = isCompositeTrip(trip)
  const curLeg = composite ? deriveCurrentLeg(trip).part : null
  const legPlace = curLeg ? partPlaceLabel(curLeg) || curLeg.title : null

  const bigDefs = {
    games: { label: 'My games', emo: '🎮', tint: ST[2], onClick: () => setGamesOpen(true) },
    person: { label: 'Show me, me!', emo: '📸', tint: ST[4], onClick: () => (onShowMe ? onShowMe('rafa') : onOpenPhotos && onOpenPhotos()) },
  }
  const A = bigDefs[bigsOrder[0]]
  const B = bigDefs[bigsOrder[1]]

  // The 4 feature tiles (entry-points redesign) take the top-right quad — the
  // glyphs retire into candy PLACES. Weave + Surprises carry their cues; the Book
  // tile appears only once pages are kept. Each is dropped only if its callback
  // is wired (defensive). Then Tell-a-story + the Adventure Map + highlights fill
  // the bottom-left quad (all preserved).
  const featureTiles = [
    { kind: 'feature', label: "Tonight's story", emo: '🌙', tint: ST[1], onClick: onOpenWeave, cue: weaveReady ? <WeaveReady traveler="rafa" /> : null },
    { kind: 'feature', label: 'Secrets!', emo: '🎁', tint: ST[3], onClick: onOpenSurprises, cue: surpriseRevealCue > 0 ? <SurpriseReveal traveler="rafa" /> : null },
    { kind: 'feature', label: 'Watch our trip!', emo: '🎬', tint: ST[2], onClick: onOpenReplay },
    ...(bookHasPages ? [{ kind: 'feature', label: 'Our big book!', emo: '📖', tint: ST[4], onClick: onOpenBook }] : []),
  ].filter((t) => typeof t.onClick === 'function')
  // 8 small slots: the feature tiles, then tell-a-story, the adventure-map tile, highlights.
  const smalls = [
    ...featureTiles,
    // Tell-a-story needs a stop to record into — omit it when there's none (a
    // hangout stay) so it's never a dead tile.
    ...(featured ? [{ kind: 'tell', label: 'Tell a story', tint: ST[3], onClick: () => onOpenStop(featured.day, featured.id) }] : []),
    { kind: 'map', onClick: () => setMapOpen(true) },
    // On a STAY, add the place as its own hero tile (🏡 Our cabin · N nights) —
    // additive, so the map tile + any real stops still show. A composite trip
    // gets the same tile, naming the CURRENT leg instead of the whole trip.
    ...(stay ? [{ kind: 'place', label: stayName, nights, onClick: () => setMapOpen(true) }] : []),
    ...(!stay && legPlace ? [{ kind: 'place', label: legPlace, onClick: () => setMapOpen(true) }] : []),
    ...highlights.map((s) => ({ kind: 'stop', label: s.name, emo: emojiFor(s), tint: pickTint(s.id), onClick: () => onOpenStop(s.day, s.id) })),
  ].slice(0, 8)
  const slotPos = [[3, 1], [4, 1], [3, 2], [4, 2], [1, 3], [2, 3], [1, 4], [2, 4]]

  return (
    <div data-testid="rafa-pad" style={{ height: '100dvh', overflow: 'hidden', background: 'var(--bg)', color: 'var(--text)', fontFamily: FREDOKA, paddingBottom: 'calc(env(safe-area-inset-bottom) + 96px)', display: 'flex', flexDirection: 'column' }}>
      {/* Slim greeting bar — clears the iOS status bar (no app top bar in immersive Rafa-iPad). */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(env(safe-area-inset-top) + 18px) 34px 4px' }}>
        <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 34, color: 'var(--text)', lineHeight: 1.05 }}>
          Hi Rafa! <span style={{ color: ST[0] }}>★</span>
        </div>
        {onOpenSettings && (
          <button type="button" aria-label="Settings" onClick={onOpenSettings} style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--dot, #E8552E)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 5px 0 ${shade('#E8552E', -50)}`, fontFamily: FREDOKA, fontWeight: 700, fontSize: 26, color: '#fff', flexShrink: 0 }}>
            R
          </button>
        )}
      </div>

      {/* The quadrant grid — height-driven so it fits above the family dock */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 34px 26px' }}>
        <div data-testid="rafa-pad-grid" style={{ height: '100%', width: 'auto', maxWidth: '100%', aspectRatio: '1.18', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(4, 1fr)', gap: 16 }}>
          <BigTile b={A} col="1 / 3" row="1 / 3" />
          <BigTile b={B} col="3 / 5" row="3 / 5" />
          {smalls.map((s, i) => (
            <SmallTile key={i} s={s} vehicle={vehicle} destEmoji={destEmoji} countdown={countdown} col={slotPos[i][0]} row={slotPos[i][1]} />
          ))}
        </div>
      </div>

      {mapOpen && <RafaMap trip={trip} traveler={traveler} people={presencePeople} now={nowMs} onClose={() => setMapOpen(false)} />}
      {gamesOpen && <RafaGames onClose={() => setGamesOpen(false)} />}
    </div>
  )
}

function BigTile({ b, col, row }) {
  const [pressed, setPressed] = useState(false)
  return (
    <button type="button" onClick={b.onClick} onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
      style={{ gridColumn: col, gridRow: row, border: 'none', cursor: 'pointer', borderRadius: 40, background: `radial-gradient(120% 120% at 50% 25%, ${shade(b.tint, 14)}, ${shade(b.tint, -30)})`, boxShadow: pressed ? `0 5px 0 ${shade(b.tint, -48)}` : `0 12px 0 ${shade(b.tint, -48)}`, transform: pressed ? 'translateY(7px)' : 'none', transition: 'transform .12s, box-shadow .12s', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 }}>
      <div style={{ fontSize: 96, lineHeight: 1 }}>{b.emo}</div>
      {/* dark ink on the bright candy fill — white fails AA here (the RafaView trap). */}
      <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 30, color: CANDY_INK, letterSpacing: '-0.5px' }}>{b.label}</div>
      {b.badge && (
        <div style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(27,17,8,0.22)', color: CANDY_INK, fontFamily: FREDOKA, fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', padding: '4px 10px', borderRadius: 999 }}>{b.badge}</div>
      )}
    </button>
  )
}

function SmallTile({ s, vehicle, destEmoji, countdown, col, row }) {
  const [pressed, setPressed] = useState(false)

  if (s.kind === 'place') {
    // STAY hero tile — the place, in candy. Replaces the road/countdown map tile;
    // still opens the adventure map (which shows a stay empty-state).
    return (
      <button type="button" data-testid="rafa-pad-place-tile" onClick={s.onClick} onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
        style={{ gridColumn: col, gridRow: row, border: 'none', cursor: 'pointer', borderRadius: 30, background: `radial-gradient(120% 120% at 50% 20%, ${shade('#FFB12E', 12)}, ${shade('#FFB12E', -38)})`, boxShadow: pressed ? `0 3px 0 ${shade('#FFB12E', -52)}` : `0 9px 0 ${shade('#FFB12E', -52)}`, transform: pressed ? 'translateY(6px)' : 'none', transition: 'transform .12s, box-shadow .12s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', padding: 10, gap: 6 }}>
        <div style={{ fontSize: 52, lineHeight: 1 }}>🏡</div>
        <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 15, color: CANDY_INK, textAlign: 'center', lineHeight: 1.1 }}>{s.label}</div>
        {s.nights > 0 && (
          <div style={{ fontFamily: FREDOKA, fontWeight: 600, fontSize: 12, color: CANDY_INK, opacity: 0.82 }}>
            {s.nights} {s.nights === 1 ? 'night' : 'nights'}
          </div>
        )}
      </button>
    )
  }

  if (s.kind === 'map') {
    // ADVENTURE-MAP tile — mini winding road + vehicle; countdown tucked in a corner chip.
    return (
      <button type="button" data-testid="rafa-map-tile" onClick={s.onClick} onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
        style={{ gridColumn: col, gridRow: row, border: 'none', cursor: 'pointer', borderRadius: 30, background: `radial-gradient(120% 120% at 50% 20%, ${shade('#FFB12E', 12)}, ${shade('#FFB12E', -38)})`, boxShadow: pressed ? `0 3px 0 ${shade('#FFB12E', -52)}` : `0 9px 0 ${shade('#FFB12E', -52)}`, transform: pressed ? 'translateY(6px)' : 'none', transition: 'transform .12s, box-shadow .12s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', padding: 10, gap: 8 }}>
        <div style={{ position: 'relative', width: '74%' }}>
          <svg viewBox="0 0 120 46" style={{ width: '100%', height: 'auto', display: 'block' }} aria-hidden="true">
            <path d="M6 38 C 30 38 28 12 52 12 C 78 12 76 36 114 28" fill="none" stroke={shade('#FFB12E', -52)} strokeWidth="8" strokeLinecap="round" />
            <path d="M6 38 C 30 38 28 12 52 12 C 78 12 76 36 114 28" fill="none" stroke={CANDY_INK} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 6" opacity="0.5" />
            <circle cx="6" cy="38" r="5" fill={CANDY_INK} />
          </svg>
          <div style={{ position: 'absolute', left: '-6%', bottom: -10, fontSize: 22 }}>{vehicle}</div>
          <div style={{ position: 'absolute', right: '-8%', top: -14, fontSize: 26 }}>{destEmoji}</div>
        </div>
        <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 18, color: CANDY_INK }}>Our trip!</div>
        <div style={{ position: 'absolute', bottom: 9, right: 9, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.28)', borderRadius: 999, padding: '3px 9px' }}>
          <span style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 12, color: '#fff' }}>{countdown} {destEmoji}</span>
        </div>
      </button>
    )
  }

  return (
    <button type="button" onClick={s.onClick} onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
      style={{ gridColumn: col, gridRow: row, border: 'none', cursor: 'pointer', borderRadius: 30, background: `radial-gradient(120% 120% at 50% 25%, ${shade(s.tint, 12)}, ${shade(s.tint, -30)})`, boxShadow: pressed ? `0 3px 0 ${shade(s.tint, -46)}` : `0 9px 0 ${shade(s.tint, -46)}`, transform: pressed ? 'translateY(6px)' : 'none', transition: 'transform .12s, box-shadow .12s', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10 }}>
      {s.cue && <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 2 }}>{s.cue}</div>}
      {s.kind === 'tell' ? (
        <div style={{ width: 60, height: 60, borderRadius: 20, background: 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Mic size={34} color="#fff" strokeWidth={2.2} />
        </div>
      ) : (
        <div style={{ fontSize: 56, lineHeight: 1 }}>{s.emo}</div>
      )}
      <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 15, color: CANDY_INK, textAlign: 'center', lineHeight: 1.1 }}>{s.label}</div>
    </button>
  )
}

// short countdown text for the map tile's corner chip
function tripCountdown(trip, destStop) {
  const dayIso = {}
  ;(trip.days || []).forEach((d) => { dayIso[d.n] = d.isoDate })
  const targetIso = (destStop && dayIso[destStop.day]) || trip.dateRangeStart
  if (!targetIso) return 'Our trip'
  const today = new Date().toISOString().slice(0, 10)
  if (targetIso < today) return 'we did it!'
  const n = Math.round((Date.parse(targetIso + 'T00:00:00') - Date.parse(today + 'T00:00:00')) / 86400000)
  if (n <= 0) return 'today!'
  return `${n} ${n === 1 ? 'day' : 'days'}`
}

function emojiFor(stop) {
  // A real flight (flightNumber or the modern segments[] shape) wins over the
  // keyword guess below — see RafaView's twin emojiFor for the same fix.
  if (flightSegments(stop).length) return '✈️'
  const t = `${stop.name} ${stop.kind || ''}`.toLowerCase()
  if (/monster|truck|rocket|axiom|space/.test(t)) return '🚀'
  if (/lion king|theater|show|broadway|circus/.test(t)) return '🎭'
  if (/airbnb|cabin|lodging|hotel|bungalow/.test(t)) return '🛏️'
  if (/pizza|brasserie|breakfast|brunch|lunch|dinner|food/.test(t)) return '🍕'
  if (/empire|sights|skyline|city/.test(t)) return '🏙️'
  if (/flight|airport|lga|lands/.test(t)) return '✈️'
  if (/beach|ocean|sand|water/.test(t)) return '🏖️'
  if (/zoo|animal/.test(t)) return '🦁'
  return '🎯'
}

function pickTint(id) {
  const pool = [ST[1], ST[2], ST[4], ST[0]]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return pool[h % pool.length]
}

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) + pct
  let g = ((n >> 8) & 0xff) + pct
  let b = (n & 0xff) + pct
  r = Math.max(0, Math.min(255, r))
  g = Math.max(0, Math.min(255, g))
  b = Math.max(0, Math.min(255, b))
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}
