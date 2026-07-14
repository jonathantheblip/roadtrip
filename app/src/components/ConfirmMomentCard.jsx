// ConfirmMomentCard.jsx — the S1 self-healing confirm surface's ONE novel
// component (Design bundle spec 01/02/03). NB the bundle named this
// "ConfirmCard", but that filename is already the unrelated Claude-in-App
// confirmation card (add/move/cancel/multi) — so this is ConfirmMomentCard,
// matching the prototype's <ConfirmMoment> / useConfirmMoment naming. The DOM
// testid stays `confirm-card` per the bundle.
//
// Five states (unanswered · confirmed · corrected · skipped · set-aside), four
// kinds (A place · B name · C time · D grouping), the in-place correction
// drawers, and the PLACE sheet (the MoveSheet shell). Presentational: the state
// machine lives in useConfirmMoment; the HOST persists (spends the budget, POSTs
// /heal-confirm, files the moment) via onResolve.
//
// Recreated in the app's own system — per-lens theming is the ambient CSS vars
// (--accent / --card / --text / --muted / --border / --line-bold / --radius),
// the settled line wears the record's gold var(--kept) (NOT --good green — a
// confirm changes what the whole family sees), fonts are --font-display /
// --font-body / JetBrains Mono. A11Y: readable text uses --muted, never --faint
// (the W6 rendered-contrast lesson — only the e2e axe gate catches a slip here).
import React from 'react'
import { Check, X, ChevronRight } from 'lucide-react'
import { CONFIRM_DECK as DECK, renderConfirm as rc } from '../lib/confirmCopy'

const MONO = "'JetBrains Mono', ui-monospace, monospace"
const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}
const useMotion = (reduceMotion) => !reduceMotion && !prefersReducedMotion()
// The display register (question / settled fact): --font-display is already
// Instrument Serif italic for Aurelia and Fraunces otherwise — we only add the
// italic slant for her.
const displayFont = (lens) => ({ fontFamily: 'var(--font-display)', fontStyle: lens === 'aurelia' ? 'italic' : 'normal' })
const fillsOf = (m) => ({
  n: m?.n ?? 0, moment: m?.moment || '', place: m?.place || '', name: m?.name || '',
  time: m?.time || '', day: m?.day || '', part: m?.part || 'day', base: m?.base || '',
})

// ── the state machine ────────────────────────────────────────────────────────
// stage: idle → (inline | sheet via host) → settled | leaving → gone
// onResolve({ outcome, payload }) is the ONE terminal callback the host persists.
export function useConfirmMoment({ kind, onResolve, reduceMotion, initial } = {}) {
  const [stage, setStage] = React.useState((initial && initial.stage) || 'idle')
  const [sheetOpen, setSheetOpen] = React.useState(!!(initial && initial.sheetOpen))
  const [settled, setSettled] = React.useState((initial && initial.settled) || null)
  const [text, setText] = React.useState('')

  const finish = (outcome, payload) => {
    setSheetOpen(false)
    setSettled({ outcome, payload })
    setStage('settled')
    onResolve && onResolve({ outcome, payload })
  }
  const clearAway = (outcome) => {
    setSheetOpen(false)
    setStage('leaving') // residue-free collapse — skipped & set-aside are indistinguishable
    const dur = useMotion(reduceMotion) ? 230 : 0
    setTimeout(() => { setStage('gone'); onResolve && onResolve({ outcome }) }, dur)
  }

  return {
    kind, stage, sheetOpen, settled, text, setText,
    confirm: () => finish('confirmed'),
    notQuite: () => { kind === 'A' ? setSheetOpen(true) : setStage('inline') },
    closeInline: () => { setStage('idle'); setText('') }, // spends nothing
    closeSheet: () => setSheetOpen(false),                 // spends nothing
    skip: () => clearAway('skipped'),                      // deferral — may return
    leaveAside: () => clearAway('aside'),                  // permanent — never returns
    pickAlt: (alt) => finish('picked', alt),
    saveName: (v) => { if (v && v.trim()) finish('named', v.trim()) },
    saveText: (v) => { if (v && v.trim()) finish(kind === 'C' ? 'freetextTime' : 'freetextPlace', v.trim()) },
    openAlbum: () => { setSheetOpen(false); onResolve && onResolve({ outcome: 'album' }) },
  }
}

