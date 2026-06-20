import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// Memory-sync conflict guard — the client half (optimistic concurrency 409
// recovery). memoryStore is browser-targeted (localStorage + a lazy workerSync
// import); we polyfill localStorage and drive resolveSaveConflict directly with a
// STUB sync so the recovery logic is exercised deterministically (the real
// workerSync can't import under node — it pulls in browser-only deps).

class MemStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
  clear() { this.map.clear() }
}
globalThis.localStorage = new MemStorage()

const {
  resolveSaveConflict,
  recordServerUpdatedAt,
  saveMemory,
  updateMemoryPoster,
  updateMemoryCapturedAt,
  revealSurprise,
  mergeFromRemote,
} = await import('../../src/lib/memoryStore.js')

const PRIV = (t) => `rt_memories_private_${t}_v1`
const readPriv = (t) => JSON.parse(globalThis.localStorage.getItem(PRIV(t)) || '[]')

const SHARED = 'rt_memories_shared_v1'
const readShared = () => JSON.parse(globalThis.localStorage.getItem(SHARED) || '[]')
const getById = (id) => readShared().find((m) => m.id === id)
const writeShared = (arr) => globalThis.localStorage.setItem(SHARED, JSON.stringify(arr))

// A stub sync. `fresh` is whatever pullAll returns (an array, or an array carrying
// an `.errors` property to simulate an offline pull). `push` decides the re-push
// outcome (return a row, or throw an err with .status to simulate a 409).
function makeSync({ fresh, push }) {
  const calls = { pull: [], push: [] }
  const sync = {
    async pullAll(opts) { calls.pull.push(opts || {}); return typeof fresh === 'function' ? fresh() : fresh },
    async pushMemory(rec, opts) { calls.push.push({ rec, opts: opts || {} }); return push(rec, opts) },
  }
  return { sync, calls }
}

beforeEach(() => globalThis.localStorage.clear())

test('409 recovery: a background patch gap-fills ONLY its field onto the FRESH row, pulls as the author, push-then-writes', async () => {
  // Stale local copy: our poster is set, updatedAt was bumped, base is an OLD server
  // version. The stale caption MUST NOT reach the server.
  const stale = {
    id: 'm1', tripId: 't', authorTraveler: 'helen', visibility: 'shared', kind: 'video',
    caption: 'OLD caption',
    photoRef: { storage: 'r2', key: 'k1', mime: 'video/mp4', posterKey: 'poster-NEW', posterUrl: 'u-new' },
    updatedAt: '2030-01-01T00:00:00.000Z', serverUpdatedAt: '2026-01-01T00:00:00.000Z',
  }
  writeShared([stale])
  const fresh = {
    id: 'm1', tripId: 't', authorTraveler: 'helen', visibility: 'shared', kind: 'video',
    caption: 'NEWER caption from another device',
    photoRef: { storage: 'r2', key: 'k1', mime: 'video/mp4' }, // no poster yet
    updatedAt: '2026-06-19T12:00:00.000Z',
  }
  // mirrors updateMemoryPoster's reapply (narrow gap-fill)
  const reapply = (f) => {
    const out = { ...f, updatedAt: '2031-01-01T00:00:00.000Z' }
    if (f.photoRef) out.photoRef = !f.photoRef.posterKey ? { ...f.photoRef, posterKey: 'poster-NEW', posterUrl: 'u-new' } : f.photoRef
    return out
  }
  const { sync, calls } = makeSync({ fresh: [fresh], push: (rec) => ({ ...rec, updatedAt: '2031-01-01T00:00:05.000Z' }) })

  await resolveSaveConflict(sync, { type: 'save', record: stale, reapply })

  assert.equal(calls.pull[0].asTraveler, 'helen', 'pulled AS the author, not the active persona')
  assert.equal(calls.push[0].opts.baseUpdatedAt, fresh.updatedAt, 're-pushed with the fresh server version as base')
  assert.equal(calls.push[0].rec.caption, 'NEWER caption from another device', 'the newer caption is NOT clobbered')
  assert.equal(calls.push[0].rec.photoRef.posterKey, 'poster-NEW', 'our poster is gap-filled')
  const local = getById('m1')
  assert.equal(local.caption, 'NEWER caption from another device')
  assert.equal(local.photoRef.posterKey, 'poster-NEW')
  assert.equal(local.serverUpdatedAt, '2031-01-01T00:00:05.000Z', 'push-then-write: local carries the server-issued new version')
})

