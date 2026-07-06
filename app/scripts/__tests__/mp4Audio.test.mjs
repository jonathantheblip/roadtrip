// mp4Audio demuxer — the packet-copy mainline for "audio survives video
// import". Every fixture here is a PROGRAMMATICALLY BUILT container (the
// box-builder in mp4Fixtures.mjs writes real ISO-BMFF bytes), so the
// assertions are byte-exact against known sample data and timestamps: if the
// parser lies about a single byte, an offset, or a typed failure, a test
// fails (G7).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  bytes,
  cat,
  u16,
  u32,
  fourcc,
  box,
  full,
  esdsBox,
  mp4aEntry,
  sampleEntryOther,
  elstBox,
  soundTrak,
  videoTrak,
  FTYP,
  MOVIE_TIMESCALE,
  mvhdBox,
  assemble,
  S0,
  S1,
  S2,
  S3,
  JUNK,
  MDAT_PAYLOAD,
  ASC_48K_STEREO,
  ASC_44K_STEREO,
  aacTrakFactory,
  EXPECT_TS,
  EXPECT_DUR,
} from './mp4Fixtures.mjs'

const { demuxAudioTrack } = await import('../../src/lib/mp4Audio.js')

function assertCanonicalSamples(res) {
  assert.equal(res.ok, true, `expected ok, got ${JSON.stringify(res)}`)
  assert.equal(res.codec, 'aac')
  assert.equal(res.codecString, 'mp4a.40.2')
  assert.equal(res.sampleRate, 48000)
  assert.equal(res.channels, 2)
  assert.deepEqual(Array.from(res.description), Array.from(ASC_48K_STEREO))
  assert.equal(res.samples.length, 4)
  const want = [S0, S1, S2, S3]
  res.samples.forEach((s, i) => {
    assert.deepEqual(Array.from(s.data), Array.from(want[i]), `sample ${i} bytes`)
    assert.equal(s.timestampMicros, EXPECT_TS[i], `sample ${i} timestamp`)
    assert.equal(s.durationMicros, EXPECT_DUR[i], `sample ${i} duration`)
  })
}

// ─── the happy paths ─────────────────────────────────────────────────────

test('demux: standard MP4 (moov first, video trak + AAC trak) → byte-exact packets', async () => {
  const file = assemble({
    trakFactories: [() => videoTrak(), aacTrakFactory()],
    mdatPayload: MDAT_PAYLOAD,
  })
  assertCanonicalSamples(await demuxAudioTrack(file))
})

test('demux: moov AFTER mdat (the common iPhone layout) parses identically', async () => {
  const file = assemble({
    trakFactories: [() => videoTrak(), aacTrakFactory()],
    mdatPayload: MDAT_PAYLOAD,
    moovFirst: false,
  })
  assertCanonicalSamples(await demuxAudioTrack(file))
})

test('demux: QuickTime variant — v1 sound description + wave-wrapped esds + varint lengths', async () => {
  const file = assemble({
    trakFactories: [aacTrakFactory({ version: 1, wave: true, longLengths: true })],
    mdatPayload: MDAT_PAYLOAD,
  })
  assertCanonicalSamples(await demuxAudioTrack(file))
})

test('demux: 64-bit forms — co64 chunk offsets + largesize mdat header', async () => {
  const file = assemble({
    trakFactories: [aacTrakFactory({ co64: true })],
    mdatPayload: MDAT_PAYLOAD,
    moovFirst: false,
    mdatLarge: true,
  })
  assertCanonicalSamples(await demuxAudioTrack(file))
})

test('demux: spatial-audio shape — FIRST mp4a trak wins over a later one', async () => {
  // Second AAC trak points at shifted (junk) offsets and a 44.1k config; if
  // the picker grabbed it, both the rate and the bytes would differ.
  const file = assemble({
    trakFactories: [
      aacTrakFactory(),
      aacTrakFactory({ asc: ASC_44K_STEREO, timescale: 44100, offsetShift: 2 }),
    ],
    mdatPayload: cat(MDAT_PAYLOAD, JUNK, JUNK),
  })
  assertCanonicalSamples(await demuxAudioTrack(file))
})

// ─── edit lists (elst) ───────────────────────────────────────────────────
// The packet copy reproduces the RAW media timeline, so it may only proceed
// when the audio trak's edit list is at most a codec-priming trim. Anything
// bigger (a lossless trim, a slo-mo's rate/segment edits) must bail to the
// legacy rung — never a mis-timed copy reported as 'carried'.

