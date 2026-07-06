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
  updateMemoryStop,
  revealSurprise,
  mergeFromRemote,
  mirrorSaveOp,
  confirmMemoryPushed,
  drainMemorySyncQueue,
} = await import('../../src/lib/memoryStore.js')
const memoryQueue = await import('../../src/lib/memorySyncQueue.js')
const { moveReapply } = await import('../../src/lib/memorySyncFlow.js')

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

beforeEach(async () => {
  // Let the module-level mirror chain settle first: under node the lazy
  // workerSync import always fails, which (batch A-2) queues a 'pending'
  // intent for any save a PREVIOUS test made — flush those strays, THEN clear,
  // so every test starts from a truly empty store + queue.
  await new Promise((r) => setTimeout(r, 0))
  globalThis.localStorage.clear()
})

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

// ── Batch A-2: memory-record sync integrity ─────────────────────────────────

test('409 recovery ADOPTS a family delete: a tombstoned fresh row drops local and is NEVER re-pushed', async () => {
  // The resurrection gun: our edit 409s because the family deleted the memory.
  // Re-pushing onto the tombstone (its own stamp as base) would pass OCC and
  // revive it family-wide. The delete must win instead.
  const stale = { id: 'mDel', authorTraveler: 'helen', visibility: 'shared', caption: 'my edit', updatedAt: '2030-01-01T00:00:00.000Z', serverUpdatedAt: '2026-01-01T00:00:00.000Z' }
  writeShared([stale])
  const fresh = { id: 'mDel', authorTraveler: 'helen', visibility: 'shared', deletedAt: '2026-07-05T09:00:00.000Z', updatedAt: '2026-07-05T09:00:00.000Z' }
  const { sync, calls } = makeSync({ fresh: [fresh], push: () => { throw new Error('must not push onto a tombstone') } })

  const out = await resolveSaveConflict(sync, { type: 'save', record: stale })

  assert.equal(out.status, 'delete-adopted')
  assert.equal(calls.push.length, 0, 'nothing re-pushed onto the tombstone')
  assert.equal(getById('mDel'), undefined, 'local copy dropped — the delete won')
})

test("409 with the worker's own deleted:true body short-circuits to delete adoption (no pull needed)", async () => {
  const stale = { id: 'mDel2', authorTraveler: 'helen', visibility: 'shared', caption: 'edit', updatedAt: '2030-01-01T00:00:00.000Z', serverUpdatedAt: '2026-01-01T00:00:00.000Z' }
  writeShared([stale])
  const { sync, calls } = makeSync({
    fresh: () => { throw new Error('must not need a pull — the 409 already answered') },
    push: () => { const e = new Error('conflict'); e.status = 409; e.body = { deleted: true }; throw e },
  })

  const outcome = await mirrorSaveOp(sync, { type: 'save', record: stale })

  assert.equal(outcome, 'delete-adopted')
  assert.equal(calls.push.length, 1, 'the one refused push, nothing after')
  assert.equal(getById('mDel2'), undefined, 'local adopted the worker-asserted delete')
})

test('409 recovery default is STOP-FIELD-AWARE: a caption edit re-pushes its content but PRESERVES the fresh stop filing', async () => {
  // A behind device edits a caption while another device moved the memory.
  // "Last deliberate edit wins" applies to CONTENT — the filing may only change
  // through a move op's own closure.
  const stale = { id: 'mStop', authorTraveler: 'helen', visibility: 'shared', caption: 'MY caption', stopId: 'old-stop', updatedAt: '2030-01-01T00:00:00.000Z', serverUpdatedAt: '2026-01-01T00:00:00.000Z' }
  writeShared([stale])
  const fresh = { id: 'mStop', authorTraveler: 'helen', visibility: 'shared', caption: 'theirs', stopId: 'moved-here', updatedAt: '2026-07-05T10:00:00.000Z' }
  const { sync, calls } = makeSync({ fresh: [fresh], push: (rec) => ({ ...rec, updatedAt: '2026-07-05T10:00:05.000Z' }) })

  const out = await resolveSaveConflict(sync, { type: 'save', record: stale })

  assert.equal(out.status, 'synced')
  assert.equal(calls.push[0].rec.caption, 'MY caption', 'the deliberate content edit wins')
  assert.equal(calls.push[0].rec.stopId, 'moved-here', 'the fresh move is NOT reverted by a content edit')
  assert.equal(getById('mStop').stopId, 'moved-here')
  assert.equal(getById('mStop').caption, 'MY caption')
})

