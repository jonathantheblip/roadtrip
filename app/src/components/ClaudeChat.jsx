// Claude-in-App M1 — chat surface. One file holds every visual primitive
// (icons, lockup, bubbles, composer) and the panel itself. The Design
// v2 JSX (app/docs/design/claude-in-app/) references components by
// name without defining them; this file is where they become real.
//
// Styling: inline styles only, matching the conventions of the design
// JSX. Helen's linen palette is the M1 default for everyone — Jonathan's
// dark-editorial skin lands in M6. Tokens mirror system.jsx →
// TRAVELERS.helen.theme so any future port back into the design file is
// a copy-paste.
//
// Surface architecture: ClaudeChatPanel is a full-height bottom sheet
// pinned to the bottom inset. The drag handle is decorative in M1 (no
// drag-to-dismiss yet); X closes. List view of past conversations is
// the panel's first screen when history exists; otherwise we drop
// straight into a fresh conversation with the empty-state hint.

import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeExternalLinks from 'rehype-external-links'
import {
  streamClaudeChat,
  listConversations,
  getConversationMessages,
  newConversationId,
  isClaudeChatConfigured,
} from '../lib/claudeChat'
import { ConfirmCard } from './ConfirmCard'

// Markdown pipeline: remark-gfm gives us tables, strikethrough,
// task lists, autolinks; remark-breaks preserves the single-newline
// → <br> behavior that the previous marked config relied on;
// rehype-external-links rewrites every rendered <a> to carry
// target=_blank rel=noopener noreferrer (parity with the prior
// DOMPurify post-process). react-markdown sanitizes by default.
const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkBreaks]
const MARKDOWN_REHYPE_PLUGINS = [
  [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
]

// ─── Tokens — Helen's linen palette ───────────────────────────────────
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
}
const FONT = {
  serif: '"Fraunces", "Iowan Old Style", Georgia, serif',
  sans: '"Inter Tight", -apple-system, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
}

// ─── Icons ────────────────────────────────────────────────────────────
// The Claude mark is rendered as a small dot + asterisk-like glyph,
// matching the lockup in the design files where it appears as
// `<ClaudeMark size={...} />`. We use a simple SVG abstraction so the
// icon scales cleanly inside both the entry button and message bubbles.
export function ClaudeMark({ size = 16, color = T.accent }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" fill={color} opacity="0.18" />
      <path
        d="M12 5 L13.2 10.8 L19 12 L13.2 13.2 L12 19 L10.8 13.2 L5 12 L10.8 10.8 Z"
        fill={color}
      />
    </svg>
  )
}

function XIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6 L18 18 M18 6 L6 18" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function SendIcon({ size = 16, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12 L20 4 L13 20 L11 13 L4 12 Z"
        fill={color}
        stroke={color}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronRightIcon({ size = 12, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 5 L16 12 L9 19"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── ClaudeLockup ─────────────────────────────────────────────────────
export function ClaudeLockup({ size = 14, color = T.ink, accent = T.accent }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
        fontFamily: FONT.serif,
        fontSize: size + 6,
        fontWeight: 600,
        letterSpacing: -0.2,
        color,
      }}
    >
      Claude
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: accent,
          display: 'inline-block',
          transform: 'translateY(-2px)',
        }}
      />
    </span>
  )
}

