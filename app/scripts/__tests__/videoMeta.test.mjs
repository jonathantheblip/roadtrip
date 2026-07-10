import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const MEDIA = resolve(here, '../../tests/fixtures/media')

// videoMeta.extractVideoCreationDate is exercised with synthetic
// MP4-ish byte buffers. Real iPhone footage would also work but we
// avoid binary fixtures in the tree — the bytes here are the minimal
// shape the parser walks, no codec data, no audio.

// File expects a global Blob (Node 20+ provides it). We use `Buffer.slice`
// to mimic File.slice(start, end) via a minimal duck-typed wrapper —
// the parser only calls `file.slice(0, N)` and `file.size`.
function bufferAsFile(buf) {
  return {
    size: buf.length,
    slice(start, end) {
      return {
        async arrayBuffer() {
          const sliced = buf.subarray(start, end ?? buf.length)
          return sliced.buffer.slice(
            sliced.byteOffset,
            sliced.byteOffset + sliced.byteLength
          )
        },
      }
    },
  }
}

const { extractVideoCreationDate, parseIso6709 } = await import('../../src/lib/videoMeta.js')

function realFixtureAsFile(name) {
  const buf = readFileSync(resolve(MEDIA, name))
  return bufferAsFile(buf)
}

// The four iphone-video-*.mov fixtures are Git-LFS-tracked (repo-root
// .gitattributes); CI's checkout does not fetch LFS content (no `lfs: true`),
// so on CI the file on disk is a tiny text pointer ("version
// https://git-lfs.github.com/spec/v1\n..."), not the real ~5-100MB clip. A
// developer machine with `git lfs pull` run (see tests/fixtures/media/
// README.md) always has the real bytes. Detect the pointer shape and skip
// the real-decode assertion rather than fail on content that was never
// fetched — this is an environment gap, not a parser regression. Enabling
// LFS fetch in CI is a separate decision (real GitHub LFS bandwidth cost on
// every push) — not made here.
const LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1'
function isLfsPointer(buf) {
  return buf.subarray(0, LFS_POINTER_PREFIX.length).toString('utf8') === LFS_POINTER_PREFIX
}

// MP4 atoms: [size:4][type:4][payload...].
function atom(type, payload) {
  const size = 8 + payload.length
  const out = Buffer.alloc(size)
  out.writeUInt32BE(size, 0)
  out.write(type, 4, 'ascii')
  payload.copy(out, 8)
  return out
}

const MP4_EPOCH_OFFSET_SECONDS = 2_082_844_800

// mvhd v0 payload: 1 byte version + 3 bytes flags + 4 bytes
// creation_time + 4 bytes modification_time + 4 bytes timescale +
// 4 bytes duration + 76 bytes of remaining required fields (we pad
// with zeros; the parser only reads creation_time).
function mvhdV0(creationDate) {
  const seconds =
    Math.floor(creationDate.getTime() / 1000) + MP4_EPOCH_OFFSET_SECONDS
  const payload = Buffer.alloc(100)
  payload[0] = 0 // version
  // flags = 0
  payload.writeUInt32BE(seconds, 4) // creation_time
  payload.writeUInt32BE(seconds, 8) // modification_time
  payload.writeUInt32BE(1000, 12) // timescale
  payload.writeUInt32BE(0, 16) // duration
  return atom('mvhd', payload)
}

function mvhdV1(creationDate) {
  const seconds =
    Math.floor(creationDate.getTime() / 1000) + MP4_EPOCH_OFFSET_SECONDS
  const payload = Buffer.alloc(112)
  payload[0] = 1 // version
  // creation_time is 8 bytes big-endian
  payload.writeUInt32BE(Math.floor(seconds / 0x100000000), 4)
  payload.writeUInt32BE(seconds >>> 0, 8)
  payload.writeUInt32BE(Math.floor(seconds / 0x100000000), 12)
  payload.writeUInt32BE(seconds >>> 0, 16)
  payload.writeUInt32BE(1000, 20)
  return atom('mvhd', payload)
}

function makeMp4(moovInner, leadingBoxes = []) {
  return Buffer.concat([
    ...leadingBoxes,
    atom('moov', Buffer.concat(moovInner)),
  ])
}

