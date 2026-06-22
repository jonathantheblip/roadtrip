import { test } from 'node:test'
import assert from 'node:assert/strict'

const { computeFaceTags } = await import('../../src/lib/faceIndex.js')

// Centroids are compared to face embeddings by cosine similarity (faceMatch),
// so simple orthonormal vectors give deterministic matches: [1,0]→rafa, [0,1]→helen.
const CENTROIDS = [
  { personId: 'rafa', centroid: [1, 0] },
  { personId: 'helen', centroid: [0, 1] },
]
const TH = 0.36

test('tags each photo with the person whose face it contains', () => {
  const entries = [{ key: 'a' }, { key: 'b' }]
  const facesByKey = {
    a: { key: 'a', faces: [{ embedding: [1, 0] }] },
    b: { key: 'b', faces: [{ embedding: [0, 1] }] },
  }
  const tags = computeFaceTags(entries, facesByKey, CENTROIDS, TH, new Set())
  assert.deepEqual(tags, { a: ['rafa'], b: ['helen'] })
})

test('a photo with two enrolled faces lists both (centroid order)', () => {
  const entries = [{ key: 'a' }]
  const facesByKey = { a: { key: 'a', faces: [{ embedding: [0, 1] }, { embedding: [1, 0] }] } }
  const tags = computeFaceTags(entries, facesByKey, CENTROIDS, TH, new Set())
  // order follows centroids (rafa then helen), not face order
  assert.deepEqual(tags.a, ['rafa', 'helen'])
})

test('an unscanned / faceless photo gets no tag entry', () => {
  const entries = [{ key: 'a' }, { key: 'b' }]
  const facesByKey = { a: { key: 'a', faces: [{ embedding: [1, 0] }] } } // b never scanned
  const tags = computeFaceTags(entries, facesByKey, CENTROIDS, TH, new Set())
  assert.deepEqual(tags, { a: ['rafa'] })
  assert.equal(tags.b, undefined)
})

test('a "not them" rejection removes that person from the photo', () => {
  const entries = [{ key: 'a' }]
  const facesByKey = { a: { key: 'a', faces: [{ embedding: [1, 0] }] } }
  const tags = computeFaceTags(entries, facesByKey, CENTROIDS, TH, new Set(['a::rafa']))
  assert.equal(tags.a, undefined) // rafa rejected, nobody else matched
})

test('no enrolled centroids → no tags at all', () => {
  const entries = [{ key: 'a' }]
  const facesByKey = { a: { key: 'a', faces: [{ embedding: [1, 0] }] } }
  assert.deepEqual(computeFaceTags(entries, facesByKey, [], TH, new Set()), {})
})
