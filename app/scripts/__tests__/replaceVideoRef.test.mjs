import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// "Add it again with sound" — the in-place video-ref swap (memoryStore).
// Proves the preserve-list EXACTLY: the stored-object fields swap
// (key/url/posterKey/posterUrl/bytes/durationMs/sound/…), the capture identity
// and every memory-level field stay, the apply is idempotent, and the 409
// reapply merges onto the FRESH row (another device's caption survives).
// memoryStore is browser-targeted — polyfill localStorage like its siblings.

class MemStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
  clear() { this.map.clear() }
}
globalThis.localStorage = new MemStorage()

const {
  replaceVideoRefInRecord,
  replaceVideoRefReapply,
  replaceMemoryVideoRef,
  resolveSaveConflict,
  drainMemorySyncQueue,
} = await import('../../src/lib/memoryStore.js')
const memoryQueue = await import('../../src/lib/memorySyncQueue.js')

const SHARED = 'rt_memories_shared_v1'
const readShared = () => JSON.parse(globalThis.localStorage.getItem(SHARED) || '[]')
const writeShared = (arr) => globalThis.localStorage.setItem(SHARED, JSON.stringify(arr))
const getById = (id) => readShared().find((m) => m.id === id)

beforeEach(async () => {
  // Let the module-level mirror chain settle (under node the lazy workerSync
  // import fails → prior tests' saves queue 'pending' intents), then clear.
  await new Promise((r) => setTimeout(r, 0))
  globalThis.localStorage.clear()
})

const OLD_KEY = 'helen/vid/original'
const oldRef = (extra = {}) => ({
  kind: 'video',
  storage: 'r2',
  key: OLD_KEY,
  url: 'https://r2.example/original.mp4',
  mime: 'video/mp4',
  width: 720,
  height: 1280,
  durationMs: 9000,
  bytes: 4_000_000,
  sound: 'lost',
  posterKey: 'helen/poster/original',
  posterUrl: 'https://r2.example/original.jpg',
  capturedAt: '2026-05-23T07:00:00.000Z',
  ...extra,
})
const NEXT = {
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
}
const baseRecord = (extra = {}) => ({
  id: 'mem-1',
  tripId: 't1',
  stopId: 'stop-7',
  stopProv: { source: 'manual', by: 'helen' }, // the Stage-B filing seam rides untouched
  authorTraveler: 'helen',
  visibility: 'shared',
  kind: 'photo',
  caption: 'the whale breach',
  reactions: [{ by: 'jonathan', emoji: '🐳' }],
  capturedAt: '2026-05-23T07:00:00.000Z',
  hideFrom: ['rafa'],
  revealed: undefined,
  createdAt: '2026-05-23T20:00:00.000Z',
  updatedAt: '2026-05-23T20:00:00.000Z',
  ...extra,
})

test('photoRefs[] form: the stored-object fields swap, capture identity + siblings + memory identity stay', () => {
  const sibling = { kind: 'photo', storage: 'r2', key: 'helen/photo/1', url: 'https://r2.example/p1.jpg', capturedAt: '2026-05-23T06:00:00.000Z' }
  const rec = baseRecord({ photoRefs: [oldRef({ lat: 41.3, lng: -70.6 }), sibling], photoRef: oldRef({ lat: 41.3, lng: -70.6 }) })
  const { record: out, replaced } = replaceVideoRefInRecord(rec, { refKey: OLD_KEY, next: NEXT })

  assert.equal(replaced, true)
  const swapped = out.photoRefs[0]
  // Swapped: the new file's own stored-object truth.
  assert.equal(swapped.key, NEXT.key)
  assert.equal(swapped.url, NEXT.url)
  assert.equal(swapped.posterKey, NEXT.posterKey)
  assert.equal(swapped.posterUrl, NEXT.posterUrl)
  assert.equal(swapped.bytes, NEXT.bytes)
  assert.equal(swapped.durationMs, NEXT.durationMs)
  assert.equal(swapped.sound, 'carried')
  assert.equal(swapped.storage, 'r2')
  // Kept: the ORIGINAL capture identity (the replacement is the same moment)
  // and any enrichment next doesn't name.
  assert.equal(swapped.capturedAt, '2026-05-23T07:00:00.000Z')
  assert.equal(swapped.lat, 41.3)
  assert.equal(swapped.lng, -70.6)
  // The sibling photo is untouched; the photoRef back-compat mirror re-points.
  assert.deepEqual(out.photoRefs[1], sibling)
  assert.deepEqual(out.photoRef, swapped)
  // Memory-level identity: byte-for-byte the same.
  assert.equal(out.caption, 'the whale breach')
  assert.equal(out.stopId, 'stop-7')
  assert.deepEqual(out.stopProv, { source: 'manual', by: 'helen' })
  assert.deepEqual(out.reactions, [{ by: 'jonathan', emoji: '🐳' }])
  assert.equal(out.capturedAt, '2026-05-23T07:00:00.000Z')
  assert.deepEqual(out.hideFrom, ['rafa'])
  assert.equal(out.visibility, 'shared')
  assert.equal(out.createdAt, rec.createdAt)
})

