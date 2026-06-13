// Claude-in-App M2 — confirmation cards. The generalized inline-in-chat
// card that renders every Claude-proposed change to trip data before it
// touches the trip. Lifts the Share-In `confirming` phase pattern out
// of ImportView and stretches it across four atomic actions:
//
//   add    — new stop, optional hero, editable fields
//   move   — single stop, fields render value + previousValue diff
//   cancel — destructive, requires extra confirm, oxblood framing
//   multi  — batched edits, per-row skip, "Save all N" / "Review each"
//
// Audit-fix is not a fifth card shape — it's a conversation pattern
// that lands at one of the four atomic shapes (see CLAUDE_IN_APP_DESIGN_SPEC).
//
// Visual source-of-truth is app/docs/design/claude-in-app/claude-cards.jsx
// — Helen's linen palette. Jonathan's dark-editorial skin lands in M6.
//
// No silent saves. Ever. The card never writes; it surfaces the change
// and hands the user-edited copy back via onSave, which the chat panel
// commits through tripsApi.upsertTrip.

import { useEffect, useState } from 'react'
import { TRAVELER_DOT } from '../data/travelers'
import { travelerNameToId, humanDateRange } from '../lib/createTripCard'
import { userFacingApplyError } from '../lib/claudeCardApply'
import { logUploadEvent } from '../lib/uploadLog'
import { isUnsynced, subscribe as subscribeUnsynced } from '../lib/tripSyncQueue'

// ─── Card-framing + draft-slip text tokens — UNIVERSAL / persona-invariant
// (interim) ──────────────────────────────────────────────────────────
// These do NOT cascade from body[data-theme]. The confirm card's OPAQUE
// cream surfaces (draftBg) hide the panel, so their text must be a fixed
// dark ink — per-persona light text would vanish on cream (the M6 hotfix).
// ink/inkMuted/inkFaint = universal "draft-slip" text; draft*/oxblood* =
// framing. Same basis: persona-invariant pending the skin redesign.
// (Transparent-tint surfaces — cancel/saved/superseded/error — keep their
// per-persona var(--…) text, which is correctly paired on the panel.)
const T = {
  // Universal draft-slip text — opaque-cream cards only
  ink: '#15201A',
  inkMuted: 'rgba(21,32,26,0.62)',
  inkFaint: 'rgba(21,32,26,0.32)',
  // Card-specific draft framing
  draftBg: '#F8F4E9',
  draftBorder: 'rgba(178,128,40,0.22)',
  draftEyebrow: '#8A6F2D',
  // Destructive
  oxblood: '#A33A2E',
  oxbloodBgSoft: 'rgba(163,58,46,0.06)',
  oxbloodBorderSoft: 'rgba(163,58,46,0.22)',
  oxbloodBgFill: 'rgba(163,58,46,0.08)',
}
const FONT = {
  serif: '"Fraunces", "Iowan Old Style", Georgia, serif',
  sans: '"Inter Tight", -apple-system, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
}

