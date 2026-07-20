// christenPlan.js — the F2 christening WRITE-PLAN. Lesson-asserting tests for the
// enumerated O4 christening tests (BUILD_SPECS_GLANCE_ENGINE.md lines 156-166) plus
// the A9 multidimensional collapse guard, masking deferral, delete-after-filing, the
// no-day degrade, and the flip-blocker-#3 invariant (action 'confirmed', never
// 'corrected'). Pure — no browser, no fetch, no writes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { christenPlan, releaseChristenedStop, resolveCollapse, nameDice, metersBetween } from '../../src/lib/christenPlan.js'
import { isFilablePlace } from '../../src/lib/confirmSurface.js'
import { isFilableStop } from '../../../worker/src/confirmFeedback.js'

// --- fixtures -----------------------------------------------------------------
// Provincetown-shaped: two geocoded day stops ~1.2km apart (far enough that coords
// CONTRADICT across them, so a name typed at the wrong one christens distinct).
const TRIP = {
  id: 'trip1',
  days: [
    {
      isoDate: '2026-07-02',
      stops: [
        { id: 's-angel', name: 'Angel Foods', lat: 42.05, lng: -70.18 },
        { id: 's-townbeach', name: 'Town Beach', lat: 42.061, lng: -70.19 },
      ],
    },
  ],
}
const MEMS = new Map([
  ['m1', { photoRef: { key: 'k1' } }],
  ['m2', { photoRef: { key: 'k2' } }],
])
// The family tapped "somewhere else" from a card guessing Town Beach → Town Beach is
// the DECLINED candidate. coords null unless a test supplies them.
const moment = (over = {}) => ({
  memoryIds: ['m1', 'm2'],
  isoDate: '2026-07-02',
  placeId: 's-townbeach',
  place: 'Town Beach',
  kind: 'A',
  ...over,
})
const idMaker = (dayN) => `cl-${dayN}-fixed`
const base = (over = {}) => ({ trip: TRIP, newStopId: idMaker, now: 1000, memoryById: MEMS, traveler: 'helen', ...over })

// ============================================================================
// Test #1 — empty field → zero writes anywhere (skip-identical)
// ============================================================================
test('#1 empty / whitespace name → SKIP: zero writes, no stop, no POST, residue-free', () => {
  for (const name of ['', '   ', '\n\t', undefined, null]) {
    const p = christenPlan(base({ moment: moment(), name }))
    assert.equal(p.decision, 'skip')
    assert.equal(p.createdStop, null)
    assert.deepEqual(p.filings, [])
    assert.deepEqual(p.gpsStamps, [])
    assert.equal(p.post, null)
    assert.deepEqual(p.steps, [])
  }
})

// ============================================================================
// Test #2 — the A9 collapse guard: a NAME match alone NEVER collapses
// ============================================================================
test('#2 name match + AGREEING location → PICK the existing stop (no twin)', () => {
  // Type "Angel Foods" with coords near s-angel; s-angel is NOT the declined guess.
  const p = christenPlan(base({ moment: moment({ coords: { lat: 42.0501, lng: -70.1801 } }), name: 'Angel Foods' }))
  assert.equal(p.decision, 'pick')
  assert.equal(p.collapseTo.stopId, 's-angel')
  assert.equal(p.createdStop, null) // never mint a twin
  assert.match(p.citation, /name \+ location/)
  assert.ok(p.filings.length && p.filings.every((f) => f.stopId === 's-angel'))
})

test('#2 name match + CONTRADICTING coords (far) → christen a DISTINCT stop', () => {
  // "Angel Foods" typed but the moment's coords sit at the far Town Beach → contradiction.
  const p = christenPlan(base({ moment: moment({ coords: { lat: 42.061, lng: -70.19 } }), name: 'Angel Foods' }))
  assert.equal(p.decision, 'christen')
  assert.equal(p.createdStop.name, 'Angel Foods')
  assert.match(p.citation, /exists now/)
  assert.equal(p.dimensions.contradiction, true)
})

test('#2 name match but SILENT on every other dimension → christen distinct (AUDIT-1: silence is not corroboration)', () => {
  // No coords, no exemplar agreement → the name alone must NOT collapse.
  const p = christenPlan(base({ moment: moment(), name: 'Angel Foods' }))
  assert.equal(p.decision, 'christen')
  assert.equal(p.createdStop.name, 'Angel Foods')
})

