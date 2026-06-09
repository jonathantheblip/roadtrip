import { useRef, useState } from 'react'
import { ChevronLeft, Check, Loader } from 'lucide-react'
import { newTripId } from '../utils/ids'

// Manual trip entry. Creates a renderer-safe *draft* trip and hands off
// to the editor so Days/Stops/pitches get filled in incrementally —
// Helen never re-enters a trip because a tap didn't take.
//
// Duplicate-bug fix (change order 2026-05-17 §3):
//  - The trip id is minted ONCE per form instance (useRef), not per
//    submit. Re-submitting the same form upserts the one row instead of
//    inserting a new one each tap.
//  - Submit is guarded in-flight and the button is disabled + shows a
//    loading state until the Worker save resolves.
//  - Success → brief confirmation → straight into the editor.
//  - Failure → inline error, no navigation, retry is safe (same id).
//  - Missing required field → inline error, nothing written.
export function NewTrip({ onBack, onCreate, dark = false }) {
  // Minted once. Stable for the lifetime of this form — the linchpin of
  // idempotency. Do NOT move this into handleSubmit.
  const idRef = useRef(newTripId())

  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [dateRange, setDateRange] = useState('')
  const [startCity, setStartCity] = useState('')
  const [endCity, setEndCity] = useState('')
  const [travelers, setTravelers] = useState(['jonathan', 'helen', 'aurelia', 'rafa'])

  const [phase, setPhase] = useState('idle') // idle | saving | done
  const [error, setError] = useState('')
  const [titleError, setTitleError] = useState('')

  function toggleTraveler(id) {
    setTravelers((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // In-flight guard: ignore taps while a save is pending or already
    // done. This is the primary defense against the triple-submit.
    if (phase !== 'idle') return

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setTitleError('Give the trip a title before creating it.')
      return
    }
    setTitleError('')
    setError('')
    setPhase('saving')

    // Renderer-safe shape: every field the themed views read exists,
    // with safe empties. `draft: true` keeps it out of the polished
    // views (and the cold-start picker) until it's published.
    const trip = {
      id: idRef.current,
      draft: true,
      status: 'planning',
      title: trimmedTitle,
      subtitle: subtitle.trim(),
      epigraph: '',
      dateRange: dateRange.trim() || 'TBD',
      dateRangeStart: null,
      dateRangeEnd: null,
      startCity: startCity.trim(),
      endCity: endCity.trim(),
      miles: 0,
      travelers,
      overview: '',
      sharedAlbumURL: '',
      days: [],
    }

    let res
    try {
      res = await onCreate(trip)
    } catch (err) {
      res = { ok: false, error: err?.message || String(err) }
    }

    if (res && res.ok) {
      setPhase('done')
      // Brief confirmation, then the editor opens (App handles the
      // actual navigation once it sees ok).
    } else {
      setError(
        (res && res.error) ||
          'Could not save the trip. It is kept on this device — tap Create to retry.'
      )
      setPhase('idle') // retry is safe: same stable id, upsert not insert
    }
  }

  const busy = phase === 'saving'
  const done = phase === 'done'

  return (
    // Theme-aware surface (was hardcoded `helen-paper` + near-black text,
    // which rendered title/subtitle/footer invisible on Jonathan's dark
    // theme since `helen-paper` is `background: var(--card)` = charcoal
    // there). surface-light/surface-dark set both the background AND a
    // legible `--text` foreground, and surface-dark flips the cream
    // inputs to their dark variant. Matches the Settings pattern.
    <div className={`min-h-screen pb-32 ${dark ? 'surface-dark' : 'surface-light'}`}>
      <header
        className="px-6 pb-6"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 24px)',
          borderBottom: '1px solid var(--border)',
        }}
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
        <h1 className="f-news tt-tightest text-5xl leading-95">New Trip</h1>
        <p className="f-news-i text-base opacity-60 mt-2 max-w-md">
          A starting frame. You'll add days, stops, and the rest in the
          editor next — nothing here is final.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Field label="Title" required error={titleError}>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (titleError) setTitleError('')
            }}
            placeholder="Rafa's Birthday Weekend"
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
            placeholder="A long weekend in New York"
            className="memory-textarea"
            style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
            disabled={busy || done}
          />
        </Field>

        <Field label="Date range">
          <input
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            placeholder="June 19 – 21, 2026"
            className="memory-textarea"
            style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
            disabled={busy || done}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start city">
            <input
              value={startCity}
              onChange={(e) => setStartCity(e.target.value)}
              placeholder="Belmont, MA"
              className="memory-textarea"
              style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
              disabled={busy || done}
            />
          </Field>
          <Field label="End city">
            <input
              value={endCity}
              onChange={(e) => setEndCity(e.target.value)}
              placeholder="New York, NY"
              className="memory-textarea"
              style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
              disabled={busy || done}
            />
          </Field>
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
                  // Theme-inverting active state so the selected pill
                  // reads on both light and dark surfaces (was hardcoded
                  // near-black, which vanished on Jonathan's dark theme).
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
          <p
            role="alert"
            className="f-dm text-sm"
            style={{ color: '#8B2B1F', lineHeight: 1.4 }}
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-between" style={{ marginTop: 24 }}>
          <p className="f-dm text-[11px] opacity-50 italic max-w-sm">
            Saved as a draft and synced to the family. You finish it in the
            editor — it won't show in the trip list until you publish.
          </p>
          <div className="flex items-center" style={{ gap: 10, flexShrink: 0 }}>
            <button
              type="button"
              onClick={onBack}
              className="btn-pill"
              disabled={busy}
              style={{ cursor: busy ? 'default' : 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-solid"
              disabled={busy || done}
              aria-busy={busy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                opacity: busy || done ? 0.75 : 1,
                cursor: busy || done ? 'default' : 'pointer',
              }}
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
      <span className="smallcaps f-dm text-[11px] opacity-70">
        {label}
        {required && <span style={{ color: '#8B2B1F', marginLeft: 4 }}>*</span>}
      </span>
      {children}
      {error && (
        <span role="alert" className="f-dm text-xs" style={{ color: '#8B2B1F' }}>
          {error}
        </span>
      )}
    </label>
  )
}
