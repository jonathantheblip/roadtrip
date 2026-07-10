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
  resolveSaveConflict,
  applyRefSidecarReapply,
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

// ── subscribeMemoriesChanged — the A-3 remote-arrival signal ───────────────

test('mergeFromRemote notifies subscribers when it changed the store (add / update / tombstone)', async () => {
  const { subscribeMemoriesChanged } = await import('../../src/lib/memoryStore.js')
  let fired = 0
  const unsub = subscribeMemoriesChanged(() => { fired += 1 })
  try {
    mergeFromRemote([remoteMem('m-live-1')])
    assert.equal(fired, 1, 'a new remote row notifies')
    mergeFromRemote([remoteMem('m-live-1', { updatedAt: '2026-05-23T12:00:00.000Z', caption: 'edited' })])
    assert.equal(fired, 2, 'a LWW-won update notifies')
    mergeFromRemote([remoteMem('m-live-1', { updatedAt: '2026-05-23T13:00:00.000Z', deletedAt: '2026-05-23T13:00:00.000Z' })])
    assert.equal(fired, 3, 'a tombstone removal notifies')
  } finally {
    unsub()
  }
})

test('mergeFromRemote stays SILENT on a no-op merge — an idle heartbeat must not repaint open views', async () => {
  const { subscribeMemoriesChanged } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('m-quiet')])
  let fired = 0
  const unsub = subscribeMemoriesChanged(() => { fired += 1 })
  try {
    // The exact same row again — the overlap window re-delivers recent rows
    // every beat; LWW refuses them, and no listener may fire.
    mergeFromRemote([remoteMem('m-quiet')])
    assert.equal(fired, 0, 'an already-applied delta is silent')
    mergeFromRemote([])
    assert.equal(fired, 0, 'an empty batch is silent')
  } finally {
    unsub()
  }
})

test('a throwing listener never breaks the merge (or the other listeners)', async () => {
  const { subscribeMemoriesChanged } = await import('../../src/lib/memoryStore.js')
  let heard = false
  const unsubBad = subscribeMemoriesChanged(() => { throw new Error('bad listener') })
  const unsubGood = subscribeMemoriesChanged(() => { heard = true })
  try {
    mergeFromRemote([remoteMem('m-guarded')])
    assert.equal(heard, true, 'the merge survives and later listeners still hear it')
    assert.deepEqual(listMemoriesForTrip('t1', 'helen').map((m) => m.id).includes('m-guarded'), true)
  } finally {
    unsubBad()
    unsubGood()
  }
})

test('unsubscribe stops the signal', async () => {
  const { subscribeMemoriesChanged } = await import('../../src/lib/memoryStore.js')
  let fired = 0
  const unsub = subscribeMemoriesChanged(() => { fired += 1 })
  unsub()
  mergeFromRemote([remoteMem('m-unsub')])
  assert.equal(fired, 0)
})

test('drainMemorySyncQueue: re-entry returns the IN-FLIGHT drain — an awaiting caller really waits for the pushes (push-then-pull)', async () => {
  const { drainMemorySyncQueue } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('m-inflight')])
  localStorage.setItem(
    'rt_memories_unsynced_v1',
    JSON.stringify([{ kind: 'save', memoryId: 'm-inflight', author: 'helen', at: 1748000000000 }])
  )
  let pushes = 0
  let release
  const gate = new Promise((r) => { release = r })
  const sync = {
    isWorkerConfigured: () => true,
    hasCredential: () => true,
    pushMemory: async (rec) => {
      pushes += 1
      await gate // the push is mid-flight until the test releases it
      return { ...rec, updatedAt: new Date().toISOString() }
    },
  }
  const p1 = drainMemorySyncQueue({ sync })
  const p2 = drainMemorySyncQueue({ sync })
  // The old early-return handed back a FRESH resolved promise — the second
  // caller (the A-3 beat, runSync, Settings runPull) then pulled while the
  // first drain's POST was still in the air, quietly voiding push-then-pull.
  assert.equal(p2, p1, 're-entry hands back the in-flight run, not a fresh resolved promise')
  let p2Resolved = false
  p2.then(() => { p2Resolved = true })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(p2Resolved, false, 'the second caller is actually waiting on the in-flight push')
  release()
  const out = await p2
  assert.equal(pushes, 1, 'one drain ran, once — re-entry never doubles the work')
  assert.equal(out.settled, 1, 'the stranded intent settled')
})

