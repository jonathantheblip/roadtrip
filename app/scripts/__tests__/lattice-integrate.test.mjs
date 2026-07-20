import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEvidenceBench,
  BENCH_DEFAULTS,
  LATTICE_DEFAULTS,
  LATTICE_WITNESSES,
  WITNESSES,
} from '../../src/lib/evidenceBench.js'
import { SETTLE_DEFAULTS } from '../../src/lib/settlingEngine.js'
import { buildLattice, LATTICE_BRANCHES } from '../../src/lib/lattice/index.js'

// These tests assert the O8 INTEGRATE contract is enforced by the CODE, not just a doc:
//   1. buildLattice composes all six branches, deterministically.
//   2. With NO lattice, the bench is byte-identical to the pre-lattice bench.
//   3. No *_DEFAULTS constant moved (§15b).
//   4. With a fixture lattice, each branch nudges its named witness — and only ever as a
//      clamped, non-observed whisper (heals softly, never files).

const NOW = Date.UTC(2026, 6, 10)
const at = (h, m = 0) => Date.UTC(2026, 6, 4, h, m)

// A candidate place set: a beach and a waterfront (distinct inferred types).
const PLACES = [
  { id: 'beach', name: 'Town beach', lat: 42.05, lng: -70.18, timeMin: 14 * 60, kind: 'stop' },
  { id: 'harbor', name: 'Harbor', lat: 42.06, lng: -70.24, timeMin: 18 * 60, kind: 'stop' },
]
// Points exercising GPS / time / vision so the BASE bench is non-trivial.
const POINTS = [
  { id: 'p1', at: at(14, 0), lat: 42.05, lng: -70.18, provGps: 'exif', author: 'rafa', placeType: 'beach', setting: 'outdoor', signage: 'Town Beach' },
  { id: 'p2', at: at(14, 3), placeType: 'beach', setting: 'outdoor' },
]

// ============================================================================
// 1. buildLattice — the one fold over six branches, deterministic.
// ============================================================================
test('buildLattice composes all six branches and is deterministic (now from opts)', () => {
  const trips = [
    { id: 't1', endMs: at(23), days: [{ isoDate: '2026-07-04', stops: [{ id: 's1', name: 'Town beach', lat: 42.05, lng: -70.18 }] }] },
    { id: 't2', endMs: Date.UTC(2025, 6, 5), days: [{ isoDate: '2025-07-04', stops: [{ id: 's2', name: 'Town beach', lat: 42.05, lng: -70.18 }] }] },
  ]
  const memories = [
    { id: 'm1', trip_id: 't1', stop_id: 's1', author_traveler: 'rafa', created_at: at(20), caption: 'the town beach', photo_r2_keys_json: JSON.stringify([{ key: 'k1', capturedAt: new Date(at(14)).toISOString(), offsetMinutes: 0, vision: { placeType: 'beach', setting: 'outdoor' }, meta: { make: 'Apple', model: 'iPhone' } }]) },
  ]
  const feedback = [{ id: 1, trip_id: 't1', by_traveler: 'mom', action: 'confirmed', kind: 'A', at: at(21) }]

  const a = buildLattice(trips, memories, feedback, { now: NOW })
  const b = buildLattice(trips, memories, feedback, { now: NOW })
  assert.deepEqual(a, b, 'same ledgers + same now ⇒ byte-identical lattice (pure replay)')
  assert.deepEqual(Object.keys(a).sort(), [...LATTICE_BRANCHES].sort(), 'exactly the six branches')
  assert.ok(Array.isArray(a.people) && Array.isArray(a.places) && Array.isArray(a.rhythms) && Array.isArray(a.devices) && Array.isArray(a.meta))
  assert.ok(a.lexicon && Array.isArray(a.lexicon.facts) && a.lexicon.byStop instanceof Map, 'lexicon carries { facts, byStop }')
  // non-trivial: the corpus produced real facts (parity can never pass vacuously)
  assert.ok(a.places.length > 0, 'places branch learned something')
  assert.ok(a.people.some((f) => f.type === 'photographer'), 'people photographer habit learned')
  // RHYTHMS co-coheres on the RAW-memory shape the fold threads: buildLattice hands every branch
  // the SAME raw memory rows (photos nested in photo_r2_keys_json). People/places/devices flatten
  // them; rhythms must too — a silent mute here means the daily-shape fact reads NOTHING off the
  // nested photos (the §16d co-coherence defect). Assert the daily fact actually forms.
  assert.ok(a.rhythms.some((f) => f.subject.startsWith('rhythm:daily:')), 'rhythms daily-shape facts form from RAW memories — never a silent mute')
  assert.ok(a.rhythms.some((f) => f.subject === 'rhythm:daily:beach'), 'the nested beach photo produced its daily rhythm')
})

