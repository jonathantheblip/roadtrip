// resourceScan.js — the re-source scan mechanism (Album System Ch 04): read the
// ORIGINALS on a device, match to imported refs by capture instant, recover GPS +
// the capture offset. Tests the pure logic + the injected-IO runner. TZ-robust: the
// end-to-end cases derive the ref's capturedAt the same local→UTC way the importer
// did, so they pass under any TZ (see deploy-verify note).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseOffsetMinutes,
  originalToRecovered,
  instantKey,
  candidateKeys,
  buildRefIndex,
  countNeedyRefs,
  matchRecovered,
  runResourceScan,
} from '../../src/lib/resourceScan.js'

const r2 = (over = {}) => ({ key: 'k', storage: 'r2', capturedAt: '2026-07-05T17:42:00Z', ...over })

// Two real, valid 16-hex-char dHashes: SCENE_A and its bitwise complement (every
// nibble XORed against 0xF), which is GUARANTEED to be 64 bits apart — as far from
// "similar" (sameMaxBits=10 of 64) as two hashes can be. Real content verification
// tests don't need real pixels; they need two hashes that provably do/don't match.
const SCENE_A = 'a1b2c3d4e5f60718'
const SCENE_B = SCENE_A.split('').map((c) => (0xf ^ parseInt(c, 16)).toString(16)).join('')

// Review round 5: the maximal-distance SCENE_A/SCENE_B pair above proves the
// mismatch path works, but says nothing about behavior near the REAL decision
// boundary (sameMaxBits=10 of 64) — which is exactly where a false positive would
// live. Both verified by direct Hamming-distance computation (not hand-typed):
// SCENE_NEAR is 6 bits from SCENE_A (within tolerance — matches); SCENE_FAR_MATCH
// is ALSO 6 bits from SCENE_A (independently matches) but 12 bits from SCENE_NEAR
// (beyond tolerance — genuinely a different photo).
const SCENE_NEAR = '2593cb94e5f60718' // 6 bits from SCENE_A
const SCENE_FAR_MATCH = 'e3a247f4e5f60718' // 6 bits from SCENE_A, 12 bits from SCENE_NEAR

test('parseOffsetMinutes: signed HH:MM → minutes; garbage and out-of-range rejected', () => {
  assert.equal(parseOffsetMinutes('-04:00'), -240)
  assert.equal(parseOffsetMinutes('+05:30'), 330)
  assert.equal(parseOffsetMinutes('+00:00'), 0)
  assert.equal(parseOffsetMinutes('+14:00'), 840) // the widest real offset
  assert.equal(parseOffsetMinutes('garbage'), null)
  assert.equal(parseOffsetMinutes(null), null)
  // A corrupt exporter must never additively stamp an absurd offset onto a photo:
  // it would file it days off, and (being additive) block the correct one forever.
  assert.equal(parseOffsetMinutes('+99:99'), null)
  assert.equal(parseOffsetMinutes('+15:00'), null)
  assert.equal(parseOffsetMinutes('-14:30'), null)
  assert.equal(parseOffsetMinutes('+05:60'), null)
})

test('originalToRecovered: capturedAt (UTC), gps, offset — omitting what is absent', () => {
  const full = originalToRecovered({
    DateTimeOriginal: new Date('2026-07-05T17:42:00.000Z'),
    GPSLatitude: 42.06,
    GPSLongitude: -70.16,
    OffsetTimeOriginal: '-04:00',
  })
  assert.equal(full.capturedAt, '2026-07-05T17:42:00.000Z')
  assert.equal(full.lat, 42.06)
  assert.equal(full.offsetMinutes, -240)
  const bare = originalToRecovered({ DateTimeOriginal: new Date('2026-07-05T17:42:00Z') })
  assert.equal('lat' in bare, false)
  assert.equal('offsetMinutes' in bare, false)
  assert.equal('capturedAtTrue' in bare, false) // no offset → no true-instant key
})

test('originalToRecovered: falls back to CreateDate exactly as the importer does', () => {
  // photoPipeline.readExif keys on (DateTimeOriginal || CreateDate). An original
  // carrying only CreateDate was imported under that key; reading only
  // DateTimeOriginal here would make it permanently unmatchable.
  const out = originalToRecovered({ CreateDate: new Date('2026-07-05T17:42:00.000Z'), GPSLatitude: 1, GPSLongitude: 2 })
  assert.equal(out.capturedAt, '2026-07-05T17:42:00.000Z')
  assert.equal(out.lat, 1)
})

test('candidateKeys: the device-local reading AND the photo\'s true instant (survives a tz change)', () => {
  // A photo shot at 17:42 local with offset -04:00. Whatever tz this machine is in,
  // the true instant is 21:42Z — the key an import made in the photo's own zone used.
  const recovered = originalToRecovered({
    DateTimeOriginal: new Date(2026, 6, 5, 17, 42, 0), // local-parsed, like the importer
    OffsetTimeOriginal: '-04:00',
  })
  const keys = candidateKeys(recovered)
  assert.ok(keys.includes(instantKey(new Date(2026, 6, 5, 17, 42, 0).toISOString())))
  assert.ok(keys.includes('2026-07-05T21:42:00'))
  assert.ok(keys.length <= 2)
})

test('instantKey truncates to the second (import-ms vs recompute-no-ms never blocks)', () => {
  assert.equal(instantKey('2026-07-05T17:42:00.500Z'), '2026-07-05T17:42:00')
  assert.equal(instantKey('bad'), null)
})

