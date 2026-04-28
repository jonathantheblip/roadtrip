import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
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
  const ordered = [...trips].sort((a, b) => priority(a) - priority(b))
  const liveCounts = useMemo(() => {
    const map = new Map()
    for (const t of ordered) {
      map.set(t.id, listMemoriesForTrip(t.id, traveler).length)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traveler, ordered.length])

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
        {ordered.map((trip, i) => {
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
      </div>
    </div>
  )
}

function TripCard({ trip, memoryCount, onOpen, isFirst, animDelay }) {
  const status = (trip.status || '').toLowerCase()
  const statusLabel =
    status === 'planning'
      ? '● IN PLANNING'
      : status === 'archived'
        ? 'ARCHIVED'
        : status === 'live'
          ? '● LIVE'
          : status.toUpperCase()
  const statusColor = status === 'archived' ? 'var(--muted)' : 'var(--accent)'
  const startCity = (trip.startCity || '').toUpperCase()
  const endCity = (trip.endCity || '').toUpperCase()
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

      {isFirst && (
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
      )}

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
            {startCity} → {endCity}
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

function priority(t) {
  if (t.status === 'live') return 0
  if (t.status === 'planning') return 1
  return 2
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
