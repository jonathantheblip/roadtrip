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
import { markDeleted, clearDeleted, isDeleted } from './deleteTombstones.js'
import { mergeSaveOverFresh, moveReapply, readMemoryPushResult, sameStopId } from './memorySyncFlow.js'
import * as memoryQueue from './memorySyncQueue.js'
import { sanitizeSidecar } from './exifRead.js'

const SHARED_KEY = 'rt_memories_shared_v1'
const PRIVATE_KEY = (traveler) => `rt_memories_private_${traveler}_v1`
const ALL_TRAVELERS = ['jonathan', 'helen', 'aurelia', 'rafa']

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
  // Where to FILE this memory when it doesn't exist locally yet — and ONLY
  // then. The upload-queue drains pass their enqueue-time stop here: for a
  // memory whose local record was lost (storage cleared between enqueue and
  // drain) the first save must still land at the stop chosen at import; for a
  // memory that exists, the enqueue-time stop is HOURS-stale by definition and
  // must never override the live filing (the stuck-video revert class).
  stopIdIfNew,
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
  pieces, // E4 — ordered heterogeneous moment pieces (photo/video/voice/note)
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

  // stopId: an explicit value (or explicit null — a deliberate unfiled /
  // interstitial save) sets it; undefined PRESERVES the existing filing — the
  // same contract capturedAt/interstitial/mask already have. A memory's stop
  // filing changes only through a deliberate stop write (updateMemoryStop, or
  // an explicit stopId here), never as a side effect of a content re-save that
  // simply didn't think about filing — the outbox drain re-saving hours later
  // must not carry its enqueue-time stop over a move that landed in between.
  let resolvedStopId
  if (stopId !== undefined) {
    resolvedStopId = stopId
  } else if (existingShared || existingPriv) {
    resolvedStopId = (existingShared || existingPriv).stopId
  } else {
    resolvedStopId = stopIdIfNew !== undefined ? stopIdIfNew : undefined
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

  // E4 — the ordered heterogeneous pieces (photos + voice + note slips) of a
  // composed moment. Explicit array sets it; null clears; undefined PRESERVES
  // (a later caption-only re-save can't strip it). Mirrors interstitial above.
  let resolvedPieces
  if (Array.isArray(pieces)) resolvedPieces = pieces.length ? pieces : undefined
  else if (pieces === null) resolvedPieces = undefined
  else resolvedPieces = existingShared?.pieces || existingPriv?.pieces || undefined

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
              // Composer rebuild: how the surprise was authored — 'wrap' (an
              // existing memory carries the secret) or 'describe' (typed-from-
              // scratch). Lets the editor re-open in the right mode. Omitted
              // (undefined) for legacy surprises → the editor treats them as
              // 'describe' (their content is the typed title/detail).
              source: surprise.source || undefined,
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
    stopId: resolvedStopId,
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
    ...(resolvedPieces ? { pieces: resolvedPieces } : {}),
    mood,
    reactions: reactions || [],
    capturedAt: resolvedCapturedAt,
    interstitial: resolvedInterstitial,
    // Surprise / masking layer (hideFrom, reveal, conceal, cover, revealed,
    // surprise) — spread flat so the read-side transform can see m.hideFrom.
    ...mask,
    createdAt: existingShared?.createdAt || existingPriv?.createdAt || now,
    updatedAt: now,
    // Carry the server-known version forward so a foreground edit sends it as the
    // optimistic-concurrency base (a save built on a stale local copy is then
    // refused → re-pulled → re-pushed on top of fresh, rather than blind-clobbering).
    // Undefined for a brand-new memory → the worker creates it (no base, LWW).
    serverUpdatedAt: existingShared?.serverUpdatedAt || existingPriv?.serverUpdatedAt,
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
  // Tombstone BEFORE the local removal — the fix for "deleted memory resurrects":
  // a failed remote delete used to be swallowed, and the next pull re-added the
  // memory (mergeFromRemote takes any remote row with no local copy). The tombstone
  // survives a reload, so mergeFromRemote SKIPS this id (and re-fires the delete)
  // until the server confirms it. scheduleMirror clears the tombstone on success.
  markDeleted('memory', record.id)
  const key =
    record.visibility === 'private' ? PRIVATE_KEY(record.authorTraveler) : SHARED_KEY
  const list = readJson(key).filter((m) => m.id !== record.id)
  writeJson(key, list)
  scheduleMirror({ type: 'delete', record })
}

// URL of a photo ref (mirrors flattenPhotoEntries.refUrl). Local so memoryStore
// stays importable by the Node unit tests without pulling in photoEntries.
function refUrlOf(ref) {
  if (!ref) return null
  if (typeof ref.url === 'string' && ref.url) return ref.url
  if (typeof ref === 'string') return ref
  return null
}

// PURE: remove ONE photo (identified by its rendered url and/or R2 key) from a
// memory record's photo containers, returning { record, removed }. Handles all
// three forms — the canonical photoRefs[] (bulk-import albums), the legacy
// single photoRef, and photoExternalURLs[] — and an E4 heterogeneous `pieces`
// moment (edits the matching photo piece so the worker, which serializes from
// `pieces` first, replaces it rather than preserving the stored set). When the
// removed photo was the memory's LAST piece of content, returns record:null so
// the caller deletes the whole memory. No I/O — unit-tested directly.
export function removePhotoFromRecord(record, { photoUrl, refKey } = {}) {
  if (!record || typeof record !== 'object') return { record, removed: false }
  const matches = (x) => {
    if (!x) return false
    const u = refUrlOf(x)
    if (photoUrl && u && u === photoUrl) return true
    if (refKey && typeof x.key === 'string' && x.key === refKey) return true
    return false
  }
  let removed = false
  const filterOut = (arr) =>
    (arr || []).filter((x) => {
      const m = matches(x)
      if (m) removed = true
      return !m
    })

  const hadPieces = Array.isArray(record.pieces) && record.pieces.length > 0
  const pieces = hadPieces ? filterOut(record.pieces) : record.pieces
  const photoRefs = filterOut(record.photoRefs)
  const external = (record.photoExternalURLs || []).filter((u) => {
    const m = photoUrl && u === photoUrl
    if (m) removed = true
    return !m
  })
  let photoRef = record.photoRef
  if (!record.photoRefs?.length && matches(record.photoRef)) {
    photoRef = null
    removed = true
  }
  if (!removed) return { record, removed: false }

  const remaining =
    (hadPieces
      ? pieces.length
      : record.photoRefs?.length
        ? photoRefs.length
        : photoRef
          ? 1
          : 0) + external.length
  if (remaining <= 0) return { record: null, removed: true }

  const next = { ...record, photoExternalURLs: external }
  if (hadPieces) next.pieces = pieces
  if (record.photoRefs?.length) {
    next.photoRefs = photoRefs.length ? photoRefs : undefined
    next.photoRef = photoRefs[0] || null
  } else {
    next.photoRef = photoRef
  }
  return { record: next, removed: true }
}

