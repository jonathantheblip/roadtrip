// calibratePlan.test.mjs — LESSON-ASSERTING tests for F3 CALIBRATION
// (BUILD_SPECS_GLANCE_ENGINE.md F3 lines 170-246 + A2/A13). Each test pins one of
// F3's enumerated O4 tests as a LESSON in the shape, not a value:
//   1. no measurement → no question (fishing is structurally impossible)
//   2. WHO-routing: the owner only, never Rafa, never a third party's device
//   3. a YES re-grades EXACTLY the pattern's evidence — other devices/channels
//      BIT-IDENTICAL before/after (proved end-to-end through the real consumer)
//   4. a YES can NEVER move a manual/'confirmed' filing (D13 holds)
//   5. a NO retires the hypothesis (not re-asked below the strengthen threshold)
//      and changes zero grading
//   6. the settle receipt has no digits; the later actual = the measured value
//   7. magnitude ALWAYS equals the instrument's estimate, never a human number
//
// Test 3 & 7 feed calibratePlan's OWN feedback row into the SETTLED consumer
// (lattice/devices.js buildDeviceFacts) — proving A3 (one fold, not two) and that
// the producer's row grades exactly the source it names and no other.
//
// Run: node --test app/scripts/__tests__/calibratePlan.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  askableCalibrations,
  calibratePlan,
  patternFromMeasurement,
  deviceKeyOf,
  sourceKeyOf,
  CALIBRATE_DEFAULTS,
} from '../../src/lib/calibratePlan.js'
import { buildDeviceFacts, DEVICE_DEFAULTS } from '../../src/lib/lattice/devices.js'
import { LONG_LAG_MS } from '../../src/lib/timeWitness.js'

// ---- fixtures ---------------------------------------------------------------
const NOW = Date.UTC(2026, 6, 20)
const CAP = '2026-07-04T15:00:00.000Z'
const CAP_MS = Date.parse(CAP)
const UPLOAD_LATE = new Date(CAP_MS + LONG_LAG_MS + 2 * 86400000).toISOString() // > 30d ⇒ importLagClass 'long-demote'

const APPLE = { make: 'Apple', model: 'iPhone 15' }
const PIXEL = { make: 'Google', model: 'Pixel 8' }

let PID = 0
const nextKey = () => 'ph' + ++PID
// A ref that stamps a stable clock offset AND lands long after capture (long-demote).
const lateOffsetRef = (over = {}) => ({
  key: nextKey(),
  meta: APPLE,
  capturedAt: CAP,
  atSrc: 'exif-original',
  offsetMinutes: -240,
  ...over,
})
const mem = (id, photos, extra = {}) => ({ id, author_traveler: 'helen', createdAt: UPLOAD_LATE, photos, ...extra })

// A measured, ASKABLE lag pattern for helen's Apple (5 long-demote reads dominate).
const helenLagMeasurement = { kind: 'lag', person: 'helen', device: APPLE, longDemote: 5, informativeTotal: 6 }
// A measured, ASKABLE offset pattern for helen's Apple (converging on -240).
const helenOffsetMeasurement = { kind: 'offset', person: 'helen', device: APPLE, offsets: [-240, -240, -240, -240] }

const askOne = (m, opts) => {
  const set = askableCalibrations([m], opts)
  return set[0] || null
}