test('a MOVE whose target the family already reached SKIPS the push (adopts fresh, no updated_at churn)', async () => {
  const stale = { id: 'mSkip', authorTraveler: 'helen', visibility: 'shared', caption: 'old content', stopId: 'target', updatedAt: '2030-01-01T00:00:00.000Z', serverUpdatedAt: '2026-01-01T00:00:00.000Z' }
  writeShared([stale])
  const fresh = { id: 'mSkip', authorTraveler: 'helen', visibility: 'shared', caption: 'fresher content', stopId: 'target', updatedAt: '2026-07-05T10:00:00.000Z' }
  const { sync, calls } = makeSync({ fresh: [fresh], push: () => { throw new Error('must not push a content-identical move') } })

  const out = await resolveSaveConflict(sync, { type: 'save', record: stale, reapply: moveReapply('target') })

  assert.equal(out.status, 'synced', 'the intent is satisfied — the family already sees the move')
  assert.equal(calls.push.length, 0)
  assert.equal(getById('mSkip').caption, 'fresher content', 'adopted the fresh row')
  assert.equal(getById('mSkip').serverUpdatedAt, fresh.updatedAt)
})

test('a NON-409 failure mid-recovery returns pending and leaves local untouched (the queue owns the retry — never drop the edit)', async () => {
  const stale = { id: 'mNet', authorTraveler: 'helen', visibility: 'shared', caption: 'my edit', stopId: 's1', updatedAt: '2030-01-01T00:00:00.000Z', serverUpdatedAt: '2026-01-01T00:00:00.000Z' }
  writeShared([stale])
  const fresh = { id: 'mNet', authorTraveler: 'helen', visibility: 'shared', caption: 'server', stopId: 's1', updatedAt: '2026-07-05T10:00:00.000Z' }
  const { sync } = makeSync({ fresh: [fresh], push: () => { throw new Error('network down mid-recovery') } })

  const out = await resolveSaveConflict(sync, { type: 'save', record: stale })

  assert.equal(out.status, 'pending')
  assert.equal(getById('mNet').caption, 'my edit', 'the edit is kept, not silently swapped for the server row')
  assert.equal(getById('mNet').updatedAt, '2030-01-01T00:00:00.000Z')
})

test('recovery statuses: offline pull → pending; masked stub → refused; retries exhausted → refused (adopts fresh)', async () => {
  const rec = { id: 'mSt', authorTraveler: 'helen', visibility: 'shared', caption: 'l', updatedAt: '2030-01-01T00:00:00.000Z' }
  writeShared([rec])
  const offline = []; offline.errors = ['offline']
  assert.equal((await resolveSaveConflict(makeSync({ fresh: offline, push: () => {} }).sync, { type: 'save', record: rec })).status, 'pending')
  assert.equal((await resolveSaveConflict(makeSync({ fresh: [{ id: 'mSt', masked: true }], push: () => {} }).sync, { type: 'save', record: rec })).status, 'refused')
  const fresh = { id: 'mSt', authorTraveler: 'helen', visibility: 'shared', caption: 'server', updatedAt: '2026-07-05T10:00:00.000Z' }
  const always409 = makeSync({ fresh: [fresh], push: () => { const e = new Error('conflict'); e.status = 409; throw e } })
  assert.equal((await resolveSaveConflict(always409.sync, { type: 'save', record: rec })).status, 'refused')
  assert.equal(getById('mSt').caption, 'server', 'exhausted retries adopt fresh — no island')
})

