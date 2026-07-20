// christenExecute.test.mjs — TRUTH-CRITICAL: the executor honors christenPlan's ordering
// + failure semantics. These pin the guarantees that keep real family photos from moving
// wrongly when PHOTO_CONFIRM_MODE flips: a filing NEVER precedes the trip-ack (#5 orphan),
// a trip-push fail DEGRADES to words-only (never files/posts a christening, #4 honest-copy),
// masking DEFERS the whole write, a confirm-POST fail is QUEUED not fatal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { executeChristenPlan } from '../../src/lib/christenExecute.js'

// A deps recorder: every effect appends [verb, detail] so tests can assert ORDER + presence.
const rec = (over = {}) => {
  const calls = []
  return {
    calls,
    mutateTrip: over.mutateTrip || (async () => { calls.push(['mutate']) }),
    fileMemory: (f) => { calls.push(['file', f.memoryId]) },
    stampGps: () => { calls.push(['gps']) },
    postConfirm: over.postConfirm || (async (b) => { calls.push(['post', b?.action]); return true }),
    queueRetry: () => { calls.push(['queue']) },
    deferForReveal: () => { calls.push(['defer']) },
  }
}

// christenPlan-shaped fixtures (matching the real step shapes + tokens).
const christenSteps = () => [
  { step: 'trip-mutate', op: 'append-stop', stop: { id: 'cl-1-x', name: 'the jetty spot' }, via: 'pushTrip', awaitAck: true },
  { step: 'file-photos', filings: [{ memoryId: 'm1', stopId: 'cl-1-x', prov: { source: 'confirmed' } }], gpsStamps: [], via: 'updateMemoryStop', requires: ['trip-ack'] },
  { step: 'confirm-post', body: { action: 'confirmed', trip: 't1', guessedPlaceId: 'cl-1-x' }, via: 'POST /heal-confirm', requires: ['trip-ack', 'file-photos'], onFail: 'queue-retry' },
]
const christenPlanFx = (over = {}) => ({
  decision: 'christen',
  createdStop: { id: 'cl-1-x', name: 'the jetty spot' },
  steps: christenSteps(),
  masking: { deferred: false },
  degraded: { trigger: 'trip-push-terminal-fail', post: { action: 'corrected', trip: 't1', words: 'the jetty spot' }, receipt: { key: 's1.freetext.kept', text: 'Kept your words' } },
  receipt: { active: 'christened' },
  ...over,
})
const pickPlanFx = () => ({
  decision: 'pick',
  createdStop: null,
  steps: [
    { step: 'file-photos', filings: [{ memoryId: 'm1', stopId: 's-cove', prov: { source: 'confirmed' } }], gpsStamps: [], requires: [] },
    { step: 'confirm-post', body: { action: 'picked', trip: 't1' }, requires: ['file-photos'], onFail: 'queue-retry' },
  ],
  masking: { deferred: false },
  receipt: { active: 'picked' },
})

test('SKIP: empty-field plan writes nothing anywhere', async () => {
  const d = rec()
  const r = await executeChristenPlan({ decision: 'skip' }, d)
  assert.equal(r.status, 'skip')
  assert.equal(r.wrote, false)
  assert.deepEqual(d.calls, [])
})

test('ORDERING (#5 orphan): a christening files ONLY after the trip-ack, POSTs only after both', async () => {
  const d = rec()
  const r = await executeChristenPlan(christenPlanFx(), d)
  assert.equal(r.status, 'done')
  assert.equal(r.wrote, true)
  // the ONLY acceptable order: mutate (→trip-ack) → file → post. No filing before the ack.
  assert.deepEqual(d.calls.map((c) => c[0]), ['mutate', 'file', 'post'])
  assert.equal(d.calls.find((c) => c[0] === 'post')[1], 'confirmed') // 'confirmed', not 'corrected'
})

test('ORDERING is ENFORCED, not merely followed: file-photos requiring trip-ack with no trip-mutate step → BLOCKED, nothing filed', async () => {
  const d = rec()
  // a malformed plan: file-photos still requires 'trip-ack' but no trip-mutate produces it.
  const bad = christenPlanFx({ steps: christenSteps().slice(1) }) // drop the trip-mutate step
  const r = await executeChristenPlan(bad, d)
  assert.equal(r.status, 'blocked')
  assert.equal(r.at, 'file-photos')
  assert.ok(!d.calls.some((c) => c[0] === 'file'), 'no photo was filed to an un-synced id')
})