test('409 recovery: a transient (offline) re-pull leaves local untouched — no strand, no clobber, no loop', async () => {
  const stale = { id: 'm2', authorTraveler: 'helen', visibility: 'shared', caption: 'local', updatedAt: '2030-01-01T00:00:00.000Z', serverUpdatedAt: '2026-01-01T00:00:00.000Z' }
  writeShared([stale])
  const offline = []; offline.errors = ['offline']
  const { sync, calls } = makeSync({ fresh: offline, push: () => { throw new Error('must not push') } })

  await resolveSaveConflict(sync, { type: 'save', record: stale })

  assert.equal(calls.push.length, 0)
  assert.deepEqual(getById('m2'), stale, 'local is unchanged')
})

test('409 recovery: a masked fresh stub is never a merge target — leave local canonical', async () => {
  const stale = { id: 'm3', authorTraveler: 'helen', visibility: 'shared', caption: 'local', updatedAt: '2030-01-01T00:00:00.000Z' }
  writeShared([stale])
  const { sync, calls } = makeSync({ fresh: [{ id: 'm3', masked: true }], push: () => { throw new Error('must not push') } })

  await resolveSaveConflict(sync, { type: 'save', record: stale })

  assert.equal(calls.push.length, 0)
  assert.deepEqual(getById('m3'), stale)
})

test('409 recovery: repeated 409s exhaust the retry budget, then ADOPT fresh (no island) keeping our local poster', async () => {
  const stale = {
    id: 'm4', authorTraveler: 'helen', visibility: 'shared', kind: 'video',
    photoRef: { storage: 'r2', key: 'k', mime: 'video/mp4', posterKey: 'mine', posterUrl: 'u' },
    updatedAt: '2030-01-01T00:00:00.000Z', serverUpdatedAt: '2026-01-01T00:00:00.000Z',
  }
  writeShared([stale])
  const fresh = {
    id: 'm4', authorTraveler: 'helen', visibility: 'shared', kind: 'video', caption: 'server',
    photoRef: { storage: 'r2', key: 'k', mime: 'video/mp4' }, updatedAt: '2026-06-19T12:00:00.000Z',
  }
  const reapply = (f) => {
    const o = { ...f, updatedAt: '2031-01-01T00:00:00.000Z' }
    if (f.photoRef && !f.photoRef.posterKey) o.photoRef = { ...f.photoRef, posterKey: 'mine', posterUrl: 'u' }
    return o
  }
  const { sync, calls } = makeSync({ fresh: [fresh], push: () => { const e = new Error('conflict'); e.status = 409; throw e } })

  await resolveSaveConflict(sync, { type: 'save', record: stale, reapply })

  assert.equal(calls.push.length, 3, 'attempts 0,1,2 then give up (no infinite loop)')
  const local = getById('m4')
  assert.equal(local.serverUpdatedAt, fresh.updatedAt, 'adopted the server version → no island')
  assert.equal(local.updatedAt, fresh.updatedAt, 'local updatedAt is the server clock, not the bumped client value')
  assert.equal(local.caption, 'server', 'adopted the server truth')
  assert.equal(local.photoRef.posterKey, 'mine', 'our local poster carried forward (preserveLocalPhotoMeta)')
})

test('409 recovery: a foreground edit (no reapply) re-pushes the whole edit on top of fresh (deliberate-edit-wins)', async () => {
  const edit = { id: 'm5', authorTraveler: 'helen', visibility: 'shared', caption: 'MY new caption', updatedAt: '2030-01-01T00:00:00.000Z', serverUpdatedAt: '2026-01-01T00:00:00.000Z' }
  writeShared([edit])
  const fresh = { id: 'm5', authorTraveler: 'helen', visibility: 'shared', caption: 'their caption', updatedAt: '2026-06-19T12:00:00.000Z' }
  const { sync, calls } = makeSync({ fresh: [fresh], push: (rec) => ({ ...rec, updatedAt: '2031-01-01T00:00:00.000Z' }) })

  await resolveSaveConflict(sync, { type: 'save', record: edit }) // no reapply → deliberate-win

  assert.equal(calls.push[0].opts.baseUpdatedAt, fresh.updatedAt)
  assert.equal(calls.push[0].rec.caption, 'MY new caption', 'the deliberate foreground edit wins')
  assert.equal(getById('m5').caption, 'MY new caption')
})

