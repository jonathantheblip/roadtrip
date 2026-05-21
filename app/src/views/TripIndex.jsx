import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import { effectiveStatus } from '../data/trips'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { AvatarStack } from '../components/Avatar'

// Trip index — the platform's home. Direct port of the Design bundle's
// HomeScreen (screens-supporting.jsx#HomeScreen). Per traveler theme
// applied via CSS variables, so the same layout reads cleanly on
// Jonathan's Kottke-dark and Rafa's near-black as it does on Helen's
// linen and Aurelia's rose.
//
// Each trip card surfaces:
//   • status eyebrow (in planning / archived / live) with date range
//   • serif title + italic subtitle
//   • photo placeholder (Pass-2 will swap to a real hero asset)
//   • AvatarStack of travelers + "<start> → <end>" route
//   • live memory count read from listMemoriesForTrip

export function TripIndex({ traveler = 'helen', trips = [], onOpenTrip, onNewTrip }) {
  // Order by where each trip sits relative to today, then bucket prior
  // years into a separate archive. effectiveStatus(trip) (in trips.js)
  // is the single source of truth for the status chip — a stored
  // 'planning' that's already past now reads ARCHIVED. groupTrips()
  // applies the same date logic to the layout: current-year trips
  // (upcoming first, then most-recent past) up top, prior years in
  // ARCHIVE · YYYY sections below.
  const { current, archives, archiveYears } = useMemo(() => groupTrips(trips), [trips])
  const liveCounts = useMemo(() => {
    const map = new Map()
    for (const t of trips) {
      map.set(t.id, listMemoriesForTrip(t.id, traveler).length)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traveler, trips.length])

  return (
    <div
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        minHeight: '100vh',
        paddingBottom: 120,
      }}
    >
      <div
        style={{
          padding: '60px 18px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Eyebrow color="var(--muted)">THE JACKSON FAMILY</Eyebrow>
        <button
          type="button"
          onClick={onNewTrip}
          style={{
            padding: '6px 12px',
            borderRadius: 16,
            border: '1px solid var(--text)',
            background: 'transparent',
            color: 'var(--text)',
            fontSize: 12,
            fontFamily: 'Inter Tight, system-ui, sans-serif',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
          }}
        >
          <Plus size={12} /> New trip
        </button>
      </div>

      <div style={{ padding: '8px 18px 12px' }}>
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
          Trips
        </div>
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 14,
            fontStyle: 'italic',
            color: 'var(--muted)',
            marginTop: 6,
          }}
        >
          An archive, and a planning surface for what comes next.
        </div>
      </div>

      <Hairline color="var(--text)" style={{ margin: '0 18px' }} />

      <div style={{ padding: '0 18px' }}>
        {current.map((trip, i) => {
          const isFirst = i === 0
          return (
            <div key={trip.id}>
              {!isFirst && <Hairline color="var(--text)" style={{ margin: '14px 0' }} />}
              <TripCard
                trip={trip}
                memoryCount={liveCounts.get(trip.id) || 0}
                onOpen={() => onOpenTrip(trip.id)}
                isFirst={isFirst}
                animDelay={i}
              />
            </div>
          )
        })}

        {archiveYears.map((year) => (
          <div key={year} style={{ marginTop: 36 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                padding: '4px 0 10px',
              }}
            >
              <Eyebrow color="var(--muted)" weight={700}>
                ARCHIVE · {year}
              </Eyebrow>
              <Eyebrow color="var(--faint, var(--muted))">
                {archives.get(year).length} TRIP
                {archives.get(year).length === 1 ? '' : 'S'}
              </Eyebrow>
            </div>
            <Hairline color="var(--text)" />
            {archives.get(year).map((trip, i) => (
              <div key={trip.id}>
                {i > 0 && <Hairline color="var(--text)" style={{ margin: '14px 0' }} />}
                <TripCard
                  trip={trip}
                  memoryCount={liveCounts.get(trip.id) || 0}
                  onOpen={() => onOpenTrip(trip.id)}
                  isFirst={false}
                  animDelay={current.length + i}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Today + current year are read once when the module loads, which is
// fine for a PWA that lives weeks at a time — the list re-groups itself
// whenever the trip array changes anyway.
const TODAY_ISO = new Date().toISOString().slice(0, 10)
const CURRENT_YEAR = new Date().getFullYear()

function tripYear(t) {
  // Prefer the end date when both are present so multi-day trips that
  // straddle a year boundary archive into the year they ended.
  const startYear = parseInt((t.dateRangeStart || '').slice(0, 4), 10)
  const endYear = parseInt((t.dateRangeEnd || '').slice(0, 4), 10)
  return endYear || startYear || CURRENT_YEAR
}

function isUpcomingOrActive(t) {
  // No end date → treat as upcoming so freshly-created planning trips
  // sit at the top until dates firm up.
  if (!t.dateRangeEnd) return true
  return t.dateRangeEnd >= TODAY_ISO
}

function groupTrips(trips) {
  const current = []
  const archives = new Map()
  for (const t of trips) {
    const y = tripYear(t)
    if (y === CURRENT_YEAR) {
      current.push(t)
    } else {
      if (!archives.has(y)) archives.set(y, [])
      archives.get(y).push(t)
    }
  }
  // Current year: upcoming/active first (soonest start), then past
  // (most recent end first). Beats the old status-based sort which
  // pinned every "planning" trip above every "archived" one regardless
  // of date, leaving last month's trip on top of next week's.
  current.sort((a, b) => {
    const aUp = isUpcomingOrActive(a)
    const bUp = isUpcomingOrActive(b)
    if (aUp && !bUp) return -1
    if (!aUp && bUp) return 1
    if (aUp) return (a.dateRangeStart || '').localeCompare(b.dateRangeStart || '')
    return (b.dateRangeEnd || '').localeCompare(a.dateRangeEnd || '')
  })
  for (const arr of archives.values()) {
    arr.sort((a, b) => (b.dateRangeEnd || '').localeCompare(a.dateRangeEnd || ''))
  }
  const archiveYears = Array.from(archives.keys()).sort((a, b) => b - a)
  return { current, archives, archiveYears }
}

function TripCard({ trip, memoryCount, onOpen, isFirst, animDelay }) {
  // Date-derived status so a 'planning' trip auto-flips to 'live' on
  // its start date and 'archived' after its end date — no need to
  // edit trips.js when the calendar moves. Single source of truth in
  // data/trips.js#effectiveStatus, shared with RafaView.
  const status = effectiveStatus(trip)
  const statusLabel =
    status === 'live'
      ? '● LIVE'
      : status === 'archived'
        ? 'ARCHIVED'
        : '● IN PLANNING'
  const statusColor = status === 'archived' ? 'var(--muted)' : 'var(--accent)'
  const startCity = (trip.startCity || '').toUpperCase()
  const endCity = (trip.endCity || '').toUpperCase()
  // For genuine A→B road trips, render the route. For trips that
  // anchor at one place (a weekend in NYC, a volleyball tournament at
  // Mohegan Sun) the route notation reads as road-trip energy when the
  // trip isn't really one — so a per-trip locationLabel override wins.
  const locationLabel = trip.locationLabel
    ? trip.locationLabel.toUpperCase()
    : `${startCity} → ${endCity}`
  const dayCount = trip.days?.length || 0
  const titleLines = (trip.title || '').split(/[—:]/).map((s) => s.trim())

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`fade-up d${Math.min(animDelay + 1, 6)}`}
      style={{
        width: '100%',
        background: 'transparent',
        border: 0,
        padding: '14px 0',
        cursor: 'pointer',
        color: 'inherit',
        textAlign: 'left',
        display: 'block',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <Eyebrow color={statusColor} weight={600}>
          {statusLabel}
        </Eyebrow>
        <Eyebrow color="var(--muted)">
          {(trip.dateRange || '').toUpperCase()}
        </Eyebrow>
      </div>
      <div
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 24,
          fontWeight: 700,
          lineHeight: 1.05,
          marginTop: 6,
          color: 'var(--text)',
        }}
      >
        {titleLines.length > 1 ? (
          <>
            {titleLines[0]}
            <br />
            {titleLines.slice(1).join(' — ')}
          </>
        ) : (
          trip.title
        )}
      </div>
      {trip.subtitle && (
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--muted)',
            marginTop: 4,
          }}
        >
          {trip.subtitle}
        </div>
      )}

      {trip.heroImage ? (
        <img
          src={trip.heroImage}
          alt={trip.title}
          style={{
            width: '100%',
            aspectRatio: '16 / 9',
            borderRadius: 10,
            marginTop: 12,
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : isFirst ? (
        <div
          style={{
            width: '100%',
            aspectRatio: '16 / 9',
            borderRadius: 10,
            background:
              'repeating-linear-gradient(45deg, var(--bg2), var(--bg2) 6px, var(--card) 6px, var(--card) 12px)',
            marginTop: 12,
          }}
        />
      ) : null}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 10,
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
          }}
        >
          <AvatarStack ids={trip.travelers || []} size={isFirst ? 20 : 18} />
          <Eyebrow color="var(--muted)">
            {locationLabel}
          </Eyebrow>
        </div>
        <Eyebrow color="var(--accent)" weight={600}>
          {memoryCount} {memoryCount === 1 ? 'MEMORY' : 'MEMORIES'}
          {!isFirst && dayCount > 0 ? ` · ${dayCount} DAYS` : ''}
        </Eyebrow>
      </div>
    </button>
  )
}

function Eyebrow({ children, color, weight = 500, style }) {
  return (
    <span
      style={{
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontWeight: weight,
        color: color || 'currentColor',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

function Hairline({ color, style }) {
  return (
    <div
      style={{
        height: 1,
        background: color || 'currentColor',
        opacity: 0.18,
        ...style,
      }}
    />
  )
}
