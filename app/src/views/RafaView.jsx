import { useState } from 'react'
import { Mic } from 'lucide-react'
import { effectiveStatus } from '../data/trips'
import { hasActivitiesForTrip, getActivitiesForTrip } from '../data/sideActivities'
import { WeaveReady } from '../components/EntryCues'
import { todayLocalIso } from '../lib/localDate'
import { isStayTrip, stayLabel, stayNights } from '../lib/tripShape'

// Rafa — "Mission." Redesign increment 4 (2026-06-05): big, bright,
// rounded mission deck for a 4-year-old. Was oxblood + Fraunces; now warm
// brown-black + ochre, Fredoka everywhere (self-hosted), very round 24px
// corners and chunky candy buttons (a solid darker edge below + a soft
// drop). Same data + behaviors as before (reconciled): mission status,
// day picker, the big stacked three-word title, the anchor + alt stop
// cards, both photos entries, things-to-do, and the TELL A STORY button.
// The old off-palette blue is now the design's intentional sticker color.

const FREDOKA = "'Fredoka', 'Inter Tight', system-ui, sans-serif"
// Rafa's sticker palette (system.jsx TRAVELERS.rafa.pal.sticker). The blue
// (ST[1]) is the resolved-from-off-palette accent — now intentional.
const ST = ['#FFB12E', '#3DA5E0', '#4CC36E', '#FF6B4D', '#C77DFF']
// Dark ink for text ON the bright candy fills. White fails AA on these
// mid-tones (the axe gate caught PICTURES on blue at 2.74 and TELL A STORY
// on coral at 2.81 vs the 3:1 floor); dark ink clears ~6–7:1. Matches
// --accent-ink — the C1/Stage-2 fill-ink rule applied to the stickers.
const CANDY_INK = '#1B1108'

