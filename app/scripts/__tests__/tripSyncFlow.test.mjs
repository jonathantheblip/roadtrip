// Unit tests for tripSyncFlow — the client half of honest trip sync (batch A-1:
// F1 conflict recovery, F2 stuck-note wording, F5 heartbeat ordering, F6 pull
// watchdog). Everything under test is pure or dependency-injected, so every
// branch runs with stub push/pull — no browser, no network.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  TRIP_CONFLICT_RETRIES,
  TRIP_PUSH_STALE_MS,
  baseToEpochMs,
  tripWireBody,
  tripContentJson,
  mergeTripOverFresh,
  resolveTripPushConflict,
  pendingTripPushNote,
  runSyncBeat,
  pullWatchdogSignal,
} = await import('../../src/lib/tripSyncFlow.js')

// ── tripWireBody (the F1 client line — the one pushTrip itself can't pin) ────

test('tripWireBody: strips serverUpdatedAt and re-sends it as the OCC base', () => {
  const body = tripWireBody({ id: 't1', title: 'Cabin week', serverUpdatedAt: 123 })
  assert.equal(body.serverUpdatedAt, undefined) // bookkeeping never lands in data_json
  assert.equal(body.baseUpdatedAt, 123) // the 409 guard engages
  assert.equal(body.title, 'Cabin week')
})

test('tripWireBody: a DRAFT push is deliberately base-less (create/recover semantics)', () => {
  const body = tripWireBody({ id: 't1', draft: true, serverUpdatedAt: 123 })
  assert.equal('baseUpdatedAt' in body, false)
  assert.equal(body.serverUpdatedAt, undefined)
  assert.equal(body.draft, true)
})

test('tripWireBody: a never-synced trip sends no base (safe create, worker stays LWW)', () => {
  const body = tripWireBody({ id: 't1', title: 'new' })
  assert.equal('baseUpdatedAt' in body, false)
})

test('tripWireBody: an ISO stamp converts to epoch ms; garbage is omitted', () => {
  const iso = '2026-07-05T00:00:00.000Z'
  assert.equal(tripWireBody({ id: 't1', serverUpdatedAt: iso }).baseUpdatedAt, Date.parse(iso))
  assert.equal('baseUpdatedAt' in tripWireBody({ id: 't1', serverUpdatedAt: 'garbage' }), false)
  assert.ok(Number.isNaN(baseToEpochMs(undefined)))
  assert.ok(Number.isNaN(baseToEpochMs('')))
})

// ── tripContentJson ──────────────────────────────────────────────────────────

test('tripContentJson: copies differing only by serverUpdatedAt are the same content', () => {
  const a = { id: 't1', title: 'Cabin week', serverUpdatedAt: 100 }
  const b = { id: 't1', title: 'Cabin week', serverUpdatedAt: 999 }
  const c = { id: 't1', title: 'Cabin week' }
  assert.equal(tripContentJson(a), tripContentJson(b))
  assert.equal(tripContentJson(a), tripContentJson(c))
})

test('tripContentJson: a real content change still reads as different', () => {
  const a = { id: 't1', title: 'Cabin week', serverUpdatedAt: 100 }
  const b = { id: 't1', title: 'Beach week', serverUpdatedAt: 100 }
  assert.notEqual(tripContentJson(a), tripContentJson(b))
})

// ── mergeTripOverFresh ───────────────────────────────────────────────────────

test('mergeTripOverFresh: the local edit wins every field it carries', () => {
  const local = { id: 't1', title: 'LOCAL title', days: [{ isoDate: '2026-07-04' }], serverUpdatedAt: 100 }
  const fresh = { id: 't1', title: 'remote title', days: [{ isoDate: '2026-07-05' }], serverUpdatedAt: 200 }
  const merged = mergeTripOverFresh(local, fresh)
  assert.equal(merged.title, 'LOCAL title')
  assert.deepEqual(merged.days, [{ isoDate: '2026-07-04' }]) // whole-object contract: no deep merge
})

test('mergeTripOverFresh: fresh-only fields survive and the fresh base is adopted', () => {
  const local = { id: 't1', title: 'LOCAL', serverUpdatedAt: 100 }
  const fresh = { id: 't1', title: 'remote', heroResolved: { key: 'k' }, serverUpdatedAt: 200 }
  const merged = mergeTripOverFresh(local, fresh)
  assert.deepEqual(merged.heroResolved, { key: 'k' }) // worker enrichment carried forward
  assert.equal(merged.serverUpdatedAt, 200) // NEVER the local stale base
})

// ── resolveTripPushConflict ──────────────────────────────────────────────────

const TRIP = { id: 't1', title: 'LOCAL edit', serverUpdatedAt: 100 }

