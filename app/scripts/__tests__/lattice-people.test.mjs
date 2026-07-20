import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPeopleFacts, PEOPLE_DEFAULTS } from '../../src/lib/lattice/people.js'

// ---- fixtures ---------------------------------------------------------------
const NOW = Date.UTC(2026, 6, 10)
const tripEnd = (days = 1) => Date.UTC(2026, 6, days)
// a memory row shaped like the real ledger: author on the row, vision on the photos.
const mem = (id, tripId, author, placeTypes, extra = {}) => ({
  id,
  trip_id: tripId,
  author_traveler: author,
  photo_r2_keys_json: JSON.stringify((placeTypes || []).map((pt, i) => ({ key: `${id}-${i}`, vision: { placeType: pt } }))),
  ...extra,
})
const trip = (id, endMs, days = []) => ({ id, endMs, days })
const fb = (id, by, action, kind = null, at = NOW) => ({ id, by_traveler: by, action, kind, at })

const find = (facts, pred) => facts.find(pred)
const factsOf = (facts, type) => facts.filter((f) => f.type === type)

// A person who shoots one KIND relentlessly — the strongest habit a corpus can show.
const beachObsessed = (n) => Array.from({ length: n }, (_, i) => mem(`b${i}`, `t${i}`, 'rafa', ['beach']))

// =============================================================================
test('CLAMP: a people-fact NUDGES, never asserts — no data volume lets it cross certainty', () => {
  const memories = beachObsessed(200) // rafa shoots beaches 200×, nothing else
  const trips = memories.map((m, i) => trip(m.trip_id, tripEnd(1 + i)))
  const facts = buildPeopleFacts(trips, memories, [], { now: NOW })
  const beach = find(facts, (f) => f.type === 'photographer' && f.value.placeType === 'beach')
  assert.ok(beach, 'the habit is learned')
  assert.ok(beach.confidence <= PEOPLE_DEFAULTS.confidenceCeiling + 1e-9, 'clamped at the ceiling')
  // The whole point of the clamp: it sits below the observed-witness band (currentFiling
  // 0.7 / humanConfirm 0.95) — so a real read of where the photo IS always out-votes the habit.
  assert.ok(beach.confidence < 0.7, 'a habit-prior can never out-vote an observation')
})

test('the OFF-HABIT reading wins on its own evidence — the minority is never demoted to silence (§13)', () => {
  // rafa shoots 20 beaches and exactly ONE museum. The museum reading is a real, thin signal.
  const memories = [
    ...Array.from({ length: 20 }, (_, i) => mem(`b${i}`, `t${i}`, 'rafa', ['beach'])),
    mem('m0', 't99', 'rafa', ['museum']),
  ]
  const trips = memories.map((m, i) => trip(m.trip_id, tripEnd(1 + i)))
  const facts = buildPeopleFacts(trips, memories, [], { now: NOW })
  const beach = find(facts, (f) => f.type === 'photographer' && f.value.placeType === 'beach')
  const museum = find(facts, (f) => f.type === 'photographer' && f.value.placeType === 'museum')
  assert.ok(museum, 'the one-shot museum reading STILL SPEAKS — imperfection is the medium, not a mute')
  assert.ok(museum.confidence > 0, 'a whisper, but nonzero')
  assert.ok(museum.confidence < beach.confidence, 'and honestly thinner than the 20× habit')
  // The habit stays a whisper (clamped) — so a museum photo, read by any observed witness,
  // is never dragged to "beach" by rafa's beach habit.
  assert.ok(beach.confidence < 0.7, 'the dominant habit is still only a nudge')
})

test('deleting a cited source row UNLEARNS exactly its fact (gauge-auditable)', () => {
  const withMuseum = [
    mem('b0', 't0', 'rafa', ['beach']),
    mem('b1', 't1', 'rafa', ['beach']),
    mem('m0', 't2', 'rafa', ['museum']), // the only museum evidence
  ]
  const trips = withMuseum.map((m, i) => trip(m.trip_id, tripEnd(1 + i)))
  const before = buildPeopleFacts(trips, withMuseum, [], { now: NOW })
  const museum = find(before, (f) => f.type === 'photographer' && f.value.placeType === 'museum')
  assert.ok(museum, 'museum fact exists while its row exists')
  assert.deepEqual(museum.sourceRows, ['m0'], 'and it cites exactly the row it came from')

  // remove the cited row → re-fold → the fact is gone (absence, not a lingering ghost)
  const after = buildPeopleFacts(trips, withMuseum.filter((m) => m.id !== 'm0'), [], { now: NOW })
  assert.equal(find(after, (f) => f.type === 'photographer' && f.value.placeType === 'museum'), undefined, 'unlearned')
  // and dropping one of two beach rows weakens (never strengthens) the beach fact
  const beachBefore = find(before, (f) => f.value.placeType === 'beach').confidence
  const beachAfter = find(
    buildPeopleFacts(trips, withMuseum.filter((m) => m.id !== 'b1'), [], { now: NOW }),
    (f) => f.value.placeType === 'beach'
  ).confidence
  assert.ok(beachAfter < beachBefore, 'fewer cited rows → a thinner fact')
})

