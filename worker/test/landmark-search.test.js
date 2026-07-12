// landmarkSearch.js (Build 4c) — resolveLandmarkPin's hard distance gate
// (bias is soft, this is not), dominantSignage's mode-across-photos shape,
// and resolveLandmarkPins' positive+negative cache (a hit never expires, a
// miss retries after the 7-day cooldown — the resolveTripHero precedent).
import { describe, it, expect } from 'vitest'
import {
  resolveLandmarkPin,
  dominantSignage,
  buildSignageIndex,
  resolveLandmarkPins,
  typeGateAgrees,
} from '../src/landmarkSearch.js'

const STAY = { lat: 42.0621, lng: -70.1634 } // Provincetown
const DAY_MS = 24 * 60 * 60 * 1000

// EXACT degree-latitude offset for a meter distance along a meridian, using
// the SAME spherical-earth formula landmarkSearch.js's own haversineMeters
// uses — so a boundary test lands exactly on the real 5000m cutoff instead
// of an approximation that could drift off it.
const EARTH_R = 6371000
const metersToLatDeg = (m) => (m / EARTH_R) * (180 / Math.PI)

describe('resolveLandmarkPin', () => {
  it('a nearby hit resolves to a pin', async () => {
    const search = async () => ({ results: [{ lat: 42.063, lng: -70.164, name: 'Spiritus Pizza' }] })
    const pin = await resolveLandmarkPin({}, 'Spiritus Pizza', STAY, { search })
    // W0b: `types` rides along ([] when Places didn't return any) — this
    // function stays a pure proximity resolver, no gating decision here.
    expect(pin).toEqual({ lat: 42.063, lng: -70.164, name: 'Spiritus Pizza', types: [] })
  })

  it('W0b: a hit carrying venue types passes them through untouched', async () => {
    const search = async () => ({ results: [{ lat: 42.063, lng: -70.164, name: 'Spiritus Pizza', types: ['restaurant', 'point_of_interest'] }] })
    const pin = await resolveLandmarkPin({}, 'Spiritus Pizza', STAY, { search })
    expect(pin.types).toEqual(['restaurant', 'point_of_interest'])
  })

  it('a hit beyond the HARD distance gate is rejected even though the soft bias "matched" it', async () => {
    const search = async () => ({ results: [{ lat: 43.5, lng: -71.5, name: 'Spiritus Pizza (wrong state)' }] })
    const pin = await resolveLandmarkPin({}, 'Spiritus Pizza', STAY, { search })
    expect(pin).toBe(null)
  })

  it('EXACT BOUNDARY: a hit exactly 5000m away is ACCEPTED (<=)', async () => {
    const dLat = metersToLatDeg(5000)
    const search = async () => ({ results: [{ lat: STAY.lat + dLat, lng: STAY.lng, name: 'Right At The Line' }] })
    const pin = await resolveLandmarkPin({}, 'x', STAY, { search })
    expect(pin).not.toBe(null)
    expect(pin.name).toBe('Right At The Line')
  })

  it('EXACT BOUNDARY: a hit just past 5000m (5001m) is REJECTED', async () => {
    const dLat = metersToLatDeg(5001)
    const search = async () => ({ results: [{ lat: STAY.lat + dLat, lng: STAY.lng, name: 'Just Past The Line' }] })
    const pin = await resolveLandmarkPin({}, 'x', STAY, { search })
    expect(pin).toBe(null)
  })

  it('no results → null', async () => {
    const pin = await resolveLandmarkPin({}, 'x', STAY, { search: async () => ({ results: [] }) })
    expect(pin).toBe(null)
  })

  it('a search throw → null, never propagates', async () => {
    const pin = await resolveLandmarkPin({}, 'x', STAY, { search: async () => { throw new Error('places 500') } })
    expect(pin).toBe(null)
  })

  it('empty query or missing coords → null, never calls search', async () => {
    let called = false
    const search = async () => { called = true; return { results: [] } }
    expect(await resolveLandmarkPin({}, '', STAY, { search })).toBe(null)
    expect(await resolveLandmarkPin({}, 'x', null, { search })).toBe(null)
    expect(called).toBe(false)
  })
})

