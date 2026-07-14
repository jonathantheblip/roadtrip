// confirmSurface.js — the S1 confirm card's pure client-local seams. Proves the
// two doors compute the SAME question (deterministic, order-independent) and the
// shared one-a-day budget, without a browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pickConfirmOfDay, confirmKindOf, confirmBudgetSpentToday, spendConfirmBudget, CONFIRM_BUDGET_KEY,
  momentFromDecision, confirmFilings, isFilablePlace,
} from '../../src/lib/confirmSurface.js'

const dec = (over = {}) => ({ tier: 'confirm', isoDate: '2026-07-02', memoryIds: ['m1'], placeId: 's1', ...over })

// A trivial in-memory Storage stand-in (getItem/setItem).
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) }
}

test('pickConfirmOfDay: only confirm-tier moments are askable', () => {
  const rows = [dec({ tier: 'auto' }), dec({ tier: 'leave', memoryIds: ['x'] }), dec({ memoryIds: ['ok'] })]
  const pick = pickConfirmOfDay(rows, '2026-07-02')
  assert.equal(pick.memoryIds[0], 'ok')
})

test('pickConfirmOfDay: null when nothing is askable / empty', () => {
  assert.equal(pickConfirmOfDay([dec({ tier: 'auto' })], '2026-07-02'), null)
  assert.equal(pickConfirmOfDay([], '2026-07-02'), null)
  assert.equal(pickConfirmOfDay(null, '2026-07-02'), null)
})

test('pickConfirmOfDay: deterministic + order-independent (both doors agree)', () => {
  const a = dec({ isoDate: '2026-07-01', memoryIds: ['a'] })
  const b = dec({ isoDate: '2026-07-02', memoryIds: ['b'] })
  const c = dec({ isoDate: '2026-07-03', memoryIds: ['c'] })
  const p1 = pickConfirmOfDay([a, b, c], '2026-07-15')
  const p2 = pickConfirmOfDay([c, a, b], '2026-07-15') // shuffled input
  assert.equal(p1.memoryIds[0], p2.memoryIds[0]) // same pick regardless of order
})

test('pickConfirmOfDay: the pick rotates across days', () => {
  const rows = [
    dec({ isoDate: '2026-07-01', memoryIds: ['a'] }),
    dec({ isoDate: '2026-07-02', memoryIds: ['b'] }),
  ]
  const picks = new Set()
  for (const day of ['2026-07-10', '2026-07-11']) picks.add(pickConfirmOfDay(rows, day).memoryIds[0])
  assert.equal(picks.size, 2) // consecutive days land on different moments
})

test('confirmKindOf: classifies all four variants (one per moment)', () => {
  // B — a vision name with no real place
  assert.equal(confirmKindOf({ placeId: '__vision__:2026-07-02:0' }), 'B')
  // C — place known (gps/record) but the DAY is upload-time-only
  assert.equal(confirmKindOf({ placeId: 's1', signals: { evidence: 'gps', timeAnchorSuspect: true } }), 'C')
  assert.equal(confirmKindOf({ placeId: 's1', signals: { evidence: 'record', timeAnchorSuspect: true } }), 'C')
  // D — borderline cohesion
  assert.equal(confirmKindOf({ placeId: 's1', signals: { evidence: 'gps', cohesion: 0.3 } }), 'D')
  // A — the default place confirm
  assert.equal(confirmKindOf({ placeId: 's-angel', signals: { evidence: 'gps', cohesion: 0.9 } }), 'A')
  assert.equal(confirmKindOf({}), 'A')
})

test('confirmKindOf: time-suspect but place NOT reference-anchored stays a place confirm (A)', () => {
  // "when" is only asked once we're sure "where" — a time-only match with a
  // suspect clock is still a place question, not a time one.
  assert.equal(confirmKindOf({ placeId: 's1', signals: { evidence: 'time-only', timeAnchorSuspect: true } }), 'A')
})

test('confirmKindOf: B outranks C outranks D (one question per moment)', () => {
  assert.equal(confirmKindOf({ placeId: '__vision__:x', signals: { evidence: 'gps', timeAnchorSuspect: true, cohesion: 0.1 } }), 'B')
  assert.equal(confirmKindOf({ placeId: 's1', signals: { evidence: 'gps', timeAnchorSuspect: true, cohesion: 0.1 } }), 'C')
})

test('budget: unspent by default, spent after spendConfirmBudget for that day', () => {
  const s = fakeStorage()
  assert.equal(confirmBudgetSpentToday('2026-07-02', s), false)
  spendConfirmBudget('2026-07-02', s)
  assert.equal(confirmBudgetSpentToday('2026-07-02', s), true)
  assert.equal(s.getItem(CONFIRM_BUDGET_KEY), '2026-07-02')
})

