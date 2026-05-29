// Unit tests for reconcileDraft — the auto-classification pass that
// turns matcher output into a pre-built "what happened" proposal. Run
// via `node --test`. No DOM, no network.
//
// The core judgment under test is stop-vs-interstitial: a geographic
// deviation cluster only becomes an auto_added stop if its photos imply
// dwell (span ≥ clusterDwellMinutes); otherwise it stays interstitial.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  buildReconciliationDraft,
  clusterDwellMs,
  medianCapturedMs,
  formatClockTime,
  RECONCILE_THRESHOLDS,
  STOP_STATE,
} = await import('../../src/lib/reconcileDraft.js')

const { matchPhotosToStops } = await import('../../src/lib/photoMatch.js')

// ─── Test trip scaffolding ─────────────────────────────────────────

function makeTrip(days, extra = {}) {
  return {
    id: 'recon-trip',
    title: 'Recon Test Trip',
    status: 'archived',
    dateRangeStart: days[0].isoDate,
    dateRangeEnd: days[days.length - 1].isoDate,
    travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
    days,
    ...extra,
  }
}

const ART_OMI = { id: 's1', time: '11:00 AM', name: 'Art Omi', lat: 42.344, lng: -73.606 }
const CABIN = { id: 's2', time: '6:00 PM', name: 'Postcard Cabins', lat: 42.229, lng: -73.985 }

// Mississippi deviation geometry, proven in photoMatch.test.mjs to
// cluster and sit >2km off the McComb→Terrell route line.
const MCCOMB = { id: 'mccomb', time: '9:00 AM', name: 'McComb', lat: 31.244, lng: -90.454 }
const TERRELL = { id: 'terrell', time: '8:00 PM', name: "Buc-ee's Terrell", lat: 32.731, lng: -96.228 }
const VICKSBURG = { lat: 32.352, lng: -90.879 }

// ─── Pure helpers ──────────────────────────────────────────────────

test('clusterDwellMs: span between earliest and latest capturedAt', () => {
  const photoById = new Map([
    ['a', { id: 'a', capturedAt: '2026-04-20T15:00:00Z' }],
    ['b', { id: 'b', capturedAt: '2026-04-20T15:50:00Z' }],
    ['c', { id: 'c', capturedAt: '2026-04-20T15:25:00Z' }],
  ])
  assert.equal(clusterDwellMs(['a', 'b', 'c'], photoById), 50 * 60_000)
})

test('clusterDwellMs: fewer than two timestamps implies no dwell', () => {
  const photoById = new Map([['a', { id: 'a', capturedAt: '2026-04-20T15:00:00Z' }]])
  assert.equal(clusterDwellMs(['a'], photoById), 0)
  assert.equal(clusterDwellMs(['a', 'missing'], photoById), 0)
})

test('clusterDwellMs: ignores unparseable timestamps', () => {
  const photoById = new Map([
    ['a', { id: 'a', capturedAt: '2026-04-20T15:00:00Z' }],
    ['b', { id: 'b', capturedAt: 'not-a-date' }],
    ['c', { id: 'c', capturedAt: '2026-04-20T15:30:00Z' }],
  ])
  assert.equal(clusterDwellMs(['a', 'b', 'c'], photoById), 30 * 60_000)
})

test('medianCapturedMs: odd count picks the middle', () => {
  const photoById = new Map([
    ['a', { id: 'a', capturedAt: '2026-04-20T15:00:00Z' }],
    ['b', { id: 'b', capturedAt: '2026-04-20T15:50:00Z' }],
    ['c', { id: 'c', capturedAt: '2026-04-20T15:25:00Z' }],
  ])
  assert.equal(medianCapturedMs(['a', 'b', 'c'], photoById), Date.parse('2026-04-20T15:25:00Z'))
})

test('medianCapturedMs: even count averages the two middles', () => {
  const photoById = new Map([
    ['a', { id: 'a', capturedAt: '2026-04-20T15:00:00Z' }],
    ['b', { id: 'b', capturedAt: '2026-04-20T15:20:00Z' }],
  ])
  assert.equal(medianCapturedMs(['a', 'b'], photoById), Date.parse('2026-04-20T15:10:00Z'))
})

