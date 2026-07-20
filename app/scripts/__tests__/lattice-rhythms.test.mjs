import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foldRhythms, RHYTHM_DEFAULTS } from '../../src/lib/lattice/rhythms.js'
import { SETTLE_DEFAULTS } from '../../src/lib/settlingEngine.js'

// These tests assert the LESSONS are enforced by the code, not just written in a doc
// (mirroring world-model.test.mjs). The RHYTHMS branch (§16d) produces TEMPORAL facts:
// daily shape, trip shape, splitting, calendar cadence — every one a NUDGE, never a claim.

const AT = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) // offset-applied LOCAL instant (read in UTC)
const iso = (y, mo, d) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const trip = (id, days, endMs) => ({ id, endMs, days })
const day = (isoDate, stops) => ({ isoDate, stops })
const stop = (id, name, extra = {}) => ({ id, name, ...extra })
// a FLAT photo-point record: id + trip + (optional) stop + a local instant + its vision placeType
const photo = (id, tripId, atLocalMs, extra = {}) => ({ id, tripId, atLocalMs, ...extra })
// the RAW memory row the fold ACTUALLY threads (buildLattice → all six branches): a memory
// carrying NESTED photos under photo_r2_keys_json + memory-level trip/stop, each photo ref
// carrying capturedAt + offsetMinutes + vision.placeType — exactly the shape people/places/
// devices flatten. Keyed so the flattened photo id == the memory id, so a raw-fed fact is
// byte-identical to the flat-fed one (ONLY the input shape differs).
const rawMem = (id, tripId, atLocalMs, extra = {}) => {
  const { stopId = null, placeType, ...rest } = extra
  const ref = { key: id, capturedAt: new Date(atLocalMs).toISOString(), offsetMinutes: 0 }
  if (placeType) ref.vision = { placeType }
  return { id, trip_id: tripId, stop_id: stopId, photo_r2_keys_json: JSON.stringify([ref]), ...rest }
}

const NOW = Date.UTC(2026, 6, 20)
const subj = (facts, s) => facts.find((f) => f.subject === s)

// A two-year Provincetown-shaped corpus: same names on one spot, same early-July window.
const PTOWN = [
  trip('p2024', [
    day(iso(2024, 7, 3), [stop('cot24', 'The cottage', { lat: 42.05, lng: -70.18, kind: 'base' }), stop('bch24', 'Town beach', { lat: 42.05, lng: -70.18 }), stop('hbr24', 'Harbor', { lat: 42.06, lng: -70.24 })]),
    day(iso(2024, 7, 4), []),
  ], AT(2024, 7, 5, 12)),
  trip('p2025', [
    day(iso(2025, 7, 2), [stop('cot25', 'The cottage', { lat: 42.05, lng: -70.18, kind: 'base' }), stop('bch25', 'Town beach', { lat: 42.05, lng: -70.18 }), stop('hbr25', 'Harbor', { lat: 42.06, lng: -70.24 })]),
    day(iso(2025, 7, 3), []),
  ], AT(2025, 7, 4, 12)),
]
// Beach photos at midday and dinner photos in the evening, across BOTH trips (2 distinct trips).
const PTOWN_MEMS = [
  photo('m1', 'p2024', AT(2024, 7, 3, 12, 10), { stopId: 'bch24', placeType: 'beach' }),
  photo('m2', 'p2024', AT(2024, 7, 3, 12, 40), { stopId: 'bch24', placeType: 'beach' }),
  photo('m3', 'p2024', AT(2024, 7, 3, 19, 30), { stopId: 'cot24', placeType: 'restaurant' }),
  photo('m4', 'p2025', AT(2025, 7, 2, 11, 50), { stopId: 'bch25', placeType: 'beach' }),
  photo('m5', 'p2025', AT(2025, 7, 2, 20, 5), { stopId: 'cot25', placeType: 'restaurant' }),
]
// the SAME corpus expressed as the RAW memory rows buildLattice threads (photos nested).
const PTOWN_RAW = PTOWN_MEMS.map((m) => rawMem(m.id, m.tripId, m.atLocalMs, { stopId: m.stopId, placeType: m.placeType }))

