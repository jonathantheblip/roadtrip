// learn-classTrust.test.mjs — LESSON-ASSERTING tests for the LEARNING SPINE altitude 6
// (app/src/lib/learn/classTrust.js): HYPOTHESIS-CLASS TRUST → RETIREMENT. Each test pins a
// CONSTITUTIONAL lesson from DESIGN_THE_HEALING_MODEL.md §16c/§13/§15b, not an
// implementation detail. Run:
//   node --test app/scripts/__tests__/learn-classTrust.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classTrust, retirementFor, CLASS_TRUST_DEFAULTS } from '../../src/lib/learn/classTrust.js'

// A feedback ledger row — the columns classTrust (via meta + the bar) reads: id, trip_id,
// action, kind, at. Ids are stable so "delete a row" tests are exact.
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

const fam = (rets, cls) => retirementFor(rets, cls, { scope: 'family' })
const run = (ledger, opts = {}) => classTrust([], [], ledger, { now: NOW, ...opts })
const base_trust_of = (ledger) => fam(run(ledger), 'A').trust

// A class the family has reliably confirmed, with enough evidence to clear the resting bar.
const RETIRED_LEDGER = rows('A', 'confirmed', 8, { at: NOW })

test('RETIREMENT: a reliably-confirmed class with earned evidence clears the moving bar and retires — with a whisper (never concealment)', () => {
  const A = fam(run(RETIRED_LEDGER), 'A')
  assert.ok(A, 'a class answered ≥ once yields a retirement fact')
  assert.equal(A.retired, true, 'reliable confirmations + evidence → the question retires')
  assert.ok(A.margin > 0, 'retirement is margin-positive (retireScore cleared the bar)')
  assert.ok(A.applyStrength > 0, 'a retired class auto-applies SOFTLY (a nonzero derived-tier nudge)')
  // never concealment: a retired question ALWAYS carries the standing-assumption whisper.
  assert.ok(A.whisper, 'retirement is never concealment — the whisper is present')
  assert.equal(A.whisper.reviewable, true, 'the whisper says it is reversible (a correction un-retires)')
  assert.equal(A.whisper.trust, A.trust, 'the whisper cites the measured trust behind the assumption')
  assert.ok(A.whisper.sourceRows.length >= 1, 'the whisper cites its ledger rows (gauge-auditable)')
})

test('DERIVED-TIER: the output is a clamped nudge — never a weight, never certainty, never a file; it cites its rows', () => {
  // No number of confirms manufactures certainty: confidence + applyStrength stay clamped.
  const A = fam(run(rows('A', 'confirmed', 1000, { at: NOW })), 'A')
  assert.ok(A.confidence <= CLASS_TRUST_DEFAULTS.confidenceCeiling + 1e-9, 'confidence never exceeds the ceiling')
  assert.ok(A.applyStrength <= CLASS_TRUST_DEFAULTS.confidenceCeiling + 1e-9, 'the auto-apply nudge is capped ≤ the ceiling')
  assert.ok(A.confidenceCeiling === undefined, 'the fact carries no witness weight to mutate — it is data, not a knob')
  assert.ok(CLASS_TRUST_DEFAULTS.confidenceCeiling < 0.6, 'and the ceiling sits below meta’s (0.6) — the decision whispers quieter than the measurement it rests on')
  assert.equal(A.sourceRows.length, 1000, 'every confirming row is cited — delete them and the fact unlearns')
})

test('GRADED / MOVING BAR, never a hard gate: one answer whispers but cannot retire; the nudge RAMPS across the bar (no snap)', () => {
  const thin = fam(run([row('A', 'confirmed', { at: NOW })]), 'A')
  assert.ok(thin, 'a class seen ONCE still emits a real fact — not muted (§13)')
  assert.equal(thin.retired, false, 'but one answer cannot clear the bar on its own (no assertion from thin evidence)')
  assert.equal(thin.applyStrength, 0, 'and a non-retired class auto-applies nothing — we still ASK')

  // The actionable output is continuous across the bar: a class just over the bar barely
  // auto-applies; a class well over it applies (still-clamped) more. No ≥N step anywhere.
  const barely = fam(run(rows('A', 'confirmed', 6, { at: NOW })), 'A')
  const firmly = fam(run(rows('A', 'confirmed', 40, { at: NOW })), 'A')
  if (barely.retired && firmly.retired) {
    assert.ok(firmly.margin > barely.margin, 'more confirmation → more margin (smoothly)')
    assert.ok(firmly.applyStrength > barely.applyStrength, 'and a firmer margin auto-applies more firmly — a ramp, not a switch')
  }
})

test('SURPRISE-WEIGHTED: a contradiction teaches MORE than an agreement — one correction moves the margin further than one confirm', () => {
  const base = fam(run(RETIRED_LEDGER), 'A')
  const plusConfirm = fam(run([...RETIRED_LEDGER, row('A', 'confirmed', { at: NOW })]), 'A')
  const plusCorrect = fam(run([...RETIRED_LEDGER, row('A', 'corrected', { at: NOW, correctedPlaceName: 'the other place' })]), 'A')

  const dConfirm = plusConfirm.margin - base.margin // an agreement nudges UP a little
  const dCorrect = plusCorrect.margin - base.margin // a contradiction pushes DOWN a lot
  assert.ok(dConfirm > 0, 'one more confirm raises the retirement margin')
  assert.ok(dCorrect < 0, 'one correction lowers it')
  assert.ok(Math.abs(dCorrect) > Math.abs(dConfirm), 'the contradiction moves the decision MORE than the agreement (§16c surprise weighting)')
  // and that single fresh contradiction is enough to REVERSE a retired class.
  assert.equal(base.retired, true, 'the class was retired')
  assert.equal(plusCorrect.retired, false, 'one fresh correction un-retires it — eager to retire, instant to reverse')
})

