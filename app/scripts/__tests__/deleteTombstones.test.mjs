// Unit tests for deleteTombstones — the store that stops a deleted trip/memory from
// RESURRECTING when a pull re-serves a row whose remote delete never landed. Both the
// resync (retry) and the pull (skip) read it; it's keyed by kind so trip + memory share
// one honest engine.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// Minimal localStorage shim — the lib reads/writes it at call time.
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

const {
  markDeleted, clearDeleted, isDeleted, deletedIds, withoutDeleted, count, subscribe, _resetForTest,
} = await import('../../src/lib/deleteTombstones.js')

beforeEach(() => _resetForTest())

test('markDeleted / isDeleted / deletedIds track a pending delete per kind', () => {
  markDeleted('trip', 'vermont-2026')
  assert.equal(isDeleted('trip', 'vermont-2026'), true)
  assert.deepEqual(deletedIds('trip'), ['vermont-2026'])
  // a memory of the same id is a DIFFERENT tombstone — kinds are isolated
  assert.equal(isDeleted('memory', 'vermont-2026'), false)
})

test('markDeleted is idempotent', () => {
  markDeleted('trip', 't')
  markDeleted('trip', 't')
  assert.deepEqual(deletedIds('trip'), ['t'])
  assert.equal(count(), 1)
})

test('clearDeleted removes the tombstone (delete confirmed on the server)', () => {
  markDeleted('memory', 'm1')
  assert.equal(isDeleted('memory', 'm1'), true)
  clearDeleted('memory', 'm1')
  assert.equal(isDeleted('memory', 'm1'), false)
  clearDeleted('memory', 'm1') // idempotent no-op
  assert.equal(count(), 0)
})

test('withoutDeleted drops tombstoned ids from a pulled list (the resurrection guard)', () => {
  markDeleted('trip', 'gone')
  const pulled = [{ id: 'keep' }, { id: 'gone' }, { id: 'also-keep' }]
  assert.deepEqual(withoutDeleted('trip', pulled).map((t) => t.id), ['keep', 'also-keep'])
  // no tombstones → the list passes through unchanged (same array, no wasted copy)
  clearDeleted('trip', 'gone')
  assert.equal(withoutDeleted('trip', pulled), pulled)
  // a custom id accessor (e.g. memories)
  markDeleted('memory', 'x')
  const mems = [{ memId: 'x' }, { memId: 'y' }]
  assert.deepEqual(withoutDeleted('memory', mems, (m) => m.memId).map((m) => m.memId), ['y'])
})

test('kinds are isolated; an unknown kind is a safe no-op', () => {
  markDeleted('trip', 'a')
  markDeleted('memory', 'b')
  assert.deepEqual(deletedIds('trip'), ['a'])
  assert.deepEqual(deletedIds('memory'), ['b'])
  markDeleted('bogus', 'z') // ignored
  assert.equal(count(), 2)
  assert.equal(isDeleted('bogus', 'z'), false)
  assert.deepEqual(deletedIds('bogus'), [])
})

test('survives a legacy bare-id-string row + malformed blob', () => {
  store.set('rt_delete_tombstones_v1', JSON.stringify({ trip: ['legacy-id', { id: 'obj-id', at: '2026-07-03' }], memory: 'not-an-array' }))
  assert.deepEqual(deletedIds('trip').sort(), ['legacy-id', 'obj-id'])
  assert.deepEqual(deletedIds('memory'), []) // malformed → empty, no crash
})

test('subscribe fires the total count on every change', () => {
  const seen = []
  const off = subscribe((n) => seen.push(n))
  markDeleted('trip', 'a')
  markDeleted('memory', 'b')
  clearDeleted('trip', 'a')
  off()
  markDeleted('trip', 'c') // after unsubscribe — not seen
  assert.deepEqual(seen, [1, 2, 1])
})
