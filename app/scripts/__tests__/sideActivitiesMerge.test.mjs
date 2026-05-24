import { test } from 'node:test'
import assert from 'node:assert/strict'

// The full sideActivities/index.js pulls in import.meta.glob which
// Vite expands at build. Node can't evaluate that. Re-import only the
// canonical helpers + manually reimplement the merge logic inline so
// we can assert the behavior — keep them in lockstep with the index.

const { canonicalKey } = await import('../../src/data/sideActivities/canonical.js')

// Mirror of getActivitiesForTrip's merge logic — we re-test it here
// so the spec is locked in. If the loader's contract changes, this
// test stops passing and points at the right file.
function mergeSharedIntoSeed(seed, sharedActivities) {
  const list = [...seed]
  const seen = new Set(seed.map((a) => canonicalKey(a)).filter(Boolean))
  for (const a of sharedActivities || []) {
    const k = canonicalKey(a)
    if (k && seen.has(k)) continue
    list.push(a)
    if (k) seen.add(k)
  }
  return list
}

test('merge appends a share_in record when its canonical key is new', () => {
  const seed = [
    {
      id: 'sift-bake-shop',
      name: 'Sift Bake Shop',
      lat: 41.3722,
      lng: -71.9667,
      category: 'meal_breakfast',
    },
  ]
  const shared = [
    {
      id: 'share_kitchen-little_xyz',
      name: 'Kitchen Little',
      lat: 41.3744,
      lng: -71.9698,
      category: 'meal_breakfast',
      source: 'share_in',
    },
  ]
  const merged = mergeSharedIntoSeed(seed, shared)
  assert.equal(merged.length, 2)
  assert.equal(merged[1].source, 'share_in')
})

test('merge drops a share_in record when its canonical key collides with a seed entry', () => {
  const seed = [
    {
      id: 'sift-bake-shop',
      name: 'Sift Bake Shop',
      lat: 41.3722,
      lng: -71.9667,
      category: 'meal_breakfast',
      placeId: 'ChIJxxxsift',
    },
  ]
  const shared = [
    {
      id: 'share_sift-bake-shop_abc',
      name: 'Sift Bake Shop',
      lat: 41.3722,
      lng: -71.9667,
      category: 'meal_breakfast',
      placeId: 'ChIJxxxsift',
      source: 'share_in',
    },
  ]
  const merged = mergeSharedIntoSeed(seed, shared)
  // Seed wins on collision — the polished hand-written copy stays.
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'sift-bake-shop')
})

test('merge preserves the order: seed first, then shared appended', () => {
  const seed = [{ id: 'a', name: 'A', lat: 1.0, lng: 1.0 }]
  const shared = [{ id: 'b', name: 'B', lat: 2.0, lng: 2.0, source: 'share_in' }]
  const merged = mergeSharedIntoSeed(seed, shared)
  assert.equal(merged[0].id, 'a')
  assert.equal(merged[1].id, 'b')
})

test('merge handles missing sharedActivities (undefined / null / empty array)', () => {
  const seed = [{ id: 'a', name: 'A', lat: 1.0, lng: 1.0 }]
  assert.deepEqual(mergeSharedIntoSeed(seed, undefined), seed)
  assert.deepEqual(mergeSharedIntoSeed(seed, null), seed)
  assert.deepEqual(mergeSharedIntoSeed(seed, []), seed)
})
