// Unit tests for applyReconciliation — turning a (possibly edited)
// reconciliation draft back into a persisted trip record + photo→stop
// bindings. Run via `node --test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { applyReconciliation } = await import('../../src/lib/reconcileApply.js')
const { buildReconciliationDraft, STOP_STATE } = await import('../../src/lib/reconcileDraft.js')
const { matchPhotosToStops } = await import('../../src/lib/photoMatch.js')

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

const ART_OMI = {
  id: 's1', time: '11:00 AM', name: 'Art Omi', kind: 'sculpture park',
  for: ['helen', 'aurelia'], note: 'Eighty acres.', address: '1405 County Route 22',
  lat: 42.344, lng: -73.606,
}
const CABIN = {
  id: 's2', time: '6:00 PM', name: 'Postcard Cabins', kind: 'lodging',
  for: ['jonathan', 'helen'], note: 'Two cabins.', address: '282 Cairo Junction Rd',
  lat: 42.229, lng: -73.985,
}
const MCCOMB = { id: 'mccomb', time: '9:00 AM', name: 'McComb', lat: 31.244, lng: -90.454 }
const TERRELL = { id: 'terrell', time: '8:00 PM', name: "Buc-ee's Terrell", lat: 32.731, lng: -96.228 }
const VICKSBURG = { lat: 32.352, lng: -90.879 }

// ─── Planned stops: fields preserved, state stamped ────────────────

test('planned stops keep all original fields and gain state', () => {
  const trip = makeTrip([{ n: 1, isoDate: '2026-04-17', stops: [ART_OMI, CABIN] }])
  const photos = [{ id: 'p1', capturedAt: '2026-04-17T11:30:00Z', lat: 42.344, lng: -73.606 }]
  const draft = buildReconciliationDraft(photos, trip)
  const { trip: out, photoBindings } = applyReconciliation(draft, trip)

  const artOmi = out.days[0].stops.find((s) => s.id === 's1')
  assert.equal(artOmi.state, STOP_STATE.HAPPENED)
  // Original fields survive untouched.
  assert.equal(artOmi.address, '1405 County Route 22')
  assert.equal(artOmi.note, 'Eighty acres.')
  assert.equal(artOmi.kind, 'sculpture park')
  assert.deepEqual(artOmi.for, ['helen', 'aurelia'])
  assert.equal(artOmi.lat, 42.344)

  const cabin = out.days[0].stops.find((s) => s.id === 's2')
  assert.equal(cabin.state, STOP_STATE.HAPPENED_NO_PHOTOS)

  // The photo is bound to its stop.
  assert.equal(photoBindings.p1, 's1')
})

// ─── didnt_happen removal + original-plan preservation ─────────────

test('a stop flipped to didnt_happen is removed; original plan is preserved', () => {
  const trip = makeTrip([{ n: 1, isoDate: '2026-04-17', stops: [ART_OMI, CABIN] }])
  const draft = buildReconciliationDraft([], trip) // both no-photos
  // Helen flips the cabin to didn't-happen.
  const cabinDraft = draft.days[0].stops.find((s) => s.stopId === 's2')
  cabinDraft.state = STOP_STATE.DIDNT_HAPPEN

  const { trip: out } = applyReconciliation(draft, trip)
  const ids = out.days[0].stops.map((s) => s.id)
  assert.deepEqual(ids, ['s1'], 'cabin is gone from the reconciled record')

  // The original plan survives in full (both stops) for plan-vs-reality.
  assert.ok(out.originalPlan)
  assert.deepEqual(out.originalPlan.days[0].stops.map((s) => s.id), ['s1', 's2'])
})

test('re-reconciling does not clobber the genuine original plan', () => {
  const trip = makeTrip([{ n: 1, isoDate: '2026-04-17', stops: [ART_OMI, CABIN] }])
  const draft1 = buildReconciliationDraft([], trip)
  draft1.days[0].stops.find((s) => s.stopId === 's2').state = STOP_STATE.DIDNT_HAPPEN
  const { trip: once } = applyReconciliation(draft1, trip)
  assert.deepEqual(once.originalPlan.days[0].stops.map((s) => s.id), ['s1', 's2'])

  // Second pass over the already-reconciled trip (now only s1). The
  // stash must still reflect the TRUE original (s1 + s2), not s1 alone.
  const draft2 = buildReconciliationDraft([], once)
  const { trip: twice } = applyReconciliation(draft2, once)
  assert.deepEqual(twice.originalPlan.days[0].stops.map((s) => s.id), ['s1', 's2'])
})

