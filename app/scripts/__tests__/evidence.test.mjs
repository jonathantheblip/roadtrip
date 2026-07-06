// The Record — the evidence engine tests. Clustering a day's located photos into
// PINS is the "nearly free" draft of a hangout day; these pin the honest behavior:
// both gates (distance AND time) at their exact boundary, single-linkage across a
// span, leg-local day attribution (NOT UTC — the 11pm-photo trap), who from real
// photo authorship (never asserted), a machine guess that stays a guess, and
// cross-device determinism. Tests assert the thing that matters (a real split, a
// real merge, a real centroid, a real boundary), not tautologies (G7).
//
// tz:'UTC' is pinned on the day-window calls so attribution is deterministic on any
// runner (US local / UTC CI) — the TZ-fragility lesson from [[deploy-verify-and-tz-tests]].
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  photosForDay,
  clusterPhotos,
  buildDayEvidence,
  evidenceLevel,
  spanWords,
  pinsToDraftEntries,
  EVIDENCE_DEFAULTS,
} from '../../src/lib/evidence.js'
import { haversineMeters } from '../../src/lib/photoMatch.js'
import { isDraftEntry } from '../../src/lib/dayRecord.js'

// A day in Provincetown, times in UTC (attributed with tz:'UTC'). 0.001° lat ≈ 111m;
// 0.01° lat ≈ 1113m.
const ISO = '2026-07-03'
const UTC = { tz: 'UTC' }
const T = (hhmm) => `${ISO}T${hhmm}:00.000Z`
const BEACH = { lat: 42.05, lng: -70.24 }
const BEACH_N = { lat: 42.0505, lng: -70.24 } // ~55m north of BEACH
const BEACH_NN = { lat: 42.051, lng: -70.24 } // ~111m north of BEACH
const SHOP = { lat: 42.06, lng: -70.24 } // ~1113m north — clearly > 200m

function mem(id, author, refs) {
  return { id, authorTraveler: author, photoRefs: refs }
}
function ref(place, time, extra = {}) {
  return { lat: place.lat, lng: place.lng, capturedAt: T(time), ...extra }
}

test('photosForDay: reads coords+time across containers, needs both, filters to the day', () => {
  const memories = [
    mem('m1', 'helen', [ref(BEACH, '15:00', { locationLabel: 'Race Point' })]),
    // legacy single photoRef container
    { id: 'm2', authorTraveler: 'jonathan', photoRef: ref(BEACH_N, '15:30') },
    // pieces container
    { id: 'm3', authorTraveler: 'aurelia', pieces: [ref(SHOP, '15:15')] },
    // has coords but NO capture time → not located
    mem('m4', 'helen', [{ lat: 42.05, lng: -70.24 }]),
    // has time but NO coords → not located
    mem('m5', 'helen', [{ capturedAt: T('16:00') }]),
    // captured on a DIFFERENT day → filtered out
    mem('m6', 'helen', [{ lat: 42.05, lng: -70.24, capturedAt: '2026-07-04T15:00:00.000Z' }]),
  ]
  const located = photosForDay(memories, ISO, UTC)
  assert.equal(located.length, 3, 'only m1, m2, m3 carry both coords and a same-day time')
  assert.deepEqual(located.map((p) => p.memoryId), ['m1', 'm3', 'm2'], 'sorted by capture time (15:00, 15:15, 15:30)')
  assert.equal(located[0].author, 'helen')
  assert.equal(located[0].label, 'Race Point', 'the reverse-geocode label rides along as the guess source')
  assert.equal(located[2].author, 'jonathan', 'legacy photoRef container is read')
})

test('photosForDay: memory-level capturedAt is the fallback when a ref carries coords but no own date', () => {
  const memories = [{ id: 'm1', authorTraveler: 'helen', capturedAt: T('15:00'), photoRefs: [{ lat: 42.05, lng: -70.24 }] }]
  const located = photosForDay(memories, ISO, UTC)
  assert.equal(located.length, 1, 'the memory-level date rescues a ref with coords but no own capturedAt (LEG-C round-trip)')
  assert.equal(located[0].atIso, '2026-07-03T15:00:00.000Z')
})

