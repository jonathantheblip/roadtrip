// placesGeocode.js — extracted verbatim out of index.js (Build 4a). These
// tests exercise the ONE behavior change the extraction itself introduced:
// placesTextSearch's new `requireOperational` param (Build 4c — an archive
// photo's landmark may have since closed). geocodePlace/placesTextSearch's
// core HTTP shape is otherwise byte-identical to the pre-extraction index.js
// functions and already covered indirectly by the existing /places/nearby
// and chat-tool integration tests.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { placesTextSearch, geocodePlace } from '../src/placesGeocode.js'

function stubPlaces(places) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ places }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const testEnv = { GOOGLE_PLACES_API_KEY: 'test-key' }

describe('placesTextSearch — requireOperational (Build 4c)', () => {
  const closedPlace = {
    id: 'p1',
    displayName: { text: 'Old Shop' },
    formattedAddress: '1 Main St',
    location: { latitude: 42.05, longitude: -70.18 },
    businessStatus: 'PERMANENTLY_CLOSED',
  }

  it('default (requireOperational omitted → true) drops a closed result — unchanged pre-extraction behavior', async () => {
    stubPlaces([closedPlace])
    const out = await placesTextSearch(testEnv, { query: 'Old Shop', lat: 42.05, lng: -70.18 })
    expect(out.results).toHaveLength(0)
  })

  it('requireOperational:false keeps a closed result (an archive photo may show a since-closed venue)', async () => {
    stubPlaces([closedPlace])
    const out = await placesTextSearch(testEnv, { query: 'Old Shop', lat: 42.05, lng: -70.18, requireOperational: false })
    expect(out.results).toHaveLength(1)
    expect(out.results[0].name).toBe('Old Shop')
  })

  it('requireOperational:false still keeps an OPERATIONAL result (not an exclude-operational flag)', async () => {
    stubPlaces([{ ...closedPlace, businessStatus: 'OPERATIONAL' }])
    const out = await placesTextSearch(testEnv, { query: 'Shop', lat: 42.05, lng: -70.18, requireOperational: false })
    expect(out.results).toHaveLength(1)
  })
})

describe('geocodePlace', () => {
  it('resolves a query to coordinates', async () => {
    stubPlaces([{ displayName: { text: 'Snow Republic' }, formattedAddress: '100 Main St', location: { latitude: 42.85, longitude: -72.56 } }])
    const hit = await geocodePlace(testEnv, '100 Main St, Brattleboro, VT')
    expect(hit).toEqual({ lat: 42.85, lng: -72.56, name: 'Snow Republic', address: '100 Main St' })
  })

  it('empty query → null, never calls the API', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await geocodePlace(testEnv, '  ')).toBe(null)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('no places in the reply → null', async () => {
    stubPlaces([])
    expect(await geocodePlace(testEnv, 'nowhere')).toBe(null)
  })
})
