// EXIF library adapter. The single place the app talks to its EXIF
// library, so both readers (photoPipeline.readExif for the dispatch
// composer, photoBackfill.readPhotoExif for the backfill matcher) share
// identical extraction and a future library swap touches one file.
//
// We use ExifReader (actively maintained; reads HEIC + JPEG natively).
// It replaced exifr, which is abandoned (2021) and could not parse
// iPhone HEIC at all — its HEIF format-detection rejects any ftyp box
// longer than 50 bytes, which every modern iPhone HEIC exceeds, so HEIC
// photos lost BOTH GPS and the capture date. ExifReader reads them.
//
// ExifReader's output shape differs from exifr's, so this module
// normalizes it back to the small exifr-shaped intermediate the rest of
// the pipeline already consumes (`parseExifData` in photoBackfill.js):
//   { DateTimeOriginal?: Date, CreateDate?: Date, ModifyDate?: Date,
//     OffsetTimeOriginal?: string, GPSLatitude?: number,
//     GPSLongitude?: number, Orientation?: number }
// Absent fields are omitted (never null) so downstream date/GPS
// derivation falls back instead of short-circuiting.

// Load the original file's EXIF tags via ExifReader's `expanded` shape
// (groups: file / exif / gps / ...). Dynamic import keeps ExifReader in
// its own lazy chunk out of the main bundle, exactly as the exifr import
// was. ExifReader.load wants bytes (ArrayBuffer/Buffer), not a File, so
// we read the original File's bytes here — in parallel with the canvas
// downscale at the call site, so the canvas is never the EXIF source.
export async function loadExifTags(file) {
  const mod = await import('exifreader')
  const ExifReader = mod.default ?? mod
  let input = file
  if (file && typeof file.arrayBuffer === 'function') {
    // Browser File/Blob → ArrayBuffer. (Node Buffers are passed straight
    // through; ExifReader accepts them.)
    input = await file.arrayBuffer()
  }
  return ExifReader.load(input, { expanded: true })
}

// EXIF stores dates as "YYYY:MM:DD HH:MM:SS" (colon-separated date part),
// which `new Date()` rejects as Invalid Date. Parse the components
// explicitly into a LOCAL-time Date — matching the behavior of exifr's
// reviver, so the downstream capturedAt (Date → toISOString) is
// unchanged by the swap. Returns undefined for missing/unparseable input.
export function exifDateToDate(value) {
  if (typeof value !== 'string' || !value) return undefined
  const m = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) {
    // Already-normalized / ISO-ish strings: let Date try.
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? undefined : d
  }
  const [, y, mo, d, h, mi, se] = m
  const dt = new Date(+y, +mo - 1, +d, +h, +mi, +se)
  return Number.isNaN(dt.getTime()) ? undefined : dt
}

// Map ExifReader's `expanded` tags onto the exifr-shaped intermediate
// that parseExifData (and photoPipeline.readExif) consume. Pure so it can
// be unit-tested without real bytes. Tolerant of a null/partial `tags`.
export function exifReaderToRaw(tags) {
  const raw = {}
  if (!tags) return raw
  const exif = tags.exif || {}

  // Dates — ExifReader names: DateTimeOriginal (same), DateTimeDigitized
  // (= exifr CreateDate), DateTime (= exifr ModifyDate). All come as
  // `.description` strings in EXIF colon format.
  const original = exifDateToDate(exif.DateTimeOriginal?.description)
  const digitized = exifDateToDate(exif.DateTimeDigitized?.description)
  const modified = exifDateToDate(exif.DateTime?.description)
  if (original) raw.DateTimeOriginal = original
  if (digitized) raw.CreateDate = digitized
  if (modified) raw.ModifyDate = modified

  // Timezone offset string, e.g. "-04:00".
  const offset = exif.OffsetTimeOriginal?.description ?? exif.OffsetTimeOriginal?.value?.[0]
  if (typeof offset === 'string') raw.OffsetTimeOriginal = offset

  // GPS — the `gps` group carries already-signed decimal degrees
  // (negative for S/W), the exact contract photoMatch needs. No DMS math
  // or sign handling on our side (the bug exifr left us with).
  const lat = tags.gps?.Latitude
  const lng = tags.gps?.Longitude
  if (Number.isFinite(lat)) raw.GPSLatitude = lat
  if (Number.isFinite(lng)) raw.GPSLongitude = lng

  // Orientation 1-8 — numeric `.value` (`.description` is a label).
  const orientation = exif.Orientation?.value
  if (Number.isFinite(orientation)) raw.Orientation = orientation

  return raw
}