test('#2 a DECLINED candidate can never collapse-collect (contradicted-by-human-act)', () => {
  // The family tapped past Town Beach, then typed "Town Beach" with agreeing coords.
  // It must NOT collapse back onto the very stop they declined → christen distinct.
  const p = christenPlan(base({ moment: moment({ coords: { lat: 42.061, lng: -70.19 } }), name: 'Town Beach' }))
  assert.equal(p.decision, 'christen')
  assert.equal(p.createdStop.name, 'Town Beach')
})

test('#2 collapse via a lookalike/exemplar agreement (no coords) → PICK', () => {
  // caller supplies the vision-corpus agreement the pure layer cannot compute itself.
  const candidates = [{ id: 's-angel', name: 'Angel Foods', coords: null, exemplarAgree: true }]
  const p = christenPlan(base({ moment: moment({ placeId: 's-townbeach' }), name: 'Angel Foods', candidates }))
  assert.equal(p.decision, 'pick')
  assert.equal(p.collapseTo.stopId, 's-angel')
  assert.match(p.citation, /name \+ lookalike/)
})

test('#2 kind-word name is recorded (placeType never counts as the agreeing dimension)', () => {
  // "the beach" strongly name-matches "Town Beach", but with silence elsewhere it must
  // christen distinct (the founding lesson: "the beach" at a different beach).
  const r = resolveCollapse('the beach', moment({ placeId: 's-angel' }), [{ id: 's-townbeach', name: 'Town Beach', coords: null }])
  assert.equal(r.collapse, false)
  assert.equal(r.dimensions.nameIsKindWord, true)
})

// ============================================================================
// Test #3 — ordering: trip-ack BEFORE filing BEFORE the confirm POST (#5 orphan lesson)
// ============================================================================
test('#3 the plan encodes the strict order trip-mutate(ack) → file → POST', () => {
  const p = christenPlan(base({ moment: moment(), name: 'the jetty spot' }))
  assert.equal(p.decision, 'christen')
  assert.deepEqual(p.steps.map((s) => s.step), ['trip-mutate', 'file-photos', 'confirm-post'])
  const [mutate, file, post] = p.steps
  assert.equal(mutate.awaitAck, true)
  assert.ok(file.requires.includes('trip-ack')) // no updateMemoryStop before the ack
  assert.ok(post.requires.includes('trip-ack') && post.requires.includes('file-photos')) // no POST before both
  assert.equal(post.onFail, 'queue-retry') // step-3 failure is queued + retried (sync-honesty)
})

// ============================================================================
// Test #4 — terminal trip-push failure → words-only + S1 promise (never the receipt)
// ============================================================================
test('#4 the degraded branch is the S1 free-text fallback: words only, no stop, no christening receipt', () => {
  const p = christenPlan(base({ moment: moment(), name: 'the jetty spot' }))
  const d = p.degraded
  assert.equal(d.trigger, 'trip-push-terminal-fail')
  assert.equal(d.createdStop, null)
  assert.deepEqual(d.filings, [])
  assert.equal(d.post.action, 'corrected') // the S1 free-text path, NOT a christening confirm
  assert.equal(d.post.words, 'the jetty spot')
  assert.equal(d.post.correctedPlaceId, undefined) // no entity that doesn't exist
  assert.equal(d.receipt.key, 's1.freetext.kept')
  // the receipt machine's degraded state is the S1 promise, never the christening line
  assert.equal(p.receipt.degraded.key, 's1.freetext.kept')
  assert.notEqual(p.receipt.degraded.text, p.receipt.success.text)
})

test('#4 receipt timing: a christening receipt renders only AFTER the trip ack', () => {
  const p = christenPlan(base({ moment: moment(), name: 'the jetty spot' }))
  assert.equal(p.receipt.timing, 'receipt-only-after-trip-ack')
  assert.equal(p.receipt.pending.text, 'Saving your place…')
  assert.match(p.receipt.success.text, /on the trip now/)
})

// ============================================================================
// Test #5 — the christened id passes isFilable*; the server D13 stamp lands
// ============================================================================
test("#5 the christened id is filable (client + worker) and the POST carries it as the 'confirmed' guess", () => {
  const p = christenPlan(base({ moment: moment(), name: 'the jetty spot' }))
  const id = p.createdStop.id
  assert.equal(id, 'cl-1-fixed') // day 1, deterministic maker
  assert.equal(isFilablePlace(id), true) // client mirror
  assert.equal(isFilableStop(id), true) // worker whitelist (stampConfirmedStops gate)
  // the server stamp fires only for action 'confirmed' + isFilableStop(guessedPlaceId):
  assert.equal(p.post.action, 'confirmed')
  assert.equal(p.post.guessedPlaceId, id)
  // and the filings themselves carry the D13 lock provenance:
  assert.ok(p.filings.length && p.filings.every((f) => f.prov.source === 'confirmed'))
  assert.ok(p.filings.every((f) => f.stopId === id))
})

