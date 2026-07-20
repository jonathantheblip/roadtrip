import { test } from 'node:test'
import assert from 'node:assert/strict'
import { schemaFacts, SCHEMA_DEFAULTS } from '../../src/lib/learn/schema.js'

// These tests assert the LESSONS are ENFORCED BY THE CODE, not merely written in a doc
// (mirroring the lattice branch tests). SCHEMA (§16c altitude 5) is the ANSWER→hypothesis
// induction: it folds the S1 confirm-surface feedback ledger into durable, whisper-strength,
// recurrence-hardened, decaying, source-cited lattice-shaped hypotheses — christenings post
// PLACES, structure answers post RHYTHMS, calibrations post DEVICES — every one derived-tier
// (a nudge, never a weight/file).

const NOW = Date.UTC(2026, 6, 20)
const AT = (y, mo, d) => Date.UTC(y, mo - 1, d)
const subj = (facts, s) => facts.find((f) => f.subject === s)

// A feedback row in the listHealFeedbackForTrip shape. `wit` (optional) seeds lean.hm.wit —
// the ask-time per-witness contribution map { <witness>: { n, g, t } }.
let AUTO_ID = 0
const fb = (over = {}) => {
  const { wit, ...rest } = over
  const row = { id: rest.id ?? ++AUTO_ID, action: 'confirmed', at: NOW, ...rest }
  if (wit) row.lean = { engine: 'hm', hm: { wit } }
  return row
}

// ---- CHRISTENING → a PLACE hypothesis ---------------------------------------
test('CHRISTENING: a correction naming a place off every list induces a PLACE hypothesis, postable to places', () => {
  const facts = schemaFacts([
    fb({ action: 'corrected', correctedPlaceName: "Nonna's kitchen", correctedPlaceId: null }),
  ], { now: NOW })
  const f = subj(facts, "place:christened:nonna's kitchen")
  assert.ok(f, 'the christening becomes a durable hypothesis')
  assert.equal(f.type, 'christening')
  assert.equal(f.postTo, 'places', 'postable to the PLACES branch (never auto-posted)')
  assert.equal(f.value.name, "Nonna's kitchen", 'carries the christened name verbatim')
  assert.equal(f.value.corrections, 1)
})

test('CHRISTENING: a synthetic-id correction (vision/discovered label) still christens; a REAL-stop pick does NOT (PLACES already learns the filing)', () => {
  const christen = schemaFacts([
    fb({ action: 'corrected', correctedPlaceName: 'The blue cabin', correctedPlaceId: '__vision__abc' }),
  ], { now: NOW })
  assert.ok(subj(christen, 'place:christened:the blue cabin'), 'a non-filable synthetic id is a christening')

  const picking = schemaFacts([
    // kind A place-confirm to a REAL stop, AND a correction that merely re-files to a REAL stop:
    fb({ action: 'confirmed', kind: 'A', guessedPlaceId: 'stop_42', guessedPlaceName: 'Town beach' }),
    fb({ action: 'corrected', correctedPlaceId: 'stop_99', correctedPlaceName: 'Harbor' }),
  ], { now: NOW })
  assert.deepEqual(picking, [], 'picking among EXISTING stops induces no schema — that is altitude 1, learned by PLACES from the filing')
})

// ---- STRUCTURE → a rhythm-SPLIT hypothesis ----------------------------------
test('STRUCTURE: a grouping (kind D) answer induces a rhythm-split hypothesis, postable to rhythms', () => {
  const facts = schemaFacts([fb({ action: 'corrected', kind: 'D' })], { now: NOW })
  const f = subj(facts, 'rhythm:split')
  assert.ok(f, 'a structure answer posts a split hypothesis')
  assert.equal(f.type, 'split')
  assert.equal(f.postTo, 'rhythms')
})

// ---- CALIBRATION → a device/PATTERN hypothesis (uses hm.wit) ----------------
test('CALIBRATION: a when (kind C) answer induces a pattern hypothesis keyed on the LEANED channel (hm.wit), postable to devices', () => {
  const facts = schemaFacts([
    // the machine leaned hardest on the `time` witness for this moment (highest g)
    fb({ action: 'corrected', kind: 'C', wit: { time: { n: 2, g: 0.8, t: 'o' }, sequence: { n: 2, g: 0.3, t: 'd' } } }),
  ], { now: NOW })
  const f = subj(facts, 'pattern:calibration:time')
  assert.ok(f, 'the calibration is keyed on the channel the machine actually leaned on')
  assert.equal(f.type, 'calibration')
  assert.equal(f.postTo, 'devices')
  assert.equal(f.value.channel, 'time')
})

