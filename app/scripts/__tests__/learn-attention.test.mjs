// learn-attention.test.mjs — LESSON-ASSERTING tests for ATTENTION (§16c altitude 3 of the
// Healing Model's LEARNING SPINE, app/src/lib/learn/attention.js). Each test pins a
// CONSTITUTIONAL lesson (mirroring the lattice + schema branch tests), not an implementation
// detail. ATTENTION is the error-driven, surprise-weighted per-witness credit vs the machine's
// lean: a CONTRADICTION teaches most, the divergence datum is never discarded, the output is a
// derived-tier reliability read (never a weight/file), and it folds altitude-4 partial pooling.
// Run: node --test app/scripts/__tests__/learn-attention.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foldAttention, ATTENTION_DEFAULTS } from '../../src/lib/learn/attention.js'

const NOW = Date.UTC(2026, 6, 20)
const AT = (y, mo, d) => Date.UTC(y, mo - 1, d)

// A feedback row in the listHealFeedbackForTrip shape. The ask-time challenger snapshot rides on
// `lean.hm`: `wit` = { <witness>: { n, g, t } } (per-witness backing of the lean), `top` = the
// challenger's guessed stop, `m` = the machine's confidence p̂ in it. Helpers below build the two
// answer shapes the grader reads: a CONFIRM (truth = the served guess) and a CORRECTION to a real
// stop (truth = that stop).
let SEQ = 0
const base = (over = {}) => ({ id: over.id ?? ++SEQ, trip_id: 't1', at: NOW, ...over })

// A CONFIRM: the family affirmed the served guess `place`. The challenger's top is `top` (default
// = the served guess, the aligned/promoted case). `m` is the machine's confidence; `wit` the map.
const confirm = ({ place = 's1', top = place, m = 0.5, wit = {}, ...rest } = {}) =>
  base({ action: 'confirmed', guessed_place_id: place, lean: { engine: 'hm', guessed: { id: place }, hm: { top, m, wit } }, ...rest })

// A CORRECTION to a real stop `to`. The served guess was wrong; the challenger's top is `top`.
const correct = ({ to = 's2', top = 'sX', m = 0.5, wit = {}, ...rest } = {}) =>
  base({ action: 'corrected', corrected_place_id: to, lean: { engine: 'hm', guessed: { id: 's1' }, hm: { top, m, wit } }, ...rest })

const one = (w, g, t = 'o') => ({ [w]: { n: 1, g, t } }) // a single witness backing at credit g
const round2ish = (x) => Math.round(x * 100) / 100

const glob = (facts, w) => facts.find((f) => f.subject.witness === w && f.subject.context.scope === 'global')
const tripFact = (facts, w, trip) =>
  facts.find((f) => f.subject.witness === w && f.subject.context.scope === 'trip' && f.subject.context.trip === trip)

// ---- reliability is read off the answer vs the lean --------------------------
test('RELIABILITY: a voice that backs guesses borne out reads HIGH; one that backs wrong guesses reads LOW; both cite their rows', () => {
  // `gps` backs the challenger top on three confirms where the top WAS the truth → reliable here.
  const rely = foldAttention(
    [confirm({ wit: one('gps', 0.9) }), confirm({ wit: one('gps', 0.9) }), confirm({ wit: one('gps', 0.9) })],
    { now: NOW },
  )
  const g = glob(rely.facts, 'gps')
  assert.ok(g, 'a voice that spoke produces a reliability fact')
  assert.ok(g.value > ATTENTION_DEFAULTS.neutralPrior, 'backings borne out pull reliability above the neutral prior')
  assert.deepEqual(g.counts, { backedRight: 3, backedWrong: 0, moments: 3 }, 'the RAW backed-right/wrong tally is exact')
  assert.equal(g.sourceRows.length, 3, 'every backing row is cited (gauge-auditable)')

  // `time` backs the challenger top on corrections where the top was NOT the corrected truth → wrong.
  const wrongy = foldAttention(
    [correct({ wit: one('time', 0.9) }), correct({ wit: one('time', 0.9) }), correct({ wit: one('time', 0.9) })],
    { now: NOW },
  )
  const t = glob(wrongy.facts, 'time')
  assert.ok(t.value < ATTENTION_DEFAULTS.neutralPrior, 'backing wrong guesses pulls reliability below neutral')
  assert.deepEqual(t.counts, { backedRight: 0, backedWrong: 3, moments: 3 })
})

