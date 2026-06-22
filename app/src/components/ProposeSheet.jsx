// Propose sheet (slice 6) — opened from a "We could…" card. The proposer picks
// who it's for (default = the whole family minus self — the design's smart
// "who it suits" default waits on slice 3c), adds an optional note, and sends.
// "A suggestion, not a booking." Identity is the device session (server-set);
// this only carries the spot snapshot + recipients + note. Bottom-sheet overlay,
// themed per-lens via the active [data-theme] CSS variables.
import { useState } from 'react'
import { TRAVELER_ORDER, TRAVELERS } from '../data/travelers'
import { Avatar } from './Avatar'

export function ProposeSheet({ spot, traveler, onSend, onClose }) {
  // Default: everyone but me (v1 — the "who it suits" default is slice 3c).
  const [recipients, setRecipients] = useState(() => TRAVELER_ORDER.filter((t) => t !== traveler))
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  if (!spot) return null

  const toggle = (t) =>
    setRecipients((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))

  const send = async () => {
    if (sending) return
    setSending(true)
    try {
      await onSend({ recipients, note: note.trim() })
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Propose this to the family"
      data-testid="propose-sheet"
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end' }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', border: 0, cursor: 'pointer' }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          background: 'var(--card, var(--bg))',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '18px 18px calc(18px + env(safe-area-inset-bottom))',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.3)',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        {/* The spot */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              flexShrink: 0,
              background: spot.photoUrl ? `center/cover url(${spot.photoUrl})` : (spot.tint || 'var(--bg2)'),
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontSize: 18, color: 'var(--text)', lineHeight: 1.1 }}>
              {spot.title || spot.name}
            </div>
            {spot.travel && (
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, color: 'var(--muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {spot.travel.mode === 'walk' ? 'WALK' : 'DRIVE'} · {spot.travel.minutes} MIN
              </div>
            )}
          </div>
        </div>

        {/* Send to */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
            Send to
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {TRAVELER_ORDER.filter((t) => t !== traveler).map((t) => {
              const on = recipients.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggle(t)}
                  aria-pressed={on}
                  aria-label={`${TRAVELERS[t]?.name || t}${on ? ' (selected)' : ''}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '5px 11px 5px 5px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                    background: on ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
                    color: 'var(--text)',
                  }}
                >
                  <Avatar id={t} size={22} />
                  <span style={{ fontSize: 13 }}>{TRAVELERS[t]?.name || t}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Note */}
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (optional)"
          aria-label="Add a note"
          maxLength={500}
          style={{
            width: '100%',
            marginTop: 16,
            padding: '11px 12px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--bg2, var(--bg))',
            color: 'var(--text)',
            fontFamily: 'var(--font-body)',
            fontSize: 15,
          }}
        />

        <button
          type="button"
          onClick={send}
          disabled={sending}
          data-testid="propose-send"
          style={{
            width: '100%',
            marginTop: 16,
            minHeight: 48,
            borderRadius: 14,
            border: 0,
            cursor: sending ? 'default' : 'pointer',
            background: 'var(--accent)',
            color: 'var(--accent-ink, #fff)',
            fontFamily: 'var(--font-body)',
            fontSize: 16,
            fontWeight: 600,
            opacity: sending ? 0.7 : 1,
          }}
        >
          {sending ? 'Sending…' : 'Send it →'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>
          A suggestion, not a booking.
        </div>
      </div>
    </div>
  )
}
