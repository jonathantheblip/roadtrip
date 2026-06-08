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
  revealSurprise,
} from '../lib/memoryStore'
import { authoredSurprises, teasersMaskedFrom, displayName, revealLabel } from '../lib/surprises'

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
export function SurprisesView({ trip, traveler, onClose }) {
  const tripId = trip?.id
  const serif = 'var(--font-display, var(--font-body, system-ui))'
  const ital = traveler === 'aurelia' ? 'italic' : 'normal'
  const heavy = traveler === 'rafa' ? 700 : 600
  const r = RADIUS[traveler] ?? 8

  const [tick, setTick] = useState(0) // bump to re-read the store after writes
  const [composing, setComposing] = useState(false)
  const [justRevealed, setJustRevealed] = useState(null)

  const raw = useMemo(() => (tripId ? listTripSurpriseRecords(tripId) : []), [tripId, tick])
  const kept = useMemo(() => authoredSurprises(raw, traveler), [raw, traveler])
  const coming = useMemo(() => teasersMaskedFrom(raw, traveler), [raw, traveler])

  function doReveal(s) {
    setJustRevealed(s)
    setTimeout(() => {
      revealSurprise(s.id)
      setJustRevealed(null)
      setTick((n) => n + 1)
    }, 1700)
  }

  function onCreate(payload) {
    saveMemory({
      tripId,
      stopId: null,
      authorTraveler: traveler,
      visibility: 'shared',
      hideFrom: payload.hideFrom,
      reveal: payload.reveal,
      conceal: payload.conceal,
      cover: payload.cover,
      surprise: payload.surprise,
    })
    setComposing(false)
    setTick((n) => n + 1)
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
                          hidden from {(s.hideFrom || []).map((id) => displayName(id, traveler)).join(' & ')} · {revealLabel(s.reveal)}
                        </span>
                      </div>
                      {!done && <button onClick={() => doReveal(s)} style={{ background: 'var(--accent)', color: 'var(--accent-ink, #fff)', border: 'none', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>Reveal now</button>}
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

      {composing && <SurpriseComposer traveler={traveler} onClose={() => setComposing(false)} onCreate={onCreate} />}

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
function SurpriseComposer({ traveler, onClose, onCreate }) {
  const serif = 'var(--font-display, var(--font-body, system-ui))'
  const heavy = traveler === 'rafa' ? 700 : 600
  const ital = traveler === 'aurelia' ? 'italic' : 'normal'
  const r = RADIUS[traveler] ?? 8
  const whats = [['A stop', '📍'], ['A photo', '🖼️'], ['A memory', '💭'], ['The whole trip', '🗺️']]
  const family = TRAVELER_ORDER.filter((id) => id !== traveler)
  const reveals = [['manual', 'When I choose'], ['arrival', 'When they arrive'], ['date', 'On a date']]
  const [what, setWhat] = useState('A stop')
  const [hide, setHide] = useState([family[0]])
  const [everyone, setEveryone] = useState(false)
  const [reveal, setReveal] = useState('manual')
  const [conceal, setConceal] = useState('teaser')
  const [cov, setCov] = useState({ icon: '🚶', title: '', loc: '', time: '', weather: '', packing: '' })
  const setC = (k, v) => setCov((o) => ({ ...o, [k]: v }))
  const toggleHide = (id) => { setEveryone(false); setHide((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id])) }
  const coverReady = conceal !== 'cover' || (cov.title.trim() && cov.packing.trim())
  const valid = (everyone || hide.length > 0) && coverReady
  const whoNames = everyone ? 'anyone' : hide.map((id) => displayName(id, traveler)).join(' or ') || 'them'

  function create() {
    onCreate({
      hideFrom: everyone ? ['everyone'] : hide,
      reveal: { type: reveal, at: reveal === 'arrival' ? 'the next stop' : reveal === 'date' ? 'a date you pick' : '' },
      conceal,
      cover: conceal === 'cover'
        ? { icon: cov.icon, title: cov.title.trim() || 'A quiet stop', loc: cov.loc.trim() || 'TBD', time: cov.time.trim() || 'same time', weather: cov.weather.trim() || '—', packing: cov.packing.trim() || '—' }
        : undefined,
      surprise: {
        what,
        icon: whats.find((w) => w[0] === what)[1],
        title: `A new ${what.toLowerCase()}`,
        detail: 'Tap to add the secret details…',
        tint: '#5C5048',
      },
    })
  }

  const coverFields = [
    { k: 'title', ph: 'What it looks like — "A walk down 5th Ave"', flex: '1 1 100%' },
    { k: 'loc', ph: 'Where', flex: '1 1 46%' },
    { k: 'time', ph: 'When (same as the real plan)', flex: '1 1 46%' },
    { k: 'weather', ph: 'Weather to plan for', flex: '1 1 46%' },
    { k: 'packing', ph: 'What to bring', flex: '1 1 46%' },
  ]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 85, display: 'flex', alignItems: 'flex-end' }}>
      <Mounted preset="sheet" onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: 'var(--bg)', color: 'var(--text)', borderTopLeftRadius: Math.min(r + 6, 24), borderTopRightRadius: Math.min(r + 6, 24), maxHeight: '92%', overflow: 'auto', fontFamily: 'var(--font-body)' }}>
        <div style={{ padding: '16px 18px calc(env(safe-area-inset-bottom) + 22px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontFamily: serif, fontSize: 24, fontWeight: heavy, fontStyle: ital }}>Plan a surprise</div>
            <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}><Ic.x s={20} /></button>
          </div>

          <CmpLabel>What are you hiding?</CmpLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {whats.map(([w, e]) => <Chip key={w} on={what === w} onClick={() => setWhat(w)} icon={e}>{w}</Chip>)}
          </div>

          <CmpLabel>Hide it from</CmpLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {family.map((id) => <Chip key={id} on={!everyone && hide.includes(id)} onClick={() => toggleHide(id)} dot={TRAVELER_DOT[id]}>{displayName(id, traveler)}</Chip>)}
            <Chip on={everyone} onClick={() => { setEveryone(true); setHide([]) }} icon="🤫">Everyone</Chip>
          </div>

          <CmpLabel>Reveal it</CmpLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {reveals.map(([k, label]) => <Chip key={k} on={reveal === k} onClick={() => setReveal(k)}>{label}</Chip>)}
          </div>

          <CmpLabel>What will they see?</CmpLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Chip on={conceal === 'teaser'} onClick={() => setConceal('teaser')} icon="🎁">A wrapped teaser</Chip>
            <Chip on={conceal === 'cover'} onClick={() => setConceal('cover')} icon="🪄">A cover story</Chip>
          </div>
          {conceal === 'teaser' ? (
            <div style={{ fontFamily: serif, fontSize: 12, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', marginTop: 9, lineHeight: 1.4 }}>They'll know a surprise is coming — just not what.</div>
          ) : (
            <div style={{ marginTop: 11, padding: 13, borderRadius: Math.min(r, 14), border: '1px solid var(--border)', background: 'var(--card)' }}>
              <div style={{ fontFamily: serif, fontSize: 12.5, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', lineHeight: 1.4, marginBottom: 11 }}>A believable stand-in shows on their plan instead — carrying the real timing + weather so they pack and plan right, never knowing.</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {coverFields.map((f) => (
                  <input key={f.k} value={cov[f.k]} onChange={(e) => setC(f.k, e.target.value)} placeholder={f.ph} aria-label={f.ph} style={{
                    flex: f.flex, minWidth: 0, padding: '10px 12px', borderRadius: Math.min(r, 12),
                    border: '1px solid var(--line-bold)', background: 'var(--card)', color: 'var(--text)',
                    fontFamily: 'var(--font-body)', fontSize: 13.5, outline: 'none',
                  }} />
                ))}
              </div>
            </div>
          )}

          <button disabled={!valid} onClick={create} style={{ width: '100%', marginTop: 20, padding: 15, borderRadius: 999, border: 'none', cursor: valid ? 'pointer' : 'default', background: valid ? 'var(--accent)' : 'var(--bg2)', color: valid ? 'var(--accent-ink, #fff)' : 'var(--faint)', fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ic.lock s={14} /> {conceal === 'cover' ? 'Hide it behind the cover' : 'Keep it secret'}
          </button>
          <div style={{ fontFamily: serif, fontSize: 12, fontStyle: 'italic', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
            {conceal === 'cover'
              ? `${whoNames === 'anyone' ? 'Everyone else' : whoNames} will see the cover — Claude plans them around it, never the real thing.`
              : `Claude won't see it for ${whoNames} until it's revealed.`}
          </div>
        </div>
      </Mounted>
    </div>
  )
}
