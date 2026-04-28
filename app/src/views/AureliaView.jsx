import { Music, Lock } from 'lucide-react'
import { allStops } from '../data/trips'
import { listMemoriesForStop } from '../lib/memoryStore'
import { FlightStatus, findArrivalStop } from './FlightStatus'
import { DayChips } from './DayChips'
import { RoadSearch } from './RoadSearch'

// Aurelia's view — peach/blush, Caprasimo, scrapbook register.
// Day chips at top jump between days; vertical scroll runs through her
// stops in chronological order, day by day. Hero card preserved at the
// top when the trip has one tagged for her.
export function AureliaView({ trip, traveler, onOpenStop }) {
  const aureliaStops = allStops(trip).filter((s) => s.for.includes('aurelia'))
  const heroForAurelia =
    trip.heroStopId && aureliaStops.find((s) => s.id === trip.heroStopId)
  const hero =
    heroForAurelia ||
    aureliaStops.find((s) => /rice/i.test(s.name)) ||
    aureliaStops[0]
  const arrival = findArrivalStop(trip)

  return (
    <div className="min-h-screen au-cream pb-32">
      <header className="px-6 pt-12 pb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: '#F0A36B' }}></span>
          <p className="f-mono text-[10px] tt-widest uppercase opacity-50">A · since 2012</p>
        </div>
        <h1 className="f-cap text-5xl leading-85 au-deep">
          Aurelia's
          <br />
          Trip Book
        </h1>
        <p className="f-news-i text-base opacity-70 mt-3">
          A place for what you actually cared about.
        </p>
      </header>

      <DayChips days={trip.days} />

      {arrival && (
        <section className="px-6 pb-6">
          <FlightStatus stop={arrival.stop} variant="panel" framing="their" traveler={traveler} />
        </section>
      )}

      {hero && (
        <section className="px-6 pb-6">
          <div
            className="relative au-blush rounded-3xl p-6 tap"
            onClick={() => onOpenStop(hero.day, hero.id)}
          >
            <span
              className="absolute au-tape px-4 py-1 f-mono text-[9px] tt-widest uppercase"
              style={{ top: -12, left: 24 }}
            >
              non-negotiable
            </span>
            <p className="f-mono text-[10px] tt-widest uppercase opacity-50 mb-2 mt-2">
              Day {hero.day} · {hero.time}
            </p>
            <h2 className="f-cap text-3xl leading-tight mb-1">{hero.name}</h2>
            <p className="f-news-i text-base opacity-70 mb-4">{hero.kind}</p>
            <div className="helen-photo aspect-16-10 rounded-2xl"></div>
            <p className="f-dm text-sm opacity-80 mt-4 leading-relaxed">{hero.note}</p>
          </div>
        </section>
      )}

      {trip.days.map((day) => {
        const stops = day.stops.filter((s) => s.for.includes('aurelia'))
        if (!stops.length) return null
        return (
          <section
            key={day.n}
            id={`trip-day-${day.n}`}
            className="px-6 pb-8 pt-6 border-t au-rule"
          >
            <div className="flex items-baseline justify-between mb-4">
              <p className="f-cap text-3xl au-deep leading-none">Day {day.n}</p>
              <p className="f-mono text-[10px] tt-widest uppercase opacity-50">{day.date}</p>
            </div>
            <p className="f-news-i text-base opacity-70 mb-4">{day.title}</p>

            {day.drive?.miles > 50 && (
              <div className="mb-5">
                <RoadSearch traveler={traveler} />
              </div>
            )}

            <ol>
              {stops.map((s, i) => {
                const memCount = listMemoriesForStop(s.id, traveler).length
                return (
                  <li
                    key={s.id}
                    className={`fade-up d${Math.min(i + 1, 6)} flex items-baseline gap-3 tap`}
                    style={{ paddingTop: 4, paddingBottom: 4 }}
                    onClick={() => onOpenStop(day.n, s.id)}
                  >
                    <span className="f-mono text-[10px] tt-wide uppercase opacity-50 w-16 flex-shrink-0 pt-2">
                      {s.time}
                    </span>
                    <div
                      className="flex-1 min-w-0"
                      style={{ borderBottom: '1px solid #F0D8C0', paddingBottom: 10 }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="f-news text-base tt-tight leading-tight">
                          {s.name}
                          {s.tentative && (
                            <span className="f-mono text-[9px] tt-widest uppercase opacity-50" style={{ marginLeft: 6 }}>
                              TBD
                            </span>
                          )}
                        </p>
                        {memCount > 0 && (
                          <Lock size={11} className="opacity-50" aria-label="Has memory" />
                        )}
                      </div>
                      <p className="f-mono text-[10px] opacity-50 uppercase tt-wide mt-1">
                        {s.kind}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}

      <section className="px-6 pb-6 pt-6 border-t au-rule">
        <div className="au-blush rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Music size={14} />
            <p className="f-mono text-[10px] tt-widest uppercase opacity-60">Soundtrack</p>
          </div>
          <p className="f-news text-lg tt-tight">Add your trip playlist</p>
          <p className="f-news-i text-sm opacity-60">Spotify link goes here.</p>
        </div>
      </section>
    </div>
  )
}