test('buildRefIndex: indexes needy AND complete r2 refs (flagged); skips masked, non-r2, videos', () => {
  const idx = buildRefIndex([
    { id: 'm1', photoRefs: [r2({ key: 'k1' })] },
    { id: 'm2', photoRefs: [r2({ key: 'k2', capturedAt: '2026-07-05T18:00:00Z', lat: 1, lng: 2, offsetMinutes: -240 })] },
    { id: 'm3', masked: true, photoRefs: [r2({ key: 'k3', capturedAt: '2026-07-05T19:00:00Z' })] },
    { id: 'm4', photoRefs: [r2({ key: 'k4', storage: 'pending', capturedAt: '2026-07-05T20:00:00Z' })] },
    // A video's original can never come through an image picker — indexing it
    // would promise a "waiting" count that never drains.
    { id: 'm5', photoRefs: [r2({ key: 'k5', kind: 'video', capturedAt: '2026-07-05T21:00:00Z' })] },
  ])
  assert.equal(idx.size, 2)
  const e = idx.get('2026-07-05T17:42:00')[0]
  assert.equal(e.memoryId, 'm1')
  assert.equal(e.needsGps, true)
  assert.equal(e.complete, false)
  assert.equal(idx.get('2026-07-05T18:00:00')[0].complete, true)
  assert.equal(countNeedyRefs(idx), 1)
})

test('buildRefIndex: photoRef is a back-compat MIRROR of photoRefs[0] — never indexed twice', () => {
  // The store keeps both; flattenPhotoEntries (canonical) ignores photoRef whenever
  // photoRefs[] is populated. Indexing both double-counts every single-photo memory.
  const ref = r2({ key: 'k1' })
  const idx = buildRefIndex([{ id: 'm1', photoRef: ref, photoRefs: [ref] }])
  assert.equal(idx.get('2026-07-05T17:42:00').length, 1)
  assert.equal(countNeedyRefs(idx), 1)
  // Legacy row with only photoRef still indexes.
  assert.equal(countNeedyRefs(buildRefIndex([{ id: 'm2', photoRef: r2({ key: 'k2' }) }])), 1)
})

test('buildRefIndex: a RAW surprise row hidden from the viewer is skipped (masked:true is not the predicate)', () => {
  // `masked` is set only on worker projections. A surprise authored on THIS device
  // is an ordinary row carrying hideFrom — the scan must not touch or count it.
  const surprise = { id: 'm1', authorTraveler: 'helen', hideFrom: ['jonathan'], photoRefs: [r2({ key: 'k1' })] }
  assert.equal(countNeedyRefs(buildRefIndex([surprise], 'jonathan')), 0)
  // Its own author is not hidden from it — she may still recover her own photo.
  assert.equal(countNeedyRefs(buildRefIndex([surprise], 'helen')), 1)
})

test('matchRecovered: fills a ref at the same instant; unmatched when none', () => {
  const idx = buildRefIndex([{ id: 'm1', photoRefs: [r2({ key: 'k1' })] }])
  const hit = matchRecovered({ capturedAt: '2026-07-05T17:42:00.000Z', lat: 42, lng: -70, offsetMinutes: -240 }, idx)
  assert.equal(hit.matched, true)
  assert.equal(hit.writes[0].lat, 42)
  assert.equal(hit.writes[0].offsetMinutes, -240)
  const miss = matchRecovered({ capturedAt: '2026-07-05T18:00:00Z', lat: 1, lng: 2 }, idx)
  assert.equal(miss.matched, false)
})

test('matchRecovered writes only the MISSING field (per-field idempotent)', () => {
  const idx = buildRefIndex([{ id: 'm1', photoRefs: [r2({ key: 'k1', lat: 1, lng: 2 })] }])
  const { writes } = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 9, lng: 9, offsetMinutes: -240 }, idx)
  assert.equal(writes.length, 1)
  assert.equal('lat' in writes[0], false) // gps already present → not re-written
  assert.equal(writes[0].offsetMinutes, -240)
})

test('matchRecovered: ONLY YOUR OWN — a same-second collision never writes onto anyone else\'s photo', () => {
  // Jonathan at the beach, Helen in town, same wall-clock second. Helen scans.
  // Filling his ref with HER coordinates would be a wrong write, and additively
  // permanent: his real original could never correct it afterwards. Nor the kid's.
  const idx = buildRefIndex([
    { id: 'his', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'kj' })] },
    { id: 'hers', authorTraveler: 'helen', photoRefs: [r2({ key: 'kh' })] },
    { id: 'kids', authorTraveler: 'rafa', photoRefs: [r2({ key: 'kr' })] },
  ])
  const { writes } = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 42, lng: -70 }, idx, 'helen')
  assert.deepEqual(writes.map((w) => w.memoryId), ['hers'])
})

test('matchRecovered: a kid\'s photo is NEVER filled from a parent\'s phone — the ride-along is unprovable', () => {
  // The index holds only IMPORTED photos, so "no ref of Helen's sits at this second"
  // does NOT mean Helen has no photo at this second. Her un-imported original can
  // collide with Rafa's imported one, and stamping her town coordinates onto his
  // beach photo would be permanent — a kid never runs this tool to undo it.
  const alone = buildRefIndex([{ id: 'kid', authorTraveler: 'rafa', photoRefs: [r2({ key: 'kr' })] }])
  const res = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 42, lng: -70 }, alone, 'helen')
  assert.equal(res.reason, 'not-yours')
  assert.equal(res.writes.length, 0)

  // The kid's own ref is still filled by nobody at all — not even a second kid.
  const twoKids = buildRefIndex([
    { id: 'rafa', authorTraveler: 'rafa', photoRefs: [r2({ key: 'kr' })] },
    { id: 'aurelia', authorTraveler: 'aurelia', photoRefs: [r2({ key: 'ka' })] },
  ])
  assert.equal(matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 42, lng: -70 }, twoKids, 'helen').writes.length, 0)
})

