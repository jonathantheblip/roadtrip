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

import { useState } from 'react'

// ─── Tokens — Helen's linen palette (duplicated from ClaudeChat.jsx) ──
// Kept local rather than DRY'd so this file is a self-contained M2 unit.
const T = {
  bg: '#F2EFE7',
  surface: '#FFFFFF',
  surfaceAlt: '#E6E1D2',
  ink: '#15201A',
  inkMuted: 'rgba(21,32,26,0.62)',
  inkFaint: 'rgba(21,32,26,0.32)',
  accent: '#2E5D3A',
  accentInk: '#FFFFFF',
  hairline: 'rgba(21,32,26,0.13)',
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
        color: color || T.inkMuted,
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
        borderBottom: last ? 'none' : `1px solid ${T.hairline}`,
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
              borderBottom: `1px dashed ${T.hairline}`,
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

function CardHeader({ tone, actionLabel, scopeLabel }) {
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
            color: T.inkFaint,
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

function CardActions({ saveLabel, saveTone, onSave, onDiscard, disabled, secondary }) {
  const saveBg = saveTone === 'destructive' ? T.oxblood : T.accent
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        style={{
          flex: 2,
          height: 34,
          borderRadius: 10,
          border: 'none',
          cursor: disabled ? 'default' : 'pointer',
          background: disabled ? T.hairline : saveBg,
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
            color: T.ink,
            border: `1px solid ${T.hairline}`,
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
          color: T.inkMuted,
          border: `1px solid ${T.hairline}`,
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
        border: `1px solid ${T.draftBorder}`,
        borderRadius: 14,
        padding: 12,
        marginBottom: 14,
      }}
      data-testid={`confirm-card-${card.action}`}
    >
      <CardHeader tone={tone} actionLabel={actionLabel} scopeLabel={card.eyebrow} />
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
      <CardHeader tone="destructive" actionLabel="Draft · cancel" scopeLabel="Not saved" />
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
            color: T.inkMuted,
            marginBottom: 10,
            lineHeight: 1.4,
            textDecoration: 'line-through',
            textDecorationColor: T.inkFaint,
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
      />
      {edits.map((e, i) => {
        const tagColor = e.action === 'cancel' ? T.oxblood : T.draftEyebrow
        const tagLabel = e.action === 'cancel' ? 'CUT' : (e.action || 'EDIT').toUpperCase()
        return (
          <div
            key={i}
            style={{
              padding: '8px 10px',
              borderBottom: i < edits.length - 1 ? `1px solid ${T.hairline}` : 'none',
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
export function ConfirmCard({ card, onSave, onDiscard, initialPhase = 'idle' }) {
  const [draft, setDraft] = useState(() => seedDraft(card))
  const [commit, setCommit] = useState({ phase: initialPhase, error: null })

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
      setCommit({ phase: 'error', error: err?.message || 'Could not save.' })
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
    return <CardSavedNote action={card.action} title={card.title} />
  }
  if (commit.phase === 'discarded') {
    return null
  }

  const isCommitting = commit.phase === 'committing'

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
    default:
      return null
  }
}

function CardSavedNote({ action, title }) {
  const verb =
    action === 'cancel'
      ? 'Removed'
      : action === 'move'
      ? 'Moved'
      : action === 'multi'
      ? 'Saved'
      : 'Added'
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
      <CheckIcon size={12} color={T.accent} />
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: 9,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: T.accent,
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
            color: T.ink,
            fontWeight: 500,
          }}
        >
          {title}
        </span>
      )}
    </div>
  )
}

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
        color: T.ink,
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
  // Merge user edits back into the card payload that gets handed to the
  // commit path. Keep the action + target + ids intact; replace fields/
  // edits with the live values.
  return {
    ...card,
    fields: draft.fields,
    edits: draft.edits,
  }
}
