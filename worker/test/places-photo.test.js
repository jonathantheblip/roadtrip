// /places/photo proxy + /places/nearby photo enrichment.
//
// The tray shows a place's real Google photo without the API key reaching the
// client: /places/nearby returns a key-safe proxied photoUrl on THIS worker,
// and GET /places/photo (PUBLIC, like /assets — an <img src> can't auth)
// resolves a well-formed photo resource name through Google with the key. The
// outbound Google fetch is stubbed — no network, no key.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

const TOKEN = 'tok-jonathan'
const KEY = 'g-places-key'
const authEnv = () => ({ ...env, FAMILY_TOKEN_JONATHAN: TOKEN, GOOGLE_PLACES_API_KEY: KEY })

async function get(path) {
  const req = new Request(`https://worker.test${path}`, {
    method: 'GET',
    headers: { Origin: 'http://localhost:5173' },
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

async function postNearby(body) {
  const req = new Request('https://worker.test/places/nearby', {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

beforeEach(async () => {
  await applySchema(env.DB)
  await seedSession(env.DB, TOKEN, 'jonathan')
})
afterEach(() => vi.unstubAllGlobals())

describe('GET /places/photo (proxy)', () => {
  it('rejects a malformed photo name (not an open image proxy)', async () => {
    const calls = vi.fn(async () => new Response('img', { headers: { 'Content-Type': 'image/jpeg' } }))
    vi.stubGlobal('fetch', calls)
    const res = await get('/places/photo?name=https://evil.example/steal&w=640')
    expect(res.status).toBe(400)
    expect(calls, 'never forwarded a bad name to Google').not.toHaveBeenCalled()
  })

  it('proxies a well-formed name through Google with the key, key never in the response', async () => {
    let requested = ''
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      requested = typeof input === 'string' ? input : input.url
      return new Response('JPEGBYTES', { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
    }))
    const res = await get('/places/photo?name=places/ChIJabc/photos/xyz123&w=640')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    // The worker called Google's media endpoint with the name + key + width.
    expect(requested).toContain('places/ChIJabc/photos/xyz123/media')
    expect(requested).toContain(`key=${KEY}`)
    expect(requested).toContain('maxWidthPx=640')
    // The proxied image carries no key.
    expect(await res.text()).toBe('JPEGBYTES')
  })

  it('500 when the Places key is not configured', async () => {
    const req = new Request('https://worker.test/places/photo?name=places/a/photos/b', {
      method: 'GET', headers: { Origin: 'http://localhost:5173' },
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, { ...env }, ctx) // no GOOGLE_PLACES_API_KEY
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(500)
  })
})

describe('POST /places/nearby — photo enrichment', () => {
  it('turns a place photo into a key-safe proxied photoUrl (photoName never leaks)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        places: [
          {
            id: 'p1', displayName: { text: 'Cabin Diner' }, formattedAddress: '1 Main St',
            location: { latitude: 43.24, longitude: -72.9 }, businessStatus: 'OPERATIONAL',
            photos: [{ name: 'places/p1/photos/AbC-123' }],
          },
          {
            id: 'p2', displayName: { text: 'No Photo Spot' }, formattedAddress: '2 Main St',
            location: { latitude: 43.25, longitude: -72.91 }, businessStatus: 'OPERATIONAL',
          },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ))
    const res = await postNearby({ query: 'restaurants', location: { lat: 43.24, lng: -72.9 } })
    expect(res.status).toBe(200)
    const data = await res.json()
    const withPhoto = data.results.find((r) => r.name === 'Cabin Diner')
    const without = data.results.find((r) => r.name === 'No Photo Spot')
    // photoUrl points back at THIS worker's proxy, carries the name, NOT the key.
    expect(withPhoto.photoUrl).toContain('https://worker.test/places/photo?name=')
    expect(withPhoto.photoUrl).toContain(encodeURIComponent('places/p1/photos/AbC-123'))
    expect(withPhoto.photoUrl).not.toContain(KEY)
    expect(withPhoto.photoName, 'raw resource name never reaches the client').toBeUndefined()
    // A place with no photo → photoUrl null (the card falls back to the tint band).
    expect(without.photoUrl).toBe(null)
  })
})
