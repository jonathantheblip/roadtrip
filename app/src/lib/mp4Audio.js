// mp4Audio.js — in-house ISO-BMFF (MP4 / QuickTime .mov) AUDIO demuxer.
//
// Why this exists: the video import re-encodes every clip, and audio used to
// ride AudioContext.decodeAudioData over the WHOLE file — which fails routinely
// on iOS picker files, and every failure was swallowed, so the family's videos
// saved silent. This demuxer reads ONLY the container's index (moov) plus the
// audio sample byte ranges, so the already-compressed AAC packets can be
// PACKET-COPIED into the output (mp4-muxer addAudioChunkRaw) with no audio
// decode or re-encode at all — no decodeAudioData, no AudioEncoder.
//
// Read discipline: NEVER file.arrayBuffer() on the whole file (iOS camera
// files are 50–200MB and commonly put moov AFTER mdat). We walk the top-level
// box chain with small header slices (same approach as videoMeta.js), read the
// moov payload alone (KBs–MBs), then batch-read just the audio chunks' byte
// ranges out of mdat.
//
// demuxAudioTrack(file) resolves to exactly one of:
//   { ok: true, codec: 'aac', codecString, description, sampleRate, channels,
//     samples: [{ data, timestampMicros, durationMicros }] }
//   { ok: false, reason: 'no-audio-track' }            — source demonstrably silent
//   { ok: false, reason: 'not-aac', codec }            — audio exists, not AAC
//   { ok: false, reason: 'parse-error', sawAacTrack, detail }
// It never throws and never returns a partial sample list — a failure after an
// AAC track was identified reports sawAacTrack:true so the pipeline can keep
// the "source HAD sound" distinction honest.
//
// Coverage decisions (constraints, not aspirations):
//   • Multiple audio tracks (spatial audio): the FIRST 'soun' trak whose sample
//     entry is 'mp4a' wins; later tracks (APAC/ambisonic layers) are ignored.
//   • QuickTime variants: mp4a sound-description versions 0/1/2 (children at
//     +36/+52/+72) and the legacy 'wave'-wrapped esds are all handled.
//   • 64-bit forms: largesize box headers and co64 chunk offsets.
//   • mp4a carrying MP3 (esds objectTypeIndication 0x69/0x6B) → 'not-aac'.
//   • stz2, and fragmented files (mvex/moof, zero samples in moov) → typed
//     'parse-error' — never a fabricated sample list.
//   • An mp4a trak with ZERO samples is 'no-audio-track': nothing was recorded,
//     so silence is the truth, not a loss.
//   • 'no-audio-track' requires a COMPLETE trak census: a truncated moov, an
//     unscannable moov tail, or a trak whose mdia/hdlr can't be read is
//     'parse-error' — corruption must never be reported as honest silence.
//   • Edit lists: identity/priming-sized elst passes; one that would shift,
//     splice or re-rate the audible timeline (lossless trims, slo-mo) is
//     'parse-error' (sawAacTrack) — see AUDIO_EDIT_MAX_OFFSET_S.

// moov is the index, not the media — a real one is KBs to a few MB. Refuse to
// buffer anything claiming to be bigger (corrupt size field / mislabeled box).
const MOOV_MAX_BYTES = 64 * 1024 * 1024
// ≤3:00 clips yield ~8k AAC frames; this cap only exists so a corrupt stts/stsz
// count can't allocate unbounded arrays.
const MAX_SAMPLES = 500_000
// Edit lists (edts/elst) re-map a trak's media timeline at presentation time,
// but the packet copy reproduces the RAW media timeline. The copy therefore
// only stays in sync when the audio trak's edit does no more than skip codec
// priming (AAC priming is ≤2112 samples ≈ 48ms; 100ms leaves headroom without
// admitting real edits). Anything bigger — a lossless trim's seconds-scale
// media_time, a slo-mo's rate/segment edits — would play mis-timed audio
// while claiming 'carried', so it bails to the legacy rung instead, where
// decodeAudioData honors edit lists (or the clip honestly reads 'lost').
const AUDIO_EDIT_MAX_OFFSET_S = 0.1

// ISO/IEC 14496-3 sampling_frequency_index table.
const ASC_FREQ = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]

