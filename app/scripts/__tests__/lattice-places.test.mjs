// lattice-places.test.mjs — lesson-asserting tests for the PLACES branch of the fact
// lattice (DESIGN_THE_HEALING_MODEL.md §16d). Each test pins a LESSON, not a line: a
// place-fact NEVER asserts alone (the clamp holds through the real settling engine);
// deleting a source row UNLEARNS its fact; the off-fact OBSERVATION wins on its own
// evidence; absence ABSTAINS; and — the founding payoff — stacked places disambiguate
// by their learned NON-SPATIAL signature, but REFUSE to be split (never a silent
// nearest-name pick) when they look alike.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPlacesFacts, signatureDistance } from '../../src/lib/lattice/places.js'
import { BENCH_DEFAULTS } from '../../src/lib/evidenceBench.js'
import { settle, SETTLE_DEFAULTS } from '../../src/lib/settlingEngine.js'

const NOW = Date.UTC(2026, 6, 10)
// a local-encoded ms whose UTC hour IS the intended local hour (the adapter's convention)
const at = (h, m = 0, day = 4) => Date.UTC(2026, 6, day, h, m)

// A trip with one day of named, coordinate-bearing stops.
const trip = (id, endMs, stops, isoDate = '2026-07-04') => ({ id, endMs, days: [{ isoDate, stops }] })
// A filed photo-point (already-flat shape the fold accepts).
const photo = (id, stopId, extra = {}) => ({ id, stopId, ...extra })

// ---- Provincetown stacked places (the founding fixture) -----------------------------
// The cottage (residential, evenings, indoor) and the town beach (beach, midday, outdoor)
// sit on ONE spot — coordinates cannot tell them apart; their SIGNATURES must.
const STACK_COORD = { lat: 42.05, lng: -70.18 }
const stackedTrip = (id, endMs) => trip(id, endMs, [
  { id: `${id}-cot`, name: 'The cottage', ...STACK_COORD },
  { id: `${id}-beach`, name: 'Town beach', ...STACK_COORD },
])
// photos filed to each stacked place, giving each its distinct non-spatial look
const stackedPhotos = (id) => [
  ...[0, 1, 2].map((k) => photo(`${id}-cot-${k}`, `${id}-cot`, { at: at(20, 0), placeType: 'residential', setting: 'indoor' })),
  ...[0, 1, 2].map((k) => photo(`${id}-bch-${k}`, `${id}-beach`, { at: at(13, 0), placeType: 'beach', setting: 'outdoor' })),
]

test('CHARACTER: a place learns what the family DOES there (its dominant kind), source-cited', () => {
  const trips = [trip('t1', at(0), [{ id: 's-beach', name: 'Town beach', ...STACK_COORD }])]
  const mems = [0, 1, 2, 3].map((k) => photo(`ph${k}`, 's-beach', { at: at(13), placeType: 'beach', setting: 'outdoor' }))
  const facts = buildPlacesFacts(trips, mems, [], { now: NOW })
  const char = facts.find((f) => f.type === 'character' && f.value.placeType === 'beach')
  assert.ok(char, 'a character fact for the beach kind is learned')
  assert.ok(char.sourceRows.includes('ph0') && char.sourceRows.length >= 4, 'it cites the exact filed photos it came from')
  assert.equal(char.value.observations, 4)
})

test('CLAMP: a place-fact is capped far below certainty no matter how many photos', () => {
  const trips = [trip('t1', at(0), [{ id: 's', name: 'Town beach', ...STACK_COORD }])]
  const mems = Array.from({ length: 200 }, (_, k) => photo(`ph${k}`, 's', { at: at(13), placeType: 'beach', setting: 'outdoor' }))
  const facts = buildPlacesFacts(trips, mems, [], { now: NOW })
  assert.ok(facts.length > 0, 'facts were produced')
  for (const f of facts) assert.ok(f.confidence <= 0.55 && f.confidence >= 0, `every fact nudges, never asserts (${f.type} = ${f.confidence})`)
})

