// confirmSurface.js — the S1 confirm card's pure client-local seams. Proves the
// two doors compute the SAME question (deterministic, order-independent) and the
// shared one-a-day budget, without a browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pickConfirmOfDay, confirmKindOf, confirmBudgetSpentToday, spendConfirmBudget, CONFIRM_BUDGET_KEY,
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

test('confirmKindOf: vision id → B (name), else A (place)', () => {
  assert.equal(confirmKindOf({ placeId: '__vision__:2026-07-02:0' }), 'B')
  assert.equal(confirmKindOf({ placeId: 's-angel' }), 'A')
  assert.equal(confirmKindOf({}), 'A')
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
