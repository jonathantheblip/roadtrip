import { useState } from 'react'
import { Mic } from 'lucide-react'

// Rafa — Mission. Design-bundle authoritative
// (prototype.jsx#RafaMission). Near-black ground with ochre warning
// type. Eyebrow status + day count, big block-serif title that takes
// over the screen, italic deck, anchor card in ochre with a time chip
// and emoji, two chunky alt cards (blue + green) with emoji + uppercase
// title + time, then a giant "TELL A STORY" mic button at the bottom.

export function RafaView({ trip, onOpenStop }) {
  // Which day's mission is on screen. Default to today-if-in-trip,
  // else day 1. Lets a 3-day weekend show three different missions
  // instead of one summary card that doesn't change.
  const [activeDayN, setActiveDayN] = useState(() => {
    const today = new Date().toISOString().slice(0, 10)
    const onToday = trip.days.find((d) => d.isoDate === today)
    return onToday?.n || trip.days[0]?.n || 1
  })
  const day = trip.days.find((d) => d.n === activeDayN) || trip.days[0]
  // Stops Rafa cares about on the active day. Fall back to all
  // rafa-tagged stops on that day (if `for` isn't set, treat the
  // whole day as fair game).
  const rafaStopsToday = (day?.stops || []).map((s) => ({ ...s, day: day.n, dayDate: day.date }))
    .filter((s) => !s.for || s.for.length === 0 || s.for.includes('rafa'))
  // Hero pinning still wins if the configured heroStop falls on this
  // day; otherwise pick by excitement keyword, else last/first.
  const heroForRafa =
    trip.heroStopId && rafaStopsToday.find((s) => s.id === trip.heroStopId)
  const featured =
    heroForRafa ||
    rafaStopsToday.find((s) => /monster|truck|rocket|axiom|circus|zoo|park/i.test(s.name)) ||
    rafaStopsToday[rafaStopsToday.length - 1] ||
    rafaStopsToday[0]
  const others = rafaStopsToday.filter((s) => s.id !== featured?.id).slice(0, 2)

  // Status string drives the eyebrow: planning → INCOMING, archived →
  // COMPLETE, anything else → ACTIVE.
  const status =
    trip.status === 'archived'
      ? 'COMPLETE'
      : trip.status === 'planning'
        ? 'INCOMING'
        : 'ACTIVE'

  // Big stacked title — three short words. Falls back to slicing the
  // trip title if no per-trip override is set up.
  const titleWords = pickTitleWords(trip)

  const dayCount = trip.days.length

  return (
    <div
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        minHeight: '100vh',
        paddingBottom: 120,
      }}
    >
      {/* Status eyebrow */}
      <div
        style={{
          padding: '60px 18px 0',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Eyebrow color="var(--accent)">● MISSION {status}</Eyebrow>
        <Eyebrow color="var(--muted)">
          DAY {activeDayN} / {dayCount}
        </Eyebrow>
      </div>

      {/* Day picker — chunky, finger-sized chips for a 5-year-old. Hide
          when there's only one day (no point) and when there's no day
          info at all. */}
      {trip.days.length > 1 && (
        <div
          style={{
            padding: '12px 14px 0',
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
          aria-label="Days in this mission"
        >
          {trip.days.map((d) => {
            const isActive = d.n === activeDayN
            const dow = (d.date || '').split(' ')[0] || ''
            return (
              <button
                key={d.n}
                type="button"
                onClick={() => setActiveDayN(d.n)}
                aria-pressed={isActive}
                style={{
                  flex: '0 0 auto',
                  minWidth: 56,
                  padding: '10px 12px',
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'var(--accent-ink, #1A0A0B)' : 'var(--muted)',
                  border: isActive ? 'none' : '1.5px solid var(--border)',
                  borderRadius: 14,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 9,
                    letterSpacing: '0.12em',
                    opacity: 0.8,
                  }}
                >
                  DAY {d.n}
                </div>
                <div
                  style={{
                    fontFamily: 'Fraunces, Georgia, serif',
                    fontSize: 16,
                    fontWeight: 800,
                    marginTop: 2,
                    textTransform: 'uppercase',
                  }}
                >
                  {dow}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Block-serif title — ochre stack */}
      <div style={{ padding: '14px 18px 8px' }}>
        <div
          style={{
            fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
            fontSize: 52,
            fontWeight: 900,
            lineHeight: 0.85,
            color: 'var(--accent)',
            letterSpacing: '-0.02em',
          }}
        >
          {titleWords.map((w, i) => (
            <span key={i}>
              {w}
              {i < titleWords.length - 1 && <br />}
            </span>
          ))}
        </div>
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 13,
            color: 'var(--muted)',
            marginTop: 8,
            fontStyle: 'italic',
          }}
        >
          {status === 'COMPLETE' ? 'you went to a lot of places.' : 'big trip coming up.'}
        </div>
      </div>

      {/* Anchor card — ochre */}
      {featured && (
        <button
          type="button"
          onClick={() => onOpenStop(featured.day, featured.id)}
          style={{
            display: 'block',
            width: 'calc(100% - 28px)',
            margin: '8px 14px 0',
            padding: 14,
            background: 'var(--accent)',
            color: 'var(--accent-ink, #1A0A0B)',
            borderRadius: 16,
            position: 'relative',
            overflow: 'hidden',
            border: 0,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -20,
              right: -20,
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
              position: 'relative',
            }}
          >
            <div
              style={{
                background: 'rgba(255,255,255,0.18)',
                padding: '4px 10px',
                borderRadius: 10,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                letterSpacing: '0.14em',
                fontWeight: 600,
                color: 'inherit',
              }}
            >
              {featured.time}
            </div>
            <span style={{ fontSize: 24 }}>{emojiFor(featured)}</span>
          </div>
          <div
            style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 24,
              fontWeight: 800,
              lineHeight: 1,
              position: 'relative',
            }}
          >
            {featured.name}
          </div>
          {featured.note && (
            <div
              style={{
                fontSize: 11,
                marginTop: 8,
                opacity: 0.85,
                position: 'relative',
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {featured.note}
            </div>
          )}
        </button>
      )}

      {/* Two chunky alt cards */}
      {others.length > 0 && (
        <div
          style={{
            padding: '14px 14px 0',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}
        >
          {others.map((s, i) => {
            const bg = i === 0 ? '#3D6FB8' : '#2E5D3A'
            return (
              <button
                type="button"
                key={s.id}
                onClick={() => onOpenStop(s.day, s.id)}
                style={{
                  background: bg,
                  color: '#fff',
                  borderRadius: 14,
                  padding: 12,
                  border: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 22 }}>{i === 0 ? '🏆' : '⭐'}</div>
                <div
                  style={{
                    fontFamily: 'Fraunces, Georgia, serif',
                    fontSize: 14,
                    fontWeight: 800,
                    marginTop: 8,
                    lineHeight: 1,
                  }}
                >
                  {s.name.toUpperCase()}
                </div>
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 9,
                    letterSpacing: '0.1em',
                    marginTop: 6,
                    opacity: 0.85,
                  }}
                >
                  {s.time?.toUpperCase()}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* TELL A STORY mic */}
      <div style={{ padding: '20px 14px 0' }}>
        <button
          type="button"
          onClick={() => featured && onOpenStop(featured.day, featured.id)}
          style={{
            width: '100%',
            height: 80,
            borderRadius: 40,
            background: 'var(--accent)',
            color: 'var(--accent-ink, #1A0A0B)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            boxShadow: '0 12px 30px rgba(255, 184, 51, 0.35)',
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 22,
            fontWeight: 800,
          }}
        >
          <span
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Mic size={28} />
          </span>
          TELL A STORY
        </button>
        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            color: 'var(--muted)',
            letterSpacing: '0.14em',
            textAlign: 'center',
            marginTop: 8,
          }}
        >
          HOLD AND TALK · MOM AND DAD WILL HEAR
        </div>
      </div>
    </div>
  )
}

function emojiFor(stop) {
  const t = `${stop.name} ${stop.kind || ''}`.toLowerCase()
  if (/monster|truck|rocket|axiom|space/.test(t)) return '🚀'
  if (/lion king|theater|show|broadway/.test(t)) return '🎭'
  if (/airbnb|cabin|lodging|hotel/.test(t)) return '🛏️'
  if (/pizza|brasserie|breakfast|brunch|lunch|dinner/.test(t)) return '🍕'
  if (/empire|sights|skyline/.test(t)) return '🏙️'
  if (/flight|airport|lga|lands/.test(t)) return '✈️'
  return '🎯'
}

function pickTitleWords(trip) {
  if (trip.id === 'jackson-2026') return ['SPACE', 'SHIP', 'TRIP']
  if (trip.id === 'nyc-rafa-2026') return ['MONSTER', 'TRUCK', 'DAY']
  const cleaned = (trip.title || '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  while (cleaned.length < 3) cleaned.push('TRIP')
  return cleaned.slice(0, 3)
}

function Eyebrow({ children, color, style }) {
  return (
    <div
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: color || 'currentColor',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
