// Memory store. localStorage is the canonical local cache; the sync
// Worker (when configured) acts as a write-through mirror via
// lib/workerSync. Local writes are synchronous and offline-tolerant;
// remote pushes fire-and-forget after the local write returns.
//
// Visibility:
//   "shared"  → goes to the family-shared zone (now: localStorage shared key)
//   "private" → author-only, never appears for other travelers
//               (now: localStorage namespaced by traveler id)
//
// Schema (V3 spec §4 — Design-authoritative):
//   { id, stopId, tripId, authorTraveler, visibility, kind,
//     text?, photoExternalURLs?, caption?,
//     audioRef?, durationSeconds?, transcript?, transcriptLang?,
//     transcriptionStatus?,
//     photoRef?, photoRefs?, mood?,
//     reactions?,
//     capturedAt?, createdAt, updatedAt }
// photoRefs is the multi-photo album form (Helen's thread composer);
// photoRef stays as a back-compat mirror of photoRefs[0] for any reader
// that hasn't been updated to handle the array.
//
// Date semantics (memory-album use, post-2026-05-24):
//   capturedAt — when the content actually happened. EXIF for photos,
//   container creation date for videos, or a manual override the album
//   owner sets via the dev-mode lightbox affordance. Source of truth
//   for sort order and the on-tile date label.
//   createdAt  — when the record was first persisted locally (i.e.
//   the upload time). Used as the audit timestamp and the fallback
//   sort key when capturedAt is missing.
//
// Backward compatibility: pre-§4 records have no `kind`. Read paths
// treat missing `kind` as 'text'. New writes always set `kind`.
// Pre-2026-05-24 records have no top-level `capturedAt`; the album's
// flatten pass falls back to the per-photo `photoRef.capturedAt` and
// finally to `createdAt`.

import { maskForViewer, isSurprise } from './surprises.js'

const SHARED_KEY = 'rt_memories_shared_v1'
const PRIVATE_KEY = (traveler) => `rt_memories_private_${traveler}_v1`

function readJson(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota or private mode — surface to caller via thrown error
    throw new Error('Memory write failed')
  }
}