test('photosForDay: attributes by LEG-LOCAL date, not UTC — the 11pm-photo trap', () => {
  // 11pm EDT on Jul 3 is 2026-07-04T03:00Z. A UTC window would call this "July 4"
  // and drop it from tonight's settle card; leg-local keeps it as July 3 evidence.
  const late = [{ id: 'm1', authorTraveler: 'helen', photoRefs: [{ lat: 42.05, lng: -70.24, capturedAt: '2026-07-04T03:00:00.000Z' }] }]
  assert.equal(photosForDay(late, '2026-07-03', { tz: 'America/New_York' }).length, 1, '11pm-local is TONIGHT’s evidence (Jul 3), not tomorrow’s')
  assert.equal(photosForDay(late, '2026-07-04', { tz: 'America/New_York' }).length, 0, 'and it is NOT July 4 for that family')
  // Symmetric on the other side of the globe: an 8am Tokyo photo is 2026-07-02T23:00Z.
  const early = [{ id: 'm2', authorTraveler: 'helen', photoRefs: [{ lat: 35.6, lng: 139.7, capturedAt: '2026-07-02T23:00:00.000Z' }] }]
  assert.equal(photosForDay(early, '2026-07-03', { tz: 'Asia/Tokyo' }).length, 1, 'an 8am Tokyo photo is that morning’s evidence, not the day before')
})

test('clusterPhotos: same place, close in time → ONE pin (centroid averaged, span spans both, who from authors)', () => {
  const located = photosForDay([
    mem('m1', 'helen', [ref(BEACH, '15:00')]),
    mem('m2', 'jonathan', [ref(BEACH_N, '15:30')]),
  ], ISO, UTC)
  const pins = clusterPhotos(located)
  assert.equal(pins.length, 1, 'two nearby, near-in-time photos are one place')
  const [pin] = pins
  assert.equal(pin.count, 2)
  assert.ok(Math.abs(pin.centroid.lat - 42.05025) < 1e-6, 'centroid is the mean latitude')
  assert.equal(pin.span.start, T('15:00'))
  assert.equal(pin.span.end, T('15:30'))
  assert.deepEqual(pin.who, ['helen', 'jonathan'], 'who = distinct photo authors, first-seen order — suggested, not asserted')
  assert.equal(pin.memoryIds.length, 2)
})

test('clusterPhotos: the DISTANCE gate — same time, far apart → TWO pins', () => {
  const located = photosForDay([
    mem('m1', 'helen', [ref(BEACH, '15:00')]),
    mem('m2', 'helen', [ref(SHOP, '15:05')]), // ~1113m away, 5 min later
  ], ISO, UTC)
  const pins = clusterPhotos(located)
  assert.equal(pins.length, 2, '> 200m apart is two places even minutes apart')
})

test('clusterPhotos: the TIME gate — same place, > 90 min apart → TWO pins', () => {
  const located = photosForDay([
    mem('m1', 'helen', [ref(BEACH, '15:00')]),
    mem('m2', 'helen', [ref(BEACH, '17:00')]), // same spot, 120 min later
  ], ISO, UTC)
  const pins = clusterPhotos(located)
  assert.equal(pins.length, 2, 'a 2-hour gap at the same beach is morning-there and afternoon-there')
})

test('clusterPhotos: TIME gate is EXACT — 90 min merges, 90 min + 1s splits (guards > vs >=)', () => {
  const at90 = photosForDay([
    mem('m1', 'helen', [ref(BEACH, '15:00')]),
    mem('m2', 'helen', [{ lat: BEACH.lat, lng: BEACH.lng, capturedAt: T('16:30') }]), // exactly 90 min
  ], ISO, UTC)
  assert.equal(clusterPhotos(at90).length, 1, 'exactly 90 min is within the gate (> gapMs, not >=) → one pin')
  const past90 = photosForDay([
    mem('m1', 'helen', [ref(BEACH, '15:00')]),
    mem('m2', 'helen', [{ lat: BEACH.lat, lng: BEACH.lng, capturedAt: '2026-07-03T16:30:01.000Z' }]), // 90 min + 1s
  ], ISO, UTC)
  assert.equal(clusterPhotos(past90).length, 2, 'one second past the gate splits')
})

