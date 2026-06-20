import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// localStorage polyfill (memoryStore is browser-targeted; workerSync only lazy-
// loads inside scheduleMirror, which is inert here — not configured).
class MemStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
  clear() { this.map.clear() }
}
globalThis.localStorage = new MemStorage()

const { refileTripToPlaces } = await import('../../src/lib/refilePlaces.js')
const { implicitBaseIdForDay } = await import('../../src/lib/photoMatch.js')

const SHARED = 'rt_memories_shared_v1'
const readShared = () => JSON.parse(globalThis.localStorage.getItem(SHARED) || '[]')
const writeShared = (a) => globalThis.localStorage.setItem(SHARED, JSON.stringify(a))
const getById = (id) => readShared().find((m) => m.id === id)

const CABIN = { lat: 43.21, lng: -72.9 }
const DINNER = { lat: 43.3, lng: -72.8 } // ~13km from the cabin
const trip = {
  id: 't', dateRangeStart: '2026-06-19', dateRangeEnd: '2026-06-20',
  lodging: { name: 'The Cabin' },
  homeBase: { lat: CABIN.lat, lng: CABIN.lng, label: '613 Forest Mtn Rd' },
  days: [
    { n: 1, isoDate: '2026-06-19', title: 'd1', stops: [{ id: 'dinner', kind: 'food', time: '7:00 PM', name: 'Dinner', lat: DINNER.lat, lng: DINNER.lng }] },
    { n: 2, isoDate: '2026-06-20', title: 'd2', stops: [] },
  ],
}
const mem = (id, refs) => ({ id, tripId: 't', stopId: 'dinner', authorTraveler: 'helen', visibility: 'shared', kind: 'photo', photoRefs: refs })

beforeEach(() => globalThis.localStorage.clear())

test('refile: a cabin photo filed to "dinner" moves to the implicit base (dry-run counts, real run applies, idempotent)', () => {
  writeShared([mem('m1', [{ storage: 'r2', key: 'k', lat: CABIN.lat, lng: CABIN.lng, capturedAt: '2026-06-19T20:00:00.000Z' }])])
  const baseId = implicitBaseIdForDay('2026-06-19')

  assert.equal(refileTripToPlaces(trip, { traveler: 'helen', dryRun: true }).movedMemories, 1)
  assert.equal(getById('m1').stopId, 'dinner', 'dry run does not mutate')

  assert.equal(refileTripToPlaces(trip, { traveler: 'helen' }).movedMemories, 1)
  assert.equal(getById('m1').stopId, baseId, 'moved to the implicit base')

  assert.equal(refileTripToPlaces(trip, { traveler: 'helen' }).movedMemories, 0, 'idempotent')
})

test('refile: counts PHOTOS, not memories — a 3-photo cabin album reports 3 photos moving', () => {
  writeShared([mem('m1b', [
    { storage: 'r2', key: 'a', lat: CABIN.lat, lng: CABIN.lng, capturedAt: '2026-06-19T20:00:00.000Z' },
    { storage: 'r2', key: 'b', lat: CABIN.lat, lng: CABIN.lng, capturedAt: '2026-06-19T20:01:00.000Z' },
    { storage: 'r2', key: 'c', lat: CABIN.lat, lng: CABIN.lng, capturedAt: '2026-06-19T20:02:00.000Z' },
  ])])
  const res = refileTripToPlaces(trip, { traveler: 'helen', dryRun: true })
  assert.equal(res.movedMemories, 1)
  assert.equal(res.movedPhotos, 3, 'the confirm/toast must state the real photo count, not the memory count')
})

test('refile: a photo actually AT the dinner is NOT moved', () => {
  writeShared([mem('m2', [{ storage: 'r2', key: 'k', lat: DINNER.lat, lng: DINNER.lng, capturedAt: '2026-06-19T19:30:00.000Z' }])])
  assert.equal(refileTripToPlaces(trip, { traveler: 'helen' }).movedMemories, 0)
  assert.equal(getById('m2').stopId, 'dinner')
})

test('refile: a multi-photo memory whose photos disagree (cabin + dinner) is NOT split', () => {
  writeShared([mem('m4', [
    { storage: 'r2', key: 'a', lat: CABIN.lat, lng: CABIN.lng, capturedAt: '2026-06-19T20:00:00.000Z' },
    { storage: 'r2', key: 'b', lat: DINNER.lat, lng: DINNER.lng, capturedAt: '2026-06-19T19:30:00.000Z' },
  ])])
  assert.equal(refileTripToPlaces(trip, { traveler: 'helen' }).movedMemories, 0)
  assert.equal(getById('m4').stopId, 'dinner')
})

test('refile: a trip with no implicit base (single-day, no lodging) moves nothing', () => {
  const dayTrip = { ...trip, lodging: undefined, dateRangeEnd: '2026-06-19', days: [trip.days[0]] }
  writeShared([mem('m3', [{ storage: 'r2', key: 'k', lat: CABIN.lat, lng: CABIN.lng, capturedAt: '2026-06-19T20:00:00.000Z' }])])
  assert.equal(refileTripToPlaces(dayTrip, { traveler: 'helen' }).movedMemories, 0)
  assert.equal(getById('m3').stopId, 'dinner')
})

test('refile: a masked projection is never moved', () => {
  writeShared([{ ...mem('m5', [{ storage: 'r2', key: 'k', lat: CABIN.lat, lng: CABIN.lng, capturedAt: '2026-06-19T20:00:00.000Z' }]), masked: true }])
  assert.equal(refileTripToPlaces(trip, { traveler: 'helen' }).movedMemories, 0)
})
