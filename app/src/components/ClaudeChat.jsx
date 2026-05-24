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

import { useEffect, useRef, useState } from 'react'
import {
  streamClaudeChat,
  listConversations,
  getConversationMessages,
  newConversationId,
  isClaudeChatConfigured,
} from '../lib/claudeChat'

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

function ClaudeBubble({ children, streaming = false }) {
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
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: FONT.serif,
          fontSize: 15,
          fontStyle: 'italic',
          color: T.ink,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {children}
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
export function ClaudeChatPanel({ open, onClose, userId, tripId = null, tripTitle = null }) {
  const [phase, setPhase] = useState('loading') // loading | list | chat
  const [pastList, setPastList] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [streamingText, setStreamingText] = useState('')
  const [sending, setSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const messagesRef = useRef(null)

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
      <style>{`@keyframes rt-claude-caret { from { opacity: 1 } to { opacity: 0 } }`}</style>
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
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <UserBubble key={m.id || i}>{m.content}</UserBubble>
                ) : (
                  <ClaudeBubble key={m.id || i}>{m.content}</ClaudeBubble>
                )
              )}
              {streamingText && <ClaudeBubble streaming>{streamingText}</ClaudeBubble>}
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
