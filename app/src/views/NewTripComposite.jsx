import { useRef, useState } from 'react'
import { ChevronLeft, Check, Loader, Plus, Trash2 } from 'lucide-react'
import { newTripId } from '../utils/ids'
import { humanDateRange } from '../lib/createTripCard'
import { PART_TYPES } from '../lib/tripParts'

// Manual "bigger trip" builder (new-trip redesign — the composite escape).
//
// The shape-first front door routes "A bigger trip" here when you'd rather lay
// the legs out by hand than describe them to Claude. You build a flat, ordered
// list of PARTS (a flight, a few nights in a city, a stay, a drive); on Create it
// writes a real draft trip carrying `parts[]` and opens the editor — and the saved
// trip renders in the shape-aware living heart ("The plan" / PartsOutline), each part's timed days.
//
// Mirrors NewTrip's contract exactly: id minted ONCE (idRef) for upsert idempotency,
// in-flight guard, onCreate → editor, only Title required. Trip dates AUTO-DERIVE
// from the parts (min start / max end) so dates are never entered twice. Theme-aware.

const TYPE_LABEL = {
  stay: 'Stay', city: 'City', drive: 'Drive', flight: 'Flight',
  event: 'Event', train: 'Train', ferry: 'Ferry', cruise: 'Cruise',
}
const blankPart = () => ({ type: 'city', title: '', place: '', dateStart: '', dateEnd: '' })

