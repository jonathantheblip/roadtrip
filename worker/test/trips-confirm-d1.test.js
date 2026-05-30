// Unit 6 — the confirm→D1 integration leg.
// TEST_STRATEGY_SPEC.md §3 Unit 6.
//
// THE GAP THIS CLOSES: the M2 card flow asserts confirm→localStorage with the
// /trips worker push MOCKED (404/200). The leg that is the actual point of the
// feature — Helen's confirmed edit landing in the real backend — was never
// exercised. This drives a confirmation-card commit through the REAL worker to
// a REAL (miniflare) D1 binding and reads the change straight back out of D1,
// not assumed.
//
// THE SEAM: on confirm, the client applies the card edit to the trip snapshot
// and pushes the whole updated trip — ConfirmCard → tripsApi.upsertTrip →
// workerSync.pushTrip → `POST /trips` with JSON.stringify(trip)
// (app/src/lib/workerSync.js:215). postTrip() upserts it
// (ON CONFLICT(id) DO UPDATE) into trips.data_json (worker/src/index.js:431).
// This test drives the worker end of that seam under miniflare (Unit 4's
// pattern) + applySchema(env.DB) (Unit 1's real-D1 binding).
//
// BOUNDED (governing rule): one happy-path round-trip — a confirmed edit
// persists and reads back, as an upsert (not a duplicate row). NOT a
// real-backend suite. See the escalation tripwires at the bottom for the
// signals that the one-test approach is exhausted.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'

// Push a trip exactly as the client does on confirm: POST /trips, full trip
// JSON, family bearer token. Goes through the real worker (auth + routing +
// handler), not a direct handler call.
async function pushTrip(trip) {
  const testEnv = { ...env, DB: env.DB, FAMILY_TOKEN_HELEN: 'test-token' }
  const req = new Request('https://worker.test/trips', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'content-type': 'application/json',
      Origin: 'http://localhost:5173',
    },
    body: JSON.stringify(trip),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, testEnv, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

// Read the persisted row straight out of the real D1 binding — the literal
// "is it actually in D1" check, distinct from trusting the POST's 200.
function readTripRow(id) {
  return env.DB.prepare(
    'SELECT id, data_json, updated_at, deleted_at FROM trips WHERE id = ?'
  )
    .bind(id)
    .first()
}

function countTripRows(id) {
  return env.DB.prepare('SELECT COUNT(*) AS n FROM trips WHERE id = ?')
    .bind(id)
    .first()
}

// A minimal trip in the app's shape — enough that a card edit (moving a stop's
// time) is visible in data_json. The worker stores the whole object as JSON
// and only requires `id`, so the shape need not be exhaustive.
function baseTrip() {
  return {
    id: 'u6-volleyball',
    title: 'Fun @ the Sun',
    dateRangeStart: '2026-05-22',
    dateRangeEnd: '2026-05-25',
    endCity: 'Belmont, MA',
    days: [
      {
        n: 2,
        date: 'Sat May 23',
        isoDate: '2026-05-23',
        stops: [
          { id: 'vb2-3', time: '3:45 PM', name: 'vs BEV 13 Empire', kind: 'tournament' },
        ],
      },
    ],
  }
}

describe('Unit 6 — confirm → /trips write → real-D1 round-trip', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
  })

  it('persists a confirmed card edit to real D1 and reads the change back', async () => {
    // 1. Prior state — the trip already lives in D1 (Helen's trip before the edit).
    const seedRes = await pushTrip(baseTrip())
    expect(seedRes.status).toBe(200)
    expect(await seedRes.json()).toEqual({ ok: true, id: 'u6-volleyball' })

    const before = await readTripRow('u6-volleyball')
    expect(before).not.toBeNull()
    expect(JSON.parse(before.data_json).days[0].stops[0].time).toBe('3:45 PM')

    // 2. Confirm a "move" card: the client applies the edit to the trip
    //    snapshot and pushes the whole updated trip. Move the 3:45 match to 5:00.
    const edited = baseTrip()
    edited.days[0].stops[0].time = '5:00 PM'
    const confirmRes = await pushTrip(edited)
    expect(confirmRes.status).toBe(200)

    // 3. Round-trip: the edit is ACTUALLY in D1, read straight from the binding.
    const after = await readTripRow('u6-volleyball')
    expect(after).not.toBeNull()
    const persisted = JSON.parse(after.data_json)
    expect(persisted.days[0].stops[0].time).toBe('5:00 PM') // the edit landed
    expect(after.deleted_at).toBeNull() // live row, not tombstoned

    // 4. Upsert, not duplicate: a card edit UPDATES the existing trip row
    //    (ON CONFLICT(id) DO UPDATE — one trip id is exactly one row).
    const { n } = await countTripRows('u6-volleyball')
    expect(n).toBe(1)
    expect(after.updated_at).toBeGreaterThanOrEqual(before.updated_at)
  })
})

// ── ESCALATION TRIPWIRES ────────────────────────────────────────────────────
// This is deliberately ONE happy-path round-trip, not a real-backend suite
// (governing rule). It guards the leg the M2 card flow never exercised: the
// confirm actually landing in D1. If ANY of the following fire, the one-test
// approach is exhausted and a real-backend integration suite is warranted —
// this comment is the handoff so the next person knows the difference between
// "the one test is fine" and "we've hit the bigger thing":
//
//   1. ISOLATION PRESSURE. This test stays isolated on a single
//      `beforeEach(applySchema)` today. The moment a case needs per-case
//      backend state setup/teardown — seeding or scrubbing specific rows so
//      one case doesn't bleed into the next — the happy-path-only design is
//      fighting reality, and the suite needs real fixtures + lifecycle.
//
//   2. A D1 WRITE BUG SHIPS THAT THIS HAPPY PATH STRUCTURALLY CAN'T SEE.
//      Specifically:
//        - concurrent-write races: two confirms on the same trip id racing the
//          ON CONFLICT upsert (last-writer-wins is assumed, never tested);
//        - partial-write failures: a write that half-applies and leaves the
//          row inconsistent;
//        - the SOFT-DELETE / TOMBSTONE path: deleteTrip() sets deleted_at and
//          getTrips() filters `deleted_at IS NULL`, while postTrip() RESETS
//          deleted_at=NULL on re-upsert. That delete→revive logic (the door
//          the data-cleanup work deliberately went through) is real and this
//          happy path never touches it.
//
//   3. CONFIRM→D1 GROWS BRANCHES. Multi-edit transactionality (one confirm
//      carrying several edits that must apply atomically) or
//      rollback-on-partial-failure. One test can't cover those without
//      becoming several — at which point this file should become a suite.
//
// Until one of these fires, this single round-trip is the right amount of
// coverage for the confirm→D1 leg.