test('conflict recovery: reapplies on the fresh base and lands (synced)', async () => {
  const pushes = []
  const out = await resolveTripPushConflict({
    trip: TRIP,
    push: async (t) => { pushes.push(t); return { ok: true, id: t.id, updatedAt: 300 } },
    pull: async () => [{ id: 't1', title: 'remote edit', extra: 'from-remote', serverUpdatedAt: 200 }],
  })
  assert.equal(out.status, 'synced')
  assert.equal(pushes.length, 1)
  assert.equal(pushes[0].title, 'LOCAL edit') // the deliberate edit won
  assert.equal(pushes[0].extra, 'from-remote') // fresh-only field carried
  assert.equal(pushes[0].serverUpdatedAt, 200) // pushed against the FRESH base
  assert.equal(out.trip.serverUpdatedAt, 300) // the new stamp rides back
})

test('conflict recovery: still conflicting after the bounded retries stays pending (never dropped, never blind)', async () => {
  let pulls = 0
  const err = Object.assign(new Error('worker 409'), { status: 409 })
  const out = await resolveTripPushConflict({
    trip: TRIP,
    push: async () => { throw err },
    pull: async () => { pulls += 1; return [{ id: 't1', title: 'remote', serverUpdatedAt: 200 + pulls }] },
  })
  assert.equal(out.status, 'pending')
  assert.equal(pulls, TRIP_CONFLICT_RETRIES + 1) // bounded — one pull per attempt
})

test('conflict recovery: pull absence is NOT read as deleted — the push retries on the 409-taught stored stamp (the publish-after-set-aside shape)', async () => {
  // Live→draft→publish: the stored row is draft:true (withheld from every
  // pull) and the publish 409'd with the row's stamp. The recovery must land
  // the publish on that stamp — inferring "deleted" from absence here used to
  // destroy the trip (adoptFamilyDelete dropped the only readable copy).
  const pushes = []
  const out = await resolveTripPushConflict({
    trip: { id: 't1', title: 'published', serverUpdatedAt: 100 },
    storedUpdatedAt: 555,
    push: async (t) => { pushes.push(t); return { ok: true, id: t.id, updatedAt: 700 } },
    pull: async () => [{ id: 'other-trip', serverUpdatedAt: 5 }],
  })
  assert.equal(out.status, 'synced')
  assert.equal(pushes.length, 1)
  assert.equal(pushes[0].serverUpdatedAt, 555) // based on the stamp the 409 taught, never blind
  assert.equal(out.trip.serverUpdatedAt, 700)
})

test('conflict recovery: absence resolves to deleted ONLY via the worker tombstone answer', async () => {
  // A genuinely-deleted trip is also absent from the pull — but the proof is
  // the tombstone guard refusing the retry with deleted:true, never the
  // absence itself (absence also covers live rows the pull withholds).
  const err = Object.assign(new Error('worker 409'), {
    status: 409,
    body: { error: 'conflict', deleted: true, storedUpdatedAt: 555 },
  })
  const out = await resolveTripPushConflict({
    trip: TRIP,
    storedUpdatedAt: 555,
    push: async () => { throw err },
    pull: async () => [],
  })
  assert.equal(out.status, 'deleted')
})

test('conflict recovery: absence with no known stored stamp stays pending — never a guessed delete, never a blind base-less push', async () => {
  const out = await resolveTripPushConflict({
    trip: TRIP,
    push: async () => { throw new Error('must not push') },
    pull: async () => [{ id: 'other-trip', serverUpdatedAt: 5 }],
  })
  assert.equal(out.status, 'pending')
})

test('conflict recovery: a mid-recovery plain 409 teaches the newer stored stamp for a later absent pull', async () => {
  // Attempt 1 finds the trip but the push races another save (plain 409 with
  // the newer stamp); attempt 2's pull no longer serves the row (it went
  // draft mid-recovery). The retry must ride the attempt-1 stamp.
  const pushes = []
  let attempt = 0
  const race = Object.assign(new Error('worker 409'), {
    status: 409,
    body: { error: 'conflict', storedUpdatedAt: 600 },
  })
  const out = await resolveTripPushConflict({
    trip: TRIP,
    push: async (t) => {
      pushes.push(t)
      if (pushes.length === 1) throw race
      return { ok: true, updatedAt: 900 }
    },
    pull: async () => {
      attempt += 1
      return attempt === 1 ? [{ id: 't1', title: 'remote', serverUpdatedAt: 200 }] : []
    },
  })
  assert.equal(out.status, 'synced')
  assert.equal(pushes[1].serverUpdatedAt, 600) // the taught stamp, not the stale pull base
})

test('conflict recovery: a DRAFT absent from the pull is refused, never read as deleted', async () => {
  // Drafts are filtered from every pull — absence proves nothing, and a pull
  // can never teach a draft a fresh base; it dequeues with the local copy kept.
  const out = await resolveTripPushConflict({
    trip: { ...TRIP, draft: true },
    push: async () => { throw new Error('must not push') },
    pull: async () => [],
  })
  assert.equal(out.status, 'refused')
})