test('formatClockTime: UTC clock, 12-hour with AM/PM', () => {
  assert.equal(formatClockTime(Date.parse('2026-04-20T15:25:00Z')), '3:25 PM')
  assert.equal(formatClockTime(Date.parse('2026-04-20T09:05:00Z')), '9:05 AM')
  assert.equal(formatClockTime(Date.parse('2026-04-20T00:00:00Z')), '12:00 AM')
  assert.equal(formatClockTime(Date.parse('2026-04-20T12:00:00Z')), '12:00 PM')
  assert.equal(formatClockTime(NaN), '')
})

test('RECONCILE_THRESHOLDS: dwell gate is exposed for tuning', () => {
  assert.equal(RECONCILE_THRESHOLDS.clusterDwellMinutes, 20)
})

// ─── Planned-stop classification ───────────────────────────────────

test('planned stop with photos → happened; without photos → happened_no_photos', () => {
  const trip = makeTrip([
    { n: 1, isoDate: '2026-04-17', title: 'Up the Hudson', stops: [ART_OMI, CABIN] },
  ])
  const photos = [
    // At Art Omi during its window → gps+time → happened.
    { id: 'p1', capturedAt: '2026-04-17T11:30:00Z', lat: 42.344, lng: -73.606 },
  ]
  const draft = buildReconciliationDraft(photos, trip)
  const day = draft.days[0]
  const artOmi = day.stops.find((s) => s.stopId === 's1')
  const cabin = day.stops.find((s) => s.stopId === 's2')

  assert.equal(artOmi.state, STOP_STATE.HAPPENED)
  assert.deepEqual(artOmi.photoIds, ['p1'])
  assert.equal(artOmi.source, 'planned')
  assert.equal(artOmi.addedDuringReconciliation, false)

  assert.equal(cabin.state, STOP_STATE.HAPPENED_NO_PHOTOS)
  assert.deepEqual(cabin.photoIds, [])

  assert.equal(draft.summary.happened, 1)
  assert.equal(draft.summary.happenedNoPhotos, 1)
})

test('time-only match (no GPS) still confirms the stop as happened', () => {
  const trip = makeTrip([
    { n: 1, isoDate: '2026-04-17', stops: [ART_OMI] },
  ])
  const photos = [{ id: 'p1', capturedAt: '2026-04-17T11:30:00Z', lat: null, lng: null }]
  const draft = buildReconciliationDraft(photos, trip)
  assert.equal(draft.days[0].stops[0].state, STOP_STATE.HAPPENED)
})

// ─── Deviation → auto_added (the key judgment) ─────────────────────

test('off-route cluster with dwell ≥ 20min → auto_added stop, time-positioned', () => {
  const trip = makeTrip([
    { n: 1, isoDate: '2026-04-20', title: 'The Long Drive', stops: [MCCOMB, TERRELL] },
  ])
  // Three Vicksburg photos spanning 50 minutes → real stop.
  const photos = [
    { id: 'v1', capturedAt: '2026-04-20T15:00:00Z', ...VICKSBURG },
    { id: 'v2', capturedAt: '2026-04-20T15:25:00Z', lat: 32.3522, lng: -90.8788 },
    { id: 'v3', capturedAt: '2026-04-20T15:50:00Z', lat: 32.3521, lng: -90.879 },
  ]
  const matchResult = matchPhotosToStops(photos, trip)
  const clusterId = matchResult.deviationClusters[0].id
  const draft = buildReconciliationDraft(photos, trip, {
    matchResult,
    clusterNames: { [clusterId]: 'Vicksburg, Mississippi' },
  })

  const day = draft.days[0]
  const auto = day.stops.find((s) => s.source === 'auto_added')
  assert.ok(auto, 'an auto_added stop should exist')
  assert.equal(auto.state, STOP_STATE.AUTO_ADDED)
  assert.equal(auto.addedDuringReconciliation, true)
  assert.equal(auto.name, 'Vicksburg, Mississippi')
  assert.equal(auto.time, '3:25 PM') // median of 15:00/15:25/15:50
  assert.equal(auto.photoIds.length, 3)
  assert.equal(auto.clusterId, clusterId)
  assert.ok(auto.centroid && Number.isFinite(auto.centroid.lat))

  // Positioned in time order: McComb 9AM, Vicksburg 3:25PM, Terrell 8PM.
  assert.deepEqual(
    day.stops.map((s) => s.stopId),
    ['mccomb', `auto-${clusterId}`, 'terrell']
  )
  assert.equal(draft.summary.autoAdded, 1)
  assert.equal(draft.summary.demotedClusters, 0)
})