function makeId() {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

// Every memory in local storage (shared zone + the requested traveler's
// private zone). Used by the Settings backfill action to re-push every
// local record to the Worker after a sync layer change.
export function listAllLocalMemories(traveler) {
  const shared = readJson(SHARED_KEY)
  const own = traveler ? readJson(PRIVATE_KEY(traveler)) : []
  return [...shared, ...own]
}

// Read every memory the active traveler is allowed to see for a trip.
// Includes: all shared memories + that traveler's own private ones.
// Surprise masking (the per-viewer transform) is applied LAST so every surface
// that reads through here inherits it: a teaser hidden from `traveler` is
// dropped, a cover is swapped for its stand-in, the author + revealed see the
// real thing, and normal (non-surprise) memories pass through untouched.
export function listMemoriesForTrip(tripId, traveler) {
  const shared = readJson(SHARED_KEY).filter((m) => m.tripId === tripId)
  const own = traveler ? readJson(PRIVATE_KEY(traveler)).filter((m) => m.tripId === tripId) : []
  const all = [...shared, ...own].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  return maskForViewer(all, traveler)
}

// Same, scoped to one stop.
export function listMemoriesForStop(stopId, traveler) {
  const shared = readJson(SHARED_KEY).filter((m) => m.stopId === stopId)
  const own = traveler ? readJson(PRIVATE_KEY(traveler)).filter((m) => m.stopId === stopId) : []
  const all = [...shared, ...own].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  return maskForViewer(all, traveler)
}

// RAW (unmasked) surprise records for a trip — every shared memory that carries
// a masking layer. The Surprises SCREEN is the only caller: it needs to know
// about masked records to render the author's kept cards + the recipient's
// blurred teasers, which is exactly what the masked reads above hide. Normal
// surfaces must never use this — they go through listMemoriesForTrip. Surprises
// always live in the shared zone (a private memory is already author-only).
export function listTripSurpriseRecords(tripId) {
  return readJson(SHARED_KEY).filter((m) => m.tripId === tripId && isSurprise(m))
}

export function saveMemory({
  id,
  tripId,
  stopId,
  authorTraveler,
  visibility,
  kind,
  text,
  caption,
  photoExternalURLs,
  audioRef,
  durationSeconds,
  transcript,
  transcriptLang,
  transcriptionStatus,
  photoRef,
  photoRefs,
  mood,
  reactions,
  capturedAt,
  interstitial,
  // ── Surprise / masking layer (optional). Presence of hideFrom MARKS this
  //    memory a surprise. All preserve-on-undefined so a later content edit
  //    can't strip a memory's surprise status; an explicit hideFrom:null clears
  //    it (un-surprises the memory). ──
  hideFrom,
  reveal,
  conceal,
  cover,
  revealed,
  surprise,
}) {
  const now = new Date().toISOString()
  const key = visibility === 'private' ? PRIVATE_KEY(authorTraveler) : SHARED_KEY

  // Find any existing record across both keys (move-between-zones case)
  const sharedList = readJson(SHARED_KEY)
  const privList = authorTraveler ? readJson(PRIVATE_KEY(authorTraveler)) : []
  const existingShared = id && sharedList.find((m) => m.id === id)
  const existingPriv = id && privList.find((m) => m.id === id)

  // If visibility changed, remove from the other zone first
  if (existingShared && visibility === 'private') {
    writeJson(SHARED_KEY, sharedList.filter((m) => m.id !== id))
  }
  if (existingPriv && visibility === 'shared') {
    writeJson(PRIVATE_KEY(authorTraveler), privList.filter((m) => m.id !== id))
  }

  // Default kind for legacy callers that only pass text. New surfaces
  // always set kind explicitly.
  const hasAnyPhoto =
    photoRef || photoRefs?.length || photoExternalURLs?.length
  const resolvedKind =
    kind || (audioRef ? 'voice' : hasAnyPhoto ? 'photo' : 'text')

  // Mirror photoRefs[0] into photoRef for any reader (e.g. Aurelia's
  // PostcardComposer-saved memories) that still expects the single field.
  const resolvedPhotoRef =
    photoRef || (photoRefs && photoRefs.length > 0 ? photoRefs[0] : undefined)

  // Derive a top-level capturedAt when the caller didn't pass one
  // explicitly. Pick the earliest per-photo ref capturedAt so a
  // multi-photo memory sorts by the moment the first frame happened —
  // matches the lightbox prev/next order the user already sees. Falls
  // through to null when no source has a capture date; the album then
  // renders the upload-time fallback with the '· uploaded' label.
  let resolvedCapturedAt = null
  if (typeof capturedAt === 'string' && capturedAt) {
    resolvedCapturedAt = capturedAt
  } else if (capturedAt === null) {
    resolvedCapturedAt = null
  } else {
    const candidates = [
      resolvedPhotoRef?.capturedAt,
      ...(photoRefs?.map?.((r) => r?.capturedAt) || []),
    ].filter((v) => typeof v === 'string' && v)
    if (candidates.length) {
      candidates.sort()
      resolvedCapturedAt = candidates[0]
    } else {
      // Preserve a previously-set capturedAt on update so we don't
      // erase it when the caller only patches caption or photoRef.
      resolvedCapturedAt =
        existingShared?.capturedAt || existingPriv?.capturedAt || null
    }
  }

  // interstitial ("from A to B" identity, migration 007): an explicit object
  // sets it, explicit null clears it, and undefined PRESERVES whatever was
  // there — so a later caption- or photo-only patch can't silently strip the
  // identity (mirrors the capturedAt preserve just above).
  let resolvedInterstitial
  if (interstitial && typeof interstitial === 'object') {
    resolvedInterstitial = {
      before: interstitial.before ?? null,
      after: interstitial.after ?? null,
    }
  } else if (interstitial === null) {
    resolvedInterstitial = undefined // explicit clear
  } else {
    resolvedInterstitial =
      existingShared?.interstitial || existingPriv?.interstitial || undefined
  }

  // Masking layer. Explicit hideFrom array → (re)build the surprise; explicit
  // null → clear it; undefined → preserve whatever the existing record carried
  // (so a caption/photo-only patch can't silently strip the secret — same
  // preserve rationale as capturedAt / interstitial above).
  const existingMaskSource = existingShared || existingPriv
  let mask
  if (Array.isArray(hideFrom)) {
    mask = {
      hideFrom,
      reveal:
        reveal && typeof reveal === 'object'
          ? { type: reveal.type || 'manual', at: reveal.at ?? '' }
          : { type: 'manual', at: '' },
      conceal: conceal === 'cover' ? 'cover' : 'teaser',
      cover:
        conceal === 'cover' && cover && typeof cover === 'object'
          ? {
              icon: cover.icon || '📍',
              title: cover.title || '',
              loc: cover.loc || '',
              time: cover.time || '',
              weather: cover.weather || '',
              packing: cover.packing || '',
            }
          : undefined,
      // New surprises start hidden; preserve a previously-set reveal stamp on edit.
      revealed: revealed ?? existingMaskSource?.revealed ?? undefined,
      surprise:
        surprise && typeof surprise === 'object'
          ? {
              what: surprise.what || 'A memory',
              icon: surprise.icon || '🎁',
              title: surprise.title || '',
              detail: surprise.detail || '',
              tint: surprise.tint || '#5C5048',
            }
          : existingMaskSource?.surprise,
    }
  } else if (hideFrom === null) {
    mask = {
      hideFrom: undefined,
      reveal: undefined,
      conceal: undefined,
      cover: undefined,
      revealed: undefined,
      surprise: undefined,
    }
  } else {
    mask = existingMaskSource
      ? {
          hideFrom: existingMaskSource.hideFrom,
          reveal: existingMaskSource.reveal,
          conceal: existingMaskSource.conceal,
          cover: existingMaskSource.cover,
          revealed: existingMaskSource.revealed,
          surprise: existingMaskSource.surprise,
        }
      : {
          hideFrom: undefined,
          reveal: undefined,
          conceal: undefined,
          cover: undefined,
          revealed: undefined,
          surprise: undefined,
        }
  }

  const record = {
    id: id || makeId(),
    tripId,
    stopId,
    authorTraveler,
    visibility,
    kind: resolvedKind,
    text,
    caption,
    photoExternalURLs: photoExternalURLs || [],
    audioRef,
    durationSeconds,
    transcript,
    transcriptLang,
    transcriptionStatus,
    photoRef: resolvedPhotoRef,
    photoRefs: photoRefs && photoRefs.length > 0 ? photoRefs : undefined,
    mood,
    reactions: reactions || [],
    capturedAt: resolvedCapturedAt,
    interstitial: resolvedInterstitial,
    // Surprise / masking layer (hideFrom, reveal, conceal, cover, revealed,
    // surprise) — spread flat so the read-side transform can see m.hideFrom.
    ...mask,
    createdAt: existingShared?.createdAt || existingPriv?.createdAt || now,
    updatedAt: now,
  }

  // Re-read the target key (in case it was the one we just rewrote)
  const target = readJson(key)
  const idx = target.findIndex((m) => m.id === record.id)
  if (idx >= 0) target[idx] = record
  else target.push(record)
  writeJson(key, target)
  // Mirror to the sync Worker (fire-and-forget). Bails fast if not
  // configured / network down. Imported lazily so the sync module only
  // loads after the first real sync need.
  scheduleMirror({ type: 'save', record })
  return record
}

export function deleteMemory(record) {
  const key =
    record.visibility === 'private' ? PRIVATE_KEY(record.authorTraveler) : SHARED_KEY
  const list = readJson(key).filter((m) => m.id !== record.id)
  writeJson(key, list)
  scheduleMirror({ type: 'delete', record })
}

// Tiny serial queue so a fast burst of saves doesn't fan out to N
// parallel Worker calls. We don't await — UI stays instant.
let mirrorChain = Promise.resolve()
function scheduleMirror(op) {
  mirrorChain = mirrorChain
    .then(async () => {
      try {
        const sync = await import('./workerSync.js')
        if (op.type === 'save') await sync.pushMemory(op.record)
        else if (op.type === 'delete') await sync.deleteRemote(op.record)
      } catch {
        /* offline / unconfigured / Worker error — local stays canonical */
      }
    })
    .catch(() => {})
}

// Merge a batch of remote memories into the local store. Last-write-
// wins by updatedAt. Records with `deletedAt` set are tombstones — the
// Worker soft-deletes so cross-device pulls can learn about deletions;
// we honor the tombstone by removing the record from local instead of
// upserting it.
export function mergeFromRemote(remoteRecords) {
  if (!Array.isArray(remoteRecords) || !remoteRecords.length) return 0
  const sharedList = readJson(SHARED_KEY)
  const sharedMap = new Map(sharedList.map((m) => [m.id, m]))
  const privateBuckets = new Map()
  function getPrivateBucket(author) {
    if (!privateBuckets.has(author)) {
      privateBuckets.set(author, new Map(readJson(PRIVATE_KEY(author)).map((m) => [m.id, m])))
    }
    return privateBuckets.get(author)
  }
  let added = 0
  for (const r of remoteRecords) {
    if (!r?.id) continue
    if (r.deletedAt) {
      // Tombstone — drop from whichever zone it lived in. We don't know
      // for certain whether the local copy was shared or private (the
      // server-side visibility could have changed since the local copy
      // was written), so check both.
      if (sharedMap.delete(r.id)) added += 1
      const author = r.authorTraveler
      if (author) {
        const bucket = getPrivateBucket(author)
        if (bucket.delete(r.id)) added += 1
      }
      continue
    }
    if (r.visibility === 'private') {
      const author = r.authorTraveler
      if (!author) continue
      const bucket = getPrivateBucket(author)
      const existing = bucket.get(r.id)
      if (shouldTakeRemote(r, existing)) {
        bucket.set(r.id, existing ? preserveLocalPhotoMeta(r, existing) : r)
        added += 1
      }
    } else {
      const existing = sharedMap.get(r.id)
      if (shouldTakeRemote(r, existing)) {
        sharedMap.set(r.id, existing ? preserveLocalPhotoMeta(r, existing) : r)
        added += 1
      }
    }
  }
  writeJson(SHARED_KEY, Array.from(sharedMap.values()))
  for (const [author, bucket] of privateBuckets) {
    writeJson(PRIVATE_KEY(author), Array.from(bucket.values()))
  }
  return added
}

// Decide whether to overwrite a local record with the remote copy.
// Last-write-wins by `updatedAt`, plus a "storage upgrade" exception:
// when the remote has an R2-backed asset (renderable on any device via
// URL) and the local copy still has CloudKit-era refs (`storage:'cloudkit'`
// with an Apple-CDN URL we can no longer auth against), take the remote
// regardless of timestamps. Without this, a device that synced from
// CloudKit yesterday keeps the unrenderable refs forever after the
// switch to the Worker, even though Pull says "0 merged."
function shouldTakeRemote(remote, local) {
  if (!local) return true
  if (remote.updatedAt && remote.updatedAt > local.updatedAt) return true
  if (hasR2Asset(remote) && !hasUsableLocalAsset(local)) return true
  return false
}

// Merge-guard. When a remote record wins last-write-wins and REPLACES the
// local copy, the server may carry less per-photo EXIF metadata than the
// device that captured the photo. LEG-C persists lat/lng/capturedAt for album
// photoRefs[] (photo_r2_keys_json), but the single-photo dispatch path stores
// its ref in scalar columns the worker keeps no coords on — so a pull could
// erase the capturing device's own GPS + capture date. Carry the local
// enrichment forward onto the matching remote ref, filling ONLY the gaps the
// remote actually lacks (the remote still wins for every field it carries).
// Match by INDEX, not key: an R2 upload rewrites ref keys, but ref order is
// stable through push → store → rowToMemory.
function preserveLocalPhotoMeta(remote, local) {
  if (!remote || !local) return remote
  const fill = (rRef, lRef) => {
    if (!rRef || !lRef) return rRef
    if (rRef.lat == null && Number.isFinite(lRef.lat)) rRef.lat = lRef.lat
    if (rRef.lng == null && Number.isFinite(lRef.lng)) rRef.lng = lRef.lng
    if (!rRef.capturedAt && typeof lRef.capturedAt === 'string' && lRef.capturedAt) {
      rRef.capturedAt = lRef.capturedAt
    }
    // Video poster: a stale/rolling-out remote may not carry posterKey/posterUrl
    // yet — keep the capturing device's own so its synced video keeps rendering
    // a still instead of reverting to a fallback icon. (Same merge-guard
    // rationale as lat/lng/capturedAt above.)
    if (!rRef.posterKey && typeof lRef.posterKey === 'string' && lRef.posterKey) {
      rRef.posterKey = lRef.posterKey
    }
    if (!rRef.posterUrl && typeof lRef.posterUrl === 'string' && lRef.posterUrl) {
      rRef.posterUrl = lRef.posterUrl
    }
    return rRef
  }
  if (remote.photoRef && local.photoRef) {
    remote.photoRef = fill({ ...remote.photoRef }, local.photoRef)
  }
  if (
    Array.isArray(remote.photoRefs) &&
    Array.isArray(local.photoRefs) &&
    remote.photoRefs.length === local.photoRefs.length
  ) {
    remote.photoRefs = remote.photoRefs.map((rRef, i) => fill({ ...rRef }, local.photoRefs[i]))
  }
  // Preserve a locally-set "from A to B" interstitial identity (007) when the
  // incoming record lacks one — same merge-guard rationale as the per-photo
  // EXIF above. Once the 007 worker deploy lands, the remote carries it; this
  // guards the rollout window (and any stale pre-007 remote) so a pull can't
  // erase the capturing device's own classification.
  if (remote.interstitial == null && local.interstitial) {
    remote.interstitial = local.interstitial
  }
  return remote
}

function hasR2Asset(m) {
  if (m.photoRef?.storage === 'r2') return true
  if (m.audioRef?.storage === 'r2') return true
  if (m.photoRefs?.some?.((p) => p?.storage === 'r2')) return true
  return false
}

function hasUsableLocalAsset(m) {
  // 'idb' and 'r2' are the two storage flavors the current renderers
  // can actually display. 'cloudkit' was the legacy flavor; refs of
  // that flavor are dead post-migration.
  const usable = (s) => s === 'r2' || s === 'idb'
  if (usable(m.photoRef?.storage)) return true
  if (usable(m.audioRef?.storage)) return true
  if (m.photoRefs?.some?.((p) => usable(p?.storage))) return true
  return false
}

// Dev-mode override: set or clear the album's source-of-truth capture
// date on a single memory. Used by the lightbox affordance Helen's
// album owner reaches only when `rt_dev_mode === 'true'`. Pass `null`
// to clear the override (the album then falls back to per-photo EXIF
// or the upload time). Re-mirrors to the Worker so other devices pick
// up the same chronology.
export function updateMemoryCapturedAt(memoryId, isoOrNull) {
  if (!memoryId) return null
  const next =
    isoOrNull === null
      ? null
      : typeof isoOrNull === 'string' && isoOrNull
        ? isoOrNull
        : null
  const tryUpdateIn = (key) => {
    const list = readJson(key)
    const idx = list.findIndex((m) => m.id === memoryId)
    if (idx < 0) return null
    const now = new Date().toISOString()
    const patched = { ...list[idx], capturedAt: next, updatedAt: now }
    list[idx] = patched
    writeJson(key, list)
    scheduleMirror({ type: 'save', record: patched })
    return patched
  }
  const inShared = tryUpdateIn(SHARED_KEY)
  if (inShared) return inShared
  // Try every traveler's private bucket — Aurelia's postcards live here.
  for (const traveler of ['jonathan', 'helen', 'aurelia', 'rafa']) {
    const result = tryUpdateIn(PRIVATE_KEY(traveler))
    if (result) return result
  }
  return null
}

// Manual reveal: flip a surprise from hidden → visible for its hideFrom list.
// Stamps `revealed` so the read-side transform stops masking it (everyone sees
// the real row from now on). Surprises live in the shared zone. Re-mirrors so
// other devices learn the reveal.
export function revealSurprise(memoryId) {
  if (!memoryId) return null
  const list = readJson(SHARED_KEY)
  const idx = list.findIndex((m) => m.id === memoryId)
  if (idx < 0) return null
  const now = new Date().toISOString()
  const patched = { ...list[idx], revealed: now, updatedAt: now }
  list[idx] = patched
  writeJson(SHARED_KEY, list)
  scheduleMirror({ type: 'save', record: patched })
  return patched
}

// One-shot backfill: walk every local memory and synthesize a top-level
// `capturedAt` from the earliest *real* `photoRef.capturedAt` we find.
//
// Heuristic — what counts as "real" capture vs. a legacy "now stamp":
// up through 2026-05-24 the dispatch modal stamped `ref.capturedAt =
// new Date()` even when no EXIF was found, which means many local
// records carry a ref.capturedAt that's nearly identical to createdAt.
// We skip promotion when ref.capturedAt is within 60 s of (or after)
// createdAt — those almost certainly came from the legacy stamp and
// promoting them would silently strip the '· uploaded' label from
// memories that genuinely have no capture date.
//
// Runs idempotently — memories that already have `capturedAt` set, or
// whose refs carry no plausible capture date, are skipped. Returns
// the number of records actually patched so callers can log it. Safe
// to call at module load; cheap enough that we don't gate behind a
// version flag.
const BACKFILL_MIN_GAP_MS = 60_000

export function backfillCapturedAt() {
  let patched = 0
  for (const key of [
    SHARED_KEY,
    PRIVATE_KEY('jonathan'),
    PRIVATE_KEY('helen'),
    PRIVATE_KEY('aurelia'),
    PRIVATE_KEY('rafa'),
  ]) {
    const list = readJson(key)
    if (!list.length) continue
    let mutated = false
    for (const m of list) {
      if (typeof m.capturedAt === 'string' && m.capturedAt) continue
      const createdMs = Date.parse(m.createdAt || '') || null
      const refDates = []
      if (m.photoRef?.capturedAt) refDates.push(m.photoRef.capturedAt)
      if (Array.isArray(m.photoRefs)) {
        for (const r of m.photoRefs) {
          if (r?.capturedAt) refDates.push(r.capturedAt)
        }
      }
      if (!refDates.length) continue
      // Filter out refs that look like the legacy "now stamp" — they
      // sit at or very near createdAt, with no signal of being a real
      // capture moment.
      const real = refDates.filter((iso) => {
        if (!createdMs) return true
        const t = Date.parse(iso)
        if (!Number.isFinite(t)) return false
        return createdMs - t > BACKFILL_MIN_GAP_MS
      })
      if (!real.length) continue
      real.sort()
      m.capturedAt = real[0]
      mutated = true
      patched += 1
    }
    if (mutated) writeJson(key, list)
  }
  return patched
}
