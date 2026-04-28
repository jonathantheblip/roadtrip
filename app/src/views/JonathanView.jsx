import { ArrowRight, Headphones } from 'lucide-react'
import { mapsLink } from '../lib/mapsLink'
import { FlightStatus, findArrivalStop } from './FlightStatus'
import { DayChips } from './DayChips'
import { RoadSearch } from './RoadSearch'

// Jonathan's view — operations console, editorial newsprint dark.
// Renders the trip chronologically day-by-day with sticky day chips at
// the top so any day is one tap away. RoadSearch surfaces on driving
// days. Queue widget anchors the bottom.
export function JonathanView({ trip, traveler, onOpenStop, onOpenSettings }) {
  const arrival = findArrivalStop(trip)

  if (!trip.days.length) {
    return <EmptyJonathan trip={trip} onOpenSettings={onOpenSettings} />
  }

  return (
    <div className="min-h-screen jj-paper pb-32">
      <header className="px-6 pt-12 pb-6 border-b jj-rule">
        <div className="flex items-baseline justify-between">
          <p className="f-mono text-[10px] tt-widest uppercase opacity-50">
            {trip.status === 'archived' ? 'Vol I · Archive' : 'Vol II · Run sheet'}
          </p>
          <p className="f-mono text-[10px] tt-widest uppercase opacity-50">
            {trip.dateRange}
          </p>
        </div>
        <h1 className="f-news tt-tightest text-5xl mt-3 leading-92">
          {trip.title.split(/[—,:]/)[0]}
        </h1>
        <p className="f-news-i text-base opacity-60 mt-2">{trip.epigraph || trip.subtitle}</p>
      </header>

      <DayChips days={trip.days} />

      {arrival && (
        <section className="px-6 py-5 border-b jj-rule">
          <FlightStatus stop={arrival.stop} variant="panel" framing="your" traveler={traveler} />
        </section>
      )}

      {trip.days.map((day) => (
        <section
          key={day.n}
          id={`trip-day-${day.n}`}
          className="px-6 py-6 border-b jj-rule"
        >
          <div className="flex items-baseline justify-between mb-3">
            <p className="f-mono text-[10px] tt-widest uppercase opacity-50">
              Day {day.n} · {day.date}
            </p>
            {day.drive?.miles > 0 && (
              <p className="f-mono text-[10px] tt-wide opacity-40">
                {day.drive.miles} mi · {day.drive.hours}
              </p>
            )}
          </div>
          <h2 className="f-news tt-tightest text-3xl leading-tight mb-4">{day.title}</h2>

          {day.drive?.miles > 50 && (
            <div className="mb-5">
              <RoadSearch traveler={traveler} />
            </div>
          )}

          <ol>
            {day.stops.map((s, i) => (
              <li
                key={s.id}
                className={`fade-up d${Math.min(i + 1, 6)} py-3 ${
                  i < day.stops.length - 1 ? 'border-b' : ''
                } flex items-start gap-4 tap`}
                style={{ borderColor: 'rgba(242, 235, 218, 0.12)' }}
                onClick={() => onOpenStop(day.n, s.id)}
              >
                <span className="f-mono text-[10px] tt-wide uppercase opacity-50 w-16 flex-shrink-0 pt-1">
                  {s.time}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="f-news text-lg tt-tight leading-tight">
                    {s.name}
                    {s.tentative && (
                      <span className="f-mono text-[9px] tt-widest uppercase opacity-50" style={{ marginLeft: 8 }}>
                        TBD
                      </span>
                    )}
                  </p>
                  <p className="f-dm text-[11px] opacity-60 mt-1" style={{ whiteSpace: 'pre-line' }}>{s.note}</p>
                </div>
                <ArrowRight size={12} className="opacity-40" style={{ marginTop: 6 }} />
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="px-6 py-6 border-b jj-rule">
        <div className="flex items-baseline justify-between mb-3">
          <p className="smallcaps f-dm text-[11px] opacity-60">Queue</p>
          <span className="f-mono text-[9px] tt-widest uppercase opacity-40">Overcast</span>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-sm flex items-center justify-center flex-shrink-0 jj-inverse">
            <Headphones size={18} />
          </div>
          <div className="flex-1">
            <p className="f-news text-base leading-tight">Midnight Burger</p>
            <p className="f-dm text-[11px] opacity-60 mt-1">S4E2 · Diner Outside Time</p>
          </div>
        </div>
        <p className="f-mono text-[9px] tt-widest uppercase opacity-40 mt-3">
          Next: Midst · Mission to Zyxx · Magnus Archives
        </p>
      </section>

      <section className="px-6 py-6">
        <div className="flex items-center gap-3">
          <button className="btn-pill" type="button" onClick={onOpenSettings}>
            Trip settings
          </button>
          {trip.days[0]?.stops[0] && (
            <a
              className="btn-solid"
              href={mapsLink(trip.days[0].stops[0], 'jonathan')}
              target="_blank"
              rel="noreferrer"
            >
              Open in Waze
            </a>
          )}
        </div>
      </section>
    </div>
  )
}

function EmptyJonathan({ trip, onOpenSettings }) {
  return (
    <div className="min-h-screen jj-paper pb-32">
      <header className="px-6 pt-12 pb-6 border-b jj-rule">
        <p className="f-mono text-[10px] tt-widest uppercase opacity-50">Vol II · Planning</p>
        <h1 className="f-news tt-tightest text-5xl mt-3 leading-92">{trip.title}</h1>
        <p className="f-news-i text-base opacity-60 mt-3 max-w-sm">{trip.epigraph}</p>
      </header>
      <section className="px-6 py-8">
        <p className="f-news text-lg leading-relaxed opacity-80 max-w-prose">{trip.overview}</p>
      </section>
      <section className="px-6 py-6">
        <button className="btn-pill" onClick={onOpenSettings}>
          Trip settings
        </button>
      </section>
    </div>
  )
}
