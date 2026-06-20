import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// posterRetry persists markers in localStorage — stub it before importing.
globalThis.localStorage = (() => {
  let store = {}
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v)
    },
    removeItem: (k) => {
      delete store[k]
    },
    clear: () => {
      store = {}
    },
  }
})()

const { uploadPosterOrQueue, drainPendingPosters, pendingPosterCount } = await import(
  '../../src/lib/posterRetry.js'
)

beforeEach(() => localStorage.clear())

// Injected fake dependencies — no network / no idb.
function deps({ poster = null, loadBlob = { type: 'image/jpeg' } } = {}) {
  const calls = {
    uploadPoster: [],
    saveAsset: [],
    loadAsset: [],
    removeAsset: [],
    updateMemoryPoster: [],
    keys: 0,
  }
  return {
    calls,
    d: {
      uploadPoster: async (id, _blob, opts) => {
        calls.uploadPoster.push({ id, opts })
        return poster
      },
      saveAsset: async (...a) => {
        calls.saveAsset.push(a)
      },
      loadAsset: async (store, key) => {
        calls.loadAsset.push({ store, key })
        return loadBlob
      },
      removeAsset: async (...a) => {
        calls.removeAsset.push(a)
      },
      makeAssetKey: () => `idbkey_${++calls.keys}`,
      updateMemoryPoster: (...a) => {
        calls.updateMemoryPoster.push(a)
      },
    },
  }
}

const POSTER = { posterKey: 'r2/poster_k', posterUrl: 'https://r2/poster.jpg' }
const BLOB = { type: 'image/jpeg' }

test('uploadPosterOrQueue: a successful upload returns the poster and queues nothing', async () => {
  const { d, calls } = deps({ poster: POSTER })
  const r = await uploadPosterOrQueue('m1', BLOB, {}, d)
  assert.deepEqual(r, POSTER)
  assert.equal(pendingPosterCount(), 0)
  assert.equal(calls.saveAsset.length, 0)
})

test('uploadPosterOrQueue: a failed upload queues a marker + persists the blob for retry', async () => {
  const { d, calls } = deps({ poster: null })
  const r = await uploadPosterOrQueue('m1', BLOB, { asTraveler: 'helen' }, d)
  assert.equal(r, null)
  assert.equal(pendingPosterCount(), 1)
  assert.equal(calls.saveAsset.length, 1)
})

test('uploadPosterOrQueue: a failure with no poster blob queues nothing (nothing to retry)', async () => {
  const { d } = deps({ poster: null })
  assert.equal(await uploadPosterOrQueue('m1', null, {}, d), null)
  assert.equal(pendingPosterCount(), 0)
})

test('uploadPosterOrQueue: re-queuing the same memory dedupes to one marker', async () => {
  const { d } = deps({ poster: null })
  await uploadPosterOrQueue('m1', BLOB, {}, d)
  await uploadPosterOrQueue('m1', BLOB, {}, d)
  assert.equal(pendingPosterCount(), 1)
})

test('drainPendingPosters: a successful retry patches the memory, credits the author, clears the marker', async () => {
  await uploadPosterOrQueue('m1', BLOB, { asTraveler: 'helen' }, deps({ poster: null }).d)
  assert.equal(pendingPosterCount(), 1)
  const { d, calls } = deps({ poster: POSTER })
  const r = await drainPendingPosters(d)
  assert.deepEqual(r, { uploaded: 1, remaining: 0 })
  assert.equal(pendingPosterCount(), 0)
  assert.deepEqual(calls.updateMemoryPoster[0], ['m1', POSTER.posterKey, POSTER.posterUrl])
  assert.equal(calls.removeAsset.length, 1) // idb orphan cleaned
  assert.equal(calls.uploadPoster[0].opts.asTraveler, 'helen')
})

test('drainPendingPosters: a still-failing retry keeps the marker and bumps attempts', async () => {
  await uploadPosterOrQueue('m1', BLOB, {}, deps({ poster: null }).d)
  const r = await drainPendingPosters(deps({ poster: null }).d)
  assert.deepEqual(r, { uploaded: 0, remaining: 1 })
  assert.equal(pendingPosterCount(), 1)
})

test('drainPendingPosters: gives up (drops the marker) after the attempts cap', async () => {
  await uploadPosterOrQueue('m1', BLOB, {}, deps({ poster: null }).d)
  let last
  for (let i = 0; i < 8; i++) last = await drainPendingPosters(deps({ poster: null }).d)
  assert.equal(pendingPosterCount(), 0)
  assert.equal(last.remaining, 0)
})

test('drainPendingPosters: a vanished blob drops the marker without uploading', async () => {
  await uploadPosterOrQueue('m1', BLOB, {}, deps({ poster: null }).d)
  const { d, calls } = deps({ loadBlob: null })
  const r = await drainPendingPosters(d)
  assert.equal(r.remaining, 0)
  assert.equal(calls.uploadPoster.length, 0)
  assert.equal(pendingPosterCount(), 0)
})

test('drainPendingPosters: an OFFLINE pass does not count toward give-up (marker survives, no attempt)', async () => {
  await uploadPosterOrQueue('m1', BLOB, {}, deps({ poster: null }).d)
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true })
  try {
    const { d, calls } = deps({ poster: null })
    const r = await drainPendingPosters(d)
    assert.equal(r.offline, true)
    assert.equal(r.remaining, 1)
    assert.equal(pendingPosterCount(), 1)
    assert.equal(calls.uploadPoster.length, 0) // never tried while offline
  } finally {
    if (prev) Object.defineProperty(globalThis, 'navigator', prev)
    else delete globalThis.navigator
  }
})

test('drainPendingPosters: preserves a marker queued CONCURRENTLY during its run', async () => {
  await uploadPosterOrQueue('m1', BLOB, {}, deps({ poster: null }).d)
  // m1's drain succeeds, but mid-upload a live import queues a SECOND poster
  // (m2). The drain's final write must NOT clobber m2.
  const racing = {
    uploadPoster: async () => {
      await uploadPosterOrQueue('m2', BLOB, {}, deps({ poster: null }).d)
      return POSTER
    },
    saveAsset: async () => {},
    loadAsset: async () => BLOB,
    removeAsset: async () => {},
    makeAssetKey: () => 'k2',
    updateMemoryPoster: () => {},
  }
  const r = await drainPendingPosters(racing)
  const ids = JSON.parse(localStorage.getItem('rt_pending_posters_v1')).map((p) => p.memoryId)
  assert.deepEqual(ids, ['m2']) // m1 cleared, m2 (concurrent) survived
  assert.equal(r.uploaded, 1)
})

test('drainPendingPosters: an empty queue is a no-op', async () => {
  assert.deepEqual(await drainPendingPosters(deps().d), { uploaded: 0, remaining: 0 })
})