test('DAILY SHAPE: an activity gets a time-of-day prior; seen once still whispers (graded, no cutoff)', () => {
  const facts = foldRhythms(PTOWN, PTOWN_MEMS, [], { now: NOW })
  const beach = subj(facts, 'rhythm:daily:beach')
  const dinner = subj(facts, 'rhythm:daily:restaurant')
  assert.ok(beach && dinner, 'both activities produce a daily-shape fact')
  assert.ok(Math.abs(beach.value.typicalMin - 12 * 60) < 60, 'beach clusters around midday')
  assert.ok(dinner.value.typicalMin > 18 * 60, 'dinner clusters in the evening — a real boundary/time prior')
  // seen-once still whispers: a placeType in a SINGLE trip is nonzero, just fainter
  const once = foldRhythms(PTOWN.slice(0, 1), [photo('s1', 'p2024', AT(2024, 7, 3, 15, 0), { placeType: 'aquarium' })], [], { now: NOW })
  const aq = subj(once, 'rhythm:daily:aquarium')
  assert.ok(aq && aq.confidence > 0, 'seen once is still a nonzero whisper — no ≥N-trips gate')
  assert.ok(aq.confidence < beach.confidence, 'and it whispers softer than the twice-seen rhythm')
})

test('RAW-MEMORY SHAPE: the fold\'s real shape (photos nested in photo_r2_keys_json) is NOT muted', () => {
  // buildLattice threads RAW memory rows to every branch. This branch used to read placeType/
  // time at the memory ROW level and so emitted NOTHING on the nested shape — silently muting,
  // out of co-coherence with people/places/devices (which all flatten). It must flatten too:
  // a raw corpus must produce the SAME daily/split/cadence facts as the equivalent flat one.
  const raw = foldRhythms(PTOWN, PTOWN_RAW, [], { now: NOW })
  const flat = foldRhythms(PTOWN, PTOWN_MEMS, [], { now: NOW })
  assert.deepEqual(raw, flat, 'raw-memory input yields byte-identical facts to the flat-point input — no mute')
  // concretely: the daily-shape facts DID form off the nested photos, reading per-photo time
  assert.ok(subj(raw, 'rhythm:daily:beach') && subj(raw, 'rhythm:daily:restaurant'), 'daily facts form from nested photos')
  assert.ok(Math.abs(subj(raw, 'rhythm:daily:beach').value.typicalMin - 12 * 60) < 60, 'per-photo time is read (offset-applied), not a muted null')

  // TRUE per-photo flattening: ONE raw memory with TWO photos → TWO daily facts, each citing its OWN ref key
  const multi = foldRhythms([PTOWN[0]], [{
    id: 'mm', trip_id: 'p2024', stop_id: 'bch24', photo_r2_keys_json: JSON.stringify([
      { key: 'kb', capturedAt: new Date(AT(2024, 7, 3, 12, 0)).toISOString(), offsetMinutes: 0, vision: { placeType: 'beach' } },
      { key: 'kd', capturedAt: new Date(AT(2024, 7, 3, 19, 30)).toISOString(), offsetMinutes: 0, vision: { placeType: 'restaurant' } },
    ]),
  }], [], { now: NOW })
  assert.deepEqual(subj(multi, 'rhythm:daily:beach').sourceRows, ['kb'], 'a nested photo cites its OWN ref key')
  assert.deepEqual(subj(multi, 'rhythm:daily:restaurant').sourceRows, ['kd'], 'its sibling photo in the same memory cites ITS key')

  // memory-level stop is INHERITED by each photo: two raw memories on parallel stops, same minute → a split
  const parallelRaw = [
    rawMem('rs1', 'p2024', AT(2024, 7, 4, 14, 0), { stopId: 'bch24' }),
    rawMem('rs2', 'p2024', AT(2024, 7, 4, 14, 5), { stopId: 'hbr24' }),
  ]
  const split = subj(foldRhythms(PTOWN, parallelRaw, [], { now: NOW }), 'rhythm:splits')
  assert.ok(split && split.value.observedSplitDays === 1, 'parallel raw memories at two stops → a split (memory-level stop inherited per photo)')
  assert.deepEqual(split.sourceRows, ['rs1', 'rs2'], 'and it cites the two parallel photos')
})