test('DEGRADED: a terminal trip-push failure → no filing, no christening POST; words fall back to the S1 free-text', async () => {
  const d = rec({ mutateTrip: async () => { throw new Error('sync terminal fail') } })
  const r = await executeChristenPlan(christenPlanFx(), d)
  assert.equal(r.status, 'degraded')
  assert.equal(r.wrote, false)
  assert.ok(!d.calls.some((c) => c[0] === 'file'), 'NEVER files a christening whose stop did not sync')
  // the degraded words-only POST fired (a 'corrected' free-text, not the christening 'confirmed')
  const post = d.calls.find((c) => c[0] === 'post')
  assert.ok(post && post[1] === 'corrected', 'the degraded path posts the S1 words-only correction')
  assert.equal(r.receipt.key, 's1.freetext.kept') // the honest S1 copy, never the christening receipt
})

test('MASKING: a masked christening defers the WHOLE write to the reveal — nothing hits the agenda now', async () => {
  const d = rec()
  const r = await executeChristenPlan(christenPlanFx({ masking: { deferred: true } }), d)
  assert.equal(r.status, 'deferred')
  assert.equal(r.wrote, false)
  assert.deepEqual(d.calls.map((c) => c[0]), ['defer']) // no mutate/file/post
})

test('POST failure is QUEUED, never fatal: the filings stand, the confirm is retried', async () => {
  const d = rec({ postConfirm: async () => false })
  const r = await executeChristenPlan(christenPlanFx(), d)
  assert.equal(r.status, 'done')
  assert.equal(r.wrote, true) // the photos are filed (the trip synced, the filing stood)
  assert.ok(d.calls.some((c) => c[0] === 'queue'), 'the failed POST is enqueued for the sync-honesty retry')
})

test('PICK: an existing-stop collapse files then POSTs, never mutates the trip (no twin stop)', async () => {
  const d = rec()
  const r = await executeChristenPlan(pickPlanFx(), d)
  assert.equal(r.status, 'done')
  assert.ok(!d.calls.some((c) => c[0] === 'mutate'), 'a PICK never appends a stop')
  assert.deepEqual(d.calls.map((c) => c[0]), ['file', 'post'])
})

// ── review findings (root cause: an effect must ACTUALLY happen, not just be marked) ──
test('REVIEW #1: a MISSING mutateTrip must NOT fake the ack — degrade honestly, never file to an un-synced id', async () => {
  const d = rec()
  delete d.mutateTrip // host forgot the truth-critical dep
  const r = await executeChristenPlan(christenPlanFx(), d)
  assert.equal(r.status, 'degraded')
  assert.equal(r.wrote, false)
  assert.ok(!d.calls.some((c) => c[0] === 'file'), 'NEVER files photos to a stop that was never synced')
  assert.equal(r.receipt.key, 's1.freetext.kept') // honest words-kept, never a christening success
})

test('REVIEW #2: a MISSING fileMemory must NOT report wrote:true — no lying success with zero filings', async () => {
  const d = rec()
  delete d.fileMemory
  const r = await executeChristenPlan(christenPlanFx(), d)
  assert.equal(r.status, 'error')
  assert.equal(r.wrote, false)
  assert.equal(r.filed, 0)
  assert.ok(!d.calls.some((c) => c[0] === 'post'), 'never POSTs a confirm for photos that were not filed')
})

test('REVIEW #3: a TORN file-photos write (one memory throws mid-loop) surfaces PARTIAL — not a clean done nor a retry-inviting error', async () => {
  let n = 0
  const d = rec()
  d.fileMemory = () => { n += 1; if (n === 2) throw new Error('memory not in store'); d.calls.push(['file', n]) }
  const three = christenPlanFx()
  three.steps[1].filings = [{ memoryId: 'm1' }, { memoryId: 'm2' }, { memoryId: 'm3' }]
  const r = await executeChristenPlan(three, d)
  assert.equal(r.status, 'partial')
  assert.equal(r.filed, 1) // m1 landed + D13-locked; the tear is surfaced, not hidden
  assert.equal(r.wrote, true)
  assert.ok(!d.calls.some((c) => c[0] === 'post'), 'a torn write does not silently POST a partial confirm')
})
