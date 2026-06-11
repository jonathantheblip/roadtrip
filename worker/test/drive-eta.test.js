// POST /drive-eta — traffic-aware one-way drive time for the LiveDock's live
// ETA. Wraps callRoutesDriveDuration behind a SHORT cache (a moving car must
// not re-bill Routes every GPS tick). The outbound Routes fetch is stubbed
// (vi.stubGlobal, like route-distance.test.js) — no network, no key.
// NON-VACUOUS: the cache-hit case asserts the Routes fetch is NOT called again
// (same 60 s bucket), and the duration is parsed from the mocked seconds.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, it, expect, vi } from 'vitest'
import worker from '../src/index.js'

const TOKEN = 'tok-jonathan'
const authEnv = () => ({ ...env, FAMILY_TOKEN_JONATHAN: TOKEN, GOOGLE_PLACES_API_KEY: 'test-key' })

// Routes computeRoutes response — only routes.duration is in the fieldmask.
const routesBody = (durationSec = 900) =>
  JSON.stringify({ routes: [{ duration: `${durationSec}s` }] })

async function postEta(bodyObj, { token = TOKEN } = {}) {
  const headers = { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const req = new Request('https://worker.test/drive-eta', {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyObj),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

afterEach(() => vi.unstubAllGlobals())

describe('POST /drive-eta', () => {
  it('401 without a token', async () => {
    const res = await postEta(
      { origin: { lat: 41.3, lng: -72.1 }, destination: { lat: 41.5, lng: -72.0 } },
      { token: null }
    )
    expect(res.status).toBe(401)
  })

  it('400 when origin/destination coords are missing or non-finite', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(routesBody())))
    const res = await postEta({ origin: { lat: 41.3 }, destination: { lat: 41.5, lng: -72.0 } })
    expect(res.status).toBe(400)
  })

  it('returns traffic-aware durationMinutes; caches within the 60 s bucket (no re-bill)', async () => {
    const mock = vi.fn(async () => new Response(routesBody(900), { headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', mock)
    const o = { lat: 41.3225, lng: -72.0943 }
    const d = { lat: 41.4923, lng: -72.0934 }

    const r1 = await postEta({ origin: o, destination: d })
    expect(r1.status).toBe(200)
    const d1 = await r1.json()
    expect(d1.cached).toBe(false)
    expect(d1.durationMinutes, '900s → 15 min').toBe(15)
    expect(mock).toHaveBeenCalledTimes(1)

    // Same coords within the same minute → cache HIT, no second Routes call.
    const r2 = await postEta({ origin: o, destination: d })
    const d2 = await r2.json()
    expect(d2.cached).toBe(true)
    expect(mock, 'a moving cars must not re-bill within the bucket').toHaveBeenCalledTimes(1)
  })

  it('502 when the Routes call throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    const res = await postEta({ origin: { lat: 1, lng: 1 }, destination: { lat: 2, lng: 2 } })
    expect(res.status).toBe(502)
  })
})