test('off-route cluster with dwell < 20min → stays interstitial (demoted)', () => {
  const trip = makeTrip([
    { n: 1, isoDate: '2026-04-20', stops: [MCCOMB, TERRELL] },
  ])
  // Three Vicksburg photos spanning only 6 minutes → quick pull-over.
  const photos = [
    { id: 'v1', capturedAt: '2026-04-20T15:30:00Z', ...VICKSBURG },
    { id: 'v2', capturedAt: '2026-04-20T15:33:00Z', lat: 32.3522, lng: -90.8788 },
    { id: 'v3', capturedAt: '2026-04-20T15:36:00Z', lat: 32.3521, lng: -90.879 },
  ]
  const draft = buildReconciliationDraft(photos, trip)
  const day = draft.days[0]

  assert.equal(draft.summary.autoAdded, 0)
  assert.equal(draft.summary.demotedClusters, 1)
  assert.ok(!day.stops.some((s) => s.source === 'auto_added'))

  // The three photos land in a single "From McComb to Buc-ee's Terrell"
  // interstitial bucket.
  assert.equal(day.interstitials.length, 1)
  assert.equal(day.interstitials[0].photoIds.length, 3)
  assert.equal(day.interstitials[0].title, "From McComb to Buc-ee's Terrell")
})

test('dwell gate is tunable via opts.thresholds', () => {
  const trip = makeTrip([{ n: 1, isoDate: '2026-04-20', stops: [MCCOMB, TERRELL] }])
  const photos = [
    { id: 'v1', capturedAt: '2026-04-20T15:30:00Z', ...VICKSBURG },
    { id: 'v2', capturedAt: '2026-04-20T15:33:00Z', lat: 32.3522, lng: -90.8788 },
    { id: 'v3', capturedAt: '2026-04-20T15:36:00Z', lat: 32.3521, lng: -90.879 },
  ]
  // With a 5-minute gate, the 6-minute span now qualifies as a stop.
  const draft = buildReconciliationDraft(photos, trip, { thresholds: { clusterDwellMinutes: 5 } })
  assert.equal(draft.summary.autoAdded, 1)
  assert.equal(draft.summary.demotedClusters, 0)
})

test('auto_added stop falls back to a generic name when geocode is absent', () => {
  const trip = makeTrip([{ n: 1, isoDate: '2026-04-20', stops: [MCCOMB, TERRELL] }])
  const photos = [
    { id: 'v1', capturedAt: '2026-04-20T15:00:00Z', ...VICKSBURG },
    { id: 'v2', capturedAt: '2026-04-20T15:25:00Z', lat: 32.3522, lng: -90.8788 },
    { id: 'v3', capturedAt: '2026-04-20T15:50:00Z', lat: 32.3521, lng: -90.879 },
  ]
  const draft = buildReconciliationDraft(photos, trip) // no clusterNames
  const auto = draft.days[0].stops.find((s) => s.source === 'auto_added')
  assert.equal(auto.name, 'Off-route stop')
})

// ─── Interstitials, unmatched ──────────────────────────────────────

test('interstitial photos bucket under "From A to B"', () => {
  const trip = makeTrip([
    { n: 1, isoDate: '2026-04-17', stops: [ART_OMI, CABIN] },
  ])
  // One photo at 1PM (Art Omi window) but 100km away → interstitial
  // between Art Omi and the cabin.
  const photos = [{ id: 'p1', capturedAt: '2026-04-17T13:00:00Z', lat: 41.5, lng: -72.0 }]
  const draft = buildReconciliationDraft(photos, trip)
  const day = draft.days[0]
  assert.equal(day.interstitials.length, 1)
  assert.equal(day.interstitials[0].title, 'From Art Omi to Postcard Cabins')
  assert.deepEqual(day.interstitials[0].photoIds, ['p1'])
  // The stop it sat in still reads no-photos (it didn't match the stop).
  assert.equal(day.stops.find((s) => s.stopId === 's1').state, STOP_STATE.HAPPENED_NO_PHOTOS)
})