test('buildLattice never reads the clock (no now ⇒ facts stand, decay neutral)', () => {
  const trips = [{ id: 't1', endMs: at(23), days: [{ isoDate: '2026-07-04', stops: [{ id: 's1', name: 'Town beach' }] }] }]
  const r1 = buildLattice(trips, [], [], {})
  const r2 = buildLattice(trips, [], [], {})
  assert.deepEqual(r1, r2, 'deterministic with no now')
})

// ============================================================================
// 2. THE NO-OP: absent lattice ⇒ byte-identical bench (the load-bearing guarantee).
// ============================================================================
test('NO-OP: with no lattice the bench is byte-identical across every absent-lattice call', () => {
  const base = buildEvidenceBench(POINTS, PLACES)
  assert.deepEqual(buildEvidenceBench(POINTS, PLACES, {}), base, 'opts:{} ≡ no opts')
  assert.deepEqual(buildEvidenceBench(POINTS, PLACES, { lattice: null }), base, 'lattice:null ≡ no lattice')
  assert.deepEqual(buildEvidenceBench(POINTS, PLACES, { lattice: undefined }), base, 'lattice:undefined ≡ no lattice')
})

test('NO-OP: the absent-lattice bench has EXACTLY the pre-lattice shape', () => {
  const bench = buildEvidenceBench(POINTS, PLACES)
  assert.deepEqual(Object.keys(bench).sort(), ['affinity', 'placement', 'witnesses'], 'no `grading` key, no extra keys')
  assert.deepEqual(bench.witnesses, WITNESSES, 'witnesses list is unchanged (no lattice witness advertised)')
  const latSet = new Set(LATTICE_WITNESSES)
  for (const e of bench.placement) assert.ok(!latSet.has(e.witness), `no lattice witness leaked into placement (${e.witness})`)
  for (const e of bench.affinity) assert.ok(!latSet.has(e.witness), `no lattice witness leaked into affinity (${e.witness})`)
})

// ============================================================================
// 3. NO CONSTANT MOVED (§15b): BENCH_DEFAULTS / SETTLE_DEFAULTS are exactly F5.
// ============================================================================
test('§15b: BENCH_DEFAULTS and SETTLE_DEFAULTS are untouched by the lattice seam', () => {
  assert.equal(BENCH_DEFAULTS.currentFilingWeight, 0.7)
  assert.equal(BENCH_DEFAULTS.humanConfirmWeight, 0.95)
  assert.equal(BENCH_DEFAULTS.gpsScaleMeters, 150)
  assert.equal(BENCH_DEFAULTS.minMembership, 0.02)
  assert.ok(!('lattice' in BENCH_DEFAULTS), 'the lattice is opts-only, never a BENCH default')
  assert.deepEqual(SETTLE_DEFAULTS.weights, { placeType: 0.6, worldModel: 0.2 }, 'F5-fitted weights unchanged')
})

