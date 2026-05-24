// Claude-in-App M1 — streaming chat client. Wraps the Worker's
// /claude/chat SSE proxy with two simple shapes:
//
//   streamClaudeChat({ conversationId, userId, tripId, message, onDelta })
//     → resolves with { fullText, usage } when the stream closes; throws
//       on network failure or non-200. Calls onDelta(text) for every
//       text_delta frame as it lands.
//
//   listConversations({ userId, tripId })   → array of conversation rows
//   getConversationMessages(conversationId) → array of {role, content, created_at}
//   createConversation({ userId, tripId })  → { id, ... }
//
// The Worker translates Anthropic's wire format into our minimal SSE:
//   data: {"type":"text_delta","text":"..."}
//   data: {"type":"done","usage":{"input_tokens":..,"output_tokens":..}}
// So the client only knows three event types: text_delta, done, error.
//
// Failures are surfaced to the caller; the chat surface translates them
// into one of the three Helen-readable strings per the user-facing
// error policy. No technical error string ever lands in user UI.

import { workerFetch, isWorkerConfigured } from './workerSync'

export function isClaudeChatConfigured() {
  return isWorkerConfigured()
}

export async function createConversation({ userId, tripId = null, id = null } = {}) {
  const r = await workerFetch('/claude/conversations', {
    method: 'POST',
    body: JSON.stringify({ id, user_id: userId, trip_id: tripId }),
  })
  return r.json()
}

export async function listConversations({ userId, tripId = null } = {}) {
  if (!userId) throw new Error('listConversations: userId required')
  const qs = new URLSearchParams({ user_id: userId })
  if (tripId) qs.set('trip_id', tripId)
  const r = await workerFetch(`/claude/conversations?${qs.toString()}`)
  const arr = await r.json()
  return Array.isArray(arr) ? arr : []
}

export async function getConversationMessages(conversationId) {
  if (!conversationId) throw new Error('getConversationMessages: id required')
  const r = await workerFetch(
    `/claude/conversations/${encodeURIComponent(conversationId)}/messages`
  )
  const arr = await r.json()
  return Array.isArray(arr) ? arr : []
}

// Generate a uuidish id for new conversations. crypto.randomUUID exists
// in every browser we target (iOS Safari 16+, modern Chrome) but we
// fall back so the lib stays usable in older test runners.
export function newConversationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Non-crypto fallback for environments without webcrypto. Good enough
  // for a primary key; the Worker uses real uuids for message ids.
  return 'c-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36)
}

// Stream a single chat round-trip. Resolves when the upstream `done`
// event arrives. Rejects on transport failure or upstream `error` event.
// onDelta is invoked synchronously for each text chunk so the UI can
// render-as-typed.
export async function streamClaudeChat({
  conversationId,
  userId,
  tripId = null,
  message,
  onDelta = () => {},
  signal = null,
} = {}) {
  if (!conversationId) throw new Error('streamClaudeChat: conversationId required')
  if (!userId) throw new Error('streamClaudeChat: userId required')
  if (typeof message !== 'string' || !message.trim()) {
    throw new Error('streamClaudeChat: message required')
  }

  const r = await workerFetch('/claude/chat', {
    method: 'POST',
    body: JSON.stringify({
      conversation_id: conversationId,
      user_id: userId,
      trip_id: tripId,
      message,
    }),
    signal,
  })

  if (!r.body) {
    // Some test harnesses replay a non-stream body for SSE responses.
    // Treat the entire body as a single batch.
    const text = await r.text()
    return parseSseBatch(text, onDelta)
  }

  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  let fullText = ''
  let usage = null
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += value
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const dataStr = line.slice(5).trim()
        if (!dataStr) continue
        let event
        try {
          event = JSON.parse(dataStr)
        } catch {
          continue
        }
        if (event.type === 'text_delta' && typeof event.text === 'string') {
          fullText += event.text
          try { onDelta(event.text) } catch { /* ignore handler errors */ }
        } else if (event.type === 'done') {
          usage = event.usage || null
        } else if (event.type === 'error') {
          throw new Error(event.message || 'claude stream error')
        }
      }
    }
  } finally {
    try { reader.releaseLock() } catch { /* ignore */ }
  }
  return { fullText, usage }
}

// Replay path for environments that don't stream (test runners that
// inline the body). Parses the full SSE text and fires onDelta for each
// text frame in order. Resolves with the same shape as the streaming
// path so the caller can treat them identically.
function parseSseBatch(text, onDelta) {
  let fullText = ''
  let usage = null
  for (const line of String(text || '').split('\n')) {
    if (!line.startsWith('data:')) continue
    const dataStr = line.slice(5).trim()
    if (!dataStr) continue
    let event
    try {
      event = JSON.parse(dataStr)
    } catch {
      continue
    }
    if (event.type === 'text_delta' && typeof event.text === 'string') {
      fullText += event.text
      try { onDelta(event.text) } catch { /* ignore */ }
    } else if (event.type === 'done') {
      usage = event.usage || null
    } else if (event.type === 'error') {
      throw new Error(event.message || 'claude stream error')
    }
  }
  return { fullText, usage }
}