test('extractVideoCreationDate reads mvhd v0 creation_time', async () => {
  const captured = new Date('2026-04-17T11:23:45.000Z')
  const file = bufferAsFile(makeMp4([mvhdV0(captured)]))
  const meta = await extractVideoCreationDate(file)
  assert.equal(meta.capturedAt, captured.toISOString())
  assert.equal(meta.offsetMinutes, null) // mvhd carries no offset
})

test('extractVideoCreationDate reads mvhd v1 creation_time (64-bit)', async () => {
  const captured = new Date('2026-05-22T18:00:00.000Z')
  const file = bufferAsFile(makeMp4([mvhdV1(captured)]))
  const meta = await extractVideoCreationDate(file)
  assert.equal(meta.capturedAt, captured.toISOString())
  assert.equal(meta.offsetMinutes, null)
})

test('extractVideoCreationDate prefers Apple Keys creationdate over mvhd', async () => {
  // mvhd would say 2026-04-17 UTC; the Apple Keys value carries the
  // iPhone's local timezone offset and reads 2026-04-17T07:23:45-04:00
  // (= same instant). When both are present the parser should return
  // the Apple value verbatim (well, normalized to ISO).
  const captured = new Date('2026-04-17T11:23:45.000Z')
  const appleIso = '2026-04-17T07:23:45-0400'
  const key = 'com.apple.quicktime.creationdate'
  // The meta atom: a 4-byte version+flags header that real iPhone
  // moov/meta atoms have, followed by key+value chunks we don't
  // structure — the parser searches for the key string then scans
  // forward for a plausible ISO timestamp.
  const metaPayload = Buffer.concat([
    Buffer.from([0, 0, 0, 0]), // version+flags
    Buffer.from(key, 'ascii'),
    Buffer.from([0, 0, 0, 0]), // small separator (ilst structure
                                // would live here in reality)
    Buffer.from(appleIso, 'ascii'),
    Buffer.from([0, 0]), // trailing nulls
  ])
  const metaAtom = atom('meta', metaPayload)
  const file = bufferAsFile(makeMp4([mvhdV0(captured), metaAtom]))
  const meta = await extractVideoCreationDate(file)
  // Apple value should win; capturedAt normalizes to UTC AND its local offset
  // (-04:00 → -240 minutes) is preserved for the matcher's local-clock filing.
  assert.equal(meta.capturedAt, captured.toISOString())
  assert.equal(meta.offsetMinutes, -240)
})

test('extractVideoCreationDate returns null when moov is missing', async () => {
  const file = bufferAsFile(
    Buffer.concat([atom('ftyp', Buffer.from('isom\0\0\0\0', 'ascii'))])
  )
  const iso = await extractVideoCreationDate(file)
  assert.equal(iso, null)
})

test('extractVideoCreationDate returns null when mvhd creation_time is unset', async () => {
  // Real-world: cameras with dead clocks emit mvhd with creation_time=0.
  const payload = Buffer.alloc(100)
  payload[0] = 0
  // creation_time stays 0 — parser should treat as missing.
  const file = bufferAsFile(makeMp4([atom('mvhd', payload)]))
  const iso = await extractVideoCreationDate(file)
  assert.equal(iso, null)
})

test('extractVideoCreationDate ignores creation_time before year 2000', async () => {
  // Some old QuickTime files stamp creation_time as the MP4 epoch
  // itself (1904-01-01) when the underlying clock is unreliable.
  // Helen's album would rather fall back to the upload time than show
  // 1904 next to a 2026 trip.
  const payload = Buffer.alloc(100)
  payload[0] = 0
  payload.writeUInt32BE(1, 4) // 1 second past MP4 epoch
  const file = bufferAsFile(makeMp4([atom('mvhd', payload)]))
  const iso = await extractVideoCreationDate(file)
  assert.equal(iso, null)
})

test('extractVideoCreationDate handles non-Buffer / corrupt input gracefully', async () => {
  // Empty file → null, not a thrown exception.
  const file = bufferAsFile(Buffer.alloc(0))
  const iso = await extractVideoCreationDate(file)
  assert.equal(iso, null)
})