test('matchRecovered: an author-less ref is never filled — nothing attributes it to the scanner', () => {
  // `author_traveler` is NOT NULL in the schema, so this is defensive: an
  // un-attributable ref could belong to anyone, and the write would be permanent.
  const idx = buildRefIndex([{ id: 'legacy', photoRefs: [r2({ key: 'kl' })] }])
  const res = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 42, lng: -70 }, idx, 'helen')
  assert.equal(res.reason, 'not-yours')
  assert.equal(res.writes.length, 0)
})

test('matchRecovered: REFUSE ON AMBIGUITY — when both readings hit photos, nothing is written', () => {
  // The cross-zone case. An original's device-local reading is a PHANTOM instant
  // that can coincide with a different real photo. Neither key is privileged
  // (preferring either writes the wrong photo in the other's scenario), and the
  // write is permanent — so refuse. This is the scanner's OWN photo on both sides,
  // so author affinity does not protect it; only the refusal does.
  // The two readings are stated explicitly so this asserts the same thing on any
  // machine (deriving them from EXIF would collapse them wherever the host's zone
  // happens to equal the photo's).
  const local = '2026-07-05T17:42:00.000Z'
  const trueInstant = '2026-07-05T21:42:00.000Z'
  const idx = buildRefIndex([
    { id: 'phantom-hit', authorTraveler: 'helen', photoRefs: [r2({ key: 'kW', capturedAt: local })] },
    { id: 'real-photo', authorTraveler: 'helen', photoRefs: [r2({ key: 'kR', capturedAt: trueInstant })] },
  ])
  const recovered = { capturedAt: local, capturedAtTrue: trueInstant, lat: 42, lng: -70, offsetMinutes: -240 }
  assert.equal(candidateKeys(recovered).length, 2)
  const res = matchRecovered(recovered, idx, 'helen')
  assert.equal(res.reason, 'ambiguous')
  assert.equal(res.writes.length, 0)

  // Only ONE reading hits → unambiguous, and it fills that photo.
  const onlyTrue = buildRefIndex([{ id: 'real-photo', authorTraveler: 'helen', photoRefs: [r2({ key: 'kR', capturedAt: trueInstant })] }])
  const ok = matchRecovered(recovered, onlyTrue, 'helen')
  assert.equal(ok.reason, null)
  assert.deepEqual(ok.writes.map((w) => w.memoryId), ['real-photo'])
})

test('matchRecovered: reasons distinguish complete / nothing-to-give / not-yours', () => {
  const complete = buildRefIndex([{ id: 'm', authorTraveler: 'helen', photoRefs: [r2({ lat: 1, lng: 2, offsetMinutes: 0 })] }])
  assert.equal(matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 9, lng: 9 }, complete, 'helen').reason, 'complete')

  const needy = buildRefIndex([{ id: 'm', authorTraveler: 'helen', photoRefs: [r2()] }])
  assert.equal(matchRecovered({ capturedAt: '2026-07-05T17:42:00Z' }, needy, 'helen').reason, 'nothing')

  const theirs = buildRefIndex([{ id: 'm', authorTraveler: 'jonathan', photoRefs: [r2()] }])
  assert.equal(matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 1, lng: 2 }, theirs, 'helen').reason, 'not-yours')
})

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT VERIFICATION — round 4's fix. authorTraveler is who IMPORTED a memory,
// not who took the photo (every add path sets it to the active importer), so
// "same author, same second" was never actually proof of "same photo". These
// tests pin the property that closes it: a scene-hash MATCH is proof regardless
// of authorship, a scene-hash MISMATCH is proof of the opposite and permanently
// excludes that candidate, and a candidate with no stored hash yet remains
// eligible for the older, weaker fallback rule untouched by either verdict.
// ═══════════════════════════════════════════════════════════════════════════

test('matchRecovered: a CONTENT MATCH fills across authors — the legitimate AirDrop/shared-photo case', () => {
  // Jonathan's photo, imported by whoever added it — but Helen's original IS that
  // same photo (she has a copy too). Content proves it; authorship doesn't need to.
  const idx = buildRefIndex([{ id: 'his', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'kj', scene: SCENE_A })] }])
  const res = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 42, lng: -70, scene: SCENE_A }, idx, 'helen')
  assert.equal(res.reason, null)
  assert.deepEqual(res.writes.map((w) => w.memoryId), ['his'])
})

test('matchRecovered: a CONTENT MISMATCH refuses even when author matches — closes the round-4 wrong write', () => {
  // Helen's own ref Q collides at the same second as her original P, but P's
  // content does NOT match Q's stored scene — proof they are different photos.
  // The old author-only rule would have filled this; content proof refuses it.
  const idx = buildRefIndex([{ id: 'Q', authorTraveler: 'helen', photoRefs: [r2({ key: 'kq', scene: SCENE_A })] }])
  const res = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 42, lng: -70, scene: SCENE_B }, idx, 'helen')
  assert.equal(res.matched, false)
  assert.equal(res.reason, 'unmatched')
  assert.equal(res.writes.length, 0)
})

