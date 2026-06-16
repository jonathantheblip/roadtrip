import { useEffect, useMemo, useState } from 'react'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { tripHomeBase } from '../data/trips'
import { AvatarStack } from '../components/Avatar'
import { NearbyResultsModal } from '../components/NearbyResultsModal'
import { findArrivalStop } from './FlightStatus'
import { flightAwareUrl } from '../lib/flightStatus'
import { hasActivitiesForTrip, getActivitiesForTrip } from '../data/sideActivities'
import { flattenPhotoEntries, groupByStop } from '../lib/photoEntries'
import { PhotoTile, PhotoLightbox, GridPausedProvider } from '../components/PhotoAlbum'
import { TRAVELER_DOT } from '../data/travelers'
import { JonathanEntries } from './JonathanEntries'
import { LookBackStrip } from '../components/LookBackStrip'
import { tripPhase } from '../lib/tripPhase'
import { todayLocalIso } from '../lib/localDate'

// Jonathan — Ops. Broadsheet mission-control (redesign increment 1,
// design handoff jonathan.jsx). Two modes off one masthead toggle:
//   OPS    — day tabs, editorial headline, live ticker, Risk Watch,
//            the plan, the flight, quick-log/Queue.
//   RECORD — "the family picture desk": the trip's real photos as a
//            lead frame + grid (reuses PhotoTile/PhotoLightbox).
// Tokens are jonathan's themes.css block (clay accent, hard 2px, mono
// micro-labels). All content is REAL trip data — nothing here is the
// prototype's static NY copy. Where the prototype faked a feature
// (the Risk Watch cascade *recompute*; a dispatch composer; the Weave),
// this surface wires the real signal we actually have or defers to a
// later increment, per the working agreement (the UI only promises
// what the plumbing delivers).

// Jonathan's masthead identity dot, now sourced from the shared canonical
// TRAVELER_DOT (cross-cutting identity-color consolidation, 2026-06-05) —
// no longer a local literal. Same value (#2E6BB8 = the design dot).
const JONATHAN_DOT = TRAVELER_DOT.jonathan

const ORDINALS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

