import { Music, Lock } from 'lucide-react'
import { allStops } from '../data/trips'
import { listMemoriesForStop } from '../lib/memoryStore'

// Aurelia's view — peach/blush, Caprasimo, scrapbook register.
// Highlights, day chips, soundtrack slot. Privacy lock surfaced on each memory row.
export function AureliaView({ trip, traveler, onOpenStop }) {
  const aureliaStops = allStops(trip).filter((s) => s.for.includes('aurelia'))
  const hero =
    aureliaStops.find((s) => /rice/i.test(s.name)) || aureliaStops[0] || allStops(trip)[0]

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

      <section className="px-6 pb-6">
        <p className="smallcaps f-dm text-[11px] opacity-60 mb-3">Things you said yes to</p>
        <div className="grid grid-cols-2 gap-3">
          {aureliaStops.slice(0, 4).map((s, i) => (
            <div
              key={s.id}
              className="rounded-2xl p-4 tap"
              style={{ background: i % 2 === 0 ? '#FCE4D6' : '#F5D8C0' }}
              onClick={() => onOpenStop(s.day, s.id)}
            >
              <p className="f-cap text-xl leading-tight au-deep">{s.name}</p>
              <p className="f-news-i text-xs opacity-70 mt-1">{s.kind}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 pb-6 pt-6 border-t au-rule">
        <p className="smallcaps f-dm text-[11px] opacity-60 mb-4">Where you were</p>
        <ol>
          {aureliaStops.map((s, i) => {
            const memCount = listMemoriesForStop(s.id, traveler).length
            return (
              <li
                key={s.id}
                className={`fade-up d${Math.min(i + 1, 6)} flex items-baseline gap-3 tap`}
                style={{ paddingTop: 4, paddingBottom: 4 }}
                onClick={() => onOpenStop(s.day, s.id)}
              >
                <span className="f-cap text-2xl au-deep w-8">{s.day}</span>
                <div
                  className="flex-1 min-w-0"
                  style={{ borderBottom: '1px solid #F0D8C0', paddingBottom: 8 }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="f-news text-base tt-tight leading-tight">{s.name}</p>
                    {memCount > 0 && (
                      <Lock size={11} className="opacity-50" aria-label="Has memory" />
                    )}
                  </div>
                  <p className="f-mono text-[10px] opacity-50 uppercase tt-wide mt-1">
                    {s.time} · {s.kind}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="px-6 pb-6">
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
