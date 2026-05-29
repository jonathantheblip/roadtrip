// Unit tests for the pure calendar-import filter + trip matcher.
// Run via `node --test worker/test/*.test.mjs`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  hasRecurrence,
  hasLocation,
  isAwayFromHome,
  filterCalendarEvents,
  matchTripByDateRange,
  buildCalendarImport,
  HOME,
} = await import('../src/calendarFilter.js')

// Reference coords.
const BELMONT = { lat: 42.3959, lng: -71.1787 } // home
const CAMBRIDGE = { lat: 42.3736, lng: -71.1097 } // ~4 mi — near home
const ASHEVILLE = { lat: 35.5951, lng: -82.5515 } // far
const NYC = { lat: 40.7614, lng: -73.9776 } // far

// ── recurrence ─────────────────────────────────────────────────────

test('hasRecurrence detects the recurrence shapes', () => {
  assert.equal(hasRecurrence({ hasRecurrence: true }), true)
  assert.equal(hasRecurrence({ recurrence: 'FREQ=WEEKLY' }), true)
  assert.equal(hasRecurrence({ rrule: 'FREQ=DAILY' }), true)
  assert.equal(hasRecurrence({ recurrenceRule: 'x' }), true)
  assert.equal(hasRecurrence({ title: 'one-off' }), false)
})

// ── location presence ──────────────────────────────────────────────

test('hasLocation requires a non-empty location string', () => {
  assert.equal(hasLocation({ location: 'Cúrate, Asheville' }), true)
  assert.equal(hasLocation({ location: '   ' }), false)
  assert.equal(hasLocation({ location: '' }), false)
  assert.equal(hasLocation({}), false)
})

// ── away-from-home ─────────────────────────────────────────────────

test('isAwayFromHome: near-home coords are NOT away', () => {
  assert.equal(isAwayFromHome({ location: 'Cambridge', ...CAMBRIDGE }), false)
  assert.equal(isAwayFromHome({ location: 'home', ...BELMONT }), false)
})

test('isAwayFromHome: far coords ARE away', () => {
  assert.equal(isAwayFromHome({ location: 'Cúrate', ...ASHEVILLE }), true)
  assert.equal(isAwayFromHome({ location: 'MoMA', ...NYC }), true)
})

test('isAwayFromHome: a located event with no coords is kept (safety net)', () => {
  assert.equal(isAwayFromHome({ location: 'Somewhere unresolvable' }), true)
})

test('isAwayFromHome respects a custom radius', () => {
  // With a 1-mile radius, Cambridge (~4mi) becomes "away".
  assert.equal(
    isAwayFromHome({ location: 'Cambridge', ...CAMBRIDGE }, { radiusMeters: 1609 }),
    true
  )
})

// ── the two filters together ───────────────────────────────────────

test('filterCalendarEvents keeps only non-recurring, away-from-home, located events', () => {
  const events = [
    { title: 'Karate', location: 'Dojo, Belmont', hasRecurrence: true, lat: 42.40, lng: -71.18 },
    { title: 'Dentist', location: 'Cambridge, MA', ...CAMBRIDGE },
    { title: 'Dinner at Cúrate', location: 'Cúrate, Asheville', ...ASHEVILLE },
    { title: 'No-location all-day', location: '', lat: ASHEVILLE.lat, lng: ASHEVILLE.lng },
    { title: 'MoMA', location: 'MoMA, NYC', ...NYC },
    { title: 'Recurring even though away', location: 'Gym, Asheville', hasRecurrence: true, ...ASHEVILLE },
    { title: 'Far but un-geocoded', location: 'A real place far away' }, // no coords -> kept
  ]
  const kept = filterCalendarEvents(events).map((e) => e.title)
  assert.deepEqual(kept, ['Dinner at Cúrate', 'MoMA', 'Far but un-geocoded'])
})

test('filterCalendarEvents tolerates junk input', () => {
  assert.deepEqual(filterCalendarEvents(null), [])
  assert.deepEqual(filterCalendarEvents(undefined), [])
})

// ── Path 2 trip matching ───────────────────────────────────────────

const TRIPS = [
  { id: 'asheville', dateRangeStart: '2026-10-09', dateRangeEnd: '2026-10-12' },
  { id: 'nyc', dateRangeStart: '2026-11-01', dateRangeEnd: '2026-11-03' },
  { id: 'draft-overlap', draft: true, dateRangeStart: '2026-10-10', dateRangeEnd: '2026-10-11' },
  { id: 'undated', dateRangeStart: null, dateRangeEnd: null },
]

test('matchTripByDateRange picks the covering confirmed trip', () => {
  assert.equal(
    matchTripByDateRange(TRIPS, { start: '2026-10-09', end: '2026-10-12' }),
    'asheville'
  )
})

test('matchTripByDateRange matches on partial overlap and ignores drafts', () => {
  // A single day inside Asheville's window; the draft also overlaps but
  // is skipped because it isn't confirmed.
  assert.equal(
    matchTripByDateRange(TRIPS, { start: '2026-10-10', end: '2026-10-10' }),
    'asheville'
  )
})

test('matchTripByDateRange returns null when nothing overlaps', () => {
  assert.equal(matchTripByDateRange(TRIPS, { start: '2026-12-01', end: '2026-12-02' }), null)
})

