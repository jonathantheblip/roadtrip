// mp4Fixtures.mjs — programmatic ISO-BMFF box builder shared by the demuxer
// suite (mp4Audio.test.mjs) and the carry-ladder composition suite
// (videoPipeline.test.mjs). Every fixture is real container bytes, so the
// assertions stay byte-exact against known sample data and timestamps. NOT a
// test file (no .test.mjs suffix) — the npm-test glob must not collect it.

import assert from 'node:assert/strict'

export function bytes(...vals) {
  return Uint8Array.from(vals)
}
export function cat(...parts) {
  const len = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}
export function u16(v) {
  return bytes((v >> 8) & 0xff, v & 0xff)
}
export function u32(v) {
  return bytes((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff)
}
// Also writes i64 two's-complement for small negatives (-1 → all-ones), which
// is exactly the elst empty-edit marker.
export function u64(v) {
  const hi = Math.floor(v / 0x100000000)
  return cat(u32(hi), u32(v >>> 0))
}
export function fourcc(s) {
  return bytes(s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3))
}
// Standard box: u32 size + type + payload.
export function box(type, ...payload) {
  const body = cat(...payload)
  return cat(u32(8 + body.length), fourcc(type), body)
}
// Largesize box: size==1 marker + 64-bit size (16-byte header).
export function box64(type, ...payload) {
  const body = cat(...payload)
  return cat(u32(1), fourcc(type), u64(16 + body.length), body)
}
// Full box: version + 24-bit flags prefix.
export function full(type, version, ...payload) {
  return box(type, bytes(version, 0, 0, 0), ...payload)
}

// MPEG-4 descriptor with a minimal 1-byte length.
function desc(tag, payload) {
  return cat(bytes(tag, payload.length), payload)
}
// Same descriptor with the 4-byte base-128 varint length Apple actually
// writes (0x80-continued zero bytes then the real length).
function descLong(tag, payload) {
  return cat(bytes(tag, 0x80, 0x80, 0x80, payload.length), payload)
}

// esds carrying an AudioSpecificConfig. oti 0x40 = MPEG-4 audio (AAC).
export function esdsBox(asc, { oti = 0x40, longLengths = false } = {}) {
  const d = longLengths ? descLong : desc
  const decoderConfig = d(
    0x04,
    cat(
      bytes(oti, 0x15, 0, 0, 0), // oti, streamType, bufferSizeDB(3)
      u32(128000), // maxBitrate
      u32(128000), // avgBitrate
      d(0x05, asc) // DecoderSpecificInfo — the ASC itself
    )
  )
  const es = d(0x03, cat(u16(1), bytes(0), decoderConfig, d(0x06, bytes(2))))
  return full('esds', 0, es)
}

// mp4a AudioSampleEntry. version 0 → children at +36; version 1 (QuickTime)
// adds 16 bytes of compression fields → children at +52.
export function mp4aEntry({ channels = 2, rate = 48000, version = 0, children = [] }) {
  const head = cat(
    bytes(0, 0, 0, 0, 0, 0), // reserved
    u16(1), // data_reference_index
    u16(version),
    u16(0), // revision
    u32(0), // vendor
    u16(channels),
    u16(16), // samplesize
    u16(0), // compressionID
    u16(0), // packetsize
    u32(rate * 65536) // 16.16 samplerate
  )
  const v1extra =
    version === 1 ? cat(u32(1024), u32(0), u32(0), u32(0)) : bytes()
  return box('mp4a', head, v1extra, ...children)
}

export function sampleEntryOther(type) {
  return box(type, bytes(0, 0, 0, 0, 0, 0), u16(1), u16(0), u16(0), u32(0), u16(2), u16(16), u16(0), u16(0), u32(44100 * 65536))
}

// elst full box. entries: [{ segmentTicks, mediaTime, rate = 1, rateFraction = 0 }].
// mediaTime -1 (the empty-edit marker) round-trips through u32/u64's
// two's-complement write. Movie-timescale segmentTicks, media-timescale mediaTime.
export function elstBox({ version = 0, entries }) {
  return full(
    'elst',
    version,
    u32(entries.length),
    ...entries.map(({ segmentTicks, mediaTime, rate = 1, rateFraction = 0 }) =>
      version === 1
        ? cat(u64(segmentTicks), u64(mediaTime), u16(rate), u16(rateFraction))
        : cat(u32(segmentTicks), u32(mediaTime), u16(rate), u16(rateFraction))
    )
  )
}

// A sound trak around an stbl. `entry` is the stsd sample entry;
// `chunkOffsets` are ABSOLUTE file offsets (patched in by the assembler).
// `edts` (optional) is a pre-built edts box — trak-level edit list.
export function soundTrak({ entry, timescale, sttsEntries, sizes, stscRuns, chunkOffsets, co64 = false, edts = null }) {
  const stsd = full('stsd', 0, u32(1), entry)
  const stts = full('stts', 0, u32(sttsEntries.length), ...sttsEntries.map(([n, d]) => cat(u32(n), u32(d))))
  const stsz = full('stsz', 0, u32(0), u32(sizes.length), ...sizes.map((s) => u32(s)))
  const stsc = full('stsc', 0, u32(stscRuns.length), ...stscRuns.map(([first, per]) => cat(u32(first), u32(per), u32(1))))
  const co = co64
    ? full('co64', 0, u32(chunkOffsets.length), ...chunkOffsets.map((o) => u64(o)))
    : full('stco', 0, u32(chunkOffsets.length), ...chunkOffsets.map((o) => u32(o)))
  const stbl = box('stbl', stsd, stts, stsz, stsc, co)
  const mdhd = full('mdhd', 0, u32(0), u32(0), u32(timescale), u32(0), u16(0), u16(0))
  const hdlr = full('hdlr', 0, u32(0), fourcc('soun'), u32(0), u32(0), u32(0), bytes(0))
  return box('trak', ...(edts ? [box('edts', edts)] : []), box('mdia', mdhd, hdlr, box('minf', stbl)))
}

