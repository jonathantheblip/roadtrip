import { Play } from 'lucide-react'
import { humanDateRange } from '../lib/createTripCard'

// LOOK BACK FURTHER — a small row of PAST trips on the per-person home. Tap a
// trip to jump STRAIGHT into replaying its reel (no navigating into the trip
// first). Newest past trip first; hidden when there are none. Themed entirely
// via tokens so it reskins per person; the "Replay" affordance uses
// --accent-text (accent AS text), never an accent fill (the C1/Stage-2 ink trap).
export function LookBackStrip({ trips, onPlay, style }) {
  if (!trips || trips.length === 0) return null
  return (
    <section data-testid="lookback-strip" style={{ padding: '10px 18px 2px', ...style }}>
      <div
        style={{
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 8,
        }}
      >
        Look back further
      </div>
      <div
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          paddingBottom: 4,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {trips.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid="lookback-trip"
            data-trip-id={t.id}
            onClick={() => onPlay?.(t.id)}
            style={{
              flex: '0 0 auto',
              minWidth: 150,
              maxWidth: 220,
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '11px 13px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 'var(--heading-weight)',
                fontSize: 15,
                lineHeight: 1.15,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {t.title || 'Untitled trip'}
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {t.dateRange || humanDateRange(t.dateRangeStart, t.dateRangeEnd) || ''}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                marginTop: 2,
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--accent-text)',
              }}
            >
              <Play size={11} fill="currentColor" /> Replay
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
