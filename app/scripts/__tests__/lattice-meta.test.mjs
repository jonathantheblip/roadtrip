// lattice-meta.test.mjs — LESSON-ASSERTING tests for the META branch of the fact
// lattice (app/src/lib/lattice/meta.js). Mirrors world-model.test.mjs: each test
// pins a CONSTITUTIONAL lesson, not an implementation detail. Run:
//   node --test app/scripts/__tests__/lattice-meta.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metaFacts, META_DEFAULTS } from '../../src/lib/lattice/meta.js'

// A feedback ledger row — the columns metaFacts actually reads (worker
// memory_heal_feedback: id, trip_id, action, kind, at). n lets a fixture emit a run.
let SEQ = 0
const row = (kind, action, { trip = 't1', at = Date.UTC(2026, 6, 1), id } = {}) => ({
  id: id ?? ++SEQ,
  trip_id: trip,
  action,
  kind,
  at,
})
const rows = (kind, action, n, opts = {}) => Array.from({ length: n }, () => row(kind, action, opts))
const NOW = Date.UTC(2026, 6, 10)

const familyFact = (facts, cls) => facts.find((f) => f.subject.questionClass === cls && f.subject.context.scope === 'family')
const tripFact = (facts, cls, trip) =>
  facts.find((f) => f.subject.questionClass === cls && f.subject.context.scope === 'trip' && f.subject.context.trip === trip)

test('RATES: the confirm/correct/skip rates are read straight off the feedback ledger, with raw counts + cited rows', () => {
  const ledger = [...rows('A', 'confirmed', 3), ...rows('A', 'corrected', 1), ...rows('A', 'aside', 1)]
  const facts = metaFacts([], [], ledger, { now: NOW })
  const A = familyFact(facts, 'A')
  assert.ok(A, 'a class answered ≥ once produces a family fact')
  assert.deepEqual(A.counts, { confirm: 3, correct: 1, skip: 1, total: 5 }, 'the RAW observed counts are exact')
  // confirm is the plurality outcome → the trust (confirm rate) leads the other two.
  assert.ok(A.rates.confirm > A.rates.correct && A.rates.confirm > A.rates.skip, 'the rate vector tracks what actually happened')
  assert.ok(Math.abs(A.rates.confirm + A.rates.correct + A.rates.skip - 1) < 1e-9, 'the three rates are a distribution')
  assert.equal(A.value, A.rates.confirm, 'value IS the trust headline = the confirm rate')
  assert.equal(A.sourceRows.length, 5, 'every one of the 5 rows is cited (gauge-auditable)')
})

test('GRADED, never a cutoff: one answer still whispers; confidence grows smoothly with the count — no ≥N gate', () => {
  const thin = metaFacts([], [], [row('B', 'confirmed')], { now: NOW })
  const B = familyFact(thin, 'B')
  assert.ok(B && B.confidence > 0, 'a class seen ONCE still emits a real (nonzero) fact — not muted (§13)')

  const thick = familyFact(metaFacts([], [], rows('B', 'confirmed', 20), { now: NOW }), 'B')
  assert.ok(thick.confidence > B.confidence, 'more answers → more confidence, smoothly (no cutoff step)')
})

test('CLAMP holds: a fact NEVER asserts alone — confidence is capped well below certainty no matter how many confirms', () => {
  const facts = metaFacts([], [], rows('A', 'confirmed', 1000, { at: NOW }), { now: NOW })
  const A = familyFact(facts, 'A')
  assert.ok(A.confidence <= META_DEFAULTS.confidenceCeiling + 1e-9, 'confidence never exceeds the ceiling')
  assert.ok(A.confidence < 0.65, 'and the ceiling is well below certainty — a trust nudges, it cannot assert')
  assert.ok(A.value < 1, 'even a 1000-confirm rate is a whisper short of 1 (the prior keeps it honest)')
})

test('DECAY: a class unanswered for years quietly loses its trust-currency', () => {
  const seen = Date.UTC(2021, 0, 1)
  const ledger = rows('C', 'confirmed', 5, { at: seen })
  const fresh = familyFact(metaFacts([], [], ledger, { now: Date.UTC(2021, 0, 20) }), 'C')
  const stale = familyFact(metaFacts([], [], ledger, { now: Date.UTC(2025, 0, 1) }), 'C')
  assert.ok(stale.recencyDecay < fresh.recencyDecay, 'the older read decays more')
  assert.ok(stale.confidence < fresh.confidence * 0.2, 'four years on, a stale class-trust has all but faded')
})