describe('dominantSignage', () => {
  const idx = new Map([['a', 'Spiritus Pizza'], ['b', 'Spiritus Pizza'], ['c', 'Spirits Ice Cream']])
  it('mode across photos, ties break to first-seen', () => {
    expect(dominantSignage(['a', 'b', 'c'], idx)).toBe('Spiritus Pizza')
  })
  it('a TRUE 1-vs-1 tie breaks to first-seen (not last-seen)', () => {
    const tieIdx = new Map([['x', 'Query A'], ['y', 'Query B']])
    expect(dominantSignage(['x', 'y'], tieIdx)).toBe('Query A')
    // Order in the photoIds list matters, not insertion order in the index —
    // this pins the actual iteration behavior against a >= vs > mutation.
    const tieIdx2 = new Map([['y', 'Query B'], ['x', 'Query A']])
    expect(dominantSignage(['y', 'x'], tieIdx2)).toBe('Query B')
  })
  it('a single occurrence is still worth trying', () => {
    expect(dominantSignage(['c'], idx)).toBe('Spirits Ice Cream')
  })
  it('no photos with signage → null', () => {
    expect(dominantSignage(['zzz'], idx)).toBe(null)
    expect(dominantSignage([], idx)).toBe(null)
  })
})

describe('buildSignageIndex', () => {
  it('maps ref key → vision.signage, skipping refs without one', () => {
    const rows = [{ photo_r2_keys_json: JSON.stringify([
      { key: 'k1', vision: { signage: 'Spiritus Pizza' } },
      { key: 'k2', vision: { signage: null } },
      { key: 'k3' },
    ]) }]
    const idx = buildSignageIndex(rows)
    expect(idx.get('k1')).toBe('Spiritus Pizza')
    expect(idx.has('k2')).toBe(false)
    expect(idx.has('k3')).toBe(false)
  })
  it('malformed JSON row → skipped, never throws', () => {
    expect(buildSignageIndex([{ photo_r2_keys_json: 'not json' }]).size).toBe(0)
  })
})

