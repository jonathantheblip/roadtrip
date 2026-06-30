// Places result localization — the shared placesTextSearch (behind /places/nearby
// AND the find_places chat tool) now forwards optional languageCode/regionCode to
// Google so a foreign-destination search returns local-language results + local
// address conventions, instead of Cloudflare's edge English/US default. The
// outbound Places fetch is stubbed (vi.stubGlobal, like drive-eta.test.js); we
// assert what reaches Google's request body.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

const TOKEN = 'tok-jonathan'
const authEnv = () => ({ ...env, GOOGLE_PLACES_API_KEY: 'test-key' })

const placesResponse = () =>
  JSON.stringify({
    places: [
      { id: 'p1', displayName: { text: 'Gelateria' }, formattedAddress: 'Via Roma, Firenze', location: { latitude: 43.77, longitude: 11.25 }, businessStatus: 'OPERATIONAL' },
    ],
  })

function stubPlaces() {
  const mock = vi.fn(async () => new Response(placesResponse(), { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', mock)
  return mock
}

function searchBody(mock) {
  const call = mock.mock.calls.find(([url]) => String(url).includes('places:searchText'))
  return call ? JSON.parse(call[1].body) : null
}

async function postNearby(bodyObj) {
  const req = new Request('https://worker.test/places/nearby', {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(bodyObj),
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

describe('Places locale plumbing', () => {
  it('forwards languageCode + regionCode to Google when supplied (Florence in Italian)', async () => {
    const mock = stubPlaces()
    const res = await postNearby({ query: 'gelato', location: { lat: 43.77, lng: 11.25 }, languageCode: 'it', regionCode: 'IT' })
    expect(res.status).toBe(200)
    const body = searchBody(mock)
    expect(body.languageCode).toBe('it')
    expect(body.regionCode).toBe('IT')
    // The query + center are still there — locale is additive, not a replacement.
    expect(body.textQuery).toBe('gelato')
    expect(body.locationBias).toBeTruthy()
  })

  it('omits the locale fields entirely when not supplied (US/default unchanged)', async () => {
    const mock = stubPlaces()
    const res = await postNearby({ query: 'coffee', location: { lat: 42.36, lng: -71.06 } })
    expect(res.status).toBe(200)
    const body = searchBody(mock)
    expect(body).not.toHaveProperty('languageCode')
    expect(body).not.toHaveProperty('regionCode')
  })

  it('ignores non-string locale values (defensive — no junk reaches Google)', async () => {
    const mock = stubPlaces()
    const res = await postNearby({ query: 'park', location: { lat: 42.36, lng: -71.06 }, languageCode: 42, regionCode: { x: 1 } })
    expect(res.status).toBe(200)
    const body = searchBody(mock)
    expect(body).not.toHaveProperty('languageCode')
    expect(body).not.toHaveProperty('regionCode')
  })
})
