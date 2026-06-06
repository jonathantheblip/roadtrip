// POST /route — real road distance + geometry (Unit 2, worker layer).
//
// The endpoint powers the family travel stat (the Weave) AND the maps (the
// road polyline that replaces straight lines). It wraps Google Routes
// (callRoutesDistance) behind a content-addressed cache so a static trip is
// billed ~once but a schedule change recomputes. The outbound Routes fetch is
// stubbed (vi.stubGlobal, same as trip-hero-resolve / anthropic-seam) — no
// network, no key. NON-VACUOUS: the cache-hit case asserts the Routes fetch
// is NOT called again, and the changed-route case asserts it IS — that's the
// invalidation Jonathan asked for, proven both directions.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, it, expect, vi } from 'vitest'
import worker from '../src/index.js'
import { callRoutesDistance, decodePolyline } from '../src/leaveWhen.js'

const TOKEN = 'tok-jonathan'
const authEnv = () => ({ ...env, FAMILY_TOKEN_JONATHAN: TOKEN, GOOGLE_PLACES_API_KEY: 'test-key' })

// The classic Google encoded-polyline example → 3 points.
const ENCODED = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'
const routesBody = (distanceMeters = 419000, durationSec = 15000) =>
  JSON.stringify({
    routes: [{ distanceMeters, duration: `${durationSec}s`, polyline: { encodedPolyline: ENCODED } }],
  })

async function postRoute(stops, { token = TOKEN } = {}) {
  const headers = { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const req = new Request('https://worker.test/route', {
    method: 'POST',
    headers,
    body: JSON.stringify({ stops }),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

afterEach(() => vi.unstubAllGlobals())

describe('decodePolyline', () => {
  it('decodes the standard example to 3 points', () => {
    const pts = decodePolyline(ENCODED)
    expect(pts.length).toBe(3)
    expect(pts[0].lat).toBeCloseTo(38.5, 4)
    expect(pts[0].lng).toBeCloseTo(-120.2, 4)
  })
  it('returns [] for empty/garbage input', () => {
    expect(decodePolyline('')).toEqual([])
    expect(decodePolyline(null)).toEqual([])
  })
})

describe('callRoutesDistance — chunking + geometry stitching', () => {
  it('chunks >27 stops, sums distance, and stitches points dropping the seam dup', async () => {
    const stops = Array.from({ length: 28 }, (_, i) => ({ lat: 40 + i * 0.01, lng: -73 - i * 0.01 }))
    let calls = 0
    const fetchImpl = async () => {
      calls++
      return new Response(routesBody(100000, 3600), { headers: { 'Content-Type': 'application/json' } })
    }
    const out = await callRoutesDistance({ apiKey: 'k', stops, fetchImpl })
    expect(calls, '28 stops → 2 chunks (27 + seam)').toBe(2)
    expect(out.distanceMeters, 'summed across chunks').toBe(200000)
    // chunk1 = 3 points, chunk2 = 3 but first dropped as the seam dup → 5.
    expect(out.points.length).toBe(5)
  })
})

describe('POST /route', () => {
  it('401 without a token', async () => {
    const res = await postRoute([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], { token: null })
    expect(res.status).toBe(401)
  })

  it('400 with fewer than 2 valid stops', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(routesBody())))
    const res = await postRoute([{ lat: 1, lng: 1 }])
    expect(res.status).toBe(400)
  })

  it('returns miles + duration + decoded road points; caches identical, recomputes on change', async () => {
    const mock = vi.fn(async () => new Response(routesBody(), { headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', mock)
    const stops = [{ lat: 42.34, lng: -73.6 }, { lat: 36.34, lng: -82.21 }]

    const r1 = await postRoute(stops)
    expect(r1.status).toBe(200)
    const d1 = await r1.json()
    expect(d1.cached).toBe(false)
    expect(d1.miles).toBeCloseTo(419000 / 1609.344, 0)
    expect(d1.durationMinutes).toBe(250)
    expect(d1.points.length).toBe(3)
    expect(mock).toHaveBeenCalledTimes(1)

    // Identical stops → cache HIT, no new Routes call.
    const r2 = await postRoute(stops)
    const d2 = await r2.json()
    expect(d2.cached).toBe(true)
    expect(mock, 'cache hit must not re-bill Routes').toHaveBeenCalledTimes(1)

    // Changed schedule → different key → cache MISS → recompute.
    const r3 = await postRoute([{ lat: 42.34, lng: -73.6 }, { lat: 40.0, lng: -75.0 }])
    const d3 = await r3.json()
    expect(d3.cached).toBe(false)
    expect(mock, 'a schedule change must recompute').toHaveBeenCalledTimes(2)
  })
})