test('matchTripByDateRange tolerates datetime range strings and missing dates', () => {
  assert.equal(
    matchTripByDateRange(TRIPS, { start: '2026-11-01T09:00:00', end: '2026-11-02T18:00:00' }),
    'nyc'
  )
  assert.equal(matchTripByDateRange(TRIPS, {}), null)
  assert.equal(matchTripByDateRange([], { start: '2026-10-09', end: '2026-10-10' }), null)
})

test('HOME is Belmont, MA', () => {
  assert.ok(Math.abs(HOME.lat - 42.4) < 0.1 && Math.abs(HOME.lng + 71.18) < 0.1)
})

// ── buildCalendarImport (whole response path, mocked geocode + trips) ──

// Mock geocoder: known locations resolve, everything else is null
// (simulating a geocode miss → kept by the safety net).
const GEO = {
  'Cúrate, Asheville': { lat: ASHEVILLE.lat, lng: ASHEVILLE.lng, address: '13 Biltmore Ave, Asheville, NC 28801' },
  'Dentist, Cambridge': { lat: CAMBRIDGE.lat, lng: CAMBRIDGE.lng, address: 'Cambridge, MA' },
}
const mockGeocode = async (q) => GEO[q] || null

const IMPORT_TRIPS = [
  { id: 'asheville', dateRangeStart: '2026-10-09', dateRangeEnd: '2026-10-12' },
  { id: 'nyc', dateRangeStart: '2026-11-01', dateRangeEnd: '2026-11-03' },
]

const MIXED_EVENTS = [
  { title: 'Dinner at Cúrate', start: '2026-10-10T19:00:00', end: '2026-10-10T21:00:00', location: 'Cúrate, Asheville' },
  { title: 'Dentist', start: '2026-10-09T14:00:00', end: '2026-10-09T15:00:00', location: 'Dentist, Cambridge' },
  { title: 'Karate', start: '2026-10-10T17:00:00', end: '2026-10-10T18:00:00', location: 'Dojo', hasRecurrence: true },
  { title: 'All-day note', start: '2026-10-11', end: '2026-10-11', location: '' },
  { title: 'Mystery far place', start: '2026-10-11T12:00:00', end: '2026-10-11T13:00:00', location: 'Somewhere uncatalogued' },
]

test('buildCalendarImport (Path 1) scopes to tripId, geocodes + filters, shapes events', async () => {
  const out = await buildCalendarImport({
    tripId: 'asheville',
    dateRange: { start: '2026-10-09', end: '2026-10-12' },
    events: MIXED_EVENTS,
    trips: IMPORT_TRIPS,
    geocode: mockGeocode,
  })
  assert.equal(out.matched, true)
  assert.equal(out.tripId, 'asheville')
  // Survivors: Cúrate (away, geocoded), Mystery far place (geocode miss → kept).
  assert.deepEqual(out.events.map((e) => e.title), ['Dinner at Cúrate', 'Mystery far place'])
  const curate = out.events[0]
  assert.equal(curate.address, '13 Biltmore Ave, Asheville, NC 28801')
  assert.ok(Number.isFinite(curate.lat) && Number.isFinite(curate.lng))
  // Geocode miss → kept but no coords; address falls back to the raw location.
  const mystery = out.events[1]
  assert.equal(mystery.lat, null)
  assert.equal(mystery.address, 'Somewhere uncatalogued')
})

test('buildCalendarImport (Path 1) returns trip-not-found but still the filtered events', async () => {
  const out = await buildCalendarImport({
    tripId: 'does-not-exist',
    dateRange: { start: '2026-10-09', end: '2026-10-12' },
    events: MIXED_EVENTS,
    trips: IMPORT_TRIPS,
    geocode: mockGeocode,
  })
  assert.equal(out.matched, false)
  assert.equal(out.tripId, null)
  assert.equal(out.reason, 'trip not found')
  assert.deepEqual(out.events.map((e) => e.title), ['Dinner at Cúrate', 'Mystery far place'])
})

test('buildCalendarImport (Path 2) matches the date range to a confirmed trip', async () => {
  const out = await buildCalendarImport({
    dateRange: { start: '2026-10-10', end: '2026-10-11' },
    events: MIXED_EVENTS,
    trips: IMPORT_TRIPS,
    geocode: mockGeocode,
  })
  assert.equal(out.matched, true)
  assert.equal(out.tripId, 'asheville')
  assert.deepEqual(out.events.map((e) => e.title), ['Dinner at Cúrate', 'Mystery far place'])
})

test('buildCalendarImport (Path 2) with no covering trip returns no-matching-trip and no events', async () => {
  const out = await buildCalendarImport({
    dateRange: { start: '2026-12-24', end: '2026-12-26' },
    events: MIXED_EVENTS,
    trips: IMPORT_TRIPS,
    geocode: mockGeocode,
  })
  assert.equal(out.matched, false)
  assert.equal(out.reason, 'no matching trip')
  assert.deepEqual(out.events, [])
})

test('buildCalendarImport survives a throwing geocoder (treats as a miss → kept)', async () => {
  const out = await buildCalendarImport({
    tripId: 'asheville',
    dateRange: { start: '2026-10-09', end: '2026-10-12' },
    events: [{ title: 'Dinner at Cúrate', location: 'Cúrate, Asheville', start: '2026-10-10T19:00:00' }],
    trips: IMPORT_TRIPS,
    geocode: async () => { throw new Error('places down') },
  })
  assert.equal(out.matched, true)
  assert.deepEqual(out.events.map((e) => e.title), ['Dinner at Cúrate'])
  assert.equal(out.events[0].lat, null) // geocode failed → no coords, still kept
})