test('every place-fact stays BELOW the observed-witness band (an observation must be able to win)', () => {
  const trips = [...[stackedTrip('t1', at(0)), stackedTrip('t2', at(0)), stackedTrip('t3', at(0))]]
  const mems = ['t1', 't2', 't3'].flatMap(stackedPhotos)
  const facts = buildPlacesFacts(trips, mems, [], { now: NOW })
  const maxConf = Math.max(...facts.map((f) => f.confidence))
  // below currentFiling (0.7), humanConfirm (0.95), and the settle engine's "strong" bar
  assert.ok(maxConf < BENCH_DEFAULTS.currentFilingWeight, 'a place-fact can never out-vote where a photo actually sits')
  assert.ok(maxConf < SETTLE_DEFAULTS.crit.strong, 'a place-fact alone can never clear the file-silently bar')
})

test('a place-fact alone can HEAL softly but NEVER file silently (through the real settling engine)', () => {
  const trips = [trip('t1', at(0), [{ id: 's', name: 'Town beach', ...STACK_COORD }])]
  const mems = [0, 1, 2, 3, 4].map((k) => photo(`ph${k}`, 's', { at: at(13), placeType: 'beach', setting: 'outdoor' }))
  const char = buildPlacesFacts(trips, mems, [], { now: NOW }).find((f) => f.type === 'character')
  // wire the fact into the bench the way the Integrate phase will: tier 'prior', membership = confidence
  const bench = { placement: [{ kind: 'placement', witness: 'placesLattice', tier: 'prior', photoId: 'x', support: { A: char.confidence } }], affinity: [] }
  const r = settle(bench, [{ id: 'A', name: 'Town beach', ...STACK_COORD }]).photos.get('x')
  assert.equal(r.top, 'A', 'the fact places it')
  assert.notEqual(r.destination, 'file', 'but a lattice fact alone must never file silently')
  assert.equal(r.tier, 'derived', 'lattice support is non-observed')
})

test('the off-fact OBSERVATION wins on its own evidence (the clamp does its job)', () => {
  const trips = [trip('t1', at(0), [{ id: 's', name: 'Town beach', ...STACK_COORD }])]
  const mems = Array.from({ length: 40 }, (_, k) => photo(`ph${k}`, 's', { at: at(13), placeType: 'beach', setting: 'outdoor' }))
  const char = buildPlacesFacts(trips, mems, [], { now: NOW }).find((f) => f.type === 'character')
  // A carries the (strong, recurring) lattice fact; B carries a single OBSERVED current-filing
  const bench = {
    placement: [
      { kind: 'placement', witness: 'placesLattice', tier: 'prior', photoId: 'x', support: { A: char.confidence } },
      { kind: 'placement', witness: 'currentFiling', tier: 'observed', photoId: 'x', support: { B: BENCH_DEFAULTS.currentFilingWeight } },
    ],
    affinity: [],
  }
  const r = settle(bench, [{ id: 'A', name: 'Town beach', ...STACK_COORD }, { id: 'B', name: 'The museum', lat: 42.3, lng: -70.5 }]).photos.get('x')
  assert.equal(r.top, 'B', 'the observed evidence for the off-fact place wins; the fact does not overrule it')
  assert.equal(r.destination, 'file', 'and it files on its own observed evidence')
})

test('UNLEARN: deleting a source row removes exactly the fact it fed', () => {
  const trips = [trip('t1', at(0), [{ id: 's', name: 'Town beach', ...STACK_COORD }])]
  const full = [photo('a', 's', { at: at(13), placeType: 'beach' }), photo('b', 's', { at: at(13), placeType: 'beach' }), photo('c', 's', { at: at(13), placeType: 'museum' })]
  const before = buildPlacesFacts(trips, full, [], { now: NOW })
  const museumBefore = before.find((f) => f.type === 'character' && f.value.placeType === 'museum')
  assert.ok(museumBefore && museumBefore.sourceRows.includes('c'), 'the lone museum photo fed a museum character fact')
  // delete row 'c' → its fact is gone; the beach fact survives (fewer, cited rows)
  const after = buildPlacesFacts(trips, full.filter((p) => p.id !== 'c'), [], { now: NOW })
  assert.ok(!after.some((f) => f.type === 'character' && f.value.placeType === 'museum'), 'deleting the row UNLEARNS its fact')
  assert.ok(!after.some((f) => f.sourceRows.includes('c')), 'no surviving fact still cites the deleted row')
  assert.ok(after.some((f) => f.type === 'character' && f.value.placeType === 'beach'), 'the independently-sourced beach fact survives')
})