test('FIX 5 restamp: a confirmed push re-stamps local updatedAt with the SERVER value (clock-ahead skew ends at confirm)', async () => {
  // A clock-ahead device: its save carries a future device stamp. Once the
  // worker confirms, the local LWW stamp must become the server's — otherwise
  // every later family edit/heal is refused for the whole skew duration.
  const rec = { id: 'mSkew', authorTraveler: 'helen', visibility: 'shared', caption: 'c', updatedAt: '2030-01-01T00:00:00.000Z' }
  writeShared([rec])
  const serverStamp = '2026-07-05T10:00:00.000Z'
  const { sync } = makeSync({ fresh: [], push: (r) => ({ ...r, id: r.id, updatedAt: serverStamp }) })

  const outcome = await mirrorSaveOp(sync, { type: 'save', record: rec })

  assert.equal(outcome, 'synced')
  const local = getById('mSkew')
  assert.equal(local.updatedAt, serverStamp, 'the future-dated device stamp is settled to server time')
  assert.equal(local.serverUpdatedAt, serverStamp, 'and the next push has a fresh base')
})

test('FIX 5 restamp guard: a NEWER local edit made mid-push keeps its own stamp (only the pushed snapshot settles)', () => {
  const pushed = { id: 'mMid', authorTraveler: 'helen', visibility: 'shared', caption: 'v1', updatedAt: '2030-01-01T00:00:00.000Z' }
  // The stored copy moved on while the push was in flight (a newer local edit).
  writeShared([{ ...pushed, caption: 'v2', updatedAt: '2030-01-02T00:00:00.000Z' }])

  confirmMemoryPushed(pushed, '2026-07-05T10:00:00.000Z')

  const local = getById('mMid')
  assert.equal(local.updatedAt, '2030-01-02T00:00:00.000Z', 'the unsynced newer edit is never aged backward')
  assert.equal(local.serverUpdatedAt, '2026-07-05T10:00:00.000Z', 'the base still advances (monotonic)')
})

test("FIX 6 refusal adoption: a worker 'skipped' answer reads as refused, never synced; local stays canonical", async () => {
  const rec = { id: 'mRef', authorTraveler: 'helen', visibility: 'shared', caption: 'mine', updatedAt: '2030-01-01T00:00:00.000Z' }
  writeShared([rec])
  const { sync } = makeSync({ fresh: [], push: () => ({ ok: true, skipped: 'masked-projection', id: 'mRef' }) })

  const outcome = await mirrorSaveOp(sync, { type: 'save', record: rec })

  assert.equal(outcome, 'refused')
  assert.equal(getById('mRef').caption, 'mine')
  assert.equal(getById('mRef').serverUpdatedAt, undefined, 'a refusal never stamps a confirmed base')
})

test('FIX 6 seam: when the worker KEEPS a different filing (Stage-B manual lock), the pusher adopts the server answer', async () => {
  // Inert against today's worker (it always writes the pushed stop_id) —
  // this pins the client seam with a simulated Stage-B refusal row.
  const rec = { id: 'mKeep', authorTraveler: 'helen', visibility: 'shared', caption: 'c', stopId: 'auto-target', updatedAt: '2030-01-01T00:00:00.000Z' }
  writeShared([rec])
  const serverRow = { id: 'mKeep', stopId: 'manual-choice', stopProv: { source: 'manual', by: 'jonathan' }, updatedAt: '2026-07-05T10:00:00.000Z' }
  const { sync } = makeSync({ fresh: [], push: () => serverRow })

  const outcome = await mirrorSaveOp(sync, { type: 'save', record: rec })

  assert.equal(outcome, 'synced')
  const local = getById('mKeep')
  assert.equal(local.stopId, 'manual-choice', "the server's kept filing is adopted, not displayed-over until some later pull")
  assert.deepEqual(local.stopProv, { source: 'manual', by: 'jonathan' }, 'its provenance rides along')
  assert.equal(local.caption, 'c', 'content untouched — only the filing was refused')
})

// ── The intent-queue drain ──────────────────────────────────────────────────

