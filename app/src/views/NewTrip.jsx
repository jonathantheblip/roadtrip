import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, Check, Loader } from 'lucide-react'
import { newTripId } from '../utils/ids'
import { geocodeAddress } from '../lib/geocode'
import { humanDateRange } from '../lib/createTripCard'
import { tripCompleteness } from '../lib/tripComplete'

// Pure so the live "Ready to publish" preview on this screen and the actual
// submit (below) always agree on the seeded summary + days (Design 01#4).
function seedFromInputs({ driving, endCity, placeName, trimmedTitle, startDate, endDate }) {
  const overview = driving
    ? `A road trip${endCity.trim() ? ` to ${endCity.trim()}` : ''}`
    : placeName.trim()
      ? `A stay at ${placeName.trim()}`
      : trimmedTitle
  const days = (() => {
    if (!startDate || !endDate) return []
    const s = new Date(`${startDate}T00:00:00Z`)
    const e = new Date(`${endDate}T00:00:00Z`)
    if (isNaN(s) || isNaN(e) || e < s) return []
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const out = []
    let n = 1
    for (const d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
      const label = `${WD[d.getUTCDay()]} ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`
      out.push({ n, isoDate: d.toISOString().slice(0, 10), date: label, title: label, stops: [] })
      n++
    }
    return out
  })()
  return { overview, days }
}

