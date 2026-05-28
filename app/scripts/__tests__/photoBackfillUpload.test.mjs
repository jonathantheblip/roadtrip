// Tests for the upload helper. The heavy lifting (saveAsset to IDB,
// pushMemory to the worker) is exercised end-to-end in Playwright;
// this file focuses on the pure mergeRefIntoExisting dedup logic
// behind the re-attach case, since silent dedup bugs would create
// duplicate refs on every retry.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { mergeRefIntoExisting } = await import('../../src/lib/photoRefMerge.js')

test('mergeRefIntoExisting: empty existing returns just the new ref', () => {
  const merged = mergeRefIntoExisting({}, { key: 'photo_new', storage: 'idb' })
  assert.deepEqual(merged, [{ key: 'photo_new', storage: 'idb' }])
})

test('mergeRefIntoExisting: appends to existing photoRefs array', () => {
  const existing = {
    photoRefs: [{ key: 'old1', storage: 'r2' }],
  }
  const merged = mergeRefIntoExisting(existing, { key: 'photo_new', storage: 'idb' })
  assert.equal(merged.length, 2)
  assert.equal(merged[0].key, 'old1')
  assert.equal(merged[1].key, 'photo_new')
})

test('mergeRefIntoExisting: does not duplicate when new ref already present', () => {
  const existing = {
    photoRefs: [{ key: 'photo_new', storage: 'r2' }],
  }
  const merged = mergeRefIntoExisting(existing, { key: 'photo_new', storage: 'idb' })
  assert.equal(merged.length, 1)
  assert.equal(merged[0].storage, 'r2', 'preserves existing ref form on conflict')
})

test('mergeRefIntoExisting: folds legacy photoRef into the array', () => {
  const existing = {
    photoRefs: [{ key: 'old1', storage: 'r2' }],
    photoRef: { key: 'old-legacy', storage: 'r2' },
  }
  const merged = mergeRefIntoExisting(existing, { key: 'photo_new', storage: 'idb' })
  const keys = merged.map((r) => r.key)
  assert.deepEqual(keys, ['old1', 'old-legacy', 'photo_new'])
})

test('mergeRefIntoExisting: legacy photoRef already in photoRefs is not duplicated', () => {
  const existing = {
    photoRefs: [{ key: 'old1', storage: 'r2' }],
    photoRef: { key: 'old1', storage: 'r2' },
  }
  const merged = mergeRefIntoExisting(existing, { key: 'new', storage: 'idb' })
  const keys = merged.map((r) => r.key)
  assert.deepEqual(keys, ['old1', 'new'])
})

test('mergeRefIntoExisting: skips null entries in existing photoRefs', () => {
  const existing = { photoRefs: [null, { key: 'old', storage: 'r2' }, null] }
  const merged = mergeRefIntoExisting(existing, { key: 'new', storage: 'idb' })
  assert.equal(merged.length, 2)
  assert.equal(merged[0].key, 'old')
  assert.equal(merged[1].key, 'new')
})
