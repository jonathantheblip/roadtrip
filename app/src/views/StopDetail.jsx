import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, MapPin, Lock, Unlock, Trash2, ExternalLink, Bed, Key } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import { mapsLink } from '../lib/mapsLink'
import {
  loadOwnMemoryForStop,
  listMemoriesForStop,
  saveMemory,
  deleteMemory,
} from '../lib/memoryStore'
import { FlightStatus } from './FlightStatus'

function urlLabel(stop) {
  const ticketKinds = new Set(['theater', 'show', 'concert', 'tour', 'arrival', 'departure'])
  if (ticketKinds.has(stop.kind)) return 'Tickets'
  if (/^breakfast|lunch|dinner|brunch|snack$/i.test(stop.kind)) return 'Menu'
  return 'Open link'
}

// Stop detail with memory authoring. Visibility toggle (shared/private)
// is intentionally explicit — Aurelia in particular needs to choose,
// not have it inferred. Author is always the active traveler.
//
// `dark` flips the page surface to charcoal/cream so it matches Jonathan,
// Rafa, and dark-mode Helen. Embedded panels (flight, lodging) react to
// the parent surface via .embed-panel CSS so they don't need the prop.
export function StopDetail({ trip, day, stop, traveler, dark, onBack, onOpenDay }) {
  const own = loadOwnMemoryForStop(stop.id, traveler)
  const [memoryId, setMemoryId] = useState(own?.id || null)
  const [text, setText] = useState(own?.text || '')
  const [visibility, setVisibility] = useState(own?.visibility || 'shared')
  const [savedAt, setSavedAt] = useState(null)
  const saveTimer = useRef(null)

  // Auto-save on text/visibility change. Debounced so typing stays responsive.
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (!text.trim() && !memoryId) return
    saveTimer.current = setTimeout(() => {
      try {
        if (!text.trim() && memoryId) {
          // empty text → treat as delete
          deleteMemory({
            id: memoryId,
            visibility,
            authorTraveler: traveler,
          })
          setMemoryId(null)
          setSavedAt(new Date())
          return
        }
        const rec = saveMemory({
          id: memoryId,
          tripId: trip.id,
          stopId: stop.id,
          authorTraveler: traveler,
          visibility,
          text,
        })
        setMemoryId(rec.id)
        setSavedAt(new Date())
      } catch (err) {
        console.error('memory save failed', err)
      }
    }, 600)
    return () => clearTimeout(saveTimer.current)
  }, [text, visibility, memoryId, trip.id, stop.id, traveler])

  const sharedMemories = listMemoriesForStop(stop.id, traveler).filter(
    (m) => m.authorTraveler !== traveler
  )

  return (
    <div className={`min-h-screen pb-32 ${dark ? 'surface-dark' : 'surface-light'}`}>
      {trip.days.length > 1 && onOpenDay && (
        <div className="day-chips" aria-label="Days in this trip">
          {trip.days.map((d) => (
            <button
              key={d.n}
              type="button"
              onClick={() => onOpenDay(d.n)}
              className={`day-chip${d.n === day.n ? ' active' : ''}`}
              aria-current={d.n === day.n ? 'page' : undefined}
              aria-label={`Day ${d.n}${d.title ? ' — ' + d.title : ''}`}
            >
              {d.n}
            </button>
          ))}
        </div>
      )}
      <header className="px-6 pt-6 pb-6 border-b surface-rule">
        <button
          onClick={onBack}
          className="link-quiet flex items-center gap-1 f-dm text-xs opacity-70"
          style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, marginBottom: 24 }}
          type="button"
        >
          <ChevronLeft size={14} /> Day {day.n} · {day.title}
        </button>
        <p className="f-mono text-[10px] tt-widest uppercase opacity-50 mb-1">
          {stop.time} · {stop.kind}
        </p>
        <h1 className="f-news tt-tightest text-5xl leading-95 mb-4">{stop.name}</h1>
        <div className="flex items-center gap-2 mb-4">
          <span className="smallcaps f-dm text-[11px] opacity-60">For</span>
          {stop.for.map((t) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: TRAVELER_DOT[t] }}
              />
              <span className="f-dm text-xs opacity-70">{TRAVELERS[t]?.name}</span>
            </span>
          ))}
        </div>
        <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
          {stop.address && (
            <a
              className="btn-pill"
              href={mapsLink(stop, traveler)}
              target="_blank"
              rel="noreferrer"
            >
              <MapPin size={12} />
              {TRAVELERS[traveler]?.maps === 'waze' ? 'Open in Waze' : 'Open in Maps'}
            </a>
          )}
          {stop.url && (
            <a className="btn-pill" href={stop.url} target="_blank" rel="noreferrer">
              <ExternalLink size={12} />
              {urlLabel(stop)}
            </a>
          )}
        </div>
      </header>

      <section className="px-6 py-8 border-b surface-rule">
        <p className="f-news text-lg leading-relaxed opacity-80 max-w-prose">{stop.note}</p>
      </section>

      {stop.flightNumber && (
        <section className="px-6 py-6 border-b surface-rule">
          <FlightStatus
            stop={stop}
            variant="panel"
            framing={traveler === 'jonathan' ? 'your' : 'their'}
            traveler={traveler}
          />
        </section>
      )}

      {isLodgingStop(trip, day, stop) && (
        <section className="px-6 py-6 border-b surface-rule">
          <LodgingPanel lodging={trip.lodging} />
        </section>
      )}

      <section className="px-6 py-8">
        <div className="flex items-center justify-between mb-3">
          <p className="smallcaps f-dm text-[11px] opacity-70">Your memory</p>
          <span className="f-mono text-[10px] opacity-40">
            {savedAt
              ? `saved ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : ''}
          </span>
        </div>
        <textarea
          className="memory-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What happened here. What it felt like. The thing you don't want to forget."
        />
        <div className="flex items-center justify-between mt-3">
          <button
            type="button"
            className="toggle-row"
            onClick={() => setVisibility(visibility === 'private' ? 'shared' : 'private')}
            aria-pressed={visibility === 'private'}
            style={{ background: 'transparent', border: 0, padding: 0 }}
          >
            {visibility === 'private' ? <Lock size={12} /> : <Unlock size={12} />}
            <span>{visibility === 'private' ? 'Private to you' : 'Shared with the family'}</span>
          </button>
          {memoryId && text.trim() && (
            <button
              type="button"
              className="toggle-row"
              style={{ background: 'transparent', border: 0, padding: 0, color: '#8B2B1F' }}
              onClick={() => {
                deleteMemory({
                  id: memoryId,
                  visibility,
                  authorTraveler: traveler,
                })
                setMemoryId(null)
                setText('')
                setSavedAt(new Date())
              }}
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
        <p className="f-dm text-[11px] opacity-50 italic mt-3">
          {visibility === 'private'
            ? 'Saved only to your device.'
            : 'Saved to the family share. CloudKit sync wires up next.'}
        </p>
      </section>

      {sharedMemories.length > 0 && (
        <section className="px-6 py-8 border-t surface-rule">
          <p className="smallcaps f-dm text-[11px] opacity-70 mb-4">From the family</p>
          {sharedMemories.map((m) => (
            <div key={m.id} style={{ marginBottom: 24 }}>
              <p className="f-mono text-[10px] tt-widest uppercase opacity-50 mb-2">
                {TRAVELERS[m.authorTraveler]?.name || m.authorTraveler} ·{' '}
                {new Date(m.createdAt).toLocaleDateString()}
              </p>
              <p className="f-news text-base leading-relaxed opacity-80">{m.text}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

// Match a stop against the trip's lodging record. Surfaces the rich
// lodging panel (check-in/out times, Buzzmein portal) whenever the user
// taps into a lodging stop on a day that lists the trip lodging.
function isLodgingStop(trip, day, stop) {
  if (!trip?.lodging || stop.kind !== 'lodging') return false
  const lodgingName = trip.lodging.name
  if (!lodgingName) return false
  // Day-level join: every NYC day's `lodging` field is "Murray Hill Airbnb"
  // until checkout day, where it becomes "— (home)". Match on that to
  // decide whether the trip-level lodging applies to this stop.
  return day?.lodging === lodgingName
}

function LodgingPanel({ lodging }) {
  return (
    <div className="embed-panel">
      <div className="flex items-center gap-2 mb-3">
        <Bed size={14} />
        <p className="smallcaps f-dm text-[11px] opacity-70">{lodging.name}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="f-mono text-[9px] tt-widest uppercase opacity-50">Check in</p>
          <p className="f-news text-base leading-tight">{lodging.checkIn || '—'}</p>
        </div>
        <div>
          <p className="f-mono text-[9px] tt-widest uppercase opacity-50">Check out</p>
          <p className="f-news text-base leading-tight">{lodging.checkOut || '—'}</p>
        </div>
      </div>
      {lodging.notes && (
        <p className="f-dm text-sm opacity-70 leading-relaxed mb-3">{lodging.notes}</p>
      )}
      {lodging.portalUrl && (
        <a
          className="btn-pill"
          href={lodging.portalUrl}
          target="_blank"
          rel="noreferrer"
        >
          <Key size={12} />
          Buzzmein guest portal
        </a>
      )}
    </div>
  )
}
