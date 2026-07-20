// lattice-devices.test.mjs — lesson-asserting tests for the DEVICES branch of the
// world-model fact lattice (DESIGN_THE_HEALING_MODEL.md §16d). Mirrors the world-model
// test's discipline: every test pins a LESSON in the shape, not just a value — a fact
// never asserts alone, deleting a source row unlearns its fact, a real observation would
// win on its own evidence, and absence abstains.
//
// Run: node --test app/scripts/__tests__/lattice-devices.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDeviceFacts, DEVICE_DEFAULTS } from '../../src/lib/lattice/devices.js'
import { LONG_LAG_MS } from '../../src/lib/timeWitness.js'

// ---- fixtures ---------------------------------------------------------------
const NOW = Date.UTC(2026, 6, 10) // 2026-07-10
const CAP = '2026-07-04T15:00:00.000Z'
const CAP_MS = Date.parse(CAP)
const UPLOAD_PROMPT = '2026-07-04T16:00:00.000Z' // +1h → short lag
const UPLOAD_LATE = new Date(CAP_MS + LONG_LAG_MS + DAYish()).toISOString() // > 30d → long-demote
function DAYish() {
  return 2 * 86400000
}
// An in-place EXIF GPS read scores membership 1 in the bench (gaussKernel at distance 0,
// observed tier). No device EXPECTATION may reach it — that is the clamp's whole job.
const OBSERVED_GPS_MEMBERSHIP = 1

const APPLE = { make: 'Apple', model: 'iPhone 15' }
const PIXEL = { make: 'Google', model: 'Pixel 8' }

let PID = 0
const nextKey = () => 'ph' + ++PID
// A GPS-present ref: a real EXIF fix survived.
const gpsRef = (over = {}) => ({ key: nextKey(), meta: APPLE, capturedAt: CAP, atSrc: 'exif-original', offsetMinutes: -240, lat: 42.05, lng: -70.18, prov: { gps: 'exif' }, ...over })
// A GPS-stripped ref: no coordinate at all.
const noGpsRef = (over = {}) => ({ key: nextKey(), meta: APPLE, capturedAt: CAP, atSrc: 'exif-original', offsetMinutes: -240, ...over })
const mem = (id, photos, extra = {}) => ({ id, author_traveler: 'helen', createdAt: UPLOAD_PROMPT, photos, ...extra })

const survivalFact = (facts, channel, device) =>
  facts.find((f) => f.type === 'metadataSurvival' && f.value.channel === channel && (device === undefined || f.subject.device === device))
const clockFact = (facts, device) => facts.find((f) => f.type === 'clockOffset' && (device === undefined || f.subject.device === device))
const lagFact = (facts, device) => facts.find((f) => f.type === 'uploadLag' && (device === undefined || f.subject.device === device))

// ---- the lessons ------------------------------------------------------------

test('CLAMP: no device fact ever asserts — every confidence sits ≤ confirmedCeiling < 1', () => {
  const facts = buildDeviceFacts(
    [],
    [
      mem('m1', [gpsRef(), gpsRef(), noGpsRef({ meta: PIXEL }), noGpsRef({ meta: PIXEL })]),
      mem('m2', [gpsRef(), noGpsRef()]),
    ],
    // an F3-confirmed offset is the FIRMEST fact this branch can make — it must STILL clamp
    [{ id: 'f1', calibration: 'offset', person: 'helen', device: APPLE, answer: 'yes', at: NOW }],
    { now: NOW }
  )
  assert.ok(facts.length > 0, 'the corpus produces facts')
  for (const f of facts) {
    assert.ok(f.confidence >= 0 && f.confidence < 1, `${f.type} confidence in [0,1): ${f.confidence}`)
    assert.ok(f.confidence <= DEVICE_DEFAULTS.confirmedCeiling + 1e-9, `${f.type} never exceeds the confirmed clamp`)
  }
  // the confirmed one reaches the confirmed band; a measured one cannot
  const confirmed = clockFact(facts, 'apple|iphone 15')
  assert.equal(confirmed.value.source, 'confirmed')
  assert.ok(confirmed.confidence > DEVICE_DEFAULTS.deviceCeiling * 0.5, 'a confirmed fact is meaningfully firm')
})