// Mono micro-label — uppercase, tracked, tiny. The newsroom voice.
function JLabel({ children, color, weight = 500, size = 9.5, style }) {
  return (
    <span
      style={{
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: size,
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
  return <div style={{ height: weight, background: color || 'var(--border)', ...style }} />
}

// Section header: tracked label + meta, a hairline under it.
function JSectionHead({ label, meta, style }) {
  return (
    <div style={{ padding: '18px 16px 0', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 8 }}>
        <JLabel color="var(--text)" weight={700} size={11}>{label}</JLabel>
        {meta != null && <JLabel color="var(--muted)">{meta}</JLabel>}
      </div>
      <JRule color="var(--line-bold)" />
    </div>
  )
}

// Masthead OPS ⟷ THE RECORD toggle. The RECORD button carries the
// jonathan-photos-entry test-id: it's visible in both modes (so the
// "every view exposes a Photos entry" + album-baseline tests pass) and
// tapping it opens the picture desk.
function JModeTabs({ mode, setMode }) {
  const tabs = [
    ['ops', 'OPS', undefined],
    ['record', 'THE RECORD', 'jonathan-photos-entry'],
  ]
  return (
    <div style={{ display: 'flex', border: '1px solid var(--line-bold)' }}>
      {tabs.map(([k, label, testid], i) => {
        const on = mode === k
        return (
          <button
            key={k}
            type="button"
            data-testid={testid}
            onClick={() => setMode(k)}
            aria-pressed={on}
            style={{
              padding: '6px 12px',
              background: on ? 'var(--text)' : 'transparent',
              color: on ? 'var(--bg)' : 'var(--muted)',
              border: 'none',
              borderLeft: i ? '1px solid var(--line-bold)' : 'none',
              cursor: 'pointer',
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 9,
              letterSpacing: '0.16em',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// Masthead — title + mode tabs + identity badge (→ Settings).
function JMasthead({ mode, setMode, onOpenSettings }) {
  return (
    <>
      <div
        style={{
          padding: 'calc(env(safe-area-inset-top) + 60px) 16px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <JLabel color="var(--muted)" weight={700} size={11}>
          {mode === 'record' ? 'THE RECORD' : 'FAMILY OPS'}
        </JLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <JModeTabs mode={mode} setMode={setMode} />
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', lineHeight: 0 }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: JONATHAN_DOT,
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Inter Tight, system-ui, sans-serif',
                fontWeight: 600,
                fontSize: 12,
                boxShadow: '0 0 0 2px var(--bg)',
              }}
            >
              J
            </span>
          </button>
        </div>
      </div>
      <JRule color="var(--line-bold)" weight={2.5} style={{ margin: '6px 16px 0' }} />
      <JRule color="var(--border)" style={{ margin: '2px 16px 0' }} />
    </>
  )
}

export function JonathanView({
  trip,
  traveler,
  pastTrips,
  onPlayPastTrip,
  onOpenStop,
  onOpenSettings,
  onOpenActivities,
  onOpenPhotos,
  onOpenAllPhotos,
  onOpenMap,
  onOpenWeave,
  onOpenReplay,
  onOpenBook,
  onOpenSurprises,
  onCompose,
  weaveReady,
  bookHasPages,
  surpriseRevealCue,
}) {
  const [mode, setMode] = useState('ops') // 'ops' | 'record'
  // Default to today if it falls within the trip — Jonathan opens the
  // app mid-trip and expects the current day. Otherwise day 1.
  const [activeDayN, setActiveDayN] = useState(() => {
    // Local calendar date (lib/localDate) so "today" matches the trip's
    // YYYY-MM-DD day labels and the live dock near midnight — not the UTC date.
    const today = todayLocalIso()
    const onToday = trip.days.find((d) => d.isoDate === today)
    return onToday?.n || trip.days[0]?.n || 1
  })
  const day = trip.days.find((d) => d.n === activeDayN) || trip.days[0]
  const arrival = findArrivalStop(trip)
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
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', paddingBottom: 120 }}>
      <JMasthead mode={mode} setMode={setMode} onOpenSettings={onOpenSettings} />
      {mode === 'record' ? (
        <JRecord trip={trip} traveler={traveler} onOpenPhotos={onOpenPhotos} />
      ) : (
        <>
        <JonathanEntries
          trip={trip}
          phase={tripPhase(trip)}
          weaveReady={weaveReady}
          surpriseRevealCue={surpriseRevealCue}
          bookHasPages={bookHasPages}
          onOpenMap={onOpenMap}
          onOpenWeave={onOpenWeave}
          onOpenReplay={onOpenReplay}
          onOpenBook={onOpenBook}
          onOpenSurprises={onOpenSurprises}
          onCompose={onCompose}
        />
        <LookBackStrip trips={pastTrips} onPlay={onPlayPastTrip} />
        <JOps
          trip={trip}
          traveler={traveler}
          day={day}
          activeDayN={activeDayN}
          setActiveDayN={setActiveDayN}
          arrival={arrival}
          openLoops={openLoops}
          memCountByStop={memCountByStop}
          totalDriveMiles={totalDriveMiles}
          totalDriveHours={totalDriveHours}
          onOpenStop={onOpenStop}
          onOpenActivities={onOpenActivities}
          onOpenAllPhotos={onOpenAllPhotos}
        />
        </>
      )}
    </div>
  )
}

function JOps({
  trip,
  traveler,
  day,
  activeDayN,
  setActiveDayN,
  arrival,
  openLoops,
  memCountByStop,
  totalDriveMiles,
  totalDriveHours,
  onOpenStop,
  onOpenActivities,
  onOpenAllPhotos,
}) {
  const kick = `Day ${ORDINALS[(day?.n || 1) - 1] || day?.n} · of ${trip.days.length}`
  const rawTitle = (day?.title || '').trim()
  const title = rawTitle ? rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1) + '.' : 'Underway.'
  const dek = truncateAtWord(trip.overview, 140) || trip.subtitle || ''

  const ticker = [
    ['DRIVE', day?.drive ? `${day.drive.miles} mi · ${day.drive.hours}` : `${totalDriveMiles} mi · ${totalDriveHours}h`],
    ['FLIGHT', arrival ? flightHeadline(arrival) : '—'],
    ['ETA HOME', day?.drive?.to || trip.endCity || '—'],
  ]

  return (
    <>
      {/* DAY TABS */}
      {trip.days.length > 1 && (
        <div
          style={{ display: 'flex', padding: '0 16px', borderBottom: '1px solid var(--border)', overflowX: 'auto', scrollbarWidth: 'none' }}
          aria-label="Days in this trip"
        >
          {trip.days.map((d) => {
            const on = d.n === activeDayN
            return (
              <button
                key={d.n}
                type="button"
                onClick={() => setActiveDayN(d.n)}
                aria-pressed={on}
                className="jj-day-chip"
                style={{
                  flex: trip.days.length <= 4 ? 1 : '0 0 auto',
                  minWidth: 64,
                  padding: '10px 8px 11px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: on ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -1,
                  cursor: 'pointer',
                  color: on ? 'var(--text)' : 'var(--muted)',
                  textAlign: 'center',
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'rgba(224,101,79,0.18)',
                }}
              >
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.14em', fontWeight: on ? 700 : 500 }}>
                  DAY {d.n}
                </div>
                <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 13, fontStyle: 'italic', marginTop: 2, fontWeight: on ? 600 : 400 }}>
                  {(d.date || '').split(' ').slice(0, 2).join(' ').toLowerCase()}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* HEADLINE */}
      <div style={{ padding: '16px 16px 4px' }}>
        <JLabel color="var(--muted)">{kick}</JLabel>
        <div
          style={{
            fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
            fontSize: 38,
            fontWeight: 600,
            lineHeight: 0.96,
            letterSpacing: '-0.02em',
            color: 'var(--text)',
            marginTop: 7,
          }}
        >
          {title}
        </div>
        {dek && (
          <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 14, fontStyle: 'italic', color: 'var(--muted)', marginTop: 10, lineHeight: 1.45 }}>
            {dek}
          </div>
        )}
      </div>

      {/* TICKER */}
      <div
        style={{
          margin: '16px 16px 0',
          borderTop: '1px solid var(--line-bold)',
          borderBottom: '1px solid var(--line-bold)',
          padding: '11px 0',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
        }}
      >
        {ticker.map(([k, v], i) => (
          <div key={k} style={{ padding: '0 11px', borderLeft: i ? '1px solid var(--border)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)' }} />
              <JLabel color="var(--muted)" size={8.5}>{k}</JLabel>
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, marginTop: 4, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text)' }}>
              {v || '—'}
            </div>
          </div>
        ))}
      </div>

      {/* RISK WATCH — wired to real pending items (tentative/unconfirmed
          stops). The prototype's cascade *recompute* (real traffic deltas)
          is a later increment; we do not fabricate numbers here. */}
      <JRiskWatch loops={openLoops} onOpenStop={onOpenStop} />

      {/* THE PLAN */}
      {day && (
        <>
          <JSectionHead label="The plan" meta={`${day.stops.length} STOP${day.stops.length === 1 ? '' : 'S'}`} />
          <div style={{ padding: '0 16px' }}>
            {day.stops.map((s, i) => {
              const memCount = memCountByStop.get(s.id) || 0
              const live = isLiveStop(s, day)
              return (
                <div key={s.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '12px 0' }}>
                  <button
                    type="button"
                    onClick={() => onOpenStop(day.n, s.id)}
                    style={{ width: '100%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', textAlign: 'left', display: 'flex', gap: 14, alignItems: 'flex-start' }}
                  >
                    <div style={{ width: 52, flexShrink: 0, paddingTop: 2 }}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>
                        {(s.time || '').replace(' ', '')}
                      </div>
                      {live && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--live)', animation: 'rt-blink 1.2s infinite' }} />
                          <JLabel color="var(--accent-text)" weight={700} size={8}>LIVE</JLabel>
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <JLabel color="var(--muted)">[{s.kind}]</JLabel>
                        {memCount > 0 && (
                          <JLabel color="var(--accent-text)" weight={600}>
                            {memCount} {memCount === 1 ? 'ENTRY' : 'ENTRIES'} ↗
                          </JLabel>
                        )}
                      </div>
                      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 17, lineHeight: 1.18, color: 'var(--text)', marginTop: 4, letterSpacing: '-0.012em' }}>
                        {s.name}
                      </div>
                      {s.note && (
                        <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 12.5, fontStyle: 'italic', color: 'var(--muted)', marginTop: 4, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {s.note}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <AvatarStack ids={s.for || []} size={15} gap={-4} />
                        <JLabel color="var(--muted)">· {(s.address || '').split(',')[0] || ''}</JLabel>
                      </div>
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* THE FLIGHT */}
      {arrival?.stop && (
        <>
          <JSectionHead label="The flight" meta={`${arrival.stop.flightNumber} · ${arrival.stop.flightOrigin || '—'} → ${arrival.stop.flightDest || '—'}`} />
          <div style={{ padding: '12px 16px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                {arrival.stop.scheduledDepartureLocal || ''} <span style={{ color: 'var(--muted)' }}>{arrival.stop.flightOrigin || ''}</span>
              </span>
              <span style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>SCHEDULED</span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                <span style={{ color: 'var(--muted)' }}>{arrival.stop.flightDest || ''}</span> {arrival.stop.scheduledArrivalLocal || arrival.stop.time}
              </span>
            </div>
            <div style={{ position: 'relative', height: 1.5, background: 'var(--border)', margin: '10px 0' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '0%', background: 'var(--accent)' }} />
            </div>
            {/* Honest affordance: there is no real-time flight feed wired in
                production (flightStatus.getFlightStatus returns null without
                VITE_FLIGHT_API), so we do NOT claim a live "EN ROUTE" status.
                We show the planned schedule above and link out to FlightAware's
                public live page — the same fallback FlightStatus.jsx uses. */}
            <a
              href={flightAwareUrl(arrival.stop.flightNumber)}
              target="_blank"
              rel="noreferrer"
              className="link-quiet"
              style={{ color: 'inherit' }}
            >
              <JLabel color="var(--muted)">SCHEDULED · LIVE TRACKING ON FLIGHTAWARE ↗</JLabel>
            </a>
          </div>
        </>
      )}

      {/* THINGS TO DO */}
      {hasActivitiesForTrip(trip.id) && onOpenActivities && (
        <>
          <JSectionHead label="Things to do" meta={`${getActivitiesForTrip(trip.id, trip).length} OPTIONS`} />
          <div style={{ padding: '12px 16px 0' }}>
            <button
              type="button"
              onClick={onOpenActivities}
              style={{ width: '100%', background: 'transparent', border: '1px solid var(--line-bold)', borderLeft: '2px solid var(--accent)', padding: '12px 14px', cursor: 'pointer', color: 'inherit', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 15, fontStyle: 'italic' }}>Around the trip — filter by who.</span>
              <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 20, fontStyle: 'italic', color: 'var(--accent)' }}>→</span>
            </button>
          </div>
        </>
      )}

      {/* QUEUE — runtime "where's the nearest one?" queries (the live
          Places search, NOT a journal — the design's "Quick log" names a
          log-the-stop behavior this app deliberately removed as a bug). */}
      <JSectionHead label="Queue" meta="WHERE'S THE NEAREST" />
      <div style={{ padding: '4px 16px 0' }}>
        <QueueButtons trip={trip} traveler={traveler} />
      </div>

      {/* THE RECORD — secondary archive entry kept visible in OPS so the
          all-photos baseline + entry tests still fire from the home. */}
      {onOpenAllPhotos && (
        <div style={{ padding: '18px 16px 0' }}>
          <button
            type="button"
            data-testid="jonathan-all-photos-entry"
            onClick={onOpenAllPhotos}
            style={{ width: '100%', background: 'transparent', border: '1px solid var(--border)', padding: '11px 14px', cursor: 'pointer', color: 'inherit', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 13, fontStyle: 'italic', color: 'var(--muted)' }}>
              All photos — across every trip.
            </span>
            <JLabel color="var(--muted)">→</JLabel>
          </button>
        </div>
      )}

      {/* COLOPHON */}
      <div style={{ padding: '20px 16px 4px', textAlign: 'center' }}>
        <JLabel color="var(--muted)">· FAMILY OPS · EDITORIAL CONSOLE · EST. 2026 ·</JLabel>
      </div>
    </>
  )
}

// Risk Watch — expandable cards over the trip's real open loops. Each
// card collapses to tag + title + why; expanding shows the stop's note
// and a tap-through to the stop. No fabricated cascade chains.
function JRiskWatch({ loops, onOpenStop }) {
  const [open, setOpen] = useState(loops[0]?.id || null)
  if (!loops.length) {
    return (
      <>
        <JSectionHead label="Risk watch" meta="ALL CLEAR" />
        <div style={{ padding: '8px 16px 0', fontFamily: 'Fraunces, Georgia, serif', fontSize: 14, fontStyle: 'italic', color: 'var(--muted)' }}>
          Nothing on the radar. The day runs itself.
        </div>
      </>
    )
  }
  return (
    <>
      <JSectionHead label="Risk watch" meta={`${loops.length} OPEN`} />
      <div style={{ padding: '0 16px' }}>
        {loops.map((l, i) => {
          const isOpen = open === l.id
          return (
            <div key={l.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '13px 0' }}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : l.id)}
                aria-expanded={isOpen}
                style={{ width: '100%', background: 'transparent', border: 0, cursor: 'pointer', color: 'inherit', padding: 0, textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 11 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <JLabel color="var(--accent-text)" weight={700}>{l.tag}</JLabel>
                  <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 17, lineHeight: 1.2, marginTop: 3, letterSpacing: '-0.012em', color: 'var(--text)' }}>
                    {l.title}
                  </div>
                </div>
                <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 18, fontStyle: 'italic', color: 'var(--muted)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>›</span>
              </button>
              {isOpen && (
                <div style={{ paddingTop: 9 }}>
                  <JLabel color="var(--muted)">{l.why}</JLabel>
                  {l.note && (
                    <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 13.5, fontStyle: 'italic', color: 'var(--text)', marginTop: 6, lineHeight: 1.45, borderLeft: '2px solid var(--live)', paddingLeft: 10 }}>
                      {l.note}
                    </div>
                  )}
                  {l.stopId != null && (
                    <button
                      type="button"
                      onClick={() => onOpenStop(l.dayN, l.stopId)}
                      style={{ marginTop: 10, background: 'transparent', border: '1px solid var(--line-bold)', padding: '8px 12px', cursor: 'pointer', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    >
                      <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 14, fontWeight: 500 }}>Open this stop</span>
                      <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 15, fontStyle: 'italic', color: 'var(--accent)' }}>→</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// THE RECORD — the family picture desk. The trip's real photos as a
// lead frame + grid, reusing PhotoTile/PhotoLightbox so thumbnails,
// multi-photo badges, video posters and the dev capture-date editor all
// behave exactly as in the album. Stacking person/day/place filters and
// the "show me, me" co-stars are a later increment (the face recognizer
// doesn't exist yet).
function JRecord({ trip, traveler, onOpenPhotos }) {
  const [memoryTick, setMemoryTick] = useState(0)
  const entries = useMemo(() => {
    const mems = listMemoriesForTrip(trip.id, traveler)
    const flat = flattenPhotoEntries(mems)
    return groupByStop(flat, trip).flatMap((g) => g.entries)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, traveler, memoryTick])

  const [lightbox, setLightbox] = useState(null) // { entry, index }
  // Re-resolve the open entry by key after a capture-date edit, same
  // defensive pattern as AllPhotosView.
  useEffect(() => {
    setLightbox((lb) => {
      if (!lb) return lb
      const idx = entries.findIndex((e) => e.key === lb.entry.key)
      if (idx < 0) return lb
      return { ...lb, index: idx, entry: entries[idx] }
    })
  }, [entries])

  function openLightbox(entry) {
    const index = entries.findIndex((e) => e === entry)
    setLightbox({ entry, index: index >= 0 ? index : 0 })
  }
  function step(delta) {
    setLightbox((lb) => {
      if (!lb) return null
      const next = lb.index + delta
      if (next < 0 || next >= entries.length) return lb
      return { ...lb, index: next, entry: entries[next] }
    })
  }

  const lead = entries[0]
  const rest = entries.slice(1)

  return (
    <>
      <div style={{ padding: '16px 16px 4px' }}>
        <JLabel color="var(--muted)">THE FAMILY PICTURE DESK · {entries.length} {entries.length === 1 ? 'FRAME' : 'FRAMES'} FILED</JLabel>
        <div style={{ fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif', fontSize: 34, fontWeight: 600, lineHeight: 0.96, letterSpacing: '-0.018em', color: 'var(--text)', marginTop: 8 }}>
          What we saw.
        </div>
        <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 14, fontStyle: 'italic', color: 'var(--muted)', marginTop: 8, lineHeight: 1.45 }}>
          The same trip, filed as frames.
        </div>
      </div>

      {entries.length === 0 ? (
        <div style={{ padding: '20px 16px 0' }}>
          <div data-testid="record-empty" style={{ padding: '28px 16px', textAlign: 'center', border: '1px dashed var(--border)', color: 'var(--muted)', fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 15 }}>
            No frames filed yet. Add the first one below.
          </div>
        </div>
      ) : (
        <GridPausedProvider paused={!!lightbox}>
          {lead && (
            <div style={{ padding: '16px 16px 0' }}>
              <PhotoTile entry={lead} onOpen={() => openLightbox(lead)} />
            </div>
          )}
          {rest.length > 0 && (
            <>
              <JSectionHead label="More from the desk" meta={`${rest.length} ${rest.length === 1 ? 'FRAME' : 'FRAMES'}`} />
              <div style={{ padding: '12px 14px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {rest.map((e) => (
                  <PhotoTile key={e.key} entry={e} onOpen={() => openLightbox(e)} />
                ))}
              </div>
            </>
          )}
        </GridPausedProvider>
      )}

      {/* ADD A FRAME → the real importer */}
      <div style={{ padding: '20px 16px 0' }}>
        <button
          type="button"
          onClick={onOpenPhotos}
          style={{ width: '100%', background: 'transparent', border: '1px solid var(--line-bold)', borderTop: '2px solid var(--accent)', padding: '14px', cursor: 'pointer', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div>
            <JLabel color="var(--accent-text)" weight={700}>● ADD A FRAME</JLabel>
            <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 18, fontStyle: 'italic', marginTop: 4 }}>file one to the desk.</div>
          </div>
          <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 24, fontStyle: 'italic', color: 'var(--accent)' }}>→</span>
        </button>
      </div>

      {lightbox && (
        <PhotoLightbox
          entry={lightbox.entry}
          index={lightbox.index}
          total={entries.length}
          onPrev={lightbox.index > 0 ? () => step(-1) : null}
          onNext={lightbox.index < entries.length - 1 ? () => step(1) : null}
          onClose={() => setLightbox(null)}
          onCapturedAtChanged={() => setMemoryTick((t) => t + 1)}
        />
      )}
    </>
  )
}

// ── helpers ────────────────────────────────────────────────────────

// Build "open loops" from tentative stops across the trip — the real
// "needs a decision / unconfirmed" signal we have today. Carries the
// stop's day + id so a card can open it.
function deriveOpenLoops(trip) {
  const loops = []
  for (const day of trip.days || []) {
    for (const stop of day.stops || []) {
      if (stop.tentative) {
        loops.push({
          id: `${day.n}:${stop.id}`,
          tag: 'CONFIRM',
          title: stop.name,
          why: `Day ${day.n} · ${stop.time || ''}`.trim(),
          note: stop.note || '',
          dayN: day.n,
          stopId: stop.id,
        })
      }
    }
  }
  return loops.slice(0, 3)
}

// Cap text at `max` chars but never mid-word; trailing punctuation
// trimmed, "…" appended only when actually shortened.
function truncateAtWord(str, max) {
  if (!str || str.length <= max) return str || ''
  const sliced = str.slice(0, max)
  const lastSpace = sliced.lastIndexOf(' ')
  const base = (lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced).replace(/[\s,;:.\-—]+$/, '')
  return `${base}…`
}

// Quick-glance flight stat for the ticker — flight number + scheduled
// arrival only. Live status is the trip view's separate panel; a fake
// "ON TIME" sticker here would be worse than restraint.
function flightHeadline(arrival) {
  if (!arrival?.stop) return null
  const s = arrival.stop
  const sched = s.scheduledArrivalLocal || s.time
  return sched ? `${s.flightNumber} · ${sched}` : s.flightNumber
}

// Heuristic LIVE: a stop is "live" if today matches the day and now is
// within ±60 min of its time. Marks the in-progress stop with the dot.
function isLiveStop(stop, day) {
  if (!stop?.time || !day?.isoDate) return false
  const now = new Date()
  // Local calendar date from `now` (not the UTC ISO date): the stop's clock
  // time is parsed in local time below, so the day-match must be local too.
  const today = todayLocalIso()
  if (today !== day.isoDate) return false
  const m = stop.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) return false
  let h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (/PM/i.test(m[3] || '') && h < 12) h += 12
  if (/AM/i.test(m[3] || '') && h === 12) h = 0
  const stopMs = new Date(`${day.isoDate}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`).getTime()
  return Math.abs(now.getTime() - stopMs) <= 60 * 60 * 1000
}

// Runtime nearby-search categories — `query` is passed to Places (New)
// searchText via the worker; `hint` is the editorial line under each row.
const QUEUE_CATEGORIES = [
  { label: 'Bathroom', hint: 'stopped', query: 'public restroom' },
  { label: 'Fast food', hint: 'in & out', query: 'fast food' },
  { label: 'Outside', hint: 'stretch', query: 'park' },
  {
    label: 'Emergency',
    hint: 'flag',
    query: 'urgent care or hospital',
    note: 'Searches urgent care AND hospitals — pick by hours/distance. For a real emergency call 911 first.',
  },
]

function QueueButtons({ trip, traveler }) {
  const [openCategory, setOpenCategory] = useState(null)
  const homeBase = tripHomeBase(trip)
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16 }}>
        {QUEUE_CATEGORIES.map((cat) => (
          <button
            key={cat.label}
            type="button"
            onClick={() => setOpenCategory(cat)}
            style={{ padding: '11px 0', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'baseline', gap: 6 }}
          >
            <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 14, textDecoration: 'underline', textDecorationColor: 'var(--accent)', textUnderlineOffset: 3 }}>
              {cat.label}
            </span>
            <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 12, fontStyle: 'italic', color: 'var(--muted)' }}>
              — {cat.hint}
            </span>
          </button>
        ))}
      </div>
      {openCategory && (
        <NearbyResultsModal category={openCategory} homeBase={homeBase} traveler={traveler} onClose={() => setOpenCategory(null)} />
      )}
    </>
  )
}