// ── skip-pending-intent (A-3 review fold-in) ───────────────────────────────

test('mergeFromRemote SKIPS a record with a pending unsynced intent — an unpushed local edit is never clobbered', async () => {
  const q = await import('../../src/lib/memorySyncQueue.js')
  // Seed a local edit, then mark it queued/unsynced (an edit that hasn't reached the family).
  mergeFromRemote([remoteMem('mp', { updatedAt: '2026-05-23T10:00:00.000Z', caption: 'my local edit' })])
  q.markUnsynced({ kind: 'save', memoryId: 'mp', author: 'helen' })
  // A NEWER remote row arrives (would win last-write-wins) — the clock-behind-skew aperture.
  const added = mergeFromRemote([remoteMem('mp', { updatedAt: '2026-05-23T12:00:00.000Z', caption: 'stale remote' })])
  const local = listMemoriesForTrip('t1', 'helen').find((m) => m.id === 'mp')
  assert.equal(local.caption, 'my local edit', 'the unpushed local edit is preserved, not clobbered')
  assert.equal(added, 0, 'the pending record was skipped — nothing merged')
})

test('a tombstone still drops a pending-intent record — a delete is authoritative', async () => {
  const q = await import('../../src/lib/memorySyncQueue.js')
  mergeFromRemote([remoteMem('mt', { caption: 'x' })])
  q.markUnsynced({ kind: 'save', memoryId: 'mt', author: 'helen' })
  mergeFromRemote([remoteMem('mt', { updatedAt: '2026-05-24T00:00:00.000Z', deletedAt: '2026-05-24T00:00:00.000Z' })])
  assert.deepEqual(
    listMemoriesForTrip('t1', 'helen').filter((m) => m.id === 'mt'),
    [],
    'the delete propagated despite the pending intent',
  )
})

test('a genuinely-new remote row is still taken even if an intent exists for its id (guard is existing-scoped)', async () => {
  const q = await import('../../src/lib/memorySyncQueue.js')
  q.markUnsynced({ kind: 'save', memoryId: 'mn', author: 'helen' }) // an intent, but no local record to protect
  const added = mergeFromRemote([remoteMem('mn', { caption: 'fresh' })])
  assert.equal(added, 1, 'the new remote is added — there was nothing local to clobber')
})

// ── applyRefGps (Stage C-b archive backfill) ───────────────────────────────

test('applyRefGps: writes coords onto a coordless r2 ref, idempotent, never overwrites existing coords', async () => {
  const { applyRefGps } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('mg', { photoRef: { storage: 'r2', key: 'kk', url: 'uu' } })])
  const patched = applyRefGps('mg', 'kk', { lat: 41.3, lng: -72.1 })
  assert.equal(patched.photoRef.lat, 41.3)
  assert.equal(patched.photoRef.lng, -72.1)
  // Idempotent: a ref that already has coords is a no-op — existing coords stand.
  const again = applyRefGps('mg', 'kk', { lat: 99, lng: 99 })
  assert.equal(again.photoRef.lat, 41.3, 'existing coords are never overwritten')
  // Unknown memory / non-finite coords → null (nothing to do at all).
  assert.equal(applyRefGps('nope', 'kk', { lat: 1, lng: 2 }), null)
  assert.equal(applyRefGps('mg', 'kk', { lat: 'x', lng: 2 }), null)
  // A wrong key on an existing memory is a no-op — the record comes back, its
  // ref untouched (nothing matched to write).
  const noMatch = applyRefGps('mg', 'other-key', { lat: 1, lng: 2 })
  assert.equal(noMatch.photoRef.lat, 41.3, 'no ref matched → nothing written')
})