// ---- 1. no measurement → no calibration question ----------------------------
test('F3#1 fishing is structurally impossible — no measurement, no question', () => {
  assert.deepEqual(askableCalibrations([], {}), [], 'nothing measured ⇒ nothing askable')
  assert.deepEqual(askableCalibrations(null, {}), [], 'null input ⇒ empty, never a throw')

  // below-threshold lag (two stray late photos, not a habit) ⇒ not askable
  assert.equal(askOne({ kind: 'lag', person: 'helen', device: APPLE, longDemote: 2, informativeTotal: 10 }), null)
  // lag present but NOT dominant (late 30% of the time) ⇒ not a habit ⇒ not askable
  assert.equal(askOne({ kind: 'lag', person: 'helen', device: APPLE, longDemote: 4, informativeTotal: 20 }), null)
  // a wandering clock (wide spread) is not a constant offset ⇒ not askable
  assert.equal(askOne({ kind: 'offset', person: 'helen', device: APPLE, offsets: [-240, -180, -300] }), null)
  // too few corroborations ⇒ not askable
  assert.equal(askOne({ kind: 'offset', person: 'helen', device: APPLE, offsets: [-240, -240] }), null)

  // a channel abstraction is NEVER human-knowable ⇒ structurally unaskable
  assert.equal(askOne({ kind: 'scene', person: 'helen', device: APPLE, longDemote: 99, informativeTotal: 99 }), null)

  // the real, measured patterns DO surface
  assert.ok(askOne(helenLagMeasurement), 'a dominant long-demote habit is askable')
  assert.ok(askOne(helenOffsetMeasurement), 'a converging offset is askable')
})

// ---- 2. WHO-routing: owner only, never Rafa, never a third party's device ----
test('F3#2 WHO-routing — the pattern owner only, never Rafa, never cross-routed', () => {
  const p = askOne(helenLagMeasurement)
  assert.equal(p.who, 'helen', 'routed to the pattern OWNER, second person')
  assert.equal(p.person, 'helen')

  // Rafa is never asked a calibration, even with a real measured pattern.
  assert.equal(askOne({ ...helenLagMeasurement, person: 'rafa' }), null, 'never Rafa')
  assert.equal(askOne({ ...helenOffsetMeasurement, person: 'rafa' }), null, 'never Rafa (offset either)')

  // A batch of measurements for different owners never cross-routes: each question's
  // `who` is its OWN measurement's owner — no third party is ever asked about a device.
  const set = askableCalibrations(
    [helenLagMeasurement, { ...helenOffsetMeasurement, person: 'dad' }, { ...helenLagMeasurement, person: 'rafa' }],
    {}
  )
  assert.equal(set.length, 2, 'Rafa dropped; helen + dad remain')
  for (const q of set) assert.equal(q.who, q.person, 'each question routes only to its own owner')
  assert.ok(!set.some((q) => q.who === 'rafa'))

  // A missing device falls back to the person-only source (A13), still askable + routed.
  const noDev = askOne({ kind: 'lag', person: 'helen', longDemote: 5, informativeTotal: 6 })
  assert.ok(noDev, 'device-unknown pattern is still askable')
  assert.equal(noDev.device, null, 'A13 fallback: person-only source')
  assert.equal(noDev.who, 'helen')
})