test('extractVideoCreationDate ignores mvhd creation_time more than 1 day in the future', async () => {
  const captured = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 1 week ahead
  const file = bufferAsFile(makeMp4([mvhdV0(captured)]))
  const iso = await extractVideoCreationDate(file)
  assert.equal(iso, null)
})

test('extractVideoCreationDate finds moov at the END of the file, past the 4MB mark (iPhone layout)', async () => {
  // Regression guard: non-fast-start MP4s (the common iPhone layout) put a
  // large mdat BEFORE moov. An earlier first-4MB-only scan missed moov here
  // entirely → the clip imported dateless and got dropped as "outside trip
  // dates". The atom-chain walk reads box headers only and must still find it.
  const captured = new Date('2026-05-24T22:58:05.000Z')
  const bigMdat = atom('mdat', Buffer.alloc(4 * 1024 * 1024 + 1024)) // > 4MB
  const file = bufferAsFile(makeMp4([mvhdV0(captured)], [bigMdat]))
  const meta = await extractVideoCreationDate(file)
  assert.equal(meta.capturedAt, captured.toISOString())
})

// ─── Build 1 — video GPS via ISO 6709: the plan's single highest-value line ─
//
// "One located video anchors a whole moment later." The parser is bounded
// and STRICT: lat ∈ [-90,90], lng ∈ [-180,180], reject and drop (never throw)
// on anything malformed. Mutation-test candidate: temporarily loosen the
// range checks in parseIso6709 (videoMeta.js) and confirm the out-of-range
// cases below go red.

test('parseIso6709: valid strings → { lat, lng }, with and without altitude', () => {
  assert.deepEqual(parseIso6709('+41.32245-072.09434+011.776/'), { lat: 41.32245, lng: -72.09434 })
  assert.deepEqual(parseIso6709('+41.32245-072.09434/'), { lat: 41.32245, lng: -72.09434 })
  assert.deepEqual(parseIso6709('+41.32245-072.09434'), { lat: 41.32245, lng: -72.09434 }) // trailing '/' optional
  assert.deepEqual(parseIso6709('-33.8688+151.2093+025.0/'), { lat: -33.8688, lng: 151.2093 }) // Sydney (S/E)
  assert.deepEqual(parseIso6709('+00.0000+000.0000/'), { lat: 0, lng: 0 }) // Null Island — a real, valid value
  assert.deepEqual(parseIso6709('+90.0000+180.0000/'), { lat: 90, lng: 180 }) // exact boundary — inclusive
  assert.deepEqual(parseIso6709('-90.0000-180.0000/'), { lat: -90, lng: -180 })
})

test('parseIso6709: out-of-range lat/lng rejected — never a garbage coordinate stamped onto a photo', () => {
  assert.equal(parseIso6709('+90.0001+000.0000/'), null) // lat just over the pole
  assert.equal(parseIso6709('-90.0001+000.0000/'), null)
  assert.equal(parseIso6709('+45.0000+180.0001/'), null) // lng just over the date line
  assert.equal(parseIso6709('+45.0000-180.0001/'), null)
  assert.equal(parseIso6709('+99.0000+999.0000/'), null) // wildly out of range
})

test('parseIso6709: malformed/garbage input rejected, never throws', () => {
  assert.equal(parseIso6709('garbage'), null)
  assert.equal(parseIso6709(''), null)
  assert.equal(parseIso6709(null), null)
  assert.equal(parseIso6709(undefined), null)
  assert.equal(parseIso6709(41.32245), null) // not even a string
  assert.equal(parseIso6709('41.32245,-72.09434'), null) // comma-separated, not ISO 6709 shape
  assert.equal(parseIso6709('+41.32245'), null) // lat only, no lng — incomplete
  assert.equal(parseIso6709('41.32245-072.09434/'), null) // missing leading sign
  assert.equal(parseIso6709('+'.repeat(40) + '1/'), null) // over the length cap — rejected outright
})