describe('resolveLandmarkPins', () => {
  function decision(photoIds) {
    return { photoIds, signals: {} }
  }
  const signageByRef = new Map([['p1', 'Spiritus Pizza']])
  // No placeTypeByRef entries → dominantPlaceType is always null → the W0b
  // gate always abstains — these tests exercise the CACHE/PROXIMITY behavior
  // untouched by the type gate (its own describe block below covers that).
  const noPlaceTypes = new Map()

  it('no resolvable stay coords → skipped entirely (honest abstention)', async () => {
    const trip = {}
    const days = [{ decisions: [decision(['p1'])] }]
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, noPlaceTypes)
    expect(r.pinned).toBe(0)
    expect(r.landmarkLookups).toBe(null)
  })

  it('a fresh hit pins the decision at the RESOLVED venue coords (not the stay/bias coords), caches types too, but never leaks types onto the ledger-facing pin', async () => {
    const trip = { lodging: STAY }
    const days = [{ decisions: [decision(['p1'])] }]
    const search = async () => ({ results: [{ lat: STAY.lat + 0.001, lng: STAY.lng, name: 'Spiritus Pizza', types: ['restaurant'] }] })
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, noPlaceTypes, { search })
    expect(r.pinned).toBe(1)
    // Exact-value, not toMatchObject: a bug that wrote the stay/bias coords
    // instead of the resolved hit's coords must fail this. No `types` key —
    // rule 4: the type-gate's input never rides the ledger-facing pin.
    expect(days[0].decisions[0].signals.pin).toEqual({
      lat: STAY.lat + 0.001, lng: STAY.lng, name: 'Spiritus Pizza', source: 'landmark', query: 'Spiritus Pizza',
    })
    // The CACHE entry, unlike the ledger pin, DOES carry types (W0b) — so a
    // future decision with a different dominant placeType can gate on it.
    expect(r.landmarkLookups['Spiritus Pizza'].pin).toEqual({ lat: STAY.lat + 0.001, lng: STAY.lng, name: 'Spiritus Pizza', types: ['restaurant'] })
  })

  it('a NEW-SHAPE cached HIT (carries types) reapplies the pin without calling search again — never expires', async () => {
    const trip = { lodging: STAY, landmarkLookups: { 'Spiritus Pizza': { pin: { lat: 1, lng: 2, name: 'Spiritus Pizza', types: [] } } } }
    const days = [{ decisions: [decision(['p1'])] }]
    const search = async () => { throw new Error('should never be called — cache hit') }
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, noPlaceTypes, { search })
    expect(r.pinned).toBe(1)
    expect(r.cacheHits).toBe(1)
    expect(r.landmarkLookups).toBe(null) // nothing NEW to persist
  })

  it('W0b: an OLD-SHAPE cached HIT (pre-W0b, no stored types) re-resolves ONCE to backfill the type, upgrading the cache', async () => {
    const trip = { lodging: STAY, landmarkLookups: { 'Spiritus Pizza': { pin: { lat: 1, lng: 2, name: 'Spiritus Pizza' } } } }
    const days = [{ decisions: [decision(['p1'])] }]
    let calls = 0
    const search = async () => { calls++; return { results: [{ lat: STAY.lat, lng: STAY.lng, name: 'Spiritus Pizza', types: ['restaurant'] }] } }
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, noPlaceTypes, { search })
    expect(calls).toBe(1) // the legacy entry was actually re-queried, not blindly trusted
    expect(r.legacyTypelessCacheEntries).toBe(1)
    expect(r.pinned).toBe(1)
    expect(r.landmarkLookups['Spiritus Pizza'].pin.types).toEqual(['restaurant']) // cache upgraded to new shape
  })

  it('W0b: an OLD-SHAPE cached HIT with the fresh-resolve budget already spent passes through UNGATED (counted, never dropped)', async () => {
    const trip = { lodging: STAY, landmarkLookups: { 'Spiritus Pizza': { pin: { lat: 1, lng: 2, name: 'Spiritus Pizza' } } } }
    const days = [{ decisions: [decision(['p1'])] }]
    const search = async () => { throw new Error('should never be called — limit already spent') }
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, noPlaceTypes, { search, limit: 0 })
    expect(r.legacyTypelessCacheEntries).toBe(1)
    expect(r.pinned).toBe(1) // passed through, not silently dropped
    expect(days[0].decisions[0].signals.pin).toMatchObject({ name: 'Spiritus Pizza' })
  })

  it('W0b (adversarial review, 2026-07-12): an OLD-SHAPE cached HIT whose re-resolve attempt FAILS keeps the old pin — never overwritten with a miss marker', async () => {
    const trip = { lodging: STAY, landmarkLookups: { 'Spiritus Pizza': { pin: { lat: 1, lng: 2, name: 'Spiritus Pizza' } } } }
    const days = [{ decisions: [decision(['p1'])] }]
    // A failed re-resolve (network error, quota, or a genuine miss) must not
    // be treated as a fresh MISS for an already-confirmed legacy pin — that
    // would silently drop a pin the family already sees, and violate the
    // "a cached HIT never expires" invariant this same file documents above.
    const search = async () => ({ results: [] })
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, noPlaceTypes, { search })
    expect(r.legacyTypelessCacheEntries).toBe(1)
    expect(r.misses).toBe(0) // NOT counted as a miss
    expect(r.pinned).toBe(1) // the old pin passed through, ungated
    expect(days[0].decisions[0].signals.pin).toMatchObject({ lat: 1, lng: 2, name: 'Spiritus Pizza' })
    // The cache entry itself must be untouched — no missAt marker written
    // over the previously-confirmed pin.
    expect(r.landmarkLookups).toBe(null)
    expect(trip.landmarkLookups['Spiritus Pizza']).toEqual({ pin: { lat: 1, lng: 2, name: 'Spiritus Pizza' } })
  })

  it('a fresh MISS is cached with a timestamp, not re-tried within the cooldown', async () => {
    const trip = { lodging: STAY }
    const days = [{ decisions: [decision(['p1'])] }]
    const now = 1000000
    const r1 = await resolveLandmarkPins({}, trip, days, signageByRef, noPlaceTypes, { search: async () => ({ results: [] }), now })
    expect(r1.misses).toBe(1)
    expect(r1.landmarkLookups['Spiritus Pizza'].missAt).toBe(now)

    // Re-run immediately (within the 7-day cooldown) with a trip carrying that
    // cache — must NOT re-call search.
    const trip2 = { lodging: STAY, landmarkLookups: r1.landmarkLookups }
    const search2 = async () => { throw new Error('should never be called — cooldown') }
    const r2 = await resolveLandmarkPins({}, trip2, [{ decisions: [decision(['p1'])] }], signageByRef, noPlaceTypes, { search: search2, now: now + DAY_MS })
    expect(r2.misses).toBe(0)
    expect(r2.pinned).toBe(0)
  })

  it('EXACT BOUNDARY: a miss at EXACTLY 7 days old is retried (the cooldown window is < , not <=)', async () => {
    const now = 1000000
    const SEVEN_DAYS_MS = 7 * DAY_MS
    const trip = { lodging: STAY, landmarkLookups: { 'Spiritus Pizza': { missAt: now } } }
    const days = [{ decisions: [decision(['p1'])] }]
    const search = async () => ({ results: [{ lat: STAY.lat, lng: STAY.lng, name: 'Spiritus Pizza' }] })
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, noPlaceTypes, { search, now: now + SEVEN_DAYS_MS })
    expect(r.pinned).toBe(1)
  })

  it('EXACT BOUNDARY: a miss ONE MS shy of 7 days old is still within cooldown, not retried', async () => {
    const now = 1000000
    const SEVEN_DAYS_MS = 7 * DAY_MS
    const trip = { lodging: STAY, landmarkLookups: { 'Spiritus Pizza': { missAt: now } } }
    const days = [{ decisions: [decision(['p1'])] }]
    const search = async () => { throw new Error('should never be called — still within cooldown') }
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, noPlaceTypes, { search, now: now + SEVEN_DAYS_MS - 1 })
    expect(r.pinned).toBe(0)
    expect(r.misses).toBe(0)
  })

  it('a stale MISS (past the 7-day cooldown) is retried', async () => {
    const now = 1000000
    const trip = { lodging: STAY, landmarkLookups: { 'Spiritus Pizza': { missAt: now } } }
    const days = [{ decisions: [decision(['p1'])] }]
    const search = async () => ({ results: [{ lat: STAY.lat, lng: STAY.lng, name: 'Spiritus Pizza' }] })
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, noPlaceTypes, { search, now: now + 8 * DAY_MS })
    expect(r.pinned).toBe(1)
  })

  it('a decision with no dominant signage is skipped entirely', async () => {
    const trip = { lodging: STAY }
    const days = [{ decisions: [decision(['zzz'])] }]
    const search = async () => { throw new Error('should never be called') }
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, noPlaceTypes, { search })
    expect(r.pinned).toBe(0)
    expect(r.misses).toBe(0)
  })

  it('respects the limit on FRESH attempts (cache hits are free and unbounded)', async () => {
    const trip = { lodging: STAY }
    const idx = new Map([['p1', 'Query A'], ['p2', 'Query B']])
    const days = [{ decisions: [decision(['p1']), decision(['p2'])] }]
    let calls = 0
    const search = async () => { calls++; return { results: [] } }
    const r = await resolveLandmarkPins({}, trip, days, idx, noPlaceTypes, { search, limit: 1 })
    expect(calls).toBe(1)
    expect(r.misses).toBe(1)
  })
})