test('ABSENCE abstains: the empty ledger folds to zero facts; an unanswered class / classless row is never a negative vote', () => {
  assert.deepEqual(metaFacts([], [], [], { now: NOW }), [], 'no feedback → no facts (never a 0% trust)')
  // one classless row (kind null) + one unknown-action row → still nothing to learn.
  const noise = metaFacts([], [], [row(null, 'confirmed'), row('A', 'skipped-typo')], { now: NOW })
  assert.deepEqual(noise, [], 'a row with no A/B/C/D class, or an unknown action, carries no hypothesis-class datum')
  // a ledger with only class A never conjures a fact for B/C/D.
  const onlyA = metaFacts([], [], rows('A', 'confirmed', 3), { now: NOW })
  assert.equal(onlyA.filter((f) => f.subject.questionClass !== 'A').length, 0, 'unanswered classes stay silent, not zero')
})

test('deleting a source row UNLEARNS its fact', () => {
  const cRows = rows('D', 'confirmed', 2, { trip: 't9' })
  const withD = metaFacts([], [], [...rows('A', 'confirmed', 2), ...cRows], { now: NOW })
  assert.ok(familyFact(withD, 'D'), 'while its rows exist, the class-D fact is present')

  const withoutD = metaFacts([], [], rows('A', 'confirmed', 2), { now: NOW }) // the D rows removed
  assert.equal(familyFact(withoutD, 'D'), undefined, 'remove the rows and the fact is gone — learning is a pure replay, not stored')

  // partial deletion: fewer cited rows → lower count + those ids drop out of sourceRows.
  const half = metaFacts([], [], [...rows('A', 'confirmed', 2), cRows[0]], { now: NOW })
  assert.equal(familyFact(half, 'D').counts.total, 1, 'the surviving fact reflects only the rows that remain')
})

test('PARTIAL POOLING (altitude 4): a thin per-trip fact shrinks to the family parent; a trip’s OWN decisive evidence wins', () => {
  // The family confirms class A heavily (10 confirms on t1). Trip t2 has a SINGLE
  // correction — its thin per-trip trust must be POOLED toward the confirming family,
  // not read as a hard 0% confirm off one datum.
  const thin = metaFacts([], [], [...rows('A', 'confirmed', 10, { trip: 't1' }), row('A', 'corrected', { trip: 't2' })], { now: NOW })
  const familyA = familyFact(thin, 'A')
  const t2thin = tripFact(thin, 'A', 't2')
  assert.ok(t2thin.value > 0.5, 'one correction does NOT crater the trip’s trust — it is pooled toward the family parent')
  assert.ok(t2thin.value < familyA.value, 'yet it does bend below the parent, toward its own evidence')
  assert.ok(t2thin.confidence < familyA.confidence, 'and with only one answer it stays the fainter whisper')

  // Now t2 answers class A with MANY corrections — its own evidence becomes decisive and
  // WINS: the per-trip trust escapes the confirming parent toward the trip’s own low rate.
  const decisive = metaFacts([], [], [...rows('A', 'confirmed', 10, { trip: 't1' }), ...rows('A', 'corrected', 12, { trip: 't2' })], { now: NOW })
  const t2decisive = tripFact(decisive, 'A', 't2')
  const familyA2 = familyFact(decisive, 'A')
  assert.ok(t2decisive.value < 0.2, 'a trip that keeps correcting drives its own class-A trust down')
  assert.ok(t2decisive.value < familyA2.value - 0.2, 'the off-family observation wins on its own evidence — it clears the parent by a wide margin')
})

test('DETERMINISTIC & pure: same input → identical output; the clock is never read', () => {
  const ledger = [...rows('A', 'confirmed', 2, { trip: 't1' }), ...rows('B', 'corrected', 2, { trip: 't2' })]
  const a = metaFacts([], [], ledger, { now: NOW })
  const b = metaFacts([], [], ledger, { now: NOW })
  assert.deepEqual(a, b, 'a pure replay fold is bit-identical run to run')
  // no `now` supplied → decay abstains to a neutral 1 (never invents staleness, never
  // reaches for Date.now).
  const undated = metaFacts([], [], ledger, {})
  assert.ok(undated.every((f) => f.recencyDecay === 1), 'without a now, recencyDecay is a neutral 1')
})
