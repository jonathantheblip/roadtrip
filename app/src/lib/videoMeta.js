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

// Returns { capturedAt: ISO-UTC string|null, offsetMinutes: number|null,
// lat?: number, lng?: number } or null (only when there is truly nothing at
// all — no date AND no location). `offsetMinutes` is the clip's LOCAL
// UTC offset (from Apple's creationdate, e.g. "-0400"), which the matcher
// needs to file by local wall-clock time — the mvhd fallback CANNOT recover
// it (Apple writes local-as-UTC there), so it returns null offset and the
// matcher degrades to UTC for that clip. `lat`/`lng` come from Apple's
// `com.apple.quicktime.location.ISO6709` key in the SAME Keys/Values atom
// (Build 1) — present whenever the clip's recording device had Location
// Services on; a video with no location key simply omits lat/lng, exactly
// like a photo with no GPS EXIF. `capturedAt` can be null WITH lat/lng
// present — a camera with a dead/reset clock but a good GPS fix still
// hands back its coordinates rather than losing them (both mvhd-missing and
// mvhd-rejected are treated identically here).
export async function extractVideoCreationDate(file) {
  // Test seam (PROD-INERT): the synthetic-encode path (videoPipeline's
  // __RT_VIDEO_ENCODE_STUB) hands over a fake file with no real mvhd/Keys atom, so
  // honor a capturedAt on that SAME global — otherwise a dateless clip is dropped
  // by the importer's trip-range filter and the headless upload path can't run.
  // Never set in any shipped surface.
  const stub = typeof window !== 'undefined' ? window.__RT_VIDEO_ENCODE_STUB : null
  if (stub && typeof stub.capturedAt === 'string') {
    return {
      capturedAt: stub.capturedAt,
      offsetMinutes: Number.isFinite(stub.offsetMinutes) ? stub.offsetMinutes : null,
      ...(Number.isFinite(stub.lat) && Number.isFinite(stub.lng) ? { lat: stub.lat, lng: stub.lng } : {}),
    }
  }
  if (!file) return null
  try {
    const moov = await locateTopLevelAtom(file, 'moov')
    if (!moov) return null
    // Read ONLY the moov atom's data (track headers + metadata — KBs to a few
    // MB, never the mdat bulk), then scan it with the same readers as before.
    const buf = await file.slice(moov.dataStart, moov.dataEnd).arrayBuffer()
    const view = new DataView(buf)

    // The clip's GPS, if the Keys/Values atom carries it — independent of
    // which date source wins below, so a video with mvhd-only dates (no
    // Apple Keys date) can still carry location if the key is present.
    const location = readAppleQuickTimeLocation(view, 0, view.byteLength)
    const withLocation = (out) => (location ? { ...out, lat: location.lat, lng: location.lng } : out)

    // Apple Keys / Values metadata is the higher-fidelity source — it
    // includes the original timezone, which mvhd discards. Look first.
    const apple = readAppleQuickTimeCreationDate(view, 0, view.byteLength)
    if (apple) return withLocation(apple)

    // Fallback: mvhd creation_time (UTC seconds since 1904) — no offset available.
    const mvhd = findAtom(view, 0, view.byteLength, 'mvhd')
    const iso = mvhd ? parseMvhdCreationDate(view, mvhd.start, mvhd.end) : null
    if (iso) return withLocation({ capturedAt: iso, offsetMinutes: null })
    // No valid date from EITHER source (missing mvhd atom, OR a dead-clock
    // mvhd parseMvhdCreationDate rejected: seconds<=0, pre-2000, >24h future).
    // `location` was computed above independently of which date source wins
    // (this function's own documented invariant) — a camera with a corrupted
    // clock but a good GPS fix must still hand back its coordinates rather
    // than losing them to this null short-circuit. Only truly empty (no date
    // AND no location) returns null.
    return location ? { capturedAt: null, offsetMinutes: null, lat: location.lat, lng: location.lng } : null
  } catch {
    return null
  }
}

