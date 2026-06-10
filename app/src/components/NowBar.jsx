// NowBar — the one pinned "Now-bar" anchor from the entry-points IA model.
// The single most time-critical live edge (now/next + where a cue lights up),
// kept in the thumb zone, one tap → opens Live Map. Present only DURING a trip;
// the home reflows and this retracts after. Themed via the app tokens; the
// parent decides positioning (fixed bottom during the trip).
import { ChevronRight } from 'lucide-react'

export function NowBar({ traveler, now = '', next = '', label = 'Live Map', cue = null, onClick }) {
  const mono = traveler === 'jonathan'
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="now-bar"
      aria-label={`${label}${now ? ` — ${now}` : ''}${next ? ` · ${next}` : ''}`}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', cursor: 'pointer',
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: traveler === 'jonathan' ? 3 : 16,
        padding: '10px 13px', boxShadow: 'var(--shadow-card)', fontFamily: 'var(--font-body)', color: 'var(--text)',
        minHeight: 48,
      }}
    >
      <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }} aria-hidden="true">
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--live, var(--accent))' }} />
        <span style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '1.5px solid var(--live, var(--accent))', opacity: 0.5 }} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8.5, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--muted)' }}>
          Now · {label}
        </span>
        <span style={{ fontFamily: mono ? 'JetBrains Mono, monospace' : 'var(--font-body)', fontSize: mono ? 12 : 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {now}
          {next ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {next}</span> : null}
        </span>
      </span>
      {cue && <span style={{ flexShrink: 0 }}>{cue}</span>}
      <ChevronRight size={16} style={{ flexShrink: 0, color: 'var(--muted)' }} aria-hidden="true" />
    </button>
  )
}