// ---- 3. a YES re-grades EXACTLY the pattern's evidence; others bit-identical --
test('F3#3 a YES re-grades only the named source — other devices/channels bit-identical', () => {
  // The plan itself declares the hard bounds.
  const p = askOne(helenLagMeasurement)
  const plan = calibratePlan({ pattern: p, answer: 'yes' }, { now: NOW })
  assert.equal(plan.regrade.branch, 'devices')
  assert.equal(plan.regrade.fact, 'uploadLag')
  assert.deepEqual(plan.regrade.source, { person: 'helen', device: 'apple|iphone 15' })
  assert.equal(plan.regrade.touchesWitnessMultipliers, false)
  assert.equal(plan.regrade.touchesOtherDevices, false)
  assert.equal(plan.regrade.touchesOtherChannels, false)
  assert.equal(plan.regrade.regrades.channel, 'time')

  // END-TO-END through the SETTLED consumer: a corpus with TWO sources — helen/Apple
  // (the calibrated one) and dad/Pixel (an unrelated source with its own facts).
  PID = 0
  const memories = [
    mem('m1', [lateOffsetRef(), lateOffsetRef(), lateOffsetRef()]), // helen/Apple: lag + offset facts
    mem('m2', [lateOffsetRef({ meta: PIXEL, offsetMinutes: -300 })], { id: 'm2', author_traveler: 'dad' }),
  ]
  const baseline = buildDeviceFacts([], memories, [], { now: NOW })
  const withYes = buildDeviceFacts([], memories, [plan.feedbackRow], { now: NOW })

  const dadFactsBase = baseline.filter((f) => f.subject.person === 'dad')
  const dadFactsYes = withYes.filter((f) => f.subject.person === 'dad')
  assert.deepEqual(dadFactsYes, dadFactsBase, 'the OTHER source (dad/Pixel) is byte-identical before/after')

  // helen's lag fact DID lift to the confirmed grade…
  const helenLagBase = baseline.find((f) => f.type === 'uploadLag' && f.subject.person === 'helen')
  const helenLagYes = withYes.find((f) => f.type === 'uploadLag' && f.subject.person === 'helen')
  assert.equal(helenLagBase.value.source, 'measured')
  assert.equal(helenLagYes.value.source, 'confirmed')
  assert.ok(helenLagYes.confidence > helenLagBase.confidence, 'the confirmed lag is firmer')
  assert.ok(helenLagYes.confidence <= DEVICE_DEFAULTS.confirmedCeiling + 1e-9, 'still clamped — a nudge, not an assertion')

  // …while a DIFFERENT CHANNEL on the SAME source (its clock-offset fact) keeps its
  // measured value untouched by a LAG calibration (per-kind, not one knob).
  const helenOffBase = baseline.find((f) => f.type === 'clockOffset' && f.subject.person === 'helen')
  const helenOffYes = withYes.find((f) => f.type === 'clockOffset' && f.subject.person === 'helen')
  assert.equal(helenOffYes.value.source, 'measured', 'a lag YES never confirms the clock-offset channel')
  assert.deepEqual(helenOffYes.value, helenOffBase.value, 'the other channel value is unchanged')
})

// ---- 4. a YES can never move a manual/'confirmed' filing (D13 holds) ---------
test('F3#4 a YES never files a photo and never crosses a D13 lock', () => {
  const plan = calibratePlan({ pattern: askOne(helenOffsetMeasurement), answer: 'yes' }, { now: NOW })
  assert.equal(plan.regrade.filesPhotos, false, 'a calibration re-grades evidence; it never files a photo')
  assert.equal(plan.regrade.movesLockedFilings, false, 'manual/confirmed filings are untouchable')
  assert.equal(plan.regrade.silencesChannel, false, 'a trust tier shifts; nothing zeroes')
  // the corpus-wide re-settle it triggers moves AUTO-tier filings ONLY, locks holding.
  assert.equal(plan.reSettle.scope, 'corpus')
  assert.equal(plan.reSettle.locksHold, true)
  assert.equal(plan.reSettle.movesFilingTier, 'auto-only')
  assert.equal(plan.reSettle.gate, 'shadow', 'shadow-gated, per the promotion posture')
  // the feedback row carries NO stop filing (no memory move rides a calibration).
  assert.equal('stopFilings' in plan, false)
  assert.equal('memoryIds' in plan.feedbackRow, false)
})