test('ABSENCE abstains: no photos → no character/timing/signature; an empty corpus → no facts', () => {
  // trip geometry only, zero filed photos → nothing to say about what happens there
  const trips = [stackedTrip('t1', at(0))]
  const facts = buildPlacesFacts(trips, [], [], { now: NOW })
  assert.ok(!facts.some((f) => f.type === 'character' || f.type === 'timing' || f.type === 'signature'), 'no filed photos → those channels abstain (never a zero)')
  assert.equal(buildPlacesFacts([], [], [], { now: NOW }).length, 0, 'an empty corpus yields no facts at all')
})

test('DECAY: a place unseen for years quietly loses its voice', () => {
  // a place last visited in early 2020 — its photos carry NO later capture time, so
  // last-seen is the trip's own date (a photo's capture time IS when the family was there;
  // here there is none newer than the trip, so the trip date governs recency).
  const old = [trip('t2020', Date.UTC(2020, 0, 1), [{ id: 's', name: 'Old cabin', lat: 42, lng: -70 }])]
  const mems = [0, 1, 2, 3].map((k) => photo(`ph${k}`, 's', { placeType: 'residential', setting: 'indoor' }))
  const fresh = buildPlacesFacts(old, mems, [], { now: Date.UTC(2020, 0, 20) })
  const stale = buildPlacesFacts(old, mems, [], { now: Date.UTC(2026, 0, 1) })
  const conf = (fs) => Math.max(...fs.filter((f) => f.type === 'character').map((f) => f.confidence))
  assert.ok(conf(stale) < conf(fresh) * 0.3, 'six years on, a dead place has all but faded')
  assert.ok(stale.find((f) => f.type === 'character').recencyDecay < 0.3, 'recencyDecay is carried on the fact for the gauge')
})

// ---- THE FOUNDING PAYOFF ------------------------------------------------------------
test('SIGNATURE: stacked places on ONE spot learn DISTINCT non-spatial signatures (proximity proposes, signature disposes)', () => {
  const trips = ['t1', 't2'].map((id) => stackedTrip(id, at(0)))
  const mems = ['t1', 't2'].flatMap(stackedPhotos)
  const facts = buildPlacesFacts(trips, mems, [], { now: NOW })
  const sigs = facts.filter((f) => f.type === 'signature')
  const cottage = sigs.find((f) => f.subject === 'The cottage')
  const beach = sigs.find((f) => f.subject === 'Town beach')
  assert.ok(cottage && beach, 'both stacked places get a disambiguating signature')
  assert.equal(cottage.value.coordCell, beach.value.coordCell, 'they share the same spot (coords cannot separate them)')
  assert.equal(cottage.value.dominantType, 'residential')
  assert.equal(beach.value.dominantType, 'beach')
  assert.ok(cottage.value.distinctiveness > 0.3, 'the signature genuinely separates them')
  // §16b multidimensional: the fact CITES the dimensions that separate it (not one channel deciding)
  assert.ok(cottage.value.distinguishingDims.length >= 2, 'multiple dimensions agree on the separation')
  assert.ok(cottage.value.distinguishingDims.some((d) => d.dim === 'placeType') && cottage.value.distinguishingDims.some((d) => d.dim === 'setting'), 'kind AND setting both separate them')
})

