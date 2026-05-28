// Photo backfill — EXIF extraction, trip-range filtering, and the
// pure helpers behind the matching algorithm (see ./photoMatch.js).
//
// Stays framework-free (no React) so the matching logic is
// unit-testable in Node and reusable from any UI surface — the
// triage view, a future laptop-side batch tool, automated tests.
//
// What this module is responsible for:
//   - Reading EXIF from a File and normalizing it to the shape the
//     matcher consumes (capturedAt, lat, lng, orientation, offset).
//   - The trip date-range filter that discards Camera Roll photos
//     outside the trip window.
//   - The pure parser that exifr's output is fed into — split out
//     from the file-reading wrapper so tests can mock EXIF data
//     directly without a real File.

// EXIF tags we ask exifr to extract. Narrower than the default mask
// (which is slow) but wider than photoPipeline.readExif's pick — that
// one is tuned for the M2 dispatch composer and skips
// orientation/offset because the composer doesn't need them.
const EXIF_PICK = [
  'DateTimeOriginal',
  'CreateDate',
  'ModifyDate',
  'OffsetTimeOriginal',
  'GPSLatitude',
  'GPSLongitude',
  'Orientation',
]

// Pure parser. Takes whatever exifr's `parse()` returned (an object,
// undefined, or null) plus the originating file (for lastModified
// fallback) and produces the normalized shape the rest of the backfill
// flow consumes. Split from `readPhotoExif` so tests can feed mock
// data without round-tripping through exifr.
//
// Returns:
//   {
//     capturedAt: ISO string | null,
//     capturedAtSource: 'exif-original' | 'exif-create' | 'exif-modify' | 'file-mtime' | null,
//     offsetMinutes: number | null,   // signed; matches `OffsetTimeOriginal` if present
//     lat: number | null,
//     lng: number | null,
//     orientation: number | null,     // 1-8 per EXIF spec; null when missing
//   }
export function parseExifData(rawData, file) {
  const data = rawData || {}
  const out = {
    capturedAt: null,
    capturedAtSource: null,
    offsetMinutes: null,
    lat: null,
    lng: null,
    orientation: null,
  }

  // Date — try DateTimeOriginal first, then CreateDate, then
  // ModifyDate, then the File's lastModified.
  const candidates = [
    ['exif-original', data.DateTimeOriginal],
    ['exif-create', data.CreateDate],
    ['exif-modify', data.ModifyDate],
  ]
  for (const [source, raw] of candidates) {
    const iso = toIsoString(raw)
    if (iso) {
      out.capturedAt = iso
      out.capturedAtSource = source
      break
    }
  }
  if (!out.capturedAt && file && Number.isFinite(file.lastModified)) {
    const iso = toIsoString(new Date(file.lastModified))
    if (iso) {
      out.capturedAt = iso
      out.capturedAtSource = 'file-mtime'
    }
  }

  // Offset (timezone). `OffsetTimeOriginal` is a string like "-05:00".
  // Convert to signed minutes for downstream math; null if missing or
  // malformed.
  if (typeof data.OffsetTimeOriginal === 'string') {
    const m = data.OffsetTimeOriginal.match(/^([+-])(\d{2}):(\d{2})$/)
    if (m) {
      const sign = m[1] === '-' ? -1 : 1
      const hh = parseInt(m[2], 10)
      const mm = parseInt(m[3], 10)
      if (Number.isFinite(hh) && Number.isFinite(mm)) {
        out.offsetMinutes = sign * (hh * 60 + mm)
      }
    }
  }

  if (Number.isFinite(data.GPSLatitude)) out.lat = data.GPSLatitude
  if (Number.isFinite(data.GPSLongitude)) out.lng = data.GPSLongitude

  if (Number.isFinite(data.Orientation)) out.orientation = data.Orientation

  return out
}

// Coerce assorted shapes exifr may return for a date field into an
// ISO string, or null. Pulled out for testability.
function toIsoString(value) {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  if (typeof value === 'string') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  return null
}

// Read EXIF from a real File and normalize. Returns the same shape as
// parseExifData (above). Failures (corrupt EXIF, no JPEG markers, etc.)
// resolve to an all-null record — the matcher will route the photo to
// the "unmatched" bucket where the user can manually assign it.
export async function readPhotoExif(file) {
  try {
    // Dynamic import keeps exifr (CJS bundle) out of the top-level
    // module graph so the pure helpers above stay importable from
    // Node --test without the named-export complaint.
    const exifr = await import('exifr')
    const parseFn = exifr.parse || exifr.default?.parse || exifr.default
    const raw = await parseFn(file, { pick: EXIF_PICK })
    return parseExifData(raw, file)
  } catch {
    return parseExifData(null, file)
  }
}

