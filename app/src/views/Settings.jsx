import { ChevronLeft, Calendar, Image as ImageIcon, RotateCcw, Moon, Sun } from 'lucide-react'
import { TRAVELERS, TRAVELER_ORDER } from '../data/travelers'
import { downloadIcs } from '../lib/icsExport'
import { useHelenDark } from '../hooks/useHelenDark'

// Per-trip settings panel: calendar export, shared album link, identity reset.
// CloudKit sync, screenshot ingestion, and Gmail wiring will live here too.
export function Settings({ trip, traveler, dark, onBack, onChangeTraveler }) {
  const [helenDark, toggleHelenDark] = useHelenDark()
  return (
    <div className={`min-h-screen pb-32 ${dark ? 'surface-dark' : 'surface-light'}`}>
      <header className="px-6 pt-6 pb-6 border-b surface-rule">
        <button
          onClick={onBack}
          className="link-quiet flex items-center gap-1 f-dm text-xs opacity-70"
          style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, marginBottom: 24 }}
          type="button"
        >
          <ChevronLeft size={14} /> Back
        </button>
        <h1 className="f-news tt-tightest text-4xl leading-95">Trip Settings</h1>
        <p className="f-news-i text-base opacity-60 mt-2">{trip.title}</p>
      </header>

      <section className="px-6 py-8 border-b surface-rule">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={14} />
          <p className="smallcaps f-dm text-[11px] opacity-70">Calendar</p>
        </div>
        <p className="f-news text-base leading-relaxed opacity-80 mb-4 max-w-prose">
          Subscribe to the trip on your calendar app — one event per stop, all-day for travel
          legs. iOS handles updates automatically.
        </p>
        <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-pill" type="button" onClick={() => downloadIcs(trip)}>
            Export full trip .ics
          </button>
          <button className="btn-pill" type="button" onClick={() => downloadIcs(trip, traveler)}>
            Export {TRAVELERS[traveler]?.name}-only .ics
          </button>
        </div>
      </section>

      <section className="px-6 py-8 border-b surface-rule">
        <div className="flex items-center gap-2 mb-3">
          <ImageIcon size={14} />
          <p className="smallcaps f-dm text-[11px] opacity-70">Shared album</p>
        </div>
        {trip.sharedAlbumURL ? (
          <a
            className="link-quiet f-news text-base"
            href={trip.sharedAlbumURL}
            target="_blank"
            rel="noreferrer"
          >
            Open in iCloud Photos →
          </a>
        ) : (
          <p className="f-news text-base leading-relaxed opacity-80 max-w-prose">
            No iCloud Shared Album linked yet. Helen creates the album in Photos, enables Public
            Website, then pastes the URL into the trip record. (Manual entry form will land in the
            next pass.)
          </p>
        )}
      </section>

      {traveler === 'helen' && (
        <section className="px-6 py-8 border-b surface-rule">
          <div className="flex items-center gap-2 mb-3">
            {helenDark ? <Moon size={14} /> : <Sun size={14} />}
            <p className="smallcaps f-dm text-[11px] opacity-70">Appearance</p>
          </div>
          <p className="f-dm text-sm opacity-70 mb-3 max-w-prose">
            Light archive by default. Dark mode pulls the photos forward and lets the oxblood
            accents do more work.
          </p>
          <button
            type="button"
            className="btn-pill"
            onClick={toggleHelenDark}
            style={{
              background: helenDark ? '#14110D' : 'transparent',
              color: helenDark ? '#F2EBDA' : 'inherit',
              borderColor: helenDark ? '#14110D' : 'currentColor',
            }}
          >
            {helenDark ? <Moon size={12} /> : <Sun size={12} />}
            {helenDark ? 'Dark mode on' : 'Switch to dark mode'}
          </button>
        </section>
      )}

      <section className="px-6 py-8 border-b surface-rule">
        <div className="flex items-center gap-2 mb-3">
          <RotateCcw size={14} />
          <p className="smallcaps f-dm text-[11px] opacity-70">Who you are</p>
        </div>
        <p className="f-dm text-sm opacity-70 mb-3">
          The default view is whoever you signed in as. Tap to change.
        </p>
        <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
          {TRAVELER_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className="btn-pill"
              style={{
                background: traveler === id ? TRAVELERS[id].color : 'transparent',
                color: traveler === id ? '#FBF8F2' : 'inherit',
                borderColor: traveler === id ? TRAVELERS[id].color : 'currentColor',
              }}
              onClick={() => onChangeTraveler(id)}
            >
              {TRAVELERS[id].name}
            </button>
          ))}
        </div>
      </section>

      <section className="px-6 py-8">
        <p className="smallcaps f-dm text-[11px] opacity-70 mb-3">Coming next</p>
        <ul className="f-news text-base leading-relaxed opacity-80" style={{ paddingLeft: 18 }}>
          <li>CloudKit sync across the four family Apple IDs (needs container provisioning).</li>
          <li>Screenshot ingestion via Claude API (needs API key + Worker proxy).</li>
          <li>Gmail ingestion (Pass 2, OAuth client already provisioned).</li>
          <li>Per-stop photo upload.</li>
        </ul>
      </section>
    </div>
  )
}
