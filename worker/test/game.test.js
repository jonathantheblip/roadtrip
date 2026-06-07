// Rafa's game-maker worker endpoints:
//   POST /game       — Claude writes a self-contained HTML game (Anthropic seam)
//   POST /transcribe — Whisper via Workers AI (env.AI), 503 fallback without it
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, it, expect, vi } from 'vitest'
import worker, { gameModel } from '../src/index.js'

const STUB_BASE = 'https://anthropic.stub'

function authedEnv(extra = {}) {
  return {
    ...env,
    DB: env.DB,
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_BASE_URL: STUB_BASE,
    FAMILY_TOKEN_HELEN: 'test-token',
    ...extra,
  }
}
function req(path, { body, method = 'POST', headers = {}, token = 'test-token' } = {}) {
  const h = { Origin: 'http://localhost:5173', ...headers }
  if (token) h.Authorization = `Bearer ${token}`
  return new Request(`https://worker.test${path}`, { method, headers: h, body })
}
function stubFetch(response) {
  vi.stubGlobal('fetch', vi.fn(async () => response()))
}
async function run(request, testEnv) {
  const ctx = createExecutionContext()
  const res = await worker.fetch(request, testEnv, ctx)
  await waitOnExecutionContext(ctx)
  return res
}
const anthropicHtml = (text) =>
  new Response(JSON.stringify({ content: [{ type: 'text', text }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

describe('gameModel knob', () => {
  it('defaults to Sonnet', () => {
    expect(gameModel({})).toBe('claude-sonnet-4-6')
  })
  it('honors the GAME_MODEL override (switchable without a deploy)', () => {
    expect(gameModel({ GAME_MODEL: 'claude-haiku-4-5-20251001' })).toBe('claude-haiku-4-5-20251001')
  })
})

describe('POST /game — Claude writes a self-contained game', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the HTML with markdown fences stripped', async () => {
    stubFetch(() => anthropicHtml('```html\n<!DOCTYPE html><html><body><canvas></canvas></body></html>\n```'))
    const res = await run(
      req('/game', { body: JSON.stringify({ desc: 'a rocket game' }), headers: { 'content-type': 'application/json' } }),
      authedEnv(),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.html).toMatch(/^<!DOCTYPE html>/)
    expect(data.html).not.toContain('```')
  })

  it('401 without a family token (auth-gated)', async () => {
    const res = await run(
      req('/game', { token: null, body: JSON.stringify({ desc: 'x' }), headers: { 'content-type': 'application/json' } }),
      authedEnv(),
    )
    expect(res.status).toBe(401)
  })

  it('400 when desc and modify are both missing', async () => {
    const res = await run(
      req('/game', { body: JSON.stringify({}), headers: { 'content-type': 'application/json' } }),
      authedEnv(),
    )
    expect(res.status).toBe(400)
  })

  it('502 when the model returns no HTML', async () => {
    stubFetch(() => anthropicHtml('sorry, I cannot'))
    const res = await run(
      req('/game', { body: JSON.stringify({ desc: 'x' }), headers: { 'content-type': 'application/json' } }),
      authedEnv(),
    )
    expect(res.status).toBe(502)
  })
})

describe('POST /transcribe — Whisper via Workers AI REST', () => {
  afterEach(() => vi.unstubAllGlobals())
  const cfEnv = (extra = {}) => authedEnv({ CF_ACCOUNT_ID: 'acct', CF_AI_TOKEN: 'cf-token', ...extra })

  it('503 when Workers AI is not configured (client falls back to typed)', async () => {
    const res = await run(
      req('/transcribe', { body: new Uint8Array([1, 2, 3]), headers: { 'content-type': 'audio/webm' } }),
      authedEnv(), // no CF_ACCOUNT_ID / CF_AI_TOKEN
    )
    expect(res.status).toBe(503)
  })

  it('transcribes the audio via the Workers AI REST endpoint', async () => {
    let calledUrl = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        calledUrl = typeof input === 'string' ? input : input.url
        return new Response(JSON.stringify({ result: { text: 'a bouncing ball game' }, success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    const res = await run(
      req('/transcribe', { body: new Uint8Array([1, 2, 3, 4]), headers: { 'content-type': 'audio/webm' } }),
      cfEnv(),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.text).toBe('a bouncing ball game')
    expect(calledUrl).toContain('/accounts/acct/ai/run/@cf/openai/whisper')
  })

  it('400 on empty audio (before any upstream call)', async () => {
    const res = await run(
      req('/transcribe', { body: new Uint8Array([]), headers: { 'content-type': 'audio/webm' } }),
      cfEnv(),
    )
    expect(res.status).toBe(400)
  })
})
