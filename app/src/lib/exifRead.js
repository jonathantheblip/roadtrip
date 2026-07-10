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

// The widest real UTC offset is ±14:00. Anything beyond that (a corrupt exporter
// writing "+99:99") is garbage that must never be additively stamped onto a photo —
// an absurd offset would file it days off its true local wall clock, and being
// additive, it would block the correct offset from ever landing later.
const MAX_OFFSET_MINUTES = 14 * 60

// "-04:00" → -240 ; "+05:30" → 330 ; missing/invalid/out-of-range → null. The one
// shared parser for EXIF's OffsetTimeOriginal/OffsetTime string — both the live
// import path (readExif below) and the re-source scan (resourceScan.js) key off
// this, so a bounds bug or format change only needs fixing once.
export function parseOffsetMinutes(offsetStr) {
  if (typeof offsetStr !== 'string') return null
  const m = offsetStr.trim().match(/^([+-])(\d{2}):(\d{2})$/)
  if (!m) return null
  const hours = parseInt(m[2], 10)
  const minutes = parseInt(m[3], 10)
  if (minutes > 59) return null
  const mins = (m[1] === '-' ? -1 : 1) * (hours * 60 + minutes)
  if (!Number.isFinite(mins) || Math.abs(mins) > MAX_OFFSET_MINUTES) return null
  return mins
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

// ─── The never-discard metadata sidecar (Build 1, FAMILY_TRIPS_VISION §13) ──
//
// Import today keeps ~7 EXIF tags and throws the rest away before the
// downscale/re-encode destroys the original bytes forever. This is the ONE
// bounded, whitelisted extraction of "everything else useful" — Make/Model/
// lens/exposure/GPS altitude+heading/pixel dims/orientation/the CreateDate
// and ModifyDate values distinct from DateTimeOriginal — landing in a small
// `meta` object that rides the ref additively (worker/src/index.js's
// `photoEntry`/`rowToMemory` whitelists + `photoSidecar.js` re-validate
// independently server-side; never trust the client blob).
//
// Apple's Live-Photo/burst pairing id (MakerNote `ContentIdentifier`/
// `MediaGroupUUID`) was investigated and is NOT available here: ExifReader
// has no Apple MakerNote decoder (only Canon/Pentax get one — see
// node_modules/exifreader/src/*-tags.js), so `tags.exif.MakerNote` comes back
// as an opaque raw byte blob ("[Raw maker note data]"), never a named field.
// Getting at it would mean writing a bespoke Apple MakerNote binary-plist
// parser — out of scope per the build plan ("if unavailable without a new
// dependency: note it and move on — do NOT add a dep for it"). `contentId`
// is therefore never populated; `META_KEYS` below omits it entirely rather
// than carrying a field that would always be absent.
//
// BOUNDS, matching the house rule (the unbounded-offset bug shipped TWICE in
// two separate parsers before this): every key is whitelisted; strings are
// capped at META_STRING_MAX; every number must be finite AND fall inside a
// physically-plausible range; a value that fails validation is dropped
// field-by-field — the whole `meta` object is never rejected for one bad key.
export const META_STRING_MAX = 64
const META_STRING_KEYS = new Set(['make', 'model', 'lens'])
const META_DATE_KEYS = new Set(['createdAt', 'modifiedAt'])
// [min, max] inclusive, physically-plausible ranges (not just "finite") —
// e.g. a corrupt/garbage ISO of 9e18 must never ride onto a photo the same
// way a corrupt "+99:99" offset once did.
const META_NUMBER_BOUNDS = {
  focalMm: [0, 2000],
  iso: [0, 500000],
  fnum: [0, 100],
  expMs: [0, 3_600_000], // 1 hour ceiling — real shutter speeds never approach this
  flash: [0, 255], // EXIF Flash is a bitmask/code, 0-255 covers every real value
  altM: [-1000, 9000], // Dead Sea ≈ -430m; Everest ≈ 8849m; margin both ways
  headingDeg: [0, 360],
  w: [1, 20000],
  h: [1, 20000],
  orient: [1, 8], // EXIF Orientation is 1-8 per spec
}
// Order here IS the whitelist — sanitizeMeta only ever reads these keys, so a
// stray/malicious extra key on an object never rides through.
const META_KEYS = [
  'make', 'model', 'lens',
  'focalMm', 'iso', 'fnum', 'expMs', 'flash',
  'altM', 'headingDeg',
  'w', 'h', 'orient',
  'createdAt', 'modifiedAt',
]

// Whitelist + bounds-check an arbitrary candidate object down to the sidecar
// shape. Shared by the client extraction below AND (independently
// duplicated, never imported — separate deployable) by
// worker/src/photoSidecar.js, which re-validates every field server-side
// rather than trusting this function ran, or ran correctly, on the client.
export function sanitizeMeta(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const out = {}
  for (const key of META_KEYS) {
    if (!(key in input)) continue
    const v = input[key]
    if (META_STRING_KEYS.has(key)) {
      if (typeof v === 'string' && v.length > 0 && v.length <= META_STRING_MAX) out[key] = v
    } else if (META_DATE_KEYS.has(key)) {
      if (typeof v === 'string' && v.length <= META_STRING_MAX && Number.isFinite(Date.parse(v))) out[key] = v
    } else if (key in META_NUMBER_BOUNDS) {
      const [lo, hi] = META_NUMBER_BOUNDS[key]
      if (Number.isFinite(v) && v >= lo && v <= hi) out[key] = v
    }
  }
  return Object.keys(out).length ? out : undefined
}

// A [numerator, denominator] EXIF rational → a plain number. ExifReader hands
// these back for FocalLength/FNumber/ExposureTime/GPSImgDirection. Some tags
// (ISOSpeedRatings, Flash, pixel dims, Orientation) are already scalar, so
// this also passes a finite scalar straight through.
function rationalToNumber(value) {
  if (Array.isArray(value) && value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]) && value[1] !== 0) {
    return value[0] / value[1]
  }
  return Number.isFinite(value) ? value : undefined
}

