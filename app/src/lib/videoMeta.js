// Container metadata extraction for video files (MP4 / QuickTime).
//
// iPhone and most cameras write the capture time into the MP4/QT
// container's `mvhd` (movie header) atom as seconds since 1904-01-01
// UTC. Apple devices also embed a Keys metadata atom with
// `com.apple.quicktime.creationdate` as ISO 8601 — when present that
// preserves the device's local timezone offset, which `mvhd` does not.
//
// We try both, preferring the Apple Keys value when found. Bails fast
// and silently if neither is parseable — the caller falls back to the
// upload time.
//
// We locate `moov` by walking the top-level atom chain (reading only each
// box's header, never the multi-MB `mdat` payload), so it works whether moov
// is at the FRONT (fast-start MP4) or the END of the file. The latter is the
// common iPhone layout, which an earlier first-4MB-only scan missed entirely —
// it returned null for any clip >4 MB with moov at the end, so large videos
// imported dateless (and were then dropped as "outside trip dates").

// Seconds between 1904-01-01 UTC (MP4 epoch) and 1970-01-01 UTC (Unix
// epoch). The mvhd atom stamps in MP4 epoch.
const MP4_TO_UNIX_EPOCH_SECONDS = 2_082_844_800

export async function extractVideoCreationDate(file) {
  // Test seam (PROD-INERT): the synthetic-encode path (videoPipeline's
  // __RT_VIDEO_ENCODE_STUB) hands over a fake file with no real mvhd/Keys atom, so
  // honor a capturedAt on that SAME global — otherwise a dateless clip is dropped
  // by the importer's trip-range filter and the headless upload path can't run.
  // Never set in any shipped surface.
  const stub = typeof window !== 'undefined' ? window.__RT_VIDEO_ENCODE_STUB : null
  if (stub && typeof stub.capturedAt === 'string') return stub.capturedAt
  if (!file) return null
  try {
    const moov = await locateTopLevelAtom(file, 'moov')
    if (!moov) return null
    // Read ONLY the moov atom's data (track headers + metadata — KBs to a few
    // MB, never the mdat bulk), then scan it with the same readers as before.
    const buf = await file.slice(moov.dataStart, moov.dataEnd).arrayBuffer()
    const view = new DataView(buf)

    // Apple Keys / Values metadata is the higher-fidelity source — it
    // includes the original timezone, which mvhd discards. Look first.
    const apple = readAppleQuickTimeCreationDate(view, 0, view.byteLength)
    if (apple) return apple

    // Fallback: mvhd creation_time (UTC seconds since 1904).
    const mvhd = findAtom(view, 0, view.byteLength, 'mvhd')
    if (!mvhd) return null
    return parseMvhdCreationDate(view, mvhd.start, mvhd.end)
  } catch {
    return null
  }
}

// Walk the top-level atom chain, reading only each box's 8/16-byte header and
// following its size, until `wantType` is found. Returns the box's DATA range
// (header excluded) as absolute file offsets, or null. Bounded so a malformed
// or zero-size box can't spin forever.
async function locateTopLevelAtom(file, wantType) {
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
    if (type === wantType) return { dataStart: pos + headerLen, dataEnd: pos + boxSize }
    pos += boxSize
  }
  return null
}

// Walk top-level atoms in [start, end) looking for one whose type
// matches `wantType`. Returns the data range of the atom (header
// excluded) or null when not present.
function findAtom(view, start, end, wantType) {
  let pos = start
  while (pos + 8 <= end) {
    const size = view.getUint32(pos)
    const typeStr = readAscii4(view, pos + 4)
    let dataStart = pos + 8
    let dataEnd
    if (size === 1) {
      // 64-bit size in the next 8 bytes (largesize).
      const high = view.getUint32(pos + 8)
      const low = view.getUint32(pos + 12)
      const big = high * 0x100000000 + low
      dataEnd = pos + big
      dataStart = pos + 16
    } else if (size === 0) {
      // Box runs to the end of the container.
      dataEnd = end
    } else {
      dataEnd = pos + size
    }
    if (dataEnd <= pos || dataEnd > end) {
      // Malformed or extends beyond our window — give up cleanly.
      return null
    }
    if (typeStr === wantType) {
      return { start: dataStart, end: dataEnd }
    }
    pos = dataEnd
  }
  return null
}

