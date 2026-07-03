// THE RECORD · the settle SHEET (R4c) — the "one touch" that names the day.
//
// The settle card drafts a hangout day into PINS (evidence.js). This sheet is where
// a person looks them over: name what's nameless (a draft graduates to a serif
// memory), leave what they like as an honest dashed guess, then keep the day. Naming
// is the whole job — nothing here writes to the plan (day.stops), and leaving a pin
// unnamed and keeping anyway is valid (design 02).
import { useState, useEffect } from 'react'
import { pinsToDraftEntries, spanWords } from '../lib/evidence'
import { AvatarStack } from '../components/Avatar'

const SERIF = 'Fraunces, "Iowan Old Style", Georgia, serif'
const MONO = 'JetBrains Mono, ui-monospace, monospace'

function DraftNameRow({ pin, tz, value, onChange, hint }) {
  const words = spanWords(pin.span, { tz })
  const meta = [words, pin.count ? `${pin.count} photo${pin.count === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '12px 0', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 8, border: '1.5px dashed var(--muted)', background: 'transparent', flexShrink: 0, marginTop: 9 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', lineHeight: 1.3 }}>
          {pin.guess || 'A spot'}
        </div>
        {meta && (
          <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginTop: 3, opacity: 0.85 }}>{meta}</div>
        )}
        <input
          type="text"
          data-testid="sheet-name-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hint}
          style={{
            marginTop: 8, width: '100%', boxSizing: 'border-box', fontFamily: SERIF, fontSize: 15, color: 'var(--text)',
            background: 'var(--card-2, var(--card))', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 11px',
          }}
        />
        {Array.isArray(pin.who) && pin.who.length > 0 && (
          <div style={{ marginTop: 7 }}><AvatarStack ids={pin.who} size={16} gap={-4} /></div>
        )}
      </div>
    </div>
  )
}

function NamedRow({ entry }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '12px 0', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 8, background: 'var(--kept, var(--accent))', flexShrink: 0, marginTop: 9 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: 15.5, fontWeight: 600, lineHeight: 1.2, color: 'var(--text)' }}>{entry.name}</div>
        {(entry.time || '').trim() && (
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{entry.time}</div>
        )}
        {Array.isArray(entry.for) && entry.for.length > 0 && (
          <div style={{ marginTop: 7 }}><AvatarStack ids={entry.for} size={16} gap={-4} /></div>
        )}
      </div>
    </div>
  )
}

export default function SettleSheet({ dayLabel = '', pins = [], namedEntries = [], party = [], tz, v, onKeep, onClose }) {
  const [names, setNames] = useState({})
  const setName = (id, val) => setNames((m) => ({ ...m, [id]: val }))

  // Modal manners: Escape closes, and the page behind can't scroll while it's up.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  function keep() {
    // Each pin becomes a draft entry; a TYPED name graduates it to a memory (name set,
    // guess kept for honesty). A blank name stays an honest dashed draft — valid.
    const drafts = pinsToDraftEntries(pins, { party, tz }).map((d) => {
      const typed = (names[d.id] || '').trim()
      return typed ? { ...d, name: typed } : d
    })
    onKeep({ drafts })
  }

  return (
    <div
      role="dialog"
      aria-label="The record"
      data-testid="settle-sheet"
      style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
    >
      <div onClick={onClose} aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.42)' }} />
      <div
        style={{
          position: 'relative', background: 'var(--bg, var(--card))', borderTopLeftRadius: 20, borderTopRightRadius: 20,
          borderTop: '1px solid var(--border)', boxShadow: '0 -8px 30px rgba(0,0,0,0.25)',
          padding: '18px 18px calc(18px + env(safe-area-inset-bottom))', maxHeight: '86vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--kept, var(--accent-text))', fontWeight: 600 }}>
            {v.lc(v.sheetTitle)}{dayLabel ? ` · ${dayLabel}` : ''}
          </div>
          <button
            type="button" onClick={onClose} data-testid="sheet-close" aria-label="Close"
            style={{ background: 'transparent', border: 0, color: 'var(--muted)', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: 4 }}
          >×</button>
        </div>
        <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13.5, color: 'var(--muted)', margin: '8px 0 4px', lineHeight: 1.45 }}>
          {v.lc(v.sheetIntro)}
        </p>
        <div style={{ marginTop: 4 }}>
          {namedEntries.map((e, i) => <NamedRow key={e.id || `n${i}`} entry={e} />)}
          {pins.map((pin) => (
            <DraftNameRow key={pin.id} pin={pin} tz={tz} value={names[pin.id] || ''} onChange={(val) => setName(pin.id, val)} hint={v.lc(v.sheetNameHint)} />
          ))}
        </div>
        <button
          type="button" data-testid="sheet-keep" onClick={keep}
          style={{
            marginTop: 16, width: '100%', minHeight: 46, borderRadius: 14, background: 'var(--kept, var(--accent))', color: '#1c1408',
            border: 0, cursor: 'pointer', fontFamily: 'Inter Tight, -apple-system, system-ui, sans-serif', fontWeight: 600, fontSize: 15,
          }}
        >
          {v.lc(v.settleCta)}
        </button>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
          {v.lc(v.sheetFooter)}
        </div>
      </div>
    </div>
  )
}
