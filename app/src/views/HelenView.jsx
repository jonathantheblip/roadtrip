import { Bookmark } from 'lucide-react'
import { allStops } from '../data/trips'
import { listMemoriesForStop } from '../lib/memoryStore'
import { FlightStatus, findArrivalStop } from './FlightStatus'

// Helen's view — archival, photo-forward. Hero memory is the chapel for
// the Jackson trip; for any trip we lean on a `heroStopId` if set, else
// the last stop tagged `for: ['helen']`.
export function HelenView({ trip, traveler, onOpenStop }) {
  const helenStops = allStops(trip).filter((s) => s.for.includes('helen'))
  const all = allStops(trip)
  const hero =
    (trip.heroStopId && all.find((s) => s.id === trip.heroStopId)) ||
    helenStops[helenStops.length - 1] ||
    all.slice(-1)[0]
  const arrival = findArrivalStop(trip)

  if (!hero) {
    return (
      <div className="min-h-screen helen-bone pb-32">
        <header className="px-6 pt-12 pb-2">
          <p className="f-mono text-[10px] tt-widest uppercase opacity-40 mb-2">An Archive</p>
          <h1 className="f-news tt-tightest text-5xl leading-95">
            {trip.title.split(',')[0]}
            <br />
            <span className="f-news-i">in moments</span>
          </h1>
          <p className="f-news-i text-lg opacity-60 mt-3 max-w-sm">{trip.epigraph}</p>
        </header>
        {arrival && (
          <section className="px-6 pt-6">
            <FlightStatus stop={arrival.stop} variant="panel" framing="their" traveler={traveler} />
          </section>
        )}
        <section className="px-6 py-12">
          <p className="f-news text-lg leading-relaxed helen-soft max-w-prose">{trip.overview}</p>
        </section>
      </div>
    )
  }

  return (
    <div className="min-h-screen helen-bone pb-32">
      <header className="px-6 pt-12 pb-2">
        <p className="f-mono text-[10px] tt-widest uppercase opacity-40 mb-2">
          {trip.status === 'archived' ? 'An Archive' : 'A Weekend'}
        </p>
        <h1 className="f-news tt-tightest text-5xl leading-95">
          {trip.status === 'archived' ? (
            <>
              The Drive,
              <br />
              <span className="f-news-i">in moments</span>
            </>
          ) : (
            <>
              {trip.title}
            </>
          )}
        </h1>
        <p className="f-news-i text-lg opacity-60 mt-3 max-w-sm">
          {trip.status === 'archived'
            ? `${trip.dateRange} · ${helenStops.length} stops you anchored to`
            : trip.epigraph}
        </p>
      </header>

      {arrival && (
        <section className="px-6 pt-6">
          <FlightStatus stop={arrival.stop} variant="panel" framing="their" traveler={traveler} />
        </section>
      )}

      <section className="px-6 pt-8 pb-10 tap" onClick={() => onOpenStop(hero.day, hero.id)}>
        <div className="helen-photo aspect-4-5 mb-4 helen-deckle"></div>
        <p className="f-mono text-[10px] tt-widest uppercase opacity-50 mb-1">
          {hero.dayDate} · {hero.time}
        </p>
        <h2 className="f-news tt-tightest text-3xl leading-tight mb-2">{hero.name}</h2>
        <p className="f-news-i text-base opacity-70 leading-relaxed">{hero.note}</p>
      </section>

      <hr className="helen-rule mx-6" style={{ border: 0, borderTop: '1px solid #BFB29C' }} />

      <section className="px-6 py-10">
        {helenStops.slice(0, 6).map((s, i) => (
          <article
            key={s.id}
            className={`fade-up d${Math.min(i + 1, 6)} tap`}
            style={{ marginBottom: 48 }}
            onClick={() => onOpenStop(s.day, s.id)}
          >
            <div className="flex items-baseline justify-between mb-3">
              <p className="f-mono text-[10px] tt-widest uppercase opacity-50">
                Day {s.day} · {s.time}
              </p>
              <p className="f-mono text-[10px] tt-widest uppercase opacity-40">{s.kind}</p>
            </div>
            <h3 className="f-news tt-tightest text-2xl leading-tight mb-2">{s.name}</h3>
            <div className="helen-photo aspect-3-2 mb-4 rounded-sm"></div>
            <p className="f-news text-base opacity-80 leading-relaxed">{s.note}</p>
            <MemoryFootline stopId={s.id} traveler={traveler} />
          </article>
        ))}
      </section>

      {trip.sharedAlbumURL && (
        <section className="px-6 py-8 border-t helen-rule">
          <p className="smallcaps f-dm text-[11px] opacity-60 mb-3">Shared album</p>
          <a className="link-quiet f-news text-lg" href={trip.sharedAlbumURL} target="_blank" rel="noreferrer">
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
