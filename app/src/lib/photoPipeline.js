// Photo pipeline — file validation, EXIF read, Canvas downscale.
//
// Used by AddDispatchModal (Item 5 photo path). Stays framework-free
// (no React) so it can also be unit-tested in headless Chromium and
// reused by future surfaces (Aurelia's PostcardComposer, automated
// share-in importers).

import { loadExifTags, exifReaderToRaw, exifReaderToMeta, parseOffsetMinutes } from './exifRead.js'

// Max edge length per the punchlist: 2048px on the longest side, JPEG
// q=0.85. Tuned for a good balance between fidelity (group photos
// printed at 4×6 still look fine) and bytes-on-the-wire (a typical
// iPhone 4032×3024 HEIC compresses ~3-5× under these settings).
const PHOTO_MAX_EDGE = 2048
const PHOTO_JPEG_QUALITY = 0.85

// Acceptable image MIME types. iOS Safari serves HEIC as
// "image/heic" and "image/heif"; the Canvas decoder reads them
// natively on iOS 17+, and on the desktop test runner we treat
// them as supported (the decoder is what would actually fail).
const ALLOWED_PHOTO_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'image/avif',
])

const VIDEO_MIME_RE = /^video\//
const SCREEN_REC_HINTS = /screen.?recording|replaykit/i

// Coarse pre-check before we hand the file to the decoder. Returns
// `{ ok: true }` or `{ ok: false, reason: <designed error code> }`.
// Reason codes map to user-facing copy in AddDispatchModal.
function validatePhotoFile(file) {
  if (!file) return { ok: false, reason: 'missing-file' }
  const mime = file.type || ''
  if (VIDEO_MIME_RE.test(mime) || SCREEN_REC_HINTS.test(file.name || '')) {
    return { ok: false, reason: 'is-video' }
  }
  if (!mime.startsWith('image/')) {
    return { ok: false, reason: 'not-image' }
  }
  if (!ALLOWED_PHOTO_MIME.has(mime)) {
    return { ok: false, reason: 'unsupported-image' }
  }
  // 200 MB ceiling on the *input*. Real-world iPhone HEICs are a few
  // MB; this catches mis-picked drone footage and ProRAW edge cases
  // before we waste cycles on the Canvas pass.
  if (file.size > 200 * 1024 * 1024) {
    return { ok: false, reason: 'too-large-input' }
  }
  return { ok: true }
}

// Pull EXIF metadata. Returns `{ capturedAt?: string ISO,
// lat?: number, lng?: number }`. Anything we don't find is omitted —
// the caller treats missing fields as "fall back to createdAt / stop
// address."
export async function readExif(file) {
  try {
    // EXIF is read off the ORIGINAL file bytes via the shared adapter
    // (exifRead.js → ExifReader, lazy chunk). preparePhotoForUpload
    // calls this in parallel with the canvas downscale, so the canvas
    // is never the EXIF source.
    const tags = await loadExifTags(file)
    const raw = exifReaderToRaw(tags)
    const out = {}
    const dt = raw.DateTimeOriginal || raw.CreateDate
    if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
      out.capturedAt = dt.toISOString()
      // Which candidate won — threaded onto the ref as `atSrc` (Build 1) so a
      // future consumer can tell "the real capture instant" from "a fallback".
      out.capturedAtSource = raw.DateTimeOriginal ? 'exif-original' : 'exif-create'
    }
    if (Number.isFinite(raw.GPSLatitude)) out.lat = raw.GPSLatitude
    if (Number.isFinite(raw.GPSLongitude)) out.lng = raw.GPSLongitude
    // The capture-time OFFSET — e.g. a photo shot at 17:42 local while traveling
    // carries "-04:00" here. Without this, a trip in another timezone imports with
    // capturedAt read as if it were LOCAL-to-home (exifDateToDate parses the wall
    // clock in whatever zone the IMPORTING device is in), silently filing the photo
    // hours off its real time — exactly the bug that hit 87/118 Provincetown photos
    // before this fix. Capturing it here, at import, means it never needs archival
    // repair again (see lib/resourceScan.js, the one-time recovery for photos
    // imported before this line existed).
    const offsetMinutes = parseOffsetMinutes(raw.OffsetTimeOriginal)
    if (Number.isFinite(offsetMinutes)) out.offsetMinutes = offsetMinutes
    // The never-discard metadata sidecar (Build 1) — Make/Model/lens/exposure/
    // GPS altitude+heading/pixel dims/orientation/distinct CreateDate+ModifyDate,
    // bounded + whitelisted. Read from the SAME tags object, so this costs no
    // extra decode.
    const meta = exifReaderToMeta(tags)
    if (meta) out.meta = meta
    return out
  } catch {
    // Non-image files / unreadable EXIF — treat as "no EXIF" and move on.
    return {}
  }
}