// Full extraction: ExifReader's `expanded` tags → the bounded `meta` sidecar.
// Pure and tolerant of a null/partial `tags`, like `exifReaderToRaw`. Reads
// straight off `tags.exif`/`tags.gps` (not the narrowed `raw` intermediate)
// since the fields here are never carried by `exifReaderToRaw`.
export function exifReaderToMeta(tags) {
  if (!tags) return undefined
  const exif = tags.exif || {}
  const candidate = {}

  if (typeof exif.Make?.description === 'string') candidate.make = exif.Make.description
  if (typeof exif.Model?.description === 'string') candidate.model = exif.Model.description
  if (typeof exif.LensModel?.description === 'string') candidate.lens = exif.LensModel.description

  const focalMm = rationalToNumber(exif.FocalLength?.value)
  if (focalMm !== undefined) candidate.focalMm = focalMm
  const iso = rationalToNumber(exif.ISOSpeedRatings?.value)
  if (iso !== undefined) candidate.iso = iso
  const fnum = rationalToNumber(exif.FNumber?.value)
  if (fnum !== undefined) candidate.fnum = fnum
  const expSeconds = rationalToNumber(exif.ExposureTime?.value)
  if (expSeconds !== undefined) candidate.expMs = expSeconds * 1000
  const flash = rationalToNumber(exif.Flash?.value)
  if (flash !== undefined) candidate.flash = flash

  // Altitude already carries GPSAltitudeRef's sign (ExifReader's composite
  // gps group applies it — see node_modules/exifreader/src/exif-reader.js).
  const altM = rationalToNumber(tags.gps?.Altitude)
  if (altM !== undefined) candidate.altM = altM
  const headingDeg = rationalToNumber(exif.GPSImgDirection?.value)
  if (headingDeg !== undefined) candidate.headingDeg = headingDeg

  const w = rationalToNumber(exif.PixelXDimension?.value)
  if (w !== undefined) candidate.w = w
  const h = rationalToNumber(exif.PixelYDimension?.value)
  if (h !== undefined) candidate.h = h
  const orient = rationalToNumber(exif.Orientation?.value)
  if (orient !== undefined) candidate.orient = orient

  // Distinct from DateTimeOriginal (which becomes `capturedAt` on the ref
  // itself) — CreateDate/ModifyDate as their OWN values, previously read
  // then dropped at ref-build.
  const created = exifDateToDate(exif.DateTimeDigitized?.description)
  if (created instanceof Date && !Number.isNaN(created.getTime())) candidate.createdAt = created.toISOString()
  const modified = exifDateToDate(exif.DateTime?.description)
  if (modified instanceof Date && !Number.isNaN(modified.getTime())) candidate.modifiedAt = modified.toISOString()

  return sanitizeMeta(candidate)
}

// The other three sidecar fields (srcName/srcMod/atSrc) aren't EXIF at all —
// srcName/srcMod come from the File object itself, atSrc from whichever
// capturedAt candidate won (already tracked as `capturedAtSource` in
// photoBackfill.js's parseExifData). Bounded the same way as `meta`.
export const SRC_NAME_MAX = 200
export const ATSRC_VALUES = new Set(['exif-original', 'exif-create', 'exif-modify', 'file-mtime', 'test'])

// Whitelist + bound the full sidecar `{ meta, srcName, srcMod, atSrc }` in one
// call — the single seam every ref-build site (and the gap-fill seam in
// memoryStore.js) spreads onto a ref, so the bounds live in exactly one place
// client-side. Returns only the keys that passed; never throws.
export function sanitizeSidecar(input) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  const meta = sanitizeMeta(input.meta)
  if (meta) out.meta = meta
  if (typeof input.srcName === 'string' && input.srcName.length > 0 && input.srcName.length <= SRC_NAME_MAX) {
    out.srcName = input.srcName
  }
  if (Number.isFinite(input.srcMod) && input.srcMod > 0) out.srcMod = input.srcMod
  if (typeof input.atSrc === 'string' && ATSRC_VALUES.has(input.atSrc)) out.atSrc = input.atSrc
  return out
}