// ── W0b — the landmark type-gate, exercised end-to-end through
// resolveLandmarkPins (BUILD_PLAN_WITNESS_FLEET_2.md) ─────────────────────
describe('resolveLandmarkPins — W0b type gate', () => {
  function decision(photoIds) {
    return { photoIds, signals: {} }
  }
  const signageByRef = new Map([['p1', 'Spirits Ice Cream']]) // the plan's own misread-sign example

  it("THE PLAN'S OWN EXAMPLE: a restaurant-typed moment does NOT pin a liquor store from a misread sign", async () => {
    const trip = { lodging: STAY }
    const placeTypeByRef = new Map([['p1', 'restaurant']])
    const days = [{ decisions: [decision(['p1'])] }]
    const search = async () => ({ results: [{ lat: STAY.lat, lng: STAY.lng, name: 'Spirits Liquor', types: ['liquor_store'] }] })
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, placeTypeByRef, { search })
    expect(r.typeVetoed).toBe(1)
    expect(r.pinned).toBe(0)
    expect(days[0].decisions[0].signals.pin).toBeUndefined()
  })

  it('a restaurant-typed moment DOES pin an actual restaurant/cafe/bar/bakery hit', async () => {
    const trip = { lodging: STAY }
    const placeTypeByRef = new Map([['p1', 'restaurant']])
    const days = [{ decisions: [decision(['p1'])] }]
    const search = async () => ({ results: [{ lat: STAY.lat, lng: STAY.lng, name: 'Spiritus Pizza', types: ['restaurant', 'point_of_interest'] }] })
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, placeTypeByRef, { search })
    expect(r.pinned).toBe(1)
    expect(r.typeVetoed).toBe(0)
  })

  it('a shop-typed moment pins a store-family venue, vetoes a restaurant venue', async () => {
    const trip = { lodging: STAY }
    const placeTypeByRef = new Map([['p1', 'shop']])
    const days = [{ decisions: [decision(['p1'])] }]
    const shopHit = async () => ({ results: [{ lat: STAY.lat, lng: STAY.lng, name: 'The Shop', types: ['clothing_store'] }] })
    const r1 = await resolveLandmarkPins({}, trip, days, signageByRef, placeTypeByRef, { search: shopHit })
    expect(r1.pinned).toBe(1)

    const restaurantHit = async () => ({ results: [{ lat: STAY.lat, lng: STAY.lng, name: 'Not A Shop', types: ['restaurant'] }] })
    const days2 = [{ decisions: [decision(['p1'])] }]
    const r2 = await resolveLandmarkPins({}, { lodging: STAY }, days2, signageByRef, placeTypeByRef, { search: restaurantHit })
    expect(r2.typeVetoed).toBe(1)
    expect(r2.pinned).toBe(0)
  })

  it('a beach/park/museum-typed moment requires the DIRECT same type (near-miss category vetoes)', async () => {
    const beachType = new Map([['p1', 'beach']])
    const parkHit = async () => ({ results: [{ lat: STAY.lat, lng: STAY.lng, name: 'A Park', types: ['park'] }] })
    const r1 = await resolveLandmarkPins({}, { lodging: STAY }, [{ decisions: [decision(['p1'])] }], signageByRef, beachType, { search: parkHit })
    expect(r1.typeVetoed).toBe(1) // beach moment, park venue — near-miss, vetoed

    const beachHit = async () => ({ results: [{ lat: STAY.lat, lng: STAY.lng, name: 'The Beach', types: ['beach'] }] })
    const r2 = await resolveLandmarkPins({}, { lodging: STAY }, [{ decisions: [decision(['p1'])] }], signageByRef, beachType, { search: beachHit })
    expect(r2.pinned).toBe(1) // direct match
  })

  it('event/street/residential moments NEVER veto — no Places category maps cleanly onto them', async () => {
    for (const placeType of ['event', 'street', 'residential']) {
      const placeTypeByRef = new Map([['p1', placeType]])
      const search = async () => ({ results: [{ lat: STAY.lat, lng: STAY.lng, name: 'Anything', types: ['liquor_store'] }] })
      const r = await resolveLandmarkPins({}, { lodging: STAY }, [{ decisions: [decision(['p1'])] }], signageByRef, placeTypeByRef, { search })
      expect(r.pinned).toBe(1)
      expect(r.typeVetoed).toBe(0)
    }
  })

  it('no dominant placeType at all (no vision data) → abstain, always pins', async () => {
    const search = async () => ({ results: [{ lat: STAY.lat, lng: STAY.lng, name: 'Anything', types: ['liquor_store'] }] })
    const r = await resolveLandmarkPins({}, { lodging: STAY }, [{ decisions: [decision(['p1'])] }], signageByRef, new Map(), { search })
    expect(r.pinned).toBe(1)
  })

  it('an unmapped placeType (indoor-other/outdoor-other, the vision catch-alls) → abstain, always pins', async () => {
    for (const placeType of ['indoor-other', 'outdoor-other']) {
      const placeTypeByRef = new Map([['p1', placeType]])
      const search = async () => ({ results: [{ lat: STAY.lat, lng: STAY.lng, name: 'Anything', types: ['liquor_store'] }] })
      const r = await resolveLandmarkPins({}, { lodging: STAY }, [{ decisions: [decision(['p1'])] }], signageByRef, placeTypeByRef, { search })
      expect(r.pinned).toBe(1)
    }
  })

  it('ABSENT venue types on the hit itself → abstain, never blocks (the pin already needed signage + proximity)', async () => {
    const placeTypeByRef = new Map([['p1', 'restaurant']])
    const search = async () => ({ results: [{ lat: STAY.lat, lng: STAY.lng, name: 'No Types Returned' }] }) // no `types` at all
    const r = await resolveLandmarkPins({}, { lodging: STAY }, [{ decisions: [decision(['p1'])] }], signageByRef, placeTypeByRef, { search })
    expect(r.pinned).toBe(1)
  })

  it('a NEW-SHAPE cached pin gates PER-MOMENT: the SAME cached venue agrees for one decision, vetoes for another', async () => {
    const trip = {
      lodging: STAY,
      landmarkLookups: { 'Spirits Ice Cream': { pin: { lat: STAY.lat, lng: STAY.lng, name: 'Spirits Liquor', types: ['liquor_store'] } } },
    }
    const placeTypeByRef = new Map([['p1', 'shop'], ['p2', 'restaurant']])
    const days = [{ decisions: [decision(['p1']), decision(['p2'])] }]
    const twoRefSignage = new Map([['p1', 'Spirits Ice Cream'], ['p2', 'Spirits Ice Cream']])
    const search = async () => { throw new Error('should never be called — cache hit, gate evaluated locally') }
    const r = await resolveLandmarkPins({}, trip, days, twoRefSignage, placeTypeByRef, { search })
    expect(r.pinned).toBe(1) // the 'shop' decision — liquor_store matches shop's store-family rule
    expect(r.typeVetoed).toBe(1) // the 'restaurant' decision — liquor_store contradicts restaurant
  })
})

