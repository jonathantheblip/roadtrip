// photoRefs[] merge helper. Pure JS, no React / IDB / fetch — so
// the dedup logic stays Node-testable without pulling the rest of
// the memory pipeline into the import graph. (photoBackfillUpload.js
// itself can't be imported under plain `node --test` — its OTHER imports
// (memAssets, workerSync, uploadQueue, ...) use extensionless specifiers
// Vite resolves but Node's ESM loader doesn't — so the ref-building pieces
// that need a real regression test live here instead, with explicit `.js`
// import extensions throughout.)
//
// Used by the backfill upload path: when re-attaching a photo to a
// metadata-only memory record, we splice the new ref into the
// existing record's photoRefs[] without duplicating an entry the
// record already had.

import { sanitizeSidecar } from './exifRead.js'

// The never-discard sidecar (Build 1) for one triage/import entry — `meta`
// (from the entry's EXIF read), the original filename + mtime, and which
// capturedAt candidate won. Whitelisted + bounded by sanitizeSidecar. Shared
// by every ref-build site in photoBackfillUpload.js so a future field only
// needs adding once.
export function entrySidecar(entry) {
  return sanitizeSidecar({
    meta: entry?.exif?.meta,
    srcName: entry?.file?.name,
    srcMod: entry?.file?.lastModified,
    atSrc: entry?.exif?.capturedAtSource,
  })
}

// Build 2 (§14): the `prov` tag for a NEW ref built straight from real EXIF/
// video-container metadata — 'exif' tier for whichever of gps/off the ref
// actually carries (sparse; a field the ref doesn't have gets no prov key at
// all). Every organic ref-build site attaches this — a fresh import's lat/lng/
// offset are always a real read, never a guess.
function newRefProv({ lat, lng, offsetMinutes }) {
  const prov = {}
  if (Number.isFinite(lat) && Number.isFinite(lng)) prov.gps = 'exif'
  if (Number.isFinite(offsetMinutes)) prov.off = 'exif'
  return Object.keys(prov).length ? { prov } : {}
}

// Pure: build a NEW photo's baseRef (GPS/offset + the Build 1 sidecar) —
// exactly what uploadOrQueueNewPhoto attaches before the Worker push/queue
// attempt. Extracted so BOTH callers that reach it — the bulk importer
// (uploadBackfillPhotos) AND the composer's saveImportedMedia — are provably
// carrying the same fields, without needing the real upload/fetch attempt.
// `Number.isFinite` gates lat/lng/offsetMinutes so an absent value never
// rides as a stamped 0/NaN.
export function buildNewPhotoBaseRef({ entry, mime, capturedAt, lat, lng, offsetMinutes }) {
  return {
    kind: 'photo', mime, capturedAt,
    ...(Number.isFinite(lat) ? { lat } : {}),
    ...(Number.isFinite(lng) ? { lng } : {}),
    ...(Number.isFinite(offsetMinutes) ? { offsetMinutes } : {}),
    ...entrySidecar(entry),
    ...newRefProv({ lat, lng, offsetMinutes }),
  }
}

// Pure: build a NEW video's baseRef — sibling of buildNewPhotoBaseRef. `entry`
// carries `.encoded` (the WebCodecs output) for width/height/durationMs/
// bytes/sound, and `.file`/`.exif` for the sidecar (a video's own File still
// has a real name/mtime even though its `meta` naturally stays absent —
// entrySidecar's own EXIF reader doesn't apply to video containers). Real
// video GPS (the QuickTime ISO6709 atom, Build 1) is ALSO 'exif' provenance —
// same trust tier as photo EXIF, real container metadata either way.
export function buildNewVideoBaseRef({ entry, capturedAt, lat, lng, offsetMinutes }) {
  const enc = entry?.encoded || {}
  return {
    kind: 'video',
    mime: enc.mime || 'video/mp4',
    width: enc.width,
    height: enc.height,
    durationMs: enc.durationMs,
    ...(Number.isFinite(lat) ? { lat } : {}),
    ...(Number.isFinite(lng) ? { lng } : {}),
    ...(Number.isFinite(offsetMinutes) ? { offsetMinutes } : {}),
    bytes: Number.isFinite(enc.blob?.size) ? enc.blob.size : null,
    sound: typeof enc.sound === 'string' ? enc.sound : null,
    capturedAt,
    ...entrySidecar(entry),
    ...newRefProv({ lat, lng, offsetMinutes }),
  }
}

// Pure: build the reattach ref literal (GPS/offset + the Build 1 sidecar)
// exactly as photoBackfillUpload.js's reattach branch does — extracted
// (not re-implemented) so a regression test can prove every field on this
// EXACT literal survives mergeRefIntoExisting below, without needing the
// reattach branch's IDB/canvas pipeline. Guards the bug class commit
// da2e0b7 fixed live: a value computed correctly but silently missing from
// this literal before the merge (that time it was offsetMinutes; Build 1's
// sidecar is the same shape of risk).
export function buildReattachRef({ entry, assetKey, mime, capturedAt, lat, lng, offsetMinutes }) {
  return {
    key: assetKey, storage: 'idb', mime, capturedAt,
    ...(lat != null ? { lat } : {}),
    ...(lng != null ? { lng } : {}),
    ...(offsetMinutes != null ? { offsetMinutes } : {}),
    ...entrySidecar(entry),
    ...newRefProv({ lat, lng, offsetMinutes }),
  }
}

// Append `newRef` to `existing.photoRefs[]`, deduping by `key`.
// Existing refs come first; the legacy `photoRef` field is folded
// into the array (and not duplicated when already present). Null
// entries in the existing array are dropped.
export function mergeRefIntoExisting(existing, newRef) {
  const out = []
  const seen = new Set()
  for (const r of existing?.photoRefs || []) {
    if (!r) continue
    const k = r.key || r.url
    if (k && seen.has(k)) continue
    if (k) seen.add(k)
    out.push(r)
  }
  if (existing?.photoRef && !out.some((r) => sameKey(r, existing.photoRef))) {
    out.push(existing.photoRef)
    const k = existing.photoRef.key || existing.photoRef.url
    if (k) seen.add(k)
  }
  if (newRef) {
    const nk = newRef.key || newRef.url
    if (!nk || !seen.has(nk)) out.push(newRef)
  }
  return out
}

function sameKey(a, b) {
  return (a?.key && b?.key && a.key === b.key) || (a?.url && b?.url && a.url === b.url)
}