test('extractVideoCreationDate threads real lat/lng from a REAL iPhone .mov fixture (ISO6709 in the Keys/Values atom)', async (t) => {
  // Real bytes, not synthetic — the house standard. These are actual iPhone
  // camera clips (tests/fixtures/media), Location Services on. Coordinates
  // pinned from the parser's own real-decode output (cross-checked: they land
  // in the same small area as the iphone-jpeg-fullres.jpg fixture, ~41.32,
  // -72.09 — consistent with "shot on the same outing").
  const cases = [
    ['iphone-video-1080p-5s.mov', 41.3225, -72.0943],
    ['iphone-video-4k-30s.mov', 41.3224, -72.0944],
    ['iphone-video-portrait.mov', 41.3224, -72.0944],
    ['iphone-video-landscape.mov', 41.3224, -72.0944],
  ]
  let skippedAll = true
  for (const [name, lat, lng] of cases) {
    const buf = readFileSync(resolve(MEDIA, name))
    if (isLfsPointer(buf)) {
      // Environment gap (LFS content not fetched here), not a parser defect —
      // see isLfsPointer's comment. The synthetic Keys/Values tests below still
      // fully exercise this same code path with real assertions.
      await t.test(`${name} — SKIPPED: Git LFS content not present (pointer file only)`, (t2) => t2.skip())
      continue
    }
    skippedAll = false
    const file = bufferAsFile(buf)
    const meta = await extractVideoCreationDate(file)
    assert.ok(meta, `${name} must produce a meta object`)
    assert.ok(Number.isFinite(meta.lat), `${name} lat must be finite, got ${meta.lat}`)
    assert.ok(Number.isFinite(meta.lng), `${name} lng must be finite, got ${meta.lng}`)
    assert.ok(Math.abs(meta.lat - lat) < 0.001, `${name} lat ≈ ${lat}, got ${meta.lat}`)
    assert.ok(Math.abs(meta.lng - lng) < 0.001, `${name} lng ≈ ${lng}, got ${meta.lng}`)
    // Same fixtures' capturedAt/offsetMinutes contract stays intact — GPS is
    // additive, never a replacement for the existing date extraction.
    assert.equal(typeof meta.capturedAt, 'string')
    assert.equal(meta.offsetMinutes, -240) // EDT, same as the photo fixtures
  }
  if (skippedAll) {
    console.warn(
      '[videoMeta.test.mjs] All real .mov fixtures were Git LFS pointers — ' +
        'this environment has never actually decoded a real iPhone video for ' +
        'this test. Run `git lfs pull` to get real coverage.'
    )
  }
})