// ---- 5. a NO retires the hypothesis and changes zero grading -----------------
test('F3#5 a NO retires the hypothesis (not re-asked below strengthen) and grades nothing', () => {
  const p = askOne(helenLagMeasurement) // strength 5
  const plan = calibratePlan({ pattern: p, answer: 'no' }, { now: NOW })
  assert.equal(plan.regrade, null, 'a NO re-grades nothing')
  assert.ok(plan.retire, 'a NO retires the hypothesis')
  assert.equal(plan.retire.changesGrading, false)
  assert.equal(plan.retire.recorded, true, 'recorded in the same ledger row — never noise')
  assert.equal(plan.feedbackRow.answer, 'no')
  assert.equal(plan.feedbackRow.strengthAtAnswer, 5, 'the strength at answer is recorded for the re-ask gate')

  // END-TO-END: a NO row leaves the consumer's grading exactly at the measured default.
  PID = 0
  const memories = [mem('m1', [lateOffsetRef(), lateOffsetRef(), lateOffsetRef()])]
  const baseline = buildDeviceFacts([], memories, [], { now: NOW })
  const withNo = buildDeviceFacts([], memories, [plan.feedbackRow], { now: NOW })
  const lagBase = baseline.find((f) => f.type === 'uploadLag' && f.subject.person === 'helen')
  const lagNo = withNo.find((f) => f.type === 'uploadLag' && f.subject.person === 'helen')
  assert.equal(lagNo.value.source, 'measured', 'a NO keeps the default measured grading')
  assert.deepEqual(lagNo.value, lagBase.value, 'grading is byte-identical to no-answer')

  // the re-ask gate: a retired hypothesis is NOT re-asked at the same strength…
  const priorNo = [{ calibration: 'lag', person: 'helen', device: APPLE, answer: 'no', strengthAtAnswer: 5, at: NOW }]
  assert.equal(askOne(helenLagMeasurement, { priorAnswers: priorNo }), null, 'not re-asked below the strengthen threshold')
  // …nor until it more-than-doubles (strengthenFactor 2): strength 9 (< 10) still silent.
  assert.equal(
    askOne({ kind: 'lag', person: 'helen', device: APPLE, longDemote: 9, informativeTotal: 10 }, { priorAnswers: priorNo }),
    null,
    'still below 2× ⇒ still not re-asked'
  )
  // …only a materially strengthened measurement (10 ≥ 2×5) re-qualifies.
  assert.ok(
    askOne({ kind: 'lag', person: 'helen', device: APPLE, longDemote: 10, informativeTotal: 10 }, { priorAnswers: priorNo }),
    'a materially strengthened measurement re-qualifies'
  )
})

test('F3#5b a prior YES settles the question — it is not re-asked (A2)', () => {
  const priorYes = [{ calibration: 'lag', person: 'helen', device: APPLE, answer: 'yes', at: NOW }]
  assert.equal(askOne(helenLagMeasurement, { priorAnswers: priorYes }), null, 'a confirmed class retires the question')
})

// ---- 6. the settle receipt has no digits; the later actual = the measured value
test('F3#6 receipt is words only (no digits); the later actual equals the measured number', () => {
  const yesOff = calibratePlan({ pattern: askOne(helenOffsetMeasurement), answer: 'yes' }, { now: NOW, personName: 'Helen' })
  assert.ok(!/\d/.test(yesOff.receiptWords), `offset receipt has no digit: "${yesOff.receiptWords}"`)
  // the measured actual is carried for the show mode to report LATER — never in the receipt.
  assert.equal(yesOff.actualForLater.offsetMinutes, -240, 'the later actual = the instrument number')
  assert.ok(!yesOff.receiptWords.includes('240') && !yesOff.receiptWords.includes('-240'))

  const yesLag = calibratePlan({ pattern: askOne(helenLagMeasurement), answer: 'yes' }, { now: NOW, personName: 'Helen' })
  assert.ok(!/\d/.test(yesLag.receiptWords), `lag receipt has no digit: "${yesLag.receiptWords}"`)
  assert.equal(yesLag.actualForLater.lagClass, 'long-demote')

  const noLag = calibratePlan({ pattern: askOne(helenLagMeasurement), answer: 'no' }, { now: NOW, personName: 'Helen' })
  assert.ok(!/\d/.test(noLag.receiptWords), 'a NO receipt has no digit either')
  assert.equal(noLag.actualForLater, null, 'a NO moved nothing ⇒ no later actual')
  // the ledger row is digit-honest for a lag (its magnitude is a CLASS, not a number).
  assert.equal(yesLag.feedbackRow.offsetMinutes, null)
})

