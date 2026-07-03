// The Record — pure model tests. "What actually happened" lives beside the
// plan (day.record), never inside it: writing a record must not touch
// day.stops, must create a missing day in date order, and must be
// idempotent for a retried card save (upsert by entry id).
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeRecordEntry,
  applyDayRecord,
  keepDay,
  readRecord,
  dayRecordOf,
  namedRecordEntries,
  dayHasRecord,
  dayRecordIsKept,
  dayRecordIsNothing,
  recordEntryId,
} from '../../src/lib/dayRecord.js'

function fixtureTrip() {
  return {
    id: 'ptown',
    travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
    dateRangeStart: '2026-07-01',
    dateRangeEnd: '2026-07-05',
    days: [
      { n: 1, isoDate: '2026-07-01', title: 'Arrive', stops: [{ id: 's1', name: 'Check in' }] },
      { n: 2, isoDate: '2026-07-03', title: 'Loose day', stops: [] },
    ],
  }
}

test('normalizeRecordEntry: fills the canonical shape; name is the one hard requirement', () => {
  const e = normalizeRecordEntry(
    { name: 'Race Point Beach', time: 'after lunch', kind: 'Park', note: 'Rafa found a crab' },
    { cardId: 'c-day1', index: 0, party: ['jonathan', 'rafa'], recordedBy: 'jonathan' }
  )
  assert.equal(e.id, 'rec-c-day1-0', 'deterministic id from the card — retries upsert, never duplicate')
  assert.equal(e.time, 'after lunch', 'loose times are legitimate')
  assert.equal(e.kind, 'park', 'kind lowercased canonical')
  assert.deepEqual(e.for, ['jonathan', 'rafa'])
  assert.equal(e.source, 'chat')
  assert.equal(e.recordedBy, 'jonathan')
  assert.equal(e.lat, null, 'no invented coords')
  assert.equal(normalizeRecordEntry({ time: '3 PM' }, {}), null, 'nameless entry → null (caller decides loudness)')
})

test('normalizeRecordEntry: unspecified who → the whole party (the honest hangout default)', () => {
  const e = normalizeRecordEntry({ name: 'Beach' }, { party: ['jonathan', 'helen'] })
  assert.deepEqual(e.for, ['jonathan', 'helen'])
})

test('normalizeRecordEntry: coords accepted only as real numbers — null/"" never become the equator', () => {
  const good = normalizeRecordEntry({ name: 'Pin', lat: 42.05, lng: -70.18 }, {})
  assert.equal(good.lat, 42.05)
  const bad = normalizeRecordEntry({ name: 'NoPin', lat: null, lng: '' }, {})
  assert.equal(bad.lat, null)
  assert.equal(bad.lng, null)
})

test('applyDayRecord: writes onto the day by ISO — the plan (stops) untouched, purity kept', () => {
  const trip = fixtureTrip()
  const before = JSON.stringify(trip)
  const e = normalizeRecordEntry({ name: 'Biked the dunes' }, { cardId: 'c1', index: 0 })
  const next = applyDayRecord(trip, { dayIso: '2026-07-03' }, [e])
  const day = next.days.find((d) => d.isoDate === '2026-07-03')
  assert.equal(dayRecordOf(day).length, 1)
  assert.equal(dayRecordOf(day)[0].name, 'Biked the dunes')
  assert.equal(readRecord(day).state, 'loose', 'a fresh record is loose until the keep flow keeps it')
  assert.deepEqual(day.stops, [], 'the plan stays honestly empty')
  assert.equal(JSON.stringify(trip), before, 'input trip not mutated')
  assert.equal(dayHasRecord(day), true)
  assert.equal(dayHasRecord(next.days[0]), false)
})

test('applyDayRecord: a day the trip never wrote is CREATED, dated, in order, renumbered', () => {
  const trip = fixtureTrip() // has 07-01 and 07-03; 07-02 exists only on the calendar
  const e = normalizeRecordEntry({ name: 'Did nothing, gloriously' }, { cardId: 'c2', index: 0 })
  const next = applyDayRecord(trip, { dayIso: '2026-07-02' }, [e])
  assert.deepEqual(next.days.map((d) => d.isoDate), ['2026-07-01', '2026-07-02', '2026-07-03'])
  assert.deepEqual(next.days.map((d) => d.n), [1, 2, 3], 'renumbered')
  assert.equal(dayRecordOf(next.days[1])[0].name, 'Did nothing, gloriously')
  assert.deepEqual(next.days[1].stops, [], 'created day has an empty plan')
})

test('applyDayRecord: re-saving the same card UPSERTS its rows — no duplicates on retry', () => {
  const trip = fixtureTrip()
  const mk = (name) => normalizeRecordEntry({ name }, { cardId: 'c3', index: 0 })
  const once = applyDayRecord(trip, { dayIso: '2026-07-03' }, [mk('Beach')])
  const twice = applyDayRecord(once, { dayIso: '2026-07-03' }, [mk('Beach, corrected')])
  const day = twice.days.find((d) => d.isoDate === '2026-07-03')
  assert.equal(dayRecordOf(day).length, 1, 'same id → replaced, not appended')
  assert.equal(dayRecordOf(day)[0].name, 'Beach, corrected')
})

