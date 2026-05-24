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
} = await import('../../src/lib/memoryStore.js')

beforeEach(() => {
  globalThis.localStorage.clear()
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