// ─── Icons (local, scoped) ────────────────────────────────────────────
function CheckIcon({ size = 12, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13 L10 18 L19 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function XIcon({ size = 12, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6 L18 18 M18 6 L6 18" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ─── Primitives ──────────────────────────────────────────────────────
function Eyebrow({ children, color, style }) {
  return (
    <div
      style={{
        fontFamily: FONT.mono,
        fontSize: 9,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        color: color || 'var(--muted)',
        fontWeight: 600,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// Editable field row — renders an inline input when editable, plain text
// otherwise. previousValue renders as strike-through "old → new" diff
// (used by move). All field changes flow back to onChange so the parent
// can build the user-edited payload for save.
function FieldRow({ field, onChange, last }) {
  const { name, label, value, previousValue, editable, readonly } = field
  const isEditable = editable !== false && !readonly
  return (
    <div
      style={{
        padding: '8px 0',
        borderBottom: last ? 'none' : `1px solid var(--border)`,
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
      }}
    >
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 9,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: T.inkFaint,
          width: 86,
          flexShrink: 0,
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {previousValue != null && previousValue !== value && (
          <span
            style={{
              fontFamily: FONT.sans,
              fontSize: 12,
              color: T.inkFaint,
              textDecoration: 'line-through',
              marginRight: 6,
            }}
          >
            {previousValue}
          </span>
        )}
        {isEditable ? (
          <input
            type="text"
            value={value ?? ''}
            onChange={(e) => onChange?.(name, e.target.value)}
            aria-label={label}
            style={{
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 600,
              color: T.ink,
              background: 'transparent',
              border: 'none',
              borderBottom: `1px dashed var(--border)`,
              padding: '2px 0',
              width: '100%',
              outline: 'none',
            }}
          />
        ) : (
          <span
            style={{
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: readonly ? 500 : 600,
              color: readonly ? T.inkMuted : T.ink,
            }}
          >
            {value}
          </span>
        )}
      </div>
    </div>
  )
}

function CardHeader({ tone, actionLabel, scopeLabel, onCream }) {
  const dotColor =
    tone === 'destructive'
      ? T.oxblood
      : tone === 'standby'
      ? '#7A3E91'
      : T.draftEyebrow
  const textColor = dotColor
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dotColor,
          }}
        />
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 9,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: textColor,
            fontWeight: 600,
          }}
        >
          {actionLabel}
        </span>
      </div>
      {scopeLabel && (
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 9,
            color: onCream ? T.inkFaint : 'var(--faint)',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {scopeLabel}
        </span>
      )}
    </div>
  )
}

function CardActions({ saveLabel, saveTone, onSave, onDiscard, disabled, secondary, onCream }) {
  const saveBg = saveTone === 'destructive' ? T.oxblood : 'var(--accent)'
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        data-testid="confirm-card-save"
        style={{
          flex: 2,
          height: 34,
          borderRadius: 10,
          border: 'none',
          cursor: disabled ? 'default' : 'pointer',
          background: disabled ? 'var(--border)' : saveBg,
          color: '#fff',
          fontFamily: FONT.sans,
          fontWeight: 600,
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {saveTone === 'destructive' ? <XIcon size={11} /> : <CheckIcon size={11} />}
        {saveLabel}
      </button>
      {secondary && (
        <button
          type="button"
          onClick={secondary.onClick}
          style={{
            flex: 1,
            height: 34,
            borderRadius: 10,
            cursor: 'pointer',
            background: 'transparent',
            color: onCream ? T.ink : 'var(--text)',
            border: `1px solid var(--border)`,
            fontFamily: FONT.sans,
            fontWeight: 500,
            fontSize: 12,
          }}
        >
          {secondary.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDiscard}
        aria-label="Discard draft"
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          cursor: 'pointer',
          background: 'transparent',
          color: onCream ? T.inkMuted : 'var(--muted)',
          border: `1px solid var(--border)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <XIcon size={12} />
      </button>
    </div>
  )
}

// ─── Card variants ────────────────────────────────────────────────────

function AddOrMoveCard({ card, draft, setDraftField, onSave, onDiscard, committing }) {
  const isMove = card.action === 'move'
  const tone = 'draft'
  const actionLabel = isMove ? 'Draft · move' : 'Draft · add'
  return (
    <div
      style={{
        background: T.draftBg,
        color: T.ink,
        border: `1px solid ${T.draftBorder}`,
        borderRadius: 14,
        padding: 12,
        marginBottom: 14,
      }}
      data-testid={`confirm-card-${card.action}`}
    >
      <CardHeader tone={tone} actionLabel={actionLabel} scopeLabel={card.eyebrow} onCream={true} />
      {card.title && (
        <div
          style={{
            fontFamily: FONT.serif,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: -0.2,
            marginBottom: 8,
          }}
        >
          {card.title}
        </div>
      )}
      {Array.isArray(draft.fields) && draft.fields.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          {draft.fields.map((f, i) => (
            <FieldRow
              key={f.name || i}
              field={f}
              onChange={setDraftField}
              last={i === draft.fields.length - 1}
            />
          ))}
        </div>
      )}
      {card.note && (
        <div
          style={{
            marginTop: 10,
            padding: '6px 8px',
            borderRadius: 8,
            background: 'rgba(178,128,40,0.10)',
            color: T.draftEyebrow,
            fontFamily: FONT.serif,
            fontStyle: 'italic',
            fontSize: 11.5,
            lineHeight: 1.4,
          }}
        >
          {card.note}
        </div>
      )}
      <CardActions
        saveLabel={committing ? 'Saving…' : 'Save'}
        saveTone="draft"
        onCream={true}
        onSave={onSave}
        onDiscard={onDiscard}
        disabled={committing}
      />
    </div>
  )
}

// Trip-level settings edit (action "trip-settings"). Same draft visual
// language as AddOrMoveCard — header, title, editable field rows, optional
// note, Save/Discard — but framed as a trip-level change rather than a
// stop edit. Reuses CardHeader / FieldRow / CardActions so it stays in
// lockstep with the other cards' look.
function SettingsCard({ card, draft, setDraftField, onSave, onDiscard, committing }) {
  return (
    <div
      style={{
        background: T.draftBg,
        color: T.ink,
        border: `1px solid ${T.draftBorder}`,
        borderRadius: 14,
        padding: 12,
        marginBottom: 14,
      }}
      data-testid="confirm-card-trip-settings"
    >
      <CardHeader tone="draft" actionLabel="Draft · trip settings" scopeLabel={card.eyebrow} onCream={true} />
      {card.title && (
        <div
          style={{
            fontFamily: FONT.serif,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: -0.2,
            marginBottom: 8,
          }}
        >
          {card.title}
        </div>
      )}
      {Array.isArray(draft.fields) && draft.fields.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          {draft.fields.map((f, i) => (
            <FieldRow
              key={f.name || i}
              field={f}
              onChange={setDraftField}
              last={i === draft.fields.length - 1}
            />
          ))}
        </div>
      )}
      {card.note && (
        <div
          style={{
            marginTop: 10,
            padding: '6px 8px',
            borderRadius: 8,
            background: 'rgba(178,128,40,0.10)',
            color: T.draftEyebrow,
            fontFamily: FONT.serif,
            fontStyle: 'italic',
            fontSize: 11.5,
            lineHeight: 1.4,
          }}
        >
          {card.note}
        </div>
      )}
      <CardActions
        saveLabel={committing ? 'Saving…' : 'Save'}
        saveTone="draft"
        onCream={true}
        onSave={onSave}
        onDiscard={onDiscard}
        disabled={committing}
      />
    </div>
  )
}

function CancelCard({ card, onSave, onDiscard, committing }) {
  return (
    <div
      style={{
        background: T.oxbloodBgSoft,
        border: `1px solid ${T.oxbloodBorderSoft}`,
        borderRadius: 14,
        padding: 12,
        marginBottom: 14,
      }}
      data-testid="confirm-card-cancel"
    >
      <CardHeader tone="destructive" actionLabel="Draft · cancel" scopeLabel="Not saved" onCream={false} />
      <div
        style={{
          fontFamily: FONT.serif,
          fontSize: 17,
          fontWeight: 600,
          letterSpacing: -0.2,
          marginBottom: 4,
        }}
      >
        {card.title || 'Remove stop'}
      </div>
      {card.subtitle && (
        <div
          style={{
            fontFamily: FONT.serif,
            fontSize: 12.5,
            fontStyle: 'italic',
            color: 'var(--muted)',
            marginBottom: 10,
            lineHeight: 1.4,
            textDecoration: 'line-through',
            textDecorationColor: 'var(--faint)',
          }}
        >
          {card.subtitle}
        </div>
      )}
      {card.warning && (
        <div
          style={{
            padding: '6px 8px',
            borderRadius: 8,
            marginBottom: 10,
            background: T.oxbloodBgFill,
            color: T.oxblood,
            fontFamily: FONT.serif,
            fontStyle: 'italic',
            fontSize: 11.5,
            lineHeight: 1.35,
          }}
        >
          {card.warning}
        </div>
      )}
      <CardActions
        saveLabel={committing ? 'Removing…' : 'Cancel stop'}
        saveTone="destructive"
        onCream={false}
        onSave={onSave}
        onDiscard={onDiscard}
        secondary={{ label: 'Keep it', onClick: onDiscard }}
        disabled={committing}
      />
    </div>
  )
}

function MultiEditCard({ card, draft, setDraftEdits, onSave, onDiscard, committing }) {
  const edits = Array.isArray(draft.edits) ? draft.edits : []
  const liveCount = edits.filter((e) => !e.skipped).length
  function toggleSkip(i) {
    setDraftEdits(
      edits.map((e, idx) => (idx === i ? { ...e, skipped: !e.skipped } : e))
    )
  }
  return (
    <div
      style={{
        background: T.draftBg,
        color: T.ink,
        border: `1px solid ${T.draftBorder}`,
        borderRadius: 14,
        padding: 12,
        marginBottom: 14,
      }}
      data-testid="confirm-card-multi"
    >
      <CardHeader
        tone="draft"
        actionLabel={`Draft · ${liveCount} edit${liveCount === 1 ? '' : 's'} batched`}
        scopeLabel={card.eyebrow}
        onCream={true}
      />
      {edits.map((e, i) => {
        const tagColor = e.action === 'cancel' ? T.oxblood : T.draftEyebrow
        const tagLabel = e.action === 'cancel' ? 'CUT' : (e.action || 'EDIT').toUpperCase()
        return (
          <div
            key={i}
            style={{
              padding: '8px 10px',
              borderBottom: i < edits.length - 1 ? `1px solid var(--border)` : 'none',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              opacity: e.skipped ? 0.45 : 1,
            }}
          >
            <span
              style={{
                fontFamily: FONT.mono,
                fontSize: 9,
                letterSpacing: 1.2,
                color: tagColor,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(0,0,0,0.04)',
                marginTop: 2,
                flexShrink: 0,
              }}
            >
              {tagLabel}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: FONT.serif,
                  fontSize: 13.5,
                  fontWeight: 600,
                  letterSpacing: -0.1,
                  textDecoration: e.skipped ? 'line-through' : 'none',
                }}
              >
                {e.title}
              </div>
              {e.from && e.to ? (
                <div
                  style={{
                    fontFamily: FONT.sans,
                    fontSize: 11.5,
                    color: T.inkMuted,
                    marginTop: 2,
                  }}
                >
                  <span style={{ textDecoration: 'line-through', color: T.inkFaint }}>
                    {e.from}
                  </span>
                  <span style={{ margin: '0 5px' }}>→</span>
                  <span style={{ color: T.ink, fontWeight: 600 }}>{e.to}</span>
                </div>
              ) : e.note ? (
                <div
                  style={{
                    fontFamily: FONT.serif,
                    fontSize: 11.5,
                    fontStyle: 'italic',
                    color: T.inkMuted,
                    marginTop: 2,
                    lineHeight: 1.4,
                  }}
                >
                  {e.note}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => toggleSkip(i)}
              style={{
                background: 'transparent',
                border: 'none',
                color: T.inkMuted,
                fontFamily: FONT.mono,
                fontSize: 9,
                letterSpacing: 1,
                textTransform: 'uppercase',
                cursor: 'pointer',
                padding: 4,
                flexShrink: 0,
              }}
            >
              {e.skipped ? 'Restore' : 'Skip'}
            </button>
          </div>
        )
      })}
      {card.note && (
        <div
          style={{
            marginTop: 10,
            padding: '6px 8px',
            borderRadius: 8,
            background: 'rgba(178,128,40,0.10)',
            color: T.draftEyebrow,
            fontFamily: FONT.serif,
            fontStyle: 'italic',
            fontSize: 11.5,
            lineHeight: 1.35,
          }}
        >
          {card.note}
        </div>
      )}
      <CardActions
        saveLabel={
          committing
            ? 'Saving…'
            : `Save ${liveCount === edits.length ? 'all ' : ''}${liveCount}`
        }
        saveTone="draft"
        onCream={true}
        onSave={onSave}
        onDiscard={onDiscard}
        disabled={liveCount === 0 || committing}
      />
    </div>
  )
}

// ─── create_trip card ────────────────────────────────────────────────
// A new card type (alongside add/move/cancel/multi) that drafts a whole
// trip on the trips-index surface. Scrollable preview: header, collapsible
// day sections, compact stop rows (time · name · who-dots · drive), each
// row tappable to reveal its description, each row Skip-able (same escape
// hatch as the multi card). Save writes Trip + Days + Stops to D1 via the
// create-trip handler in App.jsx. Skipped stops are dropped at map time
// (see lib/createTripCard.cardToTrip).

function ChevronDownIcon({ size = 12, color = 'currentColor', open = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s' }}
    >
      <path d="M5 9 L12 16 L19 9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WhoDots({ who, max = 4 }) {
  const ids = (Array.isArray(who) ? who : []).map(travelerNameToId).filter(Boolean)
  if (ids.length === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
      {ids.slice(0, max).map((id) => (
        <span
          key={id}
          title={id}
          style={{ width: 7, height: 7, borderRadius: '50%', background: TRAVELER_DOT[id] || T.inkFaint }}
        />
      ))}
    </span>
  )
}

function StopRow({ stop, dayIdx, stopIdx, open, onToggleOpen, onToggleSkip }) {
  const skipped = !!stop.skipped
  return (
    <div
      style={{
        borderBottom: `1px solid var(--border)`,
        opacity: skipped ? 0.4 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0' }}>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${stop.name}`}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 9.5,
              color: T.inkFaint,
              width: 52,
              flexShrink: 0,
              letterSpacing: 0.4,
            }}
          >
            {stop.time || '—'}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontFamily: FONT.serif,
                fontSize: 13.5,
                fontWeight: 600,
                letterSpacing: -0.1,
                color: T.ink,
                textDecoration: skipped ? 'line-through' : 'none',
              }}
            >
              {stop.name}
            </span>
            {stop.driveFromPrevious && (
              <span
                style={{
                  fontFamily: FONT.mono,
                  fontSize: 9,
                  color: T.inkFaint,
                  marginLeft: 6,
                }}
              >
                · {stop.driveFromPrevious}
              </span>
            )}
          </span>
          <WhoDots who={stop.who} />
        </button>
        <button
          type="button"
          onClick={onToggleSkip}
          style={{
            background: 'transparent',
            border: 'none',
            color: T.inkMuted,
            fontFamily: FONT.mono,
            fontSize: 9,
            letterSpacing: 1,
            textTransform: 'uppercase',
            cursor: 'pointer',
            padding: '2px 4px',
            flexShrink: 0,
          }}
        >
          {skipped ? 'Restore' : 'Skip'}
        </button>
      </div>
      {open && stop.description && (
        <div
          style={{
            padding: '0 0 10px 60px',
            fontFamily: FONT.serif,
            fontSize: 12,
            fontStyle: 'italic',
            lineHeight: 1.45,
            color: T.inkMuted,
          }}
        >
          {stop.description}
          {stop.address && (
            <div
              style={{
                fontFamily: FONT.mono,
                fontStyle: 'normal',
                fontSize: 9.5,
                color: T.inkFaint,
                marginTop: 4,
                letterSpacing: 0.3,
              }}
            >
              {stop.address}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CreateTripCard({ card, draft, setDraft, onSave, onDiscard, committing }) {
  const trip = card.trip || {}
  const days = Array.isArray(draft.tripDays) ? draft.tripDays : []
  const [collapsedDays, setCollapsedDays] = useState(() => new Set())
  const [openStops, setOpenStops] = useState(() => new Set())

  const liveCount = days.reduce(
    (n, d) => n + (d.stops || []).filter((s) => !s.skipped).length,
    0
  )

  function toggleDay(di) {
    setCollapsedDays((prev) => {
      const next = new Set(prev)
      if (next.has(di)) next.delete(di)
      else next.add(di)
      return next
    })
  }
  function toggleStopOpen(key) {
    setOpenStops((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function toggleSkip(di, si) {
    setDraft((prev) => ({
      ...prev,
      tripDays: prev.tripDays.map((d, i) =>
        i === di
          ? { ...d, stops: d.stops.map((s, j) => (j === si ? { ...s, skipped: !s.skipped } : s)) }
          : d
      ),
    }))
  }

  const dateLabel =
    trip.dateRange || humanDateRange(trip.dateRangeStart, trip.dateRangeEnd)

  return (
    <div
      style={{
        background: T.draftBg,
        color: T.ink,
        border: `1px solid ${T.draftBorder}`,
        borderRadius: 14,
        padding: 12,
        marginBottom: 14,
      }}
      data-testid="confirm-card-create_trip"
    >
      <CardHeader tone="draft" actionLabel="Draft · new trip" scopeLabel={dateLabel} onCream={true} />

      {/* Header block */}
      <div
        style={{
          fontFamily: FONT.serif,
          fontSize: 19,
          fontWeight: 700,
          letterSpacing: -0.3,
          lineHeight: 1.1,
          color: T.ink,
        }}
      >
        {trip.title || 'New trip'}
      </div>
      {trip.subtitle && (
        <div
          style={{
            fontFamily: FONT.serif,
            fontStyle: 'italic',
            fontSize: 12.5,
            color: T.inkMuted,
            marginTop: 3,
            lineHeight: 1.4,
          }}
        >
          {trip.subtitle}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        {(trip.startCity || trip.endCity) && (
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 9,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: T.inkFaint,
            }}
          >
            {trip.startCity === trip.endCity || !trip.endCity
              ? trip.startCity
              : `${trip.startCity} → ${trip.endCity}`}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <WhoDots who={trip.travelers} />
        </span>
      </div>

      {/* Scrollable day sections */}
      <div
        style={{
          marginTop: 10,
          maxHeight: 360,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          borderTop: `1px solid var(--border)`,
        }}
      >
        {days.map((d, di) => {
          const collapsed = collapsedDays.has(di)
          const dayLive = (d.stops || []).filter((s) => !s.skipped).length
          return (
            <div key={di} style={{ paddingTop: 8 }}>
              <button
                type="button"
                onClick={() => toggleDay(di)}
                aria-expanded={!collapsed}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '2px 0 6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: T.draftEyebrow,
                }}
              >
                <ChevronDownIcon size={11} color={T.draftEyebrow} open={!collapsed} />
                <span
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 9,
                    letterSpacing: 1.4,
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  Day {d.dayNumber ?? di + 1}
                </span>
                <span
                  style={{
                    fontFamily: FONT.serif,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: T.ink,
                    letterSpacing: -0.1,
                  }}
                >
                  {d.title || ''}
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontFamily: FONT.mono,
                    fontSize: 9,
                    color: T.inkFaint,
                  }}
                >
                  {dayLive} stop{dayLive === 1 ? '' : 's'}
                </span>
              </button>
              {!collapsed &&
                (d.stops || []).map((s, si) => {
                  const key = `${di}:${si}`
                  return (
                    <StopRow
                      key={s.id || key}
                      stop={s}
                      dayIdx={di}
                      stopIdx={si}
                      open={openStops.has(key)}
                      onToggleOpen={() => toggleStopOpen(key)}
                      onToggleSkip={() => toggleSkip(di, si)}
                    />
                  )
                })}
            </div>
          )
        })}
      </div>

      <CardActions
        saveLabel={committing ? 'Saving…' : `Save trip · ${liveCount} stop${liveCount === 1 ? '' : 's'}`}
        saveTone="draft"
        onCream={true}
        onSave={onSave}
        onDiscard={onDiscard}
        disabled={liveCount === 0 || committing}
      />
    </div>
  )
}

// ─── ConfirmCard (top-level export) ──────────────────────────────────
//
// Props:
//   card        — the parsed card JSON (see contract at top of file)
//   onSave(d)   — async; called with the user-edited draft when the user
//                 taps Save. May throw / reject to surface an error state.
//   onDiscard() — called when the user dismisses the draft.
//
// State:
//   draft       — local mutation buffer; reflects user edits to fields/edits
//                 before they commit. Reset whenever a fresh card comes in.
//   commit      — idle | committing | saved | discarded | error
export function ConfirmCard({ card, onSave, onDiscard, initialPhase = 'idle', superseded = false }) {
  const [draft, setDraft] = useState(() => seedDraft(card))
  const [commit, setCommit] = useState({ phase: initialPhase, error: null })

  // Whether THIS card's trip currently has an edit that hasn't reached the
  // family yet (lib/tripSyncQueue, keyed by trip id). Drives the honest
  // saved-note: "syncing to the family" while unsynced, "Saved ✓" once the
  // self-heal lands. Read live (subscribed) so it's correct even when the
  // saved note is reconstructed from `initialPhase` after a re-render — and so
  // it flips to "Saved ✓" on its own the moment the background resync succeeds.
  const tripId = card?.target?.tripId || card?.trip?.id || null
  const [tripUnsynced, setTripUnsynced] = useState(() => (tripId ? isUnsynced(tripId) : false))
  useEffect(() => {
    if (!tripId) return undefined
    const update = () => setTripUnsynced(isUnsynced(tripId))
    update()
    return subscribeUnsynced(update)
  }, [tripId])

  // Re-seed when a different card arrives (e.g., new stream completes).
  // Use card.id as the identity. Cards without ids re-seed on every render
  // of a new object; that's fine, they're transient.
  const [seedKey, setSeedKey] = useState(card?.id || '')
  if ((card?.id || '') !== seedKey) {
    setSeedKey(card?.id || '')
    setDraft(seedDraft(card))
    setCommit({ phase: 'idle', error: null })
  }

  function setDraftField(name, value) {
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f) => (f.name === name ? { ...f, value } : f)),
    }))
  }
  function setDraftEdits(edits) {
    setDraft((d) => ({ ...d, edits }))
  }
  async function handleSave() {
    if (commit.phase === 'committing') return
    setCommit({ phase: 'committing', error: null })
    try {
      await onSave?.(applyDraft(card, draft))
      setCommit({ phase: 'saved', error: null })
    } catch (err) {
      // Plain-language only: the reader never sees a raw apply error
      // (internal message, code, or stack). The raw detail is preserved
      // for devs on the upload-log trace surface. Mirrors the streaming
      // path's userFacingClaudeError.
      try {
        logUploadEvent({
          code: 'claude_card_apply',
          outcome: 'surfaced',
          message: err?.message || String(err),
          stack: err?.stack || null,
          context: { action: card?.action || card?.type || null, cardId: card?.id || null },
        })
      } catch {
        // Never let logging break the error path.
      }
      setCommit({ phase: 'error', error: userFacingApplyError(err) })
    }
  }
  function handleDiscard() {
    setCommit({ phase: 'discarded', error: null })
    onDiscard?.()
  }

  if (!card || typeof card !== 'object') return null

  // Post-action states — small inline confirmations that take the
  // card's place once it's been committed or dismissed. Quiet on
  // purpose; the chat surface carries the conversational reply.
  if (commit.phase === 'saved') {
    if (card.type === 'create_trip') {
      return <CardSavedNote action="create_trip" title={card.trip?.title} synced={!tripUnsynced} />
    }
    return <CardSavedNote action={card.action} title={card.title} synced={!tripUnsynced} />
  }
  if (commit.phase === 'discarded') {
    return null
  }

  // A create_trip draft that's been refined: a newer create_trip card
  // exists below in the thread. Collapse this one to a quiet note so
  // Helen doesn't save a stale version. Only applies pre-save — once
  // saved we already returned the saved note above.
  if (superseded && card.type === 'create_trip') {
    return <StaleTripNote title={card.trip?.title} />
  }

  const isCommitting = commit.phase === 'committing'

  // create_trip is keyed off `type`, not `action` — it's a different
  // surface (drafting a whole trip on the index, not editing the open
  // one). Handle it before the action switch.
  if (card.type === 'create_trip') {
    return (
      <>
        <CreateTripCard
          card={card}
          draft={draft}
          setDraft={setDraft}
          onSave={handleSave}
          onDiscard={handleDiscard}
          committing={isCommitting}
        />
        {commit.error && <CardErrorNote message={commit.error} />}
      </>
    )
  }

  switch (card.action) {
    case 'add':
    case 'move':
      return (
        <>
          <AddOrMoveCard
            card={card}
            draft={draft}
            setDraftField={setDraftField}
            onSave={handleSave}
            onDiscard={handleDiscard}
            committing={isCommitting}
          />
          {commit.error && <CardErrorNote message={commit.error} />}
        </>
      )
    case 'cancel':
      return (
        <>
          <CancelCard
            card={card}
            onSave={handleSave}
            onDiscard={handleDiscard}
            committing={isCommitting}
          />
          {commit.error && <CardErrorNote message={commit.error} />}
        </>
      )
    case 'multi':
      return (
        <>
          <MultiEditCard
            card={card}
            draft={draft}
            setDraftEdits={setDraftEdits}
            onSave={handleSave}
            onDiscard={handleDiscard}
            committing={isCommitting}
          />
          {commit.error && <CardErrorNote message={commit.error} />}
        </>
      )
    case 'trip-settings':
      return (
        <>
          <SettingsCard
            card={card}
            draft={draft}
            setDraftField={setDraftField}
            onSave={handleSave}
            onDiscard={handleDiscard}
            committing={isCommitting}
          />
          {commit.error && <CardErrorNote message={commit.error} />}
        </>
      )
    default:
      return null
  }
}

function CardSavedNote({ action, title, synced = true }) {
  const verb =
    action === 'cancel'
      ? 'Removed'
      : action === 'move'
      ? 'Moved'
      : action === 'multi'
      ? 'Saved'
      : action === 'create_trip'
      ? 'Created'
      : action === 'trip-settings'
      ? 'Updated'
      : 'Added'

  // Honest not-yet-synced state. The change IS saved on this device, but the
  // push to the family hasn't landed — so we never show the plain "Saved ✓"
  // green check (that would promise the family has it when they don't, G6).
  // Resync keeps retrying in the background (reopen / network back / interval),
  // so this is calm reassurance, not an error.
  if (!synced) {
    return (
      <div
        data-testid="confirm-card-saved-unsynced"
        style={{
          marginBottom: 14,
          padding: '8px 12px',
          borderRadius: 10,
          background: 'rgba(178,128,40,0.08)',
          border: `1px solid ${T.draftBorder}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: T.draftEyebrow, flexShrink: 0 }} />
        <span style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--text)', fontWeight: 600 }}>
          Saved on your phone
        </span>
        {title && (
          <span style={{ fontFamily: FONT.serif, fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{title}</span>
        )}
        <span style={{ flexBasis: '100%', fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>
          Syncing to the family — we&rsquo;ll keep trying until it reaches them.
        </span>
      </div>
    )
  }
  return (
    <div
      data-testid="confirm-card-saved"
      style={{
        marginBottom: 14,
        padding: '8px 12px',
        borderRadius: 10,
        background: 'rgba(46,93,58,0.06)',
        border: `1px solid rgba(46,93,58,0.22)`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <CheckIcon size={12} color={'var(--accent)'} />
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: 9,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: 'var(--accent)',
          fontWeight: 600,
        }}
      >
        {verb}
      </span>
      {title && (
        <span
          style={{
            fontFamily: FONT.serif,
            fontSize: 13,
            color: 'var(--text)',
            fontWeight: 500,
          }}
        >
          {title}
        </span>
      )}
    </div>
  )
}

function StaleTripNote({ title }) {
  return (
    <div
      data-testid="confirm-card-superseded"
      style={{
        marginBottom: 14,
        padding: '8px 12px',
        borderRadius: 10,
        background: 'rgba(21,32,26,0.04)',
        border: `1px solid var(--border)`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: 9,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: 'var(--faint)',
          fontWeight: 600,
        }}
      >
        Draft replaced
      </span>
      {title && (
        <span
          style={{
            fontFamily: FONT.serif,
            fontStyle: 'italic',
            fontSize: 12.5,
            color: 'var(--muted)',
          }}
        >
          {title} — see the updated version below.
        </span>
      )}
    </div>
  )
}

// `message` is ALWAYS a pre-wrapped, reader-facing string — handleSave
// runs every caught apply error through userFacingApplyError before it
// reaches commit.error, so a raw internal message / code / stack can
// never land here. Render it verbatim.
function CardErrorNote({ message }) {
  return (
    <div
      data-testid="confirm-card-error"
      style={{
        margin: '0 0 14px',
        padding: '8px 12px',
        borderRadius: 10,
        background: T.oxbloodBgSoft,
        border: `1px solid ${T.oxbloodBorderSoft}`,
        fontFamily: FONT.serif,
        fontSize: 13,
        color: 'var(--text)',
        lineHeight: 1.4,
      }}
    >
      {message}
    </div>
  )
}

// ─── Draft helpers ────────────────────────────────────────────────────

function seedDraft(card) {
  if (!card || typeof card !== 'object') return { fields: [], edits: [] }
  if (card.type === 'create_trip') {
    const tripDays = (card.trip?.days || []).map((d) => ({
      ...d,
      stops: (d.stops || []).map((s) => ({ ...s, skipped: false })),
    }))
    return { fields: [], edits: [], tripDays }
  }
  const fields = Array.isArray(card.fields)
    ? card.fields.map((f) => ({
        name: f.name,
        label: f.label,
        value: f.value,
        previousValue: f.previousValue ?? null,
        editable: f.editable !== false,
        readonly: !!f.readonly,
      }))
    : []
  const edits = Array.isArray(card.edits)
    ? card.edits.map((e) => ({ ...e, skipped: false }))
    : []
  return { fields, edits }
}

function applyDraft(card, draft) {
  // create_trip: fold the per-stop skip flags back onto the trip block
  // so the save handler (cardToTrip) can drop skipped stops.
  if (card.type === 'create_trip') {
    return {
      ...card,
      trip: { ...card.trip, days: draft.tripDays },
    }
  }
  // Merge user edits back into the card payload that gets handed to the
  // commit path. Keep the action + target + ids intact; replace fields/
  // edits with the live values.
  return {
    ...card,
    fields: draft.fields,
    edits: draft.edits,
  }
}