export async function demuxAudioTrack(file) {
  try {
    return await parseFile(file)
  } catch (err) {
    return {
      ok: false,
      reason: 'parse-error',
      sawAacTrack: !!err?.sawAacTrack,
      detail: err?.message || String(err),
    }
  }
}

// Internal throw helper — parse code deep in the box tree throws; the entry
// point converts to the typed { reason:'parse-error' } result. `sawAacTrack`
// marks failures that happened AFTER an AAC track was identified (i.e. the
// source provably had sound we then couldn't carry).
function bail(message, sawAacTrack = false) {
  const e = new Error(message)
  e.sawAacTrack = sawAacTrack
  throw e
}

async function parseFile(file) {
  if (!file || typeof file.slice !== 'function' || !Number.isFinite(file.size)) {
    bail('not a sliceable file')
  }
  const moov = await locateTopLevelBox(file, 'moov')
  if (!moov) bail('no moov box found')
  // 'no-audio-track' ("source demonstrably silent") may only ever be claimed
  // off a COMPLETE trak census. A moov whose declared size runs past EOF has
  // lost its tail — the sound trak could be in the missing part.
  if (moov.truncated) bail('moov truncated — declared size exceeds the file')
  if (moov.dataEnd - moov.dataStart > MOOV_MAX_BYTES) bail('moov implausibly large')
  const view = new DataView(await file.slice(moov.dataStart, moov.dataEnd).arrayBuffer())

  // Collect every trak, and note mvex (fragmented layout) — a fragmented
  // file's moov carries empty sample tables, which must NOT read as "silent".
  const traks = []
  let fragmented = false
  let scanned = 0
  for (const child of childBoxes(view, 0, view.byteLength)) {
    if (child.type === 'trak') traks.push(child)
    if (child.type === 'mvex') fragmented = true
    scanned = child.end
  }
  // childBoxes stops cleanly (no throw) on a malformed child size; at THIS
  // level that would silently drop every trak after the bad byte. A leftover
  // tail big enough to hold a box header means the census is incomplete.
  if (view.byteLength - scanned >= 8) bail('moov index unreadable past a malformed box')

  // First pass: find the sound traks and the first mp4a one among them.
  let chosen = null
  let firstNonAacCodec = null
  let sawSoundTrak = false
  for (const trak of traks) {
    const mdia = findBox(view, trak.start, trak.end, 'mdia')
    // A trak we can't classify could BE the sound trak — skipping it would
    // let a corrupt file read as honest silence instead of a parse failure.
    if (!mdia) bail('trak without a readable mdia')
    const hdlr = findBox(view, mdia.start, mdia.end, 'hdlr')
    // hdlr payload: version/flags(4) pre_defined(4) handler_type(4)
    if (!hdlr || hdlr.end - hdlr.start < 12) bail('trak without a readable hdlr')
    if (readAscii4(view, hdlr.start + 8) !== 'soun') continue
    sawSoundTrak = true
    const stbl = descend(view, mdia, ['minf', 'stbl'])
    if (!stbl) continue
    const entry = readFirstSampleEntry(view, stbl)
    if (!entry) continue
    if (entry.fourcc !== 'mp4a') {
      if (!firstNonAacCodec) firstNonAacCodec = entry.fourcc
      continue
    }
    chosen = { trak, mdia, stbl, entry }
    break
  }
  if (!chosen) {
    if (firstNonAacCodec) return { ok: false, reason: 'not-aac', codec: firstNonAacCodec }
    if (sawSoundTrak) bail('sound trak without a readable sample entry')
    return { ok: false, reason: 'no-audio-track' }
  }

  // From here on the source provably HAS an AAC-flagged track — any failure
  // must carry sawAacTrack so the caller can report the loss, not silence.
  const { trak, mdia, stbl, entry } = chosen

  const esds = locateEsds(view, entry)
  if (!esds) bail('mp4a sample entry without esds', true)
  const dsi = parseEsds(view, esds.start, esds.end)
  if (dsi.oti === 0x69 || dsi.oti === 0x6b) {
    // MP3-in-mp4a — real audio, wrong codec for a packet copy.
    return { ok: false, reason: 'not-aac', codec: 'mp3' }
  }
  // 0x40 = MPEG-4 audio; 0x66–0x68 = MPEG-2 AAC profiles (same packet shape).
  if (dsi.oti !== 0x40 && (dsi.oti < 0x66 || dsi.oti > 0x68)) {
    return { ok: false, reason: 'not-aac', codec: `oti-0x${dsi.oti.toString(16)}` }
  }
  if (!dsi.description || dsi.description.length === 0) bail('esds without AudioSpecificConfig', true)

  const asc = parseAudioSpecificConfig(dsi.description)
  const sampleRate = asc.sampleRate || entry.sampleRate || null
  const channels = asc.channels || entry.channels || null
  if (!sampleRate || !channels) bail('could not resolve sample rate / channels', true)

  const mdhd = findBox(view, mdia.start, mdia.end, 'mdhd')
  if (!mdhd) bail('no mdhd', true)
  const timescale = readMdhdTimescale(view, mdhd)
  if (!timescale) bail('bad mdhd timescale', true)

  checkAudioEditList(view, trak, timescale)

  const table = readSampleTables(view, stbl)
  if (table.sampleCount === 0) {
    if (fragmented) bail('fragmented file — samples live in moof, not moov', true)
    // A declared-but-empty AAC track recorded nothing: silence is the truth.
    return { ok: false, reason: 'no-audio-track' }
  }

  const ranges = mapSamplesToRanges(table, file.size)
  const samples = await readSampleBytes(file, ranges, table, timescale)

  return {
    ok: true,
    codec: 'aac',
    codecString: `mp4a.40.${asc.objectType || 2}`,
    description: dsi.description,
    sampleRate,
    channels,
    samples,
  }
}