test('the challenger can WIN where v1 lost: a correction whose top IS the corrected stop credits the HM voice', () => {
  // v1 served s1 and was CORRECTED to s2 — but the challenger's top WAS s2 (HM would have filed it
  // right). The voice that backed the challenger earns credit, not a penalty: the divergence datum
  // (v1 wrong, HM right) is scored, never discarded.
  const facts = foldAttention([correct({ to: 's2', top: 's2', wit: one('lookalike', 0.9) })], { now: NOW }).facts
  const g = glob(facts, 'lookalike')
  assert.equal(g.counts.backedRight, 1, 'the challenger matched the truth → its backer is credited RIGHT')
  assert.ok(g.value > ATTENTION_DEFAULTS.neutralPrior, 'and its reliability lifts above neutral even though v1 was corrected')
})

// ---- the core lesson: a contradiction teaches MORE (surprise-weighted) -------
test('A CONTRADICTION teaches MORE than an agreement: at equal machine confidence, a confident-WRONG guess moves reliability further than a confident-RIGHT one', () => {
  const M = 0.9 // the machine was equally CONFIDENT in both moments
  const agree = glob(foldAttention([confirm({ m: M, wit: one('w', 1) })], { now: NOW }).facts, 'w')
  const contra = glob(foldAttention([correct({ m: M, top: 'sX', wit: one('w', 1) })], { now: NOW }).facts, 'w')

  const upFromPrior = agree.value - ATTENTION_DEFAULTS.neutralPrior // a confident-right confirm nudges UP a little
  const downFromPrior = ATTENTION_DEFAULTS.neutralPrior - contra.value // a confident-wrong correction slams DOWN
  assert.ok(upFromPrior > 0 && downFromPrior > 0, 'the agreement lifts; the contradiction sinks')
  assert.ok(downFromPrior > upFromPrior + 0.05, 'the contradiction moves reliability FURTHER — surprise is the prediction error (§16c altitude 3)')
  assert.ok(contra.surpriseMean > agree.surpriseMean, 'and the contradiction is recorded as the more-surprising (higher-taught) datum')
})

test('CALIBRATION is SYMMETRIC (§13): a DIFFIDENT-but-RIGHT guess teaches nearly as much as a confident-but-wrong one — under-confidence is hunted too', () => {
  // A voice that backed a guess the machine barely believed (p̂ low) which turned out RIGHT is a
  // real-but-under-trusted channel — it earns a LARGE reward, the mirror of the confident-wrong penalty.
  const surprisingSuccess = glob(foldAttention([confirm({ m: 0.1, wit: one('w', 1) })], { now: NOW }).facts, 'w')
  const dullSuccess = glob(foldAttention([confirm({ m: 0.9, wit: one('w', 1) })], { now: NOW }).facts, 'w')
  assert.ok(surprisingSuccess.value > dullSuccess.value, 'a diffident-but-right backing lifts reliability MORE than an already-confident one')
  assert.ok(surprisingSuccess.surpriseMean > dullSuccess.surpriseMean, 'the diffident success is the more-surprising datum (symmetric calibration)')
})

// ---- responsibility: only what a voice actually backed --------------------
test('RESPONSIBILITY: a voice present but NOT backing the guess (g = 0) is abstained from — never scored for a bet it did not place', () => {
  // On a wrong guess, `gps` backed it (g 0.9) but `scene` spoke about a different place (g 0) — only
  // the backer is penalised; the dissenter yields NO fact (we cannot know which place it backed).
  const facts = foldAttention([correct({ top: 'sX', wit: { gps: { n: 1, g: 0.9, t: 'o' }, scene: { n: 1, g: 0, t: 'o' } } })], { now: NOW }).facts
  assert.ok(glob(facts, 'gps'), 'the voice that backed the guess is scored')
  assert.equal(glob(facts, 'scene'), undefined, 'the g=0 dissenter induces no reliability fact (§13 abstain, not a zero)')
})

// ---- deletion unlearns exactly its lesson (pure replay) ---------------------
test('deleting a source row UNLEARNS exactly its lesson — learning is a pure replay, not a stored state', () => {
  const rows = [confirm({ id: 'a', wit: one('w', 0.9) }), correct({ id: 'b', top: 'sX', m: 0.9, wit: one('w', 0.9) })]
  const withB = glob(foldAttention(rows, { now: NOW }).facts, 'w')
  const withoutB = glob(foldAttention([rows[0]], { now: NOW }).facts, 'w') // the contradiction removed

  assert.ok(withB.sourceRows.includes('b'), 'while it exists, the contradiction row is cited')
  assert.ok(!withoutB.sourceRows.includes('b'), 'remove the row and it drops out of the citation')
  assert.ok(withoutB.value > withB.value, 'and removing that CONTRADICTION raises reliability — its lesson (and only its lesson) is gone')
  assert.equal(withoutB.counts.backedWrong, 0, 'the wrong-backing it contributed is unlearned exactly')
})

