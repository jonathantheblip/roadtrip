// discoveredPlaceNamer.js (Build 4b) — pure/injectable, no D1 needed. Covers
// the resolver order (trip's own places → stacked-places disambiguation →
// Nominatim residue, cached), and the STACKED-PLACES founding test case
// (provincetown-stacked-places memory): proximity PROPOSES, placeType
// DISAMBIGUATES, ambiguity NEVER silently picks the nearest name.
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  parseDiscoveredCoords,
  collectTripPlaces,
  dominantPlaceType,
  resolveFromTripPlaces,
  buildPlaceTypeIndex,
  nameDiscoveredPlaces,
  reverseGeocodeWorker,
  AMBIGUOUS,
} from '../src/discoveredPlaceNamer.js'

const LODGING = { lat: 42.0621, lng: -70.1634 } // Commercial St, Provincetown
const BEACH_STOP = { id: 'beach1', name: 'Provincetown Beach', lat: 42.0625, lng: -70.1630, kind: 'activity' }
const PARADE_STOP = { id: 'parade1', name: 'July 4th Parade', lat: 42.0621, lng: -70.1634, kind: 'activity' } // byte-identical coords — the stacked case
const FAR_STOP = { id: 'far1', name: 'Somewhere Else', lat: 43.0, lng: -71.0 }