// Parse a trailing UTC offset from an ISO 8601 string → signed minutes, or null.
// Handles "-0400", "-04:00", and "Z"/"+00:00" (→ 0). Used ONLY to recover the
// clip's local offset; the capturedAt itself stays the absolute UTC instant.
function offsetMinutesFromIso(iso) {
  if (typeof iso !== 'string') return null
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(iso)
  if (m) {
    const sign = m[1] === '-' ? -1 : 1
    return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10))
  }
  if (/[zZ]$/.test(iso)) return 0
  return null
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
        // The raw ISO carries the device's LOCAL offset (e.g. "-0400") — capture
        // it before Date.parse collapses everything to the absolute instant, so
        // the matcher can file the clip by its local wall clock.
        return { capturedAt: d.toISOString(), offsetMinutes: offsetMinutesFromIso(iso) }
      }
    }
  }
  return null
}

// Bounded ISO 6709 parser: "+41.32245-072.09434+011.776/" → { lat, lng }.
// STRICT and bounded, per the build plan — this is the single highest-value
// line of Build 1, so it must never throw, never crash import, and never
// stamp a garbage coordinate: lat must parse to a finite number in
// [-90, 90], lng to a finite number in [-180, 180]; the input string is
// capped at 32 chars (a real ISO 6709 string, with altitude, is ~27 chars —
// anything longer is not a real one); anything that doesn't match the shape
// (missing sign, malformed number, truncated) is rejected and dropped —
// never guessed at, never partially accepted.
const ISO6709_RE = /^([+-]\d{1,2}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)(?:[+-]\d+(?:\.\d+)?)?\/?$/
const ISO6709_MAX_LEN = 32

export function parseIso6709(str) {
  if (typeof str !== 'string') return null
  const s = str.trim()
  if (s.length === 0 || s.length > ISO6709_MAX_LEN) return null
  const m = ISO6709_RE.exec(s)
  if (!m) return null
  const lat = parseFloat(m[1])
  const lng = parseFloat(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90) return null
  if (lng < -180 || lng > 180) return null
  return { lat, lng }
}

// Parse Apple's `com.apple.quicktime.location.ISO6709` Keys/Values entry —
// same moov/meta structure as `com.apple.quicktime.creationdate` above, so
// this mirrors readAppleQuickTimeCreationDate's byte-scan approach rather
// than fully parsing the keys/values structure.
function readAppleQuickTimeLocation(view, start, end) {
  const meta = findAtom(view, start, end, 'meta')
  if (!meta) return null
  const KEY = 'com.apple.quicktime.location.ISO6709'
  const idx = findAsciiSubstring(view, meta.start, meta.end, KEY)
  if (idx < 0) return null
  const scanEnd = Math.min(end, idx + 4096)
  for (let i = idx + KEY.length; i < scanEnd; i++) {
    if (!looksLikeIso6709Start(view, i, scanEnd)) continue
    const raw = readAsciiRun(view, i, scanEnd, ISO6709_MAX_LEN)
    const parsed = parseIso6709(raw)
    if (parsed) return parsed
    // A false start (a +/- digit run that isn't really the location value,
    // e.g. inside an unrelated nearby field) — keep scanning; bounded by
    // scanEnd above so this can't spin.
  }
  return null
}

// '+'/'-' followed by a digit — the start of a signed ISO 6709 latitude.
function looksLikeIso6709Start(view, off, end) {
  if (off + 2 > end) return false
  const c0 = view.getUint8(off)
  if (c0 !== 0x2b && c0 !== 0x2d) return false // '+' or '-'
  return isDigit(view, off + 1)
}

// Pull a printable-ASCII run, capped at `maxLen` chars.
function readAsciiRun(view, start, end, maxLen) {
  let out = ''
  for (let i = start; i < end && out.length < maxLen; i++) {
    const c = view.getUint8(i)
    if (c < 0x20 || c > 0x7e) break
    out += String.fromCharCode(c)
  }
  return out
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
