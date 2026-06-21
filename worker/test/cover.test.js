// Surprises Slice 3 — POST /cover. Claude drafts a believable cover story for a
// surprise (Anthropic seam, stubbed). Auth-gated; 503 fallback without a key.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import worker, { coverModel, parseCoverJson } from '../src/index.js'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

const STUB_BASE = 'https://anthropic.stub'

function authedEnv(extra = {}) {
  return { ...env, ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: STUB_BASE, FAMILY_TOKEN_HELEN: 'test-token', ...extra }
}
function req(path, { body, method = 'POST', headers = {}, token = 'test-token' } = {}) {
  const h = { Origin: 'http://localhost:5173', 'content-type': 'application/json', ...headers }
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
const anthropicText = (text) =>
  new Response(JSON.stringify({ content: [{ type: 'text', text }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const COVER_JSON = '{"icon":"🌳","title":"A nature walk","loc":"the woods","time":"Sat 3:00 PM","weather":"Mild","packing":"Sneakers"}'
const CTX = {
  context: {
    kind: 'stop', title: "Mo's Candy Emporium", detail: 'the big surprise',
    trip: 'Vermont week · Aug 1–5', stops: 'Pancakes at the inn',
    when: 'when they arrive', hideFrom: 'Rafa',
    seed: { time: '3:00 PM' },
  },
}

describe('coverModel knob', () => {
  it('defaults to Sonnet', () => expect(coverModel({})).toBe('claude-sonnet-4-6'))
  it('honors the COVER_MODEL override (switchable without a deploy)', () =>
    expect(coverModel({ COVER_MODEL: 'claude-haiku-4-5-20251001' })).toBe('claude-haiku-4-5-20251001'))
})

describe('parseCoverJson — clamp + require a title', () => {
  it('parses a clean object', () => {
    expect(parseCoverJson(COVER_JSON)).toEqual({ icon: '🌳', title: 'A nature walk', loc: 'the woods', time: 'Sat 3:00 PM', weather: 'Mild', packing: 'Sneakers' })
  })
  it('strips code fences', () => {
    expect(parseCoverJson('```json\n' + COVER_JSON + '\n```')?.title).toBe('A nature walk')
  })
  it('defaults a missing icon', () => {
    expect(parseCoverJson('{"title":"Coffee","loc":"cafe"}')?.icon).toBe('📍')
  })
  it('returns null without a title (the one field a cover needs)', () => {
    expect(parseCoverJson('{"loc":"x"}')).toBe(null)
  })
  it('returns null on non-JSON', () => {
    expect(parseCoverJson('sorry, I cannot')).toBe(null)
  })
})

describe('POST /cover — Claude drafts a cover story', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, 'test-token', 'helen') // FAMILY_TOKEN_HELEN value → helen's session
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns the parsed cover fields (no real secret echoed back)', async () => {
    stubFetch(() => anthropicText(COVER_JSON))
    const res = await run(req('/cover', { body: JSON.stringify(CTX) }), authedEnv())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.title).toBe('A nature walk')
    expect(data.weather).toBe('Mild')
    // The route returns ONLY the cover — never the real hidden thing.
    expect(JSON.stringify(data)).not.toContain('Candy')
  })

  it('sends the real context to the model so the cover carries the true timing', async () => {
    let sentBody = null
    vi.stubGlobal('fetch', vi.fn(async (_url, opts) => {
      sentBody = JSON.parse(opts.body)
      return anthropicText(COVER_JSON)
    }))
    await run(req('/cover', { body: JSON.stringify(CTX) }), authedEnv())
    const prompt = sentBody.messages[0].content
    expect(prompt).toContain("Mo's Candy Emporium") // the real secret reaches the model (author-only caller)
    expect(prompt).toContain('SAME time as the real plan')
    expect(sentBody.model).toBe('claude-sonnet-4-6')
  })

  it('401 without a family token (auth-gated)', async () => {
    const res = await run(req('/cover', { token: null, body: JSON.stringify(CTX) }), authedEnv())
    expect(res.status).toBe(401)
  })

  it('503 when no Anthropic key (client falls back to manual entry)', async () => {
    const res = await run(req('/cover', { body: JSON.stringify(CTX) }), authedEnv({ ANTHROPIC_API_KEY: '' }))
    expect(res.status).toBe(503)
  })

  it('502 when the model returns unparseable output', async () => {
    stubFetch(() => anthropicText('I cannot help with that.'))
    const res = await run(req('/cover', { body: JSON.stringify(CTX) }), authedEnv())
    expect(res.status).toBe(502)
  })
})
