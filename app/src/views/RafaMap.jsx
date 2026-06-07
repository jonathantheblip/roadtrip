import { useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { allStops } from '../data/trips'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { flattenPhotoEntries } from '../lib/photoEntries'
import { RafaSound } from '../lib/rafaSound'

// RafaMap — Rafa's Adventure Map (iPad only). A storybook road winding through
// the trip's real stops: visited ones lit green with a ⭐, the vehicle on the
// glowing "you are here," the road-so-far in marching dots and the road-ahead a
// faded treasure-trail, the big event (the trip's anchor/hero stop) glowing at
// the finale. Tap a landmark → it lights up, names itself, and plays a sound.
// "Go!" drives the vehicle along the route with a looping engine. Recreated from
// design_handoff_rafa_adventure_map; DATA-DRIVEN from our real trip model.

const FREDOKA = "'Fredoka', 'Inter Tight', system-ui, sans-serif"
// Rafa's fixed palette (his surface is always his — literal hexes so shade()
// math works; values match themes.css [data-theme='rafa']).
const PAL = {
  bg: '#1B1108', bg2: '#28190C', surface: '#33200F', ink: '#FFF3DF',
  muted: 'rgba(255,243,223,0.74)', accent: '#FFB12E', accentText: '#FFC247',
  accentInk: '#1B1108', good: '#4CC36E', dot: '#E8552E',
  sticker: ['#FFB12E', '#3DA5E0', '#4CC36E', '#FF6B4D', '#C77DFF'],
}

// landmark art derived from stop.kind — works for ANY trip (road trip or not).
// Keys are normalized (UPPERCASE, first word) against our lowercase kinds.
const MAP_ICON_BY_KIND = {
  DRIVE: '🚗', ROAD: '🚗', LOGISTICS: '🚗', TRAVEL: '🚗', ARRIVAL: '✈️', DEPARTURE: '✈️', FLIGHT: '✈️', TRAIN: '🚂', FERRY: '⛴️',
  LODGING: '🏨', HOTEL: '🏨', CHECKIN: '🛎️', AIRBNB: '🏠', HOME: '🏠', FAMILY: '🏡',
  BREAKFAST: '🥐', LUNCH: '🍔', DINNER: '🍝', FOOD: '🍽️', MEAL: '🍽️', SNACK: '🍪', BREAK: '☕', CAFE: '☕', GAS: '⛽',
  SIGHTS: '🏙️', SIGHT: '🏙️', MUSEUM: '🖼️', ART: '🎨', SCULPTURE: '🗿', HISTORY: '🏛️', HISTORIC: '🏛️', TOUR: '🗺️', PARK: '🌳', BEACH: '🏖️', POOL: '🏊', SHOPPING: '🛍️', MALL: '🛍️', BROWSE: '🛍️', SPA: '💆', WALK: '🚶', ZOO: '🦒', BEASTS: '🦁',
  SHOW: '🎭', THEATER: '🎭', CONCERT: '🎵', MOVIE: '🍿', PILGRIMAGE: '⛪', CEREMONY: '🎀', DUTY: '📋', CHOICE: '🎲',
  GAME: '🏐', SPORT: '🏐', MATCH: '🏐', TOURNAMENT: '🏐', VOLLEYBALL: '🏐', PRACTICE: '🏐',
  PARTY: '🎉', BIRTHDAY: '🎂',
}
const KIND_NAME = {
  DRIVE: 'We go!', ROAD: 'We go!', LOGISTICS: 'We go!', TRAVEL: 'We go!', ARRIVAL: 'We landed!', DEPARTURE: 'Fly time!', FLIGHT: 'Fly time!', TRAIN: 'Choo choo!', FERRY: 'Big boat!',
  LODGING: 'Our room!', HOTEL: 'Our room!', CHECKIN: 'Check in!', AIRBNB: 'Our house!', HOME: 'Home!', FAMILY: 'Family!',
  BREAKFAST: 'Yummy time', LUNCH: 'Lunch time!', DINNER: 'Dinner!', FOOD: 'Snack time!', MEAL: 'Snack time!', SNACK: 'Snack!', BREAK: 'Break time', CAFE: 'Treat time', GAS: 'Gas stop!',
  SIGHTS: 'Big sights!', SIGHT: 'Big sights!', MUSEUM: 'Cool stuff!', ART: 'Pretty art!', SCULPTURE: 'Big statues!', HISTORY: 'Long ago!', HISTORIC: 'Long ago!', TOUR: 'Look around!', PARK: 'Play time!', BEACH: 'Beach!', POOL: 'Splash!', SHOPPING: 'Shopping!', MALL: 'Shopping!', BROWSE: 'Shopping!', SPA: 'Relax!', WALK: 'Walk time!', ZOO: 'Animals!', BEASTS: 'Animals!',
  SHOW: 'Showtime!', THEATER: 'Showtime!', CONCERT: 'Music!', MOVIE: 'Movie!', PILGRIMAGE: 'Special place', CEREMONY: 'Big day!', DUTY: 'A stop!', CHOICE: 'We pick!',
  GAME: 'Game time!', SPORT: 'Game time!', MATCH: 'Game time!', TOURNAMENT: 'Game time!', VOLLEYBALL: 'Game time!', PRACTICE: 'Practice!',
  PARTY: 'Party!', BIRTHDAY: 'Birthday!',
}
function kindKey(kind) {
  return String(kind || '').trim().split(/[\s+]+/)[0].toUpperCase()
}
export function stopArt(s) {
  if (!s) return { emoji: '⭐', name: 'A stop!' }
  // a stop may carry its own { emoji, name } for richer art (none seeded yet)
  if (s.mapArt?.emoji) return s.mapArt
  const k = kindKey(s.kind)
  return { emoji: MAP_ICON_BY_KIND[k] || '📍', name: KIND_NAME[k] || 'A stop!' }
}

// geometry: lay N stops on a gentle winding snake; smooth the road through them.
function mapNodes(N, W, H) {
  const x0 = 140, x1 = W - 165, y0 = 205, y1 = H - 155
  const rows = N <= 4 ? 1 : N <= 6 ? 2 : N <= 12 ? 3 : 4
  const cols = Math.ceil(N / rows)
  const out = []
  for (let i = 0; i < N; i++) {
    const row = Math.floor(i / cols), rowStart = row * cols
    const rowCount = Math.min(cols, N - rowStart), j = i - rowStart
    let fx = rowCount > 1 ? j / (rowCount - 1) : 0.5
    if (row % 2 === 1) fx = 1 - fx // snake reverse
    const fy = rows > 1 ? row / (rows - 1) : 0.5
    const x = x0 + (x1 - x0) * fx + Math.sin(i * 12.9898) * 18 // deterministic jitter
    const y = y0 + (y1 - y0) * fy + Math.cos(i * 4.137) * 14
    out.push({ x, y })
  }
  return out
}
// Catmull-Rom → cubic bezier so the road curves smoothly THROUGH every stop.
function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? `M ${pts[0].x} ${pts[0].y}` : ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`
  }
  return d
}

const MAP_DOODADS = [
  { e: '⛰️', x: 9, y: 22, s: 58 }, { e: '🌲', x: 20, y: 70, s: 44 }, { e: '☁️', x: 33, y: 12, s: 50 },
  { e: '🌲', x: 88, y: 60, s: 46 }, { e: '⭐', x: 70, y: 14, s: 30 }, { e: '🏞️', x: 60, y: 86, s: 50 },
  { e: '☁️', x: 84, y: 30, s: 44 }, { e: '🌵', x: 6, y: 56, s: 38 }, { e: '⭐', x: 46, y: 18, s: 26 },
]

// "current" stop, date-derived (no GPS): the furthest stop whose day has begun.
// archived → last (whole trip done); planning → 0 (at the gate); active → today's.
function currentIndex(trip, stops) {
  const dayIso = {}
  ;(trip.days || []).forEach((d) => { dayIso[d.n] = d.isoDate })
  const today = new Date().toISOString().slice(0, 10)
  let cur = 0
  stops.forEach((s, i) => { const iso = dayIso[s.day]; if (iso && iso <= today) cur = i })
  return cur
}

// days-to the big event (anchor day), for the top-bar pill.
function daysToAnchor(trip, anchorStop) {
  const dayIso = {}
  ;(trip.days || []).forEach((d) => { dayIso[d.n] = d.isoDate })
  const targetIso = anchorStop ? dayIso[anchorStop.day] : trip.dateRangeStart
  if (!targetIso) return null
  const today = new Date().toISOString().slice(0, 10)
  if (targetIso < today) return null // already past
  return Math.round((Date.parse(targetIso + 'T00:00:00') - Date.parse(today + 'T00:00:00')) / 86400000)
}

export function RafaMap({ trip, traveler = 'rafa', onClose }) {
  const c = PAL, ST = c.sticker
  const stops = useMemo(() => {
    const counts = {}
    try {
      flattenPhotoEntries(listMemoriesForTrip(trip.id, traveler)).forEach((e) => {
        if (e.stopId) counts[e.stopId] = (counts[e.stopId] || 0) + 1
      })
    } catch {
      /* counts stay empty */
    }
    return allStops(trip).map((s) => ({ ...s, memCount: counts[s.id] || 0 }))
  }, [trip, traveler])

  const curIdx = useMemo(() => currentIndex(trip, stops), [trip, stops])
  // the BIG EVENT = the hero stop (the trip's exciting peak), else the last stop.
  // This is why a volleyball trip glows the tournament, not the drive home.
  const destIdx = useMemo(() => {
    const i = stops.findIndex((s) => s.id === trip.heroStopId)
    return i >= 0 ? i : stops.length - 1
  }, [stops, trip.heroStopId])
  const days = useMemo(() => daysToAnchor(trip, stops[destIdx]), [trip, stops, destIdx])
  const vehicle = useMemo(() => RafaSound.vehicle(), [])
  const startArt = stopArt(stops[0]), destArt = stopArt(stops[destIdx])
  const stopStatus = (i) => (i < curIdx ? 'past' : i === curIdx ? 'here' : 'next')

  const ref = useRef(null)
  const pathRef = useRef(null)
  const nodeLensRef = useRef([])
  const rafRef = useRef(null)
  const [size, setSize] = useState({ w: 1048, h: 778 })
  const [reveal, setReveal] = useState(null)
  const [driving, setDriving] = useState(false)
  const [drive, setDrive] = useState(null)
  const [muted, setMuted] = useState(RafaSound.isMuted())

  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure); ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const nodes = useMemo(() => mapNodes(stops.length, size.w, size.h), [stops.length, size.w, size.h])
  const roadFull = smoothPath(nodes)
  const roadDone = smoothPath(nodes.slice(0, curIdx + 1))
  const roadAhead = smoothPath(nodes.slice(curIdx))
  const road = shade(c.bg, 30), roadTop = shade(c.bg, 64)

  // measure each stop's arc-length along the road — powers the drive + per-stop sounds
  useEffect(() => {
    const p = pathRef.current; if (!p) return
    let L; try { L = p.getTotalLength() } catch { return }
    const step = Math.max(2, L / 700)
    const best = nodes.map(() => ({ d: Infinity, l: 0 }))
    for (let l = 0; l <= L; l += step) {
      const pt = p.getPointAtLength(l)
      for (let i = 0; i < nodes.length; i++) { const dx = pt.x - nodes[i].x, dy = pt.y - nodes[i].y, dd = dx * dx + dy * dy; if (dd < best[i].d) { best[i].d = dd; best[i].l = l } }
    }
    nodeLensRef.current = best.map((b) => b.l)
  }, [roadFull, size.w, size.h]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); RafaSound.engineStop() }, [])

  function toggleMute() { const m = !muted; setMuted(m); RafaSound.unlock(); RafaSound.setMuted(m) }
  function tapStop(s) { if (!muted) { RafaSound.unlock(); RafaSound.play(stopArt(s).emoji) } setReveal(s) }

  function goDrive() {
    if (driving) return
    const p = pathRef.current, lens = nodeLensRef.current
    if (!p || !lens.length) return
    RafaSound.unlock(); RafaSound.setMuted(muted); RafaSound.engineStart()
    setReveal(null); setDriving(true)
    const target = lens[curIdx] || p.getTotalLength()
    const dur = Math.max(1800, target * 2.4)
    let start = null, fired = -1, prevX = null
    const frame = (ts) => {
      if (start == null) start = ts
      const k = Math.min(1, (ts - start) / dur)
      const L = target * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) // easeInOut
      const pt = p.getPointAtLength(L)
      while (fired < curIdx) { const nl = lens[fired + 1]; if (nl === undefined || L < nl - 0.5) break; fired++; RafaSound.play(stopArt(stops[fired]).emoji) }
      const flip = prevX != null && pt.x > prevX + 0.2; prevX = pt.x // emoji vehicles face left → flip heading right
      setDrive({ x: pt.x, y: pt.y, flip })
      if (k < 1) { rafRef.current = requestAnimationFrame(frame) }
      else { RafaSound.engineStop(); RafaSound.honk(); setDriving(false); setDrive(null) }
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  return (
    <div ref={ref} data-testid="rafa-map" style={{ position: 'fixed', inset: 0, zIndex: 60, overflow: 'hidden', fontFamily: FREDOKA,
      background: `radial-gradient(120% 90% at 30% 0%, ${shade(c.bg, 16)}, ${c.bg} 70%)` }}>
      <style>{`
        @keyframes ftMarch { to { stroke-dashoffset: -44; } }
        @keyframes rmapBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        @keyframes rmapPing { 0% { transform: scale(0.55); opacity: 0.6; } 100% { transform: scale(1.3); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .rmap-anim { animation: none !important; }
          .rmap-march { animation: none !important; }
        }
      `}</style>

      {/* faint treasure-map dot texture */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none',
        backgroundImage: `radial-gradient(${shade(c.bg, 40)} 1.5px, transparent 1.5px)`, backgroundSize: '34px 34px' }} />

      {/* decorative storybook doodads */}
      {MAP_DOODADS.map((d, i) => (
        <div key={i} aria-hidden="true" className="rmap-anim" style={{ position: 'absolute', left: `${d.x}%`, top: `${d.y}%`, fontSize: d.s, opacity: 0.5,
          animation: `rmapBob ${2.4 + (i % 4) * 0.4}s ease-in-out ${i * 0.2}s infinite`, pointerEvents: 'none', filter: 'saturate(0.7)' }}>{d.e}</div>
      ))}

      {/* THE ROAD */}
      <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
        <path d={roadFull} fill="none" stroke={road} strokeWidth={56} strokeLinecap="round" strokeLinejoin="round" />
        <path d={roadFull} fill="none" stroke={roadTop} strokeWidth={42} strokeLinecap="round" strokeLinejoin="round" />
        <path d={roadAhead} fill="none" stroke={c.accent} strokeWidth={7} strokeLinecap="round" strokeDasharray="2 22" opacity={0.28} />
        <path className="rmap-march" d={roadDone} fill="none" stroke={c.accent} strokeWidth={8} strokeLinecap="round" strokeDasharray="2 20"
          style={{ animation: 'ftMarch 1.1s linear infinite' }} />
        <path ref={pathRef} d={roadFull} fill="none" stroke="none" />
      </svg>

      {/* STOP MARKERS */}
      {stops.map((s, i) => {
        const n = nodes[i], art = stopArt(s), status = stopStatus(i)
        const isHere = i === curIdx, isDest = i === destIdx
        if (isHere) {
          return (
            <button key={s.id} onClick={() => tapStop(s)} aria-label="You are here" style={{ position: 'absolute', left: n.x, top: n.y, transform: 'translate(-50%,-50%)',
              border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', width: 0, height: 0 }}>
              {[0, 1].map((k) => <div key={k} className="rmap-anim" style={{ position: 'absolute', left: '50%', top: '50%', width: 132, height: 132, marginLeft: -66, marginTop: -66,
                borderRadius: '50%', border: `5px solid ${c.dot}`, opacity: 0, animation: `rmapPing 2s ${k * 0.8}s ease-out infinite` }} />)}
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: 88, height: 88, marginLeft: -44, marginTop: -44, borderRadius: '50%', background: `radial-gradient(circle at 50% 40%, ${shade(c.dot, 20)}, ${shade(c.dot, -26)})`, boxShadow: `0 0 44px ${c.dot}` }} />
              {!driving && <div className="rmap-anim" style={{ position: 'absolute', left: '50%', top: '50%', fontSize: 64, transform: 'translate(-50%,-72%)', animation: 'rmapBob 1.6s ease-in-out infinite' }}>{vehicle}</div>}
            </button>
          )
        }
        const tint = isDest ? c.accent : status === 'past' ? ST[2] : ST[1]
        const dim = status === 'next' && !isDest
        const sz = isDest ? 132 : 96
        return (
          <button key={s.id} onClick={() => tapStop(s)} aria-label={art.name} style={{ position: 'absolute', left: n.x, top: n.y, transform: 'translate(-50%,-50%)',
            border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}>
            {isDest && [0, 1, 2].map((k) => <div key={k} className="rmap-anim" style={{ position: 'absolute', left: '50%', top: '50%', width: sz + 30, height: sz + 30, marginLeft: -(sz + 30) / 2, marginTop: -(sz + 30) / 2,
              borderRadius: '50%', border: `5px solid ${c.accent}`, opacity: 0, animation: `rmapPing 2.4s ${k * 0.7}s ease-out infinite` }} />)}
            <div style={{ position: 'relative', width: sz, height: sz, borderRadius: '50%',
              background: `radial-gradient(120% 120% at 50% 25%, ${shade(tint, 14)}, ${shade(tint, -30)})`,
              boxShadow: `0 ${isDest ? 12 : 8}px 0 ${shade(tint, -48)}${isDest ? `, 0 0 46px ${c.accent}` : ''}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.62 : 1,
              border: dim ? `4px dashed ${shade(tint, 30)}` : 'none' }}>
              <span style={{ fontSize: isDest ? 74 : 52, lineHeight: 1, filter: dim ? 'grayscale(0.35)' : 'none' }}>{art.emoji}</span>
              {status === 'past' && <div style={{ position: 'absolute', top: -6, right: -6, fontSize: 30 }}>⭐</div>}
              {isDest && <div aria-hidden="true" className="rmap-anim" style={{ position: 'absolute', top: -14, right: -10, fontSize: 34, animation: 'rmapBob 1.8s ease-in-out infinite' }}>✨</div>}
            </div>
          </button>
        )
      })}

      {/* TOP BAR — back + mute + journey ribbon + days-to-go (absorbs the countdown) */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'calc(env(safe-area-inset-top) + 18px) 28px 18px', zIndex: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} aria-label="Back" style={{ width: 56, height: 56, borderRadius: '50%', background: c.surface, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 5px 0 ${c.bg2}` }}><ChevronLeft size={28} color={c.ink} /></button>
          <button onClick={toggleMute} aria-label={muted ? 'Sound off' : 'Sound on'} style={{ width: 56, height: 56, borderRadius: '50%', background: c.surface, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 5px 0 ${c.bg2}`, fontSize: 26 }}>{muted ? '🔇' : '🔊'}</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px', borderRadius: 999, background: 'rgba(0,0,0,0.32)' }}>
          <span style={{ fontSize: 26 }}>{startArt.emoji}</span>
          <span style={{ color: c.accentText, letterSpacing: 6, fontSize: 18 }}>· · ·</span>
          <span style={{ fontSize: 26 }}>{destArt.emoji}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 999,
          background: `radial-gradient(120% 120% at 50% 20%, ${shade(c.accent, 12)}, ${shade(c.accent, -34)})`, boxShadow: `0 6px 0 ${shade(c.accent, -50)}`, fontFamily: FREDOKA, fontWeight: 700, color: c.accentInk }}>
          {days == null
            ? <span style={{ fontSize: 18 }}>We made it! {destArt.emoji}</span>
            : days <= 0
              ? <span style={{ fontSize: 18 }}>Today! {destArt.emoji}</span>
              : <><span style={{ fontSize: 26 }}>{days}</span><span style={{ fontSize: 16 }}>{days === 1 ? 'day!' : 'days!'} {destArt.emoji}</span></>}
        </div>
      </div>

      {/* the vehicle driving the route (engine + per-stop sounds fire in goDrive) */}
      {drive && (
        <div aria-hidden="true" style={{ position: 'absolute', left: drive.x, top: drive.y, fontSize: 66, lineHeight: 1, zIndex: 4,
          transform: `translate(-50%,-72%) scaleX(${drive.flip ? -1 : 1})` }}>{vehicle}</div>
      )}

      {/* GO! — drive the trip so far, hitting each landmark's sound on the way */}
      <button onClick={goDrive} disabled={driving} aria-label="Drive the trip" style={{ position: 'absolute', left: 28, bottom: 'calc(env(safe-area-inset-bottom) + 24px)', zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px 16px', borderRadius: 999, border: 'none', cursor: driving ? 'default' : 'pointer',
        background: driving ? c.bg2 : `radial-gradient(120% 120% at 50% 20%, ${shade(c.good, 16)}, ${shade(c.good, -30)})`,
        boxShadow: driving ? 'none' : `0 8px 0 ${shade(c.good, -48)}`, fontFamily: FREDOKA, fontWeight: 700 }}>
        <span style={{ fontSize: 26 }}>{driving ? '🚗💨' : '▶️'}</span>
        {/* dark ink on the green candy fill — white fails AA on the mid-tone (the RafaView trap) */}
        <span style={{ fontSize: 22, fontWeight: 700, color: driving ? c.muted : c.accentInk }}>{driving ? 'Driving…' : 'Go!'}</span>
      </button>

      {/* REVEAL CARD — tap a landmark to light it up */}
      {reveal && (() => {
        const art = stopArt(reveal), status = stopStatus(stops.findIndex((s) => s.id === reveal.id))
        const isHere = reveal.id === stops[curIdx]?.id, isDest = reveal.id === stops[destIdx]?.id
        const tint = isDest ? c.accent : isHere ? c.dot : status === 'past' ? ST[2] : ST[1]
        return (
          <div onClick={() => setReveal(null)} style={{ position: 'absolute', inset: 0, zIndex: 6, background: 'rgba(15,9,4,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', padding: '34px 46px 36px', borderRadius: 40, background: c.surface, boxShadow: `0 14px 0 ${c.bg2}`, position: 'relative', maxWidth: 540 }}>
              <button onClick={() => setReveal(null)} aria-label="Close" style={{ position: 'absolute', top: 16, right: 16, width: 48, height: 48, borderRadius: '50%', background: c.bg2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={24} color={c.ink} /></button>
              <div style={{ width: 176, height: 176, margin: '0 auto', borderRadius: '50%', background: `radial-gradient(120% 120% at 50% 25%, ${shade(tint, 14)}, ${shade(tint, -30)})`, boxShadow: `0 10px 0 ${shade(tint, -48)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="rmap-anim" style={{ fontSize: 104, animation: 'rmapBob 2s ease-in-out infinite' }}>{art.emoji}</span>
              </div>
              <div style={{ marginTop: 22, fontFamily: FREDOKA, fontWeight: 700, fontSize: 34, color: c.ink }}>{art.name}</div>
              {isHere && <div style={{ marginTop: 6, fontFamily: FREDOKA, fontWeight: 700, fontSize: 20, color: c.dot }}>We are here! {vehicle}</div>}
              {reveal.memCount > 0 && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                  {Array.from({ length: Math.min(reveal.memCount, 6) }).map((_, k) => (
                    <div key={k} style={{ width: 40, height: 40, borderRadius: 14, background: c.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📸</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
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