// ============================================================================
// Test #6 — exemplar teaching fires for the new id; the world model resolves the name
// ============================================================================
test('#6 teaching keys exemplars + the world-model whisper to the new stop, name as a rename-safe alias', () => {
  const p = christenPlan(base({ moment: moment(), name: 'the jetty spot' }))
  const id = p.createdStop.id
  assert.equal(p.teaching.exemplars.stopId, id)
  assert.deepEqual(p.teaching.exemplars.memoryIds, ['m1', 'm2'])
  assert.equal(p.teaching.worldModel.keyedBy, 'stopId') // A9: keyed by STOP ID
  assert.equal(p.teaching.worldModel.stopId, id)
  assert.equal(p.teaching.worldModel.nameAlias, 'the jetty spot') // the name as a lexicon alias
  assert.equal(p.teaching.worldModel.strength, 'whisper') // one-visit strength, §13
  assert.equal(p.teaching.levelTwoCoordProp, false) // no coords → nothing to propagate
  // "resolves the name next trip": the same name matches its own alias strongly.
  assert.ok(nameDice('the jetty spot', p.teaching.worldModel.nameAlias) >= 0.9)
})

test('#6 a christening has NO coords (never invented) → gpsStamps empty; Level-2 abstains', () => {
  const p = christenPlan(base({ moment: moment(), name: 'the jetty spot' }))
  assert.equal(p.createdStop.lat, undefined)
  assert.equal(p.createdStop.lng, undefined)
  assert.deepEqual(p.gpsStamps, [])
})

// ============================================================================
// Test #7 — the album renders the christened stop + its filings (no orphan)
// ============================================================================
test('#7 the created stop is minted (filable id, kind:stop) and every filing points at it — no orphan', () => {
  const p = christenPlan(base({ moment: moment(), name: 'the jetty spot' }))
  assert.equal(p.createdStop.kind, 'stop')
  assert.equal(p.createdStop.name, 'the jetty spot') // the family's words, verbatim
  // the trip-mutate step creates the stop; the file step points every photo at it —
  // so by the time a filing lands the album can render the id (the ordering guarantee).
  const mutate = p.steps.find((s) => s.step === 'trip-mutate')
  assert.equal(mutate.stop.id, p.createdStop.id)
  assert.ok(p.filings.every((f) => isFilablePlace(f.stopId) && f.stopId === p.createdStop.id))
})

test('#7 the birth certificate records who/when/from — engine-readable, no migration', () => {
  const p = christenPlan(base({ moment: moment(), name: 'the jetty spot', traveler: 'aurelia', now: 42 }))
  assert.deepEqual(p.createdStop.origin, { christened: { by: 'aurelia', at: 42, fromMoment: ['m1', 'm2'] } })
})

// ============================================================================
// The flip-blocker-#3 invariant: christening confirms, it never 'corrected's
// ============================================================================
test("the christening POST is action 'confirmed' with the christened id — NEVER 'corrected' (flip-blocker #3)", () => {
  const p = christenPlan(base({ moment: moment(), name: 'the jetty spot' }))
  assert.equal(p.post.action, 'confirmed')
  assert.notEqual(p.post.action, 'corrected')
  assert.equal(p.post.correctedPlaceId, undefined)
  assert.equal(p.post.guessedPlaceName, 'the jetty spot') // verbatim words
})

// ============================================================================
// Masking (spec 118-123): a moment masked for ANY member defers the shared entry
// ============================================================================
test('masking: maskedForAnyMember defers the shared-agenda entry + holds every step until reveal', () => {
  const p = christenPlan(base({ moment: moment(), name: 'the jetty spot', maskedForAnyMember: true }))
  assert.equal(p.decision, 'christen')
  assert.equal(p.masking.deferred, true)
  assert.equal(p.masking.holdUntilReveal, true)
  assert.equal(p.masking.replayTrigger, 'surprise-reveal')
  assert.ok(p.steps.every((s) => s.holdUntilReveal === true)) // nothing hits the shared trip now
  assert.equal(p.receipt.success.key, 'christen.deferred')
  assert.match(p.receipt.success.text, /when the surprise does/)
})