// ─── top-level walk (header slices only — mirrors videoMeta.js) ───────────

async function locateTopLevelBox(file, wantType) {
  const size = file.size
  let pos = 0
  for (let guard = 0; guard < 4096 && pos + 8 <= size; guard++) {
    const hv = new DataView(await file.slice(pos, Math.min(pos + 16, size)).arrayBuffer())
    if (hv.byteLength < 8) break
    let boxSize = hv.getUint32(0)
    const type = readAscii4(hv, 4)
    let headerLen = 8
    if (boxSize === 1) {
      // 64-bit largesize in the next 8 bytes.
      if (hv.byteLength < 16) break
      boxSize = hv.getUint32(8) * 0x100000000 + hv.getUint32(12)
      headerLen = 16
    } else if (boxSize === 0) {
      boxSize = size - pos // box runs to EOF
    }
    if (boxSize < headerLen) break // malformed — bail cleanly
    if (type === wantType) {
      // truncated = the box claims bytes past EOF; the caller decides whether
      // a clamped read is safe (it is NOT for moov — a partial index lies).
      return {
        dataStart: pos + headerLen,
        dataEnd: Math.min(pos + boxSize, size),
        truncated: pos + boxSize > size,
      }
    }
    pos += boxSize
  }
  return null
}

// ─── in-buffer box helpers ────────────────────────────────────────────────

// Iterate the child boxes of [start, end). Yields { type, start, end } where
// start/end bound the PAYLOAD. Stops cleanly on any malformed size so a bad
// byte can't spin the loop; callers treat truncation as "box not found".
function* childBoxes(view, start, end) {
  let pos = start
  for (let guard = 0; guard < 100_000 && pos + 8 <= end; guard++) {
    const size = view.getUint32(pos)
    const type = readAscii4(view, pos + 4)
    let payloadStart = pos + 8
    let boxEnd
    if (size === 1) {
      if (pos + 16 > end) return
      boxEnd = pos + view.getUint32(pos + 8) * 0x100000000 + view.getUint32(pos + 12)
      payloadStart = pos + 16
    } else if (size === 0) {
      boxEnd = end
    } else {
      boxEnd = pos + size
    }
    if (boxEnd <= pos || boxEnd > end || payloadStart > boxEnd) return
    yield { type, start: payloadStart, end: boxEnd }
    pos = boxEnd
  }
}

function findBox(view, start, end, wantType) {
  for (const child of childBoxes(view, start, end)) {
    if (child.type === wantType) return child
  }
  return null
}

