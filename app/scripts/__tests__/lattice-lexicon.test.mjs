import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLexicon, aliasesForStop, LEXICON_DEFAULTS, normName } from '../../src/lib/lattice/lexicon.js'
import { BENCH_DEFAULTS } from '../../src/lib/evidenceBench.js'

// ---- fixtures --------------------------------------------------------------
const NOW = Date.UTC(2026, 6, 20)
const day = (ms) => Date.UTC(2026, 6, 4) + ms
// a trip whose stop s1 was christened "The Jetty Spot" (verbatim birth certificate);
// s2 ("Town Beach") is an ordinary geocoded stop; base/synthetic ids are NOT stops.
const tripWith = (stops) => ({ id: 't1', days: [{ isoDate: '2026-07-04', stops }] })
const CHRISTENED = { id: 's1', name: 'The Jetty Spot', origin: { christened: { by: 'dad', at: day(0) } } }
const PLAIN = { id: 's2', name: 'Town Beach' }
const cap = (id, stopId, caption, at = day(0), extra = {}) => ({ id, trip_id: 't1', stop_id: stopId, caption, created_at: at, ...extra })

// ---- 1. a fact NEVER asserts alone (the CLAMP holds) -----------------------
test('CLAMP: even a heavily christened + captioned name stays well below certainty', () => {
  const memories = Array.from({ length: 20 }, (_, i) => cap('m' + i, 's1', 'the jetty spot', day(i * 60000)))
  const { byStop } = buildLexicon([tripWith([CHRISTENED, PLAIN])], memories, [], { now: NOW })
  const [top] = byStop.get('s1')
  assert.ok(top.confidence <= LEXICON_DEFAULTS.lexiconCeiling + 1e-9, 'capped at the ceiling')
  assert.ok(top.confidence < 0.55, 'a name nudges matching + warmth; it never asserts')
})

// ---- 2. the off-fact OBSERVATION would win on its own evidence --------------
test('a name is clamped BELOW every observed human signal, so an off-place act always wins', () => {
  // s1 named endlessly; s2 barely known. If a photo truly belongs to s2, its own evidence
  // (a filing 0.7 / a confirm 0.95 / a legible sign ~1) must out-vote s1's warm name.
  const memories = Array.from({ length: 40 }, (_, i) => cap('m' + i, 's1', 'the jetty spot', day(i * 60000)))
  const { byStop } = buildLexicon([tripWith([CHRISTENED, PLAIN])], memories, [], { now: NOW })
  const strongest = byStop.get('s1')[0].confidence
  assert.ok(strongest < BENCH_DEFAULTS.currentFilingWeight, 'below a mere current filing (0.7)')
  assert.ok(strongest < BENCH_DEFAULTS.humanConfirmWeight, 'below a human confirm (0.95)')
  assert.ok(strongest < 1, 'below a legible sign naming the other place')
})

// ---- 3. same name, two stops → two DISTINCT facts (A9; the founding lesson) --
test('A9: a shared name never collapses two places, and one alias never leaks to the other', () => {
  const trip = { id: 't1', days: [{ isoDate: '2026-07-04', stops: [{ id: 'beachA', name: 'The Beach' }, { id: 'beachB', name: 'The Beach' }] }] }
  const memories = [cap('m1', 'beachA', 'the beach'), cap('m2', 'beachB', 'the beach')]
  const { facts, byStop } = buildLexicon([trip], memories, [], { now: NOW })
  assert.equal(facts.length, 2, 'two stops the family both call "the beach" stay TWO facts')
  assert.deepEqual(byStop.get('beachA')[0].sourceRows, ['m1'], "beachA cites only beachA's memory")
  assert.deepEqual(byStop.get('beachB')[0].sourceRows, ['m2'], 'the alias never leaks across the identity boundary')
})

// ---- 4. deleting a source row UNLEARNS its fact ----------------------------
test('UNLEARN: drop the only memory that named a stop and its alias vanishes on replay', () => {
  const trip = tripWith([PLAIN])
  const withCap = buildLexicon([trip], [cap('m1', 's2', 'the sandbar')], [], { now: NOW })
  assert.equal(withCap.byStop.get('s2')[0].value, 'the sandbar', 'the caption taught the alias')
  assert.deepEqual(withCap.byStop.get('s2')[0].sourceRows, ['m1'], 'and cited the row it came from')
  const withoutCap = buildLexicon([trip], [], [], { now: NOW }) // the row is gone
  assert.equal(withoutCap.facts.length, 0, 'no row → no fact: the alias unlearned itself')
  const tombstoned = buildLexicon([trip], [cap('m1', 's2', 'the sandbar', day(0), { deleted_at: day(1000) })], [], { now: NOW })
  assert.equal(tombstoned.facts.length, 0, 'a tombstoned memory contributes nothing either')
})

// ---- 5. ABSENCE abstains — never a negative vote ---------------------------
test('absence abstains: no name, unfiled, synthetic id, and narration all yield NO fact', () => {
  const trip = tripWith([PLAIN])
  assert.equal(buildLexicon([trip], [], [], { now: NOW }).facts.length, 0, 'a stop with no name → no fact')
  assert.equal(buildLexicon([trip], [cap('m1', null, 'the sandbar')], [], { now: NOW }).facts.length, 0, 'unfiled caption → abstain')
  assert.equal(buildLexicon([trip], [cap('m1', '__trip_base__:2026-07-04', 'the sandbar')], [], { now: NOW }).facts.length, 0, 'a base/synthetic id names nothing → abstain')
  const narration = 'what a beautiful sunset over the harbor tonight'
  assert.equal(buildLexicon([trip], [cap('m1', 's2', narration)], [], { now: NOW }).facts.length, 0, 'a long narration is not a naming use → abstain, not a negative')
  const allFiller = buildLexicon([trip], [cap('m1', 's2', 'at the')], [], { now: NOW })
  assert.equal(allFiller.facts.length, 0, 'an all-stopword caption carries no name → abstain')
})