test('applyRefGps: matches the right ref by key inside a photoRefs[] album', async () => {
  const { applyRefGps } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('ma', {
    photoRefs: [
      { storage: 'r2', key: 'a1', url: 'ua1', lat: 10, lng: 20 }, // already located
      { storage: 'r2', key: 'a2', url: 'ua2' },                    // coordless → target
    ],
  })])
  const patched = applyRefGps('ma', 'a2', { lat: 5, lng: 6 })
  assert.equal(patched.photoRefs[0].lat, 10, 'the already-located ref is untouched')
  assert.equal(patched.photoRefs[1].lat, 5)
  assert.equal(patched.photoRefs[1].lng, 6)
})

test('applyRefGps: a first write with no existing coords tags prov.gps to whatever source was passed', async () => {
  const { applyRefGps } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('mgp', { photoRef: { storage: 'r2', key: 'kk', url: 'uu' } })])
  const patched = applyRefGps('mgp', 'kk', { lat: 1, lng: 2 }, 'scan')
  assert.equal(patched.photoRef.lat, 1)
  assert.deepEqual(patched.photoRef.prov, { gps: 'scan' })
})

// ── Build 2 (§14): the provenance-aware write-seam rule ─────────────────────
// applyRefGps/applyRefOffset share ONE tiering rule (tieredWriteAllowed in
// memoryStore.js): no existing value → always write; existing REFERENCE-tier
// ('exif'/'scan') → refuse, always; existing value with prov ABSENT → refuse
// (defensive — "prefer nothing to a guess"); existing INFERRED-tier
// ('inferred-manual'/'inferred-place') → a new REFERENCE-tier source upgrades
// it, a new INFERRED-tier source is refused. Exercised on applyRefOffset
// (which actually has inferred sources today); the reference-blocks-reference
// and reference-blocks-absent-prov cases are proven on BOTH functions for
// symmetry, since GPS shares the exact same rule shape even with no live
// inferred-GPS source yet.

test('write-seam rule: REFERENCE blocks REFERENCE — an exif-tagged offset is never overwritten by a fresh exif/scan read', async () => {
  const { applyRefOffset } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('wr1', {
    photoRef: { storage: 'r2', key: 'kk', url: 'uu', offsetMinutes: -240, prov: { off: 'exif' } },
  })])
  const bySameTier = applyRefOffset('wr1', 'kk', -300, 'exif')
  assert.equal(bySameTier.photoRef.offsetMinutes, -240, 'exif never overwrites exif')
  const byScan = applyRefOffset('wr1', 'kk', -300, 'scan')
  assert.equal(byScan.photoRef.offsetMinutes, -240, 'scan never overwrites exif either — reference blocks reference')
  assert.deepEqual(byScan.photoRef.prov, { off: 'exif' }, 'prov itself is untouched by the refused write')
})

test('write-seam rule: REFERENCE blocks ABSENT prov — a legacy value with no prov tag is treated as reference tier', async () => {
  const { applyRefOffset } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('wr2', {
    // A pre-Build-2 ref: has an offset, but no prov at all (predates the
    // retroactive tagging pass) — "prefer nothing to a guess".
    photoRef: { storage: 'r2', key: 'kk', url: 'uu', offsetMinutes: -240 },
  })])
  const patched = applyRefOffset('wr2', 'kk', -300, 'inferred-place')
  assert.equal(patched.photoRef.offsetMinutes, -240, 'an absent prov defensively refuses a guess')
  assert.equal(patched.photoRef.prov, undefined, 'no prov is fabricated onto a refused write')
})