// ---- 7. magnitude ALWAYS equals the instrument's estimate, never a human number
test('F3#7 magnitude comes from the instrument, never a human-supplied value', () => {
  const p = askOne(helenOffsetMeasurement) // instrument converged on -240
  assert.equal(p.magnitude, -240, 'the pattern magnitude is the measured mode')

  // Even handed a bogus human number in opts, the plan uses ONLY the instrument's.
  const plan = calibratePlan({ pattern: p, answer: 'yes' }, { now: NOW, humanOffsetMinutes: 999, offsetMinutes: 999 })
  assert.equal(plan.feedbackRow.offsetMinutes, -240, 'the row carries the instrument number, not the human red-herring')
  assert.equal(plan.regrade.effect.magnitude, -240)
  assert.equal(plan.regrade.effect.magnitudeSource, 'instrument')

  // And the CONSUMER, too, takes the magnitude from the measured mode — a hostile row
  // that lied about offsetMinutes would still grade to the photos' own measured shift.
  PID = 0
  const memories = [mem('m1', [lateOffsetRef(), lateOffsetRef(), lateOffsetRef()])] // all offsetMinutes -240
  const lyingRow = { calibration: 'offset', person: 'helen', device: APPLE, answer: 'yes', offsetMinutes: 999, at: NOW, id: 'x' }
  const facts = buildDeviceFacts([], memories, [lyingRow], { now: NOW })
  const off = facts.find((f) => f.type === 'clockOffset' && f.subject.person === 'helen')
  assert.equal(off.value.offsetMinutes, -240, 'the consumer uses the MEASURED mode, never the row-supplied number')
  assert.equal(off.value.source, 'confirmed', 'the YES still lifts it to the confirmed grade')
})

// ---- provenance + shape guards (grounding the derived-tier claim) ------------
test('offset YES re-grades at the EXISTING derived provenance — PROV_OFF untouched', () => {
  const plan = calibratePlan({ pattern: askOne(helenOffsetMeasurement), answer: 'yes' }, { now: NOW })
  assert.equal(plan.regrade.regrades.provenance, 'inferred-manual', 'a real, derived PROV_OFF value')
  assert.equal(plan.regrade.regrades.provTier, 'derived')
  assert.equal(plan.regrade.regrades.provValuesUntouched, true, 'PROV_OFF_VALUES is never widened by a calibration')
})

test('device + source keys canonicalise to the SAME key a photo ref mints (A13)', () => {
  assert.equal(deviceKeyOf(APPLE), 'apple|iphone 15')
  assert.equal(deviceKeyOf('Apple|iPhone 15'), 'apple|iphone 15', 'string + object canonicalise identically')
  assert.equal(deviceKeyOf(null), null, 'unknown device ⇒ null ⇒ person-only fallback')
  assert.equal(sourceKeyOf('helen', 'apple|iphone 15'), 'helen::apple|iphone 15')
  // the pattern's canonical device matches what devices.js keys the photos on
  assert.equal(patternFromMeasurement(helenLagMeasurement).device, 'apple|iphone 15')
})

test('a malformed pattern or answer is a residue-free skip, never a half-write', () => {
  assert.equal(calibratePlan({ pattern: null, answer: 'yes' }).skip, true)
  assert.equal(calibratePlan({ pattern: askOne(helenLagMeasurement), answer: 'maybe' }).skip, true)
  const skip = calibratePlan({ pattern: { kind: 'scene', person: 'helen' }, answer: 'yes' })
  assert.equal(skip.skip, true)
  assert.equal(skip.regrade, null)
  assert.equal(skip.retire, null)
  assert.equal(skip.receiptWords, '', 'no copy promises an effect that cannot happen')
})

test('the defaults are declared seeds, present and sane', () => {
  assert.ok(CALIBRATE_DEFAULTS.lagMinEvidence >= 1)
  assert.ok(CALIBRATE_DEFAULTS.offsetMaxSpreadMin >= 0)
  assert.ok(CALIBRATE_DEFAULTS.strengthenFactor > 1, 'a retired hypothesis must materially strengthen')
  assert.equal(CALIBRATE_DEFAULTS.rafaId, 'rafa')
})