test('the patch helpers BAIL on a masked projection — no updatedAt bump, no field written', () => {
  const masked = {
    id: 'm6', authorTraveler: 'helen', visibility: 'shared', masked: true, kind: 'video',
    photoRef: { storage: 'r2', key: 'k', mime: 'video/mp4' }, updatedAt: '2026-06-19T00:00:00.000Z',
  }
  writeShared([masked])

  updateMemoryPoster('m6', 'poster-x', 'url-x')
  let local = getById('m6')
  assert.equal(local.updatedAt, '2026-06-19T00:00:00.000Z', 'poster: updatedAt not bumped')
  assert.equal(local.photoRef.posterKey, undefined, 'poster: not written onto a masked stub')

  updateMemoryCapturedAt('m6', '2024-01-01T00:00:00.000Z')
  local = getById('m6')
  assert.equal(local.updatedAt, '2026-06-19T00:00:00.000Z', 'capturedAt: updatedAt not bumped')
  assert.equal(local.capturedAt, undefined, 'capturedAt: not written onto a masked stub')

  revealSurprise('m6')
  local = getById('m6')
  assert.equal(local.updatedAt, '2026-06-19T00:00:00.000Z', 'reveal: updatedAt not bumped')
  assert.equal(local.revealed, undefined, 'reveal: not written onto a masked stub')
})

test('mergeFromRemote stamps serverUpdatedAt from the pulled row (the skew-free base source)', () => {
  const added = mergeFromRemote([{ id: 'm7', authorTraveler: 'helen', visibility: 'shared', caption: 'c', updatedAt: '2026-06-19T10:00:00.000Z' }])
  assert.equal(added, 1)
  assert.equal(getById('m7').serverUpdatedAt, '2026-06-19T10:00:00.000Z')
})

test('saveMemory carries serverUpdatedAt forward (base for the foreground guard); a brand-new memory has none', () => {
  mergeFromRemote([{ id: 'm8', authorTraveler: 'helen', visibility: 'shared', caption: 'c', kind: 'note', updatedAt: '2026-06-19T10:00:00.000Z' }])
  const edited = saveMemory({ id: 'm8', authorTraveler: 'helen', visibility: 'shared', kind: 'note', text: 'edited', caption: 'edited' })
  assert.equal(edited.serverUpdatedAt, '2026-06-19T10:00:00.000Z', 'an edit carries the last-known server base')
  const fresh = saveMemory({ id: 'new1', authorTraveler: 'helen', visibility: 'shared', kind: 'note', text: 'n', caption: 'n' })
  assert.equal(fresh.serverUpdatedAt, undefined, 'a never-synced memory sends no base → safe create (LWW)')
})

test('409 recovery: on success, local.updatedAt is the SERVER value (not the reapply client clock) so a concurrent newer edit self-heals', async () => {
  // The window race: auto-sync could merge an even-newer edit during our pull→push.
  // If recovery left local.updatedAt at a future-dated client clock, shouldTakeRemote
  // would refuse that newer edit forever. It must be the server's stamp.
  const stale = { id: 'mR', authorTraveler: 'helen', visibility: 'shared', kind: 'video',
    photoRef: { storage: 'r2', key: 'k', mime: 'video/mp4', posterKey: 'p', posterUrl: 'u' },
    updatedAt: '2030-01-01T00:00:00.000Z', serverUpdatedAt: '2026-01-01T00:00:00.000Z' }
  writeShared([stale])
  const fresh = { id: 'mR', authorTraveler: 'helen', visibility: 'shared', kind: 'video',
    photoRef: { storage: 'r2', key: 'k', mime: 'video/mp4' }, updatedAt: '2026-06-19T12:00:00.000Z' }
  const reapply = (f) => { const o = { ...f, updatedAt: '2099-01-01T00:00:00.000Z' }; if (f.photoRef && !f.photoRef.posterKey) o.photoRef = { ...f.photoRef, posterKey: 'p', posterUrl: 'u' }; return o }
  const serverStamp = '2026-06-19T12:00:05.000Z'
  const { sync } = makeSync({ fresh: [fresh], push: (rec) => ({ ...rec, updatedAt: serverStamp }) })

  await resolveSaveConflict(sync, { type: 'save', record: stale, reapply })

  const local = getById('mR')
  assert.equal(local.updatedAt, serverStamp, 'LWW updatedAt is the server stamp, never the 2099 client clock')
  assert.equal(local.serverUpdatedAt, serverStamp)
})