test('write-seam rule: INFERRED yields to REFERENCE — a real read upgrades a guess and updates prov', async () => {
  const { applyRefOffset } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('wr3', {
    photoRef: { storage: 'r2', key: 'kk', url: 'uu', offsetMinutes: -240, prov: { off: 'inferred-place' } },
  })])
  const patched = applyRefOffset('wr3', 'kk', -300, 'exif')
  assert.equal(patched.photoRef.offsetMinutes, -300, 'a real read overwrites the inferred guess')
  assert.deepEqual(patched.photoRef.prov, { off: 'exif' }, 'prov is upgraded to the new reference-tier source')
})

test('write-seam rule: INFERRED blocks INFERRED — never replace one guess with another (avoid thrashing)', async () => {
  const { applyRefOffset } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('wr4', {
    photoRef: { storage: 'r2', key: 'kk', url: 'uu', offsetMinutes: -240, prov: { off: 'inferred-manual' } },
  })])
  const patched = applyRefOffset('wr4', 'kk', -300, 'inferred-place')
  assert.equal(patched.photoRef.offsetMinutes, -240, 'a second guess never replaces the first')
  assert.deepEqual(patched.photoRef.prov, { off: 'inferred-manual' }, 'prov is untouched by the refused write')
})

test('write-seam rule: a first write (no existing offset) always lands regardless of source, and tags prov.off', async () => {
  const { applyRefOffset } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('wr5', { photoRef: { storage: 'r2', key: 'kk', url: 'uu' } })])
  const patched = applyRefOffset('wr5', 'kk', -240, 'inferred-place')
  assert.equal(patched.photoRef.offsetMinutes, -240)
  assert.deepEqual(patched.photoRef.prov, { off: 'inferred-place' })
})

test('write-seam rule: applyRefGps — REFERENCE blocks REFERENCE (symmetry with applyRefOffset)', async () => {
  const { applyRefGps } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('wg1', {
    photoRef: { storage: 'r2', key: 'kk', url: 'uu', lat: 1, lng: 2, prov: { gps: 'exif' } },
  })])
  const patched = applyRefGps('wg1', 'kk', { lat: 9, lng: 9 }, 'scan')
  assert.equal(patched.photoRef.lat, 1, 'a reference-tier GPS value is never overwritten by another reference-tier read')
  assert.deepEqual(patched.photoRef.prov, { gps: 'exif' })
})

test('write-seam rule: applyRefGps — REFERENCE blocks ABSENT prov (symmetry with applyRefOffset)', async () => {
  const { applyRefGps } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('wg2', {
    photoRef: { storage: 'r2', key: 'kk', url: 'uu', lat: 1, lng: 2 }, // legacy, no prov
  })])
  const patched = applyRefGps('wg2', 'kk', { lat: 9, lng: 9 }, 'exif')
  assert.equal(patched.photoRef.lat, 1, 'a legacy coord with no prov defensively refuses a fresh write too')
})

test('write-seam rule: prov.gps and prov.off coexist independently — writing one never disturbs the other', async () => {
  const { applyRefGps, applyRefOffset } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('wg3', {
    photoRef: { storage: 'r2', key: 'kk', url: 'uu', offsetMinutes: -240, prov: { off: 'inferred-place' } },
  })])
  const withGps = applyRefGps('wg3', 'kk', { lat: 5, lng: 6 }, 'exif')
  assert.deepEqual(withGps.photoRef.prov, { off: 'inferred-place', gps: 'exif' }, 'the pre-existing off tag survives a gps write')
  const upgraded = applyRefOffset('wg3', 'kk', -300, 'scan')
  assert.deepEqual(upgraded.photoRef.prov, { off: 'scan', gps: 'exif' }, 'the gps tag survives the offset upgrade')
})

// ── applyRefSidecar (Build 1 — the never-discard sidecar's re-source scan) ──