// ─── ClaudeEntryButton ────────────────────────────────────────────────
// Two visual variants share one shape. `floating` sets a soft drop
// shadow + fixed positioning class for the trips index. The default is
// an in-header circular icon. `badge` is the M1-but-not-yet-rendered
// notification count; the prop exists so M5 can light it up.
export function ClaudeEntryButton({
  onClick,
  floating = false,
  badge = 0,
  label = 'Open Claude',
}) {
  const size = floating ? 52 : 34
  const shadow = floating
    ? '0 12px 28px rgba(21,32,26,0.22), 0 2px 6px rgba(21,32,26,0.12)'
    : 'none'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: size,
        background: floating ? T.surface : 'rgba(46,93,58,0.10)',
        border: floating ? `1px solid ${T.hairline}` : 'none',
        cursor: 'pointer',
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: shadow,
        color: T.accent,
        flexShrink: 0,
      }}
    >
      <ClaudeMark size={floating ? 26 : 18} />
      {badge > 0 && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 8,
            background: T.accent,
            color: T.accentInk,
            fontFamily: FONT.mono,
            fontSize: 9,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1.5px solid ${T.surface}`,
            letterSpacing: 0.4,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

// ─── Bubbles ──────────────────────────────────────────────────────────
function UserBubble({ children }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: 14,
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: 16,
          borderTopRightRadius: 4,
          background: T.ink,
          color: T.bg,
          fontFamily: FONT.sans,
          fontSize: 14.5,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {children}
      </div>
    </div>
  )
}

// Helen-themed CSS for the markdown render. Scoped to `.claude-md` so
// nothing leaks. We use a real stylesheet (injected once at module
// load) instead of inline styles because react-markdown emits a React
// tree we don't decorate per-element without custom component overrides
// (M2 territory). Tokens map 1:1 to the linen palette + Fraunces.
const CLAUDE_MD_CSS = `
.claude-md > *:first-child { margin-top: 0; }
.claude-md > *:last-child  { margin-bottom: 0 !important; }
.claude-md p { margin: 0 0 10px; }
.claude-md strong {
  font-weight: 700;
  font-style: normal;
  color: ${T.ink};
}
.claude-md em { font-style: italic; font-weight: 500; }
.claude-md a {
  color: ${T.accent};
  text-decoration: underline;
  text-underline-offset: 2px;
}
.claude-md code {
  font-family: ${FONT.mono};
  font-size: 0.86em;
  font-style: normal;
  background: ${T.surfaceAlt};
  padding: 1px 5px;
  border-radius: 4px;
}
.claude-md pre {
  background: ${T.surface};
  border: 1px solid ${T.hairline};
  border-radius: 8px;
  padding: 10px 12px;
  margin: 8px 0 12px;
  overflow-x: auto;
  font-size: 13px;
  font-style: normal;
  line-height: 1.45;
}
.claude-md pre code {
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-size: 13px;
}
.claude-md ul, .claude-md ol {
  margin: 4px 0 10px;
  padding-left: 22px;
}
.claude-md ul { list-style-type: disc; }
.claude-md ol { list-style-type: decimal; }
.claude-md li { margin: 2px 0; line-height: 1.5; }
.claude-md ul ul, .claude-md ul ol,
.claude-md ol ul, .claude-md ol ol {
  margin-top: 2px;
  margin-bottom: 4px;
}
.claude-md h1, .claude-md h2 {
  font-family: ${FONT.serif};
  font-style: normal;
  font-weight: 700;
  font-size: 18px;
  line-height: 1.2;
  letter-spacing: -0.3px;
  color: ${T.ink};
  margin: 14px 0 6px;
}
.claude-md h3 {
  font-family: ${FONT.serif};
  font-style: normal;
  font-weight: 700;
  font-size: 16px;
  line-height: 1.25;
  letter-spacing: -0.2px;
  color: ${T.ink};
  margin: 12px 0 4px;
}
.claude-md h4, .claude-md h5, .claude-md h6 {
  font-family: ${FONT.sans};
  font-style: normal;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: ${T.inkMuted};
  margin: 10px 0 4px;
}
.claude-md blockquote {
  margin: 8px 0;
  padding: 4px 0 4px 12px;
  border-left: 2px solid ${T.hairline};
  color: ${T.inkMuted};
}
.claude-md hr {
  border: none;
  height: 1px;
  background: ${T.hairline};
  margin: 14px 0;
}
.claude-md table {
  border-collapse: collapse;
  font-size: 13px;
  font-style: normal;
  font-family: ${FONT.sans};
  color: ${T.ink};
  margin: 8px 0;
}
.claude-md th, .claude-md td {
  padding: 4px 8px;
  border-bottom: 1px solid ${T.hairline};
  text-align: left;
}
.claude-md th { font-weight: 600; }
.claude-md del { color: ${T.inkFaint}; }
`

// Inject the CSS once at module load. Idempotent — guards against
// duplicate injection across HMR refreshes.
if (typeof document !== 'undefined' && !document.getElementById('claude-md-styles')) {
  const styleEl = document.createElement('style')
  styleEl.id = 'claude-md-styles'
  styleEl.textContent = CLAUDE_MD_CSS
  document.head.appendChild(styleEl)
}

// ─── Card-block markdown override ─────────────────────────────────────
// Detect fenced ```card blocks inside the streamed reply and render
// them as inline ConfirmCard components. The text content of the block
// is a JSON payload matching the contract documented at the top of
// ConfirmCard.jsx. During streaming the JSON may be incomplete — the
// override falls back to a "Drafting card…" placeholder until the
// closing fence arrives and JSON.parse succeeds.
function CardDraftingPlaceholder() {
  return (
    <div
      data-testid="confirm-card-drafting"
      style={{
        margin: '0 0 14px',
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(178,128,40,0.05)',
        border: `1px dashed rgba(178,128,40,0.30)`,
        fontFamily: FONT.mono,
        fontSize: 10,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        color: 'rgba(138,111,45,0.85)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#8A6F2D',
          animation: 'rt-claude-caret 1s steps(2) infinite',
        }}
      />
      Drafting card…
    </div>
  )
}

function CardBlock({ raw, onCardSave, alreadySavedIds }) {
  let card = null
  try {
    card = JSON.parse(raw)
  } catch {
    return <CardDraftingPlaceholder />
  }
  if (!card || typeof card !== 'object') return null
  const initialPhase =
    card.id && alreadySavedIds && alreadySavedIds.has(card.id) ? 'saved' : 'idle'
  return (
    <ConfirmCard
      card={card}
      onSave={onCardSave}
      onDiscard={() => {}}
      initialPhase={initialPhase}
    />
  )
}

// Extract the raw text content of a hast code element. react-markdown 9
// passes the source AST via props.node; this walks its text children.
function extractCodeText(codeNode) {
  if (!codeNode || !Array.isArray(codeNode.children)) return ''
  return codeNode.children
    .filter((n) => n && n.type === 'text')
    .map((n) => n.value)
    .join('')
}

function classListFrom(node) {
  if (!node || !node.properties) return []
  const cn = node.properties.className
  if (Array.isArray(cn)) return cn.map(String)
  if (typeof cn === 'string') return [cn]
  return []
}

function markdownComponents({ onCardSave, alreadySavedIds }) {
  return {
    pre(props) {
      const node = props.node
      const codeChild = node?.children?.[0]
      if (
        codeChild &&
        codeChild.type === 'element' &&
        codeChild.tagName === 'code' &&
        classListFrom(codeChild).some((c) => /language-card/.test(c))
      ) {
        return (
          <CardBlock
            raw={extractCodeText(codeChild)}
            onCardSave={onCardSave}
            alreadySavedIds={alreadySavedIds}
          />
        )
      }
      // Default rendering — preserve existing pre/code styling.
      return <pre>{props.children}</pre>
    },
  }
}

function ClaudeBubble({ children, streaming = false, cardContext = null }) {
  // Strings render via react-markdown. Non-string children (the
  // error bubble path) skip markdown and render as-is.
  const isMarkdown = typeof children === 'string'
  // Stabilize the markdown components prop so ReactMarkdown doesn't
  // see a new components reference every parent render — that would
  // remount any custom components (i.e. ConfirmCard) and wipe their
  // local state. cardContext is itself memoized upstream.
  const mdComponents = useMemo(
    () => (cardContext ? markdownComponents(cardContext) : undefined),
    [cardContext]
  )
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        marginBottom: 14,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          flexShrink: 0,
          borderRadius: '50%',
          background: 'rgba(46,93,58,0.10)',
          color: T.accent,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 2,
        }}
      >
        <ClaudeMark size={14} />
      </div>
      <div
        className="claude-md"
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: FONT.serif,
          fontSize: 15,
          fontStyle: 'italic',
          color: T.ink,
          lineHeight: 1.55,
          wordBreak: 'break-word',
        }}
      >
        {isMarkdown ? (
          <ReactMarkdown
            remarkPlugins={MARKDOWN_REMARK_PLUGINS}
            rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
            components={mdComponents}
          >
            {children}
          </ReactMarkdown>
        ) : (
          children
        )}
        {streaming && (
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 6,
              height: 14,
              marginLeft: 3,
              background: T.accent,
              verticalAlign: 'text-bottom',
              animation: 'rt-claude-caret 1s steps(2) infinite',
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Composer ─────────────────────────────────────────────────────────
function ChatComposer({ disabled, onSend, placeholder = 'ask claude…' }) {
  const [text, setText] = useState('')
  const ref = useRef(null)

  function submit() {
    const value = text.trim()
    if (!value || disabled) return
    setText('')
    onSend(value)
  }
  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }
  useEffect(() => {
    // Auto-resize within bounds. Keeps the composer feeling like a
    // chat input rather than a fixed-height field.
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [text])

  return (
    <div
      style={{
        borderTop: `1px solid ${T.hairline}`,
        background: T.bg,
        padding: '10px 12px calc(12px + env(safe-area-inset-bottom))',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
      }}
    >
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={1}
        disabled={disabled}
        aria-label="Message Claude"
        style={{
          flex: 1,
          minHeight: 38,
          maxHeight: 140,
          resize: 'none',
          border: `1px solid ${T.hairline}`,
          borderRadius: 18,
          padding: '8px 14px',
          fontFamily: FONT.sans,
          fontSize: 15,
          lineHeight: 1.45,
          background: T.surface,
          color: T.ink,
          outline: 'none',
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !text.trim()}
        aria-label="Send message"
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          border: 'none',
          background: disabled || !text.trim() ? T.hairline : T.accent,
          color: '#fff',
          cursor: disabled || !text.trim() ? 'default' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <SendIcon />
      </button>
    </div>
  )
}

// ─── Past conversations list (M1.4) ───────────────────────────────────
function PastConversations({ items, onResume, onNew, loading }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '4px 0 12px' }}>
      <div
        style={{
          padding: '8px 18px',
          fontFamily: FONT.mono,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: T.inkMuted,
        }}
      >
        Past conversations
      </div>
      {loading && (
        <div
          style={{
            padding: '8px 18px',
            fontFamily: FONT.serif,
            fontSize: 13,
            fontStyle: 'italic',
            color: T.inkMuted,
          }}
        >
          Loading…
        </div>
      )}
      {!loading && items.length === 0 && (
        <div
          style={{
            padding: '8px 18px',
            fontFamily: FONT.serif,
            fontSize: 13,
            fontStyle: 'italic',
            color: T.inkMuted,
          }}
        >
          No conversations yet.
        </div>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onResume(c.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                borderBottom: `1px solid ${T.hairline}`,
                padding: '12px 18px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONT.serif,
                    fontSize: 14,
                    color: T.ink,
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {c.preview || '(empty conversation)'}
                </div>
                <div
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 9,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    color: T.inkFaint,
                    marginTop: 4,
                  }}
                >
                  {formatWhen(c.updated_at)}
                </div>
              </div>
              <ChevronRightIcon size={14} color={T.inkFaint} />
            </button>
          </li>
        ))}
      </ul>
      <div style={{ padding: '14px 18px 4px' }}>
        <button
          type="button"
          onClick={onNew}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 12,
            border: `1px solid ${T.hairline}`,
            background: T.surface,
            color: T.ink,
            cursor: 'pointer',
            fontFamily: FONT.sans,
            fontSize: 13.5,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <ClaudeMark size={14} /> New conversation
        </button>
      </div>
    </div>
  )
}

