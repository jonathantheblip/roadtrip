// Unit tests for removePhotoFromRecord — the pure core of per-photo album
// delete. Covers every photo container shape (canonical photoRefs[], legacy
// single photoRef, photoExternalURLs[], and an E4 heterogeneous `pieces`
// moment) plus the "last photo → delete the whole memory" signal. Pure: no I/O.

import test from 'node:test'
import assert from 'node:assert/strict'

import { removePhotoFromRecord } from '../../src/lib/memoryStore.js'

test('multi-photo album: removes the matched ref, keeps the rest, re-mirrors photoRef', () => {
  const rec = {
    id: 'm1',
    photoRefs: [
      { url: 'a.jpg', key: 'k-a' },
      { url: 'b.jpg', key: 'k-b' },
      { url: 'c.jpg', key: 'k-c' },
    ],
    photoRef: { url: 'a.jpg', key: 'k-a' },
    photoExternalURLs: [],
  }
  const { record, removed } = removePhotoFromRecord(rec, { photoUrl: 'b.jpg', refKey: 'k-b' })
  assert.equal(removed, true)
  assert.deepEqual(record.photoRefs.map((r) => r.url), ['a.jpg', 'c.jpg'])
  assert.equal(record.photoRef.url, 'a.jpg', 'photoRef re-mirrors the new first photo')
  // Original untouched (purity).
  assert.equal(rec.photoRefs.length, 3)
})

test('last photo in an album → record:null (caller deletes the whole memory)', () => {
  const rec = { id: 'm2', photoRefs: [{ url: 'only.jpg', key: 'k1' }], photoExternalURLs: [] }
  const { record, removed } = removePhotoFromRecord(rec, { photoUrl: 'only.jpg' })
  assert.equal(removed, true)
  assert.equal(record, null)
})

test('legacy single photoRef → removing it empties the memory', () => {
  const rec = { id: 'm3', photoRef: { url: 'solo.jpg', key: 'k' } }
  const { record, removed } = removePhotoFromRecord(rec, { photoUrl: 'solo.jpg' })
  assert.equal(removed, true)
  assert.equal(record, null)
})

test('photoExternalURLs: removes the matched url, keeps siblings', () => {
  const rec = { id: 'm4', photoExternalURLs: ['x.jpg', 'y.jpg', 'z.jpg'] }
  const { record, removed } = removePhotoFromRecord(rec, { photoUrl: 'y.jpg' })
  assert.equal(removed, true)
  assert.deepEqual(record.photoExternalURLs, ['x.jpg', 'z.jpg'])
})

test('heterogeneous pieces moment: removes the photo piece, keeps the voice piece', () => {
  const rec = {
    id: 'm5',
    pieces: [
      { kind: 'photo', url: 'p.jpg', key: 'kp' },
      { kind: 'voice', key: 'kv', durationSeconds: 4 },
    ],
    photoExternalURLs: [],
  }
  const { record, removed } = removePhotoFromRecord(rec, { photoUrl: 'p.jpg', refKey: 'kp' })
  assert.equal(removed, true)
  assert.notEqual(record, null, 'memory survives — it still has the voice piece')
  assert.deepEqual(record.pieces.map((p) => p.kind), ['voice'])
})

test('matches by R2 key even when the url differs (post-resave key drift)', () => {
  const rec = {
    id: 'm6',
    photoRefs: [{ url: 'old-url.jpg', key: 'k-keep' }, { url: 'other.jpg', key: 'k-drop' }],
    photoExternalURLs: [],
  }
  const { record, removed } = removePhotoFromRecord(rec, { photoUrl: 'no-such-url', refKey: 'k-drop' })
  assert.equal(removed, true)
  assert.deepEqual(record.photoRefs.map((r) => r.key), ['k-keep'])
})

test('no match → removed:false, record returned unchanged', () => {
  const rec = { id: 'm7', photoRefs: [{ url: 'a.jpg', key: 'k' }], photoExternalURLs: [] }
  const { record, removed } = removePhotoFromRecord(rec, { photoUrl: 'ghost.jpg', refKey: 'nope' })
  assert.equal(removed, false)
  assert.equal(record, rec)
})
