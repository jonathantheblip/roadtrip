// MoveSheet — Ch3 photo-moves. A bottom sheet (author's/mover's own skin) that
// lets ANY ADULT hand-file a photo to a different place or named moment, or leave
// it unfiled. Picking a target calls onPick(stopId|null, label|null); the caller
// writes it via updateMemoryStop with a manual provenance stamp, which the LIVE
// worker LOCKS (authorship outranks the machine). Rafa never sees this sheet —
// the caller gates on isAdult before rendering it.
//
// Modeled on ShareMomentSheet: full-screen dimmed overlay, backdrop-click closes,
// a themed bottom sheet with a grab handle. Copy is per-lens + VERBATIM
// (lib/moveCopy.js). Targets arrive day-grouped from the caller (the trip's
// places); the current filing is marked "here now".
import { useEffect } from 'react'
import { X, MapPin, Check } from 'lucide-react'
import {
  moveSheetTitle, unfiledRowLabel, UNFILED_SUB, HERE_NOW, ROW_PLACE, ROW_MOMENT,
} from '../lib/moveCopy'

export function MoveSheet({ currentStopId, targets = [], traveler, onPick, onClose }) {
  // Esc closes (parity with the other sheets).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Group the targets by their day label, preserving arrival order.
  const byDay = []
  const dayIndex = new Map()
  for (const t of targets) {
    const key = t.dayLabel || ''
    if (!dayIndex.has(key)) { dayIndex.set(key, byDay.length); byDay.push({ dayLabel: key, rows: [] }) }
    byDay[dayIndex.get(key)].rows.push(t)
  }

  const Row = ({ label, sub, current, onClick, testid }) => (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
        background: current ? 'var(--card)' : 'transparent',
        border: '1px solid var(--border)', borderRadius: 12, padding: '11px 13px',
        color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font-body)', marginTop: 8,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 3 }}>{sub}</div>}
      </div>
      {current && <span data-testid="move-here-now" style={{ fontSize: 12.5, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Check size={13} /> {HERE_NOW}</span>}
    </button>
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Move this photo"
      data-testid="move-sheet"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 270,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(1.5px)',
      }}
    >
      <div
        style={{
          background: 'var(--bg)', color: 'var(--text)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: '12px 20px calc(env(safe-area-inset-bottom) + 22px)',
          boxShadow: '0 -18px 50px -20px rgba(0,0,0,0.4)',
          border: '1px solid var(--border)', borderBottom: 'none',
          fontFamily: 'var(--font-body)', maxHeight: '78vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 3, background: 'var(--faint)', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--heading-weight, 600)', fontSize: 23, letterSpacing: '-0.01em' }}>
            {moveSheetTitle(traveler)}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 0, color: 'var(--muted)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
            <X size={20} />
          </button>
        </div>

        {byDay.map((day) => (
          <div key={day.dayLabel} style={{ marginTop: 16 }}>
            {day.dayLabel && (
              <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>{day.dayLabel}</div>
            )}
            {day.rows.map((t) => (
              <Row
                key={t.stopId}
                testid="move-target"
                label={t.label}
                sub={t.kind === 'moment' ? ROW_MOMENT : ROW_PLACE}
                current={t.stopId === currentStopId}
                onClick={() => onPick(t.stopId, t.label)}
              />
            ))}
          </div>
        ))}

        {/* Leave unfiled — always available. */}
        <div style={{ marginTop: 18 }}>
          <Row
            testid="move-unfiled"
            label={unfiledRowLabel(traveler)}
            sub={UNFILED_SUB}
            current={!currentStopId}
            onClick={() => onPick(null, null)}
          />
        </div>
      </div>
    </div>
  )
}
