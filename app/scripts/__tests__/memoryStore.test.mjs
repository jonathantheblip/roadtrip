import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// memoryStore is browser-targeted (depends on localStorage + a lazy
// import of workerSync which itself depends on browser globals). We
// polyfill localStorage and stub the workerSync side-effect by
// providing it before the dynamic import resolves.

class MemStorage {
  constructor() {
    this.map = new Map()
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null
  }
  setItem(k, v) {
    this.map.set(k, String(v))
  }
  removeItem(k) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}
globalThis.localStorage = new MemStorage()

const {
  saveMemory,
  listMemoriesForTrip,
  updateMemoryCapturedAt,
  backfillCapturedAt,
  mergeFromRemote,
} = await import('../../src/lib/memoryStore.js')
const { markDeleted, isDeleted } = await import('../../src/lib/deleteTombstones.js')

beforeEach(() => {
  globalThis.localStorage.clear()
})

const remoteMem = (id, extra = {}) => ({
  id, tripId: 't1', authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
  updatedAt: '2026-05-23T10:00:00.000Z', ...extra,
})

test('mergeFromRemote: a tombstoned (locally-deleted) memory is NOT re-added — the resurrection guard', () => {
  // Simulate: the family deleted m1 locally, but the remote delete never confirmed, so
  // the server still serves it (no deletedAt). It must not come back.
  markDeleted('memory', 'm1')
  mergeFromRemote([remoteMem('m1')])
  assert.deepEqual(listMemoriesForTrip('t1', 'helen').map((m) => m.id), [], 'the deleted memory does not resurrect')
  assert.equal(isDeleted('memory', 'm1'), true, 'the tombstone stays until the server confirms the delete')
})

test('mergeFromRemote: a server-confirmed delete (deletedAt) CLEARS the tombstone', () => {
  markDeleted('memory', 'm2')
  mergeFromRemote([remoteMem('m2', { deletedAt: '2026-05-23T11:00:00.000Z' })])
  assert.equal(isDeleted('memory', 'm2'), false, 'the delete landed on the server → tombstone cleared')
  assert.deepEqual(listMemoriesForTrip('t1', 'helen'), [], 'still gone locally')
})

test('mergeFromRemote: an UN-tombstoned remote memory still merges normally (guard does not over-block)', () => {
  mergeFromRemote([remoteMem('m3')])
  assert.deepEqual(listMemoriesForTrip('t1', 'helen').map((m) => m.id), ['m3'], 'a genuinely new remote memory is added')
})

test('saveMemory promotes the earliest photoRef.capturedAt to memory.capturedAt when caller omits it', () => {
  const rec = saveMemory({
    id: 'm1',
    tripId: 't',
    stopId: 's',
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'photo',
    photoRefs: [
      { storage: 'r2', key: 'a', capturedAt: '2024-08-04T18:00:00.000Z' },
      { storage: 'r2', key: 'b', capturedAt: '2024-08-04T17:30:00.000Z' },
    ],
  })
  // Earlier of the two timestamps wins so the memory sorts to the
  // moment the first frame was captured.
  assert.equal(rec.capturedAt, '2024-08-04T17:30:00.000Z')
})

test('saveMemory honors an explicit capturedAt over any photoRef date', () => {
  const rec = saveMemory({
    id: 'm2',
    tripId: 't',
    stopId: 's',
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'photo',
    capturedAt: '2018-01-01T00:00:00.000Z',
    photoRef: { storage: 'r2', key: 'x', capturedAt: '2026-05-22T18:00:00.000Z' },
  })
  assert.equal(rec.capturedAt, '2018-01-01T00:00:00.000Z')
})

test('saveMemory persists null when neither caller nor refs offer a date', () => {
  const rec = saveMemory({
    id: 'm3',
    tripId: 't',
    stopId: 's',
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'photo',
    photoRef: { storage: 'r2', key: 'x' }, // no capturedAt on ref
  })
  assert.equal(rec.capturedAt, null)
  // createdAt is still stamped so the album falls back to upload time
  // with the '· uploaded' label.
  assert.ok(rec.createdAt)
})

