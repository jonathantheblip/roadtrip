// THE RECORD · the settle SHEET (R4c; verbs 2026-07-06) — the "one touch" that
// names the day, now with the promised verbs real: fix what's wrong (tap the
// who-chips), name what's nameless (the input), skip what you like ("leave this
// out" — also the surprise escape hatch), and look inside any pin (its member
// photos). A day's pending "Rafa told about today" note surfaces here too, with
// one tap to tuck his words into the record. Nothing here writes to the plan
// (day.stops); leaving a pin unnamed and keeping anyway is still valid, and a
// KEPT day re-opens into this same sheet — gold means the day counts, never
// that it's closed (VISION §3).
import { useState, useEffect, useMemo } from 'react'
import { Play } from 'lucide-react'
import { pinsToDraftEntries, spanWords, evidenceRefs } from '../lib/evidence'
import { evidenceOverlapScore } from '../lib/dayRecord'
import { useHydratedMemories } from '../lib/usePhotoHydration'
import { thumbUrl } from '../lib/thumbUrl'
import { loadAsset } from '../lib/memAssets'
import { AvatarStack } from '../components/Avatar'
import { TRAVELERS } from '../data/travelers'

const SERIF = 'Fraunces, "Iowan Old Style", Georgia, serif'
const MONO = 'JetBrains Mono, ui-monospace, monospace'

// A quiet text-button — the sheet's controls must read as options, not chrome.
function QuietBtn({ onClick, testid, children, ariaLabel }) {
  return (
    <button
      type="button" onClick={onClick} data-testid={testid} aria-label={ariaLabel}
      style={{
        background: 'transparent', border: 0, cursor: 'pointer', padding: '6px 0',
        fontFamily: MONO, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4,
      }}
    >
      {children}
    </button>
  )
}

// A pin's member photos, resolved through the SAME container order the pin ids
// were minted from (evidenceRefs) — pin.photoIds are "<memoryId>:<refIndex>".
// Lazy <img>s at a small thumb width; a ref without a renderable url simply
// doesn't tile (honest — no broken-image chrome on a calm sheet).
function PinPhotos({ pin, memById }) {
  const urls = useMemo(() => {
    const out = []
    for (const pid of pin.photoIds || []) {
      const cut = pid.lastIndexOf(':')
      if (cut < 0) continue
      const m = memById.get(pid.slice(0, cut))
      const ref = evidenceRefs(m)[Number(pid.slice(cut + 1))]
      const u = ref?.url || ref?.posterUrl
      if (u) out.push(u)
    }
    return out
  }, [pin, memById])
  if (!urls.length) return null
  return (
    <div data-testid="sheet-pin-photos" style={{ display: 'flex', gap: 6, marginTop: 8, overflowX: 'auto' }}>
      {urls.map((u, i) => (
        <img
          key={i} src={thumbUrl(u, 200)} alt="" loading="lazy" decoding="async" data-testid="sheet-pin-thumb"
          style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
        />
      ))}
    </div>
  )
}

// Tappable family chips — "who was actually there" (FIX 4). The selection
// starts from the pin's suggestion (photo authors, else the party) and every
// tap is a correction; the last chip can't be removed (an empty who is not a
// statement — the suggestion would silently win, so don't pretend otherwise).
function WhoChips({ party, selected, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
      {party.map((id) => {
        const on = selected.includes(id)
        return (
          <button
            key={id} type="button" data-testid="sheet-who-chip" data-who={id} data-on={on ? '1' : '0'}
            aria-pressed={on} aria-label={`${TRAVELERS[id]?.name || id}${on ? ' — was there' : ' — not there'}`}
            onClick={() => onToggle(id)}
            style={{
              fontFamily: MONO, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.05em',
              padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
              border: on ? '1px solid var(--kept, var(--accent))' : '1px solid var(--border)',
              background: on ? 'color-mix(in srgb, var(--kept, var(--accent)) 16%, transparent)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--muted)',
            }}
          >
            {TRAVELERS[id]?.name || id}
          </button>
        )
      })}
    </div>
  )
}

