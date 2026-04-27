// Memory store. Pass 1 backs CloudKit-shaped APIs with localStorage so
// authoring works tonight. The signatures match what the CloudKit JS
// adapter will provide, so when the container is provisioned we swap
// the implementation without touching call sites.
//
// Visibility:
//   "shared"  → goes to the family-shared zone (now: localStorage shared key)
//   "private" → author-only, never appears for other travelers
//               (now: localStorage namespaced by traveler id)
//
// Schema (matches spec §4):
//   { id, stopId, tripId, authorTraveler, visibility, text,
//     photoExternalURLs, createdAt, updatedAt }

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
  text,
  photoExternalURLs = [],
}) {
  const now = new Date().toISOString()
  const key = visibility === 'private' ? PRIVATE_KEY(authorTraveler) : SHARED_KEY
  const list = readJson(key)

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

  const record = {
    id: id || makeId(),
    tripId,
    stopId,
    authorTraveler,
    visibility,
    text,
    photoExternalURLs,
    createdAt: existingShared?.createdAt || existingPriv?.createdAt || now,
    updatedAt: now,
  }

  // Re-read the target key (in case it was the one we just rewrote)
  const target = readJson(key)
  const idx = target.findIndex((m) => m.id === record.id)
  if (idx >= 0) target[idx] = record
  else target.push(record)
  writeJson(key, target)
  return record
}

export function deleteMemory(record) {
  const key =
    record.visibility === 'private' ? PRIVATE_KEY(record.authorTraveler) : SHARED_KEY
  const list = readJson(key).filter((m) => m.id !== record.id)
  writeJson(key, list)
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