test('matchRecovered: content resolves a two-key ambiguity the timing-only rule could not', () => {
  // Device-local key hits C1 (real match); the true-instant key hits C2 (a
  // DIFFERENT photo — the cross-zone phantom-key case, round-4 B2/B4). Content
  // proves which is real without needing to trust either key blindly.
  const local = '2026-07-05T17:42:00.000Z'
  const trueInstant = '2026-07-05T21:42:00.000Z'
  const idx = buildRefIndex([
    { id: 'C1', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'k1', capturedAt: local, scene: SCENE_A })] },
    { id: 'C2', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'k2', capturedAt: trueInstant, scene: SCENE_B })] },
  ])
  const recovered = { capturedAt: local, capturedAtTrue: trueInstant, lat: 42, lng: -70, scene: SCENE_A }
  assert.equal(candidateKeys(recovered).length, 2) // both keys really do hit, proving this isn't a trivial case
  const res = matchRecovered(recovered, idx, 'helen')
  assert.equal(res.reason, null)
  assert.deepEqual(res.writes.map((w) => w.memoryId), ['C1'])
})

test('matchRecovered: a disproved candidate does not block a DIFFERENT, not-yet-backfilled candidate at the same instant', () => {
  // A: content-disproved (wrong photo). B: no stored scene yet (composition
  // backfill hasn't reached it) — still eligible via the fallback rule. A's
  // disproof must not collaterally block B.
  const idx = buildRefIndex([
    { id: 'A', authorTraveler: 'helen', photoRefs: [r2({ key: 'ka', scene: SCENE_B })] },
    { id: 'B', authorTraveler: 'helen', photoRefs: [r2({ key: 'kb' })] }, // no scene
  ])
  const res = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 42, lng: -70, scene: SCENE_A }, idx, 'helen')
  assert.equal(res.reason, null)
  assert.deepEqual(res.writes.map((w) => w.memoryId), ['B'])
})

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-CANDIDATE CONTENT MATCH — review round 5's blocker. A loose similarity
// threshold (sameMaxBits=10 of 64) is not automatically proof of a SINGLE
// identity: two genuinely different near-duplicate photos (burst frames, two
// people photographing the same static backdrop) can each independently sit
// within tolerance of one recovered hash without being within tolerance of EACH
// OTHER. The fix requires the verified set to be MUTUALLY close, not just each
// independently close to the recovered hash — using REAL near-boundary distances
// (6-12 bits), not the maximal complement, since that is exactly where a false
// positive would live and the maximal-distance tests above prove nothing about it.
// ═══════════════════════════════════════════════════════════════════════════

test('matchRecovered: two candidates that BOTH content-match but are NOT mutually close → refuse, never guess', () => {
  // The exact round-5 repro shape: NEAR and FAR_MATCH each independently sit
  // within sameMaxBits of the recovered hash, but 12 bits apart from each other —
  // proof they are genuinely different photos. Writing the same coordinates onto
  // both would silently, permanently mis-fill whichever one isn't real.
  const idx = buildRefIndex([
    { id: 'burstA', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'ka', scene: SCENE_NEAR })] },
    { id: 'burstB', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'kb', scene: SCENE_FAR_MATCH })] },
  ])
  const res = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 42, lng: -70, scene: SCENE_A }, idx, 'helen')
  assert.equal(res.reason, 'ambiguous')
  assert.equal(res.writes.length, 0)
})

test('matchRecovered: the SAME round-5 collision is never gated by author — a kid\'s ref is equally protected', () => {
  // The review's sharpest point: the content-verified branch had NO author check
  // at all, so a false positive could write onto a kid's photo with zero
  // corroboration. Confirm the mutual-closeness refusal protects it too — not
  // because of who authored it, but because the ambiguity is real regardless.
  const idx = buildRefIndex([
    { id: 'burstA', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'ka', scene: SCENE_NEAR })] },
    { id: 'kidPhoto', authorTraveler: 'rafa', photoRefs: [r2({ key: 'kr', scene: SCENE_FAR_MATCH })] },
  ])
  const res = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 42, lng: -70, scene: SCENE_A }, idx, 'helen')
  assert.equal(res.reason, 'ambiguous')
  assert.equal(res.writes.length, 0)
})

test('matchRecovered: "mutually close" is NOT proof of identity (round 6) — two structurally distinct candidates that are ALSO mutually close still refuse', () => {
  // Hamming distance obeys the TRIANGLE INEQUALITY, not equality: two genuinely
  // different candidates A and B can each independently match a recovered hash R
  // AND be within tolerance of EACH OTHER, whenever their bit-differences from R
  // happen to overlap rather than compound. This triple is verified (not
  // hand-typed): d(R,A)=6, d(R,B)=6, d(A,B)=6 — all within sameMaxBits=10 — yet A
  // and B are constructed to differ from R in DISJOINT bit positions, so they are
  // genuinely distinct content, not the same photo filed twice. An earlier
  // version of this code required only mutual closeness and was defeated by
  // exactly this shape; there is no cheap threshold-based fix, so multiple
  // content matches now always refuse, regardless of how close they are to each
  // other. One of the two candidates is a kid's ref, closing the round-5 finding
  // that this branch had zero author corroboration.
  const R = '0000000000000000'
  const A = 'fc00000000000000' // bits 0-5 differ from R
  const B = '1f80000000000000' // bits 3-8 differ from R — overlaps A in bits 3-5, so d(A,B) stays small too
  const idx = buildRefIndex([
    { id: 'burstA', authorTraveler: 'helen', photoRefs: [r2({ key: 'ka', scene: A })] },
    { id: 'kidPhoto', authorTraveler: 'rafa', photoRefs: [r2({ key: 'kb', scene: B })] },
  ])
  const res = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 42, lng: -70, scene: R }, idx, 'helen')
  assert.equal(res.reason, 'ambiguous')
  assert.equal(res.writes.length, 0)
})