// Follow a path of nested boxes ('minf' → 'stbl' …) from a parent's payload.
function descend(view, parent, path) {
  let cur = parent
  for (const type of path) {
    cur = findBox(view, cur.start, cur.end, type)
    if (!cur) return null
  }
  return cur
}

function readAscii4(view, off) {
  return String.fromCharCode(
    view.getUint8(off),
    view.getUint8(off + 1),
    view.getUint8(off + 2),
    view.getUint8(off + 3)
  )
}

// ─── stsd / sample entry ─────────────────────────────────────────────────

// First sample entry of stsd: { fourcc, boxStart, boxEnd, version, channels,
// sampleRate, childrenStart }. childrenStart accounts for the QuickTime sound
// description version: v0 children at +36, v1 +52 (16 extra bytes), v2 +72.
function readFirstSampleEntry(view, stbl) {
  const stsd = findBox(view, stbl.start, stbl.end, 'stsd')
  // stsd payload: version/flags(4) entry_count(4) then entries.
  if (!stsd || stsd.end - stsd.start < 16) return null
  const entryCount = view.getUint32(stsd.start + 4)
  if (entryCount === 0) return null
  const boxStart = stsd.start + 8
  if (boxStart + 8 > stsd.end) return null
  const size = view.getUint32(boxStart)
  const fourcc = readAscii4(view, boxStart + 4)
  const boxEnd = Math.min(boxStart + (size >= 8 ? size : 8), stsd.end)
  // SampleEntry: header(8) + reserved(6) + data_reference_index(2) = +16,
  // then the QT sound-description version u16.
  if (boxStart + 36 > boxEnd) return { fourcc, boxStart, boxEnd, version: 0, channels: null, sampleRate: null, childrenStart: boxEnd }
  const version = view.getUint16(boxStart + 16)
  // v2 restructures every field (rate as a float64, channels elsewhere) — for
  // it we report null here and rely on the AudioSpecificConfig instead.
  const channels = version < 2 ? view.getUint16(boxStart + 24) || null : null
  const sampleRate = version < 2 ? Math.round(view.getUint32(boxStart + 32) / 65536) || null : null
  const childrenStart = boxStart + (version === 1 ? 52 : version === 2 ? 72 : 36)
  return { fourcc, boxStart, boxEnd, version, channels, sampleRate, childrenStart: Math.min(childrenStart, boxEnd) }
}

// esds either sits directly under the mp4a entry, or (QuickTime) inside a
// 'wave' wrapper alongside 'frma' and a 12-byte pseudo-'mp4a' marker.
function locateEsds(view, entry) {
  const direct = findBox(view, entry.childrenStart, entry.boxEnd, 'esds')
  if (direct) return direct
  const wave = findBox(view, entry.childrenStart, entry.boxEnd, 'wave')
  if (wave) return findBox(view, wave.start, wave.end, 'esds')
  return null
}

// esds payload: version/flags(4), then an MPEG-4 descriptor tree. We need the
// ES_Descriptor(3) → DecoderConfigDescriptor(4) → DecoderSpecificInfo(5),
// whose payload is the AudioSpecificConfig, plus the objectTypeIndication.
function parseEsds(view, start, end) {
  let pos = start + 4
  const es = readDescriptor(view, pos, end)
  if (!es || es.tag !== 0x03) bail('esds: no ES descriptor', true)
  pos = es.start + 2 // ES_ID
  if (pos >= es.end) bail('esds: truncated ES descriptor', true)
  const flags = view.getUint8(pos)
  pos += 1
  if (flags & 0x80) pos += 2 // streamDependenceFlag → dependsOn_ES_ID
  if (flags & 0x40) {
    if (pos >= es.end) bail('esds: truncated URL flag', true)
    pos += 1 + view.getUint8(pos) // URL_Flag → URLlength + URLstring
  }
  if (flags & 0x20) pos += 2 // OCRstreamFlag → OCR_ES_Id
  const dec = readDescriptor(view, pos, es.end)
  if (!dec || dec.tag !== 0x04) bail('esds: no DecoderConfig descriptor', true)
  const oti = view.getUint8(dec.start)
  // DecoderConfig: oti(1) streamType(1) bufferSizeDB(3) maxBitrate(4) avgBitrate(4)
  let dsiPos = dec.start + 13
  let description = null
  while (dsiPos < dec.end) {
    const d = readDescriptor(view, dsiPos, dec.end)
    if (!d) break
    if (d.tag === 0x05) {
      description = new Uint8Array(d.end - d.start)
      for (let i = 0; i < description.length; i++) description[i] = view.getUint8(d.start + i)
      break
    }
    dsiPos = d.end
  }
  return { oti, description }
}

