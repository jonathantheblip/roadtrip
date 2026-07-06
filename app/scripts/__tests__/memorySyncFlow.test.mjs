// Unit tests for memorySyncFlow — the pure half of honest memory sync (batch
// A-2): the stop-preserving default reapply, the move reapply's stored-target
// semantics, and the honest classification of a pushMemory result.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { sameStopId, mergeSaveOverFresh, moveReapply, readMemoryPushResult } = await import(
  '../../src/lib/memorySyncFlow.js'
)

test('sameStopId: null and undefined are the SAME (unfiled) filing; real ids compare exactly', () => {
  assert.equal(sameStopId(null, undefined), true)
  assert.equal(sameStopId(undefined, undefined), true)
  assert.equal(sameStopId('s1', 's1'), true)
  assert.equal(sameStopId('s1', 's2'), false)
  assert.equal(sameStopId('s1', null), false)
})

test('mergeSaveOverFresh: local content wins, FRESH filing wins — a caption edit can never move a memory', () => {
  const local = { id: 'm', caption: 'my caption edit', stopId: 'old-stop', updatedAt: '2030-01-01T00:00:00.000Z' }
  const fresh = { id: 'm', caption: 'their caption', stopId: 'moved-here', updatedAt: '2026-07-05T10:00:00.000Z' }
  const merged = mergeSaveOverFresh(local, fresh)
  assert.equal(merged.caption, 'my caption edit', 'the deliberate content edit wins')
  assert.equal(merged.stopId, 'moved-here', 'the fresh stop filing is preserved — only a move op may change it')
})

test('mergeSaveOverFresh: fresh stopProv rides along with the filing it describes (Stage-B seam)', () => {
  const local = { id: 'm', caption: 'edit', stopId: 'old', stopProv: { source: 'auto' } }
  const fresh = { id: 'm', caption: 'c', stopId: 'new', stopProv: { source: 'manual', by: 'helen' } }
  const merged = mergeSaveOverFresh(local, fresh)
  assert.equal(merged.stopId, 'new')
  assert.deepEqual(merged.stopProv, { source: 'manual', by: 'helen' }, 'provenance travels with the stopId it explains')
})

test('mergeSaveOverFresh: an unfiled fresh row unfiles the merge (stopId is not sticky content)', () => {
  const merged = mergeSaveOverFresh({ id: 'm', caption: 'edit', stopId: 'somewhere' }, { id: 'm', stopId: null })
  assert.equal(merged.stopId, null)
})

test('moveReapply: re-asserts the STORED target onto fresh with a bumped stamp', () => {
  const reapply = moveReapply('target-stop', () => '2026-07-05T12:00:00.000Z')
  const fresh = { id: 'm', caption: 'kept', stopId: 'elsewhere', updatedAt: '2026-07-05T10:00:00.000Z' }
  const out = reapply(fresh)
  assert.equal(out.stopId, 'target-stop', 'the move target is the closure-captured intent, never re-derived')
  assert.equal(out.caption, 'kept', 'every fresh content field is preserved')
  assert.equal(out.updatedAt, '2026-07-05T12:00:00.000Z')
})

test('moveReapply: returns null (skip the push) when fresh already sits at the target — incl. null/undefined unfiled', () => {
  assert.equal(moveReapply('s1')({ id: 'm', stopId: 's1' }), null, 'content-identical re-push suppressed')
  assert.equal(moveReapply(null)({ id: 'm', stopId: undefined }), null, 'unfiled == unfiled')
  assert.notEqual(moveReapply('s1')({ id: 'm', stopId: 's2' }), null)
})

test('readMemoryPushResult: the honest per-item classification', () => {
  assert.equal(readMemoryPushResult(null).status, 'unconfigured', 'no worker / masked preflight — nothing was pushed')
  assert.equal(readMemoryPushResult(undefined).status, 'unconfigured')
  assert.equal(readMemoryPushResult(false).status, 'unconfigured')
  const parseMiss = readMemoryPushResult(true)
  assert.equal(parseMiss.status, 'synced', 'a 2xx with an unparseable body IS a confirmed push')
  assert.equal(parseMiss.updatedAt, null, '…but stampless — no restamp possible')
  assert.equal(readMemoryPushResult({ ok: true, skipped: 'masked-projection', id: 'm' }).status, 'refused')
  const row = readMemoryPushResult({ id: 'm', stopId: 's1', updatedAt: '2026-07-05T10:00:00.000Z' })
  assert.equal(row.status, 'synced')
  assert.equal(row.updatedAt, '2026-07-05T10:00:00.000Z')
  assert.equal(row.serverRow.stopId, 's1', 'the stored row rides out for the refusal-adoption seam')
})
