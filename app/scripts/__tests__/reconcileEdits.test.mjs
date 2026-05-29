// Unit tests for reconcileEdits — the pure draft-mutation operations the
// triage edit panel calls (rename / retime / flip / promote / demote /
// merge / split). Every op is immutable and a no-op when its target is
// missing or the edit isn't allowed. Drafts are built with the REAL
// buildReconciliationDraft so the shapes are authentic, and a few cases
// round-trip through applyReconciliation to prove the persistence engine
// consumes whatever the edited draft says. Run via `node --test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  renameStop,
  retimeStop,
  markDidntHappen,
  restoreStop,
  demoteToInterstitial,
  promoteToStop,
  mergeStops,
  splitStop,
} = await import('../../src/lib/reconcileEdits.js')
const { buildReconciliationDraft, STOP_STATE } = await import('../../src/lib/reconcileDraft.js')
const { matchPhotosToStops } = await import('../../src/lib/photoMatch.js')
const { applyReconciliation } = await import('../../src/lib/reconcileApply.js')

// A McComb → Terrell day with a Vicksburg photo cluster off-route and a
// lone in-transit photo. Produces, in one draft: a 'happened' planned
// stop (McComb), a 'happened_no_photos' planned stop (Terrell), an
// 'auto_added' stop (the Vicksburg cluster), and one interstitial bucket
// (the lone photo).
const MCCOMB = { id: 'mccomb', time: '9:00 AM', name: 'McComb', kind: 'fuel', lat: 31.244, lng: -90.454 }
const TERRELL = { id: 'terrell', time: '8:00 PM', name: "Buc-ee's Terrell", kind: 'fuel', lat: 32.731, lng: -96.228 }

function scenario() {
  const trip = {
    id: 'edits-trip',
    title: 'Edits Test Trip',
    dateRangeStart: '2026-04-20',
    dateRangeEnd: '2026-04-20',
    travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
    days: [{ n: 1, isoDate: '2026-04-20', title: 'The long haul', stops: [MCCOMB, TERRELL] }],
  }
  const photos = [
    { id: 'm1', capturedAt: '2026-04-20T09:15:00Z', lat: 31.244, lng: -90.454 }, // McComb
    { id: 'lone', capturedAt: '2026-04-20T11:00:00Z', lat: 31.9, lng: -90.5 }, // interstitial
    { id: 'v1', capturedAt: '2026-04-20T15:00:00Z', lat: 32.3520, lng: -90.8790 }, // Vicksburg
    { id: 'v2', capturedAt: '2026-04-20T15:25:00Z', lat: 32.3522, lng: -90.8788 },
    { id: 'v3', capturedAt: '2026-04-20T15:50:00Z', lat: 32.3521, lng: -90.8790 },
  ]
  const matchResult = matchPhotosToStops(photos, trip)
  const draft = buildReconciliationDraft(photos, trip, { matchResult })
  const photoById = new Map(photos.map((p) => [p.id, p]))
  return { trip, photos, photoById, draft, matchResult }
}

function day0(draft) {
  return draft.days[0]
}
function stop(draft, stopId) {
  return day0(draft).stops.find((s) => s.stopId === stopId)
}
function autoStop(draft) {
  return day0(draft).stops.find((s) => s.source === 'auto_added')
}

// ─── preconditions: the scenario produces the four states ──────────

test('scenario draft has happened / no-photos / auto_added / interstitial', () => {
  const { draft } = scenario()
  const d = day0(draft)
  assert.equal(stop(draft, 'mccomb').state, STOP_STATE.HAPPENED, 'McComb has a photo')
  assert.equal(stop(draft, 'terrell').state, STOP_STATE.HAPPENED_NO_PHOTOS, 'Terrell has none')
  const auto = autoStop(draft)
  assert.ok(auto, 'Vicksburg cluster promoted to an auto_added stop')
  assert.equal(auto.photoIds.length, 3)
  assert.ok(d.interstitials.length >= 1, 'the lone photo is an interstitial bucket')
})