// Remove ONE photo from a stored memory (author-scoped at the call site + the
// worker). Finds the record in the shared zone, else the author's private zone,
// applies removePhotoFromRecord, and either re-saves the slimmed memory or — if
// that was its last photo — deletes the whole memory. Both paths mirror to the
// Worker (the worker REPLACES photo_r2_keys_json from the body, so the removal
// is durable cross-device). Returns a status string.
export function removePhotoFromMemory({ memoryId, author, photoUrl, refKey } = {}) {
  if (!memoryId) return { status: 'not-found' }
  const keys = [SHARED_KEY, author ? PRIVATE_KEY(author) : null].filter(Boolean)
  for (const key of keys) {
    const list = readJson(key)
    const idx = list.findIndex((m) => m.id === memoryId)
    if (idx < 0) continue
    const record = list[idx]
    const { record: next, removed } = removePhotoFromRecord(record, { photoUrl, refKey })
    if (!removed) return { status: 'photo-not-found' }
    if (next === null) {
      writeJson(key, list.filter((m) => m.id !== memoryId))
      scheduleMirror({ type: 'delete', record })
      return { status: 'deleted-memory' }
    }
    next.updatedAt = new Date().toISOString()
    list[idx] = next
    writeJson(key, list)
    // On a 409, re-apply ONLY this photo's removal onto the FRESH server row (a
    // targeted edit — must not blanket-overwrite a caption/reaction another device
    // changed in the meantime). If removing it from fresh would empty the memory
    // (another device's photos are gone too), leave fresh untouched rather than
    // delete a memory someone may be adding to — conservative on a rare conflict.
    scheduleMirror({
      type: 'save',
      record: next,
      reapply: (fresh) => {
        const { record: r } = removePhotoFromRecord(fresh, { photoUrl, refKey })
        return r ? { ...r, updatedAt: new Date().toISOString() } : fresh
      },
    })
    const remaining =
      (next.photoRefs?.length || (next.photoRef ? 1 : 0)) +
      (next.photoExternalURLs?.length || 0)
    return { status: 'removed-photo', remaining }
  }
  return { status: 'not-found' }
}

// Stamp the SERVER's version onto a record taken from a remote pull. r.updatedAt
// IS the server's updated_at (rowToMemory emits it), so it becomes serverUpdatedAt
// — the skew-free base a later patch sends for the optimistic-concurrency guard.
// (The LWW field `updatedAt` can be a device clock; serverUpdatedAt never is.)
function stampServer(r) {
  if (r && r.updatedAt) r.serverUpdatedAt = r.updatedAt
  return r
}

// Force-write one record into its bucket by id (shared, or the author's private
// zone) — used by conflict recovery, which must land a specific merged record even
// though the optimistic local copy is timestamped newer than the server (so the
// LWW mergeFromRemote would refuse the fresh row).
function putLocalRecord(record) {
  if (!record?.id) return
  const key = record.visibility === 'private' ? PRIVATE_KEY(record.authorTraveler) : SHARED_KEY
  const list = readJson(key)
  const idx = list.findIndex((m) => m.id === record.id)
  if (idx >= 0) list[idx] = record
  else list.push(record)
  writeJson(key, list)
}

// Remove one record from every zone — the family's DELETE won (a worker-asserted
// tombstone: a deleted:true 409 body, or a fresh pull copy carrying deletedAt).
// No client tombstone is written: this device didn't initiate the delete, the
// server already holds it (mirrors mergeFromRemote's deletedAt branch).
function removeLocalRecord(id) {
  if (!id) return
  for (const key of [SHARED_KEY, ...ALL_TRAVELERS.map(PRIVATE_KEY)]) {
    const list = readJson(key)
    const next = list.filter((m) => m.id !== id)
    if (next.length !== list.length) writeJson(key, next)
  }
}

// Locate a record by id across the shared zone and every private bucket — the
// queue drain re-reads the LIVE record at replay time (a save intent pushes
// current content; a move intent patches its stored target onto it).
function findLocalMemory(id) {
  if (!id) return null
  const shared = readJson(SHARED_KEY).find((m) => m.id === id)
  if (shared) return shared
  for (const t of ALL_TRAVELERS) {
    const hit = readJson(PRIVATE_KEY(t)).find((m) => m.id === id)
    if (hit) return hit
  }
  return null
}

// Record the server-issued updatedAt onto the local copy after a successful push,
// so the NEXT patch sends a fresh, server-sourced base (monotonic — never lowers).
export function recordServerUpdatedAt(id, author, iso) {
  if (!id || !iso) return
  const bump = (key) => {
    const list = readJson(key)
    const idx = list.findIndex((m) => m.id === id)
    if (idx < 0) return false
    const cur = list[idx].serverUpdatedAt
    if (!cur || iso > cur) {
      list[idx] = { ...list[idx], serverUpdatedAt: iso }
      writeJson(key, list)
    }
    return true
  }
  if (bump(SHARED_KEY)) return
  // A private record lives in its author's bucket — go straight there when we know
  // the author (the push always carries it); fall back to a scan only when we don't.
  if (author) { bump(PRIVATE_KEY(author)); return }
  for (const t of ALL_TRAVELERS) if (bump(PRIVATE_KEY(t))) return
}

// Settle the local copy after a CONFIRMED push: carry the server row stamp as
// the next OCC base (monotonic, like recordServerUpdatedAt), and re-stamp the
// LWW `updatedAt` with the SERVER's value — the conflict path has done this
// since the clock-skew hazard was first documented (see resolveSaveConflict),
// and the ordinary success path must too: a clock-ahead device otherwise
// leaves a future-dated device stamp live, and shouldTakeRemote refuses every
// later family edit/heal to this memory for the whole skew duration. The
// restamp applies ONLY while the stored copy still carries the exact stamp we
// pushed — a newer local edit made mid-push keeps its own stamp (its own
// mirror confirms and restamps it in turn), so an unsynced edit can never be
// aged backward under a concurrent pull. Both sides stay ISO strings
// (memory-sync-lww standing rule: never normalize the synced/timestamp shape).
export function confirmMemoryPushed(record, serverIso) {
  if (!record?.id || !serverIso) return
  const settle = (key) => {
    const list = readJson(key)
    const idx = list.findIndex((m) => m.id === record.id)
    if (idx < 0) return false
    const cur = list[idx]
    const next = { ...cur }
    if (!cur.serverUpdatedAt || serverIso > cur.serverUpdatedAt) next.serverUpdatedAt = serverIso
    if (cur.updatedAt === record.updatedAt) next.updatedAt = serverIso
    if (next.serverUpdatedAt !== cur.serverUpdatedAt || next.updatedAt !== cur.updatedAt) {
      list[idx] = next
      writeJson(key, list)
    }
    return true
  }
  if (settle(SHARED_KEY)) return
  if (record.authorTraveler && settle(PRIVATE_KEY(record.authorTraveler))) return
  for (const t of ALL_TRAVELERS) if (settle(PRIVATE_KEY(t))) return
}

const MIRROR_CONFLICT_RETRIES = 2