function DraftNameRow({ pin, tz, value, onChange, hint, v, memById, party, who, onToggleWho, out, onLeaveOut, onPutBack }) {
  const [open, setOpen] = useState(false)
  const words = spanWords(pin.span, { tz })
  const meta = [words, pin.count ? `${pin.count} photo${pin.count === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')
  // Left out (session): the row collapses to a muted line with its undo — still
  // present, so "leave this out" never feels like a delete.
  if (out) {
    return (
      <div data-testid="sheet-pin-row" data-left-out="1" style={{ borderTop: '1px solid var(--border)', padding: '10px 0', display: 'flex', gap: 11, alignItems: 'center' }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 8, border: '1.5px dashed var(--border)', background: 'transparent', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pin.guess || 'A spot'} · {v.lc(v.sheetLeftOut)}
        </span>
        <QuietBtn onClick={onPutBack} testid="sheet-put-back" ariaLabel={`Put it back — ${pin.guess || 'a spot'}`}>
          {v.lc(v.sheetPutBack)}
        </QuietBtn>
      </div>
    )
  }
  return (
    <div data-testid="sheet-pin-row" style={{ borderTop: '1px solid var(--border)', padding: '12px 0', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
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
        {party.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', display: 'block' }}>
              {v.lc(v.sheetWho)}
            </span>
            <WhoChips party={party} selected={who} onToggle={onToggleWho} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
          <QuietBtn onClick={() => setOpen((o) => !o)} testid="sheet-see-inside" ariaLabel={`${open ? 'Hide' : 'See'} the photos — ${pin.guess || 'a spot'}`}>
            {v.lc(open ? v.sheetHidePhotos : v.sheetSeePhotos)}
          </QuietBtn>
          <QuietBtn onClick={onLeaveOut} testid="sheet-leave-out" ariaLabel={`Leave this out — ${pin.guess || 'a spot'}`}>
            {v.lc(v.sheetLeaveOut)}
          </QuietBtn>
        </div>
        {open && <PinPhotos pin={pin} memById={memById} />}
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

// One pending "Rafa told about today" note (FIX 7) — playback straight from the
// Memory (R2 url if synced, else the device's own idb blob — the same fallback
// TripEditor's PendingNoteRow uses), his words once Whisper lands, and one tap
// to tuck them into the day as a record entry. Until a transcript exists there
// is nothing to tuck (an empty entry is nothing) — listen still works.
function RafaPendingRow({ memId, memory, v, onTuck }) {
  const [audioUrl, setAudioUrl] = useState(null)
  useEffect(() => {
    let active = true
    let created = null
    if (memory?.audioRef?.url) {
      setAudioUrl(memory.audioRef.url)
    } else if (memory?.audioRef?.key) {
      loadAsset('audio', memory.audioRef.key).then((blob) => {
        if (!active || !blob) return
        created = URL.createObjectURL(blob)
        setAudioUrl(created)
      })
    }
    return () => {
      active = false
      if (created) URL.revokeObjectURL(created)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memory?.audioRef?.key, memory?.audioRef?.url])

  const transcript = (memory?.transcript || '').trim()
  const transcribing = !transcript && memory?.transcriptionStatus === 'pending'
  return (
    <div data-testid="sheet-rafa-pending" style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
      <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--kept, var(--accent-text))', fontWeight: 600 }}>
        {v.lc(v.sheetRafaTold)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8 }}>
        <button
          type="button" data-testid="sheet-rafa-play" aria-label={v.sheetListen}
          disabled={!audioUrl}
          onClick={() => audioUrl && new Audio(audioUrl).play().catch(() => {})}
          style={{
            width: 28, height: 28, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: 'var(--kept, var(--accent))', color: '#1c1408',
            cursor: audioUrl ? 'pointer' : 'default', opacity: audioUrl ? 1 : 0.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Play size={12} fill="currentColor" />
        </button>
        <p style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: SERIF, fontStyle: transcript ? 'italic' : 'normal', fontSize: 13.5, color: transcript ? 'var(--text)' : 'var(--muted)', lineHeight: 1.4 }}>
          {transcript || v.lc(transcribing ? v.sheetTranscribing : v.sheetPlayToHear)}
        </p>
      </div>
      {transcript && onTuck && (
        <div style={{ marginTop: 6 }}>
          <QuietBtn onClick={() => onTuck(memId, transcript)} testid="sheet-rafa-tuck" ariaLabel={v.sheetTuck}>
            {v.lc(v.sheetTuck)} ›
          </QuietBtn>
        </div>
      )}
    </div>
  )
}

export default function SettleSheet({
  dayLabel = '', pins = [], namedEntries = [], party = [], tz, v, onKeep, onClose,
  memories = [], skippedIds = [], pendingIds = [], onTuckPending,
}) {
  const [names, setNames] = useState({})
  const setName = (id, val) => setNames((m) => ({ ...m, [id]: val }))
  // Session "leave this out" — persisted onto record.skipped only at keep.
  const [leftOut, setLeftOut] = useState(() => new Set())
  // Who-corrections per pin id — absent until a chip is actually tapped.
  const [whoSel, setWhoSel] = useState({})

  // Hydrate offline/pending refs the same way the album does, so see-inside
  // shows real pictures even before an upload drains.
  const hydrated = useHydratedMemories(memories)
  const memById = useMemo(() => {
    const map = new Map()
    for (const m of hydrated) if (m?.id) map.set(m.id, m)
    return map
  }, [hydrated])

  // What the sheet SHOWS: pins minus the day's persisted skips, minus pins a
  // NAMED entry already tells (same id, or overlapping photos — a grown cluster
  // is the same place; its named row is its face, not a second nameless one).
  // Un-named draft entries keep their pin row — that IS the naming affordance.
  const persistedSkip = useMemo(() => new Set(skippedIds), [skippedIds])
  const displayPins = useMemo(() => {
    const named = (namedEntries || []).filter((e) => (e?.name || '').trim())
    // "Covered" is decided by the SAME kernel the keep-merge uses
    // (evidenceOverlapScore — photoIds first, guarded legacy fallback), so a
    // pin the sheet hides is exactly a pin the merge would fold into that
    // entry. Memory-id overlap alone lied here (C1): one multi-photo share
    // spanning two places made the second place invisible — unnameable.
    return pins
      .filter((p) => !persistedSkip.has(p.id))
      .filter((p) => !named.some((e) =>
        e.id === p.id ||
        evidenceOverlapScore(
          { photoIds: p.photoIds, photos: p.memoryIds, lat: p.centroid?.lat, lng: p.centroid?.lng },
          e
        ) > 0
      ))
  }, [pins, persistedSkip, namedEntries])

  // Modal manners: Escape closes, and the page behind can't scroll while it's up.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  function whoFor(pin) {
    return whoSel[pin.id] || (Array.isArray(pin.who) && pin.who.length ? pin.who : party)
  }
  function toggleWho(pin, id) {
    const cur = whoFor(pin)
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : party.filter((p) => cur.includes(p) || p === id)
    if (!next.length) return // the last chip stays — empty is not a statement
    setWhoSel((m) => ({ ...m, [pin.id]: next }))
  }

  function keep() {
    // Every current, un-skipped pin rides the keep — including ones a named
    // entry already tells (the merge refreshes their counts in place, never
    // duplicates). A TYPED name graduates a draft; a blank stays an honest
    // dashed draft; a left-out pin writes nothing and its id is remembered.
    const active = pins.filter((p) => !persistedSkip.has(p.id) && !leftOut.has(p.id))
    const drafts = pinsToDraftEntries(active, { party, tz, who: whoSel }).map((d) => {
      const typed = (names[d.id] || '').trim()
      return typed ? { ...d, name: typed } : d
    })
    onKeep({ drafts, skipped: [...leftOut] })
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
          {displayPins.map((pin) => (
            <DraftNameRow
              key={pin.id} pin={pin} tz={tz} v={v} memById={memById} party={party}
              value={names[pin.id] || ''} onChange={(val) => setName(pin.id, val)} hint={v.lc(v.sheetNameHint)}
              who={whoFor(pin)} onToggleWho={(id) => toggleWho(pin, id)}
              out={leftOut.has(pin.id)}
              onLeaveOut={() => setLeftOut((s) => new Set(s).add(pin.id))}
              onPutBack={() => setLeftOut((s) => { const n = new Set(s); n.delete(pin.id); return n })}
            />
          ))}
          {pendingIds.map((memId) => (
            <RafaPendingRow key={memId} memId={memId} memory={memById.get(memId)} v={v} onTuck={onTuckPending} />
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