test('ABSENCE abstains, everywhere — never a negative vote', () => {
  // one author, one place-kind, NO feedback at all
  const facts = buildPeopleFacts([trip('t0', tripEnd(1))], [mem('a0', 't0', 'rafa', ['beach'])], [], { now: NOW })
  assert.equal(factsOf(facts, 'curation').length, 0, 'no feedback ledger → no curation facts (abstain, not zero)')
  assert.equal(factsOf(facts, 'voice').length, 0, 'no answers → no voice facts')
  assert.equal(find(facts, (f) => f.type === 'photographer' && f.value.placeType === 'museum'), undefined, 'a kind never shot → no fact')
  // a memory with NO AUTHOR can't be attributed to anyone → it contributes to NOTHING,
  // in any branch (author is the subject of every people-fact).
  const noAuthor = buildPeopleFacts([trip('tz', tripEnd(1))], [mem('a0', 'tz', null, ['beach'])], [], { now: NOW })
  assert.equal(noAuthor.length, 0, 'no author → the whole fold abstains')
  // a photo with NO VISION mutes only the photographer branch — presence (a real, author-
  // attributed scene) still legitimately reads, so absence is scoped to the channel it's absent in.
  const noVision = buildPeopleFacts(
    [trip('tz', tripEnd(1))],
    [{ id: 'x', trip_id: 'tz', author_traveler: 'dad', photo_r2_keys_json: '[{"key":"k"}]' }],
    [],
    { now: NOW }
  )
  assert.equal(factsOf(noVision, 'photographer').length, 0, 'no vision → no photographer fact (absence, not a zero)')
})

test('SCALE HONESTY: a thin habit shrinks toward the family parent; a thick one approaches raw', () => {
  // family baseline: beach is RARE overall (dad shoots 10 restaurants), so rafa's single
  // beach photo should be pulled DOWN toward that low parent, not asserted at share≈1.
  const family = [
    mem('r0', 't0', 'rafa', ['beach']), // rafa: 1 photo, all beach (raw share 1.0)
    ...Array.from({ length: 10 }, (_, i) => mem(`d${i}`, `t${i + 1}`, 'dad', ['restaurant'])),
  ]
  const trips = family.map((m, i) => trip(m.trip_id, tripEnd(1 + i)))
  const facts = buildPeopleFacts(trips, family, [], { now: NOW })
  const rafaBeach = find(facts, (f) => f.type === 'photographer' && f.subject === 'rafa')
  assert.ok(rafaBeach.value.share < 0.6, 'one photo does NOT assert a habit — it shrinks toward the (low) family baseline')
  assert.ok(rafaBeach.value.share > 0, 'but it is not erased')

  // now give rafa a thick beach record → the estimate climbs back toward raw ~1
  const thick = [...Array.from({ length: 40 }, (_, i) => mem(`r${i}`, `rt${i}`, 'rafa', ['beach'])), ...family.filter((m) => m.author_traveler === 'dad')]
  const thickTrips = thick.map((m, i) => trip(m.trip_id, tripEnd(1 + i)))
  const rafaThick = find(buildPeopleFacts(thickTrips, thick, [], { now: NOW }), (f) => f.type === 'photographer' && f.subject === 'rafa')
  assert.ok(rafaThick.value.share > rafaBeach.value.share, 'more data → less shrinkage → closer to raw')
})