// Recover from a 409 (the worker refused our push because the stored row moved on).
// Re-pull the conflicting memory AS ITS AUTHOR (not the active persona — on a shared
// device that's usually the wrong identity and would mask/hide the row), then either
// re-apply ONLY our one field onto the fresh row (background patch → true merge,
// never clobbers a neighbor) or re-push the whole edit on top of fresh (foreground →
// last deliberate CONTENT edit wins, fresh's stop filing preserved: only a move op's
// own closure may change stopId — mergeSaveOverFresh). Push-then-write: local is
// updated to the merged state only AFTER a successful re-push, so a mid-recovery
// failure can't strand local ahead of the server (an island the next pull would
// refuse). Returns the honest outcome (the queue drain dequeues ONLY on these):
//   'synced'         — the reapplied edit landed (or fresh already satisfied a move
//                      intent — adopted, nothing pushed)
//   'delete-adopted' — the family deleted this memory; local dropped, NEVER re-pushed
//                      (a tombstoned fresh copy IS the worker's assertion — pushing
//                      onto it would resurrect the memory family-wide)
//   'refused'        — the worker will never take this version (masked stub, a
//                      declined re-push, or bounded retries exhausted — local adopted
//                      the fresh row, no island); retrying is pointless
//   'pending'        — transient (offline mid-recovery, pull failed, row not served):
//                      local stays as-is; the intent queue owns the retry
export async function resolveSaveConflict(sync, op, attempt = 0) {
  let remote
  try {
    remote = await sync.pullAll({ asTraveler: op.record.authorTraveler || undefined })
  } catch {
    return { status: 'pending' } // offline mid-conflict — same as a plain failed push
  }
  if (!Array.isArray(remote) || remote.errors) return { status: 'pending' } // transient — don't strand in a loop
  const fresh = remote.find((r) => r.id === op.record.id)
  if (!fresh) return { status: 'pending' } // row not served (transient / filtered) — never guess
  if (fresh.deletedAt) {
    // ADOPT THE DELETE. The 409 led us to a tombstone: the family removed this
    // memory while our edit was in flight. Re-pushing our copy onto it (with the
    // tombstone's own stamp as base) would pass OCC and resurrect it for everyone
    // — the delete is adopted instead, exactly like a pull learning deletedAt.
    removeLocalRecord(op.record.id)
    return { status: 'delete-adopted' }
  }
  if (fresh.masked) return { status: 'refused' } // can't see the real row — never reapply onto a stand-in
  const merged = op.reapply ? op.reapply(fresh) : mergeSaveOverFresh(op.record, fresh)
  if (merged === null) {
    // The fresh row already satisfies this op's intent (a move whose target the
    // family already reached). Pushing a content-identical copy would only churn
    // updated_at — adopt fresh (our local poster/EXIF carried forward) instead.
    putLocalRecord(stampServer(preserveLocalPhotoMeta({ ...fresh }, op.record)))
    return { status: 'synced' }
  }
  merged.serverUpdatedAt = fresh.updatedAt
  try {
    const res = await sync.pushMemory(merged, { baseUpdatedAt: fresh.updatedAt })
    const outStatus = readMemoryPushResult(res).status
    if (outStatus === 'refused') return { status: 'refused' }
    if (outStatus === 'unconfigured') return { status: 'pending' } // nothing was pushed — never claim it landed
    const serverUpdatedAt = res && typeof res === 'object' && res.updatedAt ? res.updatedAt : fresh.updatedAt
    // Stamp local's LWW `updatedAt` with the SERVER's value (not the reapply's client
    // wall clock). If the periodic auto-sync (App.jsx runSync) merged an even-newer
    // edit to this id during our pull→push window, a future-dated client stamp would
    // out-rank it forever (shouldTakeRemote compares updatedAt) and the edit would be
    // lost permanently. Server-stamped, the next pull self-heals it — and
    // preserveLocalPhotoMeta carries our poster onto that newer row. Force-write
    // because the optimistic local copy is timestamped ahead of the server.
    putLocalRecord({ ...merged, updatedAt: serverUpdatedAt, serverUpdatedAt })
    return { status: 'synced' }
  } catch (err) {
    if (err?.status === 409) {
      if (err?.body?.deleted) {
        // The worker's own tombstone answer mid-recovery — the one authoritative
        // delete signal (never inferred from absence). Same adoption as above.
        removeLocalRecord(op.record.id)
        return { status: 'delete-adopted' }
      }
      if (attempt < MIRROR_CONFLICT_RETRIES) {
        return resolveSaveConflict(sync, { ...op, record: merged }, attempt + 1)
      }
      // Give up this burst WITHOUT an island: adopt the fresh server row, carrying our
      // local poster/EXIF forward (preserveLocalPhotoMeta) so a synced video keeps its
      // still and the durable posterRetry queue can re-push later. updatedAt becomes
      // the server's, so the next pull reconciles cleanly.
      putLocalRecord(stampServer(preserveLocalPhotoMeta({ ...fresh }, op.record)))
      return { status: 'refused' }
    }
    // A NON-409 failure mid-recovery is transient, not a verdict: local keeps the
    // edit and the intent stays queued (the drain retries on a fresh pull). Adopting
    // fresh here would silently drop a deliberate edit over a network blip.
    return { status: 'pending' }
  }
}

// One save-type mirror attempt, end to end: push with the server-known base,
// read the honest per-item result, recover a 409 deliberately. Exported so the
// unit suite and the queue drain can drive it with a stub sync — scheduleMirror
// is only the lazy-import + serial-chain wrapper around it. Returns the honest
// outcome ('synced' | 'refused' | 'delete-adopted' | 'pending' | 'unconfigured');
// `onRecoveryStart` fires before the bounded 409 recovery begins, so the caller
// can persist the intent FIRST — recovery spans seconds of pulls and retries,
// and a crash mid-flight must leave the edit replayable, never stranded.
export async function mirrorSaveOp(sync, op, { onRecoveryStart } = {}) {
  try {
    const res = await sync.pushMemory(op.record, { baseUpdatedAt: op.record.serverUpdatedAt })
    const out = readMemoryPushResult(res)
    if (out.status === 'refused') return 'refused'
    if (out.status === 'unconfigured') return 'unconfigured'
    // REFUSAL-ADOPTION seam (Stage B): when the worker's 200 carries a stored
    // row that KEPT a different filing than we pushed (the manual-lock refusal,
    // worker rule 2), adopt the server's answer locally — this device must not
    // keep displaying its refused move until some later pull. Inert today:
    // postMemory always writes the pushed stop_id, so the filings can't differ.
    if (out.serverRow && !sameStopId(out.serverRow.stopId, op.record.stopId)) {
      adoptServerStopFiling(op.record, out.serverRow)
    }
    if (out.updatedAt) confirmMemoryPushed(op.record, out.updatedAt)
    return 'synced'
  } catch (err) {
    if (err?.status === 409) {
      if (err?.body?.deleted) {
        // The worker refused the push at a tombstone (deleted:true) — the one
        // authoritative delete signal. Adopt it: drop local, never re-push.
        removeLocalRecord(op.record.id)
        return 'delete-adopted'
      }
      onRecoveryStart?.()
      const r = await resolveSaveConflict(sync, op, 0)
      return r?.status || 'pending'
    }
    return 'pending' // offline / Worker error — the intent queue owns the retry
  }
}

// Patch ONLY the stop filing (+ its Stage-B provenance) from a server row the
// worker answered with, leaving every content field the local copy carries.
// The stamps are settled by confirmMemoryPushed right after (same row).
function adoptServerStopFiling(record, serverRow) {
  const key = record.visibility === 'private' ? PRIVATE_KEY(record.authorTraveler) : SHARED_KEY
  const list = readJson(key)
  const idx = list.findIndex((m) => m.id === record.id)
  if (idx < 0) return
  const next = { ...list[idx], stopId: serverRow.stopId }
  if ('stopProv' in serverRow) next.stopProv = serverRow.stopProv
  list[idx] = next
  writeJson(key, list)
}

// Settle a mirror attempt's outcome against the intent queue + the per-outcome
// signal. Only worker-settled outcomes dequeue; 'pending' persists the intent
// so the drain replays it (the silent-swallow class: a failed mirror used to
// leave the device forked forever — its newer local stamp then blocked every
// pull from correcting it). 'unconfigured' never queues: there is nothing to
// sync to, and a worker-less build must not accrete a queue it can never drain.
function settleMirrorOutcome(op, outcome) {
  const id = op.record.id
  const intent = op.intent || { kind: 'save' }
  if (outcome === 'unconfigured') return
  if (outcome === 'pending') {
    // ensureUnsynced, not markUnsynced: this op may have been in flight when a
    // NEWER move re-decided the target (the decision path already replaced the
    // entry) — a failure settle only guarantees the intent is owed, it never
    // writes its own older target back over the latest decision.
    memoryQueue.ensureUnsynced({
      kind: intent.kind,
      memoryId: id,
      stopId: intent.stopId,
      prov: intent.prov, // carry a hand-move's story onto the queued intent too
      author: op.record.authorTraveler || null,
    })
    memoryQueue.emitOutcome(id, 'still-pending')
    return
  }
  if (outcome === 'delete-adopted') {
    // The family's delete won — nothing about this record is owed anymore.
    memoryQueue.clearAllFor(id)
    memoryQueue.emitOutcome(id, 'delete-adopted')
    return
  }
  // synced | refused — this intent is worker-settled either way.
  memoryQueue.markSynced(id, intent.kind)
  memoryQueue.emitOutcome(id, outcome)
}

