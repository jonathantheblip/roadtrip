import { ArrowRight, Circle, Headphones } from 'lucide-react'
import { mapsLink } from '../lib/mapsLink'

// Jonathan's view — operations console, editorial. Today/tomorrow framing
// for a trip in progress; for an archived trip the same surface reads as
// "the run sheet of record".
export function JonathanView({ trip, onOpenStop, onOpenSettings }) {
  // For archived trips, "today" = the last day; for planning, day 1 if any.
  const today = trip.days[trip.days.length - 1]
  const upcoming = null

  if (!today) {
    return <EmptyJonathan trip={trip} onOpenSettings={onOpenSettings} />
  }

  return (
    <div className="min-h-screen jj-paper pb-32">
      <header className="px-6 pt-12 pb-6 border-b jj-rule">
        <div className="flex items-baseline justify-between">
          <p className="f-mono text-[10px] tt-widest uppercase opacity-50">
            Vol I · Day {today.n} of {trip.days.length}
          </p>
          <p className="f-mono text-[10px] tt-widest uppercase opacity-50">{today.date}</p>
        </div>
        <h1 className="f-news tt-tightest text-5xl mt-3 leading-92">
          {today.title.split(' ').slice(0, 1).join(' ')}
          <br />
          <span className="f-news-i opacity-70">
            {today.title.split(' ').slice(1).join(' ') || 'the run sheet'}
          </span>
        </h1>
      </header>

      <section className="jj-divide-h py-4 px-6 grid grid-cols-3 gap-4">
        <Stat label="Drive" big={`${today.drive.miles} mi`} sub={today.drive.hours} />
        <Stat
          label="Stops"
          big={`${today.stops.length}`}
          sub={today.stops.slice(0, 2).map((s) => s.name).join(' · ')}
        />
        <Stat label="Lodging" big={today.lodging?.split(',')[0] || '—'} sub="" />
      </section>

      <section className="px-6 py-6 border-b jj-rule">
        <p className="smallcaps f-dm text-[11px] opacity-60 mb-4">The Plan</p>
        <ol>
          {today.stops.map((s, i) => (
            <li
              key={s.id}
              className={`fade-up d${Math.min(i + 1, 6)} py-3 ${
                i < today.stops.length - 1 ? 'border-b' : ''
              } flex items-start gap-4 tap`}
              style={{ borderColor: '#E5DCC8' }}
              onClick={() => onOpenStop(today.n, s.id)}
            >
              <span className="f-mono text-[10px] tt-wide uppercase opacity-50 w-16 flex-shrink-0 pt-1">
                {s.time}
              </span>
              <div className="flex-1 min-w-0">
                <p className="f-news text-lg tt-tight leading-tight">{s.name}</p>
                <p className="f-dm text-[11px] opacity-60 mt-1">{s.note}</p>
              </div>
              <ArrowRight size={12} className="opacity-40" style={{ marginTop: 6 }} />
            </li>
          ))}
        </ol>
      </section>

      <section className="px-6 py-6 border-b jj-rule">
        <p className="smallcaps f-dm text-[11px] opacity-60 mb-3">All Days</p>
        <ul>
          {trip.days.map((d) => (
            <li key={d.n} className="flex items-baseline gap-3 py-2">
              <span className="f-news-i text-2xl opacity-40 leading-none w-8">{d.n}</span>
              <div className="flex-1 min-w-0">
                <p className="f-mono text-[10px] tt-widest uppercase opacity-50">{d.date}</p>
                <p className="f-news text-base tt-tight leading-tight">{d.title}</p>
              </div>
              <span className="f-mono text-[10px] opacity-40">{d.drive.miles}mi</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-6 py-6 border-b jj-rule">
        <div className="flex items-baseline justify-between mb-3">
          <p className="smallcaps f-dm text-[11px] opacity-60">Queue</p>
          <span className="f-mono text-[9px] tt-widest uppercase opacity-40">Overcast</span>
        </div>
        <div className="flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-sm flex items-center justify-center flex-shrink-0"
            style={{ background: '#1A1614' }}
          >
            <Headphones size={18} color="#FBF8F2" />
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
          {today.stops[0] && (
            <a
              className="btn-solid"
              href={mapsLink(today.stops[0], 'jonathan')}
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

function Stat({ label, big, sub }) {
  return (
    <div>
      <p className="f-mono text-[9px] tt-widest uppercase opacity-50">{label}</p>
      <p className="f-news text-2xl tt-tight mt-1 leading-tight">{big}</p>
      {sub && <p className="f-dm text-[11px] opacity-60 truncate">{sub}</p>}
    </div>
  )
}

function EmptyJonathan({ trip, onOpenSettings }) {
  return (
    <div className="min-h-screen jj-paper pb-32">
      <header className="px-6 pt-12 pb-6 border-b jj-rule">
        <p className="f-mono text-[10px] tt-widest uppercase opacity-50">Vol II · Planning</p>
        <h1 className="f-news tt-tightest text-5xl mt-3 leading-92">
          {trip.title}
        </h1>
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
