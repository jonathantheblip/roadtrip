// Unit tests for memorySyncQueue — the persistent INTENT queue for memory
// edits that haven't reached the family (batch A-2). The load-bearing
// semantics under test: entries store intent, not state (a move remembers its
// TARGET; a save remembers only that the record is owed), deduped per
// (memoryId, kind), with the earliest failure stamp kept — plus the uniform
// per-outcome signal both sync queues share.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

const {
  markUnsynced,
  ensureUnsynced,
  markSynced,
  clearAllFor,
  pendingIntents,
  getIntent,
  count,
  isUnsynced,
  oldestPendingAt,
  subscribe,
  emitOutcome,
  subscribeOutcomes,
  _resetForTest,
} = await import('../../src/lib/memorySyncQueue.js')

beforeEach(() => _resetForTest())

test('a save intent stores { kind, memoryId, author } — no stop (the record itself is the state)', () => {
  markUnsynced({ kind: 'save', memoryId: 'm1', author: 'helen' })
  const [e] = pendingIntents()
  assert.equal(e.kind, 'save')
  assert.equal(e.memoryId, 'm1')
  assert.equal(e.author, 'helen')
  assert.equal('stopId' in e, false, 'a save carries no target — it replays the LIVE record')
  assert.ok(Number.isFinite(e.at))
})

test('a move intent stores its TARGET — including an explicit null (deliberate unfile)', () => {
  markUnsynced({ kind: 'move', memoryId: 'm1', stopId: 'stop-a', author: 'jonathan' })
  assert.equal(pendingIntents()[0].stopId, 'stop-a')
  markUnsynced({ kind: 'move', memoryId: 'm2', stopId: null, author: 'jonathan' })
  assert.equal(pendingIntents().find((e) => e.memoryId === 'm2').stopId, null)
})

test('a HAND-move intent carries its provenance (Ch3); a plain move stores none', () => {
  const prov = { source: 'manual', by: 'jonathan', reason: 'hand-filed', targetLabel: 'Race Point' }
  markUnsynced({ kind: 'move', memoryId: 'm1', stopId: 's1', prov, author: 'jonathan' })
  assert.deepEqual(getIntent('m1', 'move').prov, prov, 'the hand-move story rides the intent to the drain')
  markUnsynced({ kind: 'move', memoryId: 'm2', stopId: 's2', author: 'jonathan' })
  assert.equal('prov' in getIntent('m2', 'move'), false, 'a plain machine/refile move is byte-identical to before Ch3')
})

test('re-deciding a hand-move updates its provenance; a plain re-mark keeps the prior prov', () => {
  const p1 = { source: 'manual', by: 'jonathan', targetLabel: 'Dinner' }
  const p2 = { source: 'manual', by: 'helen', targetLabel: 'The pier' }
  markUnsynced({ kind: 'move', memoryId: 'm1', stopId: 's1', prov: p1 })
  markUnsynced({ kind: 'move', memoryId: 'm1', stopId: 's2', prov: p2 })
  assert.deepEqual(getIntent('m1', 'move').prov, p2, 'the newest decision owns the story')
  markUnsynced({ kind: 'move', memoryId: 'm1', stopId: 's3' }) // a prov-less re-mark (bookkeeping)
  assert.deepEqual(getIntent('m1', 'move').prov, p2, 'a prov-less re-mark does not erase the human story')
})

test('one entry per (memoryId, kind): save and move for the same memory coexist; re-marks dedupe', () => {
  markUnsynced({ kind: 'save', memoryId: 'm1', author: 'helen' })
  markUnsynced({ kind: 'move', memoryId: 'm1', stopId: 's1', author: 'helen' })
  markUnsynced({ kind: 'save', memoryId: 'm1', author: 'helen' })
  assert.equal(count(), 2)
})

test('re-marking a move REPLACES the stored target (the latest decision is the intent) and keeps the EARLIEST stamp', () => {
  markUnsynced({ kind: 'move', memoryId: 'm1', stopId: 'first-target', author: 'helen' })
  const first = pendingIntents()[0].at
  markUnsynced({ kind: 'move', memoryId: 'm1', stopId: 'second-target', author: 'jonathan' })
  const [e] = pendingIntents()
  assert.equal(e.stopId, 'second-target', 'the newest decision replaces the old target')
  assert.equal(e.author, 'jonathan')
  assert.equal(e.at, first, 'age answers "how long out of sync", not "when did the latest retry fail"')
})