test('a capturedAt smuggled in `next` is STRIPPED — the original moment always wins (the documented choice)', () => {
  const rec = baseRecord({ photoRef: oldRef() })
  const { record: out, replaced } = replaceVideoRefInRecord(rec, {
    refKey: OLD_KEY,
    next: { ...NEXT, capturedAt: '2026-07-06T12:34:56.000Z' }, // a drifted re-encode stamp
  })
  assert.equal(replaced, true)
  assert.equal(out.photoRef.capturedAt, '2026-05-23T07:00:00.000Z')
})

test('an original ref with NO capturedAt stays capture-less (the swap never invents one)', () => {
  const rec = baseRecord({ photoRef: oldRef({ capturedAt: undefined }) })
  const { record: out } = replaceVideoRefInRecord(rec, { refKey: OLD_KEY, next: { ...NEXT, capturedAt: '2026-07-06T12:00:00.000Z' } })
  assert.equal(out.photoRef.capturedAt, undefined)
})

test('poster-less replacement (poster upload failed) keeps the OLD poster so the tile never goes blank', () => {
  const rec = baseRecord({ photoRef: oldRef() })
  const { posterKey: _pk, posterUrl: _pu, ...posterless } = NEXT
  const { record: out, replaced } = replaceVideoRefInRecord(rec, { refKey: OLD_KEY, next: posterless })
  assert.equal(replaced, true)
  assert.equal(out.photoRef.key, NEXT.key)
  assert.equal(out.photoRef.posterKey, 'helen/poster/original')
  assert.equal(out.photoRef.posterUrl, 'https://r2.example/original.jpg')
})

test('legacy single-photoRef form swaps in place', () => {
  const rec = baseRecord({ photoRef: oldRef() })
  const { record: out, replaced } = replaceVideoRefInRecord(rec, { refKey: OLD_KEY, next: NEXT })
  assert.equal(replaced, true)
  assert.equal(out.photoRef.key, NEXT.key)
  assert.equal(out.photoRef.sound, 'carried')
})

test('E4 pieces: the video piece swaps (the worker serializes pieces first); kind guard protects non-video pieces', () => {
  const rec = baseRecord({
    pieces: [
      { kind: 'note', text: 'listen!' },
      { kind: 'video', ...oldRef() },
      { kind: 'photo', key: OLD_KEY, url: 'https://r2.example/coincidence.jpg' }, // same key, wrong kind — must not swap
    ],
    photoRefs: [oldRef()],
    photoRef: oldRef(),
  })
  const { record: out, replaced } = replaceVideoRefInRecord(rec, { refKey: OLD_KEY, next: NEXT })
  assert.equal(replaced, true)
  assert.deepEqual(out.pieces[0], { kind: 'note', text: 'listen!' })
  assert.equal(out.pieces[1].key, NEXT.key)
  assert.equal(out.pieces[1].sound, 'carried')
  assert.equal(out.pieces[1].capturedAt, '2026-05-23T07:00:00.000Z')
  assert.equal(out.pieces[2].key, OLD_KEY, 'a key collision across kinds never grafts video fields')
  assert.equal(out.photoRefs[0].key, NEXT.key, 'the photoRefs copy swaps in the same pass')
})

test('idempotent: a record already carrying the replacement key is returned untouched (never double-swap)', () => {
  const rec = baseRecord({ photoRef: oldRef() })
  const first = replaceVideoRefInRecord(rec, { refKey: OLD_KEY, next: NEXT })
  assert.equal(first.replaced, true)
  const second = replaceVideoRefInRecord(first.record, { refKey: OLD_KEY, next: NEXT })
  assert.equal(second.replaced, false)
  assert.equal(second.record, first.record, 'same reference — nothing was rebuilt')
})