test('photo outside the trip range lands in unmatched', () => {
  const trip = makeTrip([{ n: 1, isoDate: '2026-04-17', stops: [ART_OMI] }])
  const photos = [{ id: 'p1', capturedAt: '2026-05-01T11:30:00Z', lat: 42.344, lng: -73.606 }]
  const draft = buildReconciliationDraft(photos, trip)
  assert.equal(draft.unmatched.length, 1)
  assert.equal(draft.unmatched[0].photoId, 'p1')
  assert.equal(draft.days[0].stops[0].state, STOP_STATE.HAPPENED_NO_PHOTOS)
})

test('no photos at all → every planned stop flagged happened_no_photos', () => {
  const trip = makeTrip([
    { n: 1, isoDate: '2026-04-17', stops: [ART_OMI, CABIN] },
    { n: 2, isoDate: '2026-04-18', stops: [MCCOMB] },
  ])
  const draft = buildReconciliationDraft([], trip)
  const states = draft.days.flatMap((d) => d.stops.map((s) => s.state))
  assert.deepEqual(states, [
    STOP_STATE.HAPPENED_NO_PHOTOS,
    STOP_STATE.HAPPENED_NO_PHOTOS,
    STOP_STATE.HAPPENED_NO_PHOTOS,
  ])
  assert.equal(draft.summary.happened, 0)
  assert.equal(draft.summary.happenedNoPhotos, 3)
})

// ─── End-to-end (the canonical Jackson scenario) ───────────────────

test('end-to-end: confirmed stop + indoor time-only stop + a real deviation', () => {
  const trip = makeTrip([
    { n: 1, isoDate: '2026-04-17', title: 'Up the Hudson', stops: [ART_OMI] },
    { n: 2, isoDate: '2026-04-18', title: 'The Cemetery Day', stops: [
      { id: 'steamtown', time: '9:30 AM', name: 'Steamtown NHS', lat: 41.41, lng: -75.67 },
    ] },
    { n: 3, isoDate: '2026-04-20', title: 'The Long Drive', stops: [MCCOMB, TERRELL] },
  ])
  const photos = [
    // Day 1: Art Omi, GPS+time → happened.
    { id: 'artomi', capturedAt: '2026-04-17T11:30:00Z', lat: 42.344, lng: -73.606 },
    // Day 2: indoor at Steamtown, no GPS → time-only → happened.
    { id: 'steam-indoor', capturedAt: '2026-04-18T10:00:00Z', lat: null, lng: null },
    // Day 3: Vicksburg deviation, 50-min dwell → auto_added.
    { id: 'vk1', capturedAt: '2026-04-20T15:00:00Z', ...VICKSBURG },
    { id: 'vk2', capturedAt: '2026-04-20T15:25:00Z', lat: 32.3522, lng: -90.8788 },
    { id: 'vk3', capturedAt: '2026-04-20T15:50:00Z', lat: 32.3521, lng: -90.879 },
  ]
  const matchResult = matchPhotosToStops(photos, trip)
  const clusterId = matchResult.deviationClusters[0].id
  const draft = buildReconciliationDraft(photos, trip, {
    matchResult,
    clusterNames: { [clusterId]: 'Vicksburg, Mississippi' },
  })

  // Day 1: Art Omi happened.
  assert.equal(draft.days[0].stops[0].state, STOP_STATE.HAPPENED)
  // Day 2: Steamtown happened (time-only).
  assert.equal(draft.days[1].stops[0].state, STOP_STATE.HAPPENED)
  // Day 3: a Vicksburg auto_added stop between the two planned stops.
  const day3 = draft.days[2]
  const auto = day3.stops.find((s) => s.source === 'auto_added')
  assert.ok(auto)
  assert.equal(auto.name, 'Vicksburg, Mississippi')
  assert.equal(auto.state, STOP_STATE.AUTO_ADDED)
  assert.deepEqual(day3.stops.map((s) => s.stopId), ['mccomb', `auto-${clusterId}`, 'terrell'])

  assert.equal(draft.summary.happened, 2)
  assert.equal(draft.summary.autoAdded, 1)
  assert.equal(draft.tripId, 'recon-trip')
})

test('buildReconciliationDraft tolerates an empty / malformed trip', () => {
  assert.deepEqual(buildReconciliationDraft([], { id: 'x', days: [] }), {
    tripId: 'x',
    days: [],
    unmatched: [],
    summary: {
      happened: 0,
      happenedNoPhotos: 0,
      autoAdded: 0,
      interstitialBuckets: 0,
      demotedClusters: 0,
    },
  })
})
