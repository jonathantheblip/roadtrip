// Unit 2 — the ANTHROPIC_BASE_URL fetch seam.
//
// This guards a change to the LIVE Anthropic request path, so it proves
// exactly two things and stops (the seam, not a contract suite):
//
//   1. Production is byte-for-byte unchanged with the var unset:
//      anthropicMessagesUrl(env) resolves to the exact URL of record
//      when ANTHROPIC_BASE_URL is absent or blank.
//   2. A miniflare test can point the live call at a local stub — at
//      BOTH call sites (postDraft `/draft` and postClaudeChat
//      `/claude/chat`). We stub globalThis.fetch — the `main` worker
//      runs in the same isolate as the test, so the stub applies to it
//      — and assert the URL the worker actually requested is derived
//      from the configured base, not the hardcoded origin.
//
// Scope boundary (governing rule): this unit asserts REDIRECTION only.
// It deliberately does NOT assert the SSE translation, D1 persistence,
// or truncation behavior of /claude/chat — that is Unit 4's native-SSE
// harness, which reuses this same seam to point at a fixture stub.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import worker, { anthropicMessagesUrl } from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

const REAL = 'https://api.anthropic.com/v1/messages'
const STUB_BASE = 'https://anthropic.stub'
const STUB_URL = `${STUB_BASE}/v1/messages`

describe('anthropicMessagesUrl — production-preserving seam', () => {
  it('falls back to the real API when ANTHROPIC_BASE_URL is unset', () => {
    expect(anthropicMessagesUrl({})).toBe(REAL)
  })
  it('falls back to the real API when ANTHROPIC_BASE_URL is blank', () => {
    expect(anthropicMessagesUrl({ ANTHROPIC_BASE_URL: '   ' })).toBe(REAL)
  })
  it('redirects to a configured base URL', () => {
    expect(anthropicMessagesUrl({ ANTHROPIC_BASE_URL: STUB_BASE })).toBe(STUB_URL)
  })
  it('tolerates a trailing slash on the base (no doubled slash)', () => {
    expect(anthropicMessagesUrl({ ANTHROPIC_BASE_URL: `${STUB_BASE}/` })).toBe(STUB_URL)
  })
})

describe('seam redirects both live Anthropic call sites to a local stub', () => {
  let fetchCalls
  beforeEach(async () => {
    fetchCalls = []
    await applySchema(env.DB)
    // 'test-token' is helen's token (FAMILY_TOKEN_HELEN below); make it a real
    // session row so the bundled-token Bearer calls authenticate under sessions-only auth.
    await seedSession(env.DB, 'test-token', 'helen')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Stub the global fetch the worker calls. Records the requested URL so
  // the test can assert WHERE the worker went, then returns the supplied
  // canned upstream response.
  function stubFetch(response) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        fetchCalls.push(typeof input === 'string' ? input : input.url)
        return response()
      })
    )
  }

  it('/draft (postDraft) calls <base>/v1/messages, not the hardcoded origin', async () => {
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            content: [
              { type: 'text', text: '{"tags":["helen"],"descriptions":{"helen":"x"}}' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    )
    const testEnv = {
      ...env,
      DB: env.DB,
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_BASE_URL: STUB_BASE,
      FAMILY_TOKEN_HELEN: 'test-token',
    }
    const req = new Request('https://worker.test/draft', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'content-type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({ name: 'Test Place', category: 'museum' }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, testEnv, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    expect(fetchCalls).toEqual([STUB_URL])
  })

  it('/claude/chat (postClaudeChat) calls <base>/v1/messages, not the hardcoded origin', async () => {
    await applySchema(env.DB)
    // A tiny but complete upstream stream. Unit 2 only proves the call
    // was redirected; the translated output is Unit 4's concern.
    const sse =
      'event: content_block_delta\n' +
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n' +
      '\n'
    stubFetch(
      () =>
        new Response(sse, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
    )
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
      body: JSON.stringify({ conversation_id: 'seam-conv', message: 'hi' }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, testEnv, ctx)
    // Drain the streaming response so the worker's background pump (which
    // reads upstream.body and writes to D1) runs to completion.
    await res.text()
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    expect(fetchCalls).toEqual([STUB_URL])
  })
})
