import { useMemo, useState } from 'react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { tripHomeBase } from '../data/trips'
import { Avatar, AvatarStack } from '../components/Avatar'
import { NearbyResultsModal } from '../components/NearbyResultsModal'
import { findArrivalStop } from './FlightStatus'
import { hasActivitiesForTrip, getActivitiesForTrip } from '../data/sideActivities'

// Jonathan — Editorial Ops Console. Design-bundle authoritative
// (prototype.jsx#JonathanDashboard). Newspaper masthead, pull-quote
// headline, hairline-rule sections, no card chrome. The "live" state
// indicator on a stop (oxblood blink dot) lights up for the
// in-progress stop based on system clock.

function JLabel({ children, color, weight = 500, style }) {
  return (
    <span
      style={{
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 9.5,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        fontWeight: weight,
        color: color || 'inherit',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

function JRule({ color, weight = 1, style }) {
  return (
    <div
      style={{
        height: weight,
        background: color || 'var(--border)',
        opacity: 0.7,
        ...style,
      }}
    />
  )
}

function JSection({ label, meta, children, style }) {
  return (
    <section style={{ padding: '0 16px', ...style }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          padding: '14px 0 8px',
        }}
      >
        <JLabel color="var(--text)" weight={600}>{label}</JLabel>
        {meta && <JLabel color="var(--muted)">{meta}</JLabel>}
      </div>
      <JRule color="var(--text)" style={{ opacity: 0.28 }} />
      <div style={{ paddingTop: 10 }}>{children}</div>
    </section>
  )
}

// Headline split: first phrase upright, rest italic. Mirrors the
// Design's "Day one, *converging on Murray Hill.*" feel.
function splitHeadline(day) {
  const ordinal = ['Day one', 'Day two', 'Day three', 'Day four', 'Day five', 'Day six', 'Day seven', 'Day eight'][
    (day?.n || 1) - 1
  ] || `Day ${day?.n || 1}`
  // Day title becomes the italic continuation. Preserve proper-noun
  // case (e.g. "Murray Hill") but de-capitalise the first word so it
  // reads as a sentence with the upright opener.
  const raw = (day?.title || '').trim()
  const cont = raw ? raw.charAt(0).toLowerCase() + raw.slice(1) + '.' : 'underway.'
  return { upright: ordinal + ',', italic: cont }
}

// Build "Open loops" from tentative stops + low-availability flags
// across the trip. Falls back to a tiny static seed if none found.
function deriveOpenLoops(trip) {
  const loops = []
  for (const day of trip.days || []) {
    for (const stop of day.stops || []) {
      if (stop.tentative) {
        loops.push({
          tag: 'CONFIRM',
          body: `${stop.name} — Day ${day.n}, ${stop.time}.`,
          owner: 'jonathan',
        })
      }
    }
  }
  return loops.slice(0, 3)
}

// Cap text at `max` chars but never mid-word. Trailing punctuation
// trimmed, "…" appended only when actually shortened — so a short
// overview prints whole and a long one ends cleanly on a word boundary.
// Was a hard `slice(0, 140)` before, which printed "playoff ma" mid-word.
function truncateAtWord(str, max) {
  if (!str || str.length <= max) return str || ''
  const sliced = str.slice(0, max)
  const lastSpace = sliced.lastIndexOf(' ')
  const base = (lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced).replace(/[\s,;:.\-—]+$/, '')
  return `${base}…`
}

// Quick-glance flight stat for the top strip. We only show what we
// know for sure — the flight number and its scheduled arrival time.
// Live status (delays, gate, etc.) is a separate panel below; lying
// here with a fake "ON TIME" sticker would be worse than restraint.
function flightHeadline(arrival) {
  if (!arrival?.stop) return null
  const s = arrival.stop
  const sched = s.scheduledArrivalLocal || s.time
  return sched ? `${s.flightNumber} · ${sched}` : s.flightNumber
}

export function JonathanView({ trip, traveler, onOpenStop, onOpenSettings, onOpenActivities, onOpenPhotos, onOpenAllPhotos }) {
  // Default to today if it falls within the trip — Jonathan opens the
  // app mid-trip and expects the current day. Otherwise day 1.
  const [activeDayN, setActiveDayN] = useState(() => {
    const today = new Date().toISOString().slice(0, 10)
    const onToday = trip.days.find((d) => d.isoDate === today)
    return onToday?.n || trip.days[0]?.n || 1
  })
  const day = trip.days.find((d) => d.n === activeDayN) || trip.days[0]
  const arrival = findArrivalStop(trip)
  const headline = splitHeadline(day)
  const openLoops = useMemo(() => deriveOpenLoops(trip), [trip])
  const allMems = listMemoriesForTrip(trip.id, traveler)
  const memCountByStop = useMemo(() => {
    const m = new Map()
    for (const x of allMems) m.set(x.stopId, (m.get(x.stopId) || 0) + 1)
    return m
  }, [allMems])
  const totalDriveMiles = trip.days.reduce((sum, d) => sum + (d.drive?.miles || 0), 0)
  const totalDriveHours = trip.days.reduce((sum, d) => {
    const h = d.drive?.hours || ''
    const m = h.match(/(\d+)h/)?.[1]
    return sum + (m ? parseInt(m, 10) : 0)
  }, 0)

  return (
    <div
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        minHeight: '100vh',
        paddingBottom: 120,
      }}
    >
      {/* MASTHEAD */}
      <div
        style={{
          padding: 'calc(env(safe-area-inset-top) + 60px) 16px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <JLabel color="var(--muted)" weight={700}>FAMILY OPS</JLabel>
        <JLabel color="var(--muted)">
          VOL · 1 · NO · {String((day?.n || 1) + 16)} · {(day?.date || '').toUpperCase()}
        </JLabel>
      </div>
      <JRule color="var(--text)" weight={2} style={{ margin: '6px 16px 0', opacity: 0.28 }} />
      <JRule color="var(--text)" style={{ margin: '2px 16px 0', opacity: 0.16 }} />

      {/* Day strip — taps swap which day the masthead, ticker, and
          plan section read from. Jackson is 8 days, NYC is 3, so we
          let the row scroll horizontally if it overflows.
          touch-action: manipulation kills the iOS double-tap-zoom
          delay so taps feel instant; -webkit-tap-highlight-color
          plus a transform on :active gives visible feedback. */}
      {trip.days.length > 1 && (
        <div
          style={{
            margin: '10px 16px 0',
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
          aria-label="Days in this trip"
        >
          {trip.days.map((d) => {
            const isActive = d.n === activeDayN
            return (
              <button
                key={d.n}
                type="button"
                onClick={() => setActiveDayN(d.n)}
                aria-pressed={isActive}
                className="jj-day-chip"
                style={{
                  flex: '0 0 auto',
                  minHeight: 38,
                  padding: '8px 14px',
                  background: isActive ? 'var(--text)' : 'transparent',
                  color: isActive ? 'var(--bg)' : 'var(--muted)',
                  border: isActive ? '1px solid var(--text)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight: isActive ? 600 : 500,
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'rgba(255, 184, 51, 0.18)',
                  transition: 'transform .12s ease',
                }}
              >
                D{d.n} · {(d.date || '').split(' ')[0] || ''}
              </button>
            )
          })}
        </div>
      )}

      <div style={{ padding: '14px 16px 4px' }}>
        <div
          style={{
            fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
            fontSize: 38,
            fontWeight: 700,
            lineHeight: 0.95,
            letterSpacing: '-0.02em',
            color: 'var(--text)',
          }}
        >
          {headline.upright}<br />
          <span style={{ fontStyle: 'italic', fontWeight: 400 }}>
            {headline.italic}
          </span>
        </div>
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--muted)',
            marginTop: 10,
            lineHeight: 1.4,
          }}
        >
          {truncateAtWord(trip.overview, 140) || trip.subtitle}
        </div>
      </div>

      {/* TICKER STAT STRIP */}
      <div
        style={{
          margin: '14px 16px 0',
          borderTop: '1px solid var(--text)',
          borderBottom: '1px solid var(--text)',
          padding: '10px 0',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 0,
        }}
      >
        {[
          ['DRIVE', day?.drive ? `${day.drive.miles} mi · ${day.drive.hours}` : `${totalDriveMiles} mi · ${totalDriveHours}h`],
          ['FLIGHT', arrival ? flightHeadline(arrival) : '—'],
          ['ETA HOME', day?.drive?.to || trip.endCity],
        ].map(([k, v], i) => (
          <div
            key={k}
            style={{
              padding: '0 10px',
              borderLeft: i ? '1px solid var(--border)' : 'none',
            }}
          >
            <JLabel color="var(--muted)">{k}</JLabel>
            <div
              style={{
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 12,
                color: 'var(--text)',
                marginTop: 3,
                fontWeight: 500,
                letterSpacing: '-0.01em',
              }}
            >
              {v || '—'}
            </div>
          </div>
        ))}
      </div>

      {/* PHOTOS — promoted above "The plan" so the album + dispatch
          composer are above-the-fold during the trip, not buried at
          the bottom of the page. Helen + Jonathan use this feature
          heavily during and after each day. Second button: cross-trip
          archive (Punchlist 4) — same section, smaller secondary
          affordance so the per-trip flow stays primary. */}
      {onOpenPhotos && (
        <JSection label="Photos" meta="GALLERY · DISPATCH" style={{ marginTop: 6 }}>
          <button
            type="button"
            data-testid="jonathan-photos-entry"
            onClick={onOpenPhotos}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1px solid var(--accent)',
              padding: '14px 14px',
              cursor: 'pointer',
              color: 'inherit',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 14,
                fontStyle: 'italic',
              }}
            >
              Add a photo · browse the archive.
            </span>
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11,
                color: 'var(--accent-text)',
              }}
            >
              →
            </span>
          </button>
          {onOpenAllPhotos && (
            <button
              type="button"
              data-testid="jonathan-all-photos-entry"
              onClick={onOpenAllPhotos}
              style={{
                width: '100%',
                background: 'transparent',
                border: '1px solid var(--border)',
                padding: '10px 14px',
                cursor: 'pointer',
                color: 'inherit',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 8,
              }}
            >
              <span
                style={{
                  fontFamily: 'Fraunces, Georgia, serif',
                  fontSize: 13,
                  fontStyle: 'italic',
                  color: 'var(--muted)',
                }}
              >
                All photos — across every trip.
              </span>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  color: 'var(--muted)',
                }}
              >
                →
              </span>
            </button>
          )}
        </JSection>
      )}

      {/* THINGS TO DO — promoted up here so the activities menu shares
          the same prominence as Photos. The detailed render below
          keeps "The plan" as the day's centerpiece. */}
      {hasActivitiesForTrip(trip.id) && onOpenActivities && (
        <JSection
          label="Things to do"
          meta={`${getActivitiesForTrip(trip.id, trip).length} OPTIONS`}
          style={{ marginTop: 6 }}
        >
          <button
            type="button"
            onClick={onOpenActivities}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1px solid var(--border)',
              padding: '12px 14px',
              cursor: 'pointer',
              color: 'inherit',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 14,
                fontStyle: 'italic',
              }}
            >
              Around the tournament — filter by who.
            </span>
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11,
                color: 'var(--accent-text)',
              }}
            >
              →
            </span>
          </button>
        </JSection>
      )}

      {/* THE PLAN */}
      {day && (
        <JSection label="The plan" meta={`${day.stops.length} STOP${day.stops.length === 1 ? '' : 'S'}`}>
          {day.stops.map((s, i) => {
            const memCount = memCountByStop.get(s.id) || 0
            const isLive = isLiveStop(s, day)
            return (
              <div key={s.id}>
                {i > 0 && <JRule color="var(--border)" style={{ margin: '14px 0' }} />}
                <button
                  type="button"
                  onClick={() => onOpenStop(day.n, s.id)}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 0,
                    padding: 0,
                    cursor: 'pointer',
                    color: 'inherit',
                    textAlign: 'left',
                    display: 'flex',
                    gap: 14,
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ width: 56, flexShrink: 0, paddingTop: 2 }}>
                    <div
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 11,
                        color: 'var(--text)',
                        letterSpacing: '0.04em',
                        fontWeight: 500,
                      }}
                    >
                      {(s.time || '').replace(' ', '')}
                    </div>
                    {isLive && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          marginTop: 4,
                        }}
                      >
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: 'var(--accent)',
                            animation: 'rt-blink 1.2s infinite',
                          }}
                        />
                        <JLabel color="var(--accent-text)" weight={600}>LIVE</JLabel>
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: 8,
                      }}
                    >
                      <JLabel color="var(--muted)">[{s.kind}]</JLabel>
                      {memCount > 0 && (
                        <JLabel color="var(--accent-text)" weight={600}>
                          {memCount} {memCount === 1 ? 'ENTRY' : 'ENTRIES'} ↗
                        </JLabel>
                      )}
                    </div>
                    <div
                      style={{
                        fontFamily: 'Fraunces, Georgia, serif',
                        fontSize: 17,
                        lineHeight: 1.18,
                        color: 'var(--text)',
                        marginTop: 4,
                        letterSpacing: '-0.012em',
                      }}
                    >
                      {s.name}
                    </div>
                    {s.note && (
                      <div
                        style={{
                          fontFamily: 'Fraunces, Georgia, serif',
                          fontSize: 12.5,
                          fontStyle: 'italic',
                          color: 'var(--muted)',
                          marginTop: 4,
                          lineHeight: 1.4,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {s.note}
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 8,
                      }}
                    >
                      <AvatarStack ids={s.for || []} size={14} gap={-3} />
                      <JLabel color="var(--muted)">
                        · {(s.address || '').split(',')[0] || ''}
                      </JLabel>
                    </div>
                  </div>
                </button>
              </div>
            )
          })}
        </JSection>
      )}

      {/* OPEN LOOPS */}
      {openLoops.length > 0 && (
        <JSection
          label="Open loops"
          meta={`${openLoops.length} PENDING`}
          style={{ marginTop: 6 }}
        >
          {openLoops.map((l, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 12,
                padding: '8px 0',
                borderBottom:
                  i < openLoops.length - 1 ? '1px dashed var(--border)' : 'none',
                alignItems: 'flex-start',
              }}
            >
              <div style={{ width: 56, flexShrink: 0 }}>
                <JLabel color="var(--accent-text)" weight={600}>{l.tag}</JLabel>
              </div>
              <div
                style={{
                  flex: 1,
                  fontFamily: 'Fraunces, Georgia, serif',
                  fontSize: 13.5,
                  lineHeight: 1.4,
                  color: 'var(--text)',
                }}
              >
                {l.body}
              </div>
              <Avatar id={l.owner} size={16} />
            </div>
          ))}
        </JSection>
      )}

      {/* THE FLIGHT — typographic table */}
      {arrival?.stop && (
        <JSection
          label="The flight"
          meta={`${arrival.stop.flightNumber} · ${arrival.stop.flightOrigin || '—'} → ${arrival.stop.flightDest || '—'}`}
          style={{ marginTop: 6 }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: '6px 12px',
              alignItems: 'center',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
            }}
          >
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>
              {arrival.stop.scheduledDepartureLocal || ''}
            </span>
            <span style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>
              DEP · {arrival.stop.flightOrigin || ''}
            </span>
            <span style={{ color: 'var(--muted)' }}>SCHEDULED</span>

            <span style={{ gridColumn: '1 / -1', height: 0 }} />
            <span style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>EN ROUTE</span>
              <div
                style={{
                  flex: 1,
                  height: 1.5,
                  background: 'var(--border)',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '0%',
                    background: 'var(--accent)',
                  }}
                />
              </div>
              <span style={{ color: 'var(--muted)' }}>—</span>
            </span>
            <span style={{ gridColumn: '1 / -1', height: 0 }} />

            <span style={{ color: 'var(--text)', fontWeight: 600 }}>
              {arrival.stop.scheduledArrivalLocal || arrival.stop.time}
            </span>
            <span style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>
              ARR · {arrival.stop.flightDest || ''}
            </span>
            <span style={{ color: 'var(--accent-text)', fontWeight: 600 }}>ON TIME</span>
          </div>
        </JSection>
      )}

      {/* QUEUE — runtime "where's the nearest one?" queries. Each tap
          hits the Worker's /places/nearby endpoint with the device's
          current location (or trip home base) and surfaces the top
          results in a modal with map/tap-to-call. NOT a journal — the
          old log-to-memory behavior was a bug per Punchlist 3 Item 6. */}
      <JSection label="Queue" meta="WHERE'S THE NEAREST" style={{ marginTop: 6 }}>
        <QueueButtons trip={trip} traveler={traveler} />
      </JSection>

      {/* COLOPHON */}
      <div style={{ padding: '16px 16px 4px', textAlign: 'center' }}>
        <JLabel color="var(--muted)">· FAMILY OPS · EDITORIAL CONSOLE · EST. 2026 ·</JLabel>
      </div>
    </div>
  )
}