test('matchRecovered: ANY multiple content match refuses, even hash-identical candidates (the simplest safe rule)', () => {
  // The narrow legitimate case — the same real photo filed into two memories —
  // is deliberately no longer auto-filled. Exactly-identical stored hashes are
  // the strongest possible signal of "same photo," and even THAT is refused now:
  // simplicity and provable safety win over recovering this rare edge case.
  const idx = buildRefIndex([
    { id: 'copy1', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'k1', scene: SCENE_A })] },
    { id: 'copy2', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'k2', scene: SCENE_A })] },
  ])
  const res = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 42, lng: -70, scene: SCENE_A }, idx, 'helen')
  assert.equal(res.reason, 'ambiguous')
  assert.equal(res.writes.length, 0)
})

test('matchRecovered: a lone verified match is NOT proof when an UNCHECKED sibling shares the instant (round 7 — found live, post-push)', () => {
  // The composition backfill runs on an ongoing bounded cron, so "one ref here
  // has a scene hash, another at the same instant doesn't yet" is a routine,
  // recurring state — not rare. X coincidentally content-matches the recovered
  // hash (a false positive, exactly the near-duplicate class rounds 5/6 already
  // proved is real); Y is the TRUE match but hasn't been backfilled, so it has
  // no scene to compare at all. An earlier version of this code only ever
  // looked at scene-bearing candidates when deciding whether a single verified
  // match was safe — Y was invisible to that decision, so X got the write and
  // the real match was silently skipped. A single match is only trusted when it
  // is the ONLY live candidate at the instant, checked or not.
  const idx = buildRefIndex([
    { id: 'X-coincidental-match', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'kx', scene: SCENE_NEAR })] },
    { id: 'Y-true-match-unbackfilled', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'ky' })] }, // no scene yet
  ])
  const res = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 42, lng: -70, scene: SCENE_A }, idx, 'helen')
  assert.equal(res.reason, 'ambiguous')
  assert.equal(res.writes.length, 0)
})

test('matchRecovered: a verified match with a DISPROVED sibling (not merely unchecked) is still safe — disproof genuinely rules a candidate out', () => {
  // Contrast with the test above: here the sibling isn't unverifiable, it was
  // actively content-checked and ruled OUT (has a scene, and it does not match).
  // A disproof is real information, unlike silence — the verified match remains
  // the sole LIVE candidate and should still fill.
  const idx = buildRefIndex([
    { id: 'X-verified', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'kx', scene: SCENE_NEAR })] },
    { id: 'Z-disproved', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'kz', scene: SCENE_B })] }, // maximally far — genuinely ruled out
  ])
  const res = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 42, lng: -70, scene: SCENE_A }, idx, 'helen')
  assert.equal(res.reason, null)
  assert.deepEqual(res.writes.map((w) => w.memoryId), ['X-verified'])
})

test('matchRecovered: no scene data anywhere degrades EXACTLY to the pre-content-verification fallback rule', () => {
  // Regression pin: every test above this block (and the whole author-affinity
  // suite) never sets scene on either side and must behave identically to before
  // this round's rewrite — this test says so explicitly, not just implicitly.
  const idx = buildRefIndex([
    { id: 'mine', authorTraveler: 'helen', photoRefs: [r2({ key: 'km' })] },
    { id: 'theirs', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'kt' })] },
  ])
  const res = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 42, lng: -70 }, idx, 'helen')
  assert.equal(res.reason, null)
  assert.deepEqual(res.writes.map((w) => w.memoryId), ['mine'])
})

test('runResourceScan end-to-end (injected IO): matched / unmatched / gpsFilled / offsetFilled', async () => {
  const cap = new Date(2026, 6, 5, 17, 42, 0).toISOString() // same construction the importer used
  const mems = [
    { id: 'm1', tripId: 't', authorTraveler: 'helen', photoRefs: [r2({ key: 'k1', capturedAt: cap })] },
    { id: 'm2', tripId: 't', authorTraveler: 'helen', photoRefs: [r2({ key: 'k2', capturedAt: new Date(2026, 6, 5, 18, 0, 0).toISOString() })] },
  ]
  const tags = {
    A: { exif: { DateTimeOriginal: { description: '2026:07:05 17:42:00' }, OffsetTimeOriginal: { description: '-04:00' } }, gps: { Latitude: 42, Longitude: -70 } },
    B: { exif: { DateTimeOriginal: { description: '2026:07:05 23:11:00' } }, gps: {} }, // matches nothing
  }
  const gps = []
  const off = []
  const stats = await runResourceScan({
    files: ['A', 'B'],
    memories: mems,
    scanner: 'helen',
    loadTags: async (f) => tags[f],
    applyGps: (id, k, v) => gps.push({ id, k, v }),
    applyOffset: (id, k, o) => off.push({ id, k, o }),
  })
  assert.equal(stats.total, 2)
  assert.equal(stats.matched, 1)
  assert.equal(stats.unmatched, 1)
  assert.equal(stats.gpsFilled, 1)
  assert.equal(stats.offsetFilled, 1)
  assert.equal(stats.filesLocated, 1)
  assert.equal(stats.filesTimeFixed, 1)
  assert.equal(stats.alreadyKnown, 0)
  assert.equal(stats.failed, 0)
  assert.deepEqual(stats.perTrip, { t: 1 })
  assert.deepEqual(gps[0], { id: 'm1', k: 'k1', v: { lat: 42, lng: -70 } })
  assert.equal(off[0].o, -240)
})