// settled fact + promise strings (recomputed at render)
function settledStrings(lens, kind, settled) {
  const m = settled.moment || {}
  const f = fillsOf(m)
  const { outcome: o, payload: p } = settled
  if (o === 'confirmed') {
    if (kind === 'A') return { fact: rc(lens, DECK.settledPlace, f), promise: rc(lens, DECK.savedPlace.A, f) }
    if (kind === 'B') return { fact: rc(lens, DECK.settledName, f), promise: rc(lens, DECK.savedName, f) }
    if (kind === 'C') return { fact: rc(lens, DECK.settledTime, f), promise: rc(lens, DECK.savedTight, f) }
    return { fact: rc(lens, DECK.settledGroup, f), promise: rc(lens, DECK.savedTight, f) }
  }
  if (o === 'picked') { const f2 = { ...f, place: p.label }; return { fact: rc(lens, DECK.settledPlace, f2), promise: rc(lens, DECK.savedPicked, f2) } }
  if (o === 'named') { const f2 = { ...f, name: p }; return { fact: rc(lens, DECK.settledName, f2), promise: rc(lens, DECK.savedName, f2) } }
  if (o === 'freetextPlace') return { fact: '‘' + p + '’', quoted: true, promise: rc(lens, DECK.savedTextPlace, f) }
  if (o === 'freetextTime') return { fact: '‘' + p + '’', quoted: true, promise: rc(lens, DECK.savedTextTime, f) }
  return { fact: '', promise: '' }
}

// ── ② the evidence strip (MatchRibbon idiom; GeoMark tail dropped) ────────────
function Ribbon({ m, condensed }) {
  const rad = 'max(4px, calc(var(--radius) - 12px))'
  const thumbs = Array.isArray(m?.thumbs) ? m.thumbs : []
  const Cell = ({ src, style }) => {
    const isTint = typeof src === 'string' && src.startsWith('#')
    return (
      <div style={{ width: 34, height: 34, borderRadius: rad, overflow: 'hidden', boxShadow: '0 0 0 2px var(--card)', flexShrink: 0, background: isTint ? src : 'var(--bg2)', ...style }}>
        {!isTint && src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
      </div>
    )
  }
  if (condensed) return <Cell src={m?.lead || thumbs[0]} />
  const more = (m?.n ?? thumbs.length) - thumbs.length
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex' }}>
        {thumbs.map((src, i) => (
          <Cell key={i} src={src} style={{ marginLeft: i ? -10 : 0, transform: `rotate(${(i - (thumbs.length - 1) / 2) * 4}deg)` }} />
        ))}
      </div>
      {more > 0 && (
        <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 0.4, color: 'var(--muted)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px' }}>+{more} more</span>
      )}
    </div>
  )
}

// quiet mono text button (SettleSheet QuietBtn register) — readable → --muted
function Quiet({ onClick, children, testid, style }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} style={{
      background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
      fontFamily: MONO, fontSize: 9.5, letterSpacing: 0.6, color: 'var(--muted)', ...style,
    }}>{children}</button>
  )
}

// the inline field (SettleSheet sheet-name-input treatment; never pre-filled)
function Field({ lens, ph, save, value, onChange, onSave }) {
  const on = !!(value && value.trim())
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 11px' }}>
      <input data-testid="correct-freetext" value={value} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && on) onSave(value) }} placeholder={ph}
        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', ...displayFont(lens), fontSize: 15, color: 'var(--text)' }} />
      <button type="button" data-testid="correct-save" onClick={() => on && onSave(value)} disabled={!on} style={{
        background: 'transparent', border: 'none', cursor: on ? 'pointer' : 'default', padding: 0, flexShrink: 0,
        fontFamily: MONO, fontSize: 9.5, letterSpacing: 0.6, color: on ? 'var(--accent-text)' : 'var(--faint)',
      }}>{save}</button>
    </div>
  )
}