// Decode a File into an HTMLImageElement. Wraps the FileReader →
// `new Image()` dance with a single Promise that resolves once the
// pixels are decodable. Rejects with a typed reason code so callers
// can surface the right copy. Exported: resourceScan.js reuses this
// exact decode (HEIC handling + typed errors included) rather than a
// second, subtly different implementation.
export function loadImageBitmap(file) {
  // Prefer createImageBitmap when available — it offloads decode to
  // a worker thread and handles HEIC on iOS 17+ without
  // <img>-element quirks. Falls back to <img>.decode() when not
  // available (older Safari).
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch((err) => {
      const msg = err?.message || String(err)
      const code = /heic|heif/i.test(msg) ? 'heic-decode-failed' : 'decode-failed'
      const wrapped = new Error(msg)
      wrapped.code = code
      throw wrapped
    })
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      const e = new Error('image decode failed')
      e.code = 'decode-failed'
      reject(e)
    }
    img.src = url
  })
}

function targetSize(srcW, srcH, maxEdge) {
  const longest = Math.max(srcW, srcH)
  if (longest <= maxEdge) return { w: srcW, h: srcH }
  const scale = maxEdge / longest
  return { w: Math.round(srcW * scale), h: Math.round(srcH * scale) }
}

// Downscale a photo File into a JPEG Blob suitable for upload.
// Returns `{ blob, width, height, originalWidth, originalHeight, mime }`.
// Throws Errors with `.code` set to a designed reason for the caller
// to map to copy (`decode-failed`, `heic-decode-failed`,
// `canvas-encode-failed`, `still-too-large`).
async function downscaleImage(
  file,
  { maxEdge = PHOTO_MAX_EDGE, quality = PHOTO_JPEG_QUALITY, maxOutputBytes } = {}
) {
  const bitmap = await loadImageBitmap(file)
  const srcW = bitmap.width || bitmap.naturalWidth
  const srcH = bitmap.height || bitmap.naturalHeight
  const { w, h } = targetSize(srcW, srcH, maxEdge)

  const canvas =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const e = new Error('2D context unavailable')
    e.code = 'canvas-encode-failed'
    throw e
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)

  let blob
  try {
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  } catch (err) {
    const e = new Error(err?.message || 'canvas encode failed')
    e.code = 'canvas-encode-failed'
    throw e
  }
  if (!blob) {
    const e = new Error('canvas produced no blob')
    e.code = 'canvas-encode-failed'
    throw e
  }
  if (typeof maxOutputBytes === 'number' && blob.size > maxOutputBytes) {
    const e = new Error(`output ${blob.size} > ${maxOutputBytes}`)
    e.code = 'still-too-large'
    e.size = blob.size
    throw e
  }
  return {
    blob,
    mime: blob.type || 'image/jpeg',
    width: w,
    height: h,
    originalWidth: srcW,
    originalHeight: srcH,
  }
}

function canvasToBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type, quality })
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      type,
      quality
    )
  })
}

// One-shot pipeline: validate → EXIF → downscale. Returns everything
// AddDispatchModal needs to write a memory + queue the upload, or
// throws an Error with `.code` set to one of the designed reasons.
export async function preparePhotoForUpload(file, opts) {
  const validation = validatePhotoFile(file)
  if (!validation.ok) {
    const e = new Error(validation.reason)
    e.code = validation.reason
    throw e
  }
  // EXIF read is parallel with the downscale — neither blocks the
  // other, save the wall-clock seconds.
  const [exif, downscaled] = await Promise.all([
    readExif(file),
    downscaleImage(file, opts),
  ])
  return { ...downscaled, exif }
}