test('runResourceScan end-to-end: applySidecar fills meta/atSrc when supplied, but stays "alreadyKnown" — never "matched" — when GPS/offset were already complete', async () => {
  // Build 1 — the sidecar rides the SAME target-selection safety logic as
  // gps/offset; this proves the plumbing end-to-end (buildRefIndex's
  // needsMeta → matchRecovered's writes → the applier). Regression guard for
  // the real e2e bug this exact scenario caused (locate-originals.spec.js's
  // "re-picking an already-recovered original says nothing new" — CI caught
  // it live): a sidecar-only backfill must NEVER flip the family-facing
  // story away from "already known", because GPS+offset genuinely already
  // were.
  const cap = new Date(2026, 6, 5, 17, 42, 0).toISOString()
  const mems = [
    // Already has GPS+offset (so gps/offset appliers must NOT fire — proves
    // the sidecar write is independent) but no meta yet.
    { id: 'm1', tripId: 't', photoRefs: [r2({ key: 'k1', capturedAt: cap, lat: 42, lng: -70, offsetMinutes: -240 })] },
  ]
  const tag = {
    exif: {
      DateTimeOriginal: { description: '2026:07:05 17:42:00' },
      OffsetTimeOriginal: { description: '-04:00' },
      Make: { description: 'Apple' },
      Model: { description: 'iPhone 16 Pro' },
    },
    gps: { Latitude: 42, Longitude: -70 },
  }
  const sidecarWrites = []
  const stats = await runResourceScan({
    files: ['A'],
    memories: mems,
    loadTags: async () => tag,
    applyGps: () => { throw new Error('already complete — must not write GPS again') },
    applyOffset: () => { throw new Error('already complete — must not write offset again') },
    applySidecar: (id, k, sc) => { sidecarWrites.push({ id, k, sc }); return { id } },
  })
  // The sidecar write really landed...
  assert.equal(sidecarWrites.length, 1)
  assert.equal(sidecarWrites[0].sc.meta.make, 'Apple')
  assert.equal(sidecarWrites[0].sc.meta.model, 'iPhone 16 Pro')
  assert.equal(sidecarWrites[0].sc.atSrc, 'exif-original')
  assert.equal(stats.metaFilled, 1)
  // ...but GPS+offset were already known BEFORE this scan, so the
  // family-facing bucket stays "already known" — the sidecar is an invisible
  // enrichment, never a promotion to "matched".
  assert.equal(stats.matched, 0)
  assert.equal(stats.alreadyKnown, 1)
})

test('runResourceScan: a pre-existing caller that never supplies applySidecar is unaffected (no phantom writes)', async () => {
  // Regression guard for the exact bug this test file caught during Build 1:
  // `applySidecar?.(...) !== null` would count a MISSING applier as a landed
  // write (undefined !== null is true). Every caller/test written BEFORE this
  // build omits applySidecar entirely (no Make/Model in their tag fixtures
  // either, so `recovered.meta` stays absent) — that combination must stay a
  // true no-op, exactly like the other pre-existing tests in this file that
  // never mention sidecar at all.
  const cap = new Date(2026, 6, 5, 17, 42, 0).toISOString()
  const mems = [{ id: 'm1', tripId: 't', photoRefs: [r2({ key: 'k1', capturedAt: cap, lat: 42, lng: -70, offsetMinutes: -240 })] }]
  const tag = { exif: { DateTimeOriginal: { description: '2026:07:05 17:42:00' } }, gps: { Latitude: 42, Longitude: -70 } }
  const stats = await runResourceScan({
    files: ['A'],
    memories: mems,
    loadTags: async () => tag,
    applyGps: () => { throw new Error('must not write a complete ref') },
    applyOffset: () => { throw new Error('must not write a complete ref') },
    // applySidecar deliberately omitted
  })
  assert.equal(stats.metaFilled, 0)
  assert.equal(stats.matched, 0)
  assert.equal(stats.alreadyKnown, 1)
})

test('runResourceScan: real meta available but applySidecar omitted — the sidecar honestly never lands, but GPS/offset were already known so the bucket stays "alreadyKnown"', async () => {
  // The companion case: recovered.meta IS present (Make/Model in the tag) but
  // no applier is wired (an older caller, or the field genuinely not
  // supported). `metaFilled` honestly stays 0 — the sidecar mechanism itself
  // never silently claims a win it didn't land (the `w.sidecar && applySidecar`
  // guard, not `applySidecar?.(...) !== null`). But the FAMILY-FACING bucket
  // is about GPS/offset, not the sidecar: this photo already knew where and
  // when it was before this scan ever ran, and that stays true regardless of
  // whether the sidecar mechanism happens to be wired in this caller —
  // "nothingToRecover" would wrongly claim the photo still needs something.
  const cap = new Date(2026, 6, 5, 17, 42, 0).toISOString()
  const mems = [{ id: 'm1', tripId: 't', photoRefs: [r2({ key: 'k1', capturedAt: cap, lat: 42, lng: -70, offsetMinutes: -240 })] }]
  const tag = { exif: { DateTimeOriginal: { description: '2026:07:05 17:42:00' }, Make: { description: 'Apple' } }, gps: { Latitude: 42, Longitude: -70 } }
  const stats = await runResourceScan({
    files: ['A'],
    memories: mems,
    loadTags: async () => tag,
    applyGps: () => { throw new Error('must not write a complete ref') },
    applyOffset: () => { throw new Error('must not write a complete ref') },
    // applySidecar deliberately omitted
  })
  assert.equal(stats.metaFilled, 0)
  assert.equal(stats.matched, 0)
  assert.equal(stats.alreadyKnown, 1)
  assert.equal(stats.nothingToRecover, 0)
})