test('SIGNATURE refuses a SILENT nearest-name pick: identical-looking stacked places emit NO signature (leave loose)', () => {
  // two beaches stacked on one spot, looking IDENTICAL (same kind/time/setting) → no glance
  // could separate them → the branch must abstain rather than pick by proximity (§4 dest 4)
  const twin = (id) => trip(id, at(0), [
    { id: `${id}-n`, name: 'North beach', ...STACK_COORD },
    { id: `${id}-s`, name: 'South beach', ...STACK_COORD },
  ])
  const twinPhotos = (id) => [
    ...[0, 1, 2].map((k) => photo(`${id}-n${k}`, `${id}-n`, { at: at(13), placeType: 'beach', setting: 'outdoor' })),
    ...[0, 1, 2].map((k) => photo(`${id}-s${k}`, `${id}-s`, { at: at(13), placeType: 'beach', setting: 'outdoor' })),
  ]
  const trips = ['t1', 't2'].map(twin)
  const mems = ['t1', 't2'].flatMap(twinPhotos)
  const facts = buildPlacesFacts(trips, mems, [], { now: NOW })
  assert.ok(!facts.some((f) => f.type === 'signature'), 'look-alike stacked places yield NO disambiguating signature — never a silent nearest-name pick')
  // but their CHARACTER is still learned (their look is known; only the DISPOSAL is refused)
  assert.ok(facts.some((f) => f.type === 'character' && f.subject === 'North beach'), 'character survives; only the stacked disambiguation abstains')
})

test('SIGNATURE unlearn: removing one stacked sibling\'s photos silences BOTH signatures (nothing to disambiguate against)', () => {
  const trips = ['t1', 't2'].map((id) => stackedTrip(id, at(0)))
  const mems = ['t1', 't2'].flatMap(stackedPhotos)
  assert.ok(buildPlacesFacts(trips, mems, [], { now: NOW }).some((f) => f.type === 'signature'), 'both signatures present with both siblings characterized')
  // strip every cottage photo → the beach has no characterized sibling to prove itself distinct from
  const beachOnly = mems.filter((p) => !p.stopId.endsWith('-cot'))
  const facts = buildPlacesFacts(trips, beachOnly, [], { now: NOW })
  assert.ok(!facts.some((f) => f.type === 'signature'), 'with the sibling uncharacterized, no signature can claim distinctness → abstain')
})

test('a confirm STRENGTHENS a signature (and is cited); an empty feedback ledger is a no-op', () => {
  const trips = ['t1', 't2'].map((id) => stackedTrip(id, at(0)))
  const mems = ['t1', 't2'].flatMap(stackedPhotos)
  const noFb = buildPlacesFacts(trips, mems, [], { now: NOW }).find((f) => f.type === 'signature' && f.subject === 'Town beach')
  const withFb = buildPlacesFacts(trips, mems, [{ id: 'fb1', photoId: 't1-bch-0', action: 'confirmed' }], { now: NOW }).find((f) => f.type === 'signature' && f.subject === 'Town beach')
  assert.ok(withFb.confidence > noFb.confidence, 'a human confirm counts for more, lifting confidence (still clamped)')
  assert.ok(withFb.sourceRows.includes('fb1'), 'the confirm row is cited on the fact it strengthened')
  assert.ok(withFb.confidence <= 0.55, 'even a confirmed signature stays a nudge')
})

// ---- A9: place identity is MULTIDIMENSIONAL — a shared name is NOT the same place ----
test('A9: two same-name stops with FAR coords are TWO entities; coordinates are never averaged into a phantom midpoint', () => {
  // "Town beach" exists in two different towns; each is stacked with its OWN distinct
  // neighbour. If the branch keyed identity by NAME alone (the founding sin) it would pool
  // both into one entity at the AVERAGED midpoint — a spot in neither town, stacked with
  // neither neighbour — so no signature could ever form and both towns' photos would fuse.
  const L2 = { lat: 40.0, lng: -74.0 }
  const trips = [trip('t1', at(0), [
    { id: 'b1', name: 'Town beach', ...STACK_COORD },
    { id: 'c1', name: 'The cottage', ...STACK_COORD },
    { id: 'b2', name: 'Town beach', ...L2 },
    { id: 'm2', name: 'City museum', ...L2 },
  ])]
  const mems = [
    ...[0, 1, 2].map((k) => photo(`b1-${k}`, 'b1', { at: at(13), placeType: 'beach', setting: 'outdoor' })),
    ...[0, 1, 2].map((k) => photo(`c1-${k}`, 'c1', { at: at(20), placeType: 'residential', setting: 'indoor' })),
    ...[0, 1, 2].map((k) => photo(`b2-${k}`, 'b2', { at: at(13), placeType: 'beach', setting: 'outdoor' })),
    ...[0, 1, 2].map((k) => photo(`m2-${k}`, 'm2', { at: at(15), placeType: 'museum', setting: 'indoor' })),
  ]
  const facts = buildPlacesFacts(trips, mems, [], { now: NOW })
  const beachSigs = facts.filter((f) => f.type === 'signature' && f.subject === 'Town beach')
  assert.equal(beachSigs.length, 2, 'far-apart same-name stops are TWO distinct entities, each disambiguated at its own footprint')
  const cells = new Set(beachSigs.map((f) => f.value.coordCell))
  assert.ok(cells.has('42.0500,-70.1800') && cells.has('40.0000,-74.0000'), 'each entity keeps its OWN coordinates')
  assert.ok(![...cells].some((c) => c.startsWith('41.0')), 'the coordinates were NOT averaged across the unmerged pair (no 41.02… phantom midpoint)')
})

