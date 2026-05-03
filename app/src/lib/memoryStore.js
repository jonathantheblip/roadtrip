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
//     createdAt, updatedAt }
// photoRefs is the multi-photo album form (Helen's thread composer);
// photoRef stays as a back-compat mirror of photoRefs[0] for any reader
// that hasn't been updated to handle the array.
//
// Backward compatibility: pre-§4 records have no `kind`. Read paths
// treat missing `kind` as 'text'. New writes always set `kind`.

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
export function listMemoriesForTrip(tripId, traveler) {
  const shared = readJson(SHARED_KEY).filter((m) => m.tripId === tripId)
  const own = traveler ? readJson(PRIVATE_KEY(traveler)).filter((m) => m.tripId === tripId) : []
  return [...shared, ...own].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
}

// Same, scoped to one stop.
export function listMemoriesForStop(stopId, traveler) {
  const shared = readJson(SHARED_KEY).filter((m) => m.stopId === stopId)
  const own = traveler ? readJson(PRIVATE_KEY(traveler)).filter((m) => m.stopId === stopId) : []
  return [...shared, ...own].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
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
      if (!existing || (r.updatedAt && r.updatedAt > existing.updatedAt)) {
        bucket.set(r.id, r)
        added += 1
      }
    } else {
      const existing = sharedMap.get(r.id)
      if (!existing || (r.updatedAt && r.updatedAt > existing.updatedAt)) {
        sharedMap.set(r.id, r)
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

// Single-entry convenience: load the active traveler's memory for a stop
// (the most recent one they authored). Used by StopDetail.
export function loadOwnMemoryForStop(stopId, traveler) {
  const own = readJson(PRIVATE_KEY(traveler))
  const sharedOwn = readJson(SHARED_KEY).filter(
    (m) => m.authorTraveler === traveler && m.stopId === stopId
  )
  const ownAtStop = own.filter((m) => m.stopId === stopId)
  const merged = [...ownAtStop, ...sharedOwn].sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : -1
  )
  return merged[0] || null
}