// ─── inline edits ─────────────────────────────────────────────────

test('renameStop changes the name and leaves the input draft untouched', () => {
  const { draft } = scenario()
  const next = renameStop(draft, 1, 'mccomb', 'McComb (Shell)')
  assert.equal(stop(next, 'mccomb').name, 'McComb (Shell)')
  assert.notEqual(next, draft, 'returns a new draft reference')
  assert.equal(stop(draft, 'mccomb').name, 'McComb', 'original draft is not mutated')
})

test('retimeStop changes the time', () => {
  const { draft } = scenario()
  const next = retimeStop(draft, 1, 'terrell', '7:30 PM')
  assert.equal(stop(next, 'terrell').time, '7:30 PM')
  assert.equal(stop(draft, 'terrell').time, '8:00 PM')
})

test('renameStop is a no-op for an unknown stop', () => {
  const { draft } = scenario()
  const next = renameStop(draft, 1, 'nope', 'X')
  assert.deepEqual(next, draft)
})

// ─── state override ───────────────────────────────────────────────

test('markDidntHappen flips a no-photos stop, then restoreStop reverts it', () => {
  const { draft } = scenario()
  const gone = markDidntHappen(draft, 1, 'terrell')
  assert.equal(stop(gone, 'terrell').state, STOP_STATE.DIDNT_HAPPEN)
  const back = restoreStop(gone, 1, 'terrell')
  assert.equal(stop(back, 'terrell').state, STOP_STATE.HAPPENED_NO_PHOTOS)
})

test('markDidntHappen is a no-op on a stop that has photos (proof)', () => {
  const { draft } = scenario()
  const next = markDidntHappen(draft, 1, 'mccomb') // has a photo
  assert.equal(stop(next, 'mccomb').state, STOP_STATE.HAPPENED)
})

test('a didnt_happen flip is honored end-to-end by applyReconciliation', () => {
  const { draft, trip } = scenario()
  const edited = markDidntHappen(draft, 1, 'terrell')
  const { trip: out } = applyReconciliation(edited, trip)
  const ids = out.days[0].stops.map((s) => s.id)
  assert.ok(!ids.includes('terrell'), 'didnt_happen stop is removed from the record')
  assert.ok(out.originalPlan.days[0].stops.some((s) => s.id === 'terrell'), 'but survives in originalPlan')
})

// ─── demote / promote ─────────────────────────────────────────────

test('demoteToInterstitial removes an auto_added stop and rebuckets its photos', () => {
  const { draft } = scenario()
  const auto = autoStop(draft)
  const before = day0(draft).stops.length
  const next = demoteToInterstitial(draft, 1, auto.stopId)
  assert.equal(day0(next).stops.length, before - 1, 'auto stop removed')
  assert.ok(!day0(next).stops.some((s) => s.stopId === auto.stopId))
  const allInterstitialPhotos = day0(next).interstitials.flatMap((b) => b.photoIds)
  for (const pid of auto.photoIds) {
    assert.ok(allInterstitialPhotos.includes(pid), `${pid} moved to an interstitial bucket`)
  }
})

test('demoteToInterstitial is a no-op on a planned stop', () => {
  const { draft } = scenario()
  const next = demoteToInterstitial(draft, 1, 'mccomb')
  assert.ok(day0(next).stops.some((s) => s.stopId === 'mccomb'))
  assert.equal(day0(next).stops.length, day0(draft).stops.length)
})

test('demoted auto photos bind to null through applyReconciliation', () => {
  const { draft, trip } = scenario()
  const auto = autoStop(draft)
  const edited = demoteToInterstitial(draft, 1, auto.stopId)
  const { photoBindings } = applyReconciliation(edited, trip)
  for (const pid of auto.photoIds) {
    assert.equal(photoBindings[pid], null, `${pid} is now a transit shot`)
  }
})