// Filter a list of photo records (each carrying at least `capturedAt`)
// to those whose timestamps fall inside the trip's date range.
//
// `tripStartIso` / `tripEndIso` are 'YYYY-MM-DD' strings as stored on
// the trip record (`dateRangeStart` / `dateRangeEnd`). We expand them
// to a [00:00:00.000Z, 23:59:59.999Z] inclusive window. This deliberately
// compares timestamps as UTC wall-clock — exifr returns the EXIF
// wall-clock-as-UTC and trip date strings are also wall-clock, so the
// comparison is consistent without explicit timezone math. The trip
// boundary is wide enough (00:00–23:59) that off-by-a-few-hours from
// timezone drift doesn't push a real trip photo out of range.
//
// `photo.capturedAt === null` photos are excluded — they're handled
// separately by the matcher's "unmatched" bucket and have no place
// in a date-bounded list.
export function filterByTripRange(photos, tripStartIso, tripEndIso) {
  const startMs = parseDayBoundary(tripStartIso, 'start')
  const endMs = parseDayBoundary(tripEndIso, 'end')
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
    return { included: [], excluded: photos.slice(), reason: 'invalid-range' }
  }
  const included = []
  const excluded = []
  for (const p of photos) {
    if (!p || !p.capturedAt) {
      excluded.push(p)
      continue
    }
    const t = Date.parse(p.capturedAt)
    if (!Number.isFinite(t)) {
      excluded.push(p)
      continue
    }
    if (t >= startMs && t <= endMs) included.push(p)
    else excluded.push(p)
  }
  return { included, excluded, reason: null }
}

function parseDayBoundary(isoDate, edge) {
  if (typeof isoDate !== 'string') return NaN
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return NaN
  const suffix = edge === 'end' ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
  const t = Date.parse(`${isoDate}${suffix}`)
  return Number.isFinite(t) ? t : NaN
}

// Combine a trip-day isoDate (e.g. '2026-04-17') with a stop's
// human-readable `time` string (e.g. '11:00 AM', '9:30 AM',
// 'Evening') into a UTC timestamp suitable for window comparisons.
// Returns `{ at: <ms>, loose: <boolean> }`:
//   - at:    epoch ms at the trip day; for loose-time strings like
//            'Evening' we pick a representative hour (see TIME_BUCKETS)
//   - loose: true when the stop time wasn't a real clock time. Loose
//            stops don't anchor GPS+time matches — the matcher
//            downgrades them.
export function parseStopTime(timeStr, dayIsoDate) {
  if (typeof dayIsoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayIsoDate)) {
    return { at: NaN, loose: true }
  }
  const baseMs = Date.parse(`${dayIsoDate}T00:00:00.000Z`)
  if (!Number.isFinite(baseMs)) return { at: NaN, loose: true }

  const trimmed = (timeStr || '').trim()
  if (!trimmed) return { at: baseMs + TIME_BUCKETS.default, loose: true }

  // '11:00 AM', '7:00 PM', '11:30 AM'
  const ampm = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = parseInt(ampm[2], 10)
    const isPm = ampm[3].toUpperCase() === 'PM'
    if (h === 12) h = isPm ? 12 : 0
    else if (isPm) h += 12
    return { at: baseMs + (h * 60 + m) * 60_000, loose: false }
  }
  // '14:00' (24-hour)
  const h24 = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (h24) {
    const h = parseInt(h24[1], 10)
    const m = parseInt(h24[2], 10)
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return { at: baseMs + (h * 60 + m) * 60_000, loose: false }
    }
  }
  const key = trimmed.toLowerCase()
  if (key in TIME_BUCKETS) {
    return { at: baseMs + TIME_BUCKETS[key], loose: true }
  }
  return { at: baseMs + TIME_BUCKETS.default, loose: true }
}

// Representative offsets from midnight UTC for loose-time stop
// labels. Used only to give loose stops a position for sorting and
// for fallback bucketing; they never gate strict GPS+time matches.
const TIME_BUCKETS = {
  default: 12 * 60 * 60_000, // noon
  morning: 9 * 60 * 60_000,
  am: 9 * 60 * 60_000,
  noon: 12 * 60 * 60_000,
  afternoon: 14 * 60 * 60_000,
  evening: 19 * 60 * 60_000,
  pm: 19 * 60 * 60_000,
  night: 21 * 60 * 60_000,
  late: 22 * 60 * 60_000,
  overnight: 22 * 60 * 60_000,
}