test('drain: a MOVE replays its STORED target — never the live record filing a pull overwrote', async () => {
  // The offline-manual-move clobber (critique-0 #2): the mirror failed, a pull
  // then overwrote the local filing with the family's auto state. The queued
  // intent — not the record — carries the decision, and the drain re-asserts it.
  writeShared([{ id: 'mMv', authorTraveler: 'helen', visibility: 'shared', caption: 'c', stopId: 'pull-overwrote-me', updatedAt: '2026-07-05T08:00:00.000Z', serverUpdatedAt: '2026-07-05T08:00:00.000Z' }])
  memoryQueue._resetForTest()
  memoryQueue.markUnsynced({ kind: 'move', memoryId: 'mMv', stopId: 'decided-target', author: 'helen' })
  const { sync, calls } = makeSync({ fresh: [], push: (r) => ({ ...r, updatedAt: '2026-07-05T10:00:00.000Z' }) })
  const outcomes = []
  const off = memoryQueue.subscribeOutcomes((id, o) => { if (id === 'mMv') outcomes.push(o) })

  const res = await drainMemorySyncQueue({ sync })
  off()

  assert.equal(calls.push[0].rec.stopId, 'decided-target', 'the stored intent is what replays')
  assert.equal(getById('mMv').stopId, 'decided-target', 'local re-asserts the decision too')
  assert.equal(memoryQueue.isUnsynced('mMv'), false, 'worker-confirmed → dequeued')
  assert.deepEqual(outcomes, ['synced'])
  assert.equal(res.remaining, 0)
})

test('drain: a SAVE pushes the LIVE record — content edits made after the failure ride the replay', async () => {
  writeShared([{ id: 'mSv', authorTraveler: 'helen', visibility: 'shared', caption: 'edited AFTER the failed mirror', updatedAt: '2026-07-05T09:00:00.000Z', serverUpdatedAt: '2026-07-05T08:00:00.000Z' }])
  memoryQueue._resetForTest()
  memoryQueue.markUnsynced({ kind: 'save', memoryId: 'mSv', author: 'helen' })
  const { sync, calls } = makeSync({ fresh: [], push: (r) => ({ ...r, updatedAt: '2026-07-05T10:00:00.000Z' }) })

  await drainMemorySyncQueue({ sync })

  assert.equal(calls.push[0].rec.caption, 'edited AFTER the failed mirror', 'whole-record by design: the CURRENT content is the intent')
  assert.equal(calls.push[0].opts.baseUpdatedAt, '2026-07-05T08:00:00.000Z', 'the OCC base still rides')
  assert.equal(memoryQueue.isUnsynced('mSv'), false)
})

test('drain: a still-failing push stays QUEUED (dequeue only on worker-confirmed outcomes) and signals still-pending', async () => {
  writeShared([{ id: 'mPend', authorTraveler: 'helen', visibility: 'shared', caption: 'c', updatedAt: '2026-07-05T09:00:00.000Z' }])
  memoryQueue._resetForTest()
  memoryQueue.markUnsynced({ kind: 'save', memoryId: 'mPend', author: 'helen' })
  const { sync } = makeSync({ fresh: [], push: () => { throw new Error('still offline') } })
  const outcomes = []
  const off = memoryQueue.subscribeOutcomes((id, o) => { if (id === 'mPend') outcomes.push(o) })

  await drainMemorySyncQueue({ sync })
  off()

  assert.equal(memoryQueue.isUnsynced('mPend'), true, 'the edit is still owed — never dropped')
  assert.deepEqual(outcomes, ['still-pending'])
})

test('drain: a 409 at a tombstone adopts the delete — BOTH intents for the memory die with it', async () => {
  writeShared([{ id: 'mGone', authorTraveler: 'helen', visibility: 'shared', caption: 'c', stopId: 's1', updatedAt: '2026-07-05T09:00:00.000Z' }])
  memoryQueue._resetForTest()
  memoryQueue.markUnsynced({ kind: 'save', memoryId: 'mGone', author: 'helen' })
  memoryQueue.markUnsynced({ kind: 'move', memoryId: 'mGone', stopId: 's2', author: 'helen' })
  const { sync } = makeSync({ fresh: [], push: () => { const e = new Error('conflict'); e.status = 409; e.body = { deleted: true }; throw e } })
  const outcomes = []
  const off = memoryQueue.subscribeOutcomes((id, o) => { if (id === 'mGone') outcomes.push(o) })

  await drainMemorySyncQueue({ sync })
  off()

  assert.equal(getById('mGone'), undefined, 'local adopted the family delete')
  assert.equal(memoryQueue.isUnsynced('mGone'), false, 'nothing about this record is owed anymore')
  assert.ok(outcomes.includes('delete-adopted'))
})