// ─── auto_added stops become real stops ────────────────────────────

test('auto_added stop is materialized with centroid coords + flag', () => {
  const trip = makeTrip([{ n: 1, isoDate: '2026-04-20', stops: [MCCOMB, TERRELL] }])
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
  const { trip: out, photoBindings } = applyReconciliation(draft, trip)

  const day = out.days[0]
  assert.deepEqual(day.stops.map((s) => s.id), ['mccomb', `auto-${clusterId}`, 'terrell'])
  const auto = day.stops.find((s) => s.id === `auto-${clusterId}`)
  assert.equal(auto.name, 'Vicksburg, Mississippi')
  assert.equal(auto.state, STOP_STATE.AUTO_ADDED)
  assert.equal(auto.addedDuringReconciliation, true)
  assert.ok(Number.isFinite(auto.lat) && Number.isFinite(auto.lng))
  assert.deepEqual(auto.for, ['jonathan', 'helen', 'aurelia', 'rafa']) // trip default

  // All three Vicksburg photos bind to the new stop.
  assert.equal(photoBindings.v1, `auto-${clusterId}`)
  assert.equal(photoBindings.v2, `auto-${clusterId}`)
  assert.equal(photoBindings.v3, `auto-${clusterId}`)
})

// ─── renames / inline edits win ────────────────────────────────────

test('a rename in the draft wins over the original name', () => {
  const trip = makeTrip([{ n: 1, isoDate: '2026-04-20', stops: [MCCOMB, TERRELL] }])
  const photos = [
    { id: 'v1', capturedAt: '2026-04-20T15:00:00Z', ...VICKSBURG },
    { id: 'v2', capturedAt: '2026-04-20T15:25:00Z', lat: 32.3522, lng: -90.8788 },
    { id: 'v3', capturedAt: '2026-04-20T15:50:00Z', lat: 32.3521, lng: -90.879 },
  ]
  const matchResult = matchPhotosToStops(photos, trip)
  const clusterId = matchResult.deviationClusters[0].id
  const draft = buildReconciliationDraft(photos, trip, { matchResult })
  // Helen renames the raw geocode to something human.
  const auto = draft.days[0].stops.find((s) => s.source === 'auto_added')
  auto.name = 'Vicksburg Military Park'
  auto.time = '3:30 PM'

  const { trip: out } = applyReconciliation(draft, trip)
  const materialized = out.days[0].stops.find((s) => s.id === `auto-${clusterId}`)
  assert.equal(materialized.name, 'Vicksburg Military Park')
  assert.equal(materialized.time, '3:30 PM')
})

test('interstitial photos bind to null (no stop)', () => {
  const trip = makeTrip([{ n: 1, isoDate: '2026-04-17', stops: [ART_OMI, CABIN] }])
  // One photo at 1PM in Art Omi's window but 100km away → interstitial.
  const photos = [{ id: 'p1', capturedAt: '2026-04-17T13:00:00Z', lat: 41.5, lng: -72.0 }]
  const draft = buildReconciliationDraft(photos, trip)
  const { photoBindings } = applyReconciliation(draft, trip)
  assert.equal(photoBindings.p1, null)
})

// ─── Step 2: interstitial photos ALSO carry a "from A to B" identity ───

test('an interstitial photo gets a photoInterstitials {before, after} faithfully copied from its bucket', () => {
  const trip = makeTrip([{ n: 1, isoDate: '2026-04-17', stops: [ART_OMI, CABIN] }])
  const photos = [{ id: 'p1', capturedAt: '2026-04-17T13:00:00Z', lat: 41.5, lng: -72.0 }]
  const draft = buildReconciliationDraft(photos, trip)
  // The bucket's endpoints are whatever the matcher computed; applyReconciliation
  // must copy them verbatim. Reading them from the draft keeps this assertion
  // independent of the runner's timezone (which sets which stop brackets the
  // 1PM photo) while still proving the matcher→draft→apply field wiring.
  const bucket = draft.days[0].interstitials.find((b) => b.photoIds.includes('p1'))
  assert.ok(bucket, 'photo lands in an interstitial bucket')
  const { photoBindings, photoInterstitials } = applyReconciliation(draft, trip)
  // The stop binding stays null — the identity rides ALONGSIDE it.
  assert.equal(photoBindings.p1, null)
  assert.deepEqual(photoInterstitials.p1, {
    before: bucket.interstitialBefore,
    after: bucket.interstitialAfter,
  })
})