// Manual trip entry. Creates a renderer-safe *draft* trip and hands off
// to the editor so Days/Stops/pitches get filled in incrementally —
// Helen never re-enters a trip because a tap didn't take.
//
// PLACE-FIRST (2026-06-20, FAMILY_TRIPS_VISION): most family trips are a STAY
// (a cabin, Grandma's, a beach house), not a drive A→B. So creation leads with
// "Where are you staying?" and is a STAY by default; "we're driving between
// places" is a toggle you flip only for the rare road trip. This is the root-cause
// fix for trips landing as 'route' (the old form had NO place field, so a stay's
// address got stuffed into "End city" and the whole app wore road-trip clothing).
//   - STAY  → trip.shape='stay' + trip.lodging{name,address,lat,lng}; the place is
//             the spine. The address geocodes here; the pin is confirmed next in
//             the editor (where LodgingPinConfirm already lives).
//   - ROUTE → trip.shape='route' + startCity/endCity (today's road-trip fields).
// An explicit trip.shape is the top-priority signal inferTripShape reads, so the
// shape chosen here is authoritative (no reliance on heuristics).
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
export function NewTrip({ onBack, onCreate, presetShape, dark = false }) {
  // Minted once. Stable for the lifetime of this form — the linchpin of
  // idempotency. Do NOT move this into handleSubmit.
  const idRef = useRef(newTripId())

  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  // Real dates, captured once here so they pre-fill the editor's date pickers
  // (no entering dates twice) and auto-derive the display label. Optional at
  // creation — leave them blank and set them once in the editor instead.
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Place-first (the STAY spine). The address is geocoded at SUBMIT (not on blur —
  // an on-blur re-render races the Create tap and eats the first click), so
  // lat/lng/geoFor ride onto trip.lodging and the stay engages from the start.
  const [placeName, setPlaceName] = useState('')
  const [placeAddress, setPlaceAddress] = useState('')

  // Off = a STAY (the frequent case). On = a road trip (start→end city). The
  // shape-first front door (NewTripStart) presets this — 'road' opens driving on;
  // every other shape (stay / city / together) is a place you settle into.
  const [driving, setDriving] = useState(presetShape === 'road')
  const [startCity, setStartCity] = useState('')
  const [endCity, setEndCity] = useState('')

  const [travelers, setTravelers] = useState(['jonathan', 'helen', 'aurelia', 'rafa'])

  const [phase, setPhase] = useState('idle') // idle | saving | done
  const [error, setError] = useState('')
  const [titleError, setTitleError] = useState('')
  // Which action is in flight/just finished, so the OTHER button's label
  // never flickers to "Saving…"/"Published" for a tap it didn't get.
  const [pendingKind, setPendingKind] = useState(null) // null | 'publish' | 'draft'

  function toggleTraveler(id) {
    setTravelers((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]))
  }

  // Live preview of what creation would seed, so the "Ready to publish" gate
  // (Design 01#4 step 2) reflects the form as typed — the same seeding logic
  // submit uses below, kept in one place (seedFromInputs).
  const trimmedTitleLive = title.trim()
  const seed = useMemo(
    () => seedFromInputs({ driving, endCity, placeName, trimmedTitle: trimmedTitleLive, startDate, endDate }),
    [driving, endCity, placeName, trimmedTitleLive, startDate, endDate]
  )
  // An inverted range (end before start) also seeds zero days, so the generic
  // gate would only say "At least one day" — true but not the actual problem.
  // Name it directly instead of leaving the fat-finger to guess.
  const invertedRange = !!(startDate && endDate && startDate > endDate)
  const comp = useMemo(() => {
    const base = tripCompleteness({
      title: trimmedTitleLive,
      dateRangeStart: startDate || null,
      dateRangeEnd: endDate || null,
      overview: seed.overview,
      days: seed.days,
    })
    if (!invertedRange) return base
    return {
      ok: false,
      missing: [
        'End date is before the start date — swap them',
        ...base.missing.filter((m) => m !== 'At least one day'),
      ],
    }
  }, [trimmedTitleLive, startDate, endDate, seed, invertedRange])
  const daysPreviewLabel = useMemo(() => {
    const weekdays = seed.days.map((d) => (d.title || '').split(' ')[0]).filter(Boolean)
    if (weekdays.length === 0) return ''
    return weekdays.length <= 7 ? weekdays.join(' · ') : `${weekdays.length} days`
  }, [seed.days])

  // The shared core for both CTAs — only the `publish` flag (→ draft:false)
  // and the resulting navigation (handled by App's onCreate) differ.
  async function submitTrip(publish) {
    // In-flight guard: ignore taps while a save is pending or already
    // done. This is the primary defense against the triple-submit.
    if (phase !== 'idle') return

    if (!trimmedTitleLive) {
      setTitleError('Give the trip a title before creating it.')
      return
    }
    setTitleError('')
    setError('')
    setPendingKind(publish ? 'publish' : 'draft')
    setPhase('saving')

    // Geocode the stay address now (keyless, throttled, never throws → null on a
    // miss). Coords let the place card + live rail + no-GPS photo filing engage
    // the moment the trip publishes; the editor's draggable pin refines it next.
    let stayCoords = null
    const addr = placeAddress.trim()
    if (!driving && addr) {
      const hit = await geocodeAddress(addr)
      if (hit) stayCoords = { lat: hit.lat, lng: hit.lng, geoFor: addr }
    }

    // Renderer-safe shape: every field the themed views read exists, with safe
    // empties. `draft: false` (Publish) sends it straight to the polished views;
    // `draft: true` ("Add plans first") keeps it out of them (and the cold-start
    // picker) until it's published later, same as before. `shape` is set
    // explicitly so the trip is what the user said it is, not a heuristic guess.
    const trip = {
      id: idRef.current,
      draft: !publish,
      status: 'planning',
      shape: driving ? 'route' : 'stay',
      title: trimmedTitleLive,
      subtitle: subtitle.trim(),
      epigraph: '',
      // Structured dates carry straight into the editor (pre-filled, no re-entry);
      // the human label is derived from them ('TBD' when no start date is given).
      dateRange: humanDateRange(startDate || null, endDate || null),
      dateRangeStart: startDate || null,
      dateRangeEnd: endDate || null,
      // Road-trip fields only when it IS a road trip — a stay must not carry an
      // end city (it feeds the drive-home ETA scaffolding a stay sheds).
      startCity: driving ? startCity.trim() : '',
      endCity: driving ? endCity.trim() : '',
      miles: 0,
      travelers,
      overview: seed.overview,
      sharedAlbumURL: '',
      // The stay spine. Always present (renderer-safe); filled for a stay. Coords
      // ride along when the address geocoded so the place card + filer engage now.
      lodging: !driving
        ? { name: placeName.trim(), address: addr, ...(stayCoords || {}) }
        : {},
      days: seed.days,
      // The parts model (new-trip redesign). A simple trip is one part; its type
      // carries the finer shape the picker chose (a city vs a lazy stay) while the
      // legacy `shape`/`lodging`/`days` above keep every existing surface rendering
      // unchanged. A bigger composite trip (many parts) comes from the concierge.
      parts: [
        {
          id: `${idRef.current}__p1`,
          type: presetShape === 'city' ? 'city' : driving ? 'drive' : 'stay',
          title: trimmedTitleLive,
          place: !driving ? { name: placeName.trim(), address: addr, ...(stayCoords || {}) } : null,
          dateStart: startDate || null,
          dateEnd: endDate || null,
          days: seed.days,
        },
      ],
    }

    let res
    try {
      res = await onCreate(trip)
    } catch (err) {
      res = { ok: false, error: err?.message || String(err) }
    }

    if (res && res.ok) {
      setPhase('done')
      // Brief confirmation, then App navigates (to the trip's home when
      // published, into the editor when it's a draft) once it sees ok.
    } else {
      setError(
        (res && res.error) ||
          'Could not save the trip. It is kept on this device — tap Create to retry.'
      )
      setPhase('idle') // retry is safe: same stable id, upsert not insert
      setPendingKind(null)
    }
  }

  // Enter-to-submit keeps doing exactly what it always did (create as a
  // draft, gate-free) — it must NOT map to the gated Publish action. A
  // `disabled` submit button blocks ALL implicit Enter-submission in a form
  // once it's the only `type="submit"` control, not just clicks on it, so
  // gating Publish natively would have silently swallowed Enter whenever the
  // trip wasn't ready to publish yet. "Add plans first" is the real
  // `type="submit"` below; Publish is a plain gated button.
  function handleFormSubmit(e) {
    e.preventDefault()
    submitTrip(false)
  }
  function handleClickPublish() {
    if (!comp.ok) return
    submitTrip(true)
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

      <form onSubmit={handleFormSubmit} className="px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Field label="Title" required error={titleError}>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (titleError) setTitleError('')
            }}
            placeholder="A weekend at the cabin"
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
            placeholder="Three nights away, nothing on the schedule"
            className="memory-textarea"
            style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
            disabled={busy || done}
          />
        </Field>

        {/* Dates, entered once. They carry into the editor's date pickers and
            auto-make the display label — no typing the dates a second time. */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="memory-textarea"
              style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
              disabled={busy || done}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="memory-textarea"
              style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
              disabled={busy || done}
            />
          </Field>
        </div>

        {/* PLACE-FIRST: the stay spine, shown unless this is a road trip. */}
        {!driving && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Where are you staying?">
              <input
                value={placeName}
                onChange={(e) => setPlaceName(e.target.value)}
                placeholder="The cabin · Grandma's · the beach house"
                className="memory-textarea"
                style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
                disabled={busy || done}
              />
            </Field>
            <Field label="Address">
              <input
                value={placeAddress}
                onChange={(e) => setPlaceAddress(e.target.value)}
                placeholder="We’ll find it on the map (you can refine it later)"
                className="memory-textarea"
                style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
                disabled={busy || done}
              />
            </Field>
          </div>
        )}

        {/* The shape toggle. Off = a stay (the common case). On reveals the
            road-trip fields. Default off so the frequent trip lands right. */}
        <label
          className="flex items-center justify-between"
          style={{ gap: 12, cursor: busy || done ? 'default' : 'pointer' }}
        >
          <span className="flex flex-col" style={{ gap: 2 }}>
            <span className="smallcaps f-dm text-[11px] opacity-70">We’re driving between places</span>
            <span className="f-dm text-[11px] opacity-50">Turn on for a road trip — moving through different places each night.</span>
          </span>
          <input
            type="checkbox"
            checked={driving}
            onChange={(e) => setDriving(e.target.checked)}
            disabled={busy || done}
            style={{ width: 20, height: 20, flexShrink: 0, cursor: 'inherit', accentColor: 'var(--accent, var(--text))' }}
            aria-label="We’re driving between places (a road trip)"
          />
        </label>

        {/* Road-trip fields — only when driving. */}
        {driving && (
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
        )}

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
            style={{ color: 'var(--accent-text, var(--text))', lineHeight: 1.4 }}
          >
            {error}
          </p>
        )}

        {/* Publish gate preview (Design 01#4 step 2) — mirrors the editor's gate
            (lib/tripComplete) so "ready to publish" means the same thing in both
            places. Floor = title + dates; a place and the seeded summary/days
            ride along automatically. */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 'min(var(--radius, 12px), 14px)',
            border: '1px solid var(--border)',
            background: 'var(--card)',
          }}
        >
          {comp.ok ? (
            <>
              <p className="smallcaps f-dm text-[11px]" style={{ color: 'var(--accent-text, var(--text))' }}>
                Ready to publish
              </p>
              <p className="f-news-i text-sm opacity-80" style={{ marginTop: 6 }}>
                Summary, written for you: “{seed.overview}”
              </p>
              {daysPreviewLabel && (
                <p className="f-dm text-xs opacity-60" style={{ marginTop: 4 }}>
                  Days seeded from your dates — {daysPreviewLabel}. Empty is fine.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="smallcaps f-dm text-[11px] opacity-70">Still needed before publishing</p>
              <ul
                id="publish-gate-missing"
                style={{ listStyle: 'disc', paddingLeft: 18, marginTop: 6 }}
                className="f-dm text-xs opacity-70"
              >
                {comp.missing.slice(0, 6).map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex items-center justify-between" style={{ marginTop: 24, flexWrap: 'wrap', gap: 12 }}>
          <p className="f-dm text-[11px] opacity-50 italic max-w-sm">
            {comp.ok
              ? 'You can plan after you publish — or not at all.'
              : 'Saved as a draft on this device — just yours for now. You finish it in the editor; the family sees it only when you publish.'}
          </p>
          <div className="flex items-center" style={{ gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
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
              className="btn-pill"
              disabled={busy || done}
              aria-busy={busy && pendingKind === 'draft'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                opacity: busy || done ? 0.75 : 1,
                cursor: busy || done ? 'default' : 'pointer',
              }}
            >
              {pendingKind === 'draft' && busy && <Loader size={14} className="rt-spin" />}
              {pendingKind === 'draft' && done && <Check size={14} />}
              {pendingKind === 'draft' && busy ? 'Saving…' : pendingKind === 'draft' && done ? 'Saved' : 'Add plans first →'}
            </button>
            <button
              type="button"
              onClick={handleClickPublish}
              className="btn-solid"
              disabled={busy || done || !comp.ok}
              aria-busy={busy && pendingKind === 'publish'}
              aria-describedby={!comp.ok ? 'publish-gate-missing' : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                opacity: busy || done || !comp.ok ? 0.6 : 1,
                cursor: busy || done || !comp.ok ? 'default' : 'pointer',
              }}
            >
              {pendingKind === 'publish' && busy && <Loader size={14} className="rt-spin" />}
              {pendingKind === 'publish' && done && <Check size={14} />}
              {pendingKind === 'publish' && busy ? 'Publishing…' : pendingKind === 'publish' && done ? 'Published' : 'Publish'}
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
        {required && <span style={{ color: 'var(--accent-text, var(--text))', marginLeft: 4 }}>*</span>}
      </span>
      {children}
      {error && (
        <span role="alert" className="f-dm text-xs" style={{ color: 'var(--accent-text, var(--text))' }}>
          {error}
        </span>
      )}
    </label>
  )
}