test('drain: a record gone locally dequeues as refused (deletes have their own tombstone story)', async () => {
  memoryQueue._resetForTest()
  memoryQueue.markUnsynced({ kind: 'save', memoryId: 'mMissing', author: 'helen' })
  const { sync, calls } = makeSync({ fresh: [], push: () => { throw new Error('must not push a record we do not have') } })

  await drainMemorySyncQueue({ sync })

  assert.equal(calls.push.length, 0)
  assert.equal(memoryQueue.isUnsynced('mMissing'), false)
})

test('drain: an unconfigured worker leaves the queue untouched (nothing to sync to is not a verdict)', async () => {
  memoryQueue._resetForTest()
  memoryQueue.markUnsynced({ kind: 'save', memoryId: 'mCfg', author: 'helen' })
  const sync = { isWorkerConfigured: () => false, pushMemory: () => { throw new Error('must not be called') }, pullAll: () => [] }

  const res = await drainMemorySyncQueue({ sync })

  assert.equal(memoryQueue.isUnsynced('mCfg'), true)
  assert.equal(res.settled, 0)
})

test('G7: ABSENT from a successful recovery pull proves NOTHING — pending, no push, local intact, intent still owed', async () => {
  // The memory-side twin of the Vermont class: getMemories can withhold a LIVE
  // row (per-viewer filtering, a transient read blip) — absence must never be
  // read as a family delete (delete-adopt), an adopt-fresh, or a blind re-push.
  const stale = { id: 'mAbs', authorTraveler: 'helen', visibility: 'shared', caption: 'my edit', updatedAt: '2030-01-01T00:00:00.000Z', serverUpdatedAt: '2026-01-01T00:00:00.000Z' }
  writeShared([stale])
  const direct = makeSync({ fresh: [], push: () => { throw new Error('must not push blind — the pull served no base') } })

  const out = await resolveSaveConflict(direct.sync, { type: 'save', record: stale })

  assert.equal(out.status, 'pending')
  assert.equal(direct.calls.push.length, 0, 'never delete-adopted, never adopt-fresh, never pushed blind')
  assert.deepEqual(getById('mAbs'), stale, 'local record intact')

  // End-to-end: a queued intent whose replay 409s into that same absent pull stays OWED.
  memoryQueue._resetForTest()
  memoryQueue.markUnsynced({ kind: 'save', memoryId: 'mAbs', author: 'helen' })
  const { sync, calls } = makeSync({ fresh: [], push: () => { const e = new Error('conflict'); e.status = 409; throw e } })
  await drainMemorySyncQueue({ sync })
  assert.equal(calls.push.length, 1, 'the one refused push; the recovery pulled and stopped')
  assert.equal(memoryQueue.isUnsynced('mAbs'), true, 'absence is not a verdict — the intent survives for the next moment')
  assert.deepEqual(getById('mAbs'), stale, 'still intact after the drain')
})

test('a NEWER move decision replaces a still-queued older target AT DECISION TIME — the drain replays the decision, never the stale entry', async () => {
  // Offline, the user moved to first-target (mirror failed → queued). Back
  // online they reconsider BEFORE the queue drains. The entry must carry the
  // new target from the moment of the decision — a drain tick racing the
  // in-flight mirror would otherwise snap the filing back and win the 409
  // recovery with the OLD target.
  writeShared([{ id: 'mRe', authorTraveler: 'helen', visibility: 'shared', caption: 'c', stopId: 'first-target', updatedAt: '2026-07-05T08:00:00.000Z', serverUpdatedAt: '2026-07-05T07:00:00.000Z' }])
  memoryQueue._resetForTest()
  memoryQueue.markUnsynced({ kind: 'move', memoryId: 'mRe', stopId: 'first-target', author: 'helen' })

  updateMemoryStop('mRe', 'second-target')

  assert.equal(memoryQueue.getIntent('mRe', 'move').stopId, 'second-target', 'the stored target IS the latest decision from the moment it is made')
  const { sync, calls } = makeSync({ fresh: [], push: (r) => ({ ...r, updatedAt: '2026-07-05T10:00:00.000Z' }) })
  await drainMemorySyncQueue({ sync })
  assert.deepEqual(calls.push.map((p) => p.rec.stopId), ['second-target'], 'the superseded decision never reaches the family')
  assert.equal(getById('mRe').stopId, 'second-target', 'no snap-back to the stale target')
  assert.equal(memoryQueue.isUnsynced('mRe'), false, 'worker-confirmed → settled')
})