test('clusterPhotos: DISTANCE gate is EXACT at radiusMeters (guards > vs >=)', () => {
  const located = photosForDay([
    mem('m1', 'helen', [ref(BEACH, '15:00')]),
    mem('m2', 'helen', [ref(BEACH_NN, '15:10')]),
  ], ISO, UTC)
  const d = haversineMeters(BEACH.lat, BEACH.lng, BEACH_NN.lat, BEACH_NN.lng)
  assert.equal(clusterPhotos(located, { radiusMeters: d }).length, 1, 'at exactly the radius, the pair merges (> radius, not >=)')
  assert.equal(clusterPhotos(located, { radiusMeters: d - 0.01 }).length, 2, 'a hair under the exact distance splits them')
})

test('clusterPhotos: single-linkage bridges a long presence — ends > 90 min apart still ONE pin', () => {
  // 15:00 → 15:30 (30m) → 16:35 (65m after 15:30, 95m after 15:00). No direct
  // 15:00↔16:35 union (95 > 90), but each bridges the next → one continuous pin.
  const located = photosForDay([
    mem('m1', 'helen', [ref(BEACH, '15:00')]),
    mem('m2', 'helen', [ref(BEACH_N, '15:30')]),
    mem('m3', 'helen', [ref(BEACH_NN, '16:35')]),
  ], ISO, UTC)
  const pins = clusterPhotos(located)
  assert.equal(pins.length, 1, 'a continuous presence ("the beach till one") is one pin even across > 90 min end-to-end')
  assert.equal(pins[0].count, 3)
  assert.equal(pins[0].span.start, T('15:00'))
  assert.equal(pins[0].span.end, T('16:35'))
})

test('clusterPhotos: interleaved places split correctly (beach · shop · back to beach)', () => {
  const located = photosForDay([
    mem('m1', 'helen', [ref(BEACH, '15:00')]),
    mem('m2', 'jonathan', [ref(SHOP, '15:15')]), // a hop away
    mem('m3', 'helen', [ref(BEACH_N, '15:30')]), // back near the beach
  ], ISO, UTC)
  const pins = clusterPhotos(located)
  assert.equal(pins.length, 2, 'the shop does not glue the two beach visits together')
  const beach = pins.find((p) => p.count === 2)
  assert.ok(beach, 'the two beach photos rejoin as one pin')
  assert.deepEqual(beach.memoryIds.sort(), ['m1', 'm3'])
})

test('clusterPhotos: guess is the commonest label, or null (never a fabricated name)', () => {
  const withLabels = clusterPhotos(photosForDay([
    mem('m1', 'helen', [ref(BEACH, '15:00', { locationLabel: 'Race Point' })]),
    mem('m2', 'helen', [ref(BEACH_N, '15:20', { locationLabel: 'Race Point' })]),
    mem('m3', 'helen', [ref(BEACH_NN, '15:40', { locationLabel: 'The dunes' })]),
  ], ISO, UTC))
  assert.equal(withLabels[0].guess, 'Race Point', 'the most common reverse-geocode wins the guess')

  const noLabels = clusterPhotos(photosForDay([
    mem('m1', 'helen', [ref(BEACH, '15:00')]),
    mem('m2', 'helen', [ref(BEACH_N, '15:20')]),
  ], ISO, UTC))
  assert.equal(noLabels[0].guess, null, 'no label → null guess (the UI shows a generic "a spot", never a fake name)')
})

test('clusterPhotos: DETERMINISTIC across devices — reordered input yields identical id, who, guess', () => {
  // Two phones snap the SAME second; sync arrival order differs. The merged pin must
  // read identically on both — id, who-order, AND the label guess (contract line 35).
  const a = mem('mA', 'aurelia', [{ lat: BEACH.lat, lng: BEACH.lng, capturedAt: T('15:00'), locationLabel: 'Race Point' }])
  const b = mem('mB', 'helen', [{ lat: BEACH_N.lat, lng: BEACH_N.lng, capturedAt: T('15:00'), locationLabel: 'Herring Cove' }])
  const p1 = clusterPhotos(photosForDay([a, b], ISO, UTC))[0]
  const p2 = clusterPhotos(photosForDay([b, a], ISO, UTC))[0] // reversed input
  assert.equal(p1.id, p2.id, 'same membership → same pin id regardless of input order')
  assert.deepEqual(p1.who, p2.who, 'who order is stable (id tie-break), not sync-arrival order')
  assert.equal(p1.guess, p2.guess, 'the machine guess is stable on a label tie, not device-dependent')
})