// ============================================================================
// 4. THE WIRING FIRES: a fixture lattice nudges each branch's named witness.
//    (A3: the client uses FIXTURE lattices only — a hand-built one here.)
// ============================================================================
const FIXTURE_LATTICE = {
  people: [
    { type: 'photographer', subject: 'rafa', value: { dimension: 'placeType', placeType: 'beach', share: 0.9, observations: 9, of: 10 }, confidence: 0.4, recencyDecay: 1, sourceRows: [] },
  ],
  rhythms: [
    { subject: 'rhythm:daily:beach', value: { activity: 'beach', typicalMin: 14 * 60, concentration: 0.9, photos: 9, trips: 3 }, confidence: 0.4, recencyDecay: 1, sourceRows: [] },
  ],
  places: [
    { type: 'signature', subject: 'Town beach', value: { coordCell: '42.0500,-70.1800', dominantType: 'beach', dominantSetting: 'outdoor', typicalMinute: 14 * 60, band: 'midday', distinctiveness: 0.5, distinguishingDims: [{ dim: 'placeType', dist: 0.5 }], nearestSibling: { name: 'The cottage', distance: 0.5 }, observations: 6 }, confidence: 0.4, recencyDecay: 1, sourceRows: [] },
  ],
  lexicon: {
    facts: [{ subject: 'beach', value: 'the town beach', normalized: 'town beach', confidence: 0.5, recencyDecay: 1, tier: 'prior', uses: 2, sources: ['caption'], sourceRows: [] }],
    byStop: new Map(),
  },
  devices: [
    { type: 'metadataSurvival', subject: { branch: 'devices', person: 'rafa', device: 'apple|iphone' }, value: { channel: 'gps', survival: 0, present: 0, of: 10 }, confidence: 0.5, recencyDecay: 1, tier: 'prior', sourceRows: [] },
  ],
  meta: [
    { subject: { branch: 'meta', fact: 'class-trust', questionClass: 'A', context: { scope: 'family' }, key: 'class-trust:A:family' }, value: 0.8, rates: { confirm: 0.8, correct: 0.1, skip: 0.1 }, confidence: 0.5, recencyDecay: 1, counts: { confirm: 4, correct: 0, skip: 0, total: 4 }, sourceRows: [1, 2, 3, 4] },
  ],
}

test('WIRING: a fixture lattice adds one witness per branch, all clamped non-observed whispers', () => {
  const base = buildEvidenceBench(POINTS, PLACES)
  const bench = buildEvidenceBench(POINTS, PLACES, { lattice: FIXTURE_LATTICE })

  // the base bench is PRESERVED verbatim — the lattice only APPENDS (never mutates a base entry)
  assert.deepEqual(bench.placement.slice(0, base.placement.length), base.placement, 'base placement is a verbatim prefix')
  assert.deepEqual(bench.affinity, base.affinity, 'affinity unchanged (rhythm boundary-affinity is the deferred half)')

  // the four placement wirings each fired on p1 with support for the beach
  const on = (witness) => bench.placement.find((e) => e.witness === witness && e.photoId === 'p1')
  for (const witness of ['uploader', 'rhythm', 'placeSignature', 'lexicon']) {
    const ev = on(witness)
    assert.ok(ev, `${witness} witness emitted for p1`)
    assert.ok(ev.support.beach > 0, `${witness} nudges the beach`)
    assert.notEqual(ev.tier, 'observed', `${witness} is a non-observed prior/derived nudge (heals softly, never files)`)
    // a whisper-of-a-whisper: strictly below the observed band (currentFiling 0.7)
    for (const m of Object.values(ev.support)) assert.ok(m < BENCH_DEFAULTS.currentFilingWeight, `${witness} membership stays below the observed band`)
  }

  // DEVICES → the settling-inert grading product (never placement/affinity)
  assert.ok(Array.isArray(bench.grading) && bench.grading.length >= 1, 'device channel grading present')
  assert.ok(bench.grading.every((g) => g.witness === 'deviceChannel'), 'grading is device-channel only')
  assert.ok(!bench.placement.some((e) => e.witness === 'deviceChannel'), 'device grading never enters placement (settle-inert)')

  // META is intentionally NOT a bench witness (it grades question CLASSES for O7, not photos)
  assert.ok(!bench.placement.some((e) => e.witness === 'meta') && !bench.affinity.some((e) => e.witness === 'meta'), 'meta is not a bench witness')

  // the advertised witness list now includes the lattice witnesses (only when supplied)
  assert.deepEqual(bench.witnesses, [...WITNESSES, ...LATTICE_WITNESSES])
})

