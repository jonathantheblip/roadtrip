import { ArrowRight, Plus } from 'lucide-react'
import { TRIPS } from '../data/trips'
import { TRAVELER_DOT } from '../data/travelers'

// Trip index — the platform's home. Lists all trips, ordered with active
// trip first if any, then archived, then planning. Tapping opens the
// active traveler's themed view of that trip.
export function TripIndex({ onOpenTrip, onNewTrip }) {
  const ordered = [...TRIPS].sort((a, b) => priority(a) - priority(b))
  return (
    <div className="min-h-screen helen-paper" style={{ color: '#1A1614' }}>
      <header
        className="px-6 pt-12 pb-8"
        style={{ borderBottom: '1px solid #DDD3C2' }}
      >
        <div className="flex items-baseline justify-between">
          <div>
            <p className="f-mono text-[10px] tt-widest uppercase opacity-50 mb-2">
              The Jackson Family
            </p>
            <h1 className="f-news tt-tightest text-5xl leading-95">Trips</h1>
          </div>
          <button onClick={onNewTrip} className="btn-pill" type="button">
            <Plus size={12} /> New
          </button>
        </div>
        <p className="f-news-i text-base opacity-60 mt-4 max-w-md leading-snug">
          An archive, and a planning surface for what comes next.
        </p>
      </header>

      <main className="px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        {ordered.map((trip, i) => (
          <article
            key={trip.id}
            className={`tap fade-up d${Math.min(i + 1, 6)}`}
            onClick={() => onOpenTrip(trip.id)}
          >
            <div className="flex items-baseline justify-between mb-3">
              <StatusTag status={trip.status} />
              <span className="f-mono text-[10px] tt-wide opacity-40">{trip.dateRange}</span>
            </div>
            <h2 className="f-news tt-tight text-4xl leading-tight mb-2">{trip.title}</h2>
            <p className="f-news-i text-lg opacity-60 leading-snug mb-4">{trip.subtitle}</p>
            <div className="helen-photo rounded-sm aspect-16-9 mb-4 flex items-end p-4">
              <div className="relative z-10 flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  {trip.travelers.map((t) => (
                    <span
                      key={t}
                      className="w-2 h-2 rounded-full"
                      style={{ background: TRAVELER_DOT[t] }}
                    />
                  ))}
                </span>
                <span className="f-mono text-[10px] tt-wide uppercase opacity-70">
                  {trip.startCity} → {trip.endCity}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="f-dm text-sm opacity-70 leading-relaxed max-w-md">
                {(trip.overview || '').split('.')[0]}.
              </p>
              <ArrowRight size={16} className="opacity-50 flex-shrink-0" style={{ marginLeft: 16 }} />
            </div>
          </article>
        ))}
      </main>

      <footer
        className="px-6 py-12 mt-8"
        style={{ borderTop: '1px solid #DDD3C2' }}
      >
        <p className="f-mono text-[10px] tt-widest uppercase opacity-40">
          Volume I — Spring '26
        </p>
      </footer>
    </div>
  )
}

function priority(t) {
  if (t.status === 'live') return 0
  if (t.status === 'planning') return 1
  return 2
}

function StatusTag({ status }) {
  const map = {
    archived: { label: 'Archived', color: '#4A413A' },
    planning: { label: 'In Planning', color: '#8B2B1F' },
    live: { label: 'Live', color: '#8B2B1F' },
  }
  const s = map[status] || map.archived
  return (
    <span
      className="f-mono text-[10px] tt-widest uppercase"
      style={{ color: s.color }}
    >
      {s.label}
    </span>
  )
}