test('clusterPhotos: pin ids are deterministic from membership and carry the day', () => {
  const pins = clusterPhotos(photosForDay([
    mem('m1', 'helen', [ref(BEACH, '15:00')]),
    mem('m2', 'jonathan', [ref(BEACH_N, '15:30')]),
  ], ISO, UTC))
  assert.match(pins[0].id, /^pin-2026-07-03-/, 'id carries the day for readability')
})

test('evidenceLevel: rich at ≥2 pins OR ≥6 photos; thin otherwise', () => {
  assert.equal(evidenceLevel({ pinCount: 2, photoCount: 2 }), 'rich', 'two places is a keepable day')
  assert.equal(evidenceLevel({ pinCount: 1, photoCount: 6 }), 'rich', 'six photos is a substantive day even if it did not cluster')
  assert.equal(evidenceLevel({ pinCount: 1, photoCount: 3 }), 'thin', 'one place, a few shots → the nothing-day tap')
  assert.equal(evidenceLevel({ pinCount: 0, photoCount: 0 }), 'thin', 'a genuinely quiet day')
  assert.equal(evidenceLevel({}), 'thin', 'defaults are safe')
})

test('buildDayEvidence: composes located count + pins for the settle card', () => {
  const memories = [
    mem('m1', 'helen', [ref(BEACH, '15:00')]),
    mem('m2', 'jonathan', [ref(BEACH_N, '15:30')]),
    mem('m3', 'aurelia', [ref(SHOP, '18:00')]),
    mem('m4', 'helen', [{ lat: 42.05, lng: -70.24 }]), // unlocated (no time)
  ]
  const ev = buildDayEvidence(memories, ISO, UTC)
  assert.equal(ev.locatedCount, 3, 'three photos carried GPS + time')
  assert.equal(ev.pins.length, 2, 'beach (2) + shop (1)')
  assert.equal(ev.isoDate, ISO)
  assert.equal(evidenceLevel({ pinCount: ev.pins.length, photoCount: ev.locatedCount }), 'rich')
})

test('EVIDENCE_DEFAULTS: the tuning gates are the design’s ~200m / ~90min', () => {
  assert.equal(EVIDENCE_DEFAULTS.radiusMeters, 200)
  assert.equal(EVIDENCE_DEFAULTS.gapMinutes, 90)
})

test('spanWords: a bare 12-hour range or "around N", local to the leg', () => {
  const span = (a, b) => ({ startMs: Date.parse(T(a)), endMs: Date.parse(T(b)) })
  assert.equal(spanWords(span('11:00', '13:00'), UTC), '11–1', 'morning-till-one reads as a range')
  assert.equal(spanWords(span('16:00', '16:40'), UTC), 'around 4', 'one hour bucket → "around 4"')
  assert.equal(spanWords(span('16:00', '16:00'), UTC), 'around 4', 'a collapsed span (EXIF-less) is one moment')
  assert.equal(spanWords(null), '', 'no span → no words')
})

test('pinsToDraftEntries: a pin becomes an UNNAMED draft entry the read face recognizes', () => {
  const pins = clusterPhotos(photosForDay([
    mem('m1', 'helen', [ref(BEACH, '15:00', { locationLabel: 'Race Point' })]),
    mem('m2', 'jonathan', [ref(BEACH_N, '16:00', { locationLabel: 'Race Point' })]),
  ], ISO, UTC), UTC)
  const [d] = pinsToDraftEntries(pins, { party: ['jonathan', 'helen'], tz: 'UTC' })
  assert.equal(d.name, '', 'a draft is UNNAMED by construction')
  assert.equal(d.source, 'evidence')
  assert.ok(isDraftEntry(d), 'isDraftEntry recognizes an evidence draft')
  assert.equal(d.id, pins[0].id, 'the stable pin id is the entry id → re-keeping upserts, never duplicates')
  assert.equal(d.guess, 'Race Point', 'the machine guess rides along (never a name)')
  assert.deepEqual(d.for, ['helen', 'jonathan'], 'who = the pin’s suggested authors')
  assert.equal(d.photoCount, 2)
  assert.equal(d.time, '3–4', 'the span in words (15:00–16:00 UTC → 3–4)')
})