test('demux: identity and priming-sized edit lists pass through untouched', async () => {
  const identity = assemble({
    trakFactories: [aacTrakFactory({ edts: elstBox({ entries: [{ segmentTicks: 600, mediaTime: 0 }] }) })],
    mdatPayload: MDAT_PAYLOAD,
  })
  assertCanonicalSamples(await demuxAudioTrack(identity))
  // The classic AAC priming skip: 2112 samples at 48kHz ≈ 44ms.
  const priming = assemble({
    trakFactories: [aacTrakFactory({ edts: elstBox({ entries: [{ segmentTicks: 600, mediaTime: 2112 }] }) })],
    mdatPayload: MDAT_PAYLOAD,
  })
  assertCanonicalSamples(await demuxAudioTrack(priming))
})

test('demux: a lossless-trim edit list (seconds-scale media_time) is parse-error — never a mis-timed copy', async () => {
  // 2s trimmed off the head at 48kHz media timescale.
  const file = assemble({
    trakFactories: [aacTrakFactory({ edts: elstBox({ entries: [{ segmentTicks: 600, mediaTime: 96000 }] }) })],
    mdatPayload: MDAT_PAYLOAD,
  })
  const res = await demuxAudioTrack(file)
  assert.equal(res.reason, 'parse-error')
  assert.equal(res.sawAacTrack, true, 'a trimmed source still HAD sound — the loss must stay reportable')
})

test('demux: v1 (64-bit) edit lists get the same guard', async () => {
  const file = assemble({
    trakFactories: [aacTrakFactory({ edts: elstBox({ version: 1, entries: [{ segmentTicks: 600, mediaTime: 96000 }] }) })],
    mdatPayload: MDAT_PAYLOAD,
  })
  const res = await demuxAudioTrack(file)
  assert.equal(res.reason, 'parse-error')
  assert.equal(res.sawAacTrack, true)
})

test('demux: a rate-changing edit list (the slo-mo shape) is parse-error', async () => {
  const file = assemble({
    trakFactories: [aacTrakFactory({ edts: elstBox({ entries: [{ segmentTicks: 600, mediaTime: 0, rate: 2 }] }) })],
    mdatPayload: MDAT_PAYLOAD,
  })
  const res = await demuxAudioTrack(file)
  assert.equal(res.reason, 'parse-error')
  assert.equal(res.sawAacTrack, true)
})

test('demux: a spliced edit list (two content edits) is parse-error', async () => {
  const file = assemble({
    trakFactories: [
      aacTrakFactory({
        edts: elstBox({
          entries: [
            { segmentTicks: 300, mediaTime: 0 },
            { segmentTicks: 300, mediaTime: 2048 },
          ],
        }),
      }),
    ],
    mdatPayload: MDAT_PAYLOAD,
  })
  const res = await demuxAudioTrack(file)
  assert.equal(res.reason, 'parse-error')
  assert.equal(res.sawAacTrack, true)
})

test('demux: empty-edit lead — a tiny delay passes, a long one bails', async () => {
  // segment_duration counts in the MOVIE timescale (600 here): 30 ticks = 50ms.
  const tiny = assemble({
    trakFactories: [
      aacTrakFactory({
        edts: elstBox({
          entries: [
            { segmentTicks: 30, mediaTime: -1 },
            { segmentTicks: 600, mediaTime: 0 },
          ],
        }),
      }),
    ],
    mdatPayload: MDAT_PAYLOAD,
  })
  assertCanonicalSamples(await demuxAudioTrack(tiny))
  // 600 ticks = a full second of silence the copy would drop — audio would
  // lead the video by 1s while claiming 'carried'.
  const long = assemble({
    trakFactories: [
      aacTrakFactory({
        edts: elstBox({
          entries: [
            { segmentTicks: MOVIE_TIMESCALE, mediaTime: -1 },
            { segmentTicks: 600, mediaTime: 0 },
          ],
        }),
      }),
    ],
    mdatPayload: MDAT_PAYLOAD,
  })
  const res = await demuxAudioTrack(long)
  assert.equal(res.reason, 'parse-error')
  assert.equal(res.sawAacTrack, true)
})