test('a day-edge interstitial (no `before`) still records the `after` endpoint', () => {
  // Build the draft inline so before=null is deterministic regardless of TZ.
  const trip = makeTrip([{ n: 1, isoDate: '2026-04-17', stops: [ART_OMI, CABIN] }])
  const draft = {
    tripId: 'recon-trip',
    days: [
      {
        dayN: 1,
        stops: [
          { stopId: 's1', source: 'planned', state: STOP_STATE.HAPPENED_NO_PHOTOS, photoIds: [] },
          { stopId: 's2', source: 'planned', state: STOP_STATE.HAPPENED_NO_PHOTOS, photoIds: [] },
        ],
        interstitials: [
          { interstitialBefore: null, interstitialAfter: 's1', photoIds: ['p0'] },
        ],
      },
    ],
  }
  const { photoBindings, photoInterstitials } = applyReconciliation(draft, trip)
  assert.equal(photoBindings.p0, null)
  assert.deepEqual(photoInterstitials.p0, { before: null, after: 's1' })
})

test('a photo bound to a real stop gets NO interstitial entry (a stop wins)', () => {
  const trip = makeTrip([{ n: 1, isoDate: '2026-04-17', stops: [ART_OMI, CABIN] }])
  const photos = [{ id: 'p1', capturedAt: '2026-04-17T11:30:00Z', lat: 42.344, lng: -73.606 }]
  const draft = buildReconciliationDraft(photos, trip)
  const { photoBindings, photoInterstitials } = applyReconciliation(draft, trip)
  assert.equal(photoBindings.p1, 's1')
  assert.equal('p1' in photoInterstitials, false)
})

// ─── day metadata is preserved ─────────────────────────────────────

test('day metadata (title, date, drive) survives reconciliation', () => {
  const trip = makeTrip([
    {
      n: 1, isoDate: '2026-04-17', date: 'Fri Apr 17', title: 'Up the Hudson',
      drive: { from: 'Belmont', to: 'Catskill', hours: '3h', miles: 175 },
      lodging: 'Postcard Cabins', stops: [ART_OMI],
    },
  ])
  const { trip: out } = applyReconciliation(buildReconciliationDraft([], trip), trip)
  const day = out.days[0]
  assert.equal(day.title, 'Up the Hudson')
  assert.equal(day.date, 'Fri Apr 17')
  assert.equal(day.lodging, 'Postcard Cabins')
  assert.deepEqual(day.drive, { from: 'Belmont', to: 'Catskill', hours: '3h', miles: 175 })
})

test('trip-level fields are preserved; status is NOT changed here', () => {
  const trip = makeTrip([{ n: 1, isoDate: '2026-04-17', stops: [ART_OMI] }], {
    status: 'planning', subtitle: 'a subtitle', heroStopId: 's1',
  })
  const { trip: out } = applyReconciliation(buildReconciliationDraft([], trip), trip)
  assert.equal(out.status, 'planning') // archiving is a separate action
  assert.equal(out.subtitle, 'a subtitle')
  assert.equal(out.heroStopId, 's1')
  assert.equal(out.id, 'recon-trip')
  assert.ok(out.reconciledAt) // stamped
})

test('tolerates a malformed trip', () => {
  const r = applyReconciliation({ days: [] }, null)
  assert.equal(r.trip, null)
  assert.deepEqual(r.photoBindings, {})
})

// ─── Phase 2: implicit-base photos bind to the place, base never persisted ───

test('implicit base: applyReconciliation binds place photos to the base id but never writes the synthetic stop into the trip', () => {
  const trip = makeTrip(
    [
      { n: 1, isoDate: '2026-04-17', title: 'Day 1', stops: [{ id: 'din', time: '7:00 PM', name: 'Dinner out', kind: 'food' }] },
      { n: 2, isoDate: '2026-04-18', title: 'Day 2', stops: [] },
    ],
    { lodging: { name: 'The Cabin', address: 'somewhere', lat: 43.21, lng: -72.9 } }
  )
  const photos = [{ id: 'p1', capturedAt: '2026-04-17T15:00:00Z' }] // no GPS → the place
  const draft = buildReconciliationDraft(photos, trip)
  const { trip: out, photoBindings } = applyReconciliation(draft, trip)
  // the photo is bound to the per-day base id
  assert.equal(photoBindings.p1, '__trip_base__:2026-04-17')
  // the synthetic base is NOT written into the persisted trip's planned stops
  for (const d of out.days) {
    assert.ok(!d.stops.some((s) => String(s.id).startsWith('__trip_base__')), 'no synthetic base persisted')
  }
  // day 1 still has exactly its one planned stop
  assert.deepEqual(out.days[0].stops.map((s) => s.id), ['din'])
})