test('drain: an intent superseded MID-DRAIN is skipped — a decision made while the drain runs is never replayed stale', async () => {
  writeShared([
    { id: 'mA2', authorTraveler: 'helen', visibility: 'shared', caption: 'a', updatedAt: '2026-07-05T08:00:00.000Z' },
    { id: 'mB2', authorTraveler: 'helen', visibility: 'shared', caption: 'b', stopId: 'old-target', updatedAt: '2026-07-05T08:00:00.000Z' },
  ])
  memoryQueue._resetForTest()
  memoryQueue.markUnsynced({ kind: 'save', memoryId: 'mA2', author: 'helen' })
  memoryQueue.markUnsynced({ kind: 'move', memoryId: 'mB2', stopId: 'old-target', author: 'helen' })
  const { sync, calls } = makeSync({
    fresh: [],
    push: (r) => {
      // The user re-decides mB2 WHILE the drain is replaying mA2.
      if (r.id === 'mA2') updateMemoryStop('mB2', 'new-target')
      return { ...r, updatedAt: '2026-07-05T10:00:00.000Z' }
    },
  })

  await drainMemorySyncQueue({ sync })

  assert.deepEqual(calls.push.map((p) => p.rec.id), ['mA2'], 'the superseded move is not replayed from the snapshot')
  assert.equal(getById('mB2').stopId, 'new-target', 'the newer decision stands locally')
  assert.equal(memoryQueue.getIntent('mB2', 'move').stopId, 'new-target', 'and still owns the queue entry for its own mirror to settle')
})

test('drain: a replay this device cannot authenticate (no credential for the author) is skipped quietly — owed, never churned', async () => {
  // A cross-author refile from a one-person device: the push runs AS the
  // record's author, and with no credential for them every replay is a
  // guaranteed 401 — one doomed request per intent per heartbeat, forever.
  writeShared([
    { id: 'mCred', authorTraveler: 'helen', visibility: 'shared', caption: 'h', updatedAt: '2026-07-05T08:00:00.000Z' },
    { id: 'mAnon', visibility: 'shared', caption: 'anon', updatedAt: '2026-07-05T08:00:00.000Z' },
  ])
  memoryQueue._resetForTest()
  memoryQueue.markUnsynced({ kind: 'save', memoryId: 'mCred', author: 'helen' })
  memoryQueue.markUnsynced({ kind: 'save', memoryId: 'mAnon', author: null })
  const outcomes = []
  const off = memoryQueue.subscribeOutcomes((id, o) => outcomes.push([id, o]))
  const blocked = makeSync({ fresh: [], push: (r) => ({ ...r, updatedAt: '2026-07-05T10:00:00.000Z' }) })
  blocked.sync.hasCredential = (t) => t !== 'helen'

  const res = await drainMemorySyncQueue({ sync: blocked.sync })

  assert.deepEqual(blocked.calls.push.map((p) => p.rec.id), ['mAnon'], 'an author-less record still drains (it pushes as the active traveler)')
  assert.equal(memoryQueue.isUnsynced('mCred'), true, 'the cross-author edit stays owed — nothing dropped, nothing lied about')
  assert.equal(outcomes.some(([id]) => id === 'mCred'), false, 'and no churn signal — nothing changed')
  assert.equal(res.settled, 1)

  // The author's session is enrolled later → the very next drain lands it.
  const allowed = makeSync({ fresh: [], push: (r) => ({ ...r, updatedAt: '2026-07-05T11:00:00.000Z' }) })
  allowed.sync.hasCredential = () => true
  await drainMemorySyncQueue({ sync: allowed.sync })
  off()
  assert.equal(memoryQueue.isUnsynced('mCred'), false, 'lands once the device can act as the author')
})
