import { test } from 'node:test'
import assert from 'node:assert/strict'

// "Add it again with sound" — the pure gate, the replacement-ref builder, and
// the pick → encode → upload → swap orchestration (stub deps: the flow's
// ORDER and its refusals are the contract — a re-pick that loses its sound
// again must upload nothing and change nothing).

const {
  canOfferReAddSound,
  buildReplacementRef,
  reAddSound,
  isReAddInFlight,
  beginReAddFlight,
  endReAddFlight,
  subscribeReAddSettles,
} = await import('../../src/lib/reAddSound.js')

// A lightbox entry for a stored, silent video authored by helen.
const entry = (extra = {}) => ({
  isVideo: true,
  sound: 'lost',
  pending: false,
  memoryId: 'mem-1',
  refKey: 'helen/vid/original',
  author: 'helen',
  ...extra,
})

test('gate: the author sees the door on their own settled lost-sound video — and ONLY then', () => {
  assert.equal(canOfferReAddSound(entry(), 'helen'), true)

  // Every latch, one at a time.
  assert.equal(canOfferReAddSound(entry({ isVideo: false }), 'helen'), false, 'never on a photo')
  assert.equal(canOfferReAddSound(entry({ sound: 'none' }), 'helen'), false, 'honest silence is not a loss')
  assert.equal(canOfferReAddSound(entry({ sound: 'carried' }), 'helen'), false)
  assert.equal(canOfferReAddSound(entry({ sound: null }), 'helen'), false, 'legacy-unknown gets no guess')
  assert.equal(canOfferReAddSound(entry({ pending: true }), 'helen'), false, 'a still-uploading clip belongs to the outbox drain')
  assert.equal(canOfferReAddSound(entry({ refKey: null }), 'helen'), false, 'no stored object, nothing to swap')
  assert.equal(canOfferReAddSound(entry({ memoryId: null }), 'helen'), false)
  assert.equal(canOfferReAddSound(entry(), 'jonathan'), false, 'never cross-author')
  assert.equal(canOfferReAddSound(entry(), null), false, 'no viewer identity, no door')
  assert.equal(canOfferReAddSound(entry({ author: 'rafa' }), 'rafa'), false, 'never on Rafa\'s lens, even as the author')
  assert.equal(canOfferReAddSound(null, 'helen'), false)
})

test('buildReplacementRef: the new file\'s own truth — and NEVER a capture identity', () => {
  const encoded = { blob: { size: 5_200_000 }, width: 720, height: 1280, durationMs: 9100, sound: 'carried', capturedAt: '2026-07-06T12:00:00.000Z' }
  const remote = { key: 'helen/vid/re-added', url: 'https://r2.example/re-added.mp4' }
  const poster = { posterKey: 'helen/poster/re-added', posterUrl: 'https://r2.example/re-added.jpg' }
  const ref = buildReplacementRef({ encoded, remote, poster })
  assert.deepEqual(ref, {
    kind: 'video',
    storage: 'r2',
    key: 'helen/vid/re-added',
    url: 'https://r2.example/re-added.mp4',
    mime: 'video/mp4',
    width: 720,
    height: 1280,
    durationMs: 9100,
    bytes: 5_200_000,
    sound: 'carried',
    posterKey: 'helen/poster/re-added',
    posterUrl: 'https://r2.example/re-added.jpg',
  })
  assert.equal('capturedAt' in ref, false, 'the replacement never proposes its own capture time')
})

test('buildReplacementRef: a failed poster upload leaves the poster keys ABSENT (the merge keeps the old still)', () => {
  const ref = buildReplacementRef({
    encoded: { blob: { size: 100 }, width: 1, height: 1, durationMs: 1000, sound: 'none' },
    remote: { key: 'k', url: 'u' },
    poster: null,
  })
  assert.equal('posterKey' in ref, false)
  assert.equal('posterUrl' in ref, false)
  assert.equal(ref.sound, 'none')
})