test('DECAY: a member gone quiet fades; and it is deterministic in `now` (no clock read)', () => {
  const memories = [mem('a0', 't0', 'rafa', ['beach', 'beach'])]
  const trips = [trip('t0', Date.UTC(2020, 0, 1))] // last active in 2020
  const fresh = buildPeopleFacts(trips, memories, [], { now: Date.UTC(2020, 0, 20) })
  const stale = buildPeopleFacts(trips, memories, [], { now: Date.UTC(2026, 0, 1) })
  const fBeach = find(fresh, (f) => f.type === 'photographer')
  const sBeach = find(stale, (f) => f.type === 'photographer')
  assert.ok(sBeach.recencyDecay < fBeach.recencyDecay, 'years of silence fade the fact')
  assert.ok(sBeach.confidence < fBeach.confidence, 'the confidence follows the decay')
  // PURE: same inputs + same now → byte-identical output (nothing read from the wall clock)
  assert.deepEqual(buildPeopleFacts(trips, memories, [], { now: NOW }), buildPeopleFacts(trips, memories, [], { now: NOW }))
  // and with no `now` supplied we DON'T invent staleness (recencyDecay stays 1) rather than call Date.now
  assert.equal(find(buildPeopleFacts(trips, memories, [], {}), (f) => f.type === 'photographer').recencyDecay, 1)
})

test('presence & groupings: who is together, and who SPLITS OFF', () => {
  // two shared days (rafa+dad both file), plus one day rafa is alone
  const memories = [
    mem('r1', 'tp', 'rafa', ['beach'], { stop_id: 's1' }),
    mem('d1', 'tp', 'dad', ['beach'], { stop_id: 's1' }), // day 1: together
    mem('r2', 'tp', 'rafa', ['restaurant'], { stop_id: 's2' }),
    mem('d2', 'tp', 'dad', ['restaurant'], { stop_id: 's2' }), // day 2: together
    mem('r3', 'tp', 'rafa', ['museum'], { stop_id: 's3' }), // day 3: rafa alone
  ]
  const trips = [trip('tp', tripEnd(5), [
    { isoDate: '2026-07-01', stops: [{ id: 's1' }] },
    { isoDate: '2026-07-02', stops: [{ id: 's2' }] },
    { isoDate: '2026-07-03', stops: [{ id: 's3' }] },
  ])]
  const facts = buildPeopleFacts(trips, memories, [], { now: NOW })
  const co = find(facts, (f) => f.type === 'copresence')
  assert.ok(co, 'a co-presence fact forms for the pair')
  assert.deepEqual(co.subject, ['dad', 'rafa'], 'subject is the (sorted) pair')
  assert.ok(co.confidence <= PEOPLE_DEFAULTS.confidenceCeiling + 1e-9, 'still a clamped nudge')
  const soloRafa = find(facts, (f) => f.type === 'solo' && f.subject === 'rafa')
  const soloDad = find(facts, (f) => f.type === 'solo' && f.subject === 'dad')
  assert.ok(soloRafa, 'rafa split off on day 3 → a solo fact')
  assert.equal(soloDad, undefined, 'dad was never alone → no solo fact (absence abstains)')
  assert.ok(soloRafa.value.share > 0, 'the split reads as a real, graded fact')
})

test('curation styles & answer-routing voice from the feedback ledger', () => {
  const feedback = [
    fb(1, 'mom', 'confirmed', 'A'),
    fb(2, 'mom', 'confirmed', 'A'),
    fb(3, 'mom', 'corrected', 'C'),
    fb(4, 'dad', 'aside', 'D'),
    fb(5, 'dad', 'corrected', 'C'),
  ]
  const facts = buildPeopleFacts([], [], feedback, { now: NOW })
  // curation: mom mostly confirms
  const momConfirm = find(facts, (f) => f.type === 'curation' && f.subject === 'mom' && f.value.action === 'confirmed')
  assert.ok(momConfirm, "mom's confirm-style is learned")
  assert.deepEqual(momConfirm.sourceRows, ['1', '2'], 'and it cites the exact feedback rows')
  assert.ok(momConfirm.confidence <= PEOPLE_DEFAULTS.confidenceCeiling + 1e-9, 'a curation fact is a clamped nudge too')
  // voice: class C is answered by both mom and dad → two routing facts for kind C
  const cVoices = facts.filter((f) => f.type === 'voice' && f.value.kind === 'C')
  assert.equal(cVoices.length, 2, 'both answerers of class C get a WHO-routing fact')
  assert.ok(cVoices.every((f) => f.sourceRows.length > 0), 'every voice fact cites its ledger rows')
  // absence: nobody answered class B → no kind-B voice fact
  assert.equal(facts.filter((f) => f.type === 'voice' && f.value.kind === 'B').length, 0, 'unasked class → abstain')
})
