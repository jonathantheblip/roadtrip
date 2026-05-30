// Unit 4 — Worker-layer harness for /claude/chat's translate/assemble/
// persist loop, and the stop_reason / truncation gap.
// TEST_STRATEGY_SPEC.md §3 Unit 4.
//
// The Worker re-emits rather than passes through: it parses Anthropic's
// NATIVE SSE, translates to the client's 3-type dialect (text_delta / done /
// error), assembles the text, and persists it to D1. A browser-layer fixture
// (Unit 3) is authored in the Worker's OUTPUT dialect and so cannot test any
// of this — these two layers meet exactly at the emitted-frame boundary.
//
// Fixtures here are NATIVE Anthropic SSE, authored by hand (NOT model-
// captured — that's Unit 3): message_start -> content_block_start ->
// content_block_delta(text_delta)* -> content_block_stop -> message_delta
// (usage AND stop_reason) -> message_stop. They drive the real handler under
// miniflare via Unit 2's ANTHROPIC_BASE_URL seam + a stubbed global fetch
// that returns the fixture as the upstream body (the anthropic-seam.test.js
// pattern).
//
// Asserts and stops (bounded — not a full Anthropic contract suite):
//   1. native SSE -> correct 3-type-dialect translation (text_delta frames
//      assemble to the upstream text; a terminal done frame carries usage).
//   2. assembled text + token usage persist to D1 (real miniflare binding).
//   3. stop_reason:"max_tokens" is DETECTED AND SURFACED as truncated:true on
//      the done frame — the gap this unit closes (detection did not exist
//      before; implemented at the message_delta branch in src/index.js).
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'

const STUB_BASE = 'https://anthropic.stub'

// ── Build a complete, native Anthropic message stream as the bytes the
// upstream API would send. `event:` lines are included for realism (the
// worker ignores them and parses only `data:` lines). One content_block_delta
// per chunk. stop_reason + final output usage ride the message_delta frame,
// exactly where Anthropic puts them.
function nativeSse({ chunks, stopReason, inputTokens = 50, outputTokens = 200 }) {
  const frame = (type, data) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  let out = ''
  out += frame('message_start', {
    type: 'message_start',
    message: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-6',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: 1 },
    },
  })
  out += frame('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  })
  for (const text of chunks) {
    out += frame('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    })
  }
  out += frame('content_block_stop', { type: 'content_block_stop', index: 0 })
  out += frame('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: outputTokens },
  })
  out += frame('message_stop', { type: 'message_stop' })
  return out
}

// Parse the worker's CLIENT-FACING output (the 3-type dialect) the same way
// the browser client does: split on newlines, JSON.parse each `data:` line.
function parseClientSse(text) {
  const textFrames = []
  let done = null
  let errorFrame = null
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue
    const body = line.slice(5).trim()
    if (!body) continue
    let ev
    try {
      ev = JSON.parse(body)
    } catch {
      continue
    }
    if (ev.type === 'text_delta') textFrames.push(ev.text)
    else if (ev.type === 'done') done = ev
    else if (ev.type === 'error') errorFrame = ev
  }
  return { textFrames, assembled: textFrames.join(''), done, errorFrame }
}

function stubUpstream(sse) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(sse, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
    )
  )
}

// Drive POST /claude/chat through the real worker and return the parsed
// client-facing stream. The seam points the upstream call at the stub.
async function runChat({ conversationId, message }) {
  const testEnv = {
    ...env,
    DB: env.DB,
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_BASE_URL: STUB_BASE,
    FAMILY_TOKEN_HELEN: 'test-token',
  }
  const req = new Request('https://worker.test/claude/chat', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'content-type': 'application/json',
      Origin: 'http://localhost:5173',
    },
    body: JSON.stringify({ conversation_id: conversationId, message }),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, testEnv, ctx)
  // Draining the body runs the background pump to completion: it writes every
  // text_delta, awaits the D1 insert, then writes done. So once text resolves,
  // persistence has happened.
  const text = await res.text()
  await waitOnExecutionContext(ctx)
  return { res, ...parseClientSse(text) }
}

async function readAssistantRow(conversationId) {
  return env.DB.prepare(
    `SELECT role, content, usage_input_tokens, usage_output_tokens
       FROM conversation_messages
      WHERE conversation_id = ? AND role = 'assistant'`
  )
    .bind(conversationId)
    .first()
}

describe('Unit 4 — /claude/chat native-SSE translation + D1 persistence', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('translates native SSE to the 3-type dialect and persists the assembled text to D1', async () => {
    const chunks = ['Saturday ', 'is Court 3 ', 'at Mohegan.']
    stubUpstream(nativeSse({ chunks, stopReason: 'end_turn' }))

    const { res, textFrames, assembled, done, errorFrame } = await runChat({
      conversationId: 'u4-normal',
      message: 'where is the match?',
    })

    expect(res.status).toBe(200)
    expect(errorFrame).toBeNull()
    // Translation: one client text_delta per upstream content_block_delta,
    // assembling to the exact upstream text.
    expect(textFrames).toEqual(chunks)
    expect(assembled).toBe('Saturday is Court 3 at Mohegan.')
    // Terminal done frame carries the usage the worker accumulated
    // (input from message_start, output from message_delta).
    expect(done).not.toBeNull()
    expect(done.usage).toEqual({ input_tokens: 50, output_tokens: 200 })
    // A normal reply is NOT flagged truncated.
    expect(done.truncated).toBeUndefined()

    // Persistence: the assistant row holds the full assembled text + usage.
    const row = await readAssistantRow('u4-normal')
    expect(row).not.toBeNull()
    expect(row.content).toBe('Saturday is Court 3 at Mohegan.')
    expect(row.usage_input_tokens).toBe(50)
    expect(row.usage_output_tokens).toBe(200)
  })

  it('detects stop_reason:"max_tokens" and surfaces truncated:true on the done frame (gap closed)', async () => {
    const chunks = ['This reply runs right up ', 'to the 8192-token ceiling and gets cut o']
    stubUpstream(nativeSse({ chunks, stopReason: 'max_tokens', outputTokens: 8192 }))

    const { res, assembled, done } = await runChat({
      conversationId: 'u4-truncated',
      message: 'write something very long',
    })

    expect(res.status).toBe(200)
    expect(done).not.toBeNull()
    // The gap: before this unit the done frame looked identical to a normal
    // reply. Now the max_tokens cutoff is detected and surfaced.
    expect(done.truncated).toBe(true)
    expect(done.usage.output_tokens).toBe(8192)

    // The (truncated) assembled text is still persisted — nothing is dropped,
    // it's just flagged.
    const row = await readAssistantRow('u4-truncated')
    expect(row.content).toBe(assembled)
    expect(row.content).toBe('This reply runs right up to the 8192-token ceiling and gets cut o')
  })

  it('does not flag truncated for other non-end_turn stop reasons (e.g. stop_sequence)', async () => {
    // Only max_tokens means "cut off by the ceiling". stop_sequence is a
    // clean stop and must NOT be flagged — guards against over-flagging.
    stubUpstream(nativeSse({ chunks: ['done early'], stopReason: 'stop_sequence' }))

    const { done } = await runChat({
      conversationId: 'u4-stopseq',
      message: 'stop at the marker',
    })

    expect(done.truncated).toBeUndefined()
  })
})