test('masking: the UNMASKED christening does NOT defer', () => {
  const p = christenPlan(base({ moment: moment(), name: 'the jetty spot', maskedForAnyMember: false }))
  assert.equal(p.masking.deferred, false)
  assert.ok(p.steps.every((s) => s.holdUntilReveal === undefined))
})

// ============================================================================
// Deletion (spec 113-116): delete releases D13 locks, re-opens loose, never orphans
// ============================================================================
test('deletion: releaseChristenedStop unfiles + clears the lock for every filed photo, with a notice', () => {
  const rel = releaseChristenedStop({ stopId: 'cl-1-fixed', name: 'the jetty spot', filedMemoryIds: ['m1', 'm2'] })
  assert.equal(rel.orphaned, false)
  assert.equal(rel.releases.length, 2)
  // stopId null unfiles; prov null clears the D13 lock (memoryStore spreads stopProv
  // only when prov !== undefined) → the photos return to the sweep, loose + unlocked.
  assert.ok(rel.releases.every((r) => r.stopId === null && r.prov === null))
  assert.match(rel.notice.text, /2 photos from 'the jetty spot' are loose again/)
})

test('deletion: singular copy for one photo; empty release has no notice', () => {
  assert.match(releaseChristenedStop({ stopId: 'x', name: 'the cove', filedMemoryIds: ['m1'] }).notice.text, /1 photo from 'the cove' is loose again/)
  assert.equal(releaseChristenedStop({ stopId: 'x', name: 'the cove', filedMemoryIds: [] }).notice, null)
})

test('deletion: the christen plan carries the delete handler wired to its own stop + filings', () => {
  const p = christenPlan(base({ moment: moment(), name: 'the jetty spot' }))
  assert.equal(p.deletion.handler, 'releaseChristenedStop')
  assert.equal(p.deletion.stopId, p.createdStop.id)
  assert.deepEqual(p.deletion.filedMemoryIds, ['m1', 'm2'])
})

// ============================================================================
// No-day degrade: can't append a stop to a day that isn't in the trip → S1 words-only
// ============================================================================
test('no-day: a moment whose date is not in the trip degrades to the S1 words-only fallback (never invents a day)', () => {
  const p = christenPlan(base({ moment: moment({ isoDate: '2030-01-01' }), name: 'the jetty spot' }))
  assert.equal(p.decision, 'christen')
  assert.equal(p.blocked, 'no-day')
  assert.equal(p.createdStop, null) // never orphan a stop on a nonexistent day
  assert.deepEqual(p.filings, [])
  assert.equal(p.post.action, 'corrected')
  assert.equal(p.post.words, 'the jetty spot')
  assert.equal(p.degraded.active, true)
})

// ============================================================================
// Determinism + collapse-to-a-geocoded-stop propagates coords (Level-2 for a real stop)
// ============================================================================
test('determinism: identical inputs → identical plan (ids from the maker, time from now)', () => {
  const a = christenPlan(base({ moment: moment(), name: 'the jetty spot' }))
  const b = christenPlan(base({ moment: moment(), name: 'the jetty spot' }))
  assert.deepEqual(a, b)
})

test('collapse to a GEOCODED existing stop DOES propagate its coords (Level-2 fires for a real-stop confirm)', () => {
  const p = christenPlan(base({ moment: moment({ coords: { lat: 42.0501, lng: -70.1801 } }), name: 'Angel Foods' }))
  assert.equal(p.decision, 'pick')
  assert.equal(p.gpsStamps.length, 2) // one per photo ref key (k1, k2)
  assert.ok(p.gpsStamps.every((g) => g.source === 'confirmed' && g.coords.lat === 42.05))
})

// ============================================================================
// The metric + distance helpers
// ============================================================================
test('nameDice / metersBetween: the guard primitives behave', () => {
  assert.ok(nameDice('Angel Foods', 'Angel Foods') >= 0.99)
  assert.equal(nameDice('Angel Foods', 'Town Beach'), 0)
  assert.equal(metersBetween(null, { lat: 1, lng: 1 }), null) // absence abstains, never contradicts
  assert.equal(metersBetween({ lat: 42.05, lng: -70.18 }, { lat: 42.05, lng: -70.18 }), 0)
})
