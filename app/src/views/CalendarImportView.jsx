import { useMemo, useState } from 'react'
import { ChevronLeft, CalendarDays, Check, AlertCircle, MapPin } from 'lucide-react'
import { formatEventWhen } from '../lib/calendarImport'
import { humanDateRange } from '../lib/createTripCard'

// Calendar Pull — confirmation screen. The Apple Shortcut reads the
// family calendar on-device, the worker filters + geocodes, and the app
// opens here with the surviving events. Same confirmation contract as
// Share-In and reconciliation: the app proposes, Helen confirms, nothing
// saves silently.
//
// Props:
//   trip      — the matched trip (resolved from payload.tripId)
//   payload   — worker response: { matched, tripId, dateRange, events, reason }
//   onConfirm(checkedEvents) — turns checked events into stops (App wires
//               this to eventsToMultiCard → applyCardToTrip → upsertTrip)
//   onCreateTrip(payload) — Feature A: on the no-match state, scaffold a
//               new trip from the event window and route into confirmation
//   onBack    — leave the flow

export function CalendarImportView({ trip, payload, onConfirm, onCreateTrip, onBack }) {
  const events = useMemo(
    () => (Array.isArray(payload?.events) ? payload.events : []),
    [payload]
  )
  const [checked, setChecked] = useState(() => events.map(() => true))
  const [phase, setPhase] = useState('confirming') // 'confirming' | 'saving' | 'saved'
  const [savedCount, setSavedCount] = useState(0)
  const [creating, setCreating] = useState(false)

  const checkedCount = checked.filter(Boolean).length

  function toggle(i) {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
  }

  async function handleConfirm() {
    const picked = events.filter((_, i) => checked[i])
    if (picked.length === 0) return
    setPhase('saving')
    try {
      await onConfirm?.(picked)
      setSavedCount(picked.length)
      setPhase('saved')
    } catch {
      // Surface as a non-fatal banner but stay on the list so the user
      // can retry; the stop-add path writes locally first regardless.
      setPhase('confirming')
    }
  }

  // Feature A — "Create a trip from these dates" on the no-match state.
  // App scaffolds the trip and re-routes this view to the event checklist
  // against the new trip, so the component remounts on success and there's
  // no local state to reset; on failure we stay put for a retry.
  async function handleCreate() {
    if (creating) return
    setCreating(true)
    try {
      await onCreateTrip?.(payload)
    } catch {
      setCreating(false)
    }
  }

  // decodeFailed: the deep link routed us here but ?data= didn't decode
  // into a payload at all — a distinct, visible failure (malformed/
  // truncated base64) rather than a silent fall-through to the trip list.
  const decodeFailed = !payload
  const noMatch = decodeFailed || payload.matched === false || !trip
  const reason = decodeFailed
    ? "Couldn't read the calendar data from that link — it may be malformed or truncated. Try running the shortcut again."
    : payload?.reason === 'no matching trip'
      ? 'No confirmed trip covers those dates. Create or confirm the trip first, then pull again.'
      : !trip
        ? "That trip isn't on this device yet — open it once so it syncs, then pull again."
        : 'Nothing to import.'

  // Feature A — offer "Create a trip from these dates" only on the genuine
  // no-matching-trip state with a usable window. NOT on a decode error
  // (we have no dates) and NOT on the trip-not-on-this-device case (that's
  // a sync gap, not a missing trip — creating a second trip would fork it).
  const canCreate =
    typeof onCreateTrip === 'function' &&
    !decodeFailed &&
    payload?.reason === 'no matching trip' &&
    !!(payload?.dateRange?.start)
  const rangeLabel = canCreate
    ? humanDateRange(
        String(payload.dateRange.start || '').slice(0, 10),
        String(payload.dateRange.end || '').slice(0, 10)
      )
    : ''

  return (
    <div style={shellStyle}>
      <header style={{ padding: 'calc(env(safe-area-inset-top) + 60px) 18px 6px' }}>
        <button onClick={onBack} type="button" style={backLinkStyle}>
          <ChevronLeft size={12} /> {trip?.title || 'Trips'}
        </button>
        <div style={titleStyle}>
          <CalendarDays size={22} style={{ marginRight: 8, verticalAlign: '-3px' }} />
          From your calendar
        </div>
        <p style={subtitleStyle}>
          {phase === 'saved'
            ? 'Done.'
            : 'Pulled from the family calendar for this trip. Uncheck anything you don’t want. Nothing saves until you tap Add.'}
        </p>
      </header>

      {noMatch ? (
        <div
          style={{ padding: '8px 18px' }}
          data-testid={decodeFailed ? 'calendar-import-error' : 'calendar-import-nomatch'}
        >
          <Banner tone="warn" text={reason} />
          {canCreate && (
            <div style={{ marginTop: 18 }}>
              <p
                style={{
                  fontFamily: 'Fraunces, Georgia, serif',
                  fontSize: 14,
                  color: 'var(--muted)',
                  lineHeight: 1.4,
                  marginBottom: 12,
                }}
              >
                {events.length > 0
                  ? `Start a new trip for ${rangeLabel} and drop ${
                      events.length === 1 ? 'this event' : `these ${events.length} events`
                    } in to confirm.`
                  : `Start a new trip for ${rangeLabel}.`}
              </p>
              <button
                type="button"
                data-testid="calendar-import-create"
                className="btn-pill"
                disabled={creating}
                onClick={handleCreate}
                style={{ ...primaryBtn, minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <CalendarDays size={14} />
                {creating ? 'Creating…' : 'Create a trip from these dates'}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button
              type="button"
              onClick={onBack}
              className="btn-pill"
              style={canCreate ? undefined : primaryBtn}
            >
              {canCreate ? 'Not now' : 'Back'}
            </button>
          </div>
        </div>
      ) : phase === 'saved' ? (
        <div style={{ padding: '8px 18px' }} data-testid="calendar-import-saved">
          <Banner
            tone="ok"
            text={`Added ${savedCount} event${savedCount === 1 ? '' : 's'} to ${trip.title}.`}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" onClick={onBack} className="btn-pill" style={primaryBtn}>
              See the trip
            </button>
          </div>
        </div>
      ) : events.length === 0 ? (
        <div style={{ padding: '8px 18px' }} data-testid="calendar-import-empty">
          <Banner
            tone="info"
            text="Nothing to add — every event was filtered out (recurring, or too close to home)."
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" onClick={onBack} className="btn-pill" style={primaryBtn}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: '8px 14px 120px' }} data-testid="calendar-import-list">
            {events.map((ev, i) => (
              <label key={`${ev.title}-${ev.start}-${i}`} style={rowStyle} data-testid="calendar-event-row">
                <input
                  type="checkbox"
                  checked={!!checked[i]}
                  onChange={() => toggle(i)}
                  aria-label={`Include ${ev.title || 'event'}`}
                  style={{ width: 20, height: 20, marginTop: 2, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={eventTitleStyle}>{ev.title || 'Untitled event'}</div>
                  <div style={eventWhenStyle}>{formatEventWhen(ev)}</div>
                  {(ev.address || ev.location) && (
                    <div style={eventLocStyle}>
                      <MapPin size={11} style={{ marginRight: 4, verticalAlign: '-1px', opacity: 0.7 }} />
                      {ev.address || ev.location}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div style={barStyle}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--muted)' }}>
              {checkedCount} of {events.length} selected
            </span>
            <button
              type="button"
              data-testid="calendar-import-add"
              className="btn-pill"
              disabled={checkedCount === 0 || phase === 'saving'}
              onClick={handleConfirm}
              style={{
                ...primaryBtn,
                opacity: checkedCount === 0 ? 0.5 : 1,
                cursor: checkedCount === 0 ? 'not-allowed' : 'pointer',
                minHeight: 44,
              }}
            >
              {phase === 'saving'
                ? 'Adding…'
                : `Add ${checkedCount} event${checkedCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Banner({ tone, text }) {
  const color = tone === 'ok' ? 'var(--accent)' : tone === 'warn' ? '#B05E13' : 'var(--muted)'
  return (
    <div
      style={{
        padding: '10px 12px',
        border: `1px solid ${color}`,
        borderRadius: 8,
        color,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'Fraunces, Georgia, serif',
        fontStyle: 'italic',
        fontSize: 14,
      }}
    >
      {tone === 'warn' ? <AlertCircle size={14} /> : <Check size={14} />}
      {text}
    </div>
  )
}

const shellStyle = {
  background: 'var(--bg)',
  color: 'var(--text)',
  minHeight: '100vh',
  paddingBottom: 120,
}
const titleStyle = {
  fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
  fontSize: 32,
  fontWeight: 700,
  lineHeight: 1,
  letterSpacing: '-0.02em',
  color: 'var(--text)',
}
const subtitleStyle = {
  fontFamily: 'Fraunces, Georgia, serif',
  fontSize: 14,
  fontStyle: 'italic',
  color: 'var(--muted)',
  marginTop: 6,
}
const rowStyle = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
  padding: '12px 4px',
  borderBottom: '1px solid var(--border)',
  cursor: 'pointer',
}
const eventTitleStyle = {
  fontFamily: 'Fraunces, Georgia, serif',
  fontSize: 17,
  fontWeight: 700,
  color: 'var(--text)',
  lineHeight: 1.15,
}
const eventWhenStyle = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
  letterSpacing: '0.04em',
  color: 'var(--muted)',
  marginTop: 3,
}
const eventLocStyle = {
  fontFamily: 'Fraunces, Georgia, serif',
  fontStyle: 'italic',
  fontSize: 13,
  color: 'var(--muted)',
  marginTop: 2,
}
const barStyle = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 'calc(env(safe-area-inset-bottom) + 76px)',
  padding: '12px 18px',
  background: 'var(--bg)',
  borderTop: '1px solid var(--border)',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  zIndex: 51,
}
const primaryBtn = {
  background: 'var(--accent)',
  color: '#fff',
  border: '1px solid var(--accent)',
}
const backLinkStyle = {
  background: 'transparent',
  border: 0,
  padding: 0,
  cursor: 'pointer',
  color: 'var(--muted)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  opacity: 0.7,
  marginBottom: 18,
}