test('saveMemory preserves capturedAt across an update that omits it', () => {
  saveMemory({
    id: 'm4',
    tripId: 't',
    stopId: 's',
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'photo',
    capturedAt: '2024-12-25T12:00:00.000Z',
    photoRef: { storage: 'r2', key: 'first' },
  })
  // Subsequent save (e.g. queue drain re-saves with the R2 URL patched
  // in but doesn't re-pass capturedAt) — the existing top-level value
  // must survive.
  const next = saveMemory({
    id: 'm4',
    tripId: 't',
    stopId: 's',
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'photo',
    photoRef: { storage: 'r2', key: 'first', url: 'https://e.test/p' },
  })
  assert.equal(next.capturedAt, '2024-12-25T12:00:00.000Z')
})

test('updateMemoryCapturedAt overrides the album date on demand and clears with null', () => {
  saveMemory({
    id: 'm5',
    tripId: 't',
    stopId: 's',
    authorTraveler: 'jonathan',
    visibility: 'shared',
    kind: 'photo',
    photoRef: { storage: 'r2', key: 'x', capturedAt: '2026-05-22T10:00:00.000Z' },
  })

  const overridden = updateMemoryCapturedAt('m5', '1995-07-04T19:30:00.000Z')
  assert.equal(overridden.capturedAt, '1995-07-04T19:30:00.000Z')

  const cleared = updateMemoryCapturedAt('m5', null)
  assert.equal(cleared.capturedAt, null)

  // updatedAt is restamped so the sync layer treats it as a real
  // change. Both writes can land in the same millisecond on a fast
  // test runner, but updatedAt must at minimum match the latest write.
  assert.ok(cleared.updatedAt >= overridden.updatedAt)
})

test('updateMemoryCapturedAt is a no-op for an unknown id', () => {
  const result = updateMemoryCapturedAt('does-not-exist', '2024-01-01T00:00:00.000Z')
  assert.equal(result, null)
})

test('backfillCapturedAt promotes legacy ref.capturedAt to memory.capturedAt without touching populated records', () => {
  // Two memories written into the raw store with the legacy shape
  // (only ref.capturedAt). One memory already has top-level
  // capturedAt and should stay untouched.
  globalThis.localStorage.setItem(
    'rt_memories_shared_v1',
    JSON.stringify([
      {
        id: 'legacy',
        tripId: 't',
        stopId: 's',
        authorTraveler: 'helen',
        visibility: 'shared',
        kind: 'photo',
        photoRef: { storage: 'r2', key: 'k', capturedAt: '2026-04-17T15:00:00.000Z' },
        createdAt: '2026-05-24T03:00:00.000Z',
        updatedAt: '2026-05-24T03:00:00.000Z',
      },
      {
        id: 'already-set',
        tripId: 't',
        stopId: 's',
        authorTraveler: 'helen',
        visibility: 'shared',
        kind: 'photo',
        capturedAt: '2024-01-01T00:00:00.000Z',
        photoRef: { storage: 'r2', key: 'p', capturedAt: '2026-05-01T00:00:00.000Z' },
        createdAt: '2026-05-24T03:00:00.000Z',
        updatedAt: '2026-05-24T03:00:00.000Z',
      },
    ])
  )

  const patched = backfillCapturedAt()
  assert.equal(patched, 1)

  const list = listMemoriesForTrip('t', 'helen')
  const legacy = list.find((m) => m.id === 'legacy')
  const already = list.find((m) => m.id === 'already-set')
  assert.equal(legacy.capturedAt, '2026-04-17T15:00:00.000Z')
  assert.equal(already.capturedAt, '2024-01-01T00:00:00.000Z')

  // Re-running is a no-op now.
  const again = backfillCapturedAt()
  assert.equal(again, 0)
})

