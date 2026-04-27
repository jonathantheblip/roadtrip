import { Rocket, Star, Trophy } from 'lucide-react'
import { allStops } from '../data/trips'

// Rafa's view — NASA register, dark navy + grid texture, big tap targets.
// Read-only by intent: Rafa doesn't author memories. Counts are derived
// from the trip data, not hardcoded.
export function RafaView({ trip, onOpenStop }) {
  const rafaStops = allStops(trip).filter((s) => s.for.includes('rafa'))
  const today = trip.days[trip.days.length - 1]
  const featured = rafaStops.find((s) => /axiom/i.test(s.name)) || rafaStops[rafaStops.length - 1]

  // Auto-counts
  const cabins = trip.days.filter((d) => /cabin|airbnb|donna|grandma/i.test(d.lodging || '')).length
  const museums = rafaStops.filter((s) => /museum|center/i.test(s.kind) || /museum/i.test(s.name)).length
  const dinosaurs = rafaStops.filter((s) =>
    /dinosaur|fossil|natural science/i.test(`${s.name} ${s.kind}`)
  ).length

  return (
    <div className="min-h-screen rafa-bg grid-bg pb-32 relative overflow-hidden">
      <div className="px-5 pt-12 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full pulse-dot"
            style={{ background: '#6BE3A0' }}
          ></span>
          <p className="f-arc text-[11px] font-medium tt-widest uppercase opacity-80">
            Mission {trip.status === 'archived' ? 'Complete' : 'Active'}
          </p>
        </div>
        <p className="f-mono text-[10px] tt-widest uppercase opacity-50">
          DAY {today?.n || '—'} / {trip.days.length || '—'}
        </p>
      </div>

      <header className="px-5 pb-6">
        <h1 className="f-arc text-6xl font-black leading-85 tt-tightest">
          <span className="rafa-yellow">SPACE</span>
          <br />
          <span className="rafa-blue">SHIP</span>
          <br />
          <span style={{ color: '#fff' }}>TRIP</span>
        </h1>
        <p className="f-arc text-base font-medium opacity-70 mt-3 tt-tight">
          {trip.status === 'archived'
            ? 'You went to a lot of places.'
            : 'Big trip coming up.'}
        </p>
      </header>

      {featured && (
        <section className="px-5 pb-5">
          <div
            className="rafa-card rounded-3xl p-6 border-2 tap"
            style={{ borderColor: '#FFD93D' }}
            onClick={() => onOpenStop(featured.day, featured.id)}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="rafa-bg-yellow f-arc font-black text-xs px-3 py-1 rounded-full tt-wide"
                style={{ color: '#1A1614' }}
              >
                {featured.time}
              </span>
              <Rocket size={28} className="rafa-yellow" />
            </div>
            <h2 className="f-arc text-3xl font-black leading-tight tt-tight">
              {featured.name.toUpperCase()}
            </h2>
            <p className="f-arc text-base opacity-80 mt-2">{featured.note}</p>
          </div>
        </section>
      )}

      <section className="px-5 pb-5 grid grid-cols-2 gap-3">
        {rafaStops.slice(0, 2).map((s, i) => (
          <div
            key={s.id}
            className="rounded-3xl p-5 tap"
            style={{ background: i === 0 ? '#1F7BD8' : '#E63333' }}
            onClick={() => onOpenStop(s.day, s.id)}
          >
            <div className="flex items-center justify-between mb-2">
              {i === 0 ? <Trophy size={22} /> : <Star size={22} />}
              <span
                className="f-arc text-[10px] font-bold tt-wide px-2 py-1 rounded-full"
                style={{ background: 'rgba(0,0,0,0.3)' }}
              >
                {s.time}
              </span>
            </div>
            <p className="f-arc text-xl font-black tt-tight leading-tight">
              {s.name.toUpperCase().slice(0, 14)}
            </p>
            <p className="f-arc text-xs opacity-80">{s.kind}</p>
          </div>
        ))}
      </section>

      <section className="px-5 pb-5">
        <div className="rafa-card-2 rounded-3xl p-6">
          <p className="f-arc text-xs font-medium opacity-60 tt-widest uppercase mb-2">
            Things you did
          </p>
          <div className="grid grid-cols-4 gap-3 text-center">
            <CountStat n={cabins || 1} label="cabins" />
            <CountStat n={museums || 0} label="museums" />
            <CountStat n={dinosaurs || 1} label="dinosaur" />
            <CountStat n="∞" label="snacks" />
          </div>
        </div>
      </section>

      <section className="px-5 pb-5">
        <p className="f-arc text-xs font-bold tt-widest uppercase opacity-60 mb-3">
          Where you went
        </p>
        <div className="flex flex-col gap-2">
          {rafaStops.map((s, i) => (
            <div
              key={s.id}
              className={`rafa-card rounded-2xl p-4 fade-up d${Math.min(i + 1, 6)} flex items-center gap-3 tap`}
              onClick={() => onOpenStop(s.day, s.id)}
            >
              <span
                className="rafa-bg-yellow f-arc font-black text-base w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ color: '#1A1614' }}
              >
                {s.day}
              </span>
              <div className="flex-1 min-w-0">
                <p className="f-arc text-base font-bold tt-tight truncate">{s.name}</p>
                <p className="f-arc text-xs opacity-60 truncate">{s.note}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="overflow-hidden border-y rafa-rule py-3 mt-2">
        <div className="ticker f-arc text-base font-bold rafa-yellow">
          <span style={{ padding: '0 24px' }}>
            ★ DINOSAURS ★ SPACESHIPS ★ GIRAFFES ★ STEAM TRAINS ★ BUC-EE ★ COMETS ★{' '}
          </span>
          <span style={{ padding: '0 24px' }}>
            ★ DINOSAURS ★ SPACESHIPS ★ GIRAFFES ★ STEAM TRAINS ★ BUC-EE ★ COMETS ★{' '}
          </span>
        </div>
      </div>
    </div>
  )
}

function CountStat({ n, label }) {
  return (
    <div>
      <p className="f-arc text-3xl font-black rafa-yellow leading-none">{n}</p>
      <p className="f-arc text-[10px] opacity-60 uppercase tt-wide mt-1">{label}</p>
    </div>
  )
}
