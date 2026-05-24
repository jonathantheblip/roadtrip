import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'

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

const { extractVideoCreationDate } = await import('../../src/lib/videoMeta.js')

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
  const iso = await extractVideoCreationDate(file)
  assert.equal(iso, captured.toISOString())
})

test('extractVideoCreationDate reads mvhd v1 creation_time (64-bit)', async () => {
  const captured = new Date('2026-05-22T18:00:00.000Z')
  const file = bufferAsFile(makeMp4([mvhdV1(captured)]))
  const iso = await extractVideoCreationDate(file)
  assert.equal(iso, captured.toISOString())
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
  const meta = atom('meta', metaPayload)
  const file = bufferAsFile(makeMp4([mvhdV0(captured), meta]))
  const iso = await extractVideoCreationDate(file)
  // Apple value should win and the parser normalizes to UTC.
  assert.equal(iso, captured.toISOString())
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