test('applyDayRecord: dayN fallback works; a garbage target fails loud; D1 row shape honored', () => {
  const trip = fixtureTrip()
  const e = normalizeRecordEntry({ name: 'Check-in went long' }, { cardId: 'c4', index: 0 })
  const byN = applyDayRecord(trip, { dayN: 1 }, [e])
  assert.equal(dayRecordOf(byN.days[0])[0].name, 'Check-in went long')
  assert.throws(() => applyDayRecord(trip, {}, [e]), /dayIso or.*dayN required/)
  assert.throws(() => applyDayRecord(trip, { dayIso: 'not-a-date' }, [e]), /not found/)
  // D1 shape (.data.days)
  const d1 = { id: 'ptown', data: fixtureTrip() }
  const nextD1 = applyDayRecord(d1, { dayIso: '2026-07-03' }, [e])
  assert.ok(dayRecordOf(nextD1.data.days.find((d) => d.isoDate === '2026-07-03')).length === 1)
  assert.equal(dayRecordOf(nextD1.data.days[0]).length, 0)
})

test('namedRecordEntries: the read faces see NAMED rows only — a half-typed row never leaks', () => {
  // The editor's record mode adds a row (name:'') that lives in the working
  // copy until it earns a name. dayRecordOf returns the raw array (for the
  // editor); namedRecordEntries is what a reader (the home) shows.
  const day = {
    record: [
      { id: 'a', name: 'Biked the dunes' },
      { id: 'b', name: '' },          // just-added, unnamed → hidden from readers
      { id: 'c', name: '   ' },       // whitespace-only → also nothing
      { id: 'd', name: 'Taffy run' },
    ],
  }
  assert.equal(dayRecordOf(day).length, 4, 'the raw array keeps every working row')
  assert.deepEqual(namedRecordEntries(day).map((e) => e.name), ['Biked the dunes', 'Taffy run'])
  assert.equal(dayHasRecord(day), true, 'a named row means the day has a record')
  assert.equal(dayHasRecord({ record: [{ id: 'x', name: '' }] }), false, 'only nameless rows → no record to show')
  assert.equal(dayHasRecord({}), false)
  assert.deepEqual(namedRecordEntries({}), [], 'no record → empty')
})

test('readRecord: coerces a legacy bare array to {state:loose, entries}; passes an object through', () => {
  // The shape the chat mouth wrote before the keep flow (a bare array).
  const legacy = readRecord({ record: [{ id: 'a', name: 'Beach' }] })
  assert.equal(legacy.state, 'loose')
  assert.equal(legacy.nothing, false)
  assert.deepEqual(legacy.entries.map((e) => e.name), ['Beach'], 'legacy entries preserved')
  // The new object shape passes through, defensively normalized.
  const kept = readRecord({ record: { state: 'kept', keptBy: 'helen', keptAt: '21:14', entries: [{ id: 'b', name: 'Taffy' }] } })
  assert.equal(kept.state, 'kept')
  assert.equal(kept.keptBy, 'helen')
  assert.deepEqual(kept.entries.map((e) => e.name), ['Taffy'])
  // Absent / junk → an empty loose record, never a throw.
  assert.deepEqual(readRecord({}).entries, [])
  assert.equal(readRecord(undefined).state, 'loose')
  assert.equal(readRecord({ record: { state: 'weird' } }).state, 'loose', 'unknown state → loose')
})

test('applyDayRecord: writes the OBJECT shape (not a bare array)', () => {
  const trip = fixtureTrip()
  const e = normalizeRecordEntry({ name: 'Biked the dunes' }, { cardId: 'c1', index: 0 })
  const day = applyDayRecord(trip, { dayIso: '2026-07-03' }, [e]).days.find((d) => d.isoDate === '2026-07-03')
  assert.ok(!Array.isArray(day.record), 'record is the object shape, not a bare array')
  assert.equal(day.record.state, 'loose')
  assert.deepEqual(day.record.entries.map((x) => x.name), ['Biked the dunes'])
})

test('applyDayRecord: a LEGACY flat-array record (live on the family trip) is UPGRADED on write — entries never lost', () => {
  const trip = fixtureTrip()
  // Simulate a record already written by 4d55231 as a bare array on day 07-03.
  const d = trip.days.find((x) => x.isoDate === '2026-07-03')
  d.record = [{ id: 'legacy-1', name: 'Biked the dunes', time: 'afternoon' }]
  const before = JSON.stringify(trip)
  const e = normalizeRecordEntry({ name: 'Taffy run' }, { cardId: 'c9', index: 0 })
  const rec = applyDayRecord(trip, { dayIso: '2026-07-03' }, [e]).days.find((x) => x.isoDate === '2026-07-03').record
  assert.ok(!Array.isArray(rec), 'the legacy array was upgraded to the object shape')
  assert.equal(rec.state, 'loose', 'a legacy record reads as loose')
  assert.deepEqual(rec.entries.map((x) => x.name), ['Biked the dunes', 'Taffy run'], 'the legacy entry SURVIVED, the new one appended')
  assert.equal(JSON.stringify(trip), before, 'the input trip (legacy bare array) is NEVER mutated in place')
})