test('pinsToDraftEntries: empty who falls back to the whole party (the honest hangout default)', () => {
  const pins = clusterPhotos(photosForDay([
    { id: 'm1', photoRefs: [ref(BEACH, '15:00')] }, // no author
  ], ISO, UTC), UTC)
  const [d] = pinsToDraftEntries(pins, { party: ['jonathan', 'helen', 'aurelia', 'rafa'], tz: 'UTC' })
  assert.deepEqual(d.for, ['jonathan', 'helen', 'aurelia', 'rafa'], 'no photo author → the party is the suggestion')
})

// ── FIX 1 · the surprise filter at the SOURCE (SPEC §3 A-4½, ship-blocker) ────
// An unrevealed surprise must be invisible to the viewer it hides from at the
// evidence engine itself — not only upstream in listMemoriesForTrip — so no
// caller (retro-settle, a future surface, a raw-list path) can rebuild pins
// from a secret. Per-viewer, not global: the author/conspirator still sees it.

test('photosForDay: an unrevealed surprise is invisible to the viewer it hides from — per-viewer, not global', () => {
  const memories = [
    mem('m-plain', 'helen', [ref(BEACH, '15:00')]),
    { id: 'm-secret', authorTraveler: 'jonathan', hideFrom: ['helen'], photoRefs: [ref(SHOP, '16:00', { locationLabel: 'The Kite Shop' })] },
  ]
  const forHelen = photosForDay(memories, ISO, { tz: 'UTC', viewer: 'helen' })
  assert.deepEqual(forHelen.map((p) => p.memoryId), ['m-plain'], 'helen (hidden-from) never sees the secret photo')
  const forJonathan = photosForDay(memories, ISO, { tz: 'UTC', viewer: 'jonathan' })
  assert.deepEqual(forJonathan.map((p) => p.memoryId), ['m-plain', 'm-secret'], 'the author still sees his own surprise')
  const forAurelia = photosForDay(memories, ISO, { tz: 'UTC', viewer: 'aurelia' })
  assert.deepEqual(forAurelia.map((p) => p.memoryId), ['m-plain', 'm-secret'], 'a conspirator it is NOT hidden from sees its pins — per-viewer, not global')
})

test('photosForDay: hideFrom everyone hides from every non-author; a REVEALED surprise is real for all', () => {
  const secret = { id: 'm-secret', authorTraveler: 'jonathan', hideFrom: ['everyone'], photoRefs: [ref(SHOP, '16:00')] }
  assert.equal(photosForDay([secret], ISO, { tz: 'UTC', viewer: 'helen' }).length, 0)
  assert.equal(photosForDay([secret], ISO, { tz: 'UTC', viewer: 'rafa' }).length, 0)
  assert.equal(photosForDay([secret], ISO, { tz: 'UTC', viewer: 'jonathan' }).length, 1, 'the author always sees their own')
  const revealed = { ...secret, revealed: '2026-07-03T18:00:00.000Z' }
  assert.equal(photosForDay([revealed], ISO, { tz: 'UTC', viewer: 'helen' }).length, 1, 'revealed = everyone')
})

test('photosForDay/buildDayEvidence: no viewer → no filtering (legacy callers unchanged)', () => {
  const memories = [{ id: 'm-secret', authorTraveler: 'jonathan', hideFrom: ['helen'], photoRefs: [ref(SHOP, '16:00')] }]
  assert.equal(photosForDay(memories, ISO, UTC).length, 1, 'viewer-less read keeps the old behavior')
  const evHelen = buildDayEvidence(memories, ISO, { tz: 'UTC', viewer: 'helen' })
  assert.equal(evHelen.pins.length, 0, 'buildDayEvidence passes the viewer through to the source')
  assert.equal(evHelen.locatedCount, 0, 'the located count cannot leak the secret’s existence by arithmetic')
})

