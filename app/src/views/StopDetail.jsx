import { ChevronLeft, MapPin, ExternalLink, Bed, Key } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import { mapsLink } from '../lib/mapsLink'
import { FlightStatus } from './FlightStatus'
import { DayChips } from './DayChips'
import { ThreadedMemories } from '../components/ThreadedMemories'

function urlLabel(stop) {
  const ticketKinds = new Set(['theater', 'show', 'concert', 'tour', 'arrival', 'departure'])
  if (ticketKinds.has(stop.kind)) return 'Tickets'
  if (/^breakfast|lunch|dinner|brunch|snack$/i.test(stop.kind)) return 'Menu'
  return 'Open link'
}

// Stop detail. Memories live in the ThreadedMemories component (Design
// Direction 02 — collaborative thread per stop with text / voice /
// photo composer at the bottom). `dark` flips the page surface to
// charcoal/cream so it matches Jonathan / Rafa / dark-mode Helen.
// Embedded panels (flight, lodging) react to the surface via CSS.
export function StopDetail({ trip, day, stop, traveler, dark, onBack, onOpenDay }) {
  return (
    <div className={`min-h-screen pb-32 ${dark ? 'surface-dark' : 'surface-light'}`}>
      {onOpenDay && (
        <DayChips days={trip.days} activeDayN={day.n} onJump={onOpenDay} />
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

      {stop.image && (
        <figure className="px-6 pt-6">
          <img
            src={stop.image}
            alt={stop.name}
            style={{
              width: '100%',
              borderRadius: 8,
              display: 'block',
            }}
          />
        </figure>
      )}

      <section className="px-6 py-8 border-b surface-rule">
        <p className="f-news text-lg leading-relaxed opacity-80 max-w-prose">
          {traveler === 'helen' && stop.helenNote ? stop.helenNote : stop.note}
        </p>
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
        <ThreadedMemories trip={trip} stop={stop} traveler={traveler} />
      </section>
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