test('unknown refKey / photo-only record / bad args → replaced:false, record untouched', () => {
  const rec = baseRecord({ photoRef: { kind: 'photo', storage: 'r2', key: 'helen/photo/1', url: 'u' } })
  assert.equal(replaceVideoRefInRecord(rec, { refKey: 'nope', next: NEXT }).replaced, false)
  assert.equal(replaceVideoRefInRecord(rec, { refKey: 'helen/photo/1', next: NEXT }).replaced, false, 'a PHOTO ref never swaps')
  assert.equal(replaceVideoRefInRecord(rec, { refKey: OLD_KEY, next: {} }).replaced, false)
  assert.equal(replaceVideoRefInRecord(null, { refKey: OLD_KEY, next: NEXT }).replaced, false)
})

// ── the 409 reapply shape ───────────────────────────────────────────────────

test('reapply: fresh still holds the old video → ONLY the swap lands on fresh (another device\'s caption survives)', () => {
  const fresh = baseRecord({ caption: 'jonathan retitled this meanwhile', photoRef: oldRef(), updatedAt: '2026-07-06T10:00:00.000Z' })
  const merged = replaceVideoRefReapply(OLD_KEY, NEXT)(fresh)
  assert.ok(merged, 'the swap re-applies')
  assert.equal(merged.caption, 'jonathan retitled this meanwhile')
  assert.equal(merged.photoRef.key, NEXT.key)
  assert.equal(merged.photoRef.capturedAt, '2026-05-23T07:00:00.000Z')
  assert.ok(merged.updatedAt > fresh.updatedAt, 'the reapply stamps a fresh edit time')
})

test('reapply: fresh already carries the replacement → null (adopt fresh, push nothing)', () => {
  const fresh = baseRecord({ photoRef: { ...oldRef(), key: NEXT.key, url: NEXT.url, sound: 'carried' } })
  assert.equal(replaceVideoRefReapply(OLD_KEY, NEXT)(fresh), null)
})

test('reapply: fresh no longer holds the video (removed elsewhere) → null — never resurrect a deleted photo', () => {
  const fresh = baseRecord({ photoRef: { kind: 'photo', storage: 'r2', key: 'helen/photo/other', url: 'u' } })
  assert.equal(replaceVideoRefReapply(OLD_KEY, NEXT)(fresh), null)
})

// ── store-level swap + honest-sync integration ─────────────────────────────

test('replaceMemoryVideoRef: swaps the stored record in place, bumps updatedAt, reports honestly', () => {
  writeShared([baseRecord({ photoRef: oldRef(), photoRefs: [oldRef()] })])
  const res = replaceMemoryVideoRef('mem-1', { refKey: OLD_KEY, next: NEXT })
  assert.equal(res.status, 'replaced')
  const stored = getById('mem-1')
  assert.equal(stored.photoRef.key, NEXT.key)
  assert.equal(stored.photoRefs[0].sound, 'carried')
  assert.equal(stored.photoRef.capturedAt, '2026-05-23T07:00:00.000Z')
  assert.equal(stored.caption, 'the whale breach')
  assert.equal(stored.stopId, 'stop-7')
  assert.ok(stored.updatedAt > '2026-05-23T20:00:00.000Z', 'the edit is stamped')

  assert.equal(replaceMemoryVideoRef('mem-1', { refKey: 'nope', next: NEXT }).status, 'video-not-found')
  assert.equal(replaceMemoryVideoRef('missing', { refKey: OLD_KEY, next: NEXT }).status, 'not-found')
})

test('replaceMemoryVideoRef: a masked projection is never a swap target', () => {
  writeShared([{ ...baseRecord({ photoRef: oldRef() }), masked: true }])
  assert.equal(replaceMemoryVideoRef('mem-1', { refKey: OLD_KEY, next: NEXT }).status, 'not-found')
  assert.equal(getById('mem-1').photoRef.key, OLD_KEY, 'the stub is untouched')
})

test('replaceMemoryVideoRef: finds a private-bucket record (the author\'s own zone)', () => {
  const priv = baseRecord({ visibility: 'private', photoRef: oldRef() })
  globalThis.localStorage.setItem('rt_memories_private_helen_v1', JSON.stringify([priv]))
  const res = replaceMemoryVideoRef('mem-1', { refKey: OLD_KEY, next: NEXT })
  assert.equal(res.status, 'replaced')
  const stored = JSON.parse(globalThis.localStorage.getItem('rt_memories_private_helen_v1'))[0]
  assert.equal(stored.photoRef.key, NEXT.key)
})