test('backfillCapturedAt ignores ref dates that look like the legacy "now stamp"', () => {
  // Legacy M2 modal stamped ref.capturedAt = new Date() at upload
  // time even when no EXIF was found. Those records would otherwise
  // promote their fake "now" into memory.capturedAt and silently
  // strip the '· uploaded' label.
  const createdAt = '2026-05-24T18:00:00.000Z'
  const nearCreated = '2026-05-24T18:00:03.000Z' // 3 s later
  globalThis.localStorage.setItem(
    'rt_memories_shared_v1',
    JSON.stringify([
      {
        id: 'legacy-stamp',
        tripId: 't',
        stopId: 's',
        authorTraveler: 'helen',
        visibility: 'shared',
        kind: 'photo',
        photoRef: { storage: 'r2', key: 'x', capturedAt: nearCreated },
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 'real-exif',
        tripId: 't',
        stopId: 's',
        authorTraveler: 'helen',
        visibility: 'shared',
        kind: 'photo',
        photoRef: { storage: 'r2', key: 'y', capturedAt: '2026-04-17T08:00:00.000Z' },
        createdAt,
        updatedAt: createdAt,
      },
    ])
  )
  const patched = backfillCapturedAt()
  assert.equal(patched, 1)
  const list = listMemoriesForTrip('t', 'helen')
  const legacy = list.find((m) => m.id === 'legacy-stamp')
  const real = list.find((m) => m.id === 'real-exif')
  // Un-promoted records keep their original shape (capturedAt absent).
  // The album reads "no top-level date" → "no per-ref date worth using" →
  // falls back to createdAt with the '· uploaded' label, which is the
  // right behavior for a legacy upload that never had real EXIF.
  assert.ok(legacy.capturedAt == null) // null OR undefined
  assert.equal(real.capturedAt, '2026-04-17T08:00:00.000Z')
})

test('backfillCapturedAt picks the earliest ref date for multi-photo memories', () => {
  globalThis.localStorage.setItem(
    'rt_memories_shared_v1',
    JSON.stringify([
      {
        id: 'album',
        tripId: 't',
        stopId: 's',
        authorTraveler: 'helen',
        visibility: 'shared',
        kind: 'photo',
        photoRefs: [
          { storage: 'r2', key: 'late', capturedAt: '2026-04-17T20:00:00.000Z' },
          { storage: 'r2', key: 'early', capturedAt: '2026-04-17T08:00:00.000Z' },
        ],
        createdAt: '2026-05-24T03:00:00.000Z',
        updatedAt: '2026-05-24T03:00:00.000Z',
      },
    ])
  )
  backfillCapturedAt()
  const [m] = listMemoriesForTrip('t', 'helen')
  assert.equal(m.capturedAt, '2026-04-17T08:00:00.000Z')
})

// ─── merge-guard: a lossy remote can't erase local EXIF enrichment ──────────
// Non-vacuous: without preserveLocalPhotoMeta the wholesale replace
// (sharedMap.set(r.id, r)) leaves the merged ref with the remote's undefined
// coords, so the equality assertions go red.

test('mergeFromRemote preserves local photoRef lat/lng/capturedAt when a newer remote drops them (dispatch path)', () => {
  globalThis.localStorage.setItem(
    'rt_memories_shared_v1',
    JSON.stringify([
      {
        id: 'd1', tripId: 't', stopId: 's', authorTraveler: 'helen', visibility: 'shared',
        kind: 'photo',
        photoRef: { storage: 'r2', key: 'r2/d1', mime: 'image/jpeg', lat: 41.4943, lng: -72.09163, capturedAt: '2026-05-24T17:02:29.000Z' },
        capturedAt: '2026-05-24T17:02:29.000Z',
        createdAt: '2026-05-24T03:00:00.000Z', updatedAt: '2026-05-24T03:00:00.000Z',
      },
    ])
  )
  // Same memory pulled back newer (e.g. a reaction added elsewhere), but the
  // worker's scalar photoRef columns carry no coords/date.
  const added = mergeFromRemote([
    {
      id: 'd1', tripId: 't', stopId: 's', authorTraveler: 'helen', visibility: 'shared',
      kind: 'photo',
      photoRef: { storage: 'r2', key: 'r2/d1', mime: 'image/jpeg' },
      createdAt: '2026-05-24T03:00:00.000Z', updatedAt: '2026-05-24T04:00:00.000Z',
    },
  ])
  assert.equal(added, 1) // the remote was actually taken (proves the replace fired)
  const [m] = listMemoriesForTrip('t', 'helen')
  assert.equal(m.photoRef.lat, 41.4943)
  assert.equal(m.photoRef.lng, -72.09163)
  assert.equal(m.photoRef.capturedAt, '2026-05-24T17:02:29.000Z')
})