test('UN-RETIREMENT, reversible in BOTH directions: a fresh contradiction un-retires; as it ages (clean confirming since) the class re-retires', () => {
  const CORR = { id: 999, trip_id: 't1', action: 'corrected', kind: 'A', at: NOW, correctedPlaceName: 'elsewhere' }
  // Fresh correction alongside the confirmations → bar spikes → un-retired.
  const fresh = fam(run([...RETIRED_LEDGER, CORR]), 'A')
  assert.equal(fresh.retired, false, 'a FRESH contradiction un-retires the class (the bar spikes above the score)')
  assert.ok(fresh.contradiction.corrections === 1, 'the contradiction is counted, never discarded (§16c altitude 3)')

  // Same rows, but the correction is now two years old while the confirmations stay fresh:
  // the bar-pressure has decayed away, the class re-retires. Reversal in the OTHER direction,
  // driven purely by the correction's timestamp — a pure replay of the ledger.
  const aged = fam(run([...RETIRED_LEDGER, { ...CORR, at: Date.UTC(2024, 6, 10) }]), 'A')
  assert.equal(aged.retired, true, 'once the contradiction is old (with clean confirming since), the class re-retires')
  assert.ok(aged.trust < base_trust_of(RETIRED_LEDGER), 'yet the past correction leaves a lasting dent in the measured trust — honest, not erased')
})

test('PURE REPLAY / UNLEARN: deleting a source row unlearns exactly its lesson — no stored state', () => {
  const CORR = row('A', 'corrected', { at: NOW, id: 500, correctedPlaceName: 'nope' })
  const withCorrection = fam(run([...RETIRED_LEDGER, CORR]), 'A')
  assert.equal(withCorrection.retired, false, 'with the correction present the class is held un-retired')

  const withoutCorrection = fam(run(RETIRED_LEDGER), 'A') // the correction row removed
  assert.equal(withoutCorrection.retired, true, 'remove that one row and the class re-retires — learning is a replay, not a stored flag')

  // deleting a CONFIRM lowers the margin (fewer confirmations earned).
  const fewer = fam(run(rows('A', 'confirmed', 6, { at: NOW })), 'A')
  const more = fam(run(rows('A', 'confirmed', 8, { at: NOW })), 'A')
  assert.ok(more.margin > fewer.margin, 'fewer confirming rows → a lower margin; the fold reflects only the rows that remain')
})

test('ABSENCE abstains: the empty ledger folds to zero retirements; classless / unknown-action rows are never a negative vote', () => {
  assert.deepEqual(run([]), [], 'no feedback → no retirements (never a "not trusted" vote)')
  const noise = run([row(null, 'confirmed'), row('A', 'skipped-typo')])
  assert.deepEqual(noise, [], 'a row with no A/B/C/D class or an unknown action carries no datum')
  // a ledger with only class A never conjures a retirement for B/C/D.
  const onlyA = run(RETIRED_LEDGER)
  assert.equal(onlyA.filter((r) => r.subject.questionClass !== 'A').length, 0, 'unanswered classes stay silent, not "distrusted"')
})

test('PARTIAL POOLING (altitude 4): a thin per-trip class inherits the confirming family’s trust but stays a whisper it cannot retire on alone', () => {
  // Family confirms class A heavily on t1; trip t2 has a single confirm. t2's trust is
  // pooled toward the confirming parent (meta), but its OWN evidence is one answer.
  const rets = run([...rows('A', 'confirmed', 12, { trip: 't1', at: NOW }), row('A', 'confirmed', { trip: 't2', at: NOW })])
  const t2 = retirementFor(rets, 'A', { scope: 'trip', trip: 't2' })
  assert.ok(t2, 'the thin trip still emits a fact')
  assert.ok(t2.trust > 0.5, 'its trust is pooled toward the confirming family parent — not read off one datum')
  assert.equal(t2.retired, false, 'but with one answer it stays a whisper it cannot retire on its own (scale honesty)')
  // meanwhile the family-level class, on the whole family's evidence, DOES retire.
  assert.equal(fam(rets, 'A').retired, true, 'the family level, richly evidenced, retires — where the projection would consult it')
})

test('DETERMINISTIC & pure: same input → identical output; the clock is never read; without `now` decay is neutral', () => {
  const ledger = [...rows('A', 'confirmed', 4, { trip: 't1' }), ...rows('B', 'corrected', 2, { trip: 't2', correctedPlaceName: 'x' })]
  const a = classTrust([], [], ledger, { now: NOW })
  const b = classTrust([], [], ledger, { now: NOW })
  assert.deepEqual(a, b, 'a pure replay fold is bit-identical run to run')
  // no `now` → decay abstains to a neutral 1 (never invents staleness, never reaches for Date.now).
  const undated = classTrust([], [], ledger, {})
  assert.ok(undated.every((r) => r.recencyDecay === 1), 'without a now, recencyDecay is a neutral 1 everywhere')
})