test('applyRefSidecar: per-field gap-fill — fills only ABSENT fields, never overwrites a present one', async () => {
  const { applyRefSidecar } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('ms', {
    photoRef: {
      storage: 'r2', key: 'kk', url: 'uu',
      meta: { make: 'Apple', model: 'iPhone 11' }, // already has meta
      atSrc: 'exif-original', // already has atSrc
      // srcName / srcMod are absent — the gap-fill targets
    },
  })])
  const patched = applyRefSidecar('ms', 'kk', {
    meta: { make: 'Canon', model: 'EOS R5' }, // must NOT clobber the stored meta
    srcName: 'IMG_0042.HEIC',
    srcMod: 1700000000000,
    atSrc: 'exif-create', // must NOT clobber the stored atSrc
  })
  assert.deepEqual(patched.photoRef.meta, { make: 'Apple', model: 'iPhone 11' }, 'existing meta stands')
  assert.equal(patched.photoRef.atSrc, 'exif-original', 'existing atSrc stands')
  assert.equal(patched.photoRef.srcName, 'IMG_0042.HEIC', 'the absent field is filled')
  assert.equal(patched.photoRef.srcMod, 1700000000000, 'the absent field is filled')

  // Idempotent: a second call with different values changes nothing further —
  // every field is now present.
  const again = applyRefSidecar('ms', 'kk', { srcName: 'other.jpg', srcMod: 1 })
  assert.equal(again.photoRef.srcName, 'IMG_0042.HEIC', 'already-filled fields never re-clobbered')

  // Unknown memory / an all-empty sidecar → null (nothing to do at all).
  assert.equal(applyRefSidecar('nope', 'kk', { srcName: 'x' }), null)
  assert.equal(applyRefSidecar('ms', 'kk', {}), null)
  assert.equal(applyRefSidecar('ms', 'kk', { srcName: '' }), null, 'a sidecar that sanitizes to empty is a no-op null')

  // A wrong key on an existing memory is a no-op — the record comes back, its
  // ref untouched (nothing matched to write).
  const noMatch = applyRefSidecar('ms', 'other-key', { srcName: 'zzz' })
  assert.equal(noMatch.photoRef.srcName, 'IMG_0042.HEIC', 'no ref matched → nothing written')
})

test('applyRefSidecar: matches the right ref by key inside a photoRefs[] album', async () => {
  const { applyRefSidecar } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('msa', {
    photoRefs: [
      { storage: 'r2', key: 'a1', url: 'ua1', srcName: 'already-tagged.jpg' }, // already carries sidecar
      { storage: 'r2', key: 'a2', url: 'ua2' },                                 // bare → target
    ],
  })])
  const patched = applyRefSidecar('msa', 'a2', { srcName: 'IMG_1.jpg', srcMod: 5, atSrc: 'file-mtime' })
  assert.equal(patched.photoRefs[0].srcName, 'already-tagged.jpg', 'the already-tagged ref is untouched')
  assert.equal(patched.photoRefs[1].srcName, 'IMG_1.jpg')
  assert.equal(patched.photoRefs[1].srcMod, 5)
  assert.equal(patched.photoRefs[1].atSrc, 'file-mtime')
})

test('applyRefSidecar: never patches a masked projection', async () => {
  const { applyRefSidecar } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([{ ...remoteMem('mk', { photoRef: { storage: 'r2', key: 'kk', url: 'uu' } }), masked: true }])
  const result = applyRefSidecar('mk', 'kk', { srcName: 'nope.jpg' })
  assert.equal(result.masked, true)
  assert.equal(result.photoRef.srcName, undefined, 'the masked stub is never patched')
})

// The 409 reapply — exported the same way as moveReapply / replaceVideoRefReapply
// (memorySyncFlow.js / memoryStore.js) specifically so it's independently
// testable: scheduleMirror's real Worker push can't run under `node --test`
// (workerSync.js pulls in browser-only deps and its dynamic import always
// fails here — the same pre-existing constraint memorySyncGuard.test.mjs and
// replaceVideoRef.test.mjs already document), so the reapply closure itself
// must be reachable directly rather than only through the live network path.