test('WIRING: the lattice-enriched bench is itself deterministic; empty branches abstain', () => {
  const a = buildEvidenceBench(POINTS, PLACES, { lattice: FIXTURE_LATTICE })
  const b = buildEvidenceBench(POINTS, PLACES, { lattice: FIXTURE_LATTICE })
  assert.deepEqual(a, b, 'same fixture lattice ⇒ identical enriched bench')

  // an empty lattice supplies the seam but every branch abstains → placement is just the base
  const base = buildEvidenceBench(POINTS, PLACES)
  const empty = buildEvidenceBench(POINTS, PLACES, { lattice: { people: [], rhythms: [], places: [], devices: [], lexicon: { facts: [], byStop: new Map() }, meta: [] } })
  assert.deepEqual(empty.placement, base.placement, 'all-empty lattice ⇒ no placement enrichment (branch-by-branch abstain)')
  assert.deepEqual(empty.grading, [], 'no device facts ⇒ empty grading')
})

test('LATTICE_DEFAULTS: every seam seed is a clamped whisper below its branch ceiling', () => {
  // declared seeds (§15b) — each < 0.5, none shared, none an existing constant
  assert.ok(LATTICE_DEFAULTS.uploaderSeed < 0.45)
  assert.ok(LATTICE_DEFAULTS.rhythmSeed < 0.45)
  assert.ok(LATTICE_DEFAULTS.signatureSeed < 0.5)
  assert.ok(LATTICE_DEFAULTS.lexiconSeed < 0.55)
})

// ============================================================================
// 5. THE SPATIAL GATE (§16d): the signature is a stacked-place DISAMBIGUATOR
//    ("proximity proposes, signature disposes"), NEVER a global standalone
//    placeType prior. It may only nudge a photo that has a spatial proposal for
//    its cluster footprint (own/derived coordinate, or an already-proposed
//    candidate it is filed/confirmed to).
// ============================================================================
const SIG_PLACES = [{ id: 'beach', name: 'Town beach', lat: 42.05, lng: -70.18, kind: 'stop' }]
const SIG_ONLY_LATTICE = {
  people: [],
  rhythms: [],
  places: [
    { type: 'signature', subject: 'Town beach', value: { coordCell: '42.0500,-70.1800', dominantType: 'beach', dominantSetting: 'outdoor', typicalMinute: null, band: null, distinctiveness: 0.5, distinguishingDims: [{ dim: 'placeType', dist: 0.5 }], nearestSibling: { name: 'The cottage', distance: 0.5 }, observations: 6 }, confidence: 0.4, recencyDecay: 1, sourceRows: [] },
  ],
  lexicon: { facts: [], byStop: new Map() },
  devices: [],
  meta: [],
}

test('SPATIAL GATE: placeSignature disposes only among proximity-proposed siblings, never globally', () => {
  const pts = [
    { id: 'near', at: at(14), lat: 42.05, lng: -70.18, placeType: 'beach', setting: 'outdoor' },   // own coord AT the footprint
    { id: 'far', at: at(14), lat: 40.0, lng: -75.0, placeType: 'beach', setting: 'outdoor' },       // a beach photo, but nowhere near the stack
    { id: 'nocoord', at: at(14), placeType: 'beach', setting: 'outdoor' },                          // matching placeType, but no spatial proposal
    { id: 'filed', at: at(14), currentStopId: 'beach', placeType: 'beach', setting: 'outdoor' },    // coordless, but already filed to a cluster member
  ]
  const bench = buildEvidenceBench(pts, SIG_PLACES, { lattice: SIG_ONLY_LATTICE })
  const sigFor = (id) => bench.placement.find((e) => e.witness === 'placeSignature' && e.photoId === id)

  assert.ok(sigFor('near'), 'a photo AT the stacked footprint is disambiguated by the signature')
  assert.ok(sigFor('filed'), 'a coordless photo already filed to a cluster member is an already-proposed sibling')
  assert.ok(!sigFor('far'), 'a matching-placeType photo FAR from the stack is NOT globally voted (the defect)')
  assert.ok(!sigFor('nocoord'), 'a coordless, unfiled photo has no spatial proposal → the signature abstains')

  // and where it DOES fire it stays a clamped, non-observed derived whisper
  const near = sigFor('near')
  assert.equal(near.tier, 'derived')
  for (const m of Object.values(near.support)) assert.ok(m < BENCH_DEFAULTS.currentFilingWeight)
})