// ── FIX 4 · who-correction rides pinsToDraftEntries ──────────────────────────
test('pinsToDraftEntries: a who-correction overrides the suggestion and is MARKED as edited', () => {
  const pins = clusterPhotos(photosForDay([
    mem('m1', 'helen', [ref(BEACH, '15:00')]),
    mem('m2', 'jonathan', [ref(BEACH_N, '15:20')]),
    mem('m3', 'aurelia', [ref(SHOP, '18:00')]),
  ], ISO, UTC), UTC)
  assert.equal(pins.length, 2)
  const drafts = pinsToDraftEntries(pins, {
    party: ['jonathan', 'helen', 'aurelia', 'rafa'],
    tz: 'UTC',
    who: { [pins[0].id]: ['helen', 'rafa'] },
  })
  assert.deepEqual(drafts[0].for, ['helen', 'rafa'], 'the corrected set rides the entry’s for')
  assert.equal(drafts[0].whoEdited, true, 'marked so the merge knows a person chose this (vs a suggestion)')
  assert.deepEqual(drafts[1].for, ['aurelia'], 'an uncorrected pin keeps its author suggestion')
  assert.equal(drafts[1].whoEdited, undefined, 'no correction → no mark')
})

test('pinsToDraftEntries: an EMPTY who-correction is ignored (falls back to the suggestion chain)', () => {
  const pins = clusterPhotos(photosForDay([mem('m1', 'helen', [ref(BEACH, '15:00')])], ISO, UTC), UTC)
  const [d] = pinsToDraftEntries(pins, { party: ['jonathan', 'helen'], tz: 'UTC', who: { [pins[0].id]: [] } })
  assert.deepEqual(d.for, ['helen'], 'deselecting everyone is not a correction — the suggestion stands')
  assert.equal(d.whoEdited, undefined)
})

// ── P1 · the one-tap keep never publishes a secret place ─────────────────────
// The author SEES their surprise's pin (per-viewer masking), but the record a
// keep writes is shared with every lens — so the zero-friction card keep drops
// masked-origin pins; the sheet remains the deliberate include/leave-out path.
import { pinsWithoutUnrevealedSurprises } from '../../src/lib/evidence.js'

test('pinsWithoutUnrevealedSurprises: drops any pin holding an unrevealed surprise; revealed and plain pass through', () => {
  const memories = [
    mem('m-plain', 'helen', [ref(BEACH, '15:00')]),
    { id: 'm-secret', authorTraveler: 'jonathan', hideFrom: ['helen'], photoRefs: [ref(SHOP, '16:00')] },
  ]
  const pins = clusterPhotos(photosForDay(memories, ISO, { tz: 'UTC', viewer: 'jonathan' }))
  assert.equal(pins.length, 2, 'the author sees both pins')
  const safe = pinsWithoutUnrevealedSurprises(pins, memories)
  assert.equal(safe.length, 1, 'the secret-place pin is not quick-keepable')
  assert.deepEqual(safe[0].memoryIds, ['m-plain'])
  // Revealed = real for everyone → publishable.
  const revealed = memories.map((m) => (m.id === 'm-secret' ? { ...m, revealed: '2026-07-03T18:00:00.000Z' } : m))
  assert.equal(pinsWithoutUnrevealedSurprises(pins, revealed).length, 2)
  // A MIXED pin (a secret member sharing a cluster with a plain photo) is
  // dropped whole — its entry would still place the secret on the record.
  const mixed = clusterPhotos(photosForDay([
    mem('m-plain', 'helen', [ref(BEACH, '15:00')]),
    { id: 'm-secret', authorTraveler: 'jonathan', hideFrom: ['helen'], photoRefs: [ref(BEACH_N, '15:10')] },
  ], ISO, { tz: 'UTC', viewer: 'jonathan' }))
  assert.equal(mixed.length, 1, 'one shared cluster')
  assert.equal(pinsWithoutUnrevealedSurprises(mixed, memories).length, 0)
  // No surprises in play → the SAME array reference (memo-friendly no-op).
  const plainOnly = [mem('m-plain', 'helen', [ref(BEACH, '15:00')])]
  const plainPins = clusterPhotos(photosForDay(plainOnly, ISO, UTC))
  assert.equal(pinsWithoutUnrevealedSurprises(plainPins, plainOnly), plainPins)
})
