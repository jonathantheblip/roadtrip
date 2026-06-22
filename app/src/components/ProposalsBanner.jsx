// Propose → decide (slice 6) — the decision surface on the "We could…" tab
// (v1; moving it onto a built-out Now tab is a follow-up). Renders the pending
// ideas "on the table" and what's been accepted ("on for now"). The
// action shown depends on the viewer:
//   - a DECIDER (adult)        → Let's go / Not now
//   - the PROPOSER (a kid)     → "waiting on the grown-ups" + the tally
//   - any other non-decider    → "I'm in" (a soft vote, toggleable)
// The worker is the real gate (a kid's decide is refused there); this only
// shapes what each lens sees. Themed per-lens via the active CSS variables.
import { TRAVELERS } from '../data/travelers'
import { canDecide } from '../lib/proposals'
import { Avatar } from './Avatar'

const MONO = { fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }

function nameOf(t) {
  return TRAVELERS[t]?.name || t
}

function Card({ children }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 14,
        background: 'var(--card, var(--bg))',
        padding: '12px 14px',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  )
}

function PendingCard({ p, traveler, onVote, onDecide }) {
  const mine = p.proposedBy === traveler
  const decider = canDecide(traveler)
  const voted = (p.votes || []).includes(traveler)
  const inCount = (p.votes || []).length
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Avatar id={p.proposedBy} size={20} />
        <span style={{ ...MONO, fontSize: 9.5, color: 'var(--accent-text, var(--accent))' }}>
          {mine ? 'You suggest' : `${nameOf(p.proposedBy)} suggests`} · open time
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontSize: 18, color: 'var(--text)', lineHeight: 1.15 }}>
        {p.spot?.title || p.spot?.name || 'an idea'}
      </div>
      {p.note && <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>“{p.note}”</div>}
      {p.spot?.travel && (
        <div style={{ ...MONO, fontSize: 9.5, color: 'var(--muted)', marginTop: 6 }}>
          {p.spot.travel.mode === 'walk' ? 'WALK' : 'DRIVE'} · {p.spot.travel.minutes} MIN
          {inCount > 0 ? `  ·  ${inCount} IN` : ''}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {decider ? (
          <>
            <button
              type="button"
              data-testid="proposal-accept"
              onClick={() => onDecide(p.id, 'accepted')}
              style={{ flex: 1, minHeight: 42, borderRadius: 12, border: 0, cursor: 'pointer', background: 'var(--accent)', color: 'var(--accent-ink, #fff)', fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 600 }}
            >
              Let’s go
            </button>
            <button
              type="button"
              data-testid="proposal-decline"
              onClick={() => onDecide(p.id, 'declined')}
              style={{ flex: 1, minHeight: 42, borderRadius: 12, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 14.5 }}
            >
              Not now
            </button>
          </>
        ) : mine ? (
          <div style={{ ...MONO, fontSize: 9.5, color: 'var(--muted)', paddingTop: 4 }}>
            Waiting on the grown-ups{inCount > 0 ? ` · ${inCount} in` : ''}
          </div>
        ) : (
          <button
            type="button"
            data-testid="proposal-imin"
            onClick={() => onVote(p.id)}
            aria-pressed={voted}
            style={{
              flex: 1,
              minHeight: 42,
              borderRadius: 12,
              cursor: 'pointer',
              border: `1.5px solid var(--accent)`,
              background: voted ? 'var(--accent)' : 'transparent',
              color: voted ? 'var(--accent-ink, #fff)' : 'var(--accent-text, var(--accent))',
              fontFamily: 'var(--font-body)',
              fontSize: 14.5,
              fontWeight: 600,
            }}
          >
            {voted ? 'I’m in ✓' : 'I’m in →'}
          </button>
        )}
      </div>
    </Card>
  )
}

export function ProposalsBanner({ pending = [], accepted = [], traveler, onVote, onDecide }) {
  if (!pending.length && !accepted.length) return null
  return (
    <div data-testid="proposals-banner" style={{ padding: '4px 18px 0' }}>
      {pending.length > 0 && (
        <div style={{ ...MONO, fontSize: 9.5, color: 'var(--muted)', margin: '6px 0 8px' }}>
          {pending.length === 1 ? 'An idea on the table' : `${pending.length} ideas on the table`}
        </div>
      )}
      {pending.map((p) => (
        <PendingCard key={p.id} p={p} traveler={traveler} onVote={onVote} onDecide={onDecide} />
      ))}

      {accepted.length > 0 && (
        <>
          <div style={{ ...MONO, fontSize: 9.5, color: 'var(--accent-text, var(--accent))', margin: '10px 0 8px' }}>
            On for now
          </div>
          {accepted.map((p) => (
            <Card key={p.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span aria-hidden="true" style={{ fontSize: 16 }}>✓</span>
                <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontSize: 16, color: 'var(--text)' }}>
                  {p.spot?.title || p.spot?.name || 'an idea'}
                </div>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}