// ── the card ─────────────────────────────────────────────────────────────────
export function ConfirmMomentCard({ lens = 'helen', moment, cm, host = 'index', afternote = false, reduceMotion = false, style }) {
  const qid = React.useId()
  if (!moment || cm.stage === 'gone') return null
  const m = moment
  const f = fillsOf(m)
  const mo = useMotion(reduceMotion)
  const leaving = cm.stage === 'leaving'
  const kickerEntry = host === 'settle' ? DECK.kickerSettle : DECK.kicker
  const kicker = <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: 'var(--muted)' }}>{rc(lens, kickerEntry)}</div>

  let body = null
  if (cm.stage === 'settled') {
    const s = settledStrings(lens, cm.kind, { ...cm.settled, moment: m })
    body = (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginTop: 12 }}>
        <Ribbon m={m} condensed />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
            <span style={{ marginTop: 2, flexShrink: 0 }}><Check size={14} color="var(--kept)" strokeWidth={2.6} /></span>
            <span style={{ ...displayFont(lens), fontStyle: s.quoted ? 'italic' : displayFont(lens).fontStyle, fontSize: 15.5, fontWeight: 500, color: 'var(--text)', lineHeight: 1.3 }}>{s.fact}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8 }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--kept)', marginTop: 6, flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontStyle: 'italic', color: 'var(--muted)', lineHeight: 1.5 }}>{s.promise}</span>
          </div>
          {afternote && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 6 }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginTop: 6, flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 12.5, fontStyle: 'italic', color: 'var(--muted)', lineHeight: 1.5 }}>{rc(lens, DECK.afternote)}</span>
            </div>
          )}
        </div>
      </div>
    )
  } else if (cm.stage === 'inline') {
    const lead = cm.kind === 'B' ? DECK.nameLead : cm.kind === 'C' ? DECK.timeLead : DECK.groupLead
    body = (
      <div data-testid="confirm-correct-inline" style={{ marginTop: 13 }}>
        <Ribbon m={m} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 13 }}>
          <div style={{ flex: 1, ...displayFont(lens), fontSize: 18, fontWeight: 600, letterSpacing: -0.3, lineHeight: 1.22, color: 'var(--text)' }}>{rc(lens, lead)}</div>
          <button type="button" onClick={cm.closeInline} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, marginTop: 1, flexShrink: 0 }}><X size={15} color="var(--muted)" /></button>
        </div>
        {cm.kind === 'B' && <Field lens={lens} ph={rc(lens, DECK.namePh)} save={rc(lens, DECK.nameSave)} value={cm.text} onChange={cm.setText} onSave={cm.saveName} />}
        {cm.kind === 'C' && <Field lens={lens} ph={rc(lens, DECK.timePh)} save={rc(lens, DECK.textSave)} value={cm.text} onChange={cm.setText} onSave={cm.saveText} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <Quiet testid="correct-aside" onClick={cm.leaveAside}>{rc(lens, DECK.leaveGuess)}</Quiet>
          <span aria-hidden="true" style={{ color: 'var(--faint)', fontSize: 9 }}>·</span>
          <Quiet testid="correct-album" onClick={cm.openAlbum}>{rc(lens, cm.kind === 'D' ? DECK.groupAlbum : DECK.album)}</Quiet>
        </div>
      </div>
    )
  } else {
    const signalEntry = m.signal ? DECK.evidence[m.signal] : null
    body = (
      <>
        <div style={{ marginTop: 13 }}><Ribbon m={m} /></div>
        <div id={qid} style={{ marginTop: 14, ...displayFont(lens), fontSize: 20, fontWeight: 600, letterSpacing: -0.4, lineHeight: 1.2, color: 'var(--text)' }}>
          {rc(lens, DECK.question[cm.kind], f)}
        </div>
        {signalEntry && (
          <div style={{ marginTop: 8, fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.45 }}>{rc(lens, signalEntry, f)}</div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={cm.confirm} style={{ flex: 1.2, minHeight: 48, border: 'none', cursor: 'pointer', borderRadius: 999, background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, padding: '0 10px' }}>
            {rc(lens, DECK.confirmBtn[cm.kind])}
          </button>
          <button type="button" onClick={cm.notQuite} style={{ flex: 1, minHeight: 48, cursor: 'pointer', borderRadius: 999, background: 'transparent', border: '1px solid var(--line-bold)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, padding: '0 10px' }}>
            {rc(lens, DECK.notQuite)}
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 11 }}>
          <Quiet onClick={cm.skip} style={{ letterSpacing: '0.06em' }}>{rc(lens, DECK.skip)}</Quiet>
        </div>
      </>
    )
  }

  return (
    <section role="group" aria-labelledby={qid} data-testid="confirm-card" style={{
      background: 'var(--card)', border: `1px solid ${leaving ? 'transparent' : 'var(--border)'}`, borderRadius: 'max(6px, var(--radius))',
      padding: leaving ? '0 15px' : '14px 15px', maxHeight: leaving ? 0 : 640, opacity: leaving ? 0 : 1,
      overflow: 'hidden', transition: mo ? 'max-height .2s ease, opacity .16s ease, padding .2s ease' : 'none', ...style,
    }}>
      {kicker}
      {body}
    </section>
  )
}

// ── the PLACE "Not quite" sheet — the MoveSheet shell (host mounts at phone level)
export function ConfirmPlaceSheet({ lens = 'helen', moment, cm }) {
  const m = moment
  const [txt, setTxt] = React.useState('')
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') cm.closeSheet() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cm])
  const on = !!txt.trim()
  const alts = Array.isArray(m?.alts) ? m.alts : []
  return (
    <div data-testid="confirm-correct-sheet" style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={cm.closeSheet} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', background: 'var(--card)', borderTopLeftRadius: 'calc(var(--radius) + 8px)', borderTopRightRadius: 'calc(var(--radius) + 8px)', padding: '10px 16px 26px', maxHeight: '78vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 38, height: 4, borderRadius: 3, background: 'var(--border)', margin: '4px auto 12px' }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1, ...displayFont(lens), fontSize: 18, fontWeight: 600, letterSpacing: -0.3, color: 'var(--text)' }}>{rc(lens, DECK.placeStem)}</div>
          <button type="button" onClick={cm.closeSheet} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}><X size={16} color="var(--muted)" /></button>
        </div>
        <div className="ft-scroll" style={{ overflowY: 'auto' }}>
          {alts.map((alt) => (
            <button type="button" key={alt.label} data-testid="correct-alt" onClick={() => cm.pickAlt(alt)} style={{ width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', padding: '12px 2px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, fontWeight: 600, color: 'var(--text)', fontStyle: lens === 'aurelia' ? 'italic' : 'normal' }}>{lens === 'aurelia' ? String(alt.label).toLowerCase() : alt.label}</span>
              {alt.why && <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: lens === 'aurelia' ? 'lowercase' : 'uppercase', color: 'var(--muted)' }}>{rc(lens, DECK.why[alt.why])}</span>}
            </button>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 11px' }}>
            <input data-testid="correct-freetext" value={txt} onChange={(e) => setTxt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && on) cm.saveText(txt) }} placeholder={rc(lens, DECK.somewhereElse)}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', ...displayFont(lens), fontSize: 15, color: 'var(--text)' }} />
            <button type="button" data-testid="correct-save" onClick={() => on && cm.saveText(txt)} disabled={!on} style={{ background: 'transparent', border: 'none', cursor: on ? 'pointer' : 'default', padding: 0, flexShrink: 0, fontFamily: MONO, fontSize: 9.5, letterSpacing: 0.6, color: on ? 'var(--accent-text)' : 'var(--faint)' }}>{rc(lens, DECK.textSave)}</button>
          </div>
          <button type="button" data-testid="correct-aside" onClick={cm.leaveAside} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 2px 0', textAlign: 'left', display: 'block' }}>
            <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>{rc(lens, DECK.leaveGuess)}</span>
            <span style={{ display: 'block', fontFamily: MONO, fontSize: 8.5, letterSpacing: 0.4, color: 'var(--muted)', marginTop: 2 }}>{rc(lens, DECK.leaveSub)}</span>
          </button>
          <button type="button" data-testid="correct-album" onClick={cm.openAlbum} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '13px 2px 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>{rc(lens, DECK.album)}</span>
            <ChevronRight size={13} color="var(--muted)" />
          </button>
        </div>
      </div>
    </div>
  )
}