test('CLAMP: no rhythm ever asserts — capped below certainty AND below the file/conflict criteria', () => {
  // 40 trips all doing "beach" at exactly noon: the strongest possible rhythm.
  const trips = Array.from({ length: 40 }, (_, i) => trip('t' + i, [day(iso(2000 + i, 7, 4), [stop('b' + i, 'Town beach')])], AT(2000 + i, 7, 5, 12)))
  const mems = Array.from({ length: 40 }, (_, i) => photo('mm' + i, 't' + i, AT(2000 + i, 7, 4, 12, 0), { placeType: 'beach' }))
  const beach = subj(foldRhythms(trips, mems, [], { now: NOW }), 'rhythm:daily:beach')
  assert.ok(beach.confidence <= RHYTHM_DEFAULTS.ceiling + 1e-9, 'a prior nudges; it never reaches its own ceiling')
  // the OFF-RHYTHM photo wins on its OWN evidence: a rhythm can never reach the settling
  // engine's file threshold, so a real observed reading (which can hit ~0.9) always outranks it.
  assert.ok(beach.confidence < SETTLE_DEFAULTS.crit.strong, 'below file threshold — cannot silently file a photo')
  assert.ok(beach.confidence < SETTLE_DEFAULTS.crit.conflict, 'below conflict threshold — a rhythm alone can heal softly at most')
})

test('DECAY: a habit from a family whose life moved on quietly loses its voice — then falls silent', () => {
  const oldTrips = [trip('o1', [day(iso(2015, 7, 3), [stop('s1', 'Old cabin')])], AT(2015, 7, 4, 12)), trip('o2', [day(iso(2016, 7, 3), [stop('s2', 'Old cabin')])], AT(2016, 7, 4, 12))]
  const mem = (id, tid, y) => photo(id, tid, AT(y, 7, 3, 15, 0), { placeType: 'museum' })
  const oldMems = [mem('a', 'o1', 2015), mem('b', 'o2', 2016)]
  const fresh = subj(foldRhythms(oldTrips, oldMems, [], { now: AT(2016, 8, 1, 0) }), 'rhythm:daily:museum')
  const aging = subj(foldRhythms(oldTrips, oldMems, [], { now: AT(2019, 8, 1, 0) }), 'rhythm:daily:museum')
  assert.ok(aging.confidence < fresh.confidence, 'three years on, the habit speaks softer')
  assert.ok(aging.recencyDecay < 0.4 && aging.recencyDecay < fresh.recencyDecay, 'recencyDecay is reported honestly, separate from confidence')
  // a decade on, the dead pattern fades BELOW the emit floor — decay can fully retire a
  // rhythm, so it stops dragging new photos to a place the family no longer goes.
  assert.equal(subj(foldRhythms(oldTrips, oldMems, [], { now: AT(2026, 8, 1, 0) }), 'rhythm:daily:museum'), undefined, 'ten years on it has faded to silence')
})