// A minimal video trak — the demuxer must skip it (wrong handler).
export function videoTrak() {
  const hdlr = full('hdlr', 0, u32(0), fourcc('vide'), u32(0), u32(0), u32(0), bytes(0))
  const mdhd = full('mdhd', 0, u32(0), u32(0), u32(600), u32(0), u16(0), u16(0))
  return box('trak', box('mdia', mdhd, hdlr, box('minf', box('stbl', full('stsd', 0, u32(0))))))
}

export const FTYP = box('ftyp', fourcc('isom'), u32(0x200), fourcc('isom'), fourcc('iso2'))

// The assembler's mvhd (movie timescale 600 — elst segment_durations count in it).
export const MOVIE_TIMESCALE = 600
export function mvhdBox() {
  return full('mvhd', 0, u32(0), u32(0), u32(MOVIE_TIMESCALE), u32(0))
}

// Assemble ftyp + moov + mdat (or mdat-first). Two-pass: build moov with the
// final absolute chunk offsets — offsets are u32/u64 so moov's size is stable
// across the patch, letting us compute the mdat payload position up front.
export function assemble({ trakFactories, mdatPayload, moovFirst = true, mdatLarge = false }) {
  const mdatHeaderLen = mdatLarge ? 16 : 8
  const mkMdat = () => (mdatLarge ? box64('mdat', mdatPayload) : box('mdat', mdatPayload))
  // Pass 1 with zero offsets to measure moov.
  const moovProbe = box('moov', mvhdBox(), ...trakFactories.map((f) => f(0)))
  const mdatPayloadAt = moovFirst
    ? FTYP.length + moovProbe.length + mdatHeaderLen
    : FTYP.length + mdatHeaderLen
  const moov = box('moov', mvhdBox(), ...trakFactories.map((f) => f(mdatPayloadAt)))
  assert.equal(moov.length, moovProbe.length, 'builder invariant: offset patch must not resize moov')
  const parts = moovFirst ? [FTYP, moov, mkMdat()] : [FTYP, mkMdat(), moov]
  return new File([cat(...parts)], 'fixture.mp4', { type: 'video/mp4' })
}

// The canonical 4-sample AAC payload: two chunks with 2 junk bytes of
// interleaved "video" between them, so the demuxer must honor the exact
// per-chunk byte ranges rather than reading contiguously.
export const S0 = bytes(0xa1, 0xa2, 0xa3)
export const S1 = bytes(0xb1, 0xb2, 0xb3, 0xb4)
export const S2 = bytes(0xc1, 0xc2)
export const S3 = bytes(0xd1, 0xd2, 0xd3, 0xd4, 0xd5)
export const JUNK = bytes(0xee, 0xee)
export const MDAT_PAYLOAD = cat(S0, S1, S2, JUNK, S3) // chunk1 = S0..S2 (9B), junk, chunk2 = S3
export const ASC_48K_STEREO = bytes(0x11, 0x90) // AAC-LC (2), 48kHz (idx 3), 2ch
export const ASC_44K_STEREO = bytes(0x12, 0x10) // AAC-LC (2), 44.1kHz (idx 4), 2ch

// `sizes` is overridable so a structurally-valid demux can still yield an
// INVALID packet set (e.g. a zero-byte sample) for the ladder composition
// tests; chunk 1 spans sizes[0..2], chunk 2 is sizes[3], matching the
// canonical two-chunk layout.
export function aacTrakFactory({ asc = ASC_48K_STEREO, version = 0, wave = false, longLengths = false, co64 = false, timescale = 48000, offsetShift = 0, sizes = [3, 4, 2, 5], edts = null } = {}) {
  return (mdatPayloadAt) => {
    const esds = esdsBox(asc, { longLengths })
    const children = wave
      ? [box('wave', box('frma', fourcc('mp4a')), box('mp4a', u32(0)), esds, bytes(0, 0, 0, 0, 0, 0, 0, 0))]
      : [esds]
    return soundTrak({
      entry: mp4aEntry({ channels: 2, rate: timescale, version, children }),
      timescale,
      sttsEntries: [[4, 1024]],
      sizes,
      stscRuns: [
        [1, 3],
        [2, 1],
      ],
      chunkOffsets: [
        mdatPayloadAt + offsetShift,
        mdatPayloadAt + (sizes[0] + sizes[1] + sizes[2]) + JUNK.length + offsetShift,
      ],
      co64,
      edts,
    })
  }
}

// Expected timeline for 4×1024-tick samples at 48kHz, in µs (chained
// durations so rounding can't drift).
export const EXPECT_TS = [0, 21333, 42667, 64000]
export const EXPECT_DUR = [21333, 21334, 21333, 21333]