// ─── typed failures ──────────────────────────────────────────────────────

test('demux: video-only file → no-audio-track (honest silence, not an error)', async () => {
  const file = assemble({ trakFactories: [() => videoTrak()], mdatPayload: MDAT_PAYLOAD })
  const res = await demuxAudioTrack(file)
  assert.deepEqual(res, { ok: false, reason: 'no-audio-track' })
})

test('demux: an mp4a trak with ZERO samples is also no-audio-track', async () => {
  const file = assemble({
    trakFactories: [
      () =>
        soundTrak({
          entry: mp4aEntry({ children: [esdsBox(ASC_48K_STEREO)] }),
          timescale: 48000,
          sttsEntries: [],
          sizes: [],
          stscRuns: [],
          chunkOffsets: [],
        }),
    ],
    mdatPayload: bytes(0),
  })
  const res = await demuxAudioTrack(file)
  assert.deepEqual(res, { ok: false, reason: 'no-audio-track' })
})

test('demux: non-AAC audio (PCM "sowt") → not-aac with the codec named', async () => {
  const file = assemble({
    trakFactories: [
      (at) =>
        soundTrak({
          entry: sampleEntryOther('sowt'),
          timescale: 44100,
          sttsEntries: [[1, 1024]],
          sizes: [4],
          stscRuns: [[1, 1]],
          chunkOffsets: [at],
        }),
    ],
    mdatPayload: MDAT_PAYLOAD,
  })
  const res = await demuxAudioTrack(file)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'not-aac')
  assert.equal(res.codec, 'sowt')
})

test('demux: MP3 inside an mp4a entry (esds oti 0x6B) → not-aac, codec mp3', async () => {
  const file = assemble({
    trakFactories: [
      (at) =>
        soundTrak({
          entry: mp4aEntry({ children: [esdsBox(bytes(0), { oti: 0x6b })] }),
          timescale: 44100,
          sttsEntries: [[1, 1152]],
          sizes: [4],
          stscRuns: [[1, 1]],
          chunkOffsets: [at],
        }),
    ],
    mdatPayload: MDAT_PAYLOAD,
  })
  const res = await demuxAudioTrack(file)
  assert.equal(res.reason, 'not-aac')
  assert.equal(res.codec, 'mp3')
})

test('demux: chunk offset beyond EOF → parse-error that REMEMBERS the AAC track', async () => {
  const file = assemble({
    trakFactories: [aacTrakFactory({ offsetShift: 100_000 })],
    mdatPayload: MDAT_PAYLOAD,
  })
  const res = await demuxAudioTrack(file)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'parse-error')
  assert.equal(res.sawAacTrack, true, 'the loss of a known AAC track must not be forgettable')
})

test('demux: fragmented layout (mvex, empty tables) is parse-error — NOT silence', async () => {
  const moov = box(
    'moov',
    mvhdBox(),
    box('mvex'),
    soundTrak({
      entry: mp4aEntry({ children: [esdsBox(ASC_48K_STEREO)] }),
      timescale: 48000,
      sttsEntries: [],
      sizes: [],
      stscRuns: [],
      chunkOffsets: [],
    })
  )
  const file = new File([cat(FTYP, moov)], 'frag.mp4', { type: 'video/mp4' })
  const res = await demuxAudioTrack(file)
  assert.equal(res.reason, 'parse-error')
  assert.equal(res.sawAacTrack, true)
})

test('demux: not a container at all → parse-error, no AAC claim', async () => {
  const noise = new Uint8Array(256)
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 37 + 11) & 0xff
  const res = await demuxAudioTrack(new File([noise], 'noise.bin'))
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'parse-error')
  assert.equal(res.sawAacTrack, false)
})

test('demux: reads RANGES, never the whole file (the iOS 200MB discipline)', async () => {
  const file = assemble({
    trakFactories: [() => videoTrak(), aacTrakFactory()],
    mdatPayload: cat(MDAT_PAYLOAD, new Uint8Array(4096)), // pad mdat so "whole file" is visibly bigger than any legit read
    moovFirst: false,
  })
  const reads = []
  const realSlice = file.slice.bind(file)
  Object.defineProperty(file, 'slice', {
    value: (a, b) => {
      reads.push([a, b])
      return realSlice(a, b)
    },
  })
  assertCanonicalSamples(await demuxAudioTrack(file))
  assert.ok(reads.length > 0)
  for (const [a, b] of reads) {
    assert.ok(b - a < file.size, `read [${a}, ${b}) must be a range, not the whole ${file.size}-byte file`)
  }
  // The biggest legitimate read is the moov payload; every media read is a
  // per-chunk range (9 and 5 bytes here) — nothing may touch the mdat bulk.
  const biggest = Math.max(...reads.map(([a, b]) => b - a))
  assert.ok(biggest < 1024, `largest read was ${biggest}B — should be the small moov, never mdat bulk`)
})