// One descriptor: tag byte + base-128 varint length (high bit = continue).
function readDescriptor(view, pos, end) {
  if (pos + 2 > end) return null
  const tag = view.getUint8(pos)
  pos += 1
  let len = 0
  for (let i = 0; i < 4; i++) {
    if (pos >= end) return null
    const b = view.getUint8(pos)
    pos += 1
    len = (len << 7) | (b & 0x7f)
    if (!(b & 0x80)) break
  }
  const start = pos
  const boxedEnd = Math.min(start + len, end)
  return { tag, start, end: boxedEnd }
}

// AudioSpecificConfig — enough of ISO 14496-3 to get the true object type,
// sample rate (incl. explicit 24-bit and HE-AAC extension rate) and channels.
function parseAudioSpecificConfig(bytes) {
  let bitPos = 0
  function bits(n) {
    let v = 0
    for (let i = 0; i < n; i++) {
      const byte = bytes[bitPos >> 3]
      if (byte === undefined) return null
      v = (v << 1) | ((byte >> (7 - (bitPos & 7))) & 1)
      bitPos += 1
    }
    return v
  }
  let objectType = bits(5)
  if (objectType === 31) {
    const ext = bits(6)
    objectType = ext == null ? null : 32 + ext
  }
  let freqIndex = bits(4)
  let sampleRate = freqIndex === 15 ? bits(24) : ASC_FREQ[freqIndex] ?? null
  const channels = bits(4)
  // HE-AAC (SBR/PS) signals the real output rate as an extension.
  if (objectType === 5 || objectType === 29) {
    const extIndex = bits(4)
    const extRate = extIndex === 15 ? bits(24) : ASC_FREQ[extIndex] ?? null
    if (extRate) sampleRate = extRate
  }
  return { objectType: objectType || null, sampleRate: sampleRate || null, channels: channels || null }
}

// ─── mdhd / sample tables ────────────────────────────────────────────────

function readMdhdTimescale(view, mdhd) {
  if (mdhd.end - mdhd.start < 16) return null
  const version = view.getUint8(mdhd.start)
  // v0: creation(4) modification(4) timescale(4); v1: 8-byte times.
  const off = version === 1 ? mdhd.start + 20 : mdhd.start + 12
  if (off + 4 > mdhd.end) return null
  const ts = view.getUint32(off)
  return ts > 0 ? ts : null
}