test('applyDayRecord: a record-write PRESERVES a day already kept (never silently un-keeps it)', () => {
  const trip = fixtureTrip()
  const d = trip.days.find((x) => x.isoDate === '2026-07-03')
  d.record = { state: 'kept', keptBy: 'helen', keptAt: '21:14', nothing: false, entries: [{ id: 'k1', name: 'Beach' }], skipped: [] }
  const e = normalizeRecordEntry({ name: 'Late addition' }, { cardId: 'cA', index: 0 })
  const rec = applyDayRecord(trip, { dayIso: '2026-07-03' }, [e]).days.find((x) => x.isoDate === '2026-07-03').record
  assert.equal(rec.state, 'kept', 'the day stays kept')
  assert.equal(rec.keptBy, 'helen')
  assert.deepEqual(rec.entries.map((x) => x.name), ['Beach', 'Late addition'])
})

test('keepDay: marks a day kept with who + when, PRESERVING its entries; never touches stops', () => {
  const trip = fixtureTrip()
  const withRec = applyDayRecord(trip, { dayIso: '2026-07-03' }, [
    normalizeRecordEntry({ name: 'Biked the dunes' }, { cardId: 'c1', index: 0 }),
  ])
  const before = JSON.stringify(withRec)
  const kept = keepDay(withRec, { dayIso: '2026-07-03' }, { keptBy: 'helen' })
  const day = kept.days.find((d) => d.isoDate === '2026-07-03')
  assert.equal(dayRecordIsKept(day), true)
  assert.equal(day.record.state, 'kept')
  assert.equal(day.record.keptBy, 'helen')
  assert.ok(day.record.keptAt, 'a keep stamps when')
  assert.deepEqual(dayRecordOf(day).map((e) => e.name), ['Biked the dunes'], 'entries survive the keep')
  assert.deepEqual(day.stops, [], 'the plan is never touched')
  assert.equal(JSON.stringify(withRec), before, 'input trip not mutated')
})

test('keepDay: a NOTHING-day keeps with no entries ("we stayed put, gloriously")', () => {
  const trip = fixtureTrip() // 07-02 exists only on the calendar
  const kept = keepDay(trip, { dayIso: '2026-07-02' }, { keptBy: 'jonathan', nothing: true })
  const day = kept.days.find((d) => d.isoDate === '2026-07-02')
  assert.equal(dayRecordIsKept(day), true)
  assert.equal(dayRecordIsNothing(day), true)
  assert.deepEqual(dayRecordOf(day), [], 'a nothing-day has no entries')
  assert.deepEqual(day.stops, [], 'created day has an empty plan')
})

test('keepDay: the FIRST keeper settles the day — a re-keep preserves the original keptBy/keptAt', () => {
  const trip = fixtureTrip()
  const first = keepDay(trip, { dayIso: '2026-07-03' }, { keptBy: 'helen' })
  const at1 = first.days.find((d) => d.isoDate === '2026-07-03').record.keptAt
  const second = keepDay(first, { dayIso: '2026-07-03' }, { keptBy: 'jonathan' })
  const rec = second.days.find((d) => d.isoDate === '2026-07-03').record
  assert.equal(rec.keptBy, 'helen', 'first keeper wins')
  assert.equal(rec.keptAt, at1, 'original timestamp preserved')
  // A nothing-day stays nothing even if a later re-keep passes nothing:false.
  const nd = keepDay(fixtureTrip(), { dayIso: '2026-07-02' }, { nothing: true })
  const nd2 = keepDay(nd, { dayIso: '2026-07-02' }, { nothing: false })
  assert.equal(dayRecordIsNothing(nd2.days.find((d) => d.isoDate === '2026-07-02')), true, 'nothing-flag survives a re-keep')
})

test('keepDay: a record-write AFTER a keep leaves the day kept (kept once, added-to after)', () => {
  const trip = fixtureTrip()
  const kept = keepDay(trip, { dayIso: '2026-07-03' }, { keptBy: 'helen' })
  const added = applyDayRecord(kept, { dayIso: '2026-07-03' }, [
    normalizeRecordEntry({ name: 'One more thing' }, { cardId: 'cX', index: 0 }),
  ])
  const day = added.days.find((d) => d.isoDate === '2026-07-03')
  assert.equal(dayRecordIsKept(day), true, 'still kept after a later add')
  assert.equal(day.record.keptBy, 'helen')
  assert.deepEqual(dayRecordOf(day).map((e) => e.name), ['One more thing'])
})

test('recordEntryId: stable with a cardId, unique without', () => {
  assert.equal(recordEntryId('c-x', 2), 'rec-c-x-2')
  assert.notEqual(recordEntryId(null, 0), recordEntryId(null, 0))
})