test('A9: two same-name stops with NEAR coords are ONE entity — proximity proposes the merge; recurrence is preserved', () => {
  const trips = [trip('t1', at(0), [
    { id: 'b1', name: 'Town beach', lat: 42.0500, lng: -70.1800 },
    { id: 'b2', name: 'Town beach', lat: 42.0505, lng: -70.1800 }, // ~55m away — within the merge radius
  ])]
  const mems = [
    ...[0, 1, 2].map((k) => photo(`b1-${k}`, 'b1', { at: at(13), placeType: 'beach', setting: 'outdoor' })),
    ...[0, 1, 2].map((k) => photo(`b2-${k}`, 'b2', { at: at(13), placeType: 'beach', setting: 'outdoor' })),
  ]
  const facts = buildPlacesFacts(trips, mems, [], { now: NOW })
  const beachChar = facts.filter((f) => f.type === 'character' && f.subject === 'Town beach' && f.value.placeType === 'beach')
  assert.equal(beachChar.length, 1, 'near-coord same-name stops resolve to a SINGLE recurring place')
  assert.equal(beachChar[0].value.observations, 6, "both stops' photos pool into that one place (never fragmented by jitter)")
})

test('SIGNATURE needs BROAD agreement: a SINGLE shared dimension can never emit a stacked signature (one channel must not dispose)', () => {
  // Two stacked places sharing exactly ONE present dimension (placeType) and nothing else —
  // no setting, and no usable time (their photos carry none). One channel disposing IS the
  // founding Provincetown sin; the branch must abstain, not pick by that lone dimension.
  const oneDim = (id) => trip(id, at(0), [
    { id: `${id}-a`, name: 'Alpha', ...STACK_COORD },
    { id: `${id}-b`, name: 'Beta', ...STACK_COORD },
  ])
  const oneDimPhotos = (id) => [
    ...[0, 1, 2].map((k) => photo(`${id}-a${k}`, `${id}-a`, { placeType: 'residential' })), // no setting, no time
    ...[0, 1, 2].map((k) => photo(`${id}-b${k}`, `${id}-b`, { placeType: 'beach' })),
  ]
  const trips = ['t1', 't2'].map(oneDim)
  const facts = buildPlacesFacts(trips, ['t1', 't2'].flatMap(oneDimPhotos), [], { now: NOW })
  assert.ok(!facts.some((f) => f.type === 'signature'), 'one shared dimension is not broad agreement → emit nothing, leave the photo loose')

  // CONTROL: add a SECOND shared, separating dimension (setting) → now a signature may form,
  // and the emitted fact records that it rests on ≥2 shared dimensions.
  const twoDimPhotos = (id) => [
    ...[0, 1, 2].map((k) => photo(`${id}-a${k}`, `${id}-a`, { placeType: 'residential', setting: 'indoor' })),
    ...[0, 1, 2].map((k) => photo(`${id}-b${k}`, `${id}-b`, { placeType: 'beach', setting: 'outdoor' })),
  ]
  const facts2 = buildPlacesFacts(trips, ['t1', 't2'].flatMap(twoDimPhotos), [], { now: NOW })
  const sig = facts2.find((f) => f.type === 'signature')
  assert.ok(sig, 'two shared, separating dimensions clear the bar')
  assert.ok(sig.value.sharedDimensions >= 2, 'the emitted signature rests on ≥2 shared dimensions (broad agreement, gauge-visible)')
})

