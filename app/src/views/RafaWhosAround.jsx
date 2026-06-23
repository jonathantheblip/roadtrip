// RafaWhosAround (slice 8 follow-up) — Rafa's kid version of "Who's around".
// Design authority: app/docs/design/rafa-whos-around. Instead of the older lenses'
// tidy band, Rafa gets a living storybook DIORAMA: the family appear as big bobbing
// character bubbles in one of two coarse zones — 🏠 Special house / 🧭 Out & about —
// and tapping a face opens a giant, warm reveal with a "Wave hi!".
//
// Reads the SAME real presence data the band uses (usePresence().people). Privacy is
// already upstream: kids only ever get a coarse bucket, never a precise dot — there is
// nothing precise to draw here. Near-zero reading: faces, color, and motion carry it.
//
// The wave is LOCAL delight for v1 (an optimistic flip — no data leaves the device);
// a real family-wide wave would need a tiny nudge channel (a flagged follow-up).

import { useState } from 'react'
import { TRAVELER_ORDER, TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import { displayName } from '../lib/surprises'
import { freshness } from '../lib/presenceRules'

const FREDOKA = "'Fredoka', 'Inter Tight', system-ui, sans-serif"
const ST = ['#FFB12E', '#3DA5E0', '#4CC36E', '#FF6B4D', '#C77DFF'] // rafa sticker palette
const GOOD = '#4CC36E' // the green "here right now" heartbeat
const CANDY_INK = '#1B1108'
// Each family member's constant buddy sticker (same across every lens).
const BUDDY = { helen: '🌿', jonathan: '🧭', aurelia: '🎞️', rafa: '🚛' }

// Lighten/darken a hex by pct — the candy "stacked shadow" depends on it.
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255
  let g = (n >> 8) & 255
  let b = n & 255
  const f = pct / 100
  const adj = (c) => Math.max(0, Math.min(255, Math.round(c + (f < 0 ? c * f : (255 - c) * f))))
  r = adj(r)
  g = adj(g)
  b = adj(b)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

// One presence row → the kid view's zone + liveness, or null to omit the person.
// Only a KNOWN coarse bucket places someone (honest: unknown/not-sharing → not drawn).
function viewFor(row, nowMs) {
  if (!row) return null
  const zone = row.placeBucket === 'at_place' ? 'cabin' : row.placeBucket === 'out' ? 'out' : null
  if (!zone) return null
  return { zone, live: freshness(row.updatedAt, nowMs).live }
}

function nameFor(id, isMe) {
  if (isMe) return 'me'
  const n = displayName(id, 'rafa') // Mama / Papa / Sissy
  return n || TRAVELERS[id]?.name || id
}

// ── one family character bubble — the heart of the whole thing ──
function Bubble({ id, live, size = 62, badge = true, onClick, delay = 0 }) {
  const col = TRAVELER_DOT[id] || '#777'
  const initial = (TRAVELERS[id]?.name || '?').slice(0, 1)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={onClick ? `${nameFor(id, id === 'rafa')} — ${live ? 'here right now' : 'back in a little bit'}` : undefined}
      style={{
        position: 'relative', border: 'none', background: 'transparent', padding: 0,
        cursor: onClick ? 'pointer' : 'default', width: size, flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
      }}
    >
      <div style={{ position: 'relative', width: size, height: size, animation: live ? `ftBob ${1.8 + delay}s ease-in-out ${delay}s infinite` : 'none' }}>
        {live && (
          <div aria-hidden="true" style={{ position: 'absolute', inset: -6, borderRadius: '50%', boxShadow: `0 0 0 4px ${col}, 0 0 22px ${col}`, opacity: 0.55, animation: 'ftPing 2.2s ease-out infinite' }} />
        )}
        <div
          style={{
            width: size, height: size, borderRadius: '50%',
            background: `radial-gradient(120% 120% at 50% 28%, ${shade(col, 30)}, ${shade(col, -22)})`,
            boxShadow: `0 ${Math.round(size * 0.1)}px 0 ${shade(col, -48)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FREDOKA, fontWeight: 700, fontSize: size * 0.42, color: '#fff',
            border: live ? '3px solid rgba(255,255,255,0.9)' : '3px solid rgba(255,255,255,0.35)',
            opacity: live ? 1 : 0.7, filter: live ? 'none' : 'saturate(0.6)',
          }}
        >
          {initial}
        </div>
        {badge && (
          <div aria-hidden="true" style={{ position: 'absolute', bottom: -3, right: -5, width: size * 0.42, height: size * 0.42, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.26 }}>
            {BUDDY[id]}
          </div>
        )}
        {live ? (
          <div aria-hidden="true" style={{ position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: GOOD, border: '2.5px solid #fff', boxShadow: `0 0 8px ${GOOD}` }} />
        ) : (
          <div aria-hidden="true" style={{ position: 'absolute', top: -8, left: -6, fontSize: 18 }}>💤</div>
        )}
      </div>
    </button>
  )
}

// ── the diorama scene — the phone-home hero ──
function Scene({ family, onPick }) {
  const cabinPpl = family.filter((p) => p.view.zone === 'cabin')
  const outPpl = family.filter((p) => p.view.zone === 'out')

  const Zone = ({ side, emojiBack, label, labelEmoji, people }) => (
    <div style={{ position: 'relative', flex: 1, height: '100%' }}>
      <div style={{ position: 'absolute', top: 12, left: side === 'left' ? 12 : 'auto', right: side === 'right' ? 12 : 'auto', zIndex: 3, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.9)', boxShadow: '0 3px 8px rgba(0,0,0,0.18)' }}>
        <span style={{ fontSize: 16 }} aria-hidden="true">{labelEmoji}</span>
        <span style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 14, color: '#3a2a16' }}>{label}</span>
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', bottom: '32%', left: '50%', transform: 'translateX(-50%)', fontSize: 92, opacity: 0.95, filter: 'drop-shadow(0 8px 10px rgba(0,0,0,0.25))', pointerEvents: 'none' }}>{emojiBack}</div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: side === 'left' ? 0 : 6, zIndex: 4, flexWrap: 'wrap', padding: '0 6px' }}>
        {people.map((p, i) => (
          <Bubble key={p.id} id={p.id} live={p.view.live} size={62} delay={i * 0.25} onClick={() => onPick(p.id)} />
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ position: 'relative', height: 286, borderRadius: 30, overflow: 'hidden', background: 'linear-gradient(#bfe3f2 0%, #d8eecf 58%, #cfe6c0 58%, #b9dca6 100%)', boxShadow: `0 9px 0 ${shade('#FFB12E', -55)}, inset 0 0 0 4px rgba(255,255,255,0.5)` }}>
      <div aria-hidden="true" style={{ position: 'absolute', top: 14, right: 16, fontSize: 40, filter: 'drop-shadow(0 0 14px rgba(255,200,60,0.7))', animation: 'ftBob 4s ease-in-out infinite' }}>☀️</div>
      <div aria-hidden="true" style={{ position: 'absolute', top: 30, left: 22, fontSize: 30, opacity: 0.92, animation: 'ftBob 5s ease-in-out 0.4s infinite' }}>☁️</div>
      <div aria-hidden="true" style={{ position: 'absolute', bottom: 4, left: 10, fontSize: 18, opacity: 0.8 }}>🌼</div>
      <div aria-hidden="true" style={{ position: 'absolute', bottom: 2, right: 14, fontSize: 18, opacity: 0.8 }}>🌷</div>
      <div aria-hidden="true" style={{ position: 'absolute', top: '40%', bottom: 0, left: '50%', width: 3, transform: 'translateX(-50%)', background: 'repeating-linear-gradient(rgba(255,255,255,0.7) 0 8px, transparent 8px 16px)', opacity: 0.7, zIndex: 2 }} />
      <div style={{ display: 'flex', height: '100%' }}>
        <Zone side="left" emojiBack="🏡" label="Special house" labelEmoji="🏠" people={cabinPpl} />
        <Zone side="right" emojiBack="⛰️" label="Out & about" labelEmoji="🧭" people={outPpl} />
      </div>
    </div>
  )
}

// ── the giant warm reveal when Rafa taps a face ──
function Reveal({ person, onClose }) {
  const [waved, setWaved] = useState(false)
  const { id, view, isMe } = person
  const placeWord = view.zone === 'cabin' ? 'at the special house' : 'out & about'
  const placeEmoji = view.zone === 'cabin' ? '🏠' : '🧭'
  return (
    <div onClick={onClose} role="dialog" aria-label={nameFor(id, isMe)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(20,12,5,0.74)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 320, background: 'var(--surface, #33200F)', borderRadius: 36, padding: '30px 26px 28px', textAlign: 'center', position: 'relative', boxShadow: '0 16px 0 var(--bg2, #28190C)' }}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 16, right: 16, width: 46, height: 46, borderRadius: '50%', background: 'var(--bg2, #28190C)', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 22, fontFamily: FREDOKA }}>✕</button>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <Bubble id={id} live={view.live} size={120} onClick={undefined} />
        </div>
        <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 34, color: 'var(--text)', marginTop: 12 }}>{nameFor(id, isMe)}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 18px', borderRadius: 999, background: 'var(--bg2, #28190C)' }}>
          <span style={{ fontSize: 24 }} aria-hidden="true">{placeEmoji}</span>
          <span style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 20, color: 'var(--text)' }}>{isMe ? 'that’s you!' : placeWord}</span>
        </div>
        <div style={{ marginTop: 14 }}>
          {view.live ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', background: GOOD, boxShadow: `0 0 10px ${GOOD}`, animation: 'ftBlink 1.4s infinite' }} />
              <span style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 18, color: GOOD }}>here right now!</span>
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }} aria-hidden="true">💤</span>
              <span style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 18, color: 'var(--muted)' }}>back in a little bit</span>
            </div>
          )}
        </div>
        {!isMe && (
          <button
            type="button"
            onClick={() => setWaved(true)}
            disabled={waved}
            style={{ marginTop: 22, width: '100%', border: 'none', cursor: waved ? 'default' : 'pointer', borderRadius: 26, background: waved ? GOOD : ST[1], padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, boxShadow: `0 7px 0 ${shade(waved ? GOOD : ST[1], -45)}`, transition: 'background .2s' }}
          >
            <span style={{ fontSize: 26, animation: waved ? 'none' : 'ftBob 1s ease-in-out infinite' }} aria-hidden="true">{waved ? '💛' : '👋'}</span>
            <span style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 22, color: '#fff' }}>{waved ? `Wave sent to ${nameFor(id, isMe)}!` : 'Wave hi!'}</span>
          </button>
        )}
        {isMe && <div style={{ marginTop: 20, fontFamily: FREDOKA, fontWeight: 600, fontSize: 16, color: 'var(--muted)' }}>Wave at your family! 👋</div>}
      </div>
    </div>
  )
}

// ── the feature: heading + scene + tap-reveal, on real presence data ──
export function RafaWhosAround({ people = [], now = Date.now() }) {
  const [pickId, setPickId] = useState(null)

  // Map real presence rows → the family the scene draws (only those with a known
  // zone). rafa himself is "me".
  const family = TRAVELER_ORDER.map((id) => {
    const row = people.find((p) => p.traveler === id)
    const view = viewFor(row, now)
    return view ? { id, view, isMe: id === 'rafa' } : null
  }).filter(Boolean)

  if (family.length === 0) return null // nobody located yet → don't draw an empty scene

  const liveOthers = family.filter((p) => p.view.live && !p.isMe).length
  const picked = family.find((p) => p.id === pickId) || null

  return (
    <section data-testid="rafa-whos-around" aria-label="Where's everybody?" style={{ padding: '18px 16px 0' }}>
      <div style={{ padding: '0 4px 10px' }}>
        <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 25, color: 'var(--text)' }}>Where&rsquo;s everybody? 👀</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
          <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: '50%', background: GOOD, boxShadow: `0 0 8px ${GOOD}`, animation: 'ftBlink 1.4s infinite' }} />
          <span style={{ fontFamily: FREDOKA, fontWeight: 600, fontSize: 15, color: 'var(--muted)' }}>
            {liveOthers > 0 ? `${liveOthers} here right now · tap a face!` : 'tap a face!'}
          </span>
        </div>
      </div>
      <Scene family={family} onPick={setPickId} />
      {picked && <Reveal person={picked} onClose={() => setPickId(null)} />}
    </section>
  )
}