describe('typeGateAgrees (pure — mutation-tested boundary/near-miss)', () => {
  it('restaurant: agrees with each of restaurant/cafe/bar/bakery', () => {
    for (const t of ['restaurant', 'cafe', 'bar', 'bakery']) {
      expect(typeGateAgrees('restaurant', [t])).toBe(true)
    }
  })
  it('restaurant: a near-miss (liquor_store) is REJECTED — the exact misread-sign example', () => {
    expect(typeGateAgrees('restaurant', ['liquor_store'])).toBe(false)
  })
  it('restaurant: a mixed list agrees if ANY type matches', () => {
    expect(typeGateAgrees('restaurant', ['point_of_interest', 'cafe'])).toBe(true)
  })
  it('shop: agrees with "store" exactly and any "*_store" suffix', () => {
    expect(typeGateAgrees('shop', ['store'])).toBe(true)
    expect(typeGateAgrees('shop', ['clothing_store'])).toBe(true)
    expect(typeGateAgrees('shop', ['shopping_mall'])).toBe(true)
    expect(typeGateAgrees('shop', ['market'])).toBe(true)
    expect(typeGateAgrees('shop', ['supermarket'])).toBe(true)
  })
  it('shop: a near-miss that merely CONTAINS "store" as a substring (not the "*_store" suffix) is REJECTED — not a loose match', () => {
    expect(typeGateAgrees('shop', ['storefront'])).toBe(false)
  })
  it('shop: a restaurant type is REJECTED', () => {
    expect(typeGateAgrees('shop', ['restaurant'])).toBe(false)
  })
  it('beach/park/museum: DIRECT match only — the exact same token', () => {
    expect(typeGateAgrees('beach', ['beach'])).toBe(true)
    expect(typeGateAgrees('park', ['park'])).toBe(true)
    expect(typeGateAgrees('museum', ['museum'])).toBe(true)
  })
  it('beach/park/museum: a near-miss (a DIFFERENT direct-mapped type) is REJECTED', () => {
    expect(typeGateAgrees('beach', ['park'])).toBe(false)
    expect(typeGateAgrees('museum', ['art_gallery'])).toBe(false)
  })
  it('event/street/residential: NEVER veto, regardless of venue types', () => {
    expect(typeGateAgrees('event', ['liquor_store'])).toBe(true)
    expect(typeGateAgrees('street', ['museum'])).toBe(true)
    expect(typeGateAgrees('residential', [])).toBe(true)
  })
  it('an absent/null/unmapped placeType always agrees (abstain)', () => {
    expect(typeGateAgrees(null, ['liquor_store'])).toBe(true)
    expect(typeGateAgrees(undefined, ['liquor_store'])).toBe(true)
    expect(typeGateAgrees('indoor-other', ['liquor_store'])).toBe(true)
    expect(typeGateAgrees('outdoor-other', ['liquor_store'])).toBe(true)
    expect(typeGateAgrees('some-future-type', ['liquor_store'])).toBe(true)
  })
  it('absent/empty venue types always agrees (abstain, never blocks)', () => {
    expect(typeGateAgrees('restaurant', [])).toBe(true)
    expect(typeGateAgrees('restaurant', undefined)).toBe(true)
    expect(typeGateAgrees('restaurant', null)).toBe(true)
  })
  it('never throws on malformed input', () => {
    expect(() => typeGateAgrees('restaurant', 'not-an-array')).not.toThrow()
    expect(typeGateAgrees('restaurant', 'not-an-array')).toBe(true) // filters to [] → abstain
    expect(() => typeGateAgrees('restaurant', [null, 123, 'restaurant'])).not.toThrow()
    expect(typeGateAgrees('restaurant', [null, 123, 'restaurant'])).toBe(true) // non-strings filtered, real match survives
  })
})