// Heuristic LIVE: a stop is "live" if its time is within ±60 min of
// now and the day matches today. Used to mark in-progress stops with
// the oxblood blink dot.
function isLiveStop(stop, day) {
  if (!stop?.time || !day?.isoDate) return false
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  if (today !== day.isoDate) return false
  const m = stop.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) return false
  let h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (/PM/i.test(m[3] || '') && h < 12) h += 12
  if (/AM/i.test(m[3] || '') && h === 12) h = 0
  const stopMs = new Date(`${day.isoDate}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`).getTime()
  const delta = Math.abs(now.getTime() - stopMs)
  return delta <= 60 * 60 * 1000
}

// Runtime nearby-search categories. `query` is the text passed through
// to Places (New) searchText via the worker; `hint` keeps the
// editorial-magazine line under each row. `note` shows in the modal
// header to surface ambiguity where it matters (Emergency = hospitals
// AND urgent care, not always the same answer).
const QUEUE_CATEGORIES = [
  {
    label: 'Bathroom',
    hint: 'stopped',
    query: 'public restroom',
  },
  {
    label: 'Fast food',
    hint: 'in & out',
    query: 'fast food',
  },
  {
    label: 'Outside',
    hint: 'stretch',
    query: 'park',
  },
  {
    label: 'Emergency',
    hint: 'flag',
    query: 'urgent care or hospital',
    note:
      "Searches urgent care AND hospitals — pick by hours/distance. For a real emergency call 911 first.",
  },
]

function QueueButtons({ trip, traveler }) {
  const [openCategory, setOpenCategory] = useState(null)
  const homeBase = tripHomeBase(trip)
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          columnGap: 16,
          rowGap: 0,
        }}
      >
        {QUEUE_CATEGORIES.map((cat) => (
          <button
            key={cat.label}
            type="button"
            onClick={() => setOpenCategory(cat)}
            style={{
              padding: '10px 0',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
            }}
          >
            <span
              style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 14,
                textDecoration: 'underline',
                textDecorationColor: 'var(--accent)',
                textUnderlineOffset: 4,
              }}
            >
              {cat.label}
            </span>
            <span
              style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 12,
                fontStyle: 'italic',
                color: 'var(--muted)',
              }}
            >
              — {cat.hint}
            </span>
          </button>
        ))}
      </div>
      {openCategory && (
        <NearbyResultsModal
          category={openCategory}
          homeBase={homeBase}
          traveler={traveler}
          onClose={() => setOpenCategory(null)}
        />
      )}
    </>
  )
}