test('METADATA-SURVIVAL: a source that strips GPS earns a POSITIVE, high-consistency hole-fact', () => {
  // 5 photos, none carrying a real GPS fix → survival 0, unanimous → this is a MEASURED
  // fact ("expect no GPS here"), never an absence.
  const facts = buildDeviceFacts([], [mem('m', [noGpsRef(), noGpsRef(), noGpsRef(), noGpsRef(), noGpsRef()])], [], { now: NOW })
  const gps = survivalFact(facts, 'gps')
  assert.ok(gps, 'a survival fact is emitted (present at 0%, not silent)')
  assert.equal(gps.value.survival, 0)
  assert.equal(gps.value.of, 5)
  assert.ok(gps.confidence > 0, 'a unanimous hole speaks')
  assert.ok(gps.confidence <= DEVICE_DEFAULTS.deviceCeiling + 1e-9, 'and it is clamped')

  // the mirror: a source that reliably KEEPS gps → survival 1, also a confident habit
  PID = 0
  const kept = buildDeviceFacts([], [mem('m', [gpsRef(), gpsRef(), gpsRef(), gpsRef(), gpsRef()])], [], { now: NOW })
  assert.equal(survivalFact(kept, 'gps').value.survival, 1)
})

test('the off-fact OBSERVATION would win: a strips-GPS habit is clamped below a real GPS read', () => {
  // A source that strips GPS on 5 of 6 photos but ONE kept a real EXIF fix. The habit-fact
  // grades the hole; it must never overpower the photo that actually carries a coordinate.
  const facts = buildDeviceFacts(
    [],
    [mem('m', [noGpsRef(), noGpsRef(), noGpsRef(), noGpsRef(), noGpsRef(), gpsRef()])],
    [],
    { now: NOW }
  )
  const gps = survivalFact(facts, 'gps')
  assert.equal(gps.value.present, 1)
  assert.equal(gps.value.of, 6)
  assert.ok(gps.confidence < OBSERVED_GPS_MEMBERSHIP, 'the expectation of a hole is weaker than a real fix — the observation wins')
  assert.ok(gps.confidence < 1)
})

test('UNLEARN: deleting the rows a fact cites removes exactly that fact', () => {
  const withStamps = buildDeviceFacts(
    [],
    [mem('m', [noGpsRef({ offsetMinutes: -300 }), noGpsRef({ offsetMinutes: -300 }), noGpsRef({ offsetMinutes: -300 })])],
    [],
    { now: NOW }
  )
  const off = clockFact(withStamps)
  assert.ok(off && off.value.offsetMinutes === -300, 'the offset fact was learned from the stamps')
  assert.ok(off.sourceRows.length === 3, 'and it cites the three rows it came from')

  // remove those rows (the source vanishes) → the fact is unlearned
  const without = buildDeviceFacts([], [mem('m', [])], [], { now: NOW })
  assert.equal(clockFact(without), undefined, 'no rows → no offset fact')

  // partial delete lowers the earned confidence (fewer rows = thinner evidence)
  PID = 0
  const three = buildDeviceFacts([], [mem('m', [noGpsRef(), noGpsRef(), noGpsRef()])], [], { now: NOW })
  PID = 0
  const one = buildDeviceFacts([], [mem('m', [noGpsRef()])], [], { now: NOW })
  assert.ok(survivalFact(one, 'gps').confidence < survivalFact(three, 'gps').confidence, 'a deleted row weakens the fact')
})

test('ABSENCE ABSTAINS: empty ledgers, an un-stamped source, an undatable lag — silence, not a zero', () => {
  assert.deepEqual(buildDeviceFacts([], [], [], { now: NOW }), [], 'nothing in → nothing out')

  // a source that NEVER stamps a tz offset → NO clock-offset fact (offset is UNKNOWN, not
  // zero) — but the survival:offset fact DOES record the hole (survival 0).
  const noOffset = buildDeviceFacts([], [mem('m', [noGpsRef({ offsetMinutes: null }), noGpsRef({ offsetMinutes: null })])], [], { now: NOW })
  assert.equal(clockFact(noOffset), undefined, 'unknown offset abstains, never guesses 0')
  assert.equal(survivalFact(noOffset, 'offset').value.survival, 0, 'the hole itself is still recorded')

  // no upload time AND no capture time → no informative lag class → NO uploadLag fact
  const noLag = buildDeviceFacts([], [{ id: 'm', author_traveler: 'helen', createdAt: null, photos: [noGpsRef({ capturedAt: null })] }], [], { now: NOW })
  assert.equal(lagFact(noLag), undefined, 'an undatable lag abstains')

  // cameraTime abstains when atSrc is unknown (absent atSrc is UNKNOWN, not a stripped clock)
  const noAtSrc = buildDeviceFacts([], [mem('m', [noGpsRef({ atSrc: null }), noGpsRef({ atSrc: null })])], [], { now: NOW })
  assert.equal(survivalFact(noAtSrc, 'cameraTime'), undefined, 'no atSrc → the cameraTime channel abstains entirely')
})