function discoveredName(lat, lng) {
  return `a place near ${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

describe('parseDiscoveredCoords', () => {
  it('parses the exact sessionHeal.js format', () => {
    expect(parseDiscoveredCoords('a place near 42.0621, -70.1634')).toEqual({ lat: 42.0621, lng: -70.1634, key: '42.0621,-70.1634' })
  })
  it('a real named place (not the discovered format) → null', () => {
    expect(parseDiscoveredCoords('Snow Republic')).toBe(null)
  })
  it('null/undefined/non-4-decimal → null, never throws', () => {
    expect(parseDiscoveredCoords(null)).toBe(null)
    expect(parseDiscoveredCoords('a place near 42.06, -70.16')).toBe(null) // not 4 decimals — not a match
  })
})

describe('collectTripPlaces', () => {
  it('collects homeBase, lodging, and coord-bearing stops; skips coordless stops', () => {
    const trip = {
      homeBase: { lat: 1, lng: 2, label: 'Base' },
      lodging: { lat: 3, lng: 4, name: 'Cabin' },
      days: [{ stops: [{ name: 'Coordless', address: 'x' }, { name: 'Has Coords', lat: 5, lng: 6 }] }],
    }
    const places = collectTripPlaces(trip)
    expect(places).toHaveLength(3)
    expect(places.map((p) => p.name)).toEqual(['Base', 'Cabin', 'Has Coords'])
  })

  it('flavors a lodging-kind stop as "stay" and keyword-matches other stops', () => {
    const trip = { days: [{ stops: [
      { name: 'The Cabin', kind: 'lodging', lat: 1, lng: 1 },
      { name: 'Sunset Beach', lat: 2, lng: 2 },
      { name: 'July 4th Parade', lat: 3, lng: 3 },
      { name: 'Random Stop', lat: 4, lng: 4 },
    ] }] }
    const byName = Object.fromEntries(collectTripPlaces(trip).map((p) => [p.name, p.flavor]))
    expect(byName['The Cabin']).toBe('stay')
    expect(byName['Sunset Beach']).toBe('beach')
    expect(byName['July 4th Parade']).toBe('event')
    expect(byName['Random Stop']).toBe(null)
  })
})

describe('dominantPlaceType', () => {
  const idx = new Map([
    ['a', 'beach'], ['b', 'beach'], ['c', 'residential'], ['d', 'indoor-other'],
  ])
  it('returns the mode, excluding catch-all values', () => {
    expect(dominantPlaceType(['a', 'b', 'c'], idx)).toBe('beach')
  })
  it('a majority of catch-all values → null (never a meaningful disambiguator)', () => {
    expect(dominantPlaceType(['d', 'd', 'd'], idx)).toBe(null)
  })
  it('no photoIds with any placeType → null', () => {
    expect(dominantPlaceType(['zzz'], idx)).toBe(null)
    expect(dominantPlaceType([], idx)).toBe(null)
  })
})

describe('resolveFromTripPlaces — the STACKED-PLACES founding test case', () => {
  it('exactly one nearby candidate → names it directly, no placeType needed', () => {
    const trip = { days: [{ stops: [BEACH_STOP] }] }
    expect(resolveFromTripPlaces(trip, BEACH_STOP.lat, BEACH_STOP.lng, null)).toBe('Provincetown Beach')
  })

  it('zero nearby candidates → null (falls through to Nominatim)', () => {
    const trip = { days: [{ stops: [FAR_STOP] }] }
    expect(resolveFromTripPlaces(trip, LODGING.lat, LODGING.lng, 'beach')).toBe(null)
  })

  it('STACKED: lodging + beach + parade all within 150m — dominant "beach" placeType picks the beach candidate', () => {
    const trip = { lodging: { ...LODGING, name: 'the place we stayed' }, days: [{ stops: [BEACH_STOP, PARADE_STOP] }] }
    expect(resolveFromTripPlaces(trip, LODGING.lat, LODGING.lng, 'beach')).toBe('Provincetown Beach')
  })

  it('STACKED: dominant "event" placeType picks the parade candidate', () => {
    const trip = { lodging: { ...LODGING, name: 'the place we stayed' }, days: [{ stops: [BEACH_STOP, PARADE_STOP] }] }
    expect(resolveFromTripPlaces(trip, LODGING.lat, LODGING.lng, 'event')).toBe('July 4th Parade')
  })

  it('STACKED: dominant "residential" placeType picks the lodging (the stay)', () => {
    const trip = { lodging: { ...LODGING, name: 'the place we stayed' }, days: [{ stops: [BEACH_STOP, PARADE_STOP] }] }
    expect(resolveFromTripPlaces(trip, LODGING.lat, LODGING.lng, 'residential')).toBe('the place we stayed')
  })

  it('STACKED + no dominant placeType at all → AMBIGUOUS sentinel, NEVER a silent nearest-name pick', () => {
    const trip = { lodging: { ...LODGING, name: 'the place we stayed' }, days: [{ stops: [BEACH_STOP, PARADE_STOP] }] }
    expect(resolveFromTripPlaces(trip, LODGING.lat, LODGING.lng, null)).toBe(AMBIGUOUS)
  })

  it('STACKED + a placeType that matches ZERO candidates → AMBIGUOUS', () => {
    const trip = { lodging: { ...LODGING, name: 'the place we stayed' }, days: [{ stops: [BEACH_STOP, PARADE_STOP] }] }
    expect(resolveFromTripPlaces(trip, LODGING.lat, LODGING.lng, 'museum')).toBe(AMBIGUOUS)
  })

  it('STACKED + a placeType that matches MULTIPLE candidates (a genuine tie) → AMBIGUOUS, never picks the first', () => {
    const secondBeach = { id: 'beach2', name: 'Herring Cove Beach', lat: BEACH_STOP.lat + 0.0002, lng: BEACH_STOP.lng, kind: 'activity' }
    const trip = { days: [{ stops: [BEACH_STOP, secondBeach] }] }
    expect(resolveFromTripPlaces(trip, LODGING.lat, LODGING.lng, 'beach')).toBe(AMBIGUOUS)
  })

  it('ambiguous (zero candidates) is a DIFFERENT outcome than AMBIGUOUS (a real distinction, not both bare null)', () => {
    const trip = { days: [{ stops: [FAR_STOP] }] }
    const zeroCandidates = resolveFromTripPlaces(trip, LODGING.lat, LODGING.lng, 'beach')
    expect(zeroCandidates).toBe(null)
    expect(zeroCandidates).not.toBe(AMBIGUOUS)
  })

  it('NO duplicate-coords heuristic: byte-identical coords across stops is never treated as an anomaly', () => {
    // lodging and PARADE_STOP share EXACT coords (the stacked-places reality) —
    // this must resolve cleanly via placeType, never throw or flag it.
    const trip = { lodging: { ...LODGING, name: 'the place we stayed' }, days: [{ stops: [PARADE_STOP] }] }
    expect(resolveFromTripPlaces(trip, LODGING.lat, LODGING.lng, 'event')).toBe('July 4th Parade')
  })
})

describe('buildPlaceTypeIndex', () => {
  it('maps ref key → vision.placeType, skipping refs without one', () => {
    const rows = [{ photo_r2_keys_json: JSON.stringify([
      { key: 'k1', vision: { placeType: 'beach' } },
      { key: 'k2', vision: { name: 'x' } }, // no placeType
      { key: 'k3' },
    ]) }]
    const idx = buildPlaceTypeIndex(rows)
    expect(idx.get('k1')).toBe('beach')
    expect(idx.has('k2')).toBe(false)
    expect(idx.has('k3')).toBe(false)
  })
  it('malformed JSON row → skipped, never throws', () => {
    expect(buildPlaceTypeIndex([{ photo_r2_keys_json: 'not json' }]).size).toBe(0)
  })
})

describe('nameDiscoveredPlaces — integration', () => {
  function decision(lat, lng, photoIds = [], naming = 'needs-name') {
    return { place: { id: 'x', name: discoveredName(lat, lng) }, naming, photoIds, signals: {} }
  }

  it('renames via the trip\'s own places (single candidate), no Nominatim call', async () => {
    const trip = { days: [{ stops: [BEACH_STOP] }] }
    const days = [{ decisions: [decision(BEACH_STOP.lat, BEACH_STOP.lng)] }]
    const reverseGeocode = async () => { throw new Error('should never be called') }
    const r = await nameDiscoveredPlaces(trip, days, new Map(), { reverseGeocode })
    expect(r.renamed).toBe(1)
    expect(days[0].decisions[0].place.name).toBe('Provincetown Beach')
    expect(days[0].decisions[0].signals.discoveredNameSource).toBe('trip-place')
  })

  it('a non-discovered decision (naming !== "needs-name") is never touched', async () => {
    const trip = {}
    const days = [{ decisions: [{ place: { id: 'x', name: 'Snow Republic' }, naming: 'named', photoIds: [], signals: {} }] }]
    const r = await nameDiscoveredPlaces(trip, days, new Map())
    expect(r.renamed).toBe(0)
    expect(days[0].decisions[0].place.name).toBe('Snow Republic')
  })

  it('residue (0 candidates): falls to Nominatim, caches the result on trip.placeNames', async () => {
    const trip = {}
    const days = [{ decisions: [decision(43.0, -71.0)] }]
    const reverseGeocode = async () => 'Some Town, VT'
    const r = await nameDiscoveredPlaces(trip, days, new Map(), { reverseGeocode })
    expect(r.renamed).toBe(1)
    expect(r.external).toBe(1)
    expect(days[0].decisions[0].place.name).toBe('Some Town, VT')
    expect(r.placeNames).toEqual({ '43.0000,-71.0000': 'Some Town, VT' })
  })

  it('bounds FRESH Nominatim calls per invocation (a hangout day with many unnamed clusters must not spam the endpoint)', async () => {
    const trip = {}
    const days = [{ decisions: [
      decision(43.0, -71.0), decision(44.0, -72.0), decision(45.0, -73.0),
    ] }]
    let calls = 0
    const reverseGeocode = async () => { calls++; return `Town ${calls}` }
    const r = await nameDiscoveredPlaces(trip, days, new Map(), { reverseGeocode, limit: 2 })
    expect(calls).toBe(2)
    expect(r.external).toBe(2)
    expect(r.hitLimit).toBe(true)
    expect(r.renamed).toBe(2)
    // The third decision never got a chance — its coords name is untouched.
    expect(days[0].decisions[2].place.name).toBe(discoveredName(45.0, -73.0))
  })

  it('a cached residue name is reused without calling Nominatim again', async () => {
    const trip = { placeNames: { '43.0000,-71.0000': 'Some Town, VT' } }
    const days = [{ decisions: [decision(43.0, -71.0)] }]
    const reverseGeocode = async () => { throw new Error('should never be called — cache hit') }
    const r = await nameDiscoveredPlaces(trip, days, new Map(), { reverseGeocode })
    expect(r.renamed).toBe(1)
    expect(r.cacheHits).toBe(1)
    expect(r.external).toBe(0)
    expect(r.placeNames).toBe(null) // nothing NEW to persist
    expect(days[0].decisions[0].place.name).toBe('Some Town, VT')
  })

  it('a genuine Nominatim miss leaves the coords name untouched, no cache write', async () => {
    const trip = {}
    const days = [{ decisions: [decision(43.0, -71.0)] }]
    const r = await nameDiscoveredPlaces(trip, days, new Map(), { reverseGeocode: async () => null })
    expect(r.renamed).toBe(0)
    expect(r.placeNames).toBe(null)
    expect(days[0].decisions[0].place.name).toBe(discoveredName(43.0, -71.0))
  })

  it('AMBIGUOUS (a real stacked-places cluster) NEVER falls through to Nominatim — the exact bug adversarial review caught', async () => {
    const trip = { days: [{ stops: [BEACH_STOP, PARADE_STOP] }] }
    // The cluster sits at LODGING's coords, within 150m of BOTH stacked
    // candidates, with NO placeType signal to disambiguate them.
    const days = [{ decisions: [decision(LODGING.lat, LODGING.lng)] }]
    const reverseGeocode = async () => { throw new Error('should NEVER be called — AMBIGUOUS is terminal, not a residue case') }
    const r = await nameDiscoveredPlaces(trip, days, new Map(), { reverseGeocode })
    expect(r.renamed).toBe(0)
    expect(r.external).toBe(0)
    expect(r.placeNames).toBe(null)
    // The coords-derived name is left EXACTLY as buildTripDecisions produced it.
    expect(days[0].decisions[0].place.name).toBe(discoveredName(LODGING.lat, LODGING.lng))
    expect(days[0].decisions[0].signals.discoveredNameSource).toBeUndefined()
  })
})

describe('reverseGeocodeWorker (worker-side Nominatim reverse geocode)', () => {
  afterEach(() => vi.unstubAllGlobals())
  function stubFetch(status, body) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))
  }

  it('prefers "locality, region" when both are distinct', async () => {
    stubFetch(200, { address: { town: 'Provincetown', state: 'Massachusetts' } })
    expect(await reverseGeocodeWorker(42.06, -70.16)).toBe('Provincetown, Massachusetts')
  })

  it('falls back through city/town/village/hamlet/suburb/county in order', async () => {
    stubFetch(200, { address: { village: 'Little Town', state: 'VT' } })
    expect(await reverseGeocodeWorker(1, 2)).toBe('Little Town, VT')
  })

  it('locality alone when region is missing or identical to locality', async () => {
    stubFetch(200, { address: { city: 'Boston' } })
    expect(await reverseGeocodeWorker(1, 2)).toBe('Boston')
    stubFetch(200, { address: { city: 'Boston', state: 'Boston' } })
    expect(await reverseGeocodeWorker(1, 2)).toBe('Boston')
  })

  it('region alone when no locality field is present', async () => {
    stubFetch(200, { address: { country: 'USA' } })
    expect(await reverseGeocodeWorker(1, 2)).toBe('USA')
  })

  it('falls back to the first two comma-separated display_name segments when address has nothing usable', async () => {
    stubFetch(200, { address: {}, display_name: 'Somewhere Rd, Some Town, Some County, Some State, USA' })
    expect(await reverseGeocodeWorker(1, 2)).toBe('Somewhere Rd, Some Town')
  })

  it('a non-ok response → null', async () => {
    stubFetch(500, {})
    expect(await reverseGeocodeWorker(1, 2)).toBe(null)
  })

  it('a fetch throw → null, never propagates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await reverseGeocodeWorker(1, 2)).toBe(null)
  })

  it('non-finite coords → null, never calls fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await reverseGeocodeWorker(NaN, 2)).toBe(null)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends an identifying User-Agent (server-side; no implicit browser Referer)', async () => {
    let seenHeaders
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      seenHeaders = opts.headers
      return new Response(JSON.stringify({ address: { city: 'X' } }), { status: 200 })
    }))
    await reverseGeocodeWorker(1, 2)
    expect(seenHeaders['User-Agent']).toMatch(/roadtrip/i)
  })
})
