import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'

// Manual trip entry form. This shapes a Trip object with no Days yet —
// Days/Stops are added inside Trip Detail (next pass) or via screenshot
// ingestion (needs Claude API). The form just gives Jonathan a fast path
// to get a planning trip on the page tonight.
export function NewTrip({ onBack, onCreate }) {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [dateRange, setDateRange] = useState('')
  const [startCity, setStartCity] = useState('')
  const [endCity, setEndCity] = useState('')
  const [travelers, setTravelers] = useState(['jonathan', 'helen', 'aurelia', 'rafa'])

  function toggleTraveler(id) {
    setTravelers((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    const id = `trip-${Date.now().toString(36)}`
    onCreate({
      id,
      status: 'planning',
      title: title.trim(),
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
    })
  }

  return (
    <div className="min-h-screen helen-paper pb-32" style={{ color: '#1A1614' }}>
      <header
        className="px-6 pt-6 pb-6"
        style={{ borderBottom: '1px solid #DDD3C2' }}
      >
        <button
          onClick={onBack}
          className="link-quiet flex items-center gap-1 f-dm text-xs opacity-70"
          style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, marginBottom: 24 }}
          type="button"
        >
          <ChevronLeft size={14} /> Trips
        </button>
        <h1 className="f-news tt-tightest text-5xl leading-95">New Trip</h1>
        <p className="f-news-i text-base opacity-60 mt-2 max-w-md">
          A starting frame. Days and stops get added once the dates firm up.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Field label="Title" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Rafa's Birthday Weekend"
            className="memory-textarea"
            style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
          />
        </Field>

        <Field label="Subtitle">
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="A long weekend in New York"
            className="memory-textarea"
            style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
          />
        </Field>

        <Field label="Date range">
          <input
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            placeholder="May 8 – 10, 2026"
            className="memory-textarea"
            style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
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
            />
          </Field>
          <Field label="End city">
            <input
              value={endCity}
              onChange={(e) => setEndCity(e.target.value)}
              placeholder="New York, NY"
              className="memory-textarea"
              style={{ minHeight: 'auto', padding: 12, fontSize: 16 }}
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
                style={{
                  background: travelers.includes(id) ? '#1A1614' : 'transparent',
                  color: travelers.includes(id) ? '#FBF8F2' : 'inherit',
                  textTransform: 'capitalize',
                }}
                onClick={() => toggleTraveler(id)}
              >
                {id}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex items-center justify-between" style={{ marginTop: 24 }}>
          <p className="f-dm text-[11px] opacity-50 italic max-w-sm">
            Syncs to iCloud once you're signed in; cached locally either way.
          </p>
          <button type="submit" className="btn-solid">
            Create trip
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <label className="flex flex-col" style={{ gap: 6 }}>
      <span className="smallcaps f-dm text-[11px] opacity-70">
        {label}
        {required && <span style={{ color: '#8B2B1F', marginLeft: 4 }}>*</span>}
      </span>
      {children}
    </label>
  )
}
