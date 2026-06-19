// Shared IndexedDB asset store for Memory blobs (audio + photo).
// Keyed by an opaque random key referenced from the Memory record's
// audioRef / photoRef. Each kind lives in its own object store so we
// can index / quota-clear them independently.
//
// Photo policy (default-safe pipeline, added 2026-05-24): any call to
// `saveAsset('photo', ...)` that receives a Blob/File-like image input
// runs through `preparePhotoForUpload` automatically — decode, downscale
// to PHOTO_MAX_EDGE on the longest edge, re-encode as JPEG q=0.85.
// Callers who already prepared the bytes (M2 dispatch composer) pass
// `{ raw: true }` to skip the wrapper. This makes the downscale the
// default for every future composer — they have to *opt out* to store
// raw camera-roll bytes, instead of accidentally bypassing the pipeline
// by forgetting to call it. The historical bug where iOS Safari painted
// black tiles for 4032×3024 / 5712×4284 photos (decoded RGBA exceeded
// iOS's per-tab graphics budget) traces directly to that bypass.

import { preparePhotoForUpload } from './photoPipeline'
import { logUploadEvent } from './uploadLog'

const DB_NAME = 'roadtrip-mem-assets'
const DB_VERSION = 1
const STORES = { audio: 'audio', photo: 'photo' }

let dbP = null
function openDb() {
  if (dbP) return dbP
  dbP = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORES.audio)) {
        db.createObjectStore(STORES.audio, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORES.photo)) {
        db.createObjectStore(STORES.photo, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  dbP.catch(() => {
    if (dbP) dbP = null
  })
  return dbP
}

export function makeAssetKey(prefix = 'asset') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// Save an asset blob to IndexedDB. For photo kind the bytes are
// auto-downscaled through the M2 pipeline by default; pass
// `{ raw: true }` to persist the input unchanged (rare — for callers
// that have explicit reasons not to downscale, or that already ran
// the pipeline themselves).
//
// Returns `{ key, mime, prepared }`:
//   - key:      the asset key (same as the one passed in)
//   - mime:     the actual stored mime ('image/jpeg' after pipeline)
//   - prepared: pipeline metadata when downscale ran
//               { width, height, originalWidth, originalHeight, exif },
//               or null when pipeline was skipped/failed/raw
//
// Backwards compatible: existing callers that ignore the return value
// continue to work. Callers that want the EXIF or new dimensions can
// read from `prepared`.
export async function saveAsset(kind, key, source, mime, opts = {}) {
  if (!STORES[kind]) throw new Error(`unknown asset kind: ${kind}`)

  let blob = source
  let prepared = null

  const isImageInput =
    kind === 'photo' &&
    !opts.raw &&
    source &&
    typeof source === 'object' &&
    typeof source.size === 'number' &&
    typeof (source.type || '') === 'string' &&
    (source.type || '').startsWith('image/')

  if (isImageInput) {
    try {
      prepared = await preparePhotoForUpload(source, opts.prepare || {})
      blob = prepared.blob
      mime = prepared.mime
    } catch (err) {
      // Never block a save on pipeline failure — fall through to raw
      // bytes. The dev-mode upload log carries the technical detail
      // so a maintainer can see what happened without re-running.
      logUploadEvent({
        code: err?.code || 'unknown',
        message: err?.message || String(err),
        stack: err?.stack || null,
        fileMeta: {
          name: source.name,
          type: source.type,
          size: source.size,
        },
        context: { phase: 'saveAsset-auto-prepare', kind, key },
      })
      prepared = null
    }
  }

  const finalMime = mime || blob?.type || ''
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const t = db.transaction(STORES[kind], 'readwrite')
    t.objectStore(STORES[kind]).put({
      key,
      blob,
      mime: finalMime,
      savedAt: Date.now(),
    })
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
  return { key, mime: finalMime, prepared }
}

export async function loadAsset(kind, key) {
  if (!STORES[kind] || !key) return null
  const db = await openDb()
  return new Promise((resolve) => {
    const t = db.transaction(STORES[kind])
    const req = t.objectStore(STORES[kind]).get(key)
    req.onsuccess = () => resolve(req.result?.blob || null)
    req.onerror = () => resolve(null)
  })
}

// Delete one asset blob from its store. Used to clean up the local copy of an
// offline-queued photo (or video poster) AFTER the upload queue drains it to
// R2: the ref is rewritten to storage:'r2', so the idb blob saved at enqueue
// time is now an orphan. Best-effort — a missing key, unknown kind, or idb
// failure is a silent no-op (cleanup must never throw and fail a drain).
export async function removeAsset(kind, key) {
  if (!STORES[kind] || !key) return
  let db
  try {
    db = await openDb()
  } catch {
    return
  }
  await new Promise((resolve) => {
    try {
      const t = db.transaction(STORES[kind], 'readwrite')
      t.objectStore(STORES[kind]).delete(key)
      t.oncomplete = () => resolve()
      t.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}