test('deleting a source row UNLEARNS its fact (gauge-auditable; nothing is stored)', () => {
  const withAquarium = foldRhythms(PTOWN, [...PTOWN_MEMS, photo('aq1', 'p2024', AT(2024, 7, 4, 15, 0), { placeType: 'aquarium' })], [], { now: NOW })
  const fact = subj(withAquarium, 'rhythm:daily:aquarium')
  assert.ok(fact, 'the aquarium fact exists while its source row is present')
  assert.deepEqual(fact.sourceRows, ['aq1'], 'and it cites exactly the row it was learned from')
  const without = foldRhythms(PTOWN, PTOWN_MEMS, [], { now: NOW }) // the aq1 row deleted
  assert.equal(subj(without, 'rhythm:daily:aquarium'), undefined, 'delete the row → the fact unlearns itself')
  // and dropping ONE of several source trips WEAKENS (never silently keeps the old strength)
  const beachFull = subj(foldRhythms(PTOWN, PTOWN_MEMS, [], { now: NOW }), 'rhythm:daily:beach')
  const beachHalf = subj(foldRhythms(PTOWN, PTOWN_MEMS.filter((m) => m.tripId !== 'p2025'), [], { now: NOW }), 'rhythm:daily:beach')
  assert.ok(beachHalf.confidence < beachFull.confidence, 'removing a contributing trip weakens the rhythm')
})

test('ABSENCE abstains — never a negative vote (empty corpus, unseen signals)', () => {
  assert.deepEqual(foldRhythms([], [], [], { now: NOW }), [], 'no data → no facts, not zero-facts')
  assert.deepEqual(foldRhythms(null, null, null, { now: NOW }), [], 'null-safe: still abstains cleanly')
  // a placeType never seen simply has no fact; there is no "not-beach" negative anywhere
  const facts = foldRhythms(PTOWN, PTOWN_MEMS, [], { now: NOW })
  assert.equal(subj(facts, 'rhythm:daily:nightclub'), undefined, 'an unseen activity emits nothing')
})

test('TRIP SHAPE: stay-at-base reads SETTLED, a many-stop trip reads ROAMING (no route logic)', () => {
  const settledTrip = trip('stay', [day(iso(2026, 3, 1), [stop('h', 'Grandma house')]), day(iso(2026, 3, 2), []), day(iso(2026, 3, 3), [])], AT(2026, 3, 4, 12))
  const roamTrip = trip('city', [day(iso(2026, 4, 1), [stop('a', 'Museum'), stop('b', 'Cafe'), stop('c', 'Park'), stop('d', 'Theatre')]), day(iso(2026, 4, 2), [stop('e', 'Market'), stop('f', 'Gallery')])], AT(2026, 4, 3, 12))
  const facts = foldRhythms([settledTrip, roamTrip], [], [], { now: NOW })
  const settled = subj(facts, 'rhythm:tripShape:settled')
  const roaming = subj(facts, 'rhythm:tripShape:roaming')
  assert.ok(settled && roaming, 'both shapes are learned as base-rates')
  assert.deepEqual(settled.sourceRows, ['stay'], 'the stay-at-base trip is the settled evidence')
  assert.deepEqual(roaming.sourceRows, ['city'], 'the many-stop trip is the roaming evidence')
  assert.ok(settled.confidence <= RHYTHM_DEFAULTS.ceiling, 'still a clamped nudge, not an assertion')
})

test('SPLITTING: two places at the SAME minute is a split (time+place dispose together); same day apart is NOT', () => {
  // parallel: beach at 14:00 AND harbor at 14:05 on one day → physically parallel → a split
  const parallel = [photo('s1', 'p2024', AT(2024, 7, 4, 14, 0), { stopId: 'bch24' }), photo('s2', 'p2024', AT(2024, 7, 4, 14, 5), { stopId: 'hbr24' })]
  const split = subj(foldRhythms(PTOWN, parallel, [], { now: NOW }), 'rhythm:splits')
  assert.ok(split, 'genuine simultaneity at two places → a split fact')
  assert.equal(split.value.observedSplitDays, 1)
  assert.deepEqual(split.sourceRows, ['s1', 's2'], 'it cites the two parallel photos')
  // same day but hours apart at the two places → one person walked over, NOT a split
  const sequential = [photo('q1', 'p2024', AT(2024, 7, 4, 10, 0), { stopId: 'bch24' }), photo('q2', 'p2024', AT(2024, 7, 4, 16, 0), { stopId: 'hbr24' })]
  assert.equal(subj(foldRhythms(PTOWN, sequential, [], { now: NOW }), 'rhythm:splits'), undefined, 'non-overlapping times → no split (place alone never decides)')
  // a structure ANSWER affirming a split is admitted; a "no" answer abstains, never suppresses
  const confirmed = subj(foldRhythms(PTOWN, [], [{ id: 'fb1', kind: 'structure', answer: 'yes' }], { now: NOW }), 'rhythm:splits')
  assert.ok(confirmed && confirmed.value.confirmedSplits === 1 && confirmed.sourceRows.includes('fb1'), 'a confirmed split enters as evidence')
  assert.equal(subj(foldRhythms(PTOWN, [], [{ id: 'fb2', kind: 'structure', answer: 'no' }], { now: NOW }), 'rhythm:splits'), undefined, 'a "no" answer is not a negative vote — it abstains')
})

