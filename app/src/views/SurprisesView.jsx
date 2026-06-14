// SurprisesView — the Surprise / Reveal surface + composer, themed per lens.
// Recreated from the design handoff (design_handoff_surprise_reveal/src/
// surprises.jsx) — pixel-faithful markup, copy, and motion — but driven by the
// app's real CSS theme variables (--bg / --card / --accent / --accent-text /
// --accent-ink / --muted / --faint / --border / --line-bold / --font-display)
// instead of the prototype's inline palette object, and wired to the real
// store (lib/memoryStore + lib/surprises) instead of in-memory demo data.
//
// Three stacked sections, all re-skinned to the active `traveler`:
//   1. 🎁 Something's coming — masked TEASERS hidden FROM you (title blurred,
//      reveal-trigger visible). Covers are deliberately absent.
//   2. You're keeping — surprises you authored, in full, each with a manual
//      "Reveal now" (→ 🎉 celebration, then marked revealed). A cover-mode one
//      also shows "What they see instead".
//   3. Claude privacy promise — the standing explanation of the masking rule.
// "+ New" opens the composer.

import { useState, useEffect, useMemo } from 'react'
import { TRAVELER_ORDER, TRAVELER_DOT } from '../data/travelers'
import {
  saveMemory,
  listTripSurpriseRecords,
  listMemoriesForTrip,
  revealSurprise,
} from '../lib/memoryStore'
import { authoredSurprises, teasersMaskedFrom, revealedForViewer, tripSurprisesKeptBy, stopSurprisesKeptBy, displayName, revealLabel, wrapItemsForKind, memGlyph, stopGlyph } from '../lib/surprises'
import { draftCover } from '../lib/workerSync'

// Normalize a whole-trip surprise (3b) into the kept-card shape so the same card
// UI renders it. `isTrip`/`_trip` let doReveal/openEdit route to the trip write.
function tripAsKept(t) {
  const s = t.surprise || {}
  return {
    id: t.id,
    isTrip: true,
    _trip: t,
    authorTraveler: s.author,
    hideFrom: s.hideFrom || [],
    reveal: s.reveal,
    conceal: s.conceal,
    cover: s.cover,
    revealed: s.revealed,
    surprise: { what: 'The whole trip', icon: '🗺️', title: t.title || 'A trip', detail: t.dateRange || t.subtitle || '', tint: '#3A5A7A' },
  }
}

// Normalize a per-stop surprise (Slice 2) into the kept-card shape. `isStop`/
// `_stopRef` let doReveal/openEdit route to the trip write (the stop rides inside
// the trip's data_json). Returned by stopSurprisesKeptBy as { stop, tripId, dayIso }.
function stopAsKept({ stop, tripId, dayIso }) {
  const s = stop.surprise || {}
  return {
    id: stop.id,
    isStop: true,
    _stopRef: { tripId, dayIso, stopId: stop.id },
    authorTraveler: s.author,
    hideFrom: s.hideFrom || [],
    reveal: s.reveal,
    conceal: s.conceal,
    cover: s.cover,
    revealed: s.revealed,
    surprise: { what: 'A stop', source: 'stop', icon: stopGlyph(stop.kind), title: stop.name || stop.title || 'A place', detail: [dayIso, stop.time].filter(Boolean).join(' · '), tint: '#3A5A7A' },
  }
}

// Per-lens corner radius — mirrors themes.css --radius (2 / 18 / 4 / 24). The
// design does arithmetic on it (Math.min(r,18), r-4, r+6) so we keep the numeric.
const RADIUS = { jonathan: 2, helen: 18, aurelia: 4, rafa: 24 }

// Lighten/darken a #rrggbb by an additive amount (for the thumbnail gradient).
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) + pct, g = ((n >> 8) & 0xff) + pct, b = (n & 0xff) + pct
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b))
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