// Enforce the packet copy's edit-list constraint (AUDIO_EDIT_MAX_OFFSET_S):
// absent/identity/priming-sized edits pass; anything that would shift, splice
// or re-rate the audible timeline bails (sawAacTrack — the source HAD sound).
// mediaTime counts in the media (mdhd) timescale; empty-edit segment_durations
// count in the movie (mvhd) timescale.
function checkAudioEditList(view, trak, mediaTimescale) {
  const edts = findBox(view, trak.start, trak.end, 'edts')
  if (!edts) return
  const elst = findBox(view, edts.start, edts.end, 'elst')
  if (!elst) return
  if (elst.end - elst.start < 8) bail('unreadable elst', true)
  const version = view.getUint8(elst.start)
  const entryCount = view.getUint32(elst.start + 4)
  if (entryCount === 0) return
  const entrySize = version === 1 ? 20 : 12
  if (elst.start + 8 + entryCount * entrySize > elst.end) bail('truncated elst', true)
  let emptyLeadTicks = 0 // presentation delay (movie ticks) before the content edit
  let contentSeen = false
  for (let i = 0; i < entryCount; i++) {
    const at = elst.start + 8 + i * entrySize
    let segmentTicks
    let mediaTime
    if (version === 1) {
      segmentTicks = view.getUint32(at) * 0x100000000 + view.getUint32(at + 4)
      const hi = view.getUint32(at + 8)
      const lo = view.getUint32(at + 12)
      // i64 without BigInt: all-ones is the -1 empty-edit marker; any other
      // negative is malformed; real positives sit far below 2^53.
      if (hi === 0xffffffff && lo === 0xffffffff) mediaTime = -1
      else if (hi & 0x80000000) bail('malformed elst media_time', true)
      else mediaTime = hi * 0x100000000 + lo
    } else {
      segmentTicks = view.getUint32(at)
      mediaTime = view.getInt32(at + 4)
      if (mediaTime < -1) bail('malformed elst media_time', true)
    }
    if (mediaTime === -1) {
      // Empty edit: silence inserted before the content shifts it (bounded
      // below); one trailing the content only pads the end — harmless.
      if (!contentSeen) emptyLeadTicks += segmentTicks
      continue
    }
    if (contentSeen) bail('audio edit list splices the timeline', true)
    contentSeen = true
    const rateAt = at + (version === 1 ? 16 : 8)
    if (view.getUint16(rateAt) !== 1 || view.getUint16(rateAt + 2) !== 0) {
      bail('audio edit list re-rates playback', true)
    }
    if (mediaTime / mediaTimescale > AUDIO_EDIT_MAX_OFFSET_S) {
      bail('audio edit list trims beyond codec priming', true)
    }
  }
  if (emptyLeadTicks > 0) {
    // mvhd shares mdhd's version/creation/modification/timescale layout.
    const mvhd = findBox(view, 0, view.byteLength, 'mvhd')
    const movieTimescale = mvhd ? readMdhdTimescale(view, mvhd) : null
    if (!movieTimescale || emptyLeadTicks / movieTimescale > AUDIO_EDIT_MAX_OFFSET_S) {
      bail('audio edit list delays the track start', true)
    }
  }
}

// Read stts/stsz/stsc/stco|co64 into plain arrays. Throws (sawAacTrack) on any
// inconsistency — a partial or guessed sample map would corrupt the copy.
function readSampleTables(view, stbl) {
  const stts = findBox(view, stbl.start, stbl.end, 'stts')
  const stsz = findBox(view, stbl.start, stbl.end, 'stsz')
  const stsc = findBox(view, stbl.start, stbl.end, 'stsc')
  const stco = findBox(view, stbl.start, stbl.end, 'stco')
  const co64 = stco ? null : findBox(view, stbl.start, stbl.end, 'co64')
  if (!stts || !stsc || (!stco && !co64)) bail('missing sample tables', true)
  if (!stsz) bail(findBox(view, stbl.start, stbl.end, 'stz2') ? 'stz2 sizes unsupported' : 'missing stsz', true)

  // stsz: version/flags(4) sample_size(4) sample_count(4) [sizes…]
  const constSize = view.getUint32(stsz.start + 4)
  const sampleCount = view.getUint32(stsz.start + 8)
  if (sampleCount > MAX_SAMPLES) bail('implausible sample count', true)
  const sizes = new Array(sampleCount)
  if (constSize > 0) {
    sizes.fill(constSize)
  } else {
    if (stsz.start + 12 + sampleCount * 4 > stsz.end) bail('truncated stsz', true)
    for (let i = 0; i < sampleCount; i++) sizes[i] = view.getUint32(stsz.start + 12 + i * 4)
  }

  // stts: version/flags(4) entry_count(4) [count,delta]…  → per-sample deltas.
  const sttsCount = view.getUint32(stts.start + 4)
  if (stts.start + 8 + sttsCount * 8 > stts.end) bail('truncated stts', true)
  const deltas = new Array(sampleCount)
  let di = 0
  for (let i = 0; i < sttsCount; i++) {
    const n = view.getUint32(stts.start + 8 + i * 8)
    const delta = view.getUint32(stts.start + 12 + i * 8)
    for (let j = 0; j < n; j++) {
      if (di >= sampleCount) bail('stts covers more samples than stsz', true)
      deltas[di++] = delta
    }
  }
  if (di !== sampleCount) bail('stts covers fewer samples than stsz', true)

  // stsc runs: version/flags(4) entry_count(4) [first_chunk, samples_per_chunk, sdi]…
  const stscCount = view.getUint32(stsc.start + 4)
  if (stsc.start + 8 + stscCount * 12 > stsc.end) bail('truncated stsc', true)
  const runs = []
  for (let i = 0; i < stscCount; i++) {
    runs.push({
      firstChunk: view.getUint32(stsc.start + 8 + i * 12),
      samplesPerChunk: view.getUint32(stsc.start + 12 + i * 12),
    })
  }

  // chunk offsets
  const co = stco || co64
  const chunkCount = view.getUint32(co.start + 4)
  const wide = !!co64
  if (co.start + 8 + chunkCount * (wide ? 8 : 4) > co.end) bail('truncated chunk offsets', true)
  const chunkOffsets = new Array(chunkCount)
  for (let i = 0; i < chunkCount; i++) {
    chunkOffsets[i] = wide
      ? view.getUint32(co.start + 8 + i * 8) * 0x100000000 + view.getUint32(co.start + 12 + i * 8)
      : view.getUint32(co.start + 8 + i * 4)
  }

  return { sampleCount, sizes, deltas, runs, chunkOffsets }
}

