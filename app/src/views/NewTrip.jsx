import { useRef, useState } from 'react'
import { ChevronLeft, Check, Loader } from 'lucide-react'
import { newTripId } from '../utils/ids'
import { geocodeAddress } from '../lib/geocode'
import { humanDateRange } from '../lib/createTripCard'

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
    // empties. `draft: true` keeps it out of the polished views (and the
    // cold-start picker) until it's published. `shape` is set explicitly so the
    // trip is what the user said it is, not what a heuristic guesses.
    const trip = {
      id: idRef.current,
      draft: true,
      status: 'planning',
      shape: driving ? 'route' : 'stay',
      title: trimmedTitle,
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
      overview: '',
      sharedAlbumURL: '',
      // The stay spine. Always present (renderer-safe); filled for a stay. Coords
      // ride along when the address geocoded so the place card + filer engage now.
      lodging: !driving
        ? { name: placeName.trim(), address: addr, ...(stayCoords || {}) }
        : {},
      days: [],
      // The parts model (new-trip redesign). A simple trip is one part; its type
      // carries the finer shape the picker chose (a city vs a lazy stay) while the
      // legacy `shape`/`lodging`/`days` above keep every existing surface rendering
      // unchanged. A bigger composite trip (many parts) comes from the concierge.
      parts: [
        {
          id: `${idRef.current}__p1`,
          type: presetShape === 'city' ? 'city' : driving ? 'drive' : 'stay',
          title: trimmedTitle,
          place: !driving ? { name: placeName.trim(), address: addr, ...(stayCoords || {}) } : null,
          dateStart: startDate || null,
          dateEnd: endDate || null,
          days: [],
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
            style={{ color: '#8B2B1F', lineHeight: 1.4 }}
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-between" style={{ marginTop: 24 }}>
          <p className="f-dm text-[11px] opacity-50 italic max-w-sm">
            Saved as a draft on this device — just yours for now. You finish it
            in the editor; the family sees it only when you publish.
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