// ---- absence abstains (§13) -------------------------------------------------
test('ABSENCE abstains: an empty ledger, an aside, and a lean-less moment all induce ZERO reliability — never a negative vote', () => {
  const empty = foldAttention([], { now: NOW })
  assert.deepEqual(empty.facts, [], 'no feedback → no facts')
  assert.equal(empty.report.moments, 0, 'and the report is honestly empty')

  // An aside carries no revealed truth; a confirm with no captured lean cannot be attributed.
  const noise = foldAttention([base({ action: 'aside', lean: { engine: 'hm', hm: { top: 's1', m: 0.5, wit: one('w', 0.9) } } }), confirm({ wit: undefined, lean: undefined })], { now: NOW })
  assert.deepEqual(noise.facts, [], 'an aside (truth unknown) and a lean-less confirm teach nothing')
  assert.equal(noise.report.byAction.aside, 1, 'the aside is still COUNTED (a moment happened)…')
  assert.equal(noise.report.skipped, 1, '…and the lean-less moment is counted as skipped, not scored')
})

test('a CORRECTION whose truth is only a name / free-text (no real stop id) abstains from grading — never guessed at', () => {
  // corrected_place_id is a synthetic christening label, not a real stop → no comparable truth id.
  const facts = foldAttention([correct({ to: '__vision__abc', wit: one('w', 0.9) })], { now: NOW }).facts
  assert.deepEqual(facts, [], 'no real truth id → the moment is ungradable → no witness is scored')
})

// ---- derived-tier: a nudge, never a weight or a file ------------------------
test('DERIVED-TIER: reliability is CLAMPED well below certainty no matter how many backings — it can never assert or re-weight', () => {
  const many = Array.from({ length: 500 }, () => confirm({ m: 0.9, wit: one('w', 1), at: NOW }))
  const g = glob(foldAttention(many, { now: NOW }).facts, 'w')
  assert.ok(g.confidence <= ATTENTION_DEFAULTS.confidenceCeiling + 1e-9, 'confidence never exceeds the ceiling')
  assert.ok(ATTENTION_DEFAULTS.confidenceCeiling < 0.7, 'and the ceiling sits below every OBSERVED witness weight (currentFiling 0.7) — a nudge, not a vote')
  assert.ok(g.value >= 0 && g.value <= 1, 'the value is a bounded reliability in [0,1], never an unbounded weight')
})

test('the fold MUTATES nothing: the input rows and the frozen defaults are untouched (write-free instrument)', () => {
  const row = confirm({ wit: one('w', 0.9) })
  const snapshot = JSON.stringify(row)
  foldAttention([row], { now: NOW })
  assert.equal(JSON.stringify(row), snapshot, 'the feedback row is not mutated')
  assert.equal(ATTENTION_DEFAULTS.confidenceCeiling, 0.5, 'the declared SEED is not mutated by a run')
})

// ---- altitude 4: partial pooling hierarchy ----------------------------------
test('PARTIAL POOLING (altitude 4): a thin per-trip reliability shrinks toward the witness GLOBAL parent; a trip’s OWN decisive evidence wins', () => {
  // `w` is globally reliable (backs 10 borne-out confirms on t1). Trip t2 has a SINGLE wrong
  // backing — its thin per-trip reliability must be POOLED toward the reliable global, not read as
  // a hard 0 off one datum.
  const thinRows = [
    ...Array.from({ length: 10 }, () => confirm({ trip_id: 't1', m: 0.6, wit: one('w', 0.9) })),
    correct({ trip_id: 't2', top: 'sX', m: 0.6, wit: one('w', 0.9) }),
  ]
  const thin = foldAttention(thinRows, { now: NOW }).facts
  const gW = glob(thin, 'w')
  const t2thin = tripFact(thin, 'w', 't2')
  assert.ok(t2thin.parent === gW.value, 'the per-trip fact is pooled toward the witness’s own GLOBAL reliability (its parent)')
  assert.ok(t2thin.value > 0.5, 'one wrong backing does NOT crater the trip — it is pooled toward the reliable parent')
  assert.ok(t2thin.value < gW.value, 'yet it bends below the parent, toward its own (negative) evidence')
  assert.ok(t2thin.confidence < gW.confidence, 'and with a single backing it stays the fainter whisper')

  // Now t2 keeps backing wrong guesses — its OWN evidence becomes decisive and escapes the parent.
  const decisiveRows = [
    ...Array.from({ length: 10 }, () => confirm({ trip_id: 't1', m: 0.6, wit: one('w', 0.9) })),
    ...Array.from({ length: 12 }, () => correct({ trip_id: 't2', top: 'sX', m: 0.6, wit: one('w', 0.9) })),
  ]
  const decisive = foldAttention(decisiveRows, { now: NOW }).facts
  const t2decisive = tripFact(decisive, 'w', 't2')
  assert.ok(t2decisive.value < glob(decisive, 'w').value - 0.15, 'a trip that keeps backing wrong guesses drives its own reliability well below the parent — the off-parent datum wins on its own evidence')
})

