import { test } from 'node:test'
import assert from 'node:assert/strict'

const { inferTripShape, overnightBases, isStayTrip } = await import('../../src/lib/tripShape.js')
const { JACKSON_TRIP, NYC_TRIP, VOLLEYBALL_TRIP } = await import('../../src/data/trips.js')

// ── STOP-CONDITION: the detector must match the REAL trips. Mislabeling a road
// trip as a stay would hide its drive stats (G5). These assertions are the gate. ──

test('jackson-2026 (drive across the country, 5+ distinct overnight lodgings) → ROUTE', () => {
  assert.ok(overnightBases(JACKSON_TRIP).size >= 2, 'jackson sleeps in many places')
  assert.equal(inferTripShape(JACKSON_TRIP), 'route')
})

test('volleyball-2026 (one Beach Bungalow base + homeBase) → STAY', () => {
  assert.equal(inferTripShape(VOLLEYBALL_TRIP), 'stay')
  assert.ok(isStayTrip(VOLLEYBALL_TRIP))
})

test('nyc-rafa (one Murray Hill base, drive-there-then-stay) → STAY', () => {
  assert.equal(inferTripShape(NYC_TRIP), 'stay')
})

// ── Synthetic edge cases ──

test('a Vermont-cabin-like trip (homeBase set, ~no driving, one place) → STAY', () => {
  const t = {
    id: 'vt', homeBase: { lat: 43.21, lng: -72.9, label: '613 Forest Mountain Rd' },
    lodging: { name: 'The Cabin' },
    days: [
      { n: 1, isoDate: '2026-06-19', lodging: 'The Cabin', stops: [{ id: 'd', kind: 'food', name: 'Dinner out' }] },
      { n: 2, isoDate: '2026-06-20', lodging: 'The Cabin', stops: [] },
      { n: 3, isoDate: '2026-06-21', lodging: 'The Cabin', stops: [] },
    ],
  }
  assert.equal(inferTripShape(t), 'stay')
})

test('a two-base road trip (different lodging each night) → ROUTE', () => {
  const t = { id: 'r', days: [
    { n: 1, lodging: 'Motel A', stops: [] },
    { n: 2, lodging: 'Motel B', stops: [] },
  ] }
  assert.equal(inferTripShape(t), 'route')
})

test('a trip we know nothing about (no lodging, no homeBase) → ROUTE (safe default, keeps today’s behavior)', () => {
  assert.equal(inferTripShape({ id: 'x', days: [{ n: 1, stops: [] }] }), 'route')
})

test('home-only nights are ignored; an explicit trip.shape always wins', () => {
  assert.equal(inferTripShape({ days: [{ lodging: '— (home)' }, { lodging: 'home' }] }), 'route')
  assert.equal(inferTripShape({ shape: 'stay', days: [{ lodging: 'Motel A' }, { lodging: 'Motel B' }] }), 'stay')
  assert.equal(inferTripShape({ shape: 'route', homeBase: { lat: 1, lng: 2 }, lodging: { name: 'Cabin' }, days: [] }), 'route')
})

// ── stayPlace + atPlace (geofence for the live rail) ──
const { stayPlace, atPlace } = await import('../../src/lib/tripShape.js')

test('stayPlace: coords from homeBase, friendly name from the lodging', () => {
  const p = stayPlace({ homeBase: { lat: 41.32, lng: -72.09, label: '41 Lower Blvd, New London, CT' }, lodging: { name: 'Beach Bungalow' }, days: [] })
  assert.deepEqual([p.lat, p.lng], [41.32, -72.09])
  assert.equal(p.name, 'Beach Bungalow')
})

test('stayPlace: no lodging name → first segment of the address, not the full street line', () => {
  const p = stayPlace({ homeBase: { lat: 1, lng: 2, label: '41 Lower Boulevard, New London, CT' }, days: [] })
  assert.equal(p.name, '41 Lower Boulevard')
})

test('stayPlace: no coords anywhere → null (live rail falls back to the clock)', () => {
  assert.equal(stayPlace({ lodging: { name: 'Cabin', address: 'somewhere' }, days: [] }), null)
})

test('atPlace: inside the radius → true; far → false; missing position/place → false', () => {
  const place = { lat: 41.32, lng: -72.09, name: 'Cabin' }
  assert.equal(atPlace(place, { lat: 41.3201, lng: -72.0901, accuracy: 15 }), true)
  assert.equal(atPlace(place, { lat: 41.5, lng: -72.5 }), false)
  assert.equal(atPlace(place, null), false)
  assert.equal(atPlace(null, { lat: 41.32, lng: -72.09 }), false)
})

// ── stayLabel + stayNights (home-view place card) ──
const { stayLabel, stayNights } = await import('../../src/lib/tripShape.js')

test('stayLabel: prefers the lodging name; stayNights counts real overnight days', () => {
  const t = { lodging: { name: 'Beach Bungalow' }, days: [
    { lodging: 'Beach Bungalow' }, { lodging: 'Beach Bungalow' }, { lodging: 'Beach Bungalow' }, { lodging: '— (home)' },
  ] }
  assert.equal(stayLabel(t), 'Beach Bungalow')
  assert.equal(stayNights(t), 3) // home night excluded
})

test('stayLabel: falls back to a day lodging, then the homeBase first segment, then the title', () => {
  assert.equal(stayLabel({ days: [{ lodging: 'The Cabin' }] }), 'The Cabin')
  assert.equal(stayLabel({ homeBase: { label: '613 Forest Mountain Rd, Peru, VT' }, days: [] }), '613 Forest Mountain Rd')
  assert.equal(stayLabel({ title: 'Cabin Weekend', days: [] }), 'Cabin Weekend')
})
