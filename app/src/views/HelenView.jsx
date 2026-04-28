import { Bookmark } from 'lucide-react'
import { listMemoriesForStop } from '../lib/memoryStore'
import { FlightStatus, findArrivalStop } from './FlightStatus'
import { DayChips } from './DayChips'
import { RoadSearch } from './RoadSearch'
import { useHelenDark } from '../hooks/useHelenDark'

// Helen's view — purely chronological per her ask. No featured hero;
// every day flows top-to-bottom in trip order. Day chips at the top let
// her jump between days; vertical scroll moves through the timeline.
// Photo placeholders are left in for her later iCloud Shared Album link.
export function HelenView({ trip, traveler, onOpenStop }) {
  const [dark] = useHelenDark()
  const rootClass = `min-h-screen helen-bone pb-32${dark ? ' helen-dark' : ''}`
  const arrival = findArrivalStop(trip)

  return (
    <div className={rootClass}>
      <header className="px-6 pt-12 pb-6">
        <p className="f-mono text-[10px] tt-widest uppercase opacity-40 mb-2">
          {trip.status === 'archived' ? 'An Archive' : 'A Weekend'}
        </p>
        <h1 className="f-news tt-tightest text-5xl leading-95">{trip.title}</h1>
        <p className="f-news-i text-lg opacity-60 mt-3 max-w-sm">
          {trip.dateRange} · {trip.startCity} → {trip.endCity}
        </p>
      </header>

      <DayChips days={trip.days} />

      {arrival && (
        <section className="px-6 pt-2 pb-6">
          <FlightStatus stop={arrival.stop} variant="panel" framing="their" traveler={traveler} />
        </section>
      )}

      {trip.days.map((day) => (
        <section
          key={day.n}
          id={`trip-day-${day.n}`}
          className="px-6 py-8"
          style={{ borderTop: '1px solid #BFB29C' }}
        >
          <div className="flex items-baseline justify-between mb-4">
            <p className="f-mono text-[10px] tt-widest uppercase opacity-50">
              Day {day.n} · {day.date}
            </p>
            {day.drive?.miles > 0 && (
              <p className="f-mono text-[10px] tt-wide opacity-40">
                {day.drive.miles} mi · {day.drive.hours}
              </p>
            )}
          </div>
          <h2 className="f-news tt-tightest text-3xl leading-tight mb-6">{day.title}</h2>

          {day.drive?.miles > 50 && (
            <div className="mb-8">
              <RoadSearch traveler={traveler} />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {day.stops.map((s, i) => (
              <article
                key={s.id}
                className={`fade-up d${Math.min(i + 1, 6)} tap`}
                onClick={() => onOpenStop(day.n, s.id)}
              >
                <div className="flex items-baseline justify-between mb-2">
                  <p className="f-mono text-[10px] tt-widest uppercase opacity-50">
                    {s.time}
                  </p>
                  <p className="f-mono text-[10px] tt-widest uppercase opacity-40">
                    {s.kind}
                    {s.tentative && ' · TBD'}
                  </p>
                </div>
                <h3 className="f-news tt-tightest text-2xl leading-tight mb-2">
                  {s.name}
                </h3>
                {/* Photo deckle only for stops that aren't pure logistics. */}
                {!['logistics', 'drive', 'arrival', 'departure'].includes(s.kind) && (
                  <div className="helen-photo aspect-3-2 mb-3 rounded-sm" />
                )}
                <p className="f-news text-base opacity-80 leading-relaxed" style={{ whiteSpace: 'pre-line' }}>
                  {s.note}
                </p>
                <MemoryFootline stopId={s.id} traveler={traveler} />
              </article>
            ))}
          </div>
        </section>
      ))}

      {trip.sharedAlbumURL && (
        <section className="px-6 py-8" style={{ borderTop: '1px solid #BFB29C' }}>
          <p className="smallcaps f-dm text-[11px] opacity-60 mb-3">Shared album</p>
          <a
            className="link-quiet f-news text-lg"
            href={trip.sharedAlbumURL}
            target="_blank"
            rel="noreferrer"
          >
            Open in iCloud Photos →
          </a>
        </section>
      )}
    </div>
  )
}

function MemoryFootline({ stopId, traveler }) {
  const memories = listMemoriesForStop(stopId, traveler)
  const hasOwn = memories.some((m) => m.authorTraveler === traveler)
  return (
    <div
      className="flex items-center gap-2 mt-3 pt-3"
      style={{ borderTop: '1px solid #E5DCC8' }}
    >
      <Bookmark size={12} className="opacity-40" />
      <span className="f-dm text-[11px] opacity-50 italic">
        {memories.length === 0
          ? 'Tap to add a memory'
          : hasOwn
            ? 'Your memory is saved · tap to edit'
            : `${memories.length} memor${memories.length === 1 ? 'y' : 'ies'} on file`}
      </span>
    </div>
  )
}