test('demux: truncated stsz (declared samples missing from the table) → parse-error', async () => {
  // Hand-build an stbl whose stsz declares 4 samples but carries 1 size.
  const stsd = full('stsd', 0, u32(1), mp4aEntry({ children: [esdsBox(ASC_48K_STEREO)] }))
  const stts = full('stts', 0, u32(1), u32(4), u32(1024))
  const badStsz = full('stsz', 0, u32(0), u32(4), u32(3))
  const stsc = full('stsc', 0, u32(1), u32(1), u32(4), u32(1))
  const stco = full('stco', 0, u32(1), u32(64))
  const mdhd = full('mdhd', 0, u32(0), u32(0), u32(48000), u32(0), u16(0), u16(0))
  const hdlr = full('hdlr', 0, u32(0), fourcc('soun'), u32(0), u32(0), u32(0), bytes(0))
  const trak = box('trak', box('mdia', mdhd, hdlr, box('minf', box('stbl', stsd, stts, badStsz, stsc, stco))))
  const file = new File([cat(FTYP, box('moov', trak), box('mdat', MDAT_PAYLOAD))], 't.mp4')
  const res = await demuxAudioTrack(file)
  assert.equal(res.reason, 'parse-error')
  assert.equal(res.sawAacTrack, true)
})

// ─── corrupt indexes must never fabricate "no-audio-track" ───────────────
// 'no-audio-track' means "source demonstrably silent" — it may only be
// claimed after a COMPLETE trak census. A trak we can't classify, or a moov
// we can't fully scan, could be hiding the sound trak.

test('demux: a trak whose hdlr is unreadable is parse-error — NOT honest silence', async () => {
  // The video trak parses fine; the second trak's hdlr payload is cut off
  // before handler_type, so it can't be ruled out as the sound trak.
  const brokenTrak = box(
    'trak',
    box(
      'mdia',
      full('mdhd', 0, u32(0), u32(0), u32(48000), u32(0), u16(0), u16(0)),
      full('hdlr', 0, u32(0)), // 8-byte payload: handler_type missing
      box('minf', box('stbl', full('stsd', 0, u32(0))))
    )
  )
  const file = new File([cat(FTYP, box('moov', mvhdBox(), videoTrak(), brokenTrak))], 'corrupt.mp4')
  const res = await demuxAudioTrack(file)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'parse-error')
  assert.equal(res.sawAacTrack, false)
})

test('demux: a trak without a readable mdia is parse-error too', async () => {
  const emptyTrak = box('trak', box('tkhd'))
  const file = new File([cat(FTYP, box('moov', mvhdBox(), videoTrak(), emptyTrak))], 'corrupt2.mp4')
  const res = await demuxAudioTrack(file)
  assert.equal(res.reason, 'parse-error')
  assert.equal(res.sawAacTrack, false)
})

test('demux: a moov whose declared size runs past EOF is parse-error — the missing tail could hold the sound trak', async () => {
  const moov = box('moov', mvhdBox(), videoTrak(), aacTrakFactory()(64))
  const whole = cat(FTYP, moov)
  // Cut the file inside moov: the AAC trak falls off the end.
  const file = new File([whole.slice(0, whole.length - 24)], 'trunc.mp4')
  const res = await demuxAudioTrack(file)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'parse-error')
})

test('demux: a malformed inner box size mid-moov (unscannable tail) is parse-error', async () => {
  // The child declares a size far past moov's end; everything after it —
  // where the sound trak would live — is unscannable.
  const badChild = cat(u32(1_000_000), fourcc('trak'), new Uint8Array(40))
  const file = new File([cat(FTYP, box('moov', mvhdBox(), videoTrak(), badChild))], 'badsize.mp4')
  const res = await demuxAudioTrack(file)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'parse-error')
})