test('SOURCE KEY: person × device — two devices split, and an unknown device falls back to person (A13)', () => {
  const facts = buildDeviceFacts(
    [],
    [mem('m', [gpsRef({ meta: APPLE }), gpsRef({ meta: PIXEL }), gpsRef({ meta: null })])],
    [],
    { now: NOW }
  )
  const devices = new Set(facts.map((f) => f.subject.device))
  assert.ok(devices.has('apple|iphone 15'), 'the iPhone is its own source')
  assert.ok(devices.has('google|pixel 8'), 'the Pixel is its own source')
  assert.ok(devices.has(null), 'the make/model-less photo falls back to a person-only source')
  for (const f of facts) assert.equal(f.subject.person, 'helen', 'every source is keyed to the author')
})

test('F3 CONFIRM upgrades; a NO retires; latest answer governs', () => {
  const photos = [noGpsRef({ offsetMinutes: -240 }), noGpsRef({ offsetMinutes: -240 })]
  const measured = buildDeviceFacts([], [mem('m', photos)], [], { now: NOW })
  const before = clockFact(measured)
  assert.equal(before.value.source, 'measured')

  // a YES corroboration lifts the SAME fact into the confirmed band
  PID = 0
  const confirmed = buildDeviceFacts([], [mem('m', [noGpsRef({ offsetMinutes: -240 }), noGpsRef({ offsetMinutes: -240 })])], [{ id: 'f', calibration: 'offset', person: 'helen', device: APPLE, answer: 'yes', at: NOW }], { now: NOW })
  const after = clockFact(confirmed)
  assert.equal(after.value.source, 'confirmed')
  assert.ok(after.confidence > before.confidence, 'a human confirmation makes the fact firmer')
  assert.ok(after.sourceRows.includes('f'), 'and it cites the calibration row')

  // a confirmed OFFSET with an explicit shift stands even with ZERO measured photos
  const humanOnly = buildDeviceFacts([], [], [{ id: 'f', calibration: 'offset', person: 'dad', device: PIXEL, answer: 'yes', offsetMinutes: -60, at: NOW }], { now: NOW })
  const ho = clockFact(humanOnly)
  assert.ok(ho && ho.value.offsetMinutes === -60 && ho.value.source === 'confirmed', 'the human is the evidence when photos are absent')

  // a NO does NOT upgrade — the measured fact keeps its measured grade
  PID = 0
  const said_no = buildDeviceFacts([], [mem('m', [noGpsRef({ offsetMinutes: -240 }), noGpsRef({ offsetMinutes: -240 })])], [{ id: 'f', calibration: 'offset', person: 'helen', device: APPLE, answer: 'no', at: NOW }], { now: NOW })
  assert.equal(clockFact(said_no).value.source, 'measured', 'a no retires the hypothesis; it never boosts')

  // a NO with no measured evidence → abstain entirely (retire = silence)
  const no_and_empty = buildDeviceFacts([], [], [{ id: 'f', calibration: 'offset', person: 'x', device: PIXEL, answer: 'no', offsetMinutes: -60, at: NOW }], { now: NOW })
  assert.equal(clockFact(no_and_empty), undefined, 'a lone no manufactures nothing')

  // latest answer wins: a later NO overrides an earlier YES
  const flip = buildDeviceFacts([], [], [
    { id: 'y', calibration: 'offset', person: 'x', device: PIXEL, answer: 'yes', offsetMinutes: -60, at: NOW - 1000 },
    { id: 'n', calibration: 'offset', person: 'x', device: PIXEL, answer: 'no', at: NOW },
  ], { now: NOW })
  assert.equal(clockFact(flip), undefined, 'the later no re-grades the earlier yes away')
})