function readAscii4(view, off) {
  return String.fromCharCode(
    view.getUint8(off),
    view.getUint8(off + 1),
    view.getUint8(off + 2),
    view.getUint8(off + 3)
  )
}

function parseMvhdCreationDate(view, start, end) {
  if (end - start < 16) return null
  const version = view.getUint8(start)
  // 3 bytes flags follow version
  let seconds
  if (version === 1) {
    if (end - start < 28) return null
    const high = view.getUint32(start + 4)
    const low = view.getUint32(start + 8)
    seconds = high * 0x100000000 + low
  } else {
    seconds = view.getUint32(start + 4)
  }
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const unix = seconds - MP4_TO_UNIX_EPOCH_SECONDS
  if (unix <= 0) return null
  const d = new Date(unix * 1000)
  if (Number.isNaN(d.getTime())) return null
  // Sanity: must be after 2000-01-01 and not more than 24h in the
  // future. Cameras with dead clocks default to 2000 or earlier; we'd
  // rather show the upload time than a 1999 date in the album.
  const minMs = Date.UTC(2000, 0, 1)
  if (d.getTime() < minMs) return null
  if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null
  return d.toISOString()
}

// Parse Apple's iTunes-style metadata stored in moov/meta. The string
// "com.apple.quicktime.creationdate" appears in the Keys atom; the
// matching value (an ISO 8601 timestamp) appears in the corresponding
// ilst entry. Rather than fully parsing the keys/values structure
// (versioned, nested, fragile across files), search the byte range for
// the literal key string and then for an ISO-8601-looking value
// payload after it. Cheap and reliable for the iPhone files we care
// about.
function readAppleQuickTimeCreationDate(view, start, end) {
  const meta = findAtom(view, start, end, 'meta')
  if (!meta) return null
  // The Apple `meta` atom usually has a 4-byte version+flags header
  // before its inner atoms. We don't depend on that — the byte scan
  // below works either way.
  const KEY = 'com.apple.quicktime.creationdate'
  const idx = findAsciiSubstring(view, meta.start, meta.end, KEY)
  if (idx < 0) return null
  // After the key, somewhere in the `ilst` atom is the ISO value. Scan
  // forward for the first plausible ISO timestamp (YYYY-MM-DD).
  const scanEnd = Math.min(end, idx + 4096)
  for (let i = idx + KEY.length; i + 10 <= scanEnd; i++) {
    if (looksLikeIsoStart(view, i)) {
      const iso = readIsoLikeString(view, i, scanEnd)
      if (!iso) continue
      const t = Date.parse(iso)
      if (Number.isFinite(t)) {
        const d = new Date(t)
        const minMs = Date.UTC(2000, 0, 1)
        if (d.getTime() < minMs) continue
        if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) continue
        return d.toISOString()
      }
    }
  }
  return null
}

function findAsciiSubstring(view, start, end, needle) {
  const first = needle.charCodeAt(0)
  outer: for (let i = start; i + needle.length <= end; i++) {
    if (view.getUint8(i) !== first) continue
    for (let j = 1; j < needle.length; j++) {
      if (view.getUint8(i + j) !== needle.charCodeAt(j)) continue outer
    }
    return i
  }
  return -1
}

function looksLikeIsoStart(view, off) {
  // YYYY-MM-DD: digit digit digit digit '-' digit digit '-' digit digit
  return (
    isDigit(view, off) &&
    isDigit(view, off + 1) &&
    isDigit(view, off + 2) &&
    isDigit(view, off + 3) &&
    view.getUint8(off + 4) === 0x2d && // '-'
    isDigit(view, off + 5) &&
    isDigit(view, off + 6) &&
    view.getUint8(off + 7) === 0x2d && // '-'
    isDigit(view, off + 8) &&
    isDigit(view, off + 9)
  )
}

function isDigit(view, off) {
  const c = view.getUint8(off)
  return c >= 0x30 && c <= 0x39
}

function readIsoLikeString(view, start, end) {
  // Pull a printable-ASCII run, capped at 32 chars — ISO 8601 with
  // timezone fits comfortably.
  let out = ''
  for (let i = start; i < end && out.length < 32; i++) {
    const c = view.getUint8(i)
    if (c < 0x20 || c > 0x7e) break
    out += String.fromCharCode(c)
  }
  // Must contain a 'T' or be a plain date — both are valid ISO 8601
  // inputs to Date.parse for our purposes.
  if (!/^\d{4}-\d{2}-\d{2}/.test(out)) return null
  return out
}
