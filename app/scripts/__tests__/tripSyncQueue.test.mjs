// Unit tests for tripSyncQueue — the persistent record of trip edits that
// haven't reached the family yet (the engine behind self-healing family sync).
// Entries carry { id, author, at }: `at` (batch A-1, F2) is when the edit FIRST
// failed to reach the family, so the honest index note can tell an edit stuck
// for minutes from one merely in flight — "stuck for 5 days" was previously
// undetectable even in principle.
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

const { markUnsynced, markSynced, pendingIds, pendingEntries, count, isUnsynced, oldestPendingAt, subscribe, _resetForTest } =
  await import('../../src/lib/tripSyncQueue.js')

beforeEach(() => _resetForTest())

test('captures the editor (author) and exposes it via pendingEntries', () => {
  markUnsynced('vermont-2026', 'aurelia')
  const [entry] = pendingEntries()
  assert.equal(entry.id, 'vermont-2026')
  assert.equal(entry.author, 'aurelia')
  // pendingIds() stays id-only for the count/flag callers.
  assert.deepEqual(pendingIds(), ['vermont-2026'])
})

test('markUnsynced stamps WHEN the edit first failed (epoch ms)', () => {
  const before = Date.now()
  markUnsynced('t1', 'helen')
  const after = Date.now()
  const [entry] = pendingEntries()
  assert.ok(Number.isFinite(entry.at))
  assert.ok(entry.at >= before && entry.at <= after)
})

test('re-marking updates the author to the latest editor but keeps the EARLIEST stamp', () => {
  markUnsynced('t', 'aurelia')
  const first = pendingEntries()[0].at
  markUnsynced('t', 'jonathan') // a later edit by someone else fails again
  const [entry] = pendingEntries()
  assert.equal(entry.author, 'jonathan')
  // The age answers "how long has this trip been out of sync", not "when did
  // the latest retry fail".
  assert.equal(entry.at, first)
  assert.equal(count(), 1)
})

test('a missing author defaults to null (resync then falls back to active)', () => {
  markUnsynced('t')
  const [entry] = pendingEntries()
  assert.equal(entry.author, null)
})

test('oldestPendingAt is the earliest stamp across entries; null when empty', () => {
  assert.equal(oldestPendingAt(), null)
  markUnsynced('t1')
  const first = pendingEntries()[0].at
  markUnsynced('t2')
  assert.equal(oldestPendingAt(), first)
  markSynced('t1')
  assert.equal(oldestPendingAt(), pendingEntries()[0].at)
  markSynced('t2')
  assert.equal(oldestPendingAt(), null)
})

test('back-compat: pre-author / pre-age rows read as null author + null stamp', async () => {
  // Seat the OLD on-disk shapes directly: a bare id string, and an
  // { id, author } object with no `at`.
  store.set('rt_trips_unsynced_v1', JSON.stringify(['legacy-trip', { id: 'legacy-obj', author: 'helen' }]))
  const fresh = await import('../../src/lib/tripSyncQueue.js?reload=back')
  assert.deepEqual(fresh.pendingEntries(), [
    { id: 'legacy-trip', author: null, at: null },
    { id: 'legacy-obj', author: 'helen', at: null },
  ])
  assert.equal(fresh.isUnsynced('legacy-trip'), true)
  // Unknown age = long ago: the note must err toward "stuck", never false calm.
  assert.equal(fresh.oldestPendingAt(), 0)
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