test('extractVideoCreationDate: a synthetic clip with an Apple location Keys/Values entry threads lat/lng', async () => {
  const captured = new Date('2026-05-24T22:58:05.000Z')
  const dateKey = 'com.apple.quicktime.creationdate'
  const dateIso = '2026-05-24T18:58:05-0400'
  const locKey = 'com.apple.quicktime.location.ISO6709'
  const locValue = '+41.32245-072.09434+011.776/'
  const metaPayload = Buffer.concat([
    Buffer.from([0, 0, 0, 0]),
    Buffer.from(dateKey, 'ascii'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from(dateIso, 'ascii'),
    Buffer.from([0, 0]),
    Buffer.from(locKey, 'ascii'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from(locValue, 'ascii'),
    Buffer.from([0, 0]),
  ])
  const metaAtom = atom('meta', metaPayload)
  const file = bufferAsFile(makeMp4([mvhdV0(captured), metaAtom]))
  const meta = await extractVideoCreationDate(file)
  assert.equal(meta.capturedAt, captured.toISOString())
  assert.equal(meta.offsetMinutes, -240)
  assert.equal(meta.lat, 41.32245)
  assert.equal(meta.lng, -72.09434)
})

test('extractVideoCreationDate: a clip with no location key omits lat/lng (never a false 0,0)', async () => {
  const captured = new Date('2026-04-17T11:23:45.000Z')
  const file = bufferAsFile(makeMp4([mvhdV0(captured)]))
  const meta = await extractVideoCreationDate(file)
  assert.equal(meta.capturedAt, captured.toISOString())
  assert.equal('lat' in meta, false)
  assert.equal('lng' in meta, false)
})

// ─── Blocker 2 — a rejected/missing date must not discard a parsed location ──
//
// The function's own documented invariant (top of file): `location` is
// computed independently of which date source wins. The two early-return
// points on the mvhd-fallback path used to short-circuit `null` whenever the
// date wasn't usable, discarding a successfully-parsed GPS fix along with it
// — a camera with a corrupted/reset clock but a good location fix lost real
// GPS data. Mutation-test candidate: revert the `mvhd ? ... : null` /
// `location ? {...} : null` change back to a bare `if (!mvhd) return null` /
// `return iso ? withLocation(...) : null` and confirm these go red.

test('extractVideoCreationDate: a dead-clock mvhd (creation_time=0) still returns its parsed location', async () => {
  const locKey = 'com.apple.quicktime.location.ISO6709'
  const locValue = '+41.32245-072.09434+011.776/'
  const metaPayload = Buffer.concat([
    Buffer.from([0, 0, 0, 0]),
    Buffer.from(locKey, 'ascii'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from(locValue, 'ascii'),
    Buffer.from([0, 0]),
  ])
  const metaAtom = atom('meta', metaPayload)
  // mvhd creation_time stays 0 (dead clock) — parseMvhdCreationDate rejects
  // it — and no Apple Keys creationdate is present either.
  const deadMvhd = Buffer.alloc(100) // version=0, all-zero payload
  const file = bufferAsFile(makeMp4([atom('mvhd', deadMvhd), metaAtom]))
  const meta = await extractVideoCreationDate(file)
  assert.ok(meta, 'must not discard the whole record — location survives with no valid date')
  assert.equal(meta.capturedAt, null)
  assert.equal(meta.offsetMinutes, null)
  assert.equal(meta.lat, 41.32245)
  assert.equal(meta.lng, -72.09434)
})

test('extractVideoCreationDate: no mvhd atom AT ALL still returns a parsed location', async () => {
  const locKey = 'com.apple.quicktime.location.ISO6709'
  const locValue = '+41.32245-072.09434+011.776/'
  const metaPayload = Buffer.concat([
    Buffer.from([0, 0, 0, 0]),
    Buffer.from(locKey, 'ascii'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from(locValue, 'ascii'),
    Buffer.from([0, 0]),
  ])
  const metaAtom = atom('meta', metaPayload)
  const file = bufferAsFile(makeMp4([metaAtom])) // no mvhd atom in this moov at all
  const meta = await extractVideoCreationDate(file)
  assert.ok(meta, 'must not discard the whole record — location survives with no mvhd at all')
  assert.equal(meta.capturedAt, null)
  assert.equal(meta.offsetMinutes, null)
  assert.equal(meta.lat, 41.32245)
  assert.equal(meta.lng, -72.09434)
})

test('extractVideoCreationDate: genuinely nothing (no valid date, no location) still returns null', async () => {
  // The pre-existing "dead clock, no location atom" tests above (line ~146)
  // already cover this, but restated here explicitly alongside the new
  // location-survival tests so the full truth table for this branch is
  // legible in one place.
  const deadMvhd = Buffer.alloc(100)
  const file = bufferAsFile(makeMp4([atom('mvhd', deadMvhd)]))
  const meta = await extractVideoCreationDate(file)
  assert.equal(meta, null)
})

test('extractVideoCreationDate: a corrupt location value in the Keys/Values atom is dropped, date extraction still succeeds', async () => {
  const captured = new Date('2026-05-24T22:58:05.000Z')
  const locKey = 'com.apple.quicktime.location.ISO6709'
  const metaPayload = Buffer.concat([
    Buffer.from([0, 0, 0, 0]),
    Buffer.from(locKey, 'ascii'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from('+9999.9999garbage/', 'ascii'), // malformed — must not throw, must not stamp
    Buffer.from([0, 0]),
  ])
  const metaAtom = atom('meta', metaPayload)
  const file = bufferAsFile(makeMp4([mvhdV0(captured), metaAtom]))
  const meta = await extractVideoCreationDate(file)
  assert.equal(meta.capturedAt, captured.toISOString())
  assert.equal('lat' in meta, false)
  assert.equal('lng' in meta, false)
})