// Tiny serial queue so a fast burst of saves doesn't fan out to N
// parallel Worker calls. We don't await — UI stays instant.
let mirrorChain = Promise.resolve()
function scheduleMirror(op) {
  mirrorChain = mirrorChain
    .then(async () => {
      let sync
      try {
        sync = await import('./workerSync.js')
      } catch {
        // The sync module itself couldn't load (offline chunk fetch). A save's
        // intent is queued for the drain — the edit is owed, not lost; a delete
        // keeps its tombstone (the pull-side guard + resync own that retry).
        if (op.type !== 'delete') settleMirrorOutcome(op, 'pending')
        return
      }
      try {
        if (op.type === 'delete') {
          const ok = await sync.deleteRemote(op.record)
          // Confirmed on the server (true) or no worker to sync to (null) → the delete
          // is settled; drop the tombstone. Only a genuine FAILURE (false) keeps it, so
          // the next pull re-fires the delete and never re-adds the memory meanwhile.
          if (ok !== false) clearDeleted('memory', op.record.id)
          return
        }
        // save — queue-first at the recovery boundary (a crash mid-recovery must
        // leave the intent replayable), then settle on the honest outcome.
        // ensureUnsynced (never markUnsynced): a newer decision may already own
        // the entry — see settleMirrorOutcome.
        const outcome = await mirrorSaveOp(sync, op, {
          onRecoveryStart: () =>
            memoryQueue.ensureUnsynced({
              kind: (op.intent || { kind: 'save' }).kind,
              memoryId: op.record.id,
              stopId: op.intent?.stopId,
              prov: op.intent?.prov,
              author: op.record.authorTraveler || null,
            }),
        })
        settleMirrorOutcome(op, outcome)
      } catch {
        /* defense — mirrorSaveOp reports failures as outcomes, never throws */
      }
    })
    .catch(() => {})
}