export function NewTripComposite({ onBack, onCreate, dark = false }) {
  const idRef = useRef(newTripId())
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [travelers, setTravelers] = useState(['jonathan', 'helen', 'aurelia', 'rafa'])
  // Start with two rows — a composite is "several parts in one"; the form should
  // read as multi-part from the first glance. Empty rows are dropped on Create.
  const [parts, setParts] = useState([blankPart(), blankPart()])
  const [phase, setPhase] = useState('idle') // idle | saving | done
  const [error, setError] = useState('')
  const [titleError, setTitleError] = useState('')

  const busy = phase === 'saving'
  const done = phase === 'done'

  function toggleTraveler(id) {
    setTravelers((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]))
  }
  function patchPart(i, p) {
    setParts((cur) => cur.map((row, idx) => (idx === i ? { ...row, ...p } : row)))
  }
  function addPart() {
    setParts((cur) => [...cur, blankPart()])
  }
  function removePart(i) {
    setParts((cur) => (cur.length <= 1 ? cur : cur.filter((_, idx) => idx !== i)))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (phase !== 'idle') return
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setTitleError('Give the trip a title before creating it.')
      return
    }
    setTitleError('')
    setError('')

    // Keep only parts the user actually filled in (a title or a place). Empty
    // scaffolding rows are dropped — minimal at creation, the rest in the editor.
    const kept = parts
      .map((p) => ({
        type: PART_TYPES.includes(p.type) ? p.type : 'stay',
        title: p.title.trim(),
        place: p.place.trim(),
        dateStart: p.dateStart || '',
        dateEnd: p.dateEnd || '',
      }))
      .filter((p) => p.title || p.place)

    setPhase('saving')

    const builtParts = kept.map((p, i) => ({
      id: `${idRef.current}__p${i + 1}`,
      type: p.type,
      title: p.title,
      place: p.place || null,
      dateStart: p.dateStart || null,
      dateEnd: p.dateEnd || null,
      days: [],
    }))

    // The trip window spans the parts (so dates aren't entered twice). Falls back
    // to null when no part carries dates — the editor can set them later.
    const starts = builtParts.map((p) => p.dateStart).filter(Boolean).sort()
    const ends = builtParts.map((p) => p.dateEnd || p.dateStart).filter(Boolean).sort()
    const tripStart = starts[0] || null
    const tripEnd = ends[ends.length - 1] || null

    const trip = {
      id: idRef.current,
      draft: true,
      status: 'planning',
      title: trimmedTitle,
      subtitle: subtitle.trim(),
      epigraph: '',
      dateRange: humanDateRange(tripStart, tripEnd),
      dateRangeStart: tripStart,
      dateRangeEnd: tripEnd,
      startCity: '',
      endCity: '',
      miles: 0,
      travelers,
      overview: '',
      sharedAlbumURL: '',
      lodging: {},
      days: [],
      // The composite payload. Two+ parts → hasExplicitParts → the saved trip
      // renders in the living heart's parts-aware "The plan". (Zero kept parts is allowed — it just becomes a
      // plain draft the editor fills in; we never block Create on the parts.)
      ...(builtParts.length ? { parts: builtParts } : {}),
    }

    let res
    try {
      res = await onCreate(trip)
    } catch (err) {
      res = { ok: false, error: err?.message || String(err) }
    }
    if (res && res.ok) {
      setPhase('done')
    } else {
      setError((res && res.error) || 'Could not save the trip. It is kept on this device — tap Create to retry.')
      setPhase('idle')
    }
  }

  return (
    <div className={`min-h-screen pb-32 ${dark ? 'surface-dark' : 'surface-light'}`}>
      <header
        className="px-6 pb-6"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 24px)', borderBottom: '1px solid var(--border)' }}
      >
        <button
          onClick={onBack}
          className="link-quiet flex items-center gap-1 f-dm text-xs opacity-70"
          style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, marginBottom: 24 }}
          type="button"
          disabled={busy}
        >
          <ChevronLeft size={14} /> Trips
        </button>
        <h1 className="f-news tt-tightest text-5xl leading-95">A bigger trip</h1>
        <p className="f-news-i text-base opacity-60 mt-2 max-w-md">
          Lay out the parts — a flight, a few nights here, a stay there. Add what you know;
          you’ll fill in each part’s days in the editor next.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Field label="Title" required error={titleError}>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError('') }}
            placeholder="Italy — summer"
            className="memory-textarea"
            style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
            disabled={busy || done}
            aria-invalid={!!titleError}
          />
        </Field>

        <Field label="Subtitle">
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Rome, the coast, then a villa"
            className="memory-textarea"
            style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
            disabled={busy || done}
          />
        </Field>

        {/* The parts list — the heart of the composite builder. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="smallcaps f-dm text-[11px] opacity-80">The parts</span>
          {parts.map((p, i) => (
            <div
              key={i}
              data-testid="composite-part-row"
              style={{
                display: 'flex', flexDirection: 'column', gap: 10,
                padding: 14, borderRadius: 'var(--radius, 14px)',
                border: '1px solid var(--border)', background: 'var(--card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <select
                  value={p.type}
                  onChange={(e) => patchPart(i, { type: e.target.value })}
                  disabled={busy || done}
                  aria-label={`Part ${i + 1} type`}
                  className="memory-textarea"
                  style={{ minHeight: 'auto', padding: '8px 10px', fontSize: 14, width: 'auto', flexShrink: 0 }}
                >
                  {PART_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABEL[t] || t}</option>
                  ))}
                </select>
                <input
                  value={p.title}
                  onChange={(e) => patchPart(i, { title: e.target.value })}
                  placeholder="Three nights in Rome"
                  className="memory-textarea"
                  style={{ minHeight: 'auto', padding: 10, fontSize: 15, flex: 1 }}
                  disabled={busy || done}
                  aria-label={`Part ${i + 1} title`}
                />
                <button
                  type="button"
                  onClick={() => removePart(i)}
                  disabled={busy || done || parts.length <= 1}
                  aria-label={`Remove part ${i + 1}`}
                  className="link-quiet"
                  style={{ background: 'transparent', border: 0, cursor: parts.length <= 1 ? 'default' : 'pointer', color: 'var(--muted)', flexShrink: 0, opacity: parts.length <= 1 ? 0.35 : 1 }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <input
                value={p.place}
                onChange={(e) => patchPart(i, { place: e.target.value })}
                placeholder="Place (e.g. Rome) — optional"
                className="memory-textarea"
                style={{ minHeight: 'auto', padding: 10, fontSize: 14 }}
                disabled={busy || done}
                aria-label={`Part ${i + 1} place`}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={p.dateStart}
                  onChange={(e) => patchPart(i, { dateStart: e.target.value })}
                  className="memory-textarea"
                  style={{ minHeight: 'auto', padding: 10, fontSize: 14 }}
                  disabled={busy || done}
                  aria-label={`Part ${i + 1} start date`}
                />
                <input
                  type="date"
                  value={p.dateEnd}
                  onChange={(e) => patchPart(i, { dateEnd: e.target.value })}
                  className="memory-textarea"
                  style={{ minHeight: 'auto', padding: 10, fontSize: 14 }}
                  disabled={busy || done}
                  aria-label={`Part ${i + 1} end date`}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addPart}
            disabled={busy || done}
            className="btn-pill"
            style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: busy || done ? 'default' : 'pointer' }}
          >
            <Plus size={14} /> Add a part
          </button>
        </div>

        <Field label="Travelers">
          <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            {['jonathan', 'helen', 'aurelia', 'rafa'].map((id) => (
              <button
                key={id}
                type="button"
                className="btn-pill"
                disabled={busy || done}
                style={{
                  background: travelers.includes(id) ? 'var(--text)' : 'transparent',
                  color: travelers.includes(id) ? 'var(--bg)' : 'inherit',
                  textTransform: 'capitalize',
                  opacity: busy || done ? 0.5 : 1,
                }}
                onClick={() => toggleTraveler(id)}
              >
                {id}
              </button>
            ))}
          </div>
        </Field>

        {error && (
          <p role="alert" className="f-dm text-sm" style={{ color: '#8B2B1F', lineHeight: 1.4 }}>{error}</p>
        )}

        <div className="flex items-center justify-between" style={{ marginTop: 16 }}>
          <p className="f-dm text-[11px] opacity-70 italic max-w-sm">
            Saved as a draft on this device — just yours for now. You finish each part in the editor;
            the family sees it only when you publish.
          </p>
          <div className="flex items-center" style={{ gap: 10, flexShrink: 0 }}>
            <button type="button" onClick={onBack} className="btn-pill" disabled={busy} style={{ cursor: busy ? 'default' : 'pointer' }}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-solid"
              disabled={busy || done}
              aria-busy={busy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, opacity: busy || done ? 0.75 : 1, cursor: busy || done ? 'default' : 'pointer' }}
            >
              {busy && <Loader size={14} className="rt-spin" />}
              {done && <Check size={14} />}
              {busy ? 'Creating…' : done ? 'Created' : 'Create trip'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function Field({ label, required, error, children }) {
  return (
    <label className="flex flex-col" style={{ gap: 6 }}>
      <span className="smallcaps f-dm text-[11px] opacity-80">
        {label}
        {/* Accent token, not a hardcoded dark red — the red marker fell to ~2:1
            (invisible) on the dark surface; --accent-text clears AA on every lens. */}
        {required && <span style={{ color: 'var(--accent-text, var(--text))', marginLeft: 4 }}>*</span>}
      </span>
      {children}
      {error && <span role="alert" className="f-dm text-xs" style={{ color: 'var(--accent-text, var(--text))' }}>{error}</span>}
    </label>
  )
}