test('altitude-4 nesting deepens ONLY when a classifier arrives: opts.shapeOf lights up a shape layer and nests trips under it; absent, trips nest under global (no fabricated middle)', () => {
  const rows = [confirm({ trip_id: 'tA', wit: one('w', 0.9) }), confirm({ trip_id: 'tB', wit: one('w', 0.9) })]
  const flat = foldAttention(rows, { now: NOW }).facts
  assert.equal(flat.filter((f) => f.subject.context.scope === 'shape').length, 0, 'no classifier ⇒ NO shape facts are invented (§1 grounding)')

  const nested = foldAttention(rows, { now: NOW, shapeOf: () => 'stay' }).facts
  const shapeFact = nested.find((f) => f.subject.context.scope === 'shape' && f.subject.context.shape === 'stay')
  assert.ok(shapeFact, 'with a shapeOf classifier, a trip-shape context lights up (§16c altitude-4 middle layer)')
  const tripUnderShape = nested.find((f) => f.subject.context.scope === 'trip' && f.subject.context.trip === 'tA')
  assert.equal(tripUnderShape.parent, shapeFact.value, 'and the trip now nests under its SHAPE (its parent), not global — the hierarchy deepened')
})

// ---- the failure-to-learn tax (§16c) ----------------------------------------
test('FAILURE-TO-LEARN TAX: a confirmed guess the machine already had RIGHT is a reported COST; a caught correction is not taxed', () => {
  // Two confident confirms the challenger got right (avoidable asks) + one correction it caught.
  const rep = foldAttention([
    confirm({ m: 0.8, wit: one('w', 0.9) }),
    confirm({ m: 0.8, wit: one('w', 0.9) }),
    correct({ m: 0.8, top: 'sX', wit: one('w', 0.9) }),
  ], { now: NOW }).report
  assert.ok(rep.failureToLearnTax > 0, 'asks the machine already answered right carry a nonzero tax (an ask that could have auto-applied is a cost, §16c)')
  assert.equal(rep.caughtErrors, 1, 'the correction is a caught error — it EARNED its friction, not taxed')
  assert.ok(Math.abs(rep.failureToLearnTax - 1.6) < 1e-9, 'the tax is confidence-weighted: Σ p̂ over the two right asks (0.8 + 0.8)')
  assert.equal(rep.taxRate, round2ish(1.6 / 3), 'taxRate normalises the tax across the graded asks')
})

test('FAILURE-TO-LEARN TAX (regression): a CORRECTION the challenger got RIGHT is still NOT taxed — the tax gates on the confirm ACTION, not the outcome', () => {
  // v1's served guess was wrong so the family corrected to s2, but the CHALLENGER's own top was
  // already s2 (oOut=1, challenger right). The old code taxed this (gated on outcome); the fix
  // gates on action — a correction caught a real v1 error, so it is never taxed (§16c, the verify catch).
  const rep = foldAttention([correct({ to: 's2', top: 's2', m: 0.8, wit: one('w', 0.9) })], { now: NOW }).report
  assert.equal(rep.right, 1, 'the challenger WAS right (top = the corrected stop) — counts as right for reliability')
  assert.equal(rep.failureToLearnTax, 0, 'but a CORRECTION is never taxed, even when the challenger agreed (gate on action, not outcome)')
})

// ---- pure replay: deterministic, clock never read ---------------------------
test('DETERMINISTIC & pure: same input → identical output; the clock is never read; no `now` ⇒ a neutral decay', () => {
  const rows = [confirm({ trip_id: 't1', wit: one('w', 0.9) }), correct({ trip_id: 't2', top: 'sX', wit: one('x', 0.9) })]
  const a = foldAttention(rows, { now: NOW })
  const b = foldAttention(rows, { now: NOW })
  assert.deepEqual(a, b, 'a pure replay fold is bit-identical run to run')

  // no `now` supplied → decay abstains to a neutral 1 (never invents staleness, never reaches for Date.now).
  const undated = foldAttention(rows, {})
  assert.ok(undated.facts.every((f) => f.recencyDecay === 1), 'without a now, recencyDecay is a neutral 1')

  // an older-answered fact decays below a fresh one (decay is real when dated).
  const old = glob(foldAttention([confirm({ at: AT(2022, 1, 1), wit: one('w', 0.9) })], { now: NOW }).facts, 'w')
  const fresh = glob(foldAttention([confirm({ at: AT(2026, 7, 1), wit: one('w', 0.9) })], { now: NOW }).facts, 'w')
  assert.ok(old.recencyDecay < fresh.recencyDecay, 'a years-stale reliability read decays more than a fresh one')
})