test('budget: a new day resets (yesterday spent does not count today)', () => {
  const s = fakeStorage({ [CONFIRM_BUDGET_KEY]: '2026-07-01' })
  assert.equal(confirmBudgetSpentToday('2026-07-02', s), false)
})

test('budget: no storage → never blocks, never throws', () => {
  assert.equal(confirmBudgetSpentToday('2026-07-02', null), false)
  assert.doesNotThrow(() => spendConfirmBudget('2026-07-02', null))
})

test('momentFromDecision: a place decision → kind A, place, signal, moment fallback', () => {
  const m = momentFromDecision(
    { placeId: 's-angel', placeName: 'Angel Foods', photoCount: 9, memoryIds: ['m1'], isoDate: '2026-07-02', signals: { inheritedGps: true } },
    { thumbs: ['#111', '#222'], alts: [{ label: 'Herring Cove', why: 'PLAN' }] }
  )
  assert.equal(m.kind, 'A')
  assert.equal(m.place, 'Angel Foods')
  assert.equal(m.n, 9)
  assert.equal(m.signal, 'gps')
  assert.equal(m.moment, 'this one') // fallback (no descriptor, no vision name)
  assert.deepEqual(m.thumbs, ['#111', '#222'])
  assert.equal(m.alts[0].label, 'Herring Cove')
})

test('momentFromDecision: a vision decision → kind B, name + moment from visionName', () => {
  const m = momentFromDecision({
    placeId: '__vision__:2026-07-02:0', placeName: 'Sand dune adventure', photoCount: 7, memoryIds: ['m1'],
    signals: { evidence: 'vision', visionName: 'Sand dune adventure' },
  })
  assert.equal(m.kind, 'B')
  assert.equal(m.name, 'Sand dune adventure')
  assert.equal(m.moment, 'Sand dune adventure')
  assert.equal(m.signal, 'vision')
})

test('momentFromDecision: multi-signal → "multi"; null decision → null', () => {
  assert.equal(momentFromDecision({ placeName: 'X', signals: { dims: ['time', 'gps'] } }).signal, 'multi')
  assert.equal(momentFromDecision(null), null)
})

test('momentFromDecision: the engine momentDescriptor drives {moment} (the 2026-07-13 call)', () => {
  const m = momentFromDecision({ placeName: 'Angel Foods', photoCount: 9, memoryIds: ['m1'], signals: { inheritedGps: true, momentDescriptor: 'the walk into town' } })
  assert.equal(m.moment, 'the walk into town') // engine label wins over vision name / fallback
  const noLabel = momentFromDecision({ placeName: 'Angel Foods', signals: { inheritedGps: true } })
  assert.equal(noLabel.moment, 'this one') // vision labeled nothing → neutral fallback
})

test('isFilablePlace: a real stop is filable; synthetic vision/discovered ids are not', () => {
  assert.equal(isFilablePlace('s-angel'), true)
  assert.equal(isFilablePlace('__record__:2026-07-02:e1'), true) // record entries + base ARE real filing targets
  assert.equal(isFilablePlace('__vision__:2026-07-02:0'), false) // a name, not a stop
  assert.equal(isFilablePlace('__discovered__:2026-07-02:0'), false)
  assert.equal(isFilablePlace(null), false)
  assert.equal(isFilablePlace(''), false)
})

test('confirmFilings: a place-confirm files every member at the confirmed stop, source:confirmed', () => {
  const moment = { memoryIds: ['m1', 'm2'], placeId: 's-angel' }
  const fs = confirmFilings(moment, 'confirmed', null, 'jonathan')
  assert.equal(fs.length, 2)
  assert.deepEqual(fs[0], { memoryId: 'm1', stopId: 's-angel', prov: { source: 'confirmed', by: 'jonathan' } })
  assert.equal(fs[1].stopId, 's-angel')
})

test('confirmFilings: a picked alternate files at the alt stop; a base pick (null id) files nothing', () => {
  const moment = { memoryIds: ['m1'], placeId: 's-angel' }
  assert.equal(confirmFilings(moment, 'picked', { id: 's-herring', label: 'Herring Cove' }, 'helen')[0].stopId, 's-herring')
  assert.deepEqual(confirmFilings(moment, 'picked', { id: null, label: 'the beach house' }, 'helen'), []) // no stop id → re-heal handles it
})

test('confirmFilings: name / free-text / grouping / aside / skip file NO stop here', () => {
  const moment = { memoryIds: ['m1'], placeId: 's-angel' }
  for (const o of ['named', 'freetextPlace', 'freetextTime', 'aside', 'skipped']) {
    assert.deepEqual(confirmFilings(moment, o, 'the Canteen', 'jonathan'), [], `outcome ${o} should file nothing`)
  }
  // a vision-name moment (synthetic placeId) confirmed → no stop filing (it promotes a name)
  assert.deepEqual(confirmFilings({ memoryIds: ['m1'], placeId: '__vision__:x:0' }, 'confirmed', null, 'jonathan'), [])
})
