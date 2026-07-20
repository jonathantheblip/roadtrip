import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consolidateAsks, applyAnswers, confirmedAsExemplars, summarizeCascade } from '../../src/lib/healLoop.js'
import { buildEvidenceBench } from '../../src/lib/evidenceBench.js'
import { settle, combineAffinity, SETTLE_DEFAULTS } from '../../src/lib/settlingEngine.js'
import { imputeSignals } from '../../src/lib/imputation.js'
import { buildVisionExemplars } from '../../src/lib/visionPlacement.js'

const at = (h, m = 0) => Date.UTC(2026, 6, 4, h, m)
// Two DISTINCT candidate places ~220m apart (beyond coincidentMeters, inside the GPS
// kernel) so a burst midway genuinely fits both → real ask material.
const PLACES = [
  { id: 'X', name: 'Herring Cove', lat: 42.052, lng: -70.18 },
  { id: 'Y', name: 'Race Point', lat: 42.05, lng: -70.18 },
]
// A burst of three photos halfway between X and Y — ambiguous by construction.
const burst = () => [
  { id: 'a', at: at(14, 0), lat: 42.051, lng: -70.18, provGps: 'exif' },
  { id: 'b', at: at(14, 2), lat: 42.051, lng: -70.18, provGps: 'exif' },
  { id: 'c', at: at(14, 4), lat: 42.051, lng: -70.18, provGps: 'exif' },
]
const run = (points, places, opts = {}) => {
  const bench = buildEvidenceBench(points, places, opts)
  return { res: settle(bench, places), pairs: [...combineAffinity(bench.affinity, SETTLE_DEFAULTS).values()] }
}

test('asks CONSOLIDATE: an ambiguous burst yields ONE question, not one per photo', () => {
  const { res, pairs } = run(burst(), PLACES)
  for (const id of ['a', 'b', 'c']) assert.equal(res.photos.get(id).destination, 'ask', `${id} asks`)
  const qs = consolidateAsks(res.photos, pairs)
  assert.equal(qs.length, 1, 'three ask-photos, one affine moment → ONE question')
  assert.deepEqual(qs[0].photoIds, ['a', 'b', 'c'])
  assert.ok(qs[0].candidates.some((c) => c.placeId === 'X') && qs[0].candidates.some((c) => c.placeId === 'Y'), 'the question carries both real candidates')
})

test('questions are ordered by REACH — the answer that touches more photos comes first', () => {
  const pts = [
    ...burst(), // 3-photo ambiguous moment
    { id: 'solo', at: at(19, 0), lat: 42.051, lng: -70.18, provGps: 'exif' }, // lone ambiguous photo
  ]
  const { res, pairs } = run(pts, PLACES)
  const qs = consolidateAsks(res.photos, pairs)
  assert.equal(qs.length, 2)
  assert.ok(qs[0].photoIds.length > qs[1].photoIds.length, 'the bigger moment is asked first')
  assert.ok(qs[0].reach >= 3)
})

test('ONE answer cascades: answering the first question resolves the whole moment', () => {
  const { res: before, pairs } = run(burst(), PLACES)
  const qs = consolidateAsks(before.photos, pairs)
  // The family answers the ONE question: "Herring Cove." Only photo `a` is directly
  // confirmed — b and c must be carried by the cascade, not by the answer itself.
  const answered = applyAnswers(burst(), [{ photoIds: ['a'], placeId: 'X' }])
  const { res: after } = run(answered, PLACES)
  assert.equal(after.photos.get('a').destination, 'file', 'the confirmed photo files (observed human speech act)')
  for (const id of ['b', 'c']) {
    const r = after.photos.get(id)
    assert.notEqual(r.destination, 'ask', `${id}'s question DISSOLVED without being asked`)
    assert.equal(r.top, 'X', `${id} settled to the confirmed place`)
  }
  const s = summarizeCascade(before.photos, after.photos)
  assert.equal(s.asksBefore, 3)
  assert.equal(s.asksAfter, 0, 'one answer emptied the whole queue')
  assert.ok(qs[0].reach >= 3)
})

