import { test } from 'node:test'
import assert from 'node:assert/strict'

// Only the PURE blank-frame detector is unit-tested here — the seek/draw/encode
// orchestration needs a real <video>/canvas and is covered by the simulator gate.
const { isBlankImageData } = await import('../../src/lib/videoPipeline.js')

function rgba(pixels) {
  const data = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach(([r, g, b], i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  })
  return data
}

test('isBlankImageData: an all-black frame is blank (the classic black open frame)', () => {
  assert.equal(isBlankImageData(rgba(Array(1000).fill([0, 0, 0]))), true)
})

test('isBlankImageData: a uniform gray frame (no contrast) is blank', () => {
  assert.equal(isBlankImageData(rgba(Array(1000).fill([128, 128, 128]))), true)
})

test('isBlankImageData: a frame with real contrast is NOT blank', () => {
  const px = []
  for (let i = 0; i < 1000; i++) px.push(i % 2 ? [240, 240, 240] : [10, 20, 30])
  assert.equal(isBlankImageData(rgba(px)), false)
})

test('isBlankImageData: a dim-but-varied frame is NOT blank', () => {
  const px = []
  for (let i = 0; i < 1000; i++) px.push(i % 3 === 0 ? [60, 70, 80] : [2, 3, 4])
  assert.equal(isBlankImageData(rgba(px)), false)
})

test('isBlankImageData: empty / null buffer is treated as blank', () => {
  assert.equal(isBlankImageData(new Uint8ClampedArray(0)), true)
  assert.equal(isBlankImageData(null), true)
})

// ─── audio carry ladder (FIX: audio survives video import) ────────────────
// classifyAudioPlan routes a demux result onto exactly one rung; these pin the
// routing so no future edit can silently reroute a rung (G7: each assertion
// fails if the ladder lies about where a source goes).
const { classifyAudioPlan, validateAacPackets } = await import(
  '../../src/lib/videoPipeline.js'
)

test('ladder: a demuxed AAC track takes the packet-copy rung (a)', () => {
  assert.equal(classifyAudioPlan({ ok: true, codec: 'aac' }).rung, 'packets')
})

test('ladder: no-audio-track is HONEST silence (c) — never "lost", never legacy', () => {
  assert.deepEqual(classifyAudioPlan({ ok: false, reason: 'no-audio-track' }), {
    rung: 'silent',
  })
})

test('ladder: non-AAC audio takes the legacy decode rung (b), naming the codec', () => {
  assert.deepEqual(classifyAudioPlan({ ok: false, reason: 'not-aac', codec: 'sowt' }), {
    rung: 'legacy',
    reason: 'not-aac:sowt',
  })
})

test('ladder: parse-error can NOT claim silence — legacy rung, reason kept honest', () => {
  assert.deepEqual(
    classifyAudioPlan({ ok: false, reason: 'parse-error', sawAacTrack: true }),
    { rung: 'legacy', reason: 'aac-parse-failed' }
  )
  assert.deepEqual(
    classifyAudioPlan({ ok: false, reason: 'parse-error', sawAacTrack: false }),
    { rung: 'legacy', reason: 'container-unreadable' }
  )
  // A null/undefined demux result must also never read as silence.
  assert.equal(classifyAudioPlan(null).rung, 'legacy')
})

// validateAacPackets guards rung (a) BEFORE the muxer: a bad packet set must
// become a clean per-clip 'lost' outcome, not a mid-mux crash.
function goodTrack() {
  return {
    description: new Uint8Array([0x11, 0x90]),
    sampleRate: 48000,
    channels: 2,
    samples: [
      { data: new Uint8Array([1]), timestampMicros: 0, durationMicros: 21333 },
      { data: new Uint8Array([2]), timestampMicros: 21333, durationMicros: 21334 },
    ],
  }
}

test('validateAacPackets: a well-formed demux result passes', () => {
  assert.equal(validateAacPackets(goodTrack()), null)
})