test('applyRefSidecarReapply: re-gap-fills onto a FRESH row, honoring fields the other device already filled', () => {
  const fresh = {
    id: 'mr', tripId: 't1', authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
    caption: 'renamed on the iPad', // another device's newer edit — must survive
    updatedAt: '2026-07-06T09:00:00.000Z',
    photoRef: {
      storage: 'r2', key: 'kk', url: 'uu',
      atSrc: 'exif-original', // the OTHER device already filled this — must not be clobbered
    },
  }
  const merged = applyRefSidecarReapply('kk', {
    meta: { make: 'Apple', model: 'iPhone 15' },
    srcName: 'IMG_0099.HEIC',
    atSrc: 'file-mtime', // would be wrong to land — fresh's atSrc already stands
  })(fresh)
  assert.equal(merged.caption, 'renamed on the iPad', 'the fresh edit rides through untouched')
  assert.deepEqual(merged.photoRef.meta, { make: 'Apple', model: 'iPhone 15' }, 'the absent field gap-fills')
  assert.equal(merged.photoRef.srcName, 'IMG_0099.HEIC', 'the absent field gap-fills')
  assert.equal(merged.photoRef.atSrc, 'exif-original', 'the already-filled field on fresh is never clobbered')
  assert.ok(merged.updatedAt > fresh.updatedAt, 'the reapply stamps a fresh edit time')
})

test('409 recovery: applyRefSidecar\'s reapply lands the gap-fill on the FRESH server row after a conflict', async () => {
  const { applyRefSidecar } = await import('../../src/lib/memoryStore.js')
  mergeFromRemote([remoteMem('mrs', {
    updatedAt: '2030-01-01T00:00:00.000Z',
    serverUpdatedAt: '2026-01-01T00:00:00.000Z',
    photoRef: { storage: 'r2', key: 'kk', url: 'uu' },
  })])
  const stale = applyRefSidecar('mrs', 'kk', { srcName: 'IMG_0007.HEIC', srcMod: 42 })
  assert.equal(stale.photoRef.srcName, 'IMG_0007.HEIC', 'the local write landed first')

  // Simulate a concurrent edit: the server's fresh row has a NEWER caption AND
  // already carries a DIFFERENT sidecar field (atSrc) that must survive.
  const fresh = {
    id: 'mrs', tripId: 't1', authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
    caption: 'edited on another device',
    updatedAt: '2026-07-06T09:00:00.000Z',
    photoRef: { storage: 'r2', key: 'kk', url: 'uu', atSrc: 'exif-create' },
  }
  const calls = { pull: [], push: [] }
  const sync = {
    async pullAll(opts) { calls.pull.push(opts || {}); return [fresh] },
    async pushMemory(rec, opts) { calls.push.push({ rec, opts: opts || {} }); return { ...rec, updatedAt: '2026-07-06T09:00:05.000Z' } },
  }
  const out = await resolveSaveConflict(
    sync,
    { type: 'save', record: stale, reapply: applyRefSidecarReapply('kk', { srcName: 'IMG_0007.HEIC', srcMod: 42 }) },
  )
  assert.equal(out.status, 'synced')
  assert.equal(calls.push[0].rec.caption, 'edited on another device', 'fresh content rides')
  assert.equal(calls.push[0].rec.photoRef.srcName, 'IMG_0007.HEIC', 'our gap-fill rides too')
  assert.equal(calls.push[0].rec.photoRef.atSrc, 'exif-create', 'freshs own sidecar field is preserved, not clobbered')
  const local = listMemoriesForTrip('t1', 'helen').find((m) => m.id === 'mrs')
  assert.equal(local.photoRef.srcName, 'IMG_0007.HEIC')
  assert.equal(local.caption, 'edited on another device')
})