// Expand stsc runs against the chunk offsets → per-chunk contiguous byte
// ranges plus each chunk's [firstSample, sampleCount]. Validates that every
// sample is mapped and no range escapes the file.
function mapSamplesToRanges(table, fileSize) {
  const { sampleCount, sizes, runs, chunkOffsets } = table
  if (runs.length === 0 || chunkOffsets.length === 0) bail('empty chunk map', true)
  const chunks = []
  let sample = 0
  for (let c = 0; c < chunkOffsets.length && sample < sampleCount; c++) {
    const chunkNo = c + 1 // stsc chunk numbers are 1-based
    let perChunk = runs[0].samplesPerChunk
    for (const run of runs) {
      if (run.firstChunk <= chunkNo) perChunk = run.samplesPerChunk
      else break
    }
    const n = Math.min(perChunk, sampleCount - sample)
    let bytes = 0
    for (let i = 0; i < n; i++) bytes += sizes[sample + i]
    const start = chunkOffsets[c]
    if (!Number.isFinite(start) || start < 0 || start + bytes > fileSize) {
      bail('sample bytes fall outside the file', true)
    }
    chunks.push({ start, bytes, firstSample: sample, count: n })
    sample += n
  }
  if (sample !== sampleCount) bail('chunk map does not cover every sample', true)
  return chunks
}

// Batch-read each chunk's contiguous byte range and split it into per-sample
// COPIES (each sample owns its buffer, so the pipeline can transfer them to
// the encode worker). Timestamps accumulate in source ticks and convert to
// microseconds per sample; durations chain off the next timestamp so rounding
// can never accumulate drift.
async function readSampleBytes(file, chunks, table, timescale) {
  const { sampleCount, sizes, deltas } = table
  const tsMicros = new Array(sampleCount)
  let ticks = 0
  for (let i = 0; i < sampleCount; i++) {
    tsMicros[i] = Math.round((ticks * 1_000_000) / timescale)
    ticks += deltas[i]
  }
  const samples = new Array(sampleCount)
  for (const chunk of chunks) {
    let buf
    try {
      buf = await file.slice(chunk.start, chunk.start + chunk.bytes).arrayBuffer()
    } catch (err) {
      bail(`chunk read failed: ${err?.message || err}`, true)
    }
    if (buf.byteLength !== chunk.bytes) bail('chunk read came back short', true)
    const bytes = new Uint8Array(buf)
    let off = 0
    for (let i = 0; i < chunk.count; i++) {
      const idx = chunk.firstSample + i
      const size = sizes[idx]
      const durationMicros =
        idx + 1 < sampleCount
          ? tsMicros[idx + 1] - tsMicros[idx]
          : Math.round((deltas[idx] * 1_000_000) / timescale)
      samples[idx] = {
        data: bytes.slice(off, off + size), // copy — owns its buffer
        timestampMicros: tsMicros[idx],
        durationMicros,
      }
      off += size
    }
  }
  return samples
}