test('CALIBRATION: no challenger lean captured (engine v1) ⇒ the pattern keys on the class itself, still a real hypothesis', () => {
  const facts = schemaFacts([fb({ action: 'corrected', kind: 'C' })], { now: NOW })
  assert.ok(subj(facts, 'pattern:calibration:when'), 'a missing lean never DROPS the calibration — it keys on the class')
})

// ---- LESSON 1: the divergence datum is NEVER discarded ----------------------
test('LESSON — a CORRECTION (divergence between machine guess and family answer) is never dropped: every kind induces its hypothesis', () => {
  // one correction of each SCHEMA kind, alone — each must survive as a hypothesis
  const christen = schemaFacts([fb({ action: 'corrected', correctedPlaceName: 'X', correctedPlaceId: null })], { now: NOW })
  const split = schemaFacts([fb({ action: 'corrected', kind: 'D' })], { now: NOW })
  const calib = schemaFacts([fb({ action: 'corrected', kind: 'C' })], { now: NOW })
  assert.equal(christen.length, 1, 'the christening divergence survives')
  assert.equal(split.length, 1, 'the structure divergence survives')
  assert.equal(calib.length, 1, 'the calibration divergence survives')
})

// ---- LESSON 2: a contradiction teaches MORE than an agreement (surprise-weighted) ----
test('LESSON — a CONTRADICTION (corrected) teaches MORE than an AGREEMENT (confirmed): higher confidence, same kind', () => {
  const corrected = schemaFacts([fb({ action: 'corrected', kind: 'D' })], { now: NOW })
  const confirmed = schemaFacts([fb({ action: 'confirmed', kind: 'D' })], { now: NOW })
  const c = subj(corrected, 'rhythm:split')
  const a = subj(confirmed, 'rhythm:split')
  assert.ok(c && a, 'both a correction and a confirmation induce the split hypothesis')
  assert.ok(c.confidence > a.confidence, `a contradiction outweighs an agreement (${c.confidence} > ${a.confidence})`)
  // and the asymmetry is STRUCTURAL — encoded in the seed order, not felt
  assert.ok(SCHEMA_DEFAULTS.correctWeight > SCHEMA_DEFAULTS.confirmWeight, 'correctWeight > confirmWeight in the declared seeds')
})

// ---- LESSON 3: deleting a source row unlearns EXACTLY its lesson -------------
test('LESSON — deleting a cited feedback row unlearns exactly its lesson (and nothing else)', () => {
  const rowA = fb({ id: 'A', action: 'corrected', kind: 'D' }) // structure
  const rowB = fb({ id: 'B', action: 'corrected', kind: 'D' }) // structure, same hypothesis
  const rowZ = fb({ id: 'Z', action: 'corrected', correctedPlaceName: 'Elsewhere', correctedPlaceId: null }) // a DIFFERENT hypothesis

  const full = schemaFacts([rowA, rowB, rowZ], { now: NOW })
  const splitFull = subj(full, 'rhythm:split')
  const elsewhere = subj(full, 'place:christened:elsewhere')
  assert.deepEqual(splitFull.sourceRows, ['A', 'B'], 'both rows are cited on the split hypothesis')
  assert.equal(splitFull.value.corrections, 2)

  const dropB = schemaFacts([rowA, rowZ], { now: NOW }) // delete row B
  const splitDrop = subj(dropB, 'rhythm:split')
  assert.deepEqual(splitDrop.sourceRows, ['A'], 'B is gone from the citation — the fact unlearns exactly B')
  assert.equal(splitDrop.value.corrections, 1, 'exactly one correction remains')
  assert.ok(splitDrop.confidence < splitFull.confidence, 'losing a source row lowers confidence')

  const elseDrop = subj(dropB, 'place:christened:elsewhere')
  assert.deepEqual(elseDrop, elsewhere, 'the UNRELATED hypothesis is byte-identical — only B was unlearned')
})