function formatWhen(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

// ─── ClaudeChatPanel ─────────────────────────────────────────────────
// `trip` and `onCardSave` plumb the M2 confirmation-card pipeline:
//   • `trip` is the active trip object (or null on the trips index) — used
//     to compute the set of card IDs whose proposed change already landed
//     in trip data, so re-opened conversations don't render their old
//     drafts as live again.
//   • `onCardSave(card)` is called when the user taps Save on an inline
//     confirmation card. The handler in App.jsx maps the card → next-trip
//     snapshot and commits through tripsApi.upsertTrip.
export function ClaudeChatPanel({
  open,
  onClose,
  userId,
  tripId = null,
  tripTitle = null,
  trip = null,
  onCardSave = null,
}) {
  const [phase, setPhase] = useState('loading') // loading | list | chat
  const [pastList, setPastList] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [streamingText, setStreamingText] = useState('')
  const [sending, setSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const messagesRef = useRef(null)

  // Session-scoped record of cardIds whose change has been committed
  // through this panel instance. Combined with claudeMeta.cardId stamps
  // from the trip itself, this is how cancelled cards (whose stop has
  // been *removed*, so no claudeMeta survives) still resolve to "saved"
  // after the upsertTrip re-renders the bubble. Lives in a ref because
  // mutating it must not retrigger render — the next computed
  // cardContext picks the new entries up via useMemo dep on a counter.
  const actionedIdsRef = useRef(new Set())
  const [actionedTick, setActionedTick] = useState(0)

  // Stable cardContext. Recomputes only when the inputs actually change.
  // Critical for keeping <ReactMarkdown components={...}> from forcing
  // a ConfirmCard re-mount on every parent render — a re-mount wipes
  // ConfirmCard's local commit phase and the saved-note never paints.
  const collectedTripIds = useMemo(() => collectSavedCardIds(trip), [trip])
  const cardContext = useMemo(() => {
    if (!open || !onCardSave) return null
    const alreadySavedIds = new Set([
      ...collectedTripIds,
      ...actionedIdsRef.current,
    ])
    const wrappedSave = async (card) => {
      const res = await onCardSave(card)
      if (card?.id) {
        actionedIdsRef.current.add(card.id)
        setActionedTick((t) => t + 1)
      }
      return res
    }
    return { onCardSave: wrappedSave, alreadySavedIds }
    // actionedTick re-runs this so the next render picks up the latest
    // actionedIdsRef. Don't trip on it directly inside the memo body —
    // it's the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onCardSave, collectedTripIds, actionedTick])

  // When the panel opens, decide which screen to land on. If past
  // conversations exist for this (user, trip), show the list. Else jump
  // straight into a fresh conversation. Reset on close so a re-open is
  // always clean.
  useEffect(() => {
    if (!open) {
      setPhase('loading')
      setPastList([])
      setConversationId(null)
      setMessages([])
      setStreamingText('')
      setSending(false)
      setErrorMsg(null)
      return
    }
    let cancelled = false
    async function init() {
      if (!isClaudeChatConfigured()) {
        if (!cancelled) {
          setPhase('chat')
          setConversationId(newConversationId())
          setMessages([])
        }
        return
      }
      try {
        const items = await listConversations({ userId, tripId })
        if (cancelled) return
        if (Array.isArray(items) && items.length > 0) {
          setPastList(items)
          setPhase('list')
        } else {
          setPastList([])
          setConversationId(newConversationId())
          setMessages([])
          setPhase('chat')
        }
      } catch {
        if (!cancelled) {
          setPastList([])
          setConversationId(newConversationId())
          setMessages([])
          setPhase('chat')
        }
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [open, userId, tripId])

  // Auto-scroll the messages container as content lands.
  useEffect(() => {
    if (phase !== 'chat') return
    const el = messagesRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [phase, messages, streamingText])

  async function resumeConversation(id) {
    setConversationId(id)
    setPhase('chat')
    setMessages([])
    setStreamingText('')
    try {
      const history = await getConversationMessages(id)
      setMessages(history)
    } catch {
      // Empty history is fine; chat surface will just be blank.
    }
  }

  function startNewConversation() {
    setConversationId(newConversationId())
    setMessages([])
    setStreamingText('')
    setPhase('chat')
  }

  async function handleSend(text) {
    if (!conversationId) return
    const userMsg = { role: 'user', content: text, created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])
    setStreamingText('')
    setSending(true)
    setErrorMsg(null)
    try {
      const { fullText } = await streamClaudeChat({
        conversationId,
        userId,
        tripId,
        message: text,
        onDelta: (chunk) => {
          setStreamingText((prev) => prev + chunk)
        },
      })
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: fullText, created_at: new Date().toISOString() },
      ])
      setStreamingText('')
    } catch (err) {
      setStreamingText('')
      setErrorMsg(userFacingClaudeError(err))
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return (
    <>
      <style>{`
        @keyframes rt-claude-caret { from { opacity: 1 } to { opacity: 0 } }
        .claude-md > *:last-child { margin-bottom: 0 !important; }
        .claude-md ul ul, .claude-md ul ol,
        .claude-md ol ul, .claude-md ol ol {
          margin-top: 2px !important;
          margin-bottom: 4px !important;
        }
      `}</style>
      {/* dim underlay */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(20,17,13,0.42)',
          zIndex: 100,
        }}
      />
      {/* panel */}
      <div
        role="dialog"
        aria-label="Chat with Claude"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          top: 'max(28px, env(safe-area-inset-top))',
          zIndex: 101,
          background: T.bg,
          color: T.ink,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -20px 60px rgba(20,17,13,0.32)',
        }}
      >
        {/* drag handle */}
        <div style={{ padding: '8px 0 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.hairline }} />
        </div>
        {/* header */}
        <div
          style={{
            padding: '8px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={phase === 'chat' && pastList.length > 0 ? () => setPhase('list') : null}
            disabled={!(phase === 'chat' && pastList.length > 0)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: phase === 'chat' && pastList.length > 0 ? 'pointer' : 'default',
            }}
            aria-label="Claude"
          >
            <ClaudeLockup />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {tripTitle && (
              <span
                style={{
                  fontFamily: FONT.mono,
                  fontSize: 10,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  color: T.inkMuted,
                  maxWidth: 160,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {tripTitle}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'transparent',
                border: 'none',
                color: T.inkMuted,
                cursor: 'pointer',
                padding: 4,
                display: 'inline-flex',
              }}
            >
              <XIcon size={14} />
            </button>
          </div>
        </div>
        <div style={{ height: 1, background: T.hairline, margin: '0 18px' }} />

        {phase === 'loading' && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT.serif,
              fontStyle: 'italic',
              color: T.inkMuted,
            }}
          >
            Loading…
          </div>
        )}

        {phase === 'list' && (
          <PastConversations
            items={pastList}
            loading={false}
            onResume={resumeConversation}
            onNew={startNewConversation}
          />
        )}

        {phase === 'chat' && (
          <>
            <div
              ref={messagesRef}
              data-testid="claude-messages"
              style={{ flex: 1, overflow: 'auto', padding: '14px 18px 8px' }}
            >
              {messages.length === 0 && !streamingText && !errorMsg && (
                <ClaudeFirstHint userId={userId} tripTitle={tripTitle} />
              )}
              {messages.map((m, i) => {
                if (m.role === 'user') {
                  return <UserBubble key={m.id || i}>{m.content}</UserBubble>
                }
                // Mode-transition cue — render the small "MODE · …" tag
                // above this bubble only if its mode differs from the
                // previous assistant turn's mode. Mode is derived purely
                // from whether the message carries a card-fenced block.
                const shift = computeModeShift(messages, i)
                return (
                  <div key={m.id || i}>
                    {shift && <ModeShiftCue toMode={shift} />}
                    <ClaudeBubble cardContext={cardContext}>
                      {m.content}
                    </ClaudeBubble>
                  </div>
                )
              })}
              {streamingText && (
                <ClaudeBubble streaming cardContext={cardContext}>
                  {streamingText}
                </ClaudeBubble>
              )}
              {errorMsg && <ErrorBubble message={errorMsg} />}
            </div>
            <ChatComposer
              disabled={sending}
              onSend={handleSend}
              placeholder={tripTitle ? `ask about ${tripTitle.toLowerCase()}…` : 'ask claude…'}
            />
          </>
        )}
      </div>
    </>
  )
}

function ClaudeFirstHint({ userId, tripTitle }) {
  const greet =
    userId && typeof userId === 'string'
      ? `Hi ${userId.charAt(0).toUpperCase() + userId.slice(1)}.`
      : 'Hi.'
  return (
    <div style={{ padding: '24px 0 12px' }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'rgba(46,93,58,0.10)',
          color: T.accent,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        }}
      >
        <ClaudeMark size={24} />
      </div>
      <div
        style={{
          fontFamily: FONT.serif,
          fontSize: 24,
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: -0.4,
        }}
      >
        {greet}
      </div>
      <div
        style={{
          fontFamily: FONT.serif,
          fontSize: 14.5,
          fontStyle: 'italic',
          color: T.inkMuted,
          marginTop: 8,
          lineHeight: 1.5,
        }}
      >
        {tripTitle
          ? `I have ${tripTitle} loaded. Ask me anything about it — pacing, timing, what to do.`
          : 'I can help you think through a trip — open one and ask me about it, or just talk it through.'}
      </div>
    </div>
  )
}

function ErrorBubble({ message }) {
  return (
    <div
      style={{
        margin: '6px 0 14px',
        padding: '10px 12px',
        borderRadius: 12,
        background: 'rgba(163,58,46,0.06)',
        border: '1px solid rgba(163,58,46,0.22)',
        fontFamily: FONT.serif,
        fontSize: 13.5,
        lineHeight: 1.5,
        color: T.ink,
      }}
    >
      {message}
    </div>
  )
}

// ─── Mode-transition cue ──────────────────────────────────────────────
// Per the design spec: when Claude pivots between guidance and execute
// mid-conversation, the surface signals the shift so Helen isn't
// surprised. Detection is pure text — a fenced ```card block means
// execute mode; anything else is guidance. The cue renders only on
// the turn where mode flips vs. the previous assistant turn.
const CARD_FENCE_RE = /^```card\s*$/m
function modeOf(content) {
  return CARD_FENCE_RE.test(String(content || '')) ? 'execute' : 'guidance'
}
function computeModeShift(messages, idx) {
  const current = messages[idx]
  if (!current || current.role !== 'assistant') return null
  const currentMode = modeOf(current.content)
  // Walk backwards to the previous assistant turn (skip user messages).
  for (let i = idx - 1; i >= 0; i--) {
    if (messages[i]?.role !== 'assistant') continue
    const prevMode = modeOf(messages[i].content)
    return prevMode !== currentMode ? currentMode : null
  }
  return null // first assistant turn — no shift to render
}

function ModeShiftCue({ toMode }) {
  const isExecute = toMode === 'execute'
  return (
    <div
      data-testid={`mode-shift-${toMode}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginLeft: 38, // align under the Claude mark, not the avatar
        marginBottom: 6,
        marginTop: 2,
      }}
    >
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: 9,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: T.accent,
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: 4,
          background: 'rgba(46,93,58,0.10)',
        }}
      >
        MODE · {toMode}
      </span>
      <span
        aria-hidden="true"
        style={{
          fontFamily: FONT.mono,
          fontSize: 10,
          color: T.inkFaint,
          letterSpacing: 1,
        }}
      >
        {isExecute ? 'drafting a change →' : '← back to talking'}
      </span>
    </div>
  )
}

// Walk the active trip and collect every card.id that's already been
// committed to a stop. Used to gate ConfirmCard's initialPhase so cards
// in re-loaded conversation history don't appear as live drafts after
// the change they describe already landed.
function collectSavedCardIds(trip) {
  const out = new Set()
  if (!trip) return out
  const days = trip.data?.days || trip.days || []
  for (const day of days) {
    for (const stop of day?.stops || []) {
      const id = stop?.claudeMeta?.cardId
      if (id) out.add(id)
    }
  }
  return out
}

// Map any thrown error from the streaming client to one of the three
// user-facing strings per the carryover's error policy. We never let a
// raw error.message reach the UI.
function userFacingClaudeError(err) {
  const msg = String(err?.message || err || '').toLowerCase()
  if (/abort|timeout|timed out/.test(msg)) {
    return "Claude's taking a moment. Try again?"
  }
  return 'Something went wrong on my end. Try again, or rephrase what you were asking.'
}
