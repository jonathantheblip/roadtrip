// Unit tests for tripSyncQueue — the persistent record of trip edits that
// haven't reached the family yet (the engine behind self-healing family sync).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// Minimal localStorage shim — the lib reads/writes it at call time, so setting
// it before the dynamic import is enough.
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

const { markUnsynced, markSynced, pendingIds, pendingEntries, count, isUnsynced, subscribe, _resetForTest } =
  await import('../../src/lib/tripSyncQueue.js')

beforeEach(() => _resetForTest())

test('captures the editor (author) and exposes it via pendingEntries', () => {
  markUnsynced('vermont-2026', 'aurelia')
  assert.deepEqual(pendingEntries(), [{ id: 'vermont-2026', author: 'aurelia' }])
  // pendingIds() stays id-only for the count/flag callers.
  assert.deepEqual(pendingIds(), ['vermont-2026'])
})

test('re-marking updates the author to the latest editor', () => {
  markUnsynced('t', 'aurelia')
  markUnsynced('t', 'jonathan') // a later edit by someone else
  assert.deepEqual(pendingEntries(), [{ id: 't', author: 'jonathan' }])
  assert.equal(count(), 1)
})

test('a missing author defaults to null (resync then falls back to active)', () => {
  markUnsynced('t')
  assert.deepEqual(pendingEntries(), [{ id: 't', author: null }])
})

test('back-compat: a pre-author bare-string row reads as { author: null }', async () => {
  // Seat the OLD on-disk shape (array of id strings) directly.
  store.set('rt_trips_unsynced_v1', JSON.stringify(['legacy-trip']))
  const fresh = await import('../../src/lib/tripSyncQueue.js?reload=back')
  assert.deepEqual(fresh.pendingEntries(), [{ id: 'legacy-trip', author: null }])
  assert.deepEqual(fresh.pendingIds(), ['legacy-trip'])
  assert.equal(fresh.isUnsynced('legacy-trip'), true)
})

test('markUnsynced records an id; markSynced clears it', () => {
  assert.equal(count(), 0)
  markUnsynced('vermont-2026')
  assert.equal(isUnsynced('vermont-2026'), true)
  assert.deepEqual(pendingIds(), ['vermont-2026'])
  markSynced('vermont-2026')
  assert.equal(isUnsynced('vermont-2026'), false)
  assert.equal(count(), 0)
})

test('markUnsynced is idempotent — no duplicate ids', () => {
  markUnsynced('a')
  markUnsynced('a')
  markUnsynced('a')
  assert.deepEqual(pendingIds(), ['a'])
  assert.equal(count(), 1)
})

test('markSynced of an absent id is a harmless no-op', () => {
  markUnsynced('a')
  markSynced('b') // never queued
  assert.deepEqual(pendingIds(), ['a'])
})

test('the queue persists across a reload (survives the session that failed)', async () => {
  markUnsynced('stranded')
  // Simulate a fresh module load against the same backing store.
  const fresh = await import('../../src/lib/tripSyncQueue.js?reload=1')
  assert.equal(fresh.isUnsynced('stranded'), true)
  assert.deepEqual(fresh.pendingIds(), ['stranded'])
})

test('falsy / non-string ids are ignored (never poison the queue)', () => {
  markUnsynced(null)
  markUnsynced(undefined)
  markUnsynced('')
  markUnsynced(42)
  assert.equal(count(), 0)
})

test('subscribe fires with the new pending count on each change', () => {
  const seen = []
  const off = subscribe((n) => seen.push(n))
  markUnsynced('a') // → 1
  markUnsynced('b') // → 2
  markSynced('a') //  → 1
  off()
  markUnsynced('c') // not observed after unsubscribe
  assert.deepEqual(seen, [1, 2, 1])
})