test('mergeFromRemote preserves a local video posterKey/posterUrl when a newer remote drops them', () => {
  // Stage 3: a synced video's poster makes the album tile renderable. During
  // the rollout window a newer remote may not carry the poster fields yet — the
  // capturing device must keep its own so the tile doesn't revert to an icon.
  globalThis.localStorage.setItem(
    'rt_memories_shared_v1',
    JSON.stringify([
      {
        id: 'v1', tripId: 't', stopId: 's', authorTraveler: 'helen', visibility: 'shared',
        kind: 'photo',
        photoRef: { storage: 'r2', key: 'r2/video', mime: 'video/mp4', posterKey: 'r2/poster', posterUrl: 'https://e.test/poster.jpg', capturedAt: '2026-04-21T17:30:39.000Z' },
        capturedAt: '2026-04-21T17:30:39.000Z',
        createdAt: '2026-04-21T03:00:00.000Z', updatedAt: '2026-04-21T03:00:00.000Z',
      },
    ])
  )
  const added = mergeFromRemote([
    {
      id: 'v1', tripId: 't', stopId: 's', authorTraveler: 'helen', visibility: 'shared',
      kind: 'photo',
      photoRef: { storage: 'r2', key: 'r2/video', mime: 'video/mp4' },
      createdAt: '2026-04-21T03:00:00.000Z', updatedAt: '2026-04-21T04:00:00.000Z',
    },
  ])
  assert.equal(added, 1) // the remote was taken (proves the wholesale replace fired)
  const [m] = listMemoriesForTrip('t', 'helen')
  assert.equal(m.photoRef.posterKey, 'r2/poster')
  assert.equal(m.photoRef.posterUrl, 'https://e.test/poster.jpg')
})

test('mergeFromRemote preserves a local video sound verdict when a stale remote drops it (rollout carry)', () => {
  // Sound honesty: a pre-sound worker (or a row pushed before the fix) serves
  // refs with no `sound` — the capturing device must keep its own 'lost'
  // verdict so a pull can't erase the honest no-sound label. Non-vacuous:
  // without the preserveLocalPhotoMeta sound carry, the wholesale replace
  // leaves m.photoRefs[0].sound === undefined → red.
  globalThis.localStorage.setItem(
    'rt_memories_shared_v1',
    JSON.stringify([
      {
        id: 'snd1', tripId: 't', stopId: 's', authorTraveler: 'helen', visibility: 'shared',
        kind: 'photo',
        photoRefs: [{ storage: 'r2', key: 'r2/video', mime: 'video/mp4', posterKey: 'r2/poster', sound: 'lost' }],
        createdAt: '2026-07-05T03:00:00.000Z', updatedAt: '2026-07-05T03:00:00.000Z',
      },
    ])
  )
  const added = mergeFromRemote([
    {
      id: 'snd1', tripId: 't', stopId: 's', authorTraveler: 'helen', visibility: 'shared',
      kind: 'photo',
      photoRefs: [{ storage: 'r2', key: 'r2/video', mime: 'video/mp4', posterKey: 'r2/poster' }],
      createdAt: '2026-07-05T03:00:00.000Z', updatedAt: '2026-07-05T04:00:00.000Z',
    },
  ])
  assert.equal(added, 1) // the remote was taken (proves the wholesale replace fired)
  const [m] = listMemoriesForTrip('t', 'helen')
  assert.equal(m.photoRefs[0].sound, 'lost')
})

test('mergeFromRemote lets the remote own sound verdict win when present', () => {
  globalThis.localStorage.setItem(
    'rt_memories_shared_v1',
    JSON.stringify([
      {
        id: 'snd2', tripId: 't', stopId: 's', authorTraveler: 'helen', visibility: 'shared',
        kind: 'photo',
        photoRefs: [{ storage: 'r2', key: 'r2/video', mime: 'video/mp4', sound: 'lost' }],
        createdAt: '2026-07-05T03:00:00.000Z', updatedAt: '2026-07-05T03:00:00.000Z',
      },
    ])
  )
  mergeFromRemote([
    {
      id: 'snd2', tripId: 't', stopId: 's', authorTraveler: 'helen', visibility: 'shared',
      kind: 'photo',
      photoRefs: [{ storage: 'r2', key: 'r2/video', mime: 'video/mp4', sound: 'carried' }],
      createdAt: '2026-07-05T03:00:00.000Z', updatedAt: '2026-07-05T04:00:00.000Z',
    },
  ])
  const [m] = listMemoriesForTrip('t', 'helen')
  assert.equal(m.photoRefs[0].sound, 'carried') // remote's authoritative value wins, not the stale local
})