// ── Icons (only the glyphs this surface uses) ────────────────────────────────
const Ic = {
  left: (p) => <svg width={p.s || 18} height={p.s || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>,
  lock: (p) => <svg width={p.s || 18} height={p.s || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  plus: (p) => <svg width={p.s || 18} height={p.s || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  x: (p) => <svg width={p.s || 18} height={p.s || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>,
  eye: (p) => <svg width={p.s || 18} height={p.s || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>,
  eyeOff: (p) => <svg width={p.s || 18} height={p.s || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.4 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M6.1 6.1A18.4 18.4 0 0 0 2 12s3.6 8 10 8a9 9 0 0 0 5.9-2.1M2 2l20 20" /></svg>,
  check: (p) => <svg width={p.s || 18} height={p.s || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>,
  right: (p) => <svg width={p.s || 18} height={p.s || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>,
  search: (p) => <svg width={p.s || 18} height={p.s || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>,
  gift: (p) => <svg width={p.s || 18} height={p.s || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M5 12v9h14v-9M12 8S10 2 7.5 4 12 8 12 8zM12 8s2-6 4.5-4S12 8 12 8z" /></svg>,
  pencil: (p) => <svg width={p.s || 18} height={p.s || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
}

// Mount transition. presets: 'sheet' (slide up) | 'pop'. Settles to a visible
// end-state (survives reduced-motion / capture) — starts visible when the user
// prefers reduced motion.
function Mounted({ children, preset = 'fade', dur = 320, style, ...rest }) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  const from = { fade: { opacity: 0 }, sheet: { transform: 'translateY(100%)' }, pop: { opacity: 0, transform: 'scale(0.92)' } }[preset] || {}
  const [on, setOn] = useState(!!reduce)
  useEffect(() => {
    if (reduce) return
    const id = setTimeout(() => setOn(true), 24)
    return () => clearTimeout(id)
  }, [reduce])
  return (
    <div style={{
      opacity: on ? 1 : (from.opacity ?? 1),
      transform: on ? 'none' : (from.transform ?? 'none'),
      transition: `opacity ${dur}ms ease, transform ${dur}ms cubic-bezier(.2,.8,.2,1)`,
      ...style,
    }} {...rest}>{children}</div>
  )
}

// Selectable pill (composer: what / who / when / mode).
function Chip({ on, onClick, children, icon, dot }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 999,
      border: `1px solid ${on ? 'var(--accent)' : 'var(--line-bold)'}`,
      background: on ? 'var(--accent)' : 'transparent',
      color: on ? 'var(--accent-ink, #fff)' : 'var(--text)',
      cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 500,
    }}>
      {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
      {dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? 'var(--accent-ink, #fff)' : dot }} />}
      {children}
    </button>
  )
}

// Mono micro-label section eyebrow.
function CmpLabel({ children }) {
  return <div style={{ fontFamily: 'var(--font-body)', fontSize: 9.5, letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, margin: '18px 0 10px' }}>{children}</div>
}

// Gradient thumbnail standing in for the surprise's media.
function Thumb({ tint = '#6A5E4C', icon }) {
  return (
    <div style={{
      width: 50, height: 50, borderRadius: 'inherit', flexShrink: 0, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(150deg, ${shade(tint, 22)}, ${tint} 48%, ${shade(tint, -20)})`,
    }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{icon}</div>
    </div>
  )
}

// ── THE SURFACE ──────────────────────────────────────────────────────────────
export function SurprisesView({ trip, trips, traveler, tripsApi, onClose }) {
  const tripId = trip?.id
  const serif = 'var(--font-display, var(--font-body, system-ui))'
  const ital = traveler === 'aurelia' ? 'italic' : 'normal'
  const heavy = traveler === 'rafa' ? 700 : 600
  const r = RADIUS[traveler] ?? 8

  const [tick, setTick] = useState(0) // bump to re-read the store after writes
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState(null) // the surprise being edited, or null
  const [justRevealed, setJustRevealed] = useState(null)

  const raw = useMemo(() => (tripId ? listTripSurpriseRecords(tripId) : []), [tripId, tick])
  // "You're keeping" = memory surprises authored by viewer + whole-trip surprises
  // they authored (3b), normalized to the same card shape.
  const kept = useMemo(() => {
    const mems = authoredSurprises(raw, traveler)
    const tripKept = tripSurprisesKeptBy(trips || [], traveler).map(tripAsKept)
    const stopKept = stopSurprisesKeptBy(trips || [], traveler).map(stopAsKept)
    return [...tripKept, ...stopKept, ...mems]
  }, [raw, traveler, trips, tick])
  const coming = useMemo(() => teasersMaskedFrom(raw, traveler), [raw, traveler])
  const revealedForMe = useMemo(() => revealedForViewer(raw, traveler), [raw, traveler])

  function doReveal(s) {
    setJustRevealed(s)
    setTimeout(() => {
      if (s.isTrip && s._trip && tripsApi) {
        tripsApi.upsertTrip({ ...s._trip, surprise: { ...s._trip.surprise, revealed: new Date().toISOString() } })
      } else if (s.isStop && s._stopRef && tripsApi) {
        const { tripId, dayIso, stopId } = s._stopRef
        const target = (trips || []).find((t) => t.id === tripId) || trip
        if (target) {
          const days = (target.days || []).map((d) => {
            if (dayIso && d.isoDate !== dayIso) return d
            return { ...d, stops: (d.stops || []).map((st) => (st.id === stopId ? { ...st, surprise: { ...st.surprise, revealed: new Date().toISOString() } } : st)) }
          })
          tripsApi.upsertTrip({ ...target, days })
        }
      } else {
        revealSurprise(s.id)
      }
      setJustRevealed(null)
      setTick((n) => n + 1)
    }, 1700)
  }

  function onCreate(payload) {
    const mask = {
      hideFrom: payload.hideFrom,
      reveal: payload.reveal,
      conceal: payload.conceal,
      cover: payload.cover,
    }
    if (payload.source === 'trip') {
      // Whole-trip surprise (3b): mark a real TRIP hidden (rides in data_json,
      // no schema change). The target is the edited trip or the active trip.
      const target = (payload.refId && (trips || []).find((t) => t.id === payload.refId)) || trip
      if (target && tripsApi) {
        tripsApi.upsertTrip({ ...target, surprise: { author: traveler, ...mask, revealed: target.surprise?.revealed || undefined } })
      }
    } else if (payload.source === 'stop') {
      // Per-stop surprise (Slice 2): mark ONE stop hidden inside the trip's
      // days[] (rides in data_json, no schema change). Mark the RAW trip (from
      // `trips`/allTrips), not the self-masked `trip` prop, so it attaches to the
      // real stop. Find by dayIso+id, attach the masking layer, upsert. Preserve a
      // prior `revealed` on edit. The worker's preserveHiddenStops guard protects
      // it on save-back.
      const target = (trips || []).find((t) => t.id === trip?.id) || trip
      if (target && tripsApi && payload.stopId) {
        const days = (target.days || []).map((d) => {
          if (payload.dayIso && d.isoDate !== payload.dayIso) return d
          return {
            ...d,
            stops: (d.stops || []).map((s) =>
              s.id === payload.stopId
                ? { ...s, surprise: { author: traveler, ...mask, revealed: s.surprise?.revealed || undefined } }
                : s
            ),
          }
        })
        tripsApi.upsertTrip({ ...target, days })
      }
    } else if (payload.source === 'wrap' && payload.memory) {
      // WRAP: attach the masking layer to the REAL memory so it actually
      // disappears for the hidden-from person. Spread the whole memory first —
      // saveMemory builds the record from its args, so the content (text /
      // caption / photoRefs / stopId / kind) must ride along or it'd be wiped.
      saveMemory({ ...payload.memory, ...mask, surprise: payload.surprise })
    } else {
      // DESCRIBE: a new (or edited) content memory carrying the typed secret +
      // masking. The typed title becomes the memory's text so it reads as a
      // real memory once revealed.
      saveMemory({
        id: payload.id || undefined,
        tripId,
        stopId: null,
        authorTraveler: traveler,
        visibility: 'shared',
        kind: 'text',
        text: payload.surprise.title,
        ...mask,
        surprise: payload.surprise,
      })
    }
    setComposing(false)
    setEditing(null)
    setTick((n) => n + 1)
  }

  function openEdit(s) {
    setEditing(s)
    setComposing(true)
  }
  function closeComposer() {
    setComposing(false)
    setEditing(null)
  }

  return (
    <div data-testid="surprises-view" style={{ position: 'fixed', inset: 0, background: 'var(--bg)', color: 'var(--text)', zIndex: 70, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-body, system-ui)' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(env(safe-area-inset-top) + 10px) 16px 6px' }}>
        <button onClick={onClose} aria-label="Back" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)', padding: 0, display: 'flex' }}><Ic.left s={22} /></button>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--muted)' }}>Surprises</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 18px 28px' }}>
        <h1 style={{ fontFamily: serif, fontSize: traveler === 'rafa' ? 30 : 32, fontWeight: heavy, fontStyle: ital, letterSpacing: -0.4, margin: 0 }}>{traveler === 'rafa' ? 'Surprises! 🎁' : 'Surprises'}</h1>
        <div style={{ fontFamily: serif, fontSize: 14, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', marginTop: 5, lineHeight: 1.45 }}>
          {traveler === 'rafa' ? 'Some things are a secret until the right moment!' : 'Hide a moment, a photo, or a whole trip — for one person or for everyone — until the moment is right.'}
        </div>

        {/* Revealed for you — surprises that were hidden from you and have since
            been unwrapped (where the ⋯ cue dot leads). */}
        {revealedForMe.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--accent-text, var(--muted))', fontWeight: 600, marginBottom: 11 }}>✨ Revealed for you</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {revealedForMe.map((s) => {
                const disp = s.surprise || {}
                return (
                  <div key={s.id} style={{ display: 'flex', gap: 12, padding: 13, borderRadius: Math.min(r, 18), border: '1px solid var(--border)', background: 'var(--card)' }}>
                    <div style={{ borderRadius: Math.min(r - 4, 12), overflow: 'hidden', flexShrink: 0 }}>
                      <Thumb tint={disp.tint || '#5C5048'} icon={disp.icon || '🎁'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)' }}>{disp.what || 'A surprise'} · from {displayName(s.authorTraveler, traveler)}</div>
                      <div style={{ fontFamily: serif, fontSize: 16, fontWeight: heavy, fontStyle: ital, marginTop: 2, lineHeight: 1.2 }}>{disp.title || 'A surprise'}</div>
                      {disp.detail && <div style={{ fontFamily: serif, fontSize: 12.5, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', marginTop: 3, lineHeight: 1.35 }}>{disp.detail}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Something's coming — masked teasers (blurred title, reveal-trigger only) */}
        {coming.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--accent-text, var(--muted))', fontWeight: 600, marginBottom: 11 }}>🎁 Something's coming</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {coming.map((s) => {
                const what = (s.surprise?.what || 'thing').toLowerCase()
                return (
                  <div key={s.id} style={{ position: 'relative', borderRadius: Math.min(r, 18), overflow: 'hidden', border: '1px dashed var(--line-bold)', background: 'var(--card)', padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🎁</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: serif, fontSize: 17, fontWeight: heavy, fontStyle: ital, filter: 'blur(6px)', userSelect: 'none', color: 'var(--muted)' }}>a wrapped {what}</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted)', marginTop: 6 }}>reveals {revealLabel(s.reveal)}</div>
                      </div>
                      <span style={{ color: 'var(--faint)', display: 'flex' }}><Ic.lock s={16} /></span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* You're keeping — authored surprises, in full, each revealable */}
        <div style={{ marginTop: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>You're keeping</div>
            <button onClick={() => setComposing(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid var(--accent)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', color: 'var(--accent-text, var(--accent))', fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}><Ic.plus s={12} /> New</button>
          </div>
          {kept.length === 0 ? (
            <div style={{ border: '1px dashed var(--line-bold)', borderRadius: Math.min(r, 18), padding: '22px 16px', textAlign: 'center', fontFamily: serif, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', fontSize: 14 }}>
              You're not hiding anything yet. {traveler === 'rafa' ? 'Make one for Mama or Papa!' : 'Plan one above.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {kept.map((s) => {
                const done = !!s.revealed
                const disp = s.surprise || {}
                return (
                  <div key={s.id} style={{ borderRadius: Math.min(r, 18), overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--card)', opacity: done ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', gap: 12, padding: 13 }}>
                      <div style={{ borderRadius: Math.min(r - 4, 12), overflow: 'hidden', flexShrink: 0 }}>
                        <Thumb tint={disp.tint || '#5C5048'} icon={disp.icon || '🎁'} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)' }}>{disp.what || 'A surprise'}{done ? ' · revealed' : ''}</div>
                        <div style={{ fontFamily: serif, fontSize: 16, fontWeight: heavy, fontStyle: ital, marginTop: 2, lineHeight: 1.2 }}>{disp.title || 'A surprise'}</div>
                        <div style={{ fontFamily: serif, fontSize: 12.5, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', marginTop: 3, lineHeight: 1.35 }}>{disp.detail}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 13px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ color: 'var(--faint)', display: 'flex' }}><Ic.lock s={12} /></span>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 0.5, color: 'var(--muted)' }}>
                          hidden from {(s.hideFrom || []).map((id) => displayName(id, traveler)).join(' & ')} · {revealLabel(s.reveal, true)}
                        </span>
                      </div>
                      {!done && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <button onClick={() => openEdit(s)} aria-label="Edit surprise" style={{ background: 'transparent', color: 'var(--accent-text, var(--accent))', border: '1px solid var(--accent)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>Edit</button>
                          <button onClick={() => doReveal(s)} style={{ background: 'var(--accent)', color: 'var(--accent-ink, #fff)', border: 'none', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>Reveal now</button>
                        </div>
                      )}
                    </div>
                    {s.conceal === 'cover' && s.cover && !done && <CoverCard traveler={traveler} s={s} serif={serif} r={r} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Claude privacy promise — the standing explanation of the masking rule */}
        <div style={{ marginTop: 24, display: 'flex', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: Math.min(r, 16), background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontFamily: serif, fontSize: 13, color: 'var(--bg)', fontWeight: 700 }}>✳</span></div>
          <div style={{ fontFamily: serif, fontSize: 13, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', lineHeight: 1.45 }}>
            Claude can't see what's hidden from someone — so when they ask, it never hints, confirms, or spoils. The surprise simply isn't there for it. For a cover story, Claude only sees the stand-in, so it helps them plan around it without knowing the real thing.
          </div>
        </div>
      </div>

      {composing && <SurpriseComposer traveler={traveler} trip={trip} editing={editing} onClose={closeComposer} onCreate={onCreate} />}

      {justRevealed && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Mounted preset="pop" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 80 }}>🎉</div>
            <div style={{ fontFamily: serif, fontSize: 28, fontWeight: heavy, fontStyle: ital, color: '#fff', marginTop: 8 }}>Revealed!</div>
            <div style={{ fontFamily: serif, fontSize: 15, fontStyle: 'italic', color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>{(justRevealed.hideFrom || []).map((id) => displayName(id, traveler)).join(' & ')} can see it now.</div>
          </Mounted>
        </div>
      )}
    </div>
  )
}

// ── THE COVER (author-facing preview) ───────────────────────────────────────
// What the hidden-from people see INSTEAD: a believable stand-in carrying the
// real timing + weather/packing. On the recipient's device (Slice 3) this same
// card renders as a normal itinerary stop — no gift, no lock, no hint.
function CoverCard({ traveler, s, serif, r }) {
  const cov = s.cover || {}
  const who = (s.hideFrom || []).includes('everyone') ? 'everyone' : (s.hideFrom || []).map((id) => displayName(id, traveler)).join(' & ')
  return (
    <div style={{ margin: '0 13px 13px', borderRadius: Math.min(r - 2, 14), overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--accent-text, var(--muted))', display: 'flex' }}><Ic.eye s={12} /></span>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--accent-text, var(--muted))', fontWeight: 600 }}>What {who} see{who === 'everyone' ? 's' : ''} instead</span>
      </div>
      <div style={{ display: 'flex', gap: 11, padding: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0 }}>{cov.icon || '📍'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 8.5, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted)' }}>{cov.time}{cov.time && cov.loc ? ' · ' : ''}{cov.loc}</div>
          <div style={{ fontFamily: serif, fontSize: 14.5, fontWeight: traveler === 'rafa' ? 700 : 600, fontStyle: traveler === 'aurelia' ? 'italic' : 'normal', marginTop: 2, lineHeight: 1.2 }}>{cov.title}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 9px', marginTop: 6 }}>
            {cov.weather && <span style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>☁ {cov.weather}</span>}
            {cov.packing && <span style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>🧳 {cov.packing}</span>}
          </div>
        </div>
      </div>
      <div style={{ padding: '0 12px 11px', fontFamily: serif, fontSize: 11.5, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', lineHeight: 1.4 }}>
        Carries the real timing + weather, so they pack and plan right — never knowing.
      </div>
    </div>
  )
}

// ── THE COMPOSER ─────────────────────────────────────────────────────────────
// Create OR edit a surprise (Design's "Plan a surprise" rebuild). After the KIND
// chip, a CONTENT STEP unfolds: WRAP a real photo/memory (so the surprise carries
// real content + actually disappears for the hidden-from person) OR DESCRIBE a new
// one (a typed title + details). "The whole trip" binds to the real trip.
// SLICE 1 scope: photo / memory / describe / whole-trip. "A stop" wrapping needs
// the per-stop hiding machinery (Slice 2); the Claude cover-assist is Slice 3.
const WHAT_ICON = { 'A stop': '📍', 'A photo': '🖼️', 'A memory': '💭', 'The whole trip': '🗺️' }
const WHAT_NOUN = { 'A stop': 'stop', 'A photo': 'photo', 'A memory': 'memory', 'The whole trip': 'trip' }

// A stop wrap item rebuilt from a kept stop-surprise (for edit pre-fill). The wrap
// picker filters OUT existing surprises, so the editor can't re-find it there.
function stopWrapItemFromKept(rec) {
  const ref = rec._stopRef || {}
  return {
    id: ref.stopId || rec.id,
    kind: 'stop',
    icon: rec.surprise?.icon || '📍',
    title: rec.surprise?.title || 'A place',
    meta: rec.surprise?.detail || '',
    stopId: ref.stopId || rec.id,
    dayIso: ref.dayIso || null,
  }
}

// A wrapped item rebuilt from an existing surprise record (for edit pre-fill).
// The wrap picker filters OUT surprises, so the editor can't re-find it there.
function wrapItemFromRecord(rec) {
  if (!rec) return null
  return {
    id: rec.id,
    kind: rec.kind === 'photo' ? 'photo' : 'memory',
    icon: rec.surprise?.icon || memGlyph(rec.kind),
    title: rec.surprise?.title || rec.caption || rec.text || 'A memory',
    meta: rec.surprise?.detail || '',
    tint: rec.surprise?.tint || '#5C5048',
    memory: rec,
  }
}

// Gradient thumb placeholder (real media swap is a later polish; the prototype
// uses the same gradient + glyph). Reuses the file's `shade`.
function ThumbBox({ size = 44, tint = '#5C5048', icon, radius = 10 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, position: 'relative', overflow: 'hidden', background: `linear-gradient(150deg, ${shade(tint, 22)}, ${tint} 48%, ${shade(tint, -20)})` }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.42) }}>{icon}</div>
    </div>
  )
}

const MONO = { fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }

function TInput({ r, value, onChange, placeholder, area }) {
  const common = { width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: Math.min(r, 12), border: '1px solid var(--line-bold)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.4 }
  return area
    ? <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} style={common} />
    : <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} style={common} />
}

function ItemRow({ r, serif, traveler, item, on, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: 8, borderRadius: Math.min(r, 13), cursor: 'pointer', border: `1px solid ${on ? 'var(--accent)' : 'transparent'}`, background: on ? 'var(--bg2)' : 'transparent', color: 'var(--text)' }}>
      <ThumbBox size={44} tint={item.tint} icon={item.icon} radius={Math.min(r - 4, 10)} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: serif, fontSize: 14, fontWeight: traveler === 'rafa' ? 600 : 500, fontStyle: traveler === 'aurelia' ? 'italic' : 'normal', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
        {item.meta && <span style={{ display: 'block', ...MONO, fontSize: 8.5, letterSpacing: 0.6, color: 'var(--muted)', marginTop: 3 }}>{item.meta}</span>}
      </span>
      {on
        ? <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink, #fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic.check s={12} /></span>
        : <span style={{ color: 'var(--muted)', display: 'flex' }}><Ic.right s={15} /></span>}
    </button>
  )
}

function StripCard({ r, serif, traveler, item, on, onClick, big }) {
  const w = big ? 116 : 92
  return (
    <button type="button" onClick={onClick} aria-label={item.title} style={{ flexShrink: 0, width: w, textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, color: 'var(--text)' }}>
      <div style={{ width: w, height: big ? 116 : 92, borderRadius: Math.min(r, big ? 18 : 13), overflow: 'hidden', position: 'relative', boxShadow: on ? '0 0 0 3px var(--accent), 0 0 0 5px var(--bg)' : 'none' }}>
        <ThumbBox size={w} tint={item.tint} icon={item.icon} radius={0} />
        {on && <span style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink, #fff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.check s={13} /></span>}
      </div>
      <div style={{ fontFamily: serif, fontSize: big ? 12.5 : 11, fontStyle: traveler === 'aurelia' ? 'italic' : 'normal', color: 'var(--muted)', marginTop: 6, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.title}</div>
    </button>
  )
}

function WrapPicker({ r, serif, traveler, items, picked, onPick, big }) {
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  const filtered = ql ? items.filter((i) => `${i.title} ${i.meta}`.toLowerCase().includes(ql)) : items
  return (
    <div>
      {!ql && items.length > 0 && (
        <div style={{ display: 'flex', gap: 11, overflowX: 'auto', padding: '2px 0 4px', margin: '0 -2px' }}>
          {items.slice(0, big ? 5 : 7).map((i) => <StripCard key={i.id} r={r} serif={serif} traveler={traveler} item={i} on={picked && picked.id === i.id} onClick={() => onPick(i)} big={big} />)}
        </div>
      )}
      <div style={{ position: 'relative', marginTop: 12 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--muted)', display: 'flex' }}><Ic.search s={15} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this trip…" aria-label="Search this trip" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 36px', borderRadius: 999, border: '1px solid var(--line-bold)', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 13.5, outline: 'none' }} />
      </div>
      <div style={{ marginTop: 8, maxHeight: 196, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {filtered.length === 0
          ? <div style={{ fontFamily: serif, fontSize: 13, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', padding: '14px 8px' }}>{items.length === 0 ? 'Nothing of yours to wrap on this trip yet — try “Describe something new”.' : `Nothing matches “${q}”.`}</div>
          : filtered.map((i) => <ItemRow key={i.id} r={r} serif={serif} traveler={traveler} item={i} on={picked && picked.id === i.id} onClick={() => onPick(i)} />)}
      </div>
    </div>
  )
}

function SelectedSecret({ r, serif, traveler, isNew, item, onClear }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 11, borderRadius: Math.min(r, 14), border: '1px solid var(--accent)', background: 'var(--card)' }}>
      <ThumbBox size={46} tint={item.tint} icon={item.icon} radius={Math.min(r - 4, 11)} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...MONO, fontSize: 8, letterSpacing: 1, color: 'var(--accent-text)', fontWeight: 600 }}>{isNew ? 'New · not on the trip yet' : 'Wrapped from the trip'}</div>
        <div style={{ fontFamily: serif, fontSize: 15, fontWeight: 600, fontStyle: traveler === 'aurelia' ? 'italic' : 'normal', lineHeight: 1.2, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title || 'Untitled'}</div>
        {item.meta && <div style={{ ...MONO, fontSize: 8.5, letterSpacing: 0.4, color: 'var(--muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.meta}</div>}
      </div>
      <button type="button" onClick={onClear} aria-label="Change" style={{ flexShrink: 0, background: 'transparent', border: '1px solid var(--line-bold)', borderRadius: 999, padding: '6px 11px', cursor: 'pointer', color: 'var(--muted)', ...MONO, fontSize: 8.5, letterSpacing: 0.8, fontWeight: 600 }}>Change</button>
    </div>
  )
}

function SurpriseComposer({ traveler, trip, editing, onClose, onCreate }) {
  const serif = 'var(--font-display, var(--font-body, system-ui))'
  const heavy = traveler === 'rafa' ? 700 : 600
  const ital = traveler === 'aurelia' ? 'italic' : 'normal'
  const r = RADIUS[traveler] ?? 8
  const family = TRAVELER_ORDER.filter((id) => id !== traveler)
  const allowDescribe = traveler !== 'rafa' // kids wrap real photos, no typing
  const bigThumbs = traveler === 'rafa'
  // Kinds: Rafa = just photos; others = photo / memory / stop / whole-trip.
  // "A stop" (Slice 2) hides one place on the itinerary — WRAP-only (you can't
  // hide a stop that isn't on the plan), so it skips the "describe new" toggle.
  const kinds = bigThumbs ? [['A photo', '🖼️']] : [['A photo', '🖼️'], ['A memory', '💭'], ['A stop', '📍'], ['The whole trip', '🗺️']]

  // The author's OWN trip memories — the masking model only lets you hide your
  // own (the original author always sees their own memory), so the wrap picker
  // is scoped to what the secret-keeper authored. Excludes existing surprises.
  const myMemories = useMemo(
    () => (trip?.id ? listMemoriesForTrip(trip.id, traveler).filter((m) => m.authorTraveler === traveler) : []),
    [trip?.id, traveler]
  )
  // Located stops for the ARRIVAL reveal trigger (geofence target).
  const stops = useMemo(
    () =>
      (trip?.days || []).flatMap((d) =>
        (d.stops || [])
          .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
          .map((s) => ({ id: s.id, name: s.name || s.title || 'A place', lat: s.lat, lng: s.lng, day: d.title || d.date || d.isoDate || '' }))
      ),
    [trip]
  )

  const ed = editing || null
  const edTrip = !!ed?.isTrip || ed?.surprise?.what === 'The whole trip'
  const edStop = !!ed?.isStop || ed?.surprise?.what === 'A stop'
  // A stop edits through the WRAP picker (source 'wrap'), pre-filled with the stop.
  const edSource = ed ? (edTrip ? 'trip' : edStop ? 'wrap' : ed.surprise?.source || 'describe') : null
  const edEveryone = !!ed?.hideFrom?.includes('everyone')
  const [what, setWhat] = useState(ed ? ed.surprise?.what || 'A photo' : bigThumbs ? 'A photo' : null)
  const [source, setSource] = useState(ed ? edSource : 'wrap')
  const [picked, setPicked] = useState(ed && edSource === 'wrap' ? (edStop ? stopWrapItemFromKept(ed) : wrapItemFromRecord(ed)) : null)
  const [desc, setDesc] = useState(ed && edSource === 'describe' ? { title: ed.surprise?.title || '', detail: ed.surprise?.detail || '' } : { title: '', detail: '' })
  const [hide, setHide] = useState(ed && !edEveryone ? ed.hideFrom : [family[0]])
  const [everyone, setEveryone] = useState(edEveryone)
  const [reveal, setReveal] = useState(ed?.reveal?.type || 'manual')
  const [revealDate, setRevealDate] = useState(ed?.reveal?.type === 'date' ? ed.reveal.at || '' : '')
  const [revealStopId, setRevealStopId] = useState(ed?.reveal?.type === 'arrival' ? ed.reveal.at || '' : '')
  const [conceal, setConceal] = useState(ed?.conceal || 'teaser')
  const [cov, setCov] = useState(ed?.cover || { icon: '🚶', title: '', loc: '', time: '', weather: '', packing: '' })
  const setC = (k, v) => setCov((o) => ({ ...o, [k]: v }))
  const [coverBusy, setCoverBusy] = useState(false)
  const [coverErr, setCoverErr] = useState('')
  const toggleHide = (id) => { setEveryone(false); setHide((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id])) }

  const isTrip = what === 'The whole trip'
  const isStop = what === 'A stop'
  const noun = WHAT_NOUN[what || 'A photo'] || 'thing'
  const setKind = (k) => {
    setWhat(k)
    if (k === 'The whole trip') { setSource('trip'); if (reveal === 'arrival') setReveal('manual') }
    else if (k === 'A stop' || source === 'trip') setSource('wrap') // stop = wrap-only
    setPicked(null)
  }

  const contentReady = isTrip || (source === 'wrap' ? !!picked : !!desc.title.trim())
  const revealReady = reveal === 'manual' || (reveal === 'date' && !!revealDate) || (reveal === 'arrival' && !!revealStopId)
  const coverReady = conceal !== 'cover' || (cov.title.trim() && cov.packing.trim())
  const whoReady = everyone || hide.length > 0
  const valid = contentReady && whoReady && revealReady && coverReady
  const whoNames = everyone ? 'everyone else' : hide.map((id) => displayName(id, traveler)).join(' & ') || 'them'
  const reveals = isTrip
    ? [['manual', 'When I choose'], ['date', 'On a date']]
    : [['manual', 'When I choose'], ['arrival', 'When they arrive'], ['date', 'On a date']]
  const arrivalStop = stops.find((s) => s.id === revealStopId)
  const consequenceReveal = revealLabel({ type: reveal, label: arrivalStop?.name, at: revealDate }, true)

  // Slice 3: ask the worker (Claude) to draft a believable cover from the REAL
  // hidden thing + trip + reveal timing + whatever the author has typed. Only the
  // author runs this (they know the secret), so sending the real thing leaks
  // nothing. On any failure → an honest "fill it in by hand" note (no throw).
  async function suggestCover() {
    if (coverBusy) return
    setCoverErr('')
    setCoverBusy(true)
    try {
      const realTitle = isTrip ? trip?.title : (isStop || source === 'wrap') ? picked?.title : desc.title
      const realDetail = isTrip ? trip?.dateRange : (isStop || source === 'wrap') ? picked?.meta : desc.detail
      const stopNames = (trip?.days || [])
        .flatMap((d) => (d.stops || []).map((s) => s.name || s.title))
        .filter(Boolean).slice(0, 12).join(', ')
      const out = await draftCover({
        kind: noun,
        title: realTitle || 'a surprise',
        detail: realDetail || '',
        trip: [trip?.title, trip?.dateRange].filter(Boolean).join(' · '),
        stops: stopNames,
        when: consequenceReveal,
        hideFrom: whoNames,
        seed: { icon: cov.icon, title: cov.title, loc: cov.loc, time: cov.time, weather: cov.weather, packing: cov.packing },
      })
      if (!out) { setCoverErr("Couldn't reach Claude — fill it in by hand."); return }
      // Keep whatever the author already typed only where Claude returned blank;
      // preserve the chosen day. The author can still edit every field after.
      setCov((prev) => ({
        icon: out.icon || prev.icon,
        title: out.title || prev.title,
        loc: out.loc || prev.loc,
        time: out.time || prev.time,
        weather: out.weather || prev.weather,
        packing: out.packing || prev.packing,
        ...(prev.dayIso ? { dayIso: prev.dayIso } : {}),
      }))
    } catch {
      setCoverErr("Couldn't reach Claude — fill it in by hand.")
    } finally {
      setCoverBusy(false)
    }
  }

  function create() {
    let revealObj
    if (reveal === 'date') revealObj = { type: 'date', at: revealDate }
    else if (reveal === 'arrival') revealObj = arrivalStop ? { type: 'arrival', at: arrivalStop.id, label: arrivalStop.name, lat: arrivalStop.lat, lng: arrivalStop.lng } : { type: 'arrival' }
    else revealObj = { type: 'manual' }
    const cover = conceal === 'cover'
      ? { icon: cov.icon, title: cov.title.trim() || 'A quiet stop', loc: cov.loc.trim() || 'TBD', time: cov.time.trim() || 'same time', weather: cov.weather.trim() || '—', packing: cov.packing.trim() || '—', ...(cov.dayIso ? { dayIso: cov.dayIso } : {}) }
      : undefined
    let blob
    if (isTrip) blob = { what, icon: '🗺️', title: trip?.title || 'The whole trip', detail: trip?.dateRange || '', tint: '#3A5A7A', source: 'trip' }
    else if (isStop) blob = { what, icon: picked.icon, title: picked.title, detail: picked.meta || '', tint: '#3A5A7A', source: 'stop' }
    else if (source === 'wrap') blob = { what, icon: picked.icon, title: picked.title, detail: picked.meta || '', tint: picked.tint || '#5C5048', source: 'wrap' }
    else blob = { what, icon: WHAT_ICON[what] || '🎁', title: desc.title.trim(), detail: desc.detail.trim() || `A new ${noun} you're keeping secret.`, tint: '#5C5048', source: 'describe' }
    onCreate({
      // A stop wraps the itinerary stop itself (rides in the trip), so it routes
      // to upsertTrip — not saveMemory. stopId/dayIso locate the exact stop.
      source: isTrip ? 'trip' : isStop ? 'stop' : source,
      id: ed ? ed.id : undefined,
      refId: isTrip ? trip?.id : source === 'wrap' ? picked?.id : undefined,
      stopId: isStop ? picked?.stopId || picked?.id : undefined,
      dayIso: isStop ? picked?.dayIso || null : undefined,
      memory: !isTrip && !isStop && source === 'wrap' ? picked?.memory : undefined,
      hideFrom: everyone ? ['everyone'] : hide,
      reveal: revealObj,
      conceal,
      cover,
      surprise: blob,
    })
  }

  const coverFields = [
    { k: 'title', ph: 'What it looks like — "A walk in the park"', flex: '1 1 100%' },
    { k: 'loc', ph: 'Where', flex: '1 1 46%' },
    { k: 'time', ph: 'When (same as the real plan)', flex: '1 1 46%' },
    { k: 'weather', ph: 'Weather to plan for', flex: '1 1 46%' },
    { k: 'packing', ph: 'What to bring', flex: '1 1 46%' },
  ]
  const fieldStyle = {
    minWidth: 0, padding: '10px 12px', borderRadius: Math.min(r, 12),
    border: '1px solid var(--line-bold)', background: 'var(--card)', color: 'var(--text)',
    fontFamily: 'var(--font-body)', fontSize: 13.5, outline: 'none',
    colorScheme: traveler === 'helen' ? 'light' : 'dark',
  }
  const wrapItems = !isTrip && source === 'wrap' ? wrapItemsForKind(what || 'A photo', { memories: myMemories, trip }) : []

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 85, display: 'flex', alignItems: 'flex-end' }}>
      <Mounted preset="sheet" onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: 'var(--bg)', color: 'var(--text)', borderTopLeftRadius: Math.min(r + 6, 24), borderTopRightRadius: Math.min(r + 6, 24), maxHeight: '92%', overflow: 'auto', fontFamily: 'var(--font-body)' }}>
        <div style={{ padding: '16px 18px calc(env(safe-area-inset-bottom) + 22px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
            <div>
              <div style={{ fontFamily: serif, fontSize: 24, fontWeight: heavy, fontStyle: ital }}>{ed ? 'Edit surprise' : 'Plan a surprise'}</div>
              <div style={{ fontFamily: serif, fontSize: 12.5, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', marginTop: 3 }}>{traveler === 'rafa' ? 'Hide something special for someone!' : "Hide a piece of the trip until the moment's right."}</div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}><Ic.x s={20} /></button>
          </div>

          {/* ① WHAT */}
          <CmpLabel>{traveler === 'rafa' ? "What's the secret?" : 'What are you hiding?'}</CmpLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {kinds.map(([w, ic]) => <Chip key={w} on={what === w} onClick={() => setKind(w)} icon={ic}>{w}</Chip>)}
          </div>

          {/* CONTENT STEP — discloses once a kind is chosen */}
          {what && !isTrip && (
            <div style={{ marginTop: 14 }}>
              {allowDescribe && !isStop && (
                <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 999, background: 'var(--bg2)', marginBottom: 14 }}>
                  {[['wrap', 'Wrap something real', Ic.gift], ['describe', 'Describe something new', Ic.pencil]].map(([k, label, I]) => {
                    const on = source === k
                    return (
                      <button key={k} type="button" onClick={() => { setSource(k); setPicked(null) }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 8px', borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? 'var(--card)' : 'transparent', color: 'var(--text)', boxShadow: on ? '0 1px 3px rgba(0,0,0,0.14)' : 'none', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: on ? 700 : 500 }}>
                        <I s={14} />{label}
                      </button>
                    )
                  })}
                </div>
              )}

              {source === 'wrap'
                ? (picked
                    ? <SelectedSecret r={r} serif={serif} traveler={traveler} isNew={false} item={picked} onClear={() => setPicked(null)} />
                    : <WrapPicker r={r} serif={serif} traveler={traveler} items={wrapItems} picked={picked} onPick={setPicked} big={bigThumbs} />)
                : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <TInput r={r} value={desc.title} onChange={(v) => setDesc((d) => ({ ...d, title: v }))} placeholder={`Title — e.g. ${what === 'A photo' ? "The framed Father's Day print" : 'A note for the thread'}`} />
                      <TInput r={r} area value={desc.detail} onChange={(v) => setDesc((d) => ({ ...d, detail: v }))} placeholder="Details (optional) — what makes it special" />
                    </div>
                  )}

              {contentReady && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, fontFamily: serif, fontSize: 12, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', lineHeight: 1.4 }}>
                  {source === 'wrap'
                    ? <><Ic.eyeOff s={13} />Hiding it removes this {noun} from their view until it&rsquo;s revealed.</>
                    : <><Ic.pencil s={12} />New — it isn&rsquo;t on the trip yet, so only you can see it.</>}
                </div>
              )}
            </div>
          )}

          {/* whole-trip — bound to the real trip, no picker */}
          {isTrip && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, padding: 13, borderRadius: Math.min(r, 14), border: '1px solid var(--accent)', background: 'var(--card)' }}>
              <ThumbBox size={46} tint="#3A5A7A" icon="🗺️" radius={Math.min(r - 4, 11)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...MONO, fontSize: 8, letterSpacing: 1, color: 'var(--accent-text)', fontWeight: 600 }}>Bound to the real trip</div>
                <div style={{ fontFamily: serif, fontSize: 16, fontWeight: heavy, fontStyle: ital, marginTop: 2 }}>{trip?.title || 'This trip'}</div>
                {trip?.dateRange && <div style={{ ...MONO, fontSize: 8.5, letterSpacing: 0.4, color: 'var(--muted)', marginTop: 3 }}>{trip.dateRange}</div>}
              </div>
            </div>
          )}

          {/* ② / ③ / ④ — disclose once content is ready */}
          {contentReady && (
            <>
              <CmpLabel>Hide it from</CmpLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {family.map((id) => <Chip key={id} on={!everyone && hide.includes(id)} onClick={() => toggleHide(id)} dot={TRAVELER_DOT[id]}>{displayName(id, traveler)}</Chip>)}
                <Chip on={everyone} onClick={() => { setEveryone(true); setHide([]) }} icon="🤫">Everyone</Chip>
              </div>
              {source === 'wrap' && !isTrip && whoReady && (
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 11, padding: '10px 12px', borderRadius: Math.min(r, 13), background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 26%, transparent)' }}>
                  <span style={{ marginTop: 1, color: 'var(--accent-text)', display: 'flex' }}><Ic.eyeOff s={15} /></span>
                  <div style={{ fontFamily: serif, fontSize: 12.5, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--text)', lineHeight: 1.4 }}>
                    <b style={{ fontWeight: 600 }}>{whoNames === 'everyone else' ? 'Everyone else' : whoNames}</b> won&rsquo;t see this {noun} in the trip {consequenceReveal}.
                  </div>
                </div>
              )}

              <CmpLabel>Reveal it</CmpLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {reveals.map(([k, label]) => <Chip key={k} on={reveal === k} onClick={() => setReveal(k)}>{label}</Chip>)}
              </div>
              {reveal === 'date' && (
                <input type="date" value={revealDate} onChange={(e) => setRevealDate(e.target.value)} aria-label="Reveal date" style={{ ...fieldStyle, marginTop: 9, width: '100%' }} />
              )}
              {reveal === 'arrival' && (
                stops.length > 0 ? (
                  <select value={revealStopId} onChange={(e) => setRevealStopId(e.target.value)} aria-label="Reveal when arriving at" style={{ ...fieldStyle, marginTop: 9, width: '100%', appearance: 'none' }}>
                    <option value="">Pick a place…</option>
                    {stops.map((s) => <option key={s.id} value={s.id}>{s.name}{s.day ? ` · ${s.day}` : ''}</option>)}
                  </select>
                ) : (
                  <div style={{ fontFamily: serif, fontSize: 12, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', marginTop: 9, lineHeight: 1.4 }}>No places with a location on this trip yet — add one to reveal on arrival, or pick a date.</div>
                )
              )}

              <CmpLabel>What will they see?</CmpLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Chip on={conceal === 'teaser'} onClick={() => setConceal('teaser')} icon="🎁">A wrapped teaser</Chip>
                <Chip on={conceal === 'cover'} onClick={() => setConceal('cover')} icon="🪄">A cover story</Chip>
              </div>
              {conceal === 'teaser' ? (
                <div style={{ fontFamily: serif, fontSize: 12, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', marginTop: 9, lineHeight: 1.4 }}>They&rsquo;ll know a surprise is coming — just not what.</div>
              ) : (
                <div style={{ marginTop: 11, padding: 13, borderRadius: Math.min(r, 14), border: '1px solid var(--border)', background: 'var(--card)' }}>
                  <div style={{ fontFamily: serif, fontSize: 12.5, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', lineHeight: 1.4, marginBottom: 11 }}>A believable stand-in shows on their plan instead — carrying the real timing + weather so they pack and plan right, never knowing.</div>
                  {!isTrip && !isStop && trip?.days?.length > 0 && (
                    <select value={cov.dayIso || ''} onChange={(e) => setC('dayIso', e.target.value)} aria-label="Which day it appears on" style={{ ...fieldStyle, width: '100%', marginBottom: 8, appearance: 'none' }}>
                      <option value="">Which day on their plan… (optional)</option>
                      {trip.days.map((d) => <option key={d.isoDate} value={d.isoDate}>{d.title || d.date || d.isoDate}</option>)}
                    </select>
                  )}
                  {/* Slice 3 — Claude cover-assist: drafts a believable stand-in. */}
                  <button type="button" onClick={suggestCover} disabled={coverBusy} aria-label="Suggest a cover with Claude" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginBottom: 9, padding: '11px 12px', borderRadius: Math.min(r, 12), cursor: coverBusy ? 'default' : 'pointer', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent-text, var(--accent))', fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>
                    {coverBusy ? '✦ Writing a cover…' : (cov.title.trim() ? '✦ Fill in the rest with Claude' : '✦ Suggest a cover with Claude')}
                  </button>
                  {coverErr && <div style={{ fontFamily: serif, fontSize: 11.5, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', marginBottom: 9, lineHeight: 1.4 }}>{coverErr}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {coverFields.map((f) => (
                      <input key={f.k} value={cov[f.k]} onChange={(e) => setC(f.k, e.target.value)} placeholder={f.ph} aria-label={f.ph} style={{ flex: f.flex, minWidth: 0, padding: '10px 12px', borderRadius: Math.min(r, 12), border: '1px solid var(--line-bold)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 13.5, outline: 'none' }} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <button disabled={!valid} onClick={create} style={{ width: '100%', marginTop: 20, padding: 15, borderRadius: 999, border: 'none', cursor: valid ? 'pointer' : 'default', background: valid ? 'var(--accent)' : 'var(--bg2)', color: valid ? 'var(--accent-ink, #fff)' : 'var(--faint)', fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ic.lock s={14} /> {ed ? 'Save changes' : conceal === 'cover' ? 'Hide it behind the cover' : 'Keep it secret'}
          </button>
          <div style={{ fontFamily: serif, fontSize: 12, fontStyle: 'italic', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
            {!contentReady ? "Pick what you're hiding to continue."
              : conceal === 'cover'
                ? `${whoNames === 'everyone else' ? 'Everyone else' : whoNames} will see the cover — Claude plans them around it, never the real thing.`
                : `Claude won't see it for ${whoNames} until it's revealed.`}
          </div>
        </div>
      </Mounted>
    </div>
  )
}