test('ensureUnsynced queues when absent but NEVER replaces an existing entry (a stale settle cannot supersede a newer decision)', () => {
  ensureUnsynced({ kind: 'move', memoryId: 'm1', stopId: 'from-settle', author: 'helen' })
  assert.equal(getIntent('m1', 'move').stopId, 'from-settle', 'creates when nothing is queued')
  markUnsynced({ kind: 'move', memoryId: 'm1', stopId: 'newer-decision', author: 'helen' })
  ensureUnsynced({ kind: 'move', memoryId: 'm1', stopId: 'stale-op-target', author: 'jonathan' })
  const e = getIntent('m1', 'move')
  assert.equal(e.stopId, 'newer-decision', 'an op that began before the latest move settles late without rolling the target back')
  assert.equal(e.author, 'helen', 'the existing entry is untouched entirely — presence was already guaranteed')
})

test('getIntent returns the LIVE entry per (memoryId, kind); null for anything not queued', () => {
  markUnsynced({ kind: 'move', memoryId: 'm1', stopId: 's1' })
  assert.equal(getIntent('m1', 'move').stopId, 's1')
  assert.equal(getIntent('m1', 'save'), null)
  assert.equal(getIntent('m2', 'move'), null)
  assert.equal(getIntent('m1', 'rename'), null)
})

test('markSynced clears ONE kind; the other intent for the same memory stays owed', () => {
  markUnsynced({ kind: 'save', memoryId: 'm1', author: 'helen' })
  markUnsynced({ kind: 'move', memoryId: 'm1', stopId: 's1', author: 'helen' })
  markSynced('m1', 'save')
  assert.equal(count(), 1)
  assert.equal(pendingIntents()[0].kind, 'move')
  assert.equal(isUnsynced('m1'), true)
})

test('clearAllFor drops every intent for a memory (the family delete won — nothing is owed)', () => {
  markUnsynced({ kind: 'save', memoryId: 'm1', author: 'helen' })
  markUnsynced({ kind: 'move', memoryId: 'm1', stopId: 's1', author: 'helen' })
  markUnsynced({ kind: 'save', memoryId: 'm2', author: 'helen' })
  clearAllFor('m1')
  assert.deepEqual(pendingIntents().map((e) => e.memoryId), ['m2'])
})

test('invalid intents are dropped (no kind, unknown kind, no memoryId)', () => {
  markUnsynced({ memoryId: 'm1' })
  markUnsynced({ kind: 'rename', memoryId: 'm1' })
  markUnsynced({ kind: 'save' })
  assert.equal(count(), 0)
})

test('oldestPendingAt: earliest across entries; null when empty', () => {
  assert.equal(oldestPendingAt(), null)
  markUnsynced({ kind: 'save', memoryId: 'a' })
  const first = oldestPendingAt()
  markUnsynced({ kind: 'move', memoryId: 'b', stopId: 's' })
  assert.equal(oldestPendingAt(), first)
})

test('subscribe reports the pending count on every write', () => {
  const seen = []
  const off = subscribe((n) => seen.push(n))
  markUnsynced({ kind: 'save', memoryId: 'm1' })
  markUnsynced({ kind: 'move', memoryId: 'm1', stopId: 's' })
  markSynced('m1', 'save')
  off()
  markSynced('m1', 'move')
  assert.deepEqual(seen, [1, 2, 1], 'counts fan out; unsubscribed listeners stop receiving')
})

test('the per-outcome signal: subscribers receive (id, outcome); invalid outcomes never fan out', () => {
  const seen = []
  const off = subscribeOutcomes((id, outcome) => seen.push([id, outcome]))
  emitOutcome('m1', 'synced')
  emitOutcome('m1', 'refused')
  emitOutcome('m2', 'delete-adopted')
  emitOutcome('m2', 'still-pending')
  emitOutcome('m3', 'green-check') // not in the vocabulary — a lie must not fan out
  off()
  emitOutcome('m4', 'synced')
  assert.deepEqual(seen, [
    ['m1', 'synced'],
    ['m1', 'refused'],
    ['m2', 'delete-adopted'],
    ['m2', 'still-pending'],
  ])
})

test('the trip queue speaks the SAME outcome vocabulary on its own channel (uniform, no cross-talk)', async () => {
  const tripQueue = await import('../../src/lib/tripSyncQueue.js')
  const tripSeen = []
  const memSeen = []
  const offTrip = tripQueue.subscribeOutcomes((id, o) => tripSeen.push([id, o]))
  const offMem = subscribeOutcomes((id, o) => memSeen.push([id, o]))
  tripQueue.emitOutcome('t1', 'synced')
  emitOutcome('m1', 'delete-adopted')
  offTrip()
  offMem()
  assert.deepEqual(tripSeen, [['t1', 'synced']], 'trip outcomes stay on the trip channel')
  assert.deepEqual(memSeen, [['m1', 'delete-adopted']], 'memory outcomes stay on the memory channel')
})