test('runResourceScan end-to-end: two readings, two real photos → ambiguous, nothing written', async () => {
  // The photo's offset is derived from the HOST's own offset ±1h, so the two
  // readings are guaranteed to differ no matter what zone this machine runs in
  // (a hardcoded offset silently collapses on a host that happens to sit there —
  // and a collapsed case would assert nothing).
  const shot = new Date(2026, 6, 5, 17, 42, 0)
  const hostOffsetMin = -shot.getTimezoneOffset()
  const photoOffsetMin = hostOffsetMin + (hostOffsetMin + 60 <= 840 ? 60 : -60)
  const sign = photoOffsetMin < 0 ? '-' : '+'
  const abs = Math.abs(photoOffsetMin)
  const offsetStr = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`

  const local = shot.toISOString()
  const wallClockAsUtc = Date.UTC(2026, 6, 5, 17, 42, 0)
  const trueInstant = new Date(wallClockAsUtc - photoOffsetMin * 60000).toISOString()
  assert.notEqual(instantKey(local), instantKey(trueInstant)) // the case must be real
  const mems = [
    { id: 'phantom', tripId: 't', authorTraveler: 'helen', photoRefs: [r2({ key: 'kW', capturedAt: local })] },
    { id: 'real', tripId: 't', authorTraveler: 'helen', photoRefs: [r2({ key: 'kR', capturedAt: trueInstant })] },
  ]
  const tag = { exif: { DateTimeOriginal: { description: '2026:07:05 17:42:00' }, OffsetTimeOriginal: { description: offsetStr } }, gps: { Latitude: 42, Longitude: -70 } }
  const stats = await runResourceScan({
    files: ['A'],
    memories: mems,
    scanner: 'helen',
    loadTags: async () => tag,
    applyGps: () => { throw new Error('must never guess between two photos') },
    applyOffset: () => { throw new Error('must never guess between two photos') },
  })
  assert.equal(stats.ambiguous, 1)
  assert.equal(stats.matched, 0)
  assert.equal(stats.gpsFilled, 0)
  assert.equal(stats.unmatched, 0)
})

test('runResourceScan: an original whose photo is already complete counts alreadyKnown, never unmatched', async () => {
  const cap = new Date(2026, 6, 5, 17, 42, 0).toISOString()
  const mems = [{ id: 'm1', tripId: 't', photoRefs: [r2({ key: 'k1', capturedAt: cap, lat: 42, lng: -70, offsetMinutes: -240 })] }]
  const tags = { A: { exif: { DateTimeOriginal: { description: '2026:07:05 17:42:00' }, OffsetTimeOriginal: { description: '-04:00' } }, gps: { Latitude: 42, Longitude: -70 } } }
  const stats = await runResourceScan({
    files: ['A'],
    memories: mems,
    loadTags: async (f) => tags[f],
    applyGps: () => { throw new Error('must not write a complete ref') },
    applyOffset: () => { throw new Error('must not write a complete ref') },
  })
  assert.equal(stats.alreadyKnown, 1)
  assert.equal(stats.matched, 0)
  assert.equal(stats.unmatched, 0)
})

test('runResourceScan: a second original at the SAME instant reports alreadyKnown — never a second find', async () => {
  // Two burst frames share one DateTimeOriginal second. The first fills the ref;
  // the index must learn that, or the result screen claims it located two photos.
  const cap = new Date(2026, 6, 5, 17, 42, 0).toISOString()
  const mems = [{ id: 'm1', tripId: 't', photoRefs: [r2({ key: 'k1', capturedAt: cap })] }]
  const tag = { exif: { DateTimeOriginal: { description: '2026:07:05 17:42:00' }, OffsetTimeOriginal: { description: '-04:00' } }, gps: { Latitude: 42, Longitude: -70 } }
  let writes = 0
  const stats = await runResourceScan({
    files: ['A', 'B'],
    memories: mems,
    loadTags: async () => tag,
    applyGps: () => { writes += 1 },
    applyOffset: () => {},
  })
  assert.equal(writes, 1)
  assert.equal(stats.matched, 1)
  assert.equal(stats.alreadyKnown, 1)
  assert.equal(stats.filesLocated, 1)
  assert.equal(stats.gpsFilled, 1)
})

test('runResourceScan: an import made in ANOTHER timezone still matches via the photo\'s true instant', async () => {
  // The trip was imported abroad (capturedAt == the photo's real instant); the scan
  // runs at home in a different zone. The device-local key misses; the offset-derived
  // key hits — exactly, never by guessing.
  const trueInstant = '2026-07-05T21:42:00.000Z' // 17:42 at -04:00
  const mems = [{ id: 'm1', tripId: 't', photoRefs: [r2({ key: 'k1', capturedAt: trueInstant })] }]
  const tag = { exif: { DateTimeOriginal: { description: '2026:07:05 17:42:00' }, OffsetTimeOriginal: { description: '-04:00' } }, gps: { Latitude: 42, Longitude: -70 } }
  const stats = await runResourceScan({
    files: ['A'],
    memories: mems,
    loadTags: async () => tag,
    applyGps: () => {},
    applyOffset: () => {},
  })
  assert.equal(stats.matched, 1)
  assert.equal(stats.unmatched, 0)
})

test('runResourceScan: a throwing write (storage quota) counts FAILED — never "couldn\'t be placed"', async () => {
  const cap = new Date(2026, 6, 5, 17, 42, 0).toISOString()
  const mems = [{ id: 'm1', tripId: 't', photoRefs: [r2({ key: 'k1', capturedAt: cap })] }]
  const tag = { exif: { DateTimeOriginal: { description: '2026:07:05 17:42:00' }, OffsetTimeOriginal: { description: '-04:00' } }, gps: { Latitude: 42, Longitude: -70 } }
  const stats = await runResourceScan({
    files: ['A'],
    memories: mems,
    loadTags: async () => tag,
    applyGps: () => { throw new Error('Memory write failed') },
    applyOffset: () => { throw new Error('Memory write failed') },
  })
  assert.equal(stats.failed, 1)
  assert.equal(stats.unmatched, 0)
  assert.equal(stats.matched, 0)
  assert.equal(stats.gpsFilled, 0)
})

test('runResourceScan: a photo deleted mid-scan (applier returns null) is NOT reported as an out-of-space failure', async () => {
  // A sync tombstone can delete a memory while the scan runs. That is not a
  // storage error and must not be told to the family as one.
  const cap = new Date(2026, 6, 5, 17, 42, 0).toISOString()
  const mems = [{ id: 'm1', tripId: 't', photoRefs: [r2({ key: 'k1', capturedAt: cap })] }]
  const tag = { exif: { DateTimeOriginal: { description: '2026:07:05 17:42:00' } }, gps: { Latitude: 42, Longitude: -70 } }
  const stats = await runResourceScan({
    files: ['A'],
    memories: mems,
    loadTags: async () => tag,
    applyGps: () => null, // applyRefGps's "memory not found" return
    applyOffset: () => null,
  })
  assert.equal(stats.filesLocated, 0)
  assert.equal(stats.gpsFilled, 0)
  assert.equal(stats.failed, 0)
  assert.equal(stats.nothingToRecover, 1)
})

test('runResourceScan: a photo that never recorded a location is NOT reported as "already knew where it was"', async () => {
  // Location services off. The ref still has no coords and the original has none to
  // give — the family must not be told that photo already knew where it was.
  const cap = new Date(2026, 6, 5, 17, 42, 0).toISOString()
  const mems = [{ id: 'm1', tripId: 't', photoRefs: [r2({ key: 'k1', capturedAt: cap })] }]
  const tags = { A: { exif: { DateTimeOriginal: { description: '2026:07:05 17:42:00' } }, gps: {} } }
  const stats = await runResourceScan({
    files: ['A'],
    memories: mems,
    loadTags: async (f) => tags[f],
    applyGps: () => { throw new Error('no gps to write') },
    applyOffset: () => { throw new Error('no offset to write') },
  })
  assert.equal(stats.nothingToRecover, 1)
  assert.equal(stats.alreadyKnown, 0)
  assert.equal(stats.unmatched, 0)
  assert.equal(stats.matched, 0)
})

test('runResourceScan: another adult\'s same-second photo is never written, and is reported as theirs — not "already knew"', async () => {
  const cap = new Date(2026, 6, 5, 17, 42, 0).toISOString()
  const mems = [{ id: 'his', tripId: 't', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'kj', capturedAt: cap })] }]
  const tag = { exif: { DateTimeOriginal: { description: '2026:07:05 17:42:00' } }, gps: { Latitude: 42, Longitude: -70 } }
  const stats = await runResourceScan({
    files: ['A'],
    memories: mems,
    scanner: 'helen',
    loadTags: async () => tag,
    applyGps: () => { throw new Error('must never write another adult\'s photo') },
    applyOffset: () => {},
  })
  assert.equal(stats.gpsFilled, 0)
  assert.equal(stats.matched, 0)
  assert.equal(stats.notYours, 1)
  assert.equal(stats.alreadyKnown, 0) // his photo is NOT located; she simply may not write it
})

test('runResourceScan: loadSceneHash wires through end-to-end — content match fills across authors', async () => {
  const cap = new Date(2026, 6, 5, 17, 42, 0).toISOString()
  // Jonathan's imported, needy photo — but content proves Helen's original IS it.
  const mems = [{ id: 'his', tripId: 't', authorTraveler: 'jonathan', photoRefs: [r2({ key: 'kj', capturedAt: cap, scene: SCENE_A })] }]
  const tag = { exif: { DateTimeOriginal: { description: '2026:07:05 17:42:00' } }, gps: { Latitude: 42, Longitude: -70 } }
  const gps = []
  const stats = await runResourceScan({
    files: ['A'],
    memories: mems,
    scanner: 'helen',
    loadTags: async () => tag,
    loadSceneHash: async () => SCENE_A,
    applyGps: (id, k, v) => { gps.push({ id, k, v }); return { id } },
    applyOffset: () => ({}),
  })
  assert.equal(stats.filesLocated, 1)
  assert.equal(stats.notYours, 0)
  assert.deepEqual(gps[0], { id: 'his', k: 'kj', v: { lat: 42, lng: -70 } })
})

test('runResourceScan: loadSceneHash throwing degrades gracefully to the fallback rule (never kills the file)', async () => {
  const cap = new Date(2026, 6, 5, 17, 42, 0).toISOString()
  const mems = [{ id: 'm1', tripId: 't', authorTraveler: 'helen', photoRefs: [r2({ key: 'k1', capturedAt: cap })] }]
  const tag = { exif: { DateTimeOriginal: { description: '2026:07:05 17:42:00' } }, gps: { Latitude: 42, Longitude: -70 } }
  const stats = await runResourceScan({
    files: ['A'],
    memories: mems,
    scanner: 'helen',
    loadTags: async () => tag,
    loadSceneHash: async () => { throw new Error('decode failed') },
    applyGps: () => ({}),
    applyOffset: () => ({}),
  })
  // No scene data reached matchRecovered (the hash failed) → falls back to the
  // author-only rule, which still fills Helen's own needy photo.
  assert.equal(stats.filesLocated, 1)
})