// A stub sync, mirroring memorySyncGuard.test.mjs's idiom.
function makeSync({ fresh, push }) {
  const calls = { pull: [], push: [] }
  return {
    calls,
    sync: {
      async pullAll(opts) { calls.pull.push(opts || {}); return typeof fresh === 'function' ? fresh() : fresh },
      async pushMemory(rec, opts) { calls.push.push({ rec, opts: opts || {} }); return push(rec, opts) },
    },
  }
}

test('409 recovery: the swap re-applies onto the FRESH row — the family\'s newer caption is never clobbered', async () => {
  const stale = baseRecord({ photoRef: oldRef(), updatedAt: '2030-01-01T00:00:00.000Z', serverUpdatedAt: '2026-01-01T00:00:00.000Z' })
  writeShared([stale])
  const fresh = baseRecord({ caption: 'renamed on the iPad', photoRef: oldRef(), updatedAt: '2026-07-06T09:00:00.000Z' })
  const { sync, calls } = makeSync({ fresh: [fresh], push: (rec) => ({ ...rec, updatedAt: '2026-07-06T09:00:05.000Z' }) })

  await resolveSaveConflict(sync, { type: 'save', record: stale, reapply: replaceVideoRefReapply(OLD_KEY, NEXT) })

  assert.equal(calls.pull[0].asTraveler, 'helen', 'pulled AS the author')
  assert.equal(calls.push[0].opts.baseUpdatedAt, fresh.updatedAt, 're-pushed on the fresh base')
  assert.equal(calls.push[0].rec.caption, 'renamed on the iPad', 'fresh content rides')
  assert.equal(calls.push[0].rec.photoRef.key, NEXT.key, 'our swap rides too')
  const local = getById('mem-1')
  assert.equal(local.caption, 'renamed on the iPad')
  assert.equal(local.photoRef.key, NEXT.key)
  assert.equal(local.serverUpdatedAt, '2026-07-06T09:00:05.000Z', 'push-then-write settled the server stamp')
})

test('409 recovery: fresh already swapped (or lost the video) → adopt fresh, push NOTHING', async () => {
  const stale = baseRecord({ photoRef: oldRef(), updatedAt: '2030-01-01T00:00:00.000Z' })
  writeShared([stale])
  const fresh = baseRecord({ photoRef: { ...oldRef(), key: NEXT.key, url: NEXT.url, sound: 'carried' }, updatedAt: '2026-07-06T09:00:00.000Z' })
  const { sync, calls } = makeSync({ fresh: [fresh], push: () => { throw new Error('must not push') } })

  const out = await resolveSaveConflict(sync, { type: 'save', record: stale, reapply: replaceVideoRefReapply(OLD_KEY, NEXT) })

  assert.equal(out.status, 'synced')
  assert.equal(calls.push.length, 0, 'a content-identical re-push would only churn')
  assert.equal(getById('mem-1').photoRef.key, NEXT.key, 'local adopted the fresh row')
})

test('A-2 queue: a failed swap mirror queues a plain SAVE intent; the drain replays the CURRENT record — the swapped ref rides it', async () => {
  memoryQueue._resetForTest()
  writeShared([baseRecord({ photoRef: oldRef() })])
  // Under node the mirror's lazy workerSync import fails → the op settles
  // 'pending' → a { kind:'save' } intent is owed (scheduleMirror's default).
  const res = replaceMemoryVideoRef('mem-1', { refKey: OLD_KEY, next: NEXT })
  assert.equal(res.status, 'replaced')
  await new Promise((r) => setTimeout(r, 0))
  assert.ok(memoryQueue.getIntent('mem-1', 'save'), 'the swap is owed as a save intent')

  // The drain pushes the CURRENT local record — the whole replaced ref rides
  // the record itself, which is exactly why a 'save' intent suffices.
  const { sync, calls } = makeSync({ fresh: [], push: (rec) => ({ ...rec, updatedAt: '2026-07-06T11:00:00.000Z' }) })
  const { settled } = await drainMemorySyncQueue({ sync })
  assert.equal(settled, 1)
  assert.equal(calls.push[0].rec.photoRef.key, NEXT.key, 'the replayed record carries the swap')
  assert.equal(memoryQueue.getIntent('mem-1', 'save'), null, 'worker-settled → dequeued')
})