export function RafaView({ trip, onOpenStop, onOpenSettings, onOpenActivities, onOpenPhotos, onOpenAllPhotos, onOpenWeave, weaveReady, whoAround }) {
  // Which day's mission is on screen. Default to today-if-in-trip,
  // else day 1. Lets a 3-day weekend show three different missions
  // instead of one summary card that doesn't change.
  const [activeDayN, setActiveDayN] = useState(() => {
    // Local calendar date (lib/localDate) so "today" matches the trip's
    // YYYY-MM-DD day labels and the live dock near midnight — not the UTC date.
    const today = todayLocalIso()
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
  // Family-trips shift: a STAY has no "exciting stop" to feature — on a cabin
  // weekend the featured-stop logic finds nothing and the hero card vanished
  // (a blank screen). The PLACE becomes the hero instead, in Rafa's candy voice.
  const stay = isStayTrip(trip)
  const stayName = stayLabel(trip)
  const nights = stayNights(trip)
  // On a stay the place is the hero, so the day's stops (a dinner out, a surprise
  // cover/teaser) ALL show as cards below — nothing dropped. On a route the
  // featured stop is the hero, so the others exclude it (unchanged).
  const others = stay
    ? rafaStopsToday.slice(0, 6)
    : rafaStopsToday.filter((s) => s.id !== featured?.id).slice(0, 2)

  // Status string drives the eyebrow: planning → INCOMING, archived →
  // COMPLETE, live → ACTIVE. Derived from dates via effectiveStatus so
  // the mission badge flips itself as the calendar moves.
  const lifecycle = effectiveStatus(trip)
  const status =
    lifecycle === 'archived'
      ? 'COMPLETE'
      : lifecycle === 'planning'
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
        fontFamily: FREDOKA,
      }}
    >
      {/* Greeting + the R button (settings) */}
      <div
        style={{
          padding: 'calc(env(safe-area-inset-top) + 60px) 18px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 28, color: 'var(--text)' }}>
          Hi Rafa! <span style={{ color: ST[0] }}>★</span>
        </div>
        {onOpenSettings && (
          <button
            type="button"
            aria-label="Settings"
            onClick={onOpenSettings}
            style={{
              width: 46,
              height: 46,
              borderRadius: '50%',
              background: ST[3],
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 4px 0 ${shade(ST[3], -50)}`,
              fontFamily: FREDOKA,
              fontWeight: 700,
              fontSize: 22,
              color: CANDY_INK,
              flexShrink: 0,
            }}
          >
            R
          </button>
        )}
      </div>

      {/* Mission status */}
      <div
        style={{
          padding: '8px 18px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Eyebrow color="var(--accent-text)">● MISSION {status}</Eyebrow>
        <Eyebrow color="var(--muted)">
          DAY {activeDayN} / {dayCount}
        </Eyebrow>
      </div>

      {/* Day picker — chunky, finger-sized chips for a 4-year-old. Hide
          when there's only one day. touch-action: manipulation makes taps
          fire on first contact; tap-highlight + the .rafa-day-chip :active
          scale give a visual ack so a 4-year-old sees the chip respond. */}
      {trip.days.length > 1 && (
        <div
          style={{
            padding: '12px 14px 0',
            display: 'flex',
            gap: 10,
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
                className="rafa-day-chip"
                style={{
                  flex: '0 0 auto',
                  minWidth: 66,
                  minHeight: 58,
                  padding: '10px 14px',
                  background: isActive ? 'var(--accent)' : 'var(--card)',
                  color: isActive ? 'var(--accent-ink)' : 'var(--muted)',
                  border: 'none',
                  borderRadius: 20,
                  cursor: 'pointer',
                  textAlign: 'center',
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'rgba(255, 177, 46, 0.25)',
                  boxShadow: isActive
                    ? `0 5px 0 ${shade('#FFB12E', -45)}`
                    : `0 4px 0 var(--bg2)`,
                  transition: 'transform .12s ease',
                }}
              >
                <div
                  style={{
                    fontFamily: FREDOKA,
                    fontWeight: 600,
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    opacity: 0.85,
                  }}
                >
                  DAY {d.n}
                </div>
                <div
                  style={{
                    fontFamily: FREDOKA,
                    fontSize: 17,
                    fontWeight: 700,
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

      {/* Who's around — Rafa's storybook diorama (slice 8 follow-up). On a LIVE stay
          it LEADS (the design's order — the family is the first thing he sees); off a
          live stay it's null, so his normal home (the big title, the place) leads. */}
      {whoAround}

      {/* Big stacked title — ochre Fredoka */}
      <div style={{ padding: '16px 18px 8px' }}>
        <div
          style={{
            fontFamily: FREDOKA,
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 0.95,
            color: 'var(--accent-text)',
            letterSpacing: '-0.01em',
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
            fontFamily: FREDOKA,
            fontWeight: 500,
            fontSize: 15,
            color: 'var(--muted)',
            marginTop: 10,
          }}
        >
          {status === 'COMPLETE' ? 'you went to a lot of places!' : 'big trip coming up!'}
        </div>
      </div>

      {/* Anchor card — a STAY leads with the PLACE ("🏡 Our cabin! 3 nights"),
          a road trip leads with the most exciting stop. */}
      {stay ? (
        <div
          data-testid="rafa-stay-place-card"
          style={{
            width: 'calc(100% - 28px)',
            margin: '10px 14px 0',
            padding: 18,
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            borderRadius: 28,
            position: 'relative',
            overflow: 'hidden',
            boxShadow: `0 8px 0 ${shade('#FFB12E', -45)}, 0 14px 24px -8px rgba(0,0,0,0.4)`,
          }}
        >
          <div style={{ position: 'absolute', top: -24, right: -24, width: 110, height: 110, borderRadius: '50%', background: 'rgba(255,255,255,0.16)' }} />
          <div style={{ fontSize: 44, position: 'relative', lineHeight: 1 }}>🏡</div>
          <div style={{ fontFamily: FREDOKA, fontSize: 26, fontWeight: 700, lineHeight: 1.02, marginTop: 10, position: 'relative' }}>
            {stayName}!
          </div>
          {nights > 0 && (
            <div style={{ fontFamily: FREDOKA, fontWeight: 600, fontSize: 15, marginTop: 8, opacity: 0.9, position: 'relative' }}>
              {nights} {nights === 1 ? 'night' : 'nights'} here! 🎉
            </div>
          )}
        </div>
      ) : featured ? (
        <button
          type="button"
          onClick={() => onOpenStop(featured.day, featured.id)}
          style={{
            display: 'block',
            width: 'calc(100% - 28px)',
            margin: '10px 14px 0',
            padding: 18,
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            borderRadius: 28,
            position: 'relative',
            overflow: 'hidden',
            border: 0,
            cursor: 'pointer',
            textAlign: 'left',
            boxShadow: `0 8px 0 ${shade('#FFB12E', -45)}, 0 14px 24px -8px rgba(0,0,0,0.4)`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -24,
              right: -24,
              width: 110,
              height: 110,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.16)',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              position: 'relative',
            }}
          >
            <div
              style={{
                background: 'rgba(27,17,8,0.16)',
                padding: '5px 12px',
                borderRadius: 999,
                fontFamily: FREDOKA,
                fontSize: 12,
                letterSpacing: '0.06em',
                fontWeight: 700,
                color: 'inherit',
              }}
            >
              {featured.time}
            </div>
            <span style={{ fontSize: 30 }}>{emojiFor(featured)}</span>
          </div>
          <div
            style={{
              fontFamily: FREDOKA,
              fontSize: 26,
              fontWeight: 700,
              lineHeight: 1,
              position: 'relative',
            }}
          >
            {featured.name}
          </div>
          {featured.note && (
            <div
              style={{
                fontFamily: FREDOKA,
                fontWeight: 500,
                fontSize: 13,
                marginTop: 10,
                opacity: 0.82,
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
      ) : null}

      {/* Two chunky alt cards — sticker blue + green (the resolved palette) */}
      {others.length > 0 && (
        <div
          style={{
            padding: '16px 14px 0',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          {others.map((s, i) => {
            const bg = i === 0 ? ST[1] : ST[2]
            return (
              <button
                type="button"
                key={s.id}
                onClick={() => onOpenStop(s.day, s.id)}
                style={{
                  background: bg,
                  color: CANDY_INK,
                  borderRadius: 24,
                  padding: 16,
                  border: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: `0 7px 0 ${shade(bg, -45)}`,
                }}
              >
                <div style={{ fontSize: 26 }}>{i === 0 ? '🏆' : '⭐'}</div>
                <div
                  style={{
                    fontFamily: FREDOKA,
                    fontSize: 15,
                    fontWeight: 700,
                    marginTop: 10,
                    lineHeight: 1.05,
                  }}
                >
                  {s.name.toUpperCase()}
                </div>
                <div
                  style={{
                    fontFamily: FREDOKA,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    marginTop: 8,
                    opacity: 0.9,
                  }}
                >
                  {s.time?.toUpperCase()}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* PICTURES first — the album is the thing Rafa pulls up on his own.
          A big blue candy button (the resolved sticker blue). */}
      {onOpenPhotos && (
        <div style={{ padding: '16px 14px 0' }}>
          <button
            type="button"
            data-testid="rafa-photos-entry"
            onClick={onOpenPhotos}
            style={{
              width: '100%',
              padding: '18px 20px',
              borderRadius: 26,
              border: 0,
              background: ST[1],
              color: CANDY_INK,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: `0 8px 0 ${shade(ST[1], -45)}`,
              fontFamily: FREDOKA,
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            <span>📸 PICTURES</span>
            <span style={{ fontSize: 26, fontWeight: 700 }}>→</span>
          </button>
          {onOpenAllPhotos && (
            <button
              type="button"
              data-testid="rafa-all-photos-entry"
              onClick={onOpenAllPhotos}
              style={{
                width: '100%',
                padding: '12px 18px',
                marginTop: 10,
                borderRadius: 18,
                border: '2px solid var(--accent-text)',
                background: 'transparent',
                color: 'var(--accent-text)',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontFamily: FREDOKA,
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              <span>📚 ALL TRIPS</span>
              <span style={{ fontSize: 18, fontWeight: 700 }}>→</span>
            </button>
          )}
        </div>
      )}

      {/* Things to do — outline button under the photos CTA. */}
      {hasActivitiesForTrip(trip.id) && onOpenActivities && (
        <div style={{ padding: '12px 14px 0' }}>
          <button
            type="button"
            onClick={onOpenActivities}
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: 18,
              border: '2px solid var(--accent-text)',
              background: 'transparent',
              color: 'var(--accent-text)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontFamily: FREDOKA,
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            <span>
              {getActivitiesForTrip(trip.id, trip).length} STUFF TO DO
            </span>
            <span style={{ fontSize: 22 }}>→</span>
          </button>
        </div>
      )}

      {/* TONIGHT'S STORY — the Weave, in kid words. His ONLY Weave entry on a
          phone (the temp top-bar braid retired with the home-bands redesign);
          RafaPad has the matching "Tonight's story" tile. Purple sticker =
          the one unused candy color; the ⭐NEW! cue shows a fresh page. */}
      {onOpenWeave && (
        <div style={{ padding: '16px 14px 0' }}>
          <button
            type="button"
            data-testid="rafa-weave-entry"
            onClick={onOpenWeave}
            aria-label="Tonight's story — read the Weave"
            style={{
              width: '100%',
              padding: '18px 20px',
              borderRadius: 26,
              border: 0,
              background: ST[4],
              color: CANDY_INK,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: `0 8px 0 ${shade(ST[4], -45)}`,
              fontFamily: FREDOKA,
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            <span>🌙 TONIGHT'S STORY</span>
            {weaveReady ? (
              <WeaveReady traveler="rafa" />
            ) : (
              <span style={{ fontSize: 26, fontWeight: 700 }}>→</span>
            )}
          </button>
        </div>
      )}

      {/* TELL A STORY — opens a stop to record into; hidden when there's no stop
          to attach to (e.g. a hangout stay with nothing planned) so it's never a
          dead button. */}
      {featured && (
      <div style={{ padding: '22px 14px 0' }}>
        <button
          type="button"
          onClick={() => onOpenStop(featured.day, featured.id)}
          style={{
            width: '100%',
            minHeight: 86,
            borderRadius: 32,
            background: ST[3],
            color: CANDY_INK,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            boxShadow: `0 8px 0 ${shade(ST[3], -45)}, 0 14px 24px -8px rgba(0,0,0,0.4)`,
            fontFamily: FREDOKA,
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          <span
            style={{
              width: 54,
              height: 54,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.26)',
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
            fontFamily: FREDOKA,
            fontWeight: 500,
            fontSize: 12,
            color: 'var(--muted)',
            letterSpacing: '0.04em',
            textAlign: 'center',
            marginTop: 10,
          }}
        >
          HOLD AND TALK · MAMA AND PAPA WILL HEAR
        </div>
      </div>
      )}
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
        fontFamily: FREDOKA,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: color || 'currentColor',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) + pct
  let g = ((n >> 8) & 0xff) + pct
  let b = (n & 0xff) + pct
  r = Math.max(0, Math.min(255, r))
  g = Math.max(0, Math.min(255, g))
  b = Math.max(0, Math.min(255, b))
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}