test('CALENDAR CADENCE: a place in the same July window across YEARS gets an annual fact; one year does not', () => {
  const facts = foldRhythms(PTOWN, PTOWN_MEMS, [], { now: NOW })
  const beach = subj(facts, 'rhythm:annual:town beach')
  assert.ok(beach, 'Town beach recurs each early July across 2024 & 2025 → annual cadence')
  assert.deepEqual(beach.value.years, [2024, 2025])
  assert.ok(Math.abs(beach.value.centerDayOfYear - 184) < 14, 'centre lands in early July (~day 184)')
  assert.ok(new Set(beach.sourceRows).size === beach.sourceRows.length, 'source rows cite the recurring stops')
  // NAME-keyed, never coordinate-merged: the cottage (same spot as the beach) stays its OWN cadence
  assert.ok(subj(facts, 'rhythm:annual:the cottage'), 'stacked-on-one-spot places stay DISTINCT annual facts')
  // one year only is not an annual rhythm
  const oneYear = foldRhythms([PTOWN[0]], [], [], { now: NOW })
  assert.equal(subj(oneYear, 'rhythm:annual:town beach'), undefined, 'a place seen in a single year is not (yet) a cadence')
  // the family-season fact falls out of the trips' own dates clustering across years
  assert.ok(subj(facts, 'rhythm:season'), 'the family travels in a consistent calendar window → a season fact')
})

test('every fact carries the contract shape: clamped confidence, honest recencyDecay, cited rows', () => {
  const facts = foldRhythms(PTOWN, PTOWN_MEMS, [], { now: NOW })
  assert.ok(facts.length > 0, 'the corpus produces facts')
  for (const f of facts) {
    assert.deepEqual(Object.keys(f).sort(), ['confidence', 'recencyDecay', 'sourceRows', 'subject', 'value'], `${f.subject}: exact contract shape`)
    assert.ok(f.confidence >= 0 && f.confidence <= RHYTHM_DEFAULTS.ceiling + 1e-9, `${f.subject}: confidence clamped in [0, ceiling]`)
    assert.ok(f.confidence < SETTLE_DEFAULTS.crit.strong, `${f.subject}: a fact can NEVER reach the file threshold — it only nudges`)
    assert.ok(f.recencyDecay >= 0 && f.recencyDecay <= 1, `${f.subject}: recencyDecay is a [0,1] multiplier`)
    assert.ok(Array.isArray(f.sourceRows) && f.sourceRows.length > 0, `${f.subject}: cites at least one ledger row`)
  }
})

test('PURE + DETERMINISTIC: no clock read internally; same inputs → identical facts', () => {
  const a = foldRhythms(PTOWN, PTOWN_MEMS, [], { now: NOW })
  const b = foldRhythms(PTOWN, PTOWN_MEMS, [], { now: NOW })
  assert.deepEqual(a, b, 'a pure replay over the same rows is byte-identical')
  // omitting the clock never throws and never silently zeroes facts (decay ⇒ 1)
  const noClock = foldRhythms(PTOWN, PTOWN_MEMS, [])
  assert.ok(noClock.length === a.length, 'no opts.now → still folds (facts stand, undecayed)')
  assert.ok(noClock.every((f) => f.recencyDecay === 1), 'without a clock there is no recency to fade — reported honestly')
})
