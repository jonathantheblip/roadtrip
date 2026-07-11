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
    expect(pin).toEqual({ lat: 42.063, lng: -70.164, name: 'Spiritus Pizza' })
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

  it('no resolvable stay coords → skipped entirely (honest abstention)', async () => {
    const trip = {}
    const days = [{ decisions: [decision(['p1'])] }]
    const r = await resolveLandmarkPins({}, trip, days, signageByRef)
    expect(r.pinned).toBe(0)
    expect(r.landmarkLookups).toBe(null)
  })

  it('a fresh hit pins the decision at the RESOLVED venue coords (not the stay/bias coords) and caches the exact same shape', async () => {
    const trip = { lodging: STAY }
    const days = [{ decisions: [decision(['p1'])] }]
    const search = async () => ({ results: [{ lat: STAY.lat + 0.001, lng: STAY.lng, name: 'Spiritus Pizza' }] })
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, { search })
    expect(r.pinned).toBe(1)
    // Exact-value, not toMatchObject: a bug that wrote the stay/bias coords
    // instead of the resolved hit's coords must fail this.
    expect(days[0].decisions[0].signals.pin).toEqual({
      lat: STAY.lat + 0.001, lng: STAY.lng, name: 'Spiritus Pizza', source: 'landmark', query: 'Spiritus Pizza',
    })
    expect(r.landmarkLookups['Spiritus Pizza'].pin).toEqual({ lat: STAY.lat + 0.001, lng: STAY.lng, name: 'Spiritus Pizza' })
  })

  it('a cached HIT reapplies the pin without calling search again — never expires', async () => {
    const trip = { lodging: STAY, landmarkLookups: { 'Spiritus Pizza': { pin: { lat: 1, lng: 2, name: 'Spiritus Pizza' } } } }
    const days = [{ decisions: [decision(['p1'])] }]
    const search = async () => { throw new Error('should never be called — cache hit') }
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, { search })
    expect(r.pinned).toBe(1)
    expect(r.cacheHits).toBe(1)
    expect(r.landmarkLookups).toBe(null) // nothing NEW to persist
  })

  it('a fresh MISS is cached with a timestamp, not re-tried within the cooldown', async () => {
    const trip = { lodging: STAY }
    const days = [{ decisions: [decision(['p1'])] }]
    const now = 1000000
    const r1 = await resolveLandmarkPins({}, trip, days, signageByRef, { search: async () => ({ results: [] }), now })
    expect(r1.misses).toBe(1)
    expect(r1.landmarkLookups['Spiritus Pizza'].missAt).toBe(now)

    // Re-run immediately (within the 7-day cooldown) with a trip carrying that
    // cache — must NOT re-call search.
    const trip2 = { lodging: STAY, landmarkLookups: r1.landmarkLookups }
    const search2 = async () => { throw new Error('should never be called — cooldown') }
    const r2 = await resolveLandmarkPins({}, trip2, [{ decisions: [decision(['p1'])] }], signageByRef, { search: search2, now: now + DAY_MS })
    expect(r2.misses).toBe(0)
    expect(r2.pinned).toBe(0)
  })

  it('EXACT BOUNDARY: a miss at EXACTLY 7 days old is retried (the cooldown window is < , not <=)', async () => {
    const now = 1000000
    const SEVEN_DAYS_MS = 7 * DAY_MS
    const trip = { lodging: STAY, landmarkLookups: { 'Spiritus Pizza': { missAt: now } } }
    const days = [{ decisions: [decision(['p1'])] }]
    const search = async () => ({ results: [{ lat: STAY.lat, lng: STAY.lng, name: 'Spiritus Pizza' }] })
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, { search, now: now + SEVEN_DAYS_MS })
    expect(r.pinned).toBe(1)
  })

  it('EXACT BOUNDARY: a miss ONE MS shy of 7 days old is still within cooldown, not retried', async () => {
    const now = 1000000
    const SEVEN_DAYS_MS = 7 * DAY_MS
    const trip = { lodging: STAY, landmarkLookups: { 'Spiritus Pizza': { missAt: now } } }
    const days = [{ decisions: [decision(['p1'])] }]
    const search = async () => { throw new Error('should never be called — still within cooldown') }
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, { search, now: now + SEVEN_DAYS_MS - 1 })
    expect(r.pinned).toBe(0)
    expect(r.misses).toBe(0)
  })

  it('a stale MISS (past the 7-day cooldown) is retried', async () => {
    const now = 1000000
    const trip = { lodging: STAY, landmarkLookups: { 'Spiritus Pizza': { missAt: now } } }
    const days = [{ decisions: [decision(['p1'])] }]
    const search = async () => ({ results: [{ lat: STAY.lat, lng: STAY.lng, name: 'Spiritus Pizza' }] })
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, { search, now: now + 8 * DAY_MS })
    expect(r.pinned).toBe(1)
  })

  it('a decision with no dominant signage is skipped entirely', async () => {
    const trip = { lodging: STAY }
    const days = [{ decisions: [decision(['zzz'])] }]
    const search = async () => { throw new Error('should never be called') }
    const r = await resolveLandmarkPins({}, trip, days, signageByRef, { search })
    expect(r.pinned).toBe(0)
    expect(r.misses).toBe(0)
  })

  it('respects the limit on FRESH attempts (cache hits are free and unbounded)', async () => {
    const trip = { lodging: STAY }
    const idx = new Map([['p1', 'Query A'], ['p2', 'Query B']])
    const days = [{ decisions: [decision(['p1']), decision(['p2'])] }]
    let calls = 0
    const search = async () => { calls++; return { results: [] } }
    const r = await resolveLandmarkPins({}, trip, days, idx, { search, limit: 1 })
    expect(calls).toBe(1)
    expect(r.misses).toBe(1)
  })
})