test('conflict recovery: a 409 carrying deleted:true adopts the delete mid-retry', async () => {
  const err = Object.assign(new Error('worker 409'), { status: 409, body: { error: 'conflict', deleted: true } })
  const out = await resolveTripPushConflict({
    trip: TRIP,
    push: async () => { throw err },
    pull: async () => [{ id: 't1', title: 'remote', serverUpdatedAt: 200 }],
  })
  assert.equal(out.status, 'deleted')
})

test('conflict recovery: transient pull failures leave the edit pending', async () => {
  const failedPull = []
  failedPull.errors = ['network down']
  for (const pull of [async () => failedPull, async () => { throw new Error('offline') }]) {
    const out = await resolveTripPushConflict({ trip: TRIP, push: async () => ({}), pull })
    assert.equal(out.status, 'pending')
  }
})

test('conflict recovery: a masked stand-in or a worker skip is refused, not retried', async () => {
  const masked = await resolveTripPushConflict({
    trip: TRIP,
    push: async () => { throw new Error('must not push') },
    pull: async () => [{ id: 't1', masked: true }],
  })
  assert.equal(masked.status, 'refused')
  const skipped = await resolveTripPushConflict({
    trip: TRIP,
    push: async () => ({ ok: true, skipped: 'masked-projection' }),
    pull: async () => [{ id: 't1', title: 'remote', serverUpdatedAt: 200 }],
  })
  assert.equal(skipped.status, 'refused')
})

test('conflict recovery: pulls AS the queued edit author', async () => {
  const seen = []
  await resolveTripPushConflict({
    trip: TRIP,
    asTraveler: 'helen',
    push: async () => ({ ok: true, updatedAt: 300 }),
    pull: async ({ asTraveler }) => { seen.push(asTraveler); return [{ id: 't1', serverUpdatedAt: 200 }] },
  })
  assert.deepEqual(seen, ['helen'])
})

// ── pendingTripPushNote ──────────────────────────────────────────────────────

test('pendingTripPushNote: silent when nothing is pending', () => {
  assert.equal(pendingTripPushNote(0, null), null)
  assert.equal(pendingTripPushNote(undefined, null), null)
})

test('pendingTripPushNote: young edits read as in flight', () => {
  const now = 1_000_000_000
  assert.equal(pendingTripPushNote(1, now - 5000, now), 'A change is still reaching the family…')
  assert.equal(pendingTripPushNote(3, now - 5000, now), '3 changes are still reaching the family…')
})

test('pendingTripPushNote: an edit stuck past the threshold reads differently', () => {
  const now = 1_000_000_000
  const oldest = now - TRIP_PUSH_STALE_MS - 1
  assert.equal(pendingTripPushNote(1, oldest, now), "A change hasn't reached the family yet — still trying.")
  assert.equal(pendingTripPushNote(2, oldest, now), "2 changes haven't reached the family yet — still trying.")
})

test('pendingTripPushNote: an unknown age errs toward stuck, never false calm', () => {
  assert.match(pendingTripPushNote(1, null, Date.now()), /hasn't reached the family yet/)
})

// ── runSyncBeat (F5 ordering) ────────────────────────────────────────────────

test('runSyncBeat: the pull waits for the push half to finish', async () => {
  const log = []
  let releaseResync
  const gate = new Promise((resolve) => { releaseResync = resolve })
  const beat = runSyncBeat({
    resync: async () => { log.push('resync:start'); await gate; log.push('resync:done') },
    refresh: async () => { log.push('refresh') },
  })
  await Promise.resolve() // give the beat a microtask — refresh must NOT have run
  assert.deepEqual(log, ['resync:start'])
  releaseResync()
  await beat
  assert.deepEqual(log, ['resync:start', 'resync:done', 'refresh'])
})

test('runSyncBeat: a failed resync never blocks the pull', async () => {
  const log = []
  await runSyncBeat({
    resync: async () => { throw new Error('push failed') },
    refresh: async () => { log.push('refresh') },
  })
  assert.deepEqual(log, ['refresh'])
})

test('runSyncBeat: shouldContinue false (unmounted) skips the pull', async () => {
  const log = []
  await runSyncBeat({
    resync: async () => {},
    refresh: async () => { log.push('refresh') },
    shouldContinue: () => false,
  })
  assert.deepEqual(log, [])
})

// ── pullWatchdogSignal (F6) ──────────────────────────────────────────────────

test('pullWatchdogSignal: returns a live AbortSignal that fires after the deadline', async () => {
  const signal = pullWatchdogSignal(20)
  assert.ok(signal instanceof AbortSignal) // node ≥17.3 has AbortSignal.timeout, like the family fleet
  assert.equal(signal.aborted, false)
  await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
  assert.equal(signal.aborted, true)
})