test('UPLOAD LAG rides the app\'s OWN instrument: a >30-day gap is long-demote', () => {
  const facts = buildDeviceFacts([], [mem('m', [noGpsRef({ capturedAt: CAP }), noGpsRef({ capturedAt: CAP })], { createdAt: UPLOAD_LATE })], [], { now: NOW })
  const lag = lagFact(facts)
  assert.ok(lag, 'a lag fact is emitted')
  assert.equal(lag.value.lagClass, 'long-demote', 'the timeWitness instrument classes the backfill gap')
  assert.equal(lag.value.longFraction, 1)

  // a prompt upload is NOT long-demote
  PID = 0
  const prompt = buildDeviceFacts([], [mem('m', [noGpsRef({ capturedAt: CAP }), noGpsRef({ capturedAt: CAP })], { createdAt: UPLOAD_PROMPT })], [], { now: NOW })
  assert.notEqual(lagFact(prompt).value.lagClass, 'long-demote')
})

test('IMPERFECTION IS THE MEDIUM (§13): a noisy 80% habit still speaks; a true coin-flip carries no expectation', () => {
  // 4 present / 1 absent → survival 0.8, consistency 0.6: a real (imperfect) habit, NOT muted
  const noisy = buildDeviceFacts([], [mem('m', [gpsRef(), gpsRef(), gpsRef(), gpsRef(), noGpsRef()])], [], { now: NOW })
  const nf = survivalFact(noisy, 'gps')
  assert.ok(Math.abs(nf.value.survival - 0.8) < 1e-9)
  assert.ok(nf.confidence > 0, 'an 80% channel is a real signal, never parked to silence')

  // exactly 50/50 → consistency 0 → no directional expectation (honest, not a demotion)
  PID = 0
  const flip = buildDeviceFacts([], [mem('m', [gpsRef(), gpsRef(), noGpsRef(), noGpsRef()])], [], { now: NOW })
  const ff = survivalFact(flip, 'gps')
  assert.ok(ff, 'the fact is still EMITTED (measured, not abstained)')
  assert.ok(ff.confidence < nf.confidence, 'but a coin-flip carries less expectation than an 80% habit')
})

test('DECAY: a source gone quiet fades; recencyDecay is reported and folds into confidence', () => {
  const photos = () => [noGpsRef(), noGpsRef(), noGpsRef()]
  PID = 0
  const fresh = survivalFact(buildDeviceFacts([], [mem('m', photos())], [], { now: NOW }), 'gps')
  PID = 0
  const stale = survivalFact(buildDeviceFacts([], [mem('m', photos())], [], { now: Date.UTC(2030, 0, 1) }), 'gps')
  assert.ok(stale.recencyDecay < fresh.recencyDecay, 'the older source decays more')
  assert.ok(stale.confidence < fresh.confidence, 'and the decay pulls its confidence down')
  assert.ok(fresh.recencyDecay <= 1 && stale.recencyDecay > 0)
})

test('DETERMINISM: pure replay — no clock read, order-independent, now comes from opts', () => {
  const memories = [
    mem('m1', [gpsRef(), noGpsRef({ meta: PIXEL })]),
    mem('m2', [noGpsRef(), gpsRef({ meta: PIXEL })]),
  ]
  PID = 0
  const a = buildDeviceFacts([], memories, [], { now: NOW })
  PID = 0
  const b = buildDeviceFacts([], [...memories].reverse(), [], { now: NOW })
  assert.deepEqual(a, b, 'reversing input order changes nothing (deterministic sort)')

  // now comes from opts ONLY — omitting it must not read the wall clock; decay is a no-op
  PID = 0
  const noNow = buildDeviceFacts([], [mem('m', [noGpsRef(), noGpsRef()])], [], {})
  for (const f of noNow) assert.equal(f.recencyDecay, 1, 'no now → no invented staleness (the clock is never read)')
})

test('trips is accepted but unused by design — passing rich trips changes nothing', () => {
  const memories = [mem('m', [gpsRef(), noGpsRef()])]
  PID = 0
  const withTrips = buildDeviceFacts([{ id: 't1', endMs: NOW, days: [{ isoDate: '2026-07-04', stops: [{ id: 's1' }] }] }], memories, [], { now: NOW })
  PID = 0
  const withoutTrips = buildDeviceFacts(undefined, memories, [], { now: NOW })
  assert.deepEqual(withTrips, withoutTrips, 'device facts read memories + feedback, not trip geometry')
})