// Stub deps that record every call, with per-test overrides.
function makeDeps(overrides = {}) {
  const calls = { encode: [], upload: [], poster: [], swap: [], log: [] }
  const deps = {
    encodeVideo: async (file) => {
      calls.encode.push(file)
      return { blob: { size: 5_000_000, type: 'video/mp4' }, posterBlob: { size: 900 }, width: 720, height: 1280, durationMs: 9100, sound: 'carried', soundReason: null }
    },
    uploadAssetBlob: async (kind, memoryId, blob, opts) => {
      calls.upload.push({ kind, memoryId, blob, opts })
      return { key: 'helen/vid/re-added', url: 'https://r2.example/re-added.mp4', mime: 'video/mp4' }
    },
    uploadPosterOrQueue: async (memoryId, posterBlob, opts) => {
      calls.poster.push({ memoryId, posterBlob, opts })
      return { posterKey: 'helen/poster/re-added', posterUrl: 'https://r2.example/re-added.jpg' }
    },
    replaceMemoryVideoRef: (memoryId, args) => {
      calls.swap.push({ memoryId, ...args })
      return { status: 'replaced', record: { id: memoryId } }
    },
    logUploadEvent: (e) => calls.log.push(e),
    ...overrides,
  }
  return { deps, calls }
}

const FILE = { name: 'clip.mov', type: 'video/quicktime', size: 40_000_000 }

test('happy path: encode → upload AS the author → poster → atomic swap; the answer re-keys the lightbox', async () => {
  const { deps, calls } = makeDeps()
  const out = await reAddSound({ file: FILE, entry: entry() }, deps)
  assert.deepEqual(out, { status: 'replaced', sound: 'carried', url: 'https://r2.example/re-added.mp4' })
  assert.equal(calls.upload[0].kind, 'video')
  assert.equal(calls.upload[0].memoryId, 'mem-1')
  assert.deepEqual(calls.upload[0].opts, { asTraveler: 'helen' }, 'credited to the author')
  assert.deepEqual(calls.poster[0].opts, { asTraveler: 'helen' })
  assert.equal(calls.swap[0].memoryId, 'mem-1')
  assert.equal(calls.swap[0].refKey, 'helen/vid/original', 'the swap targets the ORIGINAL stored object')
  assert.equal(calls.swap[0].next.key, 'helen/vid/re-added')
  assert.equal('capturedAt' in calls.swap[0].next, false)
})

test('a genuinely soundless re-pick (sound:none) is a legitimate replacement — the author chose it', async () => {
  const { deps, calls } = makeDeps({
    encodeVideo: async () => ({ blob: { size: 100 }, posterBlob: null, width: 1, height: 1, durationMs: 1000, sound: 'none' }),
  })
  const out = await reAddSound({ file: FILE, entry: entry() }, deps)
  assert.equal(out.status, 'replaced')
  assert.equal(out.sound, 'none')
  assert.equal(calls.swap.length, 1)
})

test('the re-pick loses its sound AGAIN → nothing uploads, nothing swaps, the old copy stands', async () => {
  const { deps, calls } = makeDeps({
    encodeVideo: async () => ({ blob: { size: 100 }, posterBlob: null, width: 1, height: 1, durationMs: 1000, sound: 'lost', soundReason: 'aac-parse-failed' }),
  })
  const out = await reAddSound({ file: FILE, entry: entry() }, deps)
  assert.deepEqual(out, { status: 'still-lost' })
  assert.equal(calls.upload.length, 0, 'no upload was even attempted')
  assert.equal(calls.poster.length, 0)
  assert.equal(calls.swap.length, 0)
  assert.equal(calls.log[0].code, 're-add-sound-lost-again', 'the technical reason goes to the dev log only')
})

test('a too-long re-pick surfaces the honest boundary (the deck\'s own trim line), nothing changes', async () => {
  const { deps, calls } = makeDeps({
    encodeVideo: async () => {
      const e = new Error('too long')
      e.code = 'video-too-long'
      e.durationMs = 372_000
      throw e
    },
  })
  const out = await reAddSound({ file: FILE, entry: entry() }, deps)
  assert.deepEqual(out, { status: 'too-long', durationMs: 372_000 })
  assert.equal(calls.upload.length, 0)
  assert.equal(calls.swap.length, 0)
})