test('promoteToStop turns an interstitial bucket into a time-ordered auto_added stop', () => {
  const { draft, photoById } = scenario()
  const bucket = day0(draft).interstitials[0]
  const bucketPhotos = [...bucket.photoIds]
  const next = promoteToStop(draft, 1, bucket.key, photoById)
  assert.ok(!day0(next).interstitials.some((b) => b.key === bucket.key), 'bucket consumed')
  const promoted = day0(next).stops.find((s) => s.stopId.startsWith('promoted-'))
  assert.ok(promoted, 'a promoted stop exists')
  assert.equal(promoted.name, 'New stop')
  assert.equal(promoted.source, 'auto_added')
  assert.deepEqual(promoted.photoIds, bucketPhotos)
  // The lone photo is at 11:00 → lands between McComb (9 AM) and the
  // Vicksburg cluster (~3:25 PM), not at the start or end.
  const order = day0(next).stops.map((s) => s.stopId)
  assert.equal(order[0], 'mccomb')
  assert.equal(order[1], promoted.stopId)
})

test('a promoted stop materializes and binds its photos via applyReconciliation', () => {
  const { draft, photoById, trip } = scenario()
  const bucket = day0(draft).interstitials[0]
  const pid = bucket.photoIds[0]
  const edited = promoteToStop(draft, 1, bucket.key, photoById)
  const promoted = day0(edited).stops.find((s) => s.stopId.startsWith('promoted-'))
  const { trip: out, photoBindings } = applyReconciliation(edited, trip)
  const real = out.days[0].stops.find((s) => s.id === promoted.stopId)
  assert.ok(real, 'promoted stop is a real stop in the record')
  assert.equal(real.addedDuringReconciliation, true)
  assert.equal(real.state, STOP_STATE.AUTO_ADDED)
  assert.equal(photoBindings[pid], promoted.stopId)
})

// ─── merge / split ────────────────────────────────────────────────

test('mergeStops absorbs one stop into a neighbor and recomputes planned state', () => {
  const { draft, photoById } = scenario()
  // Merge McComb (has m1) INTO Terrell (no photos) → Terrell becomes happened.
  const next = mergeStops(draft, 1, 'mccomb', 'terrell', photoById)
  assert.ok(!day0(next).stops.some((s) => s.stopId === 'mccomb'), 'McComb absorbed')
  const terrell = stop(next, 'terrell')
  assert.ok(terrell.photoIds.includes('m1'), 'photo carried over')
  assert.equal(terrell.state, STOP_STATE.HAPPENED, 'no-photos → happened after absorbing a photo')
})

test('mergeStops is a no-op when merging a stop into itself', () => {
  const { draft, photoById } = scenario()
  const next = mergeStops(draft, 1, 'mccomb', 'mccomb', photoById)
  assert.equal(day0(next).stops.length, day0(draft).stops.length)
})

test('splitStop divides photos chronologically into two stops', () => {
  const { draft, photoById } = scenario()
  const auto = autoStop(draft) // v1,v2,v3
  const next = splitStop(draft, 1, auto.stopId, photoById)
  const first = stop(next, auto.stopId)
  const second = day0(next).stops.find((s) => s.stopId.startsWith(`${auto.stopId}-split-`))
  assert.ok(second, 'a split-off stop exists')
  assert.deepEqual(first.photoIds, ['v1', 'v2'], 'earlier half stays')
  assert.deepEqual(second.photoIds, ['v3'], 'later half splits off')
  assert.equal(second.name, `${auto.name} (2)`)
  // Inserted immediately after the original.
  const order = day0(next).stops.map((s) => s.stopId)
  assert.equal(order[order.indexOf(auto.stopId) + 1], second.stopId)
})

test('splitStop is a no-op below two photos', () => {
  const { draft, photoById } = scenario()
  const next = splitStop(draft, 1, 'mccomb', photoById) // m1 only
  assert.equal(day0(next).stops.length, day0(draft).stops.length)
  assert.deepEqual(stop(next, 'mccomb').photoIds, ['m1'])
})