test('SPATIAL GATE: the fix is inert without a lattice — the signature scenario stays byte-identical', () => {
  const pts = [
    { id: 'near', at: at(14), lat: 42.05, lng: -70.18, placeType: 'beach', setting: 'outdoor' },
    { id: 'far', at: at(14), lat: 40.0, lng: -75.0, placeType: 'beach', setting: 'outdoor' },
    { id: 'filed', at: at(14), currentStopId: 'beach', placeType: 'beach', setting: 'outdoor' },
  ]
  const base = buildEvidenceBench(pts, SIG_PLACES)
  assert.deepEqual(buildEvidenceBench(pts, SIG_PLACES, {}), base, 'opts:{} ≡ no opts')
  assert.deepEqual(buildEvidenceBench(pts, SIG_PLACES, { lattice: null }), base, 'lattice:null ≡ no lattice')
  assert.deepEqual(Object.keys(base).sort(), ['affinity', 'placement', 'witnesses'], 'no `grading` key, pre-lattice shape')
  assert.ok(!base.placement.some((e) => e.witness === 'placeSignature'), 'placeSignature never appears without a lattice (seam inert)')
})

// ============================================================================
// 6. A9 AT THE CONSUMER SEAM: the A9 fix in the places BRANCH must not be re-opened
//    in the placeSignaturePlacement consumer. Two DISTINCT same-name stops on
//    different footprints must each resolve to their OWN signature — never collapse
//    by name (the old last-wins idByName re-instantiated the founding sin one layer up).
// ============================================================================
const A9_PLACES = [
  { id: 'beachA', name: 'Town beach', lat: 42.05, lng: -70.18, kind: 'stop' }, // cell A (Provincetown)
  { id: 'beachB', name: 'Town beach', lat: 41.30, lng: -72.10, kind: 'stop' }, // cell B — SAME name, ~180km away
]
const sig9 = (coordCell) => ({ type: 'signature', subject: 'Town beach', value: { coordCell, dominantType: 'beach', dominantSetting: 'outdoor', typicalMinute: null, band: null, distinctiveness: 0.5, distinguishingDims: [{ dim: 'placeType', dist: 0.5 }], nearestSibling: { name: 'The cottage', distance: 0.5 }, observations: 6 }, confidence: 0.4, recencyDecay: 1, sourceRows: [] })
const A9_LATTICE = {
  people: [], rhythms: [], lexicon: { facts: [], byStop: new Map() }, devices: [], meta: [],
  places: [sig9('42.0500,-70.1800'), sig9('41.3000,-72.1000')], // one signature per real footprint
}

test('A9 AT THE SEAM: same-name stops on different footprints resolve to their OWN signature, never collapse', () => {
  const pts = [
    { id: 'atA', at: at(14), lat: 42.05, lng: -70.18, placeType: 'beach', setting: 'outdoor' }, // stands in cell A
    { id: 'atB', at: at(14), lat: 41.30, lng: -72.10, placeType: 'beach', setting: 'outdoor' }, // stands in cell B
  ]
  const bench = buildEvidenceBench(pts, A9_PLACES, { lattice: A9_LATTICE })
  const sig = (id) => bench.placement.find((e) => e.witness === 'placeSignature' && e.photoId === id)
  const atA = sig('atA')
  const atB = sig('atB')
  assert.ok(atA && atA.support.beachA > 0, 'the cell-A photo is disambiguated toward beachA (its own footprint)')
  assert.ok(!atA.support.beachB, 'and NOT toward the far same-name twin beachB — no name-collapse at the seam')
  assert.ok(atB && atB.support.beachB > 0, 'the cell-B photo is disambiguated toward beachB')
  assert.ok(!atB.support.beachA, 'and NOT toward beachA — each same-name stop keeps its own signature (A9 held at the seam)')
})