test('mergeFromRemote preserves sound/poster on E4 pieces when a stale remote drops them (rollout carry)', () => {
  // A mixed moment's videos live in pieces[] server-side (INSTEAD of photoRefs),
  // so the merge-guard must gap-fill pieces too. Non-vacuous: without the
  // pieces fill, the wholesale replace leaves m.pieces[0].sound === undefined
  // → red. The note piece must pass through untouched (kind-matched fill).
  globalThis.localStorage.setItem(
    'rt_memories_shared_v1',
    JSON.stringify([
      {
        id: 'snd3', tripId: 't', stopId: 's', authorTraveler: 'helen', visibility: 'shared',
        kind: 'photo',
        photoRefs: [{ storage: 'r2', key: 'r2/video', mime: 'video/mp4', posterKey: 'r2/poster', sound: 'lost' }],
        pieces: [
          { kind: 'video', storage: 'r2', key: 'r2/video', mime: 'video/mp4', posterKey: 'r2/poster', sound: 'lost' },
          { kind: 'note', text: 'so loud in person' },
        ],
        createdAt: '2026-07-05T03:00:00.000Z', updatedAt: '2026-07-05T03:00:00.000Z',
      },
    ])
  )
  mergeFromRemote([
    {
      id: 'snd3', tripId: 't', stopId: 's', authorTraveler: 'helen', visibility: 'shared',
      kind: 'photo',
      photoRefs: [{ storage: 'r2', key: 'r2/video', mime: 'video/mp4', posterKey: 'r2/poster' }],
      pieces: [
        { kind: 'video', storage: 'r2', key: 'r2/video', mime: 'video/mp4' },
        { kind: 'note', text: 'so loud in person' },
      ],
      createdAt: '2026-07-05T03:00:00.000Z', updatedAt: '2026-07-05T04:00:00.000Z',
    },
  ])
  const [m] = listMemoriesForTrip('t', 'helen')
  assert.equal(m.pieces[0].sound, 'lost')
  assert.equal(m.pieces[0].posterKey, 'r2/poster') // poster heals through the same fill
  assert.deepEqual(m.pieces[1], { kind: 'note', text: 'so loud in person' }) // untouched
})

test('mergeFromRemote does not override coords the remote already carries (LEG-C lossless album)', () => {
  globalThis.localStorage.setItem(
    'rt_memories_shared_v1',
    JSON.stringify([
      {
        id: 'a1', tripId: 't', authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
        photoRefs: [{ storage: 'r2', key: 'r2/a', lat: 1.111, lng: 2.222, capturedAt: '2026-01-01T00:00:00.000Z' }],
        createdAt: '2026-05-24T03:00:00.000Z', updatedAt: '2026-05-24T03:00:00.000Z',
      },
    ])
  )
  mergeFromRemote([
    {
      id: 'a1', tripId: 't', authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
      photoRefs: [{ storage: 'r2', key: 'r2/a', lat: 41.4943, lng: -72.09163, capturedAt: '2026-05-24T17:02:29.000Z' }],
      createdAt: '2026-05-24T03:00:00.000Z', updatedAt: '2026-05-24T04:00:00.000Z',
    },
  ])
  const [m] = listMemoriesForTrip('t', 'helen')
  assert.equal(m.photoRefs[0].lat, 41.4943) // remote's authoritative value wins, not local 1.111
  assert.equal(m.photoRefs[0].capturedAt, '2026-05-24T17:02:29.000Z')
})

// ─── Step 2: interstitial "from A to B" identity (migration 007) ────────────