// ---- 6. source-graded, never felt: christening > caption -------------------
test('a christening outweighs a caption by a measured seed, not a judgment', () => {
  const trip = tripWith([CHRISTENED, PLAIN])
  const { byStop } = buildLexicon([trip], [cap('m1', 's2', 'town beach')], [], { now: NOW })
  const christened = byStop.get('s1')[0].confidence // s1 named by christening only
  const captioned = byStop.get('s2')[0].confidence // s2 named by one caption only
  assert.ok(christened > captioned && captioned > 0, 'the spoken name leads; the caption still whispers')
})

// ---- 7. smooth growth, NO cutoff (the §13 drift refused) -------------------
test('one caption still whispers; repeats grow the alias smoothly (no ≥N gate)', () => {
  const trip = tripWith([PLAIN])
  const once = buildLexicon([trip], [cap('m1', 's2', 'the cove')], [], { now: NOW }).byStop.get('s2')[0]
  const thrice = buildLexicon([trip], [cap('m1', 's2', 'the cove'), cap('m2', 's2', 'the cove'), cap('m3', 's2', 'the cove')], [], { now: NOW }).byStop.get('s2')[0]
  assert.ok(once.confidence > 0, 'a single caption is a real (if faint) alias — never zero')
  assert.ok(thrice.confidence > once.confidence, 'said three times, it is stronger — smoothly, no cliff')
  assert.equal(thrice.sourceRows.length, 3, 'and it cites all three rows')
})

// ---- 8. DECAY: a name unused for years quietly softens ----------------------
test('DECAY: the same christening fades as it ages; recencyDecay is exposed for the gauge', () => {
  const trip = tripWith([CHRISTENED])
  const fresh = buildLexicon([trip], [], [], { now: day(30 * DAY_MS()) }).byStop.get('s1')[0]
  const stale = buildLexicon([trip], [], [], { now: day(1500 * DAY_MS()) }).byStop.get('s1')[0]
  assert.ok(stale.confidence < fresh.confidence, 'four years on, the name whispers softer')
  assert.ok(stale.recencyDecay < fresh.recencyDecay && stale.recencyDecay > 0, 'the decay factor moved and stays exposed')
  function DAY_MS() { return 86400000 }
})

// ---- 9. the answer ledger corroborates the birth certificate (one event, two rows) --
test('a christening in BOTH the stop origin and the answer ledger counts ONCE but cites both', () => {
  const trip = tripWith([CHRISTENED])
  const feedback = [{ id: 'fb1', kind: 'christening', stopId: 's1', name: 'The Jetty Spot', at: day(0) }]
  const { byStop } = buildLexicon([trip], [], feedback, { now: NOW })
  const facts = byStop.get('s1')
  assert.equal(facts.length, 1, 'the same naming event does not double the alias')
  assert.deepEqual([...facts[0].sourceRows].sort(), ['christen:s1', 'fb1'], 'both provenances are cited (gauge-auditable)')
})

// ---- 10. rename-safe: keyed by id, not the string --------------------------
test('rename-safe: the alias is keyed by stop id, so a renamed stop keeps its warm name', () => {
  // the family christened "The Jetty Spot", later renamed the stop to "Pier 4" in the editor —
  // the lexicon still remembers the warm word, because it keys the identity not the label.
  const renamed = { id: 's1', name: 'Pier 4', origin: { christened: { by: 'dad', at: day(0) } } }
  const memories = [cap('m1', 's1', 'the jetty spot'), cap('m2', 's1', 'the jetty spot')]
  const { byStop } = buildLexicon([tripWith([renamed])], memories, [], { now: NOW })
  const aliases = aliasesForStop({ byStop }, 's1').map((f) => f.normalized)
  assert.ok(aliases.includes('the jetty spot'), "the family's word survives the rename")
  assert.ok(aliases.includes('pier 4'), 'and the christened current name is an alias too')
})

// ---- 11. pure + deterministic: no clock, identical replay -------------------
test('pure replay: two runs are byte-identical, and no now → decay abstains (never a penalty)', () => {
  const trip = tripWith([CHRISTENED])
  const memories = [cap('m1', 's1', 'the jetty spot'), cap('m2', 's1', 'jetty')]
  const a = buildLexicon([trip], memories, [], { now: NOW })
  const b = buildLexicon([trip], memories, [], { now: NOW })
  assert.deepEqual(a.facts, b.facts, 'deterministic: same inputs → same facts')
  const noClock = buildLexicon([trip], memories, [], {})
  for (const f of noClock.facts) assert.equal(f.recencyDecay, 1, 'without a clock, decay abstains — it never penalizes')
})

// ---- 12. normName agrees with the world model on identity ------------------
test('normName folds whitespace + case so one alias groups (agrees with the world model)', () => {
  assert.equal(normName('  The   Jetty  Spot '), normName('the jetty spot'))
})