test('an encode failure is a designed refusal — old copy untouched', async () => {
  const { deps, calls } = makeDeps({
    encodeVideo: async () => {
      const e = new Error('boom')
      e.code = 'video-encode-failed'
      throw e
    },
  })
  const out = await reAddSound({ file: FILE, entry: entry() }, deps)
  assert.deepEqual(out, { status: 'failed', code: 'video-encode-failed' })
  assert.equal(calls.swap.length, 0)
})

test('an upload failure never reaches the swap — the record still points at the working old copy', async () => {
  const { deps, calls } = makeDeps({
    uploadAssetBlob: async () => {
      throw new Error('offline')
    },
  })
  const out = await reAddSound({ file: FILE, entry: entry() }, deps)
  assert.deepEqual(out, { status: 'failed', code: 'upload-failed' })
  assert.equal(calls.poster.length, 0, 'no poster churn after a dead video upload')
  assert.equal(calls.swap.length, 0)
})

test('a pathologically huge encode is refused before any upload (the 2GB sanity ceiling)', async () => {
  const { deps, calls } = makeDeps({
    encodeVideo: async () => ({ blob: { size: 3 * 1024 * 1024 * 1024 }, posterBlob: null, width: 1, height: 1, durationMs: 9000, sound: 'carried' }),
  })
  const out = await reAddSound({ file: FILE, entry: entry() }, deps)
  assert.deepEqual(out, { status: 'failed', code: 'video-too-large' })
  assert.equal(calls.upload.length, 0)
})

test('the swap target vanished mid-flow (deleted elsewhere) → honest failure, orphaned upload accepted', async () => {
  const { deps } = makeDeps({
    replaceMemoryVideoRef: () => ({ status: 'video-not-found' }),
  })
  const out = await reAddSound({ file: FILE, entry: entry() }, deps)
  assert.deepEqual(out, { status: 'failed', code: 'swap-target-missing' })
})

// ── C1a: the in-flight guard (one flow per clip, across row remounts) ───────

test('in-flight guard: one flight per refKey — a second begin is refused until the first settles', () => {
  const K = 'helen/vid/guarded'
  assert.equal(isReAddInFlight(K), false)
  assert.equal(beginReAddFlight(K), true, 'first begin wins the flight')
  assert.equal(isReAddInFlight(K), true)
  assert.equal(beginReAddFlight(K), false, 'a concurrent second flow is refused — no double upload, no lying failed')
  // A DIFFERENT clip is independent.
  assert.equal(beginReAddFlight('helen/vid/other'), true)
  endReAddFlight('helen/vid/other')
  // Settle clears the flight; the door works again.
  endReAddFlight(K)
  assert.equal(isReAddInFlight(K), false)
  assert.equal(beginReAddFlight(K), true, 'cleared on settle — the next attempt is allowed')
  endReAddFlight(K)
})

test('in-flight guard: an unusable key never wins a flight (and never wedges the set)', () => {
  assert.equal(beginReAddFlight(null), false)
  assert.equal(beginReAddFlight(''), false)
  assert.equal(beginReAddFlight(undefined), false)
  assert.equal(isReAddInFlight(null), false)
  endReAddFlight(null) // must be a harmless no-op
})

test('in-flight guard: settles notify subscribers with the refKey — an adopted busy row can un-stick', () => {
  const K = 'helen/vid/notify'
  const seen = []
  const unsub = subscribeReAddSettles((k) => seen.push(k))
  beginReAddFlight(K)
  endReAddFlight(K)
  assert.deepEqual(seen, [K], 'one settle, the right key')
  endReAddFlight(K) // not in flight — no duplicate notification
  assert.deepEqual(seen, [K])
  unsub()
  beginReAddFlight(K)
  endReAddFlight(K)
  assert.deepEqual(seen, [K], 'unsubscribed listeners hear nothing')
})

test('in-flight guard: a throwing subscriber never breaks the settle (others still hear it)', () => {
  const K = 'helen/vid/bad-listener'
  const seen = []
  const unsubBad = subscribeReAddSettles(() => {
    throw new Error('bad listener')
  })
  const unsubGood = subscribeReAddSettles((k) => seen.push(k))
  beginReAddFlight(K)
  endReAddFlight(K) // must not throw
  assert.deepEqual(seen, [K])
  assert.equal(isReAddInFlight(K), false)
  unsubBad()
  unsubGood()
})