test('saveMemory persists interstitial {before, after} and preserves it across an omitting update', () => {
  const rec = saveMemory({
    id: 'mi', tripId: 't', stopId: null, authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
    photoRefs: [{ storage: 'r2', key: 'k' }],
    interstitial: { before: 's1', after: 's2' },
  })
  assert.deepEqual(rec.interstitial, { before: 's1', after: 's2' })
  // A later caption-only save that omits interstitial must not strip it
  // (mirrors the capturedAt preserve — a patch shouldn't lose the identity).
  const next = saveMemory({
    id: 'mi', tripId: 't', stopId: null, authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
    caption: 'added later', photoRefs: [{ storage: 'r2', key: 'k' }],
  })
  assert.deepEqual(next.interstitial, { before: 's1', after: 's2' })
})

test('saveMemory clears interstitial when passed null explicitly (e.g. a promote)', () => {
  saveMemory({
    id: 'mc', tripId: 't', stopId: null, authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
    photoRefs: [{ storage: 'r2', key: 'k' }], interstitial: { before: 's1', after: 's2' },
  })
  const cleared = saveMemory({
    id: 'mc', tripId: 't', stopId: 's1', authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
    photoRefs: [{ storage: 'r2', key: 'k' }], interstitial: null,
  })
  assert.equal(cleared.interstitial, undefined)
})

test('mergeFromRemote preserves a locally-set interstitial when a newer remote drops it', () => {
  // Non-vacuous: without the merge-guard, the wholesale replace would leave the
  // merged record with the remote's missing interstitial → assertion goes red.
  globalThis.localStorage.setItem(
    'rt_memories_shared_v1',
    JSON.stringify([
      {
        id: 'mr', tripId: 't', stopId: null, authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
        photoRefs: [{ storage: 'r2', key: 'r2/x' }],
        interstitial: { before: 's1', after: 's2' },
        createdAt: '2026-05-24T03:00:00.000Z', updatedAt: '2026-05-24T03:00:00.000Z',
      },
    ])
  )
  // Newer remote (e.g. a pre-007 worker mid-rollout, or a stale device) carries
  // no interstitial.
  const added = mergeFromRemote([
    {
      id: 'mr', tripId: 't', stopId: null, authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
      photoRefs: [{ storage: 'r2', key: 'r2/x' }],
      createdAt: '2026-05-24T03:00:00.000Z', updatedAt: '2026-05-24T04:00:00.000Z',
    },
  ])
  assert.equal(added, 1) // remote was taken (proves the replace fired)
  const [m] = listMemoriesForTrip('t', 'helen')
  assert.deepEqual(m.interstitial, { before: 's1', after: 's2' })
})

test('mergeFromRemote does not override an interstitial the remote already carries', () => {
  globalThis.localStorage.setItem(
    'rt_memories_shared_v1',
    JSON.stringify([
      {
        id: 'mr2', tripId: 't', stopId: null, authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
        photoRefs: [{ storage: 'r2', key: 'r2/x' }],
        interstitial: { before: 'OLD-a', after: 'OLD-b' },
        createdAt: '2026-05-24T03:00:00.000Z', updatedAt: '2026-05-24T03:00:00.000Z',
      },
    ])
  )
  mergeFromRemote([
    {
      id: 'mr2', tripId: 't', stopId: null, authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
      photoRefs: [{ storage: 'r2', key: 'r2/x' }],
      interstitial: { before: 'new-a', after: 'new-b' },
      createdAt: '2026-05-24T03:00:00.000Z', updatedAt: '2026-05-24T04:00:00.000Z',
    },
  ])
  const [m] = listMemoriesForTrip('t', 'helen')
  assert.deepEqual(m.interstitial, { before: 'new-a', after: 'new-b' }) // remote authoritative
})

