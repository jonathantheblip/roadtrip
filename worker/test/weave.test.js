// POST /weave — Claude-framed narrative for a day's family contributions.
//
// The endpoint takes a list of beats (who, kind, snippet) + an optional
// travel stat, asks Claude to write title + opening + closing, and returns
// the three strings as JSON.  NON-VACUOUS: the valid-response case asserts
// all three fields are present; the parse-failure case asserts 502 (not 200
// with garbled data); the empty-beats case asserts 400 before Claude is
// called at all.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, it, expect, vi } from 'vitest'
import worker from '../src/index.js'

const TOKEN = 'tok-jonathan'
const authEnv = () => ({ ...env, FAMILY_TOKEN_JONATHAN: TOKEN, ANTHROPIC_API_KEY: 'test-key' })

const BEATS = [
  { who: 'jonathan', kind: 'log', snippet: 'Drove 215 mi, arrived NYC 6 PM' },
  { who: 'helen', kind: 'text', snippet: 'Rafa fell asleep in his coat before we unpacked' },
  { who: 'aurelia', kind: 'photo', snippet: 'this elevator is older than mom' },
  { who: 'rafa', kind: 'voice', snippet: 'I want pizza. I want pizza.' },
]

function mockAnthropic(text) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({ content: [{ type: 'text', text }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
  )
}

async function postWeave(body, { token = TOKEN } = {}) {
  const headers = { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const req = new Request('https://worker.test/weave', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

afterEach(() => vi.unstubAllGlobals())

describe('POST /weave', () => {
  it('401 without a token', async () => {
    const res = await postWeave({ beats: BEATS }, { token: null })
    expect(res.status).toBe(401)
  })

  it('400 with missing beats', async () => {
    const res = await postWeave({ stat: '215 mi' })
    expect(res.status).toBe(400)
  })

  it('400 with empty beats array', async () => {
    const res = await postWeave({ beats: [] })
    expect(res.status).toBe(400)
  })

  it('400 when all beats lack required fields', async () => {
    const res = await postWeave({ beats: [{ who: 'jonathan' }] })
    expect(res.status).toBe(400)
  })

  it('returns {title, opening, closing} from a valid Claude response', async () => {
    mockAnthropic('{"title":"Converging on Murray Hill","opening":"Four roads met in one apartment.","closing":"That was Friday."}')
    const res = await postWeave({ beats: BEATS, stat: '215 mi · 1 flight · 1 city' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.title).toBe('Converging on Murray Hill')
    expect(data.opening).toBe('Four roads met in one apartment.')
    expect(data.closing).toBe('That was Friday.')
  })

  it('accepts beats without stat', async () => {
    mockAnthropic('{"title":"A Quiet Day","opening":"Nothing much happened.","closing":"And that was enough."}')
    const res = await postWeave({ beats: BEATS })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(typeof data.title).toBe('string')
  })

  it('502 when Claude returns unparseable output', async () => {
    mockAnthropic('Sorry, I cannot help with that.')
    const res = await postWeave({ beats: BEATS })
    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data.error).toMatch(/parse/)
  })

  it('502 when Claude returns JSON missing a required field', async () => {
    mockAnthropic('{"title":"Something","opening":"A sentence."}')
    const res = await postWeave({ beats: BEATS })
    expect(res.status).toBe(502)
  })

  it('strips ```json fences before parsing', async () => {
    mockAnthropic('```json\n{"title":"Day","opening":"It happened.","closing":"Done."}\n```')
    const res = await postWeave({ beats: BEATS })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.title).toBe('Day')
  })

  // Capturing mock — records the outbound Anthropic request body so the
  // model assertions below are non-vacuous (they'd fail on the old Haiku).
  function mockAnthropicCapturing(sink) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opts) => {
        sink.push(JSON.parse(opts.body))
        return new Response(
          JSON.stringify({ content: [{ type: 'text', text: '{"title":"T","opening":"O","closing":"C"}' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      })
    )
  }

  it('weave request uses the Sonnet weave model by default', async () => {
    const calls = []
    mockAnthropicCapturing(calls)
    const res = await postWeave({ beats: BEATS })
    expect(res.status).toBe(200)
    expect(calls[0].model).toBe('claude-sonnet-4-6')
  })

  it('weave model is overridable via WEAVE_MODEL (no redeploy)', async () => {
    const calls = []
    mockAnthropicCapturing(calls)
    const req = new Request('https://worker.test/weave', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ beats: BEATS }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, { ...authEnv(), WEAVE_MODEL: 'claude-haiku-4-5-20251001' }, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    expect(calls[0].model).toBe('claude-haiku-4-5-20251001')
  })
})