// ---- RELATIONS ----------------------------------------------------------------------
test('ADJACENCY: places that co-occur in a day\'s sequence become practically adjacent; recurrence grows it', () => {
  const day = (isoDate) => trip('t' + isoDate, at(0), [
    { id: 'b' + isoDate, name: 'Town beach', ...STACK_COORD },
    { id: 'l' + isoDate, name: 'The lobster shack', lat: 42.06, lng: -70.19 },
  ], isoDate)
  const twice = buildPlacesFacts([day('2026-07-04'), day('2026-07-05')], [], [], { now: NOW })
  const once = buildPlacesFacts([day('2026-07-04')], [], [], { now: NOW })
  const adj = (fs) => fs.find((f) => f.type === 'adjacency')
  assert.ok(adj(twice), 'a co-occurring pair yields an adjacency fact')
  assert.ok(adj(twice).confidence > adj(once).confidence, 'more co-occurring days → stronger (smooth, no cutoff)')
  assert.equal(adj(twice).value.sequentialDays, 2, 'consecutive-in-the-day co-occurrence is tracked')
})

test('ADJACENCY unlearn + abstain: dropping a trip weakens the pair; places never together yield no fact', () => {
  const day = (id, iso, stops) => trip(id, at(0), stops, iso)
  const beachShack = [{ id: 'b', name: 'Town beach', ...STACK_COORD }, { id: 'l', name: 'The lobster shack', lat: 42.06, lng: -70.19 }]
  const lone = [{ id: 'm', name: 'The museum', lat: 42.3, lng: -70.5 }] // a different day, alone
  const before = buildPlacesFacts([day('t1', '2026-07-04', beachShack), day('t2', '2026-07-05', beachShack)], [], [], { now: NOW })
  const after = buildPlacesFacts([day('t1', '2026-07-04', beachShack)], [], [], { now: NOW })
  const pairConf = (fs) => (fs.find((f) => f.type === 'adjacency')?.confidence ?? 0)
  assert.ok(pairConf(after) < pairConf(before), 'dropping a co-occurring day unlearns some adjacency')
  const withLone = buildPlacesFacts([day('t1', '2026-07-04', beachShack), day('t3', '2026-07-09', lone)], [], [], { now: NOW })
  assert.ok(!withLone.some((f) => f.type === 'adjacency' && f.value.withPlace.includes('The museum')), 'a place that never shares a day yields NO adjacency (absence abstains)')
})

test('signatureDistance abstains on unshared dimensions (heterogeneous: a missing dimension is not a zero vote)', () => {
  const beachA = { typeHist: { obj: { beach: 1 }, total: 3 }, settingHist: { obj: {}, total: 0 }, timing: { mean: null, R: 0, n: 0 }, n: 3 }
  const beachB = { typeHist: { obj: { beach: 1 }, total: 3 }, settingHist: { obj: {}, total: 0 }, timing: { mean: null, R: 0, n: 0 }, n: 3 }
  const d = signatureDistance(beachA, beachB)
  assert.deepEqual(Object.keys(d.dims), ['placeType'], 'only the shared, present dimension is compared')
  assert.equal(d.dist, 0, 'same kind, no other data → indistinguishable (→ no signature, leave loose)')
})

test('deterministic: identical inputs in any row order produce identical facts (pure replay)', () => {
  const trips = ['t1', 't2'].map((id) => stackedTrip(id, at(0)))
  const mems = ['t1', 't2'].flatMap(stackedPhotos)
  const a = buildPlacesFacts(trips, mems, [], { now: NOW })
  const b = buildPlacesFacts(trips, [...mems].reverse(), [], { now: NOW })
  assert.deepEqual(a, b, 'output is independent of input ordering')
})