test('409 recovery: a PRIVATE record pulls as its author and lands in the AUTHOR private bucket (never SHARED)', async () => {
  const stale = { id: 'mP', authorTraveler: 'aurelia', visibility: 'private', caption: 'old',
    updatedAt: '2030-01-01T00:00:00.000Z', serverUpdatedAt: '2026-01-01T00:00:00.000Z' }
  globalThis.localStorage.setItem(PRIV('aurelia'), JSON.stringify([stale]))
  const fresh = { id: 'mP', authorTraveler: 'aurelia', visibility: 'private', caption: 'newer', updatedAt: '2026-06-19T12:00:00.000Z' }
  const { sync, calls } = makeSync({ fresh: [fresh], push: (rec) => ({ ...rec, updatedAt: '2026-06-19T12:00:05.000Z' }) })

  await resolveSaveConflict(sync, { type: 'save', record: stale }) // foreground deliberate-win

  assert.equal(calls.pull[0].asTraveler, 'aurelia', 'pulled as the private record’s author')
  assert.equal(readShared().find((m) => m.id === 'mP'), undefined, 'never leaked into the shared zone')
  const inPriv = readPriv('aurelia').find((m) => m.id === 'mP')
  assert.ok(inPriv, 'landed in the author private bucket')
  assert.equal(inPriv.caption, 'old', 'the deliberate edit (op.record) won')
})

test('409 recovery: a photo-removal re-applies the removal onto FRESH (keeps a concurrent caption), not a whole-record clobber', async () => {
  // mirrors removePhotoFromMemory's reapply
  const target = { storage: 'r2', key: 'kill', mime: 'image/jpeg', url: 'u-kill' }
  const keep = { storage: 'r2', key: 'keep', mime: 'image/jpeg', url: 'u-keep' }
  const localSlim = { id: 'mD', authorTraveler: 'helen', visibility: 'shared', caption: 'STALE',
    photoRefs: [keep], updatedAt: '2030-01-01T00:00:00.000Z', serverUpdatedAt: '2026-01-01T00:00:00.000Z' }
  writeShared([localSlim])
  // fresh server row still has BOTH photos AND a newer caption from another device
  const fresh = { id: 'mD', authorTraveler: 'helen', visibility: 'shared', caption: 'NEWER from elsewhere',
    photoRefs: [keep, target], updatedAt: '2026-06-19T12:00:00.000Z' }
  const { removePhotoFromRecord } = await import('../../src/lib/memoryStore.js')
  const reapply = (f) => { const { record: r } = removePhotoFromRecord(f, { refKey: 'kill' }); return r ? { ...r, updatedAt: new Date().toISOString() } : f }
  const { sync, calls } = makeSync({ fresh: [fresh], push: (rec) => ({ ...rec, updatedAt: '2026-06-19T12:00:05.000Z' }) })

  await resolveSaveConflict(sync, { type: 'save', record: localSlim, reapply })

  const pushed = calls.push[0].rec
  assert.equal(pushed.caption, 'NEWER from elsewhere', 'the concurrent caption is preserved, not clobbered')
  assert.deepEqual(pushed.photoRefs.map((r) => r.key), ['keep'], 'only the targeted photo was removed from fresh')
})

test('recordServerUpdatedAt is monotonic and bucket-aware: never lowers, raises on newer, finds a private record by author', () => {
  writeShared([{ id: 's1', authorTraveler: 'helen', visibility: 'shared', serverUpdatedAt: '2026-06-19T10:00:00.000Z' }])
  recordServerUpdatedAt('s1', 'helen', '2026-06-19T09:00:00.000Z')
  assert.equal(getById('s1').serverUpdatedAt, '2026-06-19T10:00:00.000Z', 'does not lower')
  recordServerUpdatedAt('s1', 'helen', '2026-06-19T11:00:00.000Z')
  assert.equal(getById('s1').serverUpdatedAt, '2026-06-19T11:00:00.000Z', 'raises on a newer stamp')
  globalThis.localStorage.setItem(PRIV('aurelia'), JSON.stringify([{ id: 'p1', authorTraveler: 'aurelia', visibility: 'private' }]))
  recordServerUpdatedAt('p1', 'aurelia', '2026-06-19T08:00:00.000Z')
  assert.equal(readPriv('aurelia').find((m) => m.id === 'p1').serverUpdatedAt, '2026-06-19T08:00:00.000Z', 'finds a private record via its author bucket')
})

test('base-conversion contract: an integer-ms ISO round-trips exactly; non-timestamps become NaN (→ base omitted)', () => {
  // Mirrors workerSync.baseToEpochMs (not importable under node — workerSync pulls
  // in browser-only deps). The worker guard test covers the finite-guard end-to-end.
  const toEpoch = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v ? Date.parse(v) : NaN)
  assert.equal(toEpoch(new Date(1718000000123).toISOString()), 1718000000123, 'exact, no ms loss')
  assert.equal(toEpoch(1718000000123), 1718000000123)
  assert.ok(Number.isNaN(toEpoch(undefined)))
  assert.ok(Number.isNaN(toEpoch('')))
  assert.ok(Number.isNaN(toEpoch('not-a-date')))
})