test('a human answer OUTRANKS the machine lean — but never steamrolls strong contrary evidence', () => {
  // The machine leans Y (photos slightly nearer Y); the family answers X. One mate (c)
  // sits DIRECTLY on Y — its own observed truth must survive the answer (§7).
  const pts = [
    { id: 'a', at: at(14, 0), lat: 42.0509, lng: -70.18, provGps: 'exif' }, // ambiguous, leaning Y
    { id: 'b', at: at(14, 2), lat: 42.0509, lng: -70.18, provGps: 'exif' },
    { id: 'c', at: at(14, 4), lat: 42.05005, lng: -70.18, provGps: 'exif' }, // ON Y
  ]
  const answered = applyAnswers(pts, [{ photoIds: ['a'], placeId: 'X' }])
  const { res } = run(answered, PLACES)
  const a = res.photos.get('a'), b = res.photos.get('b'), c = res.photos.get('c')
  assert.equal(a.top, 'X', "the machine's lean does not override the family's answer")
  assert.equal(a.destination, 'file', 'the answered photo files at the ANSWERED place')
  assert.equal(b.top, 'X', 'the ambiguous mate follows the answer')
  assert.equal(b.destination, 'heal', 'inherited resolution stays soft')
  assert.equal(c.top, 'Y', "c's own strong observed evidence is NOT steamrolled by the moment's answer")
  assert.notEqual(c.destination, 'file', 'the contradiction surfaces instead of silently filing')
})

test('even a human confirm is not definitive: membership stays < 1 and remains revisable', () => {
  const answered = applyAnswers(burst(), [{ photoIds: ['a'], placeId: 'X' }])
  const { res } = run(answered, PLACES)
  assert.ok(res.photos.get('a').membership.X < 1, 'no single element is ever definitive — not even a tap')
})

test('a confirm TEACHES the cross-corpus classifier: the answer reaches OTHER trips', () => {
  // Trip A: a museum photo is confirmed to "The Museum". Trip B (different trip, no
  // coords): a similar-looking museum photo gains lookalike support for that place.
  const confirmedPts = applyAnswers(
    [{ id: 'tA', memoryId: 'mA', placeType: 'museum', labels: ['sculpture', 'gallery'], visionName: 'Museum afternoon' }],
    [{ photoIds: ['tA'], placeId: 'MUS' }],
  )
  const exemplars = buildVisionExemplars(confirmedAsExemplars(confirmedPts))
  const placesB = [{ id: 'MUS', name: 'The Museum' }, { id: 'OTHER', name: 'The Harbor' }]
  const bench = buildEvidenceBench(
    [{ id: 'tB', memoryId: 'mB', at: at(15), placeType: 'museum', labels: ['sculpture'] }],
    placesB,
    { exemplars },
  )
  const look = bench.placement.find((e) => e.witness === 'lookalike' && e.photoId === 'tB')
  assert.ok(look && look.support.MUS > 0, 'one answer in trip A lends evidence in trip B — the corpus learned')
})

test('a NEW GPS upload to a done trip resolves its bucket without any question (imputation + cascade)', () => {
  // Three old photos: time only, no coords — the machine can only leave them loose.
  const old = [
    { id: 'o1', at: at(10, 0) },
    { id: 'o2', at: at(10, 3) },
    { id: 'o3', at: at(10, 6) },
  ]
  const { res: before } = run(old, PLACES)
  for (const o of old) assert.equal(before.photos.get(o.id).destination, 'leave', 'stripped photos start loose')
  // The family re-uploads one photo from the same burst — GPS intact this time.
  const withNew = [...old, { id: 'new', at: at(10, 2), lat: 42.052, lng: -70.18, provGps: 'exif' }]
  const bench0 = buildEvidenceBench(withNew, PLACES)
  const pairs = [...combineAffinity(bench0.affinity, SETTLE_DEFAULTS).values()]
  const imputed = imputeSignals(withNew, pairs)
  const { res: after } = run(imputed, PLACES)
  for (const id of ['o1', 'o2', 'o3']) {
    const r = after.photos.get(id)
    assert.equal(r.top, 'X', `${id} resolved toward the new photo's place`)
    assert.notEqual(r.destination, 'leave', `${id} is no longer loose — one upload healed the bucket`)
    assert.notEqual(r.destination, 'file', 'but only SOFTLY — inherited evidence stays derived, never silent-files')
  }
})