// ---- LESSON 4: the output is DERIVED-TIER (a nudge, never a weight or a file) ----
test('LESSON — every hypothesis is derived-tier: clamped below certainty, source-cited, never a weight/file', () => {
  // pile up many confirmations — no volume of agreement may manufacture certainty
  const many = Array.from({ length: 50 }, (_, i) => fb({ id: `n${i}`, action: 'confirmed', kind: 'D' }))
  const facts = schemaFacts(many, { now: NOW })
  const f = subj(facts, 'rhythm:split')
  assert.ok(f, 'a well-attested hypothesis still emits')
  assert.ok(f.confidence <= SCHEMA_DEFAULTS.confidenceCeiling, 'confidence is CLAMPED at the ceiling, no matter the volume')
  assert.ok(f.confidence < 1, 'never asserts certainty')
  for (const g of facts) {
    assert.ok(Array.isArray(g.sourceRows) && g.sourceRows.length > 0, 'every fact CITES its ledger rows (gauge-auditable)')
    assert.ok(g.confidence <= SCHEMA_DEFAULTS.confidenceCeiling, 'derived-tier clamp holds for every fact')
    assert.equal(typeof g.value, 'object', 'a fact is data — a value object, never a function/side effect')
    assert.ok(typeof g.postTo === 'string', 'a fact is POSTABLE (named branch) but not auto-posted')
  }
})

// ---- ABSENCE ABSTAINS: an aside / an empty ledger induces NOTHING ------------
test('ABSENCE ABSTAINS — an aside (declined to engage) and an empty ledger both induce ZERO facts (never a negative vote)', () => {
  assert.deepEqual(schemaFacts([], { now: NOW }), [], 'the empty ledger (today\'s prod reality) folds to zero')
  assert.deepEqual(
    schemaFacts([fb({ action: 'aside', kind: 'D' }), fb({ action: 'aside', kind: 'C' }), fb({ action: 'aside', kind: 'B' })], { now: NOW }),
    [],
    'an aside is silence, not a 0% vote — it induces no hypothesis (§13 imperfection is the medium)',
  )
})

// ---- RECURRENCE-HARDENED: more attestations → firmer (smooth, no cutoff) -----
test('RECURRENCE — more attestations of the SAME hypothesis sharpen it; one already whispers (graded, no cutoff)', () => {
  const one = subj(schemaFacts([fb({ id: '1', action: 'corrected', kind: 'D' })], { now: NOW }), 'rhythm:split')
  const three = subj(schemaFacts([
    fb({ id: '1', action: 'corrected', kind: 'D' }),
    fb({ id: '2', action: 'corrected', kind: 'D' }),
    fb({ id: '3', action: 'corrected', kind: 'D' }),
  ], { now: NOW }), 'rhythm:split')
  assert.ok(one.confidence > 0, 'seen once already whispers (no "not enough data" gate)')
  assert.ok(three.confidence > one.confidence, 'recurrence hardens the hypothesis')
})

// ---- DECAY + DETERMINISM ----------------------------------------------------
test('DECAY — a stale hypothesis fades; and the fold is DETERMINISTIC (now only from opts, byte-identical repeats)', () => {
  // ~1.5y stale — decayed clearly, yet still above the emit floor (a very old lone whisper
  // rightly falls below it; here we want a surviving fact to compare recencyDecay on).
  const stale = fb({ id: 's', action: 'corrected', kind: 'D', at: AT(2025, 1, 1) })
  const fresh = fb({ id: 'f', action: 'corrected', kind: 'D', at: NOW })
  const staleFact = subj(schemaFacts([stale], { now: NOW }), 'rhythm:split')
  const freshFact = subj(schemaFacts([fresh], { now: NOW }), 'rhythm:split')
  assert.ok(staleFact.recencyDecay < freshFact.recencyDecay, 'the older attestation has decayed more')
  assert.ok(staleFact.confidence < freshFact.confidence, 'a stale schema loses its voice')

  // deterministic: no clock is read; two runs over the same ledger + now are byte-identical
  const rows = [fresh, fb({ id: 'c', action: 'corrected', kind: 'C', wit: { time: { n: 1, g: 0.6, t: 'o' } } })]
  assert.deepEqual(schemaFacts(rows, { now: NOW }), schemaFacts(rows, { now: NOW }), 'pure fold — identical inputs, identical output')

  // no opts.now ⇒ neutral decay of 1 (facts stand, never silently zeroed by a missing clock)
  const noNow = subj(schemaFacts([fresh]), 'rhythm:split')
  assert.equal(noNow.recencyDecay, 1, 'no clock ⇒ no invented staleness')
})