test('mergeFromRemote preserves album photoRefs coords by index when a newer remote drops them', () => {
  globalThis.localStorage.setItem(
    'rt_memories_shared_v1',
    JSON.stringify([
      {
        id: 'al', tripId: 't', authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
        photoRefs: [
          { storage: 'r2', key: 'r2/0', lat: 10.5, lng: -20.5, capturedAt: '2026-05-01T10:00:00.000Z' },
          { storage: 'r2', key: 'r2/1', lat: 11.5, lng: -21.5, capturedAt: '2026-05-01T11:00:00.000Z' },
        ],
        createdAt: '2026-05-24T03:00:00.000Z', updatedAt: '2026-05-24T03:00:00.000Z',
      },
    ])
  )
  mergeFromRemote([
    {
      id: 'al', tripId: 't', authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
      photoRefs: [
        { storage: 'r2', key: 'r2/0', mime: 'image/jpeg' },
        { storage: 'r2', key: 'r2/1', mime: 'image/jpeg' },
      ],
      createdAt: '2026-05-24T03:00:00.000Z', updatedAt: '2026-05-24T04:00:00.000Z',
    },
  ])
  const [m] = listMemoriesForTrip('t', 'helen')
  assert.equal(m.photoRefs[0].lat, 10.5)
  assert.equal(m.photoRefs[1].lng, -21.5)
  assert.equal(m.photoRefs[1].capturedAt, '2026-05-01T11:00:00.000Z')
})

// ── Batch A-2 FIX 3: stopId preserve-on-undefined + stopIdIfNew ─────────────
// The outbox-revert root fix: a drain re-save hours later must not carry its
// enqueue-time filing over a move that landed in between. stopId joins the
// capturedAt/interstitial/mask preserve family; the enqueue-time stop remains
// meaningful ONLY for a memory that does not exist yet (stopIdIfNew).

const SHARED = 'rt_memories_shared_v1'
const readShared = () => JSON.parse(globalThis.localStorage.getItem(SHARED) || '[]')
const sharedById = (id) => readShared().find((m) => m.id === id)

test('saveMemory: an UNDEFINED stopId preserves the existing filing (a drain-style re-save cannot revert a move)', () => {
  saveMemory({ id: 'sp1', tripId: 't1', stopId: 'imported-here', authorTraveler: 'helen', visibility: 'shared', kind: 'photo', caption: '', photoRef: { storage: 'r2', key: 'k' } })
  // The memory moved while an upload sat in the outbox…
  saveMemory({ id: 'sp1', tripId: 't1', stopId: 'moved-here', authorTraveler: 'helen', visibility: 'shared', kind: 'photo', caption: '', photoRef: { storage: 'r2', key: 'k' } })
  // …and the drain re-saves WITHOUT a stopId (its enqueue-time stop rides stopIdIfNew only).
  saveMemory({ id: 'sp1', tripId: 't1', stopIdIfNew: 'imported-here', authorTraveler: 'helen', visibility: 'shared', kind: 'photo', caption: '', photoRef: { storage: 'r2', key: 'k2' } })
  const m = sharedById('sp1')
  assert.equal(m.stopId, 'moved-here', 'the live filing survives the drain')
  assert.equal(m.photoRef.key, 'k2', 'the drain still lands its uploaded ref')
})

test('saveMemory: an EXPLICIT null stopId still unfiles (interstitial / trip-level saves keep their meaning)', () => {
  saveMemory({ id: 'sp2', tripId: 't1', stopId: 'somewhere', authorTraveler: 'helen', visibility: 'shared', kind: 'note', text: 'x' })
  saveMemory({ id: 'sp2', tripId: 't1', stopId: null, authorTraveler: 'helen', visibility: 'shared', kind: 'note', text: 'x' })
  assert.equal(sharedById('sp2').stopId, null)
})

test('saveMemory: stopIdIfNew files a memory that does NOT exist yet (first save creates it at the enqueue-time stop)', () => {
  saveMemory({ id: 'sp3', tripId: 't1', stopIdIfNew: 'queued-stop', authorTraveler: 'helen', visibility: 'shared', kind: 'photo', caption: '', photoRef: { storage: 'r2', key: 'k' } })
  assert.equal(sharedById('sp3').stopId, 'queued-stop', 'a lost local record still files where the import chose')
})

test('saveMemory: stopIdIfNew never overrides an existing record and an explicit stopId always wins', () => {
  saveMemory({ id: 'sp4', tripId: 't1', stopId: 'real', authorTraveler: 'helen', visibility: 'shared', kind: 'note', text: 'x' })
  saveMemory({ id: 'sp4', tripId: 't1', stopId: 'explicit-wins', stopIdIfNew: 'ignored', authorTraveler: 'helen', visibility: 'shared', kind: 'note', text: 'x' })
  assert.equal(sharedById('sp4').stopId, 'explicit-wins')
})
