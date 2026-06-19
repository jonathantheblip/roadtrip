// Pure hydration logic behind useHydratedMemories — the step that swaps a dead,
// post-reload `blob:` url on an offline `pending` ref for the freshly-loaded idb
// object URL so the album tile shows the real picture again. The React/idb
// wiring is exercised in Playwright (photos-import-offline reload gate); this
// covers the transform exactly, including the VIDEO poster path that the
// headless importer can't reach (no WebCodecs encode in Node/headless).

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { hydrateMemoriesWith, hydrateRefWith } = await import('../../src/lib/usePhotoHydration.js')

// urlForKey stand-in: a fixed map of "loaded" idb blobs.
const loaded = (map) => (key) => map[key] || null

test('photo pending ref: dead url is replaced by the loaded idb url', () => {
  const mems = [{ id: 'm1', photoRef: { storage: 'pending', key: 'k1', url: 'blob:dead' } }]
  const out = hydrateMemoriesWith(mems, loaded({ k1: 'blob:live-1' }))
  assert.equal(out[0].photoRef.url, 'blob:live-1')
  // storage/key untouched — still queue-owned + still idb-backed.
  assert.equal(out[0].photoRef.storage, 'pending')
  assert.equal(out[0].photoRef.key, 'k1')
})

test('video pending ref: posterUrl (the tile still) is hydrated from posterKey', () => {
  const mems = [
    { id: 'm1', photoRef: { storage: 'pending', kind: 'video', posterKey: 'pk', url: 'blob:dead-video' } },
  ]
  const out = hydrateMemoriesWith(mems, loaded({ pk: 'blob:poster-live' }))
  assert.equal(out[0].photoRef.posterUrl, 'blob:poster-live')
  // The video tile renders posterUrl; url (the unplayable-offline video) is left
  // as-is — offline playback is out of scope by design.
  assert.equal(out[0].photoRef.url, 'blob:dead-video')
})

test('r2 ref: untouched (renders from its durable url, never from idb)', () => {
  const ref = { storage: 'r2', key: 'helen/x', url: 'https://r2/x' }
  const mems = [{ id: 'm1', photoRef: ref }]
  const out = hydrateMemoriesWith(mems, loaded({ 'helen/x': 'blob:should-not-be-used' }))
  // Same object identity — nothing changed.
  assert.equal(out, mems)
  assert.equal(out[0].photoRef, ref)
})

test('not-yet-loaded pending ref: left untouched until its blob resolves', () => {
  const mems = [{ id: 'm1', photoRef: { storage: 'pending', key: 'k1', url: 'blob:dead' } }]
  const out = hydrateMemoriesWith(mems, loaded({})) // nothing loaded yet
  assert.equal(out, mems) // same identity → no needless re-render
  assert.equal(out[0].photoRef.url, 'blob:dead')
})

test('photoRefs[] album: each pending entry hydrates independently', () => {
  const mems = [
    {
      id: 'm1',
      photoRefs: [
        { storage: 'r2', key: 'r', url: 'https://r2/r' },
        { storage: 'pending', key: 'p', url: 'blob:dead' },
      ],
    },
  ]
  const out = hydrateMemoriesWith(mems, loaded({ p: 'blob:live-p' }))
  assert.equal(out[0].photoRefs[0].url, 'https://r2/r') // r2 untouched
  assert.equal(out[0].photoRefs[1].url, 'blob:live-p') // pending hydrated
})

test('stable identity: a fully-synced set returns the SAME array (no churn)', () => {
  const mems = [{ id: 'm1', photoRef: { storage: 'r2', key: 'x', url: 'https://r2/x' } }]
  assert.equal(hydrateMemoriesWith(mems, loaded({})), mems)
})

test('hydrateRefWith: null ref is a safe no-op', () => {
  assert.deepEqual(hydrateRefWith(null, loaded({})), { ref: null, changed: false })
})

test('empty / nullish memories list: returns an array, never throws', () => {
  assert.deepEqual(hydrateMemoriesWith(null, loaded({})), [])
  assert.deepEqual(hydrateMemoriesWith([], loaded({})), [])
})