test('validateAacPackets: each malformation is rejected up front', () => {
  assert.equal(validateAacPackets({ ...goodTrack(), description: new Uint8Array(0) }), 'no-description')
  assert.equal(validateAacPackets({ ...goodTrack(), sampleRate: 0 }), 'bad-sample-rate')
  assert.equal(validateAacPackets({ ...goodTrack(), channels: 0 }), 'bad-channels')
  assert.equal(validateAacPackets({ ...goodTrack(), samples: [] }), 'no-samples')
  const empty = goodTrack()
  empty.samples[1].data = new Uint8Array(0)
  assert.equal(validateAacPackets(empty), 'empty-sample')
  const backwards = goodTrack()
  backwards.samples[1].timestampMicros = -5
  assert.equal(validateAacPackets(backwards), 'bad-timestamp')
  const nonMono = goodTrack()
  nonMono.samples[0].timestampMicros = 99999
  assert.equal(validateAacPackets(nonMono), 'non-monotonic')
  const badDur = goodTrack()
  badDur.samples[0].durationMicros = NaN
  assert.equal(validateAacPackets(badDur), 'bad-duration')
})

// ─── ladder COMPOSITION (planAudioCarry over real container bytes) ─────────
// classifyAudioPlan and validateAacPackets are pinned above, but the 8 lines
// gluing them (planAudioCarry) are where a regression could silently reroute
// a rung. These prove the composition itself, with a spy AudioContext so
// rung (b)'s reachability is OBSERVED, not inferred: node has no real
// AudioContext, so a spy that "decodes" successfully makes rung (b) visibly
// succeed — meaning any assertion that a clip did NOT carry proves rung (b)
// was never consulted.

const { planAudioCarry } = await import('../../src/lib/videoPipeline.js')
const { assemble, aacTrakFactory, videoTrak, MDAT_PAYLOAD, cat, box, full, u16, u32, FTYP, mvhdBox } = await import(
  './mp4Fixtures.mjs'
)

test('ladder composition: a rung-(a) packet failure is LOST loudly — it never falls through to rung (b)', async () => {
  let constructed = 0
  class SpyAudioContext {
    constructor() {
      constructed += 1
    }
    async decodeAudioData() {
      return { numberOfChannels: 2, sampleRate: 48000 }
    }
    close() {}
  }
  globalThis.AudioContext = SpyAudioContext
  try {
    // (a)-fail: demux succeeds structurally but one packet is zero bytes →
    // validation rejects → the clip is 'lost' WITHOUT consulting rung (b),
    // even though the spy rung (b) would happily "carry" it.
    const invalidPackets = assemble({
      trakFactories: [aacTrakFactory({ sizes: [3, 4, 0, 5] })],
      mdatPayload: MDAT_PAYLOAD,
    })
    const planA = await planAudioCarry(invalidPackets)
    assert.deepEqual(planA, { mode: 'none', sound: 'lost', reason: 'aac-packets-invalid:empty-sample' })
    assert.equal(constructed, 0, 'a failed packet copy must never re-try on decodeAudioData')

    // Corrupt container (unreadable hdlr on a trak): silence can NOT be
    // claimed — rung (b) IS consulted and carries the sound here.
    const brokenTrak = box(
      'trak',
      box(
        'mdia',
        full('mdhd', 0, u32(0), u32(0), u32(48000), u32(0), u16(0), u16(0)),
        full('hdlr', 0, u32(0)),
        box('minf', box('stbl', full('stsd', 0, u32(0))))
      )
    )
    const corrupt = new File([cat(FTYP, box('moov', mvhdBox(), videoTrak(), brokenTrak))], 'corrupt.mp4')
    const planB = await planAudioCarry(corrupt)
    assert.equal(planB.mode, 'pcm')
    assert.equal(planB.sound, 'carried')
    assert.equal(planB.reason, 'container-unreadable')
    assert.equal(constructed, 1, 'an unreadable container must reach the legacy decode rung')

    // Genuinely silent source: honest 'none', rung (b) untouched.
    const silent = assemble({ trakFactories: [() => videoTrak()], mdatPayload: MDAT_PAYLOAD })
    const planC = await planAudioCarry(silent)
    assert.deepEqual(planC, { mode: 'none', sound: 'none' })
    assert.equal(constructed, 1)

    // The happy mainline carries by PACKET COPY — no decode, no AudioContext.
    const good = assemble({ trakFactories: [aacTrakFactory()], mdatPayload: MDAT_PAYLOAD })
    const planD = await planAudioCarry(good)
    assert.equal(planD.mode, 'packets')
    assert.equal(planD.sound, 'carried')
    assert.equal(planD.track.samples.length, 4)
    assert.equal(constructed, 1, 'the packet-copy mainline must never construct an AudioContext')
  } finally {
    delete globalThis.AudioContext
  }
})