// Replay every queued memory intent against the family server — the memory
// side of useTrips' resyncPending, fired on the same sync moments (App.jsx:
// cold load, foregrounding, network back, the drain interval). Bounded: ONE
// attempt per intent per call; a transient failure leaves the entry queued for
// the next moment. Dequeue happens only on worker-settled outcomes (synced /
// refused / delete-adopted), and every entry's outcome is emitted on the
// per-outcome signal. `sync` is injectable so the unit suite can drive every
// branch; the real caller gets the lazy workerSync import.
//
// The replay RIDES THE MIRROR CHAIN: a move's own in-flight mirror and a drain
// tick replaying its queue entry are pushes of the same decision stream, and
// unserialized they can land in either order — whichever finishes second wins
// the 409 recovery, so a stale replay could re-impose an older target over the
// user's newer move. On the chain a replay runs only between mirror ops, and
// the per-intent live re-read below sees every settle that ran ahead of it.
let memoryDrainRun = null
export function drainMemorySyncQueue({ sync } = {}) {
  // Re-entry returns the IN-FLIGHT drain, never a fresh already-resolved
  // promise. The callers that await this to enforce push-then-pull — the A-3
  // delta beat, runSync, Settings' runPull — must actually WAIT for the
  // pushes: an instant resolve here let their pull race the still-pending
  // POSTs, quietly voiding the ordering they document. (A-3 adversarial
  // review, finding 1.)
  if (memoryDrainRun) return memoryDrainRun
  const run = mirrorChain.then(async () => {
    try {
      return await drainMemoryQueueNow(sync)
    } finally {
      memoryDrainRun = null
    }
  })
  memoryDrainRun = run
  mirrorChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

async function drainMemoryQueueNow(injected) {
  let sync = injected
  if (!sync) {
    try {
      sync = await import('./workerSync.js')
    } catch {
      return { settled: 0, remaining: memoryQueue.count() }
    }
  }
  if (typeof sync.isWorkerConfigured === 'function' && !sync.isWorkerConfigured()) {
    return { settled: 0, remaining: memoryQueue.count() }
  }
  let settled = 0
  for (const intent of memoryQueue.pendingIntents()) {
    // Re-read the LIVE entry: an op ahead on the chain may have settled it,
    // and a decision made since this drain was scheduled may have replaced a
    // move's target. A vanished entry has nothing owed; a changed target
    // means a NEWER decision owns this memory — replaying the snapshot would
    // push the superseded one (and 409-recover it into winning).
    const live = memoryQueue.getIntent(intent.memoryId, intent.kind)
    if (!live) continue
    if (intent.kind === 'move' && !sameStopId(live.stopId, intent.stopId)) continue
    const record = findLocalMemory(intent.memoryId)
    if (!record || record.masked) {
      // Gone locally (a delete owns its own tombstone story), or a masked
      // projection that is never ours to sync — the intent is moot.
      memoryQueue.markSynced(intent.memoryId, intent.kind)
      memoryQueue.emitOutcome(intent.memoryId, 'refused')
      settled += 1
      continue
    }
    // The push authenticates AS the record's author (pushMemory), and this
    // device may hold no credential for them — a cross-author refile from a
    // one-person device. Replaying anyway burns a guaranteed-401 request per
    // intent on every heartbeat, forever. The edit stays owed — quietly —
    // until a credential for that author is enrolled here; an author-less
    // record pushes as the active traveler, so it is never skipped.
    if (
      record.authorTraveler &&
      typeof sync.hasCredential === 'function' &&
      !sync.hasCredential(record.authorTraveler)
    ) {
      continue
    }
    let op
    if (intent.kind === 'move') {
      // A MOVE replays its STORED target — the decision captured at move
      // time — never the live record's filing (a pull may have overwritten
      // it in between; replaying "current state" would push the overwrite
      // and erase the decision). The push identity is the record's author
      // (pushMemory authenticates as authorTraveler).
      let pushRecord = record
      if (!sameStopId(record.stopId, intent.stopId)) {
        pushRecord = {
          ...record,
          stopId: intent.stopId,
          ...(intent.prov !== undefined ? { stopProv: intent.prov } : {}),
          updatedAt: new Date().toISOString(),
        }
        putLocalRecord(pushRecord)
      }
      op = { type: 'save', record: pushRecord, reapply: moveReapply(intent.stopId, undefined, intent.prov), intent }
    } else {
      // A SAVE pushes the CURRENT local record — content edits are
      // whole-record by design, so the record itself carries the latest
      // truth; the entry only remembers that it is owed.
      op = { type: 'save', record, intent }
    }
    const outcome = await mirrorSaveOp(sync, op)
    if (outcome === 'unconfigured' || outcome === 'pending') {
      memoryQueue.emitOutcome(intent.memoryId, 'still-pending')
      continue // stays queued for the next sync moment
    }
    if (outcome === 'delete-adopted') {
      memoryQueue.clearAllFor(intent.memoryId)
      memoryQueue.emitOutcome(intent.memoryId, 'delete-adopted')
      settled += 1
      continue
    }
    memoryQueue.markSynced(intent.memoryId, intent.kind) // synced | refused
    memoryQueue.emitOutcome(intent.memoryId, outcome)
    settled += 1
  }
  return { settled, remaining: memoryQueue.count() }
}

// ── Remote-arrival signal (A-3 live channel) ─────────────────────────────
// Background delta pulls merge remote memories every heartbeat, but the open
// views key their reads on a LOCAL tick (a save, a finished import) — a
// background merge would land in localStorage and never repaint the album
// someone is looking at. Views subscribe here to learn "the store just
// changed underneath you." Fired from mergeFromRemote only: local mutations
// already drive their own ticks, and doubling their signal would re-render
// twice for one change.
const changeListeners = new Set()
export function subscribeMemoriesChanged(fn) {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)
}
function notifyMemoriesChanged() {
  for (const fn of changeListeners) {
    try {
      fn()
    } catch {
      /* a listener must never break the merge */
    }
  }
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
  // Snapshot the unsynced set ONCE — the skip-pending-intent guard below
  // consults it per record, and mergeFromRemote also runs over the whole
  // archive on a cold-load full pull; a per-record localStorage re-parse (via
  // isUnsynced) would be O(N) parses (A-3 review #4). pendingIntents() reads
  // the (typically tiny) queue once.
  const pendingIds = new Set(memoryQueue.pendingIntents().map((e) => e.memoryId))
  let added = 0
  for (const r of remoteRecords) {
    if (!r?.id) continue
    // RESURRECTION GUARD: this memory was deleted locally but the remote delete hasn't
    // confirmed. Never re-add it. If the server now reports it deleted (deletedAt), our
    // delete landed → drop the tombstone; otherwise the server still holds it → re-fire
    // the delete (self-healing) and skip. (deleteMemory + scheduleMirror set/clear it.)
    if (isDeleted('memory', r.id)) {
      if (r.deletedAt) clearDeleted('memory', r.id)
      else scheduleMirror({ type: 'delete', record: r })
      continue
    }
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
    // SKIP-PENDING-INTENT (A-3 review fold-in). This device holds an unpushed
    // local edit for r.id (a queued save/move). A remote LWW win here would
    // clobber it before it ever reaches the family — the clock-behind-skew
    // aperture the A-3 review flagged (a delta re-delivers an older server row
    // whose server stamp outranks this edit's device-clock stamp). Keep local;
    // the queue pushes the edit, and a later pull carries the confirmed row.
    // Scoped to the UPSERT branches only — a tombstone (handled above) is
    // authoritative and still propagates; the drain delete-adopts the intent.
    // Guarded on `existing` so a genuinely-new remote row is never dropped.
    if (pendingIds.has(r.id)) {
      if (r.visibility === 'private') {
        if (r.authorTraveler && getPrivateBucket(r.authorTraveler).has(r.id)) continue
      } else if (sharedMap.has(r.id)) {
        continue
      }
    }
    if (r.visibility === 'private') {
      const author = r.authorTraveler
      if (!author) continue
      const bucket = getPrivateBucket(author)
      const existing = bucket.get(r.id)
      if (shouldTakeRemote(r, existing)) {
        bucket.set(r.id, stampServer(existing ? preserveLocalPhotoMeta(r, existing) : r))
        added += 1
      }
    } else {
      const existing = sharedMap.get(r.id)
      if (shouldTakeRemote(r, existing)) {
        sharedMap.set(r.id, stampServer(existing ? preserveLocalPhotoMeta(r, existing) : r))
        added += 1
      }
    }
  }
  writeJson(SHARED_KEY, Array.from(sharedMap.values()))
  for (const [author, bucket] of privateBuckets) {
    writeJson(PRIVATE_KEY(author), Array.from(bucket.values()))
  }
  // `added` counts every applied change — new rows, LWW-won updates, AND
  // tombstone removals — so this fires exactly when a view's picture of the
  // store went stale, and stays silent on a no-op merge (every beat whose
  // delta was already applied).
  if (added > 0) notifyMemoriesChanged()
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
  // A real row always supersedes a masked projection (Surprises, 010) of the
  // same id, regardless of timestamp. Without this, an author viewing on a
  // device that last synced as the hidden-from person would keep seeing the
  // stripped stub even after re-syncing as themselves (same updated_at, so the
  // timestamp check below wouldn't fire). Never the reverse: a masked stub must
  // not replace a real local row a true recipient can never have anyway.
  if (local.masked && !remote.masked) return true
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
    // Sound honesty verdict ('carried' | 'none' | 'lost'): a stale/rolling-out
    // remote (pre-sound worker) carries no `sound` — keep the capturing
    // device's own so a pull can't erase the honest no-sound label. (Same
    // merge-guard rationale as posterKey above; the remote wins when present.)
    if (!rRef.sound && typeof lRef.sound === 'string' && lRef.sound) {
      rRef.sound = lRef.sound
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
  // E4 moment pieces ride the JSON column INSTEAD of photoRefs server-side, so
  // a stale remote's pieces need the same gap-fill or a pull strips poster/
  // sound from the composed moment's own videos. Kinds must match — an index
  // collision across kinds must never graft one piece's meta onto another
  // (voice/note pieces carry none of these fields anyway).
  if (
    Array.isArray(remote.pieces) &&
    Array.isArray(local.pieces) &&
    remote.pieces.length === local.pieces.length
  ) {
    remote.pieces = remote.pieces.map((rPc, i) =>
      rPc && local.pieces[i] && rPc.kind === local.pieces[i].kind ? fill({ ...rPc }, local.pieces[i]) : rPc
    )
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
    // Never patch a masked projection (a teaser stub / cover stand-in) — it isn't a
    // valid write target; bumping its updatedAt would also suppress the real reveal.
    if (list[idx].masked) return list[idx]
    const now = new Date().toISOString()
    const patched = { ...list[idx], capturedAt: next, updatedAt: now }
    list[idx] = patched
    writeJson(key, list)
    // On a 409, re-apply ONLY the capture-date override onto the fresh server row
    // (a deliberate single-field override — set it, don't gap-fill).
    scheduleMirror({
      type: 'save',
      record: patched,
      reapply: (fresh) => ({ ...fresh, capturedAt: next, updatedAt: new Date().toISOString() }),
    })
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

// Set / edit / clear a memory's caption in place (the album lightbox's "add a
// caption" edit). A deliberate single-field override — mirrors updateMemoryCapturedAt:
// patch the one field + re-mirror so other devices pick it up, and on a 409 re-apply
// ONLY the caption onto the fresh server row (don't gap-fill). An empty caption clears
// it (stored null → the read faces hide it). A masked projection is never a valid target.
export function updateMemoryCaption(memoryId, caption) {
  if (!memoryId) return null
  const next = typeof caption === 'string' && caption.trim() ? caption.trim() : null
  const tryUpdateIn = (key) => {
    const list = readJson(key)
    const idx = list.findIndex((m) => m.id === memoryId)
    if (idx < 0) return null
    if (list[idx].masked) return list[idx]
    const now = new Date().toISOString()
    const patched = { ...list[idx], caption: next, updatedAt: now }
    list[idx] = patched
    writeJson(key, list)
    scheduleMirror({
      type: 'save',
      record: patched,
      reapply: (fresh) => ({ ...fresh, caption: next, updatedAt: new Date().toISOString() }),
    })
    return patched
  }
  const inShared = tryUpdateIn(SHARED_KEY)
  if (inShared) return inShared
  for (const traveler of ['jonathan', 'helen', 'aurelia', 'rafa']) {
    const result = tryUpdateIn(PRIVATE_KEY(traveler))
    if (result) return result
  }
  return null
}

// Re-file a memory to a different stop (used by the "sort to places" re-file when
// the trip's implicit base appears AFTER photos were already imported). Patches the
// single stopId field + re-mirrors so other devices pick up the move. Idempotent
// (a no-op when already there); a masked projection is never a valid target.
// The mirror carries a MOVE intent: on a 409 the reapply re-asserts THIS target
// onto the fresh row (skipping the push when fresh already sits there), and a
// failed mirror queues { move, stopId } — the drain replays the stored target,
// never a re-derive from whatever the record holds at drain time.
export function updateMemoryStop(memoryId, stopId, prov = undefined) {
  if (!memoryId) return null
  const tryUpdateIn = (key) => {
    const list = readJson(key)
    const idx = list.findIndex((m) => m.id === memoryId)
    if (idx < 0) return null
    if (list[idx].masked) return list[idx]
    if (sameStopId(list[idx].stopId, stopId)) return list[idx] // already filed there
    const now = new Date().toISOString()
    // A hand-move (Ch3) carries `prov` — {source:'manual', by, reason, snapshotted
    // labels} — so the LIVE worker (resolveStopProvenance) stamps + LOCKS it
    // (authorship outranks the machine). Omitted for a plain machine/refile move
    // → the record + queue entry stay byte-identical to before Ch3.
    const patched = { ...list[idx], stopId, ...(prov !== undefined ? { stopProv: prov } : {}), updatedAt: now }
    list[idx] = patched
    writeJson(key, list)
    // A still-queued older move for this memory is superseded RIGHT NOW, not
    // when this mirror settles: the queue's contract (the stored target IS the
    // latest decision) must hold while the mirror is in flight — a drain tick
    // in that window would otherwise replay the stale target, snap the filing
    // back on screen, and win the 409 recovery against this newer move. Only a
    // replace, never a first enqueue: whether this edit is owed at all is the
    // mirror outcome's verdict (unconfigured must not accrete queue entries).
    if (memoryQueue.getIntent(memoryId, 'move')) {
      memoryQueue.markUnsynced({
        kind: 'move',
        memoryId,
        stopId,
        prov,
        author: patched.authorTraveler || null,
      })
    }
    scheduleMirror({
      type: 'save',
      record: patched,
      reapply: moveReapply(stopId, undefined, prov),
      intent: { kind: 'move', stopId, ...(prov !== undefined ? { prov } : {}) },
    })
    return patched
  }
  const inShared = tryUpdateIn(SHARED_KEY)
  if (inShared) return inShared
  for (const traveler of ALL_TRAVELERS) {
    const result = tryUpdateIn(PRIVATE_KEY(traveler))
    if (result) return result
  }
  return null
}

// Fill in a video memory's poster (posterKey/posterUrl) AFTER the fact — used by
// the poster-retry queue when a poster upload finally lands on a video that had
// already synced without a still. Patches the video ref(s) and re-mirrors so the
// real frame appears everywhere. Mirrors updateMemoryCapturedAt's by-id search.
export function updateMemoryPoster(memoryId, posterKey, posterUrl) {
  if (!memoryId || !posterKey) return null
  const isVideoRef = (r) =>
    !!r &&
    (r.kind === 'video' ||
      (typeof r.mime === 'string' && r.mime.startsWith('video/')) ||
      typeof r.posterKey === 'string' ||
      typeof r.posterUrl === 'string')
  const patchRef = (r) => (isVideoRef(r) ? { ...r, posterKey, posterUrl } : r)
  // For the 409 re-push: fill the poster ONLY on a fresh video ref that still lacks
  // one — idempotent, so it never overwrites a poster another device already set,
  // and never blanket-restamps a ref the fresh row legitimately changed.
  const gapFillRef = (r) => (isVideoRef(r) && !r.posterKey ? { ...r, posterKey, posterUrl } : r)
  const tryUpdateIn = (key) => {
    const list = readJson(key)
    const idx = list.findIndex((m) => m.id === memoryId)
    if (idx < 0) return null
    if (list[idx].masked) return list[idx] // never patch a masked projection
    const m = list[idx]
    const now = new Date().toISOString()
    const patched = { ...m, updatedAt: now }
    if (m.photoRef) patched.photoRef = patchRef({ ...m.photoRef })
    if (Array.isArray(m.photoRefs)) patched.photoRefs = m.photoRefs.map((r) => patchRef({ ...r }))
    list[idx] = patched
    writeJson(key, list)
    scheduleMirror({
      type: 'save',
      record: patched,
      reapply: (fresh) => {
        const f = { ...fresh, updatedAt: new Date().toISOString() }
        if (fresh.photoRef) f.photoRef = gapFillRef({ ...fresh.photoRef })
        if (Array.isArray(fresh.photoRefs)) f.photoRefs = fresh.photoRefs.map((r) => gapFillRef({ ...r }))
        return f
      },
    })
    return patched
  }
  const inShared = tryUpdateIn(SHARED_KEY)
  if (inShared) return inShared
  for (const traveler of ['jonathan', 'helen', 'aurelia', 'rafa']) {
    const result = tryUpdateIn(PRIVATE_KEY(traveler))
    if (result) return result
  }
  return null
}

// Fill in a photo/video ref's GPS (lat/lng) AFTER the fact — the archive
// backfill (Stage C-b): a ref whose R2 asset still carried EXIF (a full-size
// upload that slipped past the shrink) gets its coords re-read and written here,
// then re-mirrored so every device's copy gains the location. Identified by the
// ref's stable R2 `key`. Idempotent: only a ref that LACKS coords is patched, so
// a re-run (or a 409 re-push) never overwrites coords another device set, and
// the same-stop re-save trips provenance rule 1 (preserve) — GPS enrichment
// never manual-locks a photo. Mirrors updateMemoryPoster's shape.
export function applyRefGps(memoryId, refKey, { lat, lng } = {}) {
  if (!memoryId || !refKey) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const matches = (r) => !!r && typeof r === 'object' && r.key === refKey
  const needsGps = (r) => matches(r) && !(Number.isFinite(r.lat) && Number.isFinite(r.lng))
  const patchRef = (r) => (needsGps(r) ? { ...r, lat, lng } : r)
  const tryUpdateIn = (key) => {
    const list = readJson(key)
    const idx = list.findIndex((m) => m.id === memoryId)
    if (idx < 0) return null
    if (list[idx].masked) return list[idx] // never patch a masked projection
    const m = list[idx]
    // No-op guard: if no container ref both matches the key AND lacks coords,
    // there's nothing to write — don't bump updatedAt or re-mirror (idempotent
    // resume must not churn the whole archive on every run).
    const hasTarget =
      needsGps(m.photoRef) ||
      (Array.isArray(m.photoRefs) && m.photoRefs.some(needsGps))
    if (!hasTarget) return m
    const now = new Date().toISOString()
    const patched = { ...m, updatedAt: now }
    if (m.photoRef) patched.photoRef = patchRef({ ...m.photoRef })
    if (Array.isArray(m.photoRefs)) patched.photoRefs = m.photoRefs.map((r) => patchRef({ ...r }))
    list[idx] = patched
    writeJson(key, list)
    scheduleMirror({
      type: 'save',
      record: patched,
      // 409 re-push: gap-fill coords ONLY where the fresh ref still lacks them,
      // so a concurrent enrichment from another device is never clobbered.
      reapply: (fresh) => {
        const f = { ...fresh, updatedAt: new Date().toISOString() }
        if (fresh.photoRef) f.photoRef = patchRef({ ...fresh.photoRef })
        if (Array.isArray(fresh.photoRefs)) f.photoRefs = fresh.photoRefs.map((r) => patchRef({ ...r }))
        return f
      },
    })
    return patched
  }
  const inShared = tryUpdateIn(SHARED_KEY)
  if (inShared) return inShared
  for (const traveler of ['jonathan', 'helen', 'aurelia', 'rafa']) {
    const result = tryUpdateIn(PRIVATE_KEY(traveler))
    if (result) return result
  }
  return null
}

// Sibling of applyRefGps for the re-source scan (Album System Ch 04): write a
// recovered capture-time OFFSET (minutes, e.g. -240 for EDT) onto a photo ref AFTER
// the fact, so the engine files by the correct LOCAL wall clock (the archive's ~74%
// with no offset default to UTC — 4h wrong). Identified by the ref's stable R2 `key`.
// Idempotent: only a ref that LACKS an offset is patched, so a re-run (or a 409
// re-push) never overwrites one another device set, and a same-stop re-save trips
// provenance rule 1 (preserve). Never patches a masked projection. Mirrors applyRefGps.
export function applyRefOffset(memoryId, refKey, offsetMinutes) {
  if (!memoryId || !refKey) return null
  if (!Number.isFinite(offsetMinutes)) return null
  const matches = (r) => !!r && typeof r === 'object' && r.key === refKey
  const needsOffset = (r) => matches(r) && !Number.isFinite(r.offsetMinutes)
  const patchRef = (r) => (needsOffset(r) ? { ...r, offsetMinutes } : r)
  const tryUpdateIn = (key) => {
    const list = readJson(key)
    const idx = list.findIndex((m) => m.id === memoryId)
    if (idx < 0) return null
    if (list[idx].masked) return list[idx] // never patch a masked projection
    const m = list[idx]
    const hasTarget =
      needsOffset(m.photoRef) || (Array.isArray(m.photoRefs) && m.photoRefs.some(needsOffset))
    if (!hasTarget) return m
    const now = new Date().toISOString()
    const patched = { ...m, updatedAt: now }
    if (m.photoRef) patched.photoRef = patchRef({ ...m.photoRef })
    if (Array.isArray(m.photoRefs)) patched.photoRefs = m.photoRefs.map((r) => patchRef({ ...r }))
    list[idx] = patched
    writeJson(key, list)
    scheduleMirror({
      type: 'save',
      record: patched,
      // 409 re-push: gap-fill ONLY where the fresh ref still lacks an offset, so a
      // concurrent enrichment from another device is never clobbered.
      reapply: (fresh) => {
        const f = { ...fresh, updatedAt: new Date().toISOString() }
        if (fresh.photoRef) f.photoRef = patchRef({ ...fresh.photoRef })
        if (Array.isArray(fresh.photoRefs)) f.photoRefs = fresh.photoRefs.map((r) => patchRef({ ...r }))
        return f
      },
    })
    return patched
  }
  const inShared = tryUpdateIn(SHARED_KEY)
  if (inShared) return inShared
  for (const traveler of ['jonathan', 'helen', 'aurelia', 'rafa']) {
    const result = tryUpdateIn(PRIVATE_KEY(traveler))
    if (result) return result
  }
  return null
}

// Pure: gap-fill sidecar fields (meta/srcName/srcMod/atSrc) onto whichever
// ref on `record` matches `refKey` — per FIELD, never overwriting one
// already present. Shared by applyRefSidecar's direct write AND its 409
// reapply (applyRefSidecarReapply below) — exactly one source of truth for
// what "gap-fill" means, mirroring replaceVideoRefInRecord's reuse by
// replaceMemoryVideoRef + replaceVideoRefReapply, so the two paths can never
// drift apart. `clean` is an ALREADY-sanitized sidecar (sanitizeSidecar's
// output) — this function does no bounds-checking of its own. Returns
// { record, patched }; `record` comes back BY REFERENCE, byte-identical,
// when patched:false.
function patchSidecarOntoRecord(record, refKey, clean) {
  if (!record || typeof record !== 'object') return { record, patched: false }
  const matches = (r) => !!r && typeof r === 'object' && r.key === refKey
  const fieldsToFill = (r) => {
    const add = {}
    if (clean.meta && !r.meta) add.meta = clean.meta
    if (clean.srcName && !r.srcName) add.srcName = clean.srcName
    if (Number.isFinite(clean.srcMod) && !Number.isFinite(r.srcMod)) add.srcMod = clean.srcMod
    if (clean.atSrc && !r.atSrc) add.atSrc = clean.atSrc
    return add
  }
  let patched = false
  const patchRef = (r) => {
    if (!matches(r)) return r
    const add = fieldsToFill(r)
    if (!Object.keys(add).length) return r
    patched = true
    return { ...r, ...add }
  }
  const out = { ...record }
  if (record.photoRef) out.photoRef = patchRef(record.photoRef)
  if (Array.isArray(record.photoRefs)) out.photoRefs = record.photoRefs.map(patchRef)
  return patched ? { record: out, patched: true } : { record, patched: false }
}

// The 409 reapply for the sidecar gap-fill (exported for unit tests, like
// moveReapply / replaceVideoRefReapply): on a conflict, re-run the SAME
// per-field gap-fill against the FRESH server row, so a field another device
// already wrote (or the family's own newer edit) is never clobbered.
// Matches applyRefGps/applyRefOffset's existing reapply shape: unlike
// replaceVideoRefReapply, this never returns null — it always re-pushes a
// stamped copy of fresh (a no-op gap-fill still re-asserts our copy), so a
// caller relying on "returns null → adopt fresh, push nothing" would be
// wrong here; that's inherited behavior from the GPS/offset siblings, not
// changed by this refactor.
export function applyRefSidecarReapply(refKey, sidecar) {
  const clean = sanitizeSidecar(sidecar)
  return (fresh) => {
    const { record } = patchSidecarOntoRecord(fresh, refKey, clean)
    return { ...record, updatedAt: new Date().toISOString() }
  }
}

// Sibling of applyRefGps/applyRefOffset for the never-discard sidecar (Build 1):
// write the recovered `meta`/`srcName`/`srcMod`/`atSrc` onto a photo ref AFTER
// the fact — the re-source scan (resourceScan.js) recovers these from a
// re-granted original the same way it recovers GPS/offset. Identified by the
// ref's stable R2 `key`. Idempotent PER FIELD (not all-or-nothing): a ref that
// already carries `meta` keeps its stored meta even if `srcName` is still
// missing, so a partial prior write (or a field another device already filled)
// is never re-clobbered — matching applyRefGps/applyRefOffset's "only fill
// absent" contract. Never patches a masked projection. `sidecar` is
// re-sanitized here (bounded + whitelisted) even though callers already ran it
// through sanitizeSidecar — defense in depth for this write path specifically.
export function applyRefSidecar(memoryId, refKey, sidecar) {
  if (!memoryId || !refKey) return null
  const clean = sanitizeSidecar(sidecar)
  if (!Object.keys(clean).length) return null
  const tryUpdateIn = (key) => {
    const list = readJson(key)
    const idx = list.findIndex((m) => m.id === memoryId)
    if (idx < 0) return null
    if (list[idx].masked) return list[idx] // never patch a masked projection
    const m = list[idx]
    const { record: candidate, patched } = patchSidecarOntoRecord(m, refKey, clean)
    if (!patched) return m
    const now = new Date().toISOString()
    const result = { ...candidate, updatedAt: now }
    list[idx] = result
    writeJson(key, list)
    scheduleMirror({
      type: 'save',
      record: result,
      // 409 re-push: gap-fill ONLY the fields the fresh ref still lacks, so a
      // concurrent enrichment from another device is never clobbered.
      reapply: applyRefSidecarReapply(refKey, sidecar),
    })
    return result
  }
  const inShared = tryUpdateIn(SHARED_KEY)
  if (inShared) return inShared
  for (const traveler of ['jonathan', 'helen', 'aurelia', 'rafa']) {
    const result = tryUpdateIn(PRIVATE_KEY(traveler))
    if (result) return result
  }
  return null
}

// ── "Add it again with sound" — in-place video-ref replacement ─────────────
//
// Four stored videos are permanently silent (ref.sound === 'lost'): their
// source HAD audio the old encode couldn't keep. The new import pipeline
// carries sound, so the author can re-pick the same camera-roll video and the
// fresh upload REPLACES the ref in place — same memory, same moment, new
// bytes. The record's identity is never touched: caption, stop filing (and
// its stopProv provenance seam), reactions, visibility/surprise fields, and
// capturedAt all ride the untouched record; only the matching ref's stored-
// object fields swap.
//
// CAPTURE IDENTITY CHOICE (deliberate, documented): the replacement is the
// SAME moment, so the ORIGINAL ref's capturedAt is kept even if the re-picked
// file's own metadata differs slightly (re-encodes and camera-roll exports
// drift by seconds). The swap therefore STRIPS any capturedAt the caller's
// `next` might carry — the replacement never proposes its own capture time.
// Everything else the old ref carried but `next` doesn't name (lat/lng, a
// locationLabel — and the OLD posterKey/posterUrl when the new poster upload
// failed, so the tile never goes blank while posterRetry heals it) survives
// via the spread merge.

// PURE: swap ONE video ref (identified by its stored R2 key) for its
// replacement across a record's photo containers — photoRefs[] (+ the
// photoRef back-compat mirror), the legacy single photoRef, and an E4
// heterogeneous `pieces` moment (kind-guarded: the worker serializes from
// `pieces` first, so a composed moment's copy must swap there too or the
// replacement dies on the round-trip). Idempotent: a record already carrying
// the replacement key answers replaced:false and is returned untouched, so a
// re-applied mirror can never double-swap. No I/O — unit-tested directly.
export function replaceVideoRefInRecord(record, { refKey, next } = {}) {
  if (!record || typeof record !== 'object') return { record, replaced: false }
  if (!refKey || typeof refKey !== 'string') return { record, replaced: false }
  if (!next || typeof next !== 'object' || typeof next.key !== 'string' || !next.key) {
    return { record, replaced: false }
  }
  const carriesNew = (r) => !!r && typeof r === 'object' && r.key === next.key
  if (
    carriesNew(record.photoRef) ||
    record.photoRefs?.some?.(carriesNew) ||
    record.pieces?.some?.(carriesNew)
  ) {
    return { record, replaced: false } // already applied — never double-swap
  }
  // The capture-identity choice above: the replacement never brings its own
  // capturedAt; the original ref's stays (or its absence stays — the memory-
  // level capturedAt governs the album either way).
  const { capturedAt: _droppedCapturedAt, ...swap } = next
  const isVideoRef = (r) =>
    !!r &&
    typeof r === 'object' &&
    (r.kind === 'video' ||
      (typeof r.mime === 'string' && r.mime.startsWith('video/')) ||
      typeof r.posterKey === 'string' ||
      typeof r.posterUrl === 'string')
  let replaced = false
  const patchRef = (r) => {
    if (!isVideoRef(r) || r.key !== refKey) return r
    replaced = true
    return { ...r, ...swap }
  }
  const patchPiece = (p) => {
    // Kind-guarded like preserveLocalPhotoMeta's pieces pass — a key collision
    // across kinds must never graft video fields onto a photo/voice/note piece.
    if (!p || p.kind !== 'video' || p.key !== refKey) return p
    replaced = true
    return { ...p, ...swap }
  }
  const out = { ...record }
  if (Array.isArray(record.pieces)) out.pieces = record.pieces.map(patchPiece)
  if (Array.isArray(record.photoRefs) && record.photoRefs.length) {
    out.photoRefs = record.photoRefs.map(patchRef)
    // Keep the back-compat mirror in step (same rule as removePhotoFromRecord):
    // readers that still expect the single field must see the swapped ref when
    // the video was photoRefs[0].
    out.photoRef = out.photoRefs[0]
  } else if (record.photoRef) {
    out.photoRef = patchRef(record.photoRef)
  }
  return replaced ? { record: out, replaced: true } : { record, replaced: false }
}

// The 409 reapply for a swap (exported for unit tests, like moveReapply): on a
// conflict, re-apply ONLY this replacement onto the FRESH server row — a
// caption or reaction another device changed meanwhile must ride fresh, never
// be clobbered by our stale copy. Returning null = "fresh already satisfies
// (or no longer holds) this video" → the recovery adopts fresh and pushes
// nothing: a fresh row that already carries the new key was swapped by an
// earlier attempt; a fresh row missing the OLD key had the video removed (or
// re-replaced) elsewhere, and forcing our copy back would resurrect a deleted
// photo. In that adopt-fresh case the uploaded replacement becomes an orphaned
// R2 object — same orphan class as every replaced original (see
// replaceMemoryVideoRef below); worker-side cleanup is deliberately not built.
export function replaceVideoRefReapply(refKey, next) {
  return (fresh) => {
    const { record: r, replaced } = replaceVideoRefInRecord(fresh, { refKey, next })
    return replaced ? { ...r, updatedAt: new Date().toISOString() } : null
  }
}

// Swap a stored video's ref in place on a memory (the author-only "add it
// again with sound" flow — the caller gates authorship; the worker enforces
// it too). Finds the record in the shared zone, else any private bucket
// (mirrors updateMemoryPoster's by-id search), applies the pure swap, and
// re-mirrors with the honest-sync pattern: local write + queued mirror whose
// 409 reapply survives conflicts. A failed mirror queues a plain 'save'
// intent (scheduleMirror's default) — sufficient because a save replay pushes
// the CURRENT local record, and the swapped ref rides the record itself.
//
// THE REPLACED R2 OBJECT (the silent .mp4, and its poster once a new one
// lands) IS ORPHANED BY DESIGN: nothing references it after the swap, and no
// deletion is issued — worker-side R2 cleanup is out of scope for this flow.
// Orphan class: "replaced-video-asset" (a future sweep can find keys no
// memory row references).
export function replaceMemoryVideoRef(memoryId, { refKey, next } = {}) {
  if (!memoryId || !refKey || !next?.key) return { status: 'not-found' }
  const tryUpdateIn = (key) => {
    const list = readJson(key)
    const idx = list.findIndex((m) => m.id === memoryId)
    if (idx < 0) return null
    if (list[idx].masked) return { status: 'not-found' } // never patch a masked projection
    const { record: patched, replaced } = replaceVideoRefInRecord(list[idx], { refKey, next })
    if (!replaced) return { status: 'video-not-found' }
    patched.updatedAt = new Date().toISOString()
    list[idx] = patched
    writeJson(key, list)
    scheduleMirror({
      type: 'save',
      record: patched,
      reapply: replaceVideoRefReapply(refKey, next),
    })
    return { status: 'replaced', record: patched }
  }
  const inShared = tryUpdateIn(SHARED_KEY)
  if (inShared) return inShared
  for (const traveler of ALL_TRAVELERS) {
    const result = tryUpdateIn(PRIVATE_KEY(traveler))
    if (result) return result
  }
  return { status: 'not-found' }
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
  if (list[idx].masked) return list[idx] // never patch a masked projection
  const now = new Date().toISOString()
  const patched = { ...list[idx], revealed: now, updatedAt: now }
  list[idx] = patched
  writeJson(SHARED_KEY, list)
  // On a 409, set `revealed` on the fresh row — but keep an existing reveal if one
  // already landed (reveal is one-way; don't move the timestamp backward/forward).
  scheduleMirror({
    type: 'save',
    record: patched,
    reapply: (fresh) => ({ ...fresh, revealed: fresh.revealed || now, updatedAt: new Date().toISOString() }),
  })
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
