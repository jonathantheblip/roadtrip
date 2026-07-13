// faceIndex.js — the on-device "who's in the frame" data layer. The one
// place the recognizer's results live, and the one query PersonView
// ("Show me, me") asks: photosWith(personId).
//
// Stored in IndexedDB, LOCAL-ONLY — nothing here ever leaves the iPad
// (the load-bearing kids'-privacy promise — see faceModel.js for the full,
// precise contract). Three stores:
//   • ENROLLMENT  — each family member's reference face embeddings, from
//     the "teach the app your family" step.
//   • FACES       — per photo (keyed by the flattened-entry key), the
//     face embeddings + boxes the recognition pass found.
//   • CLUSTERS    — personId → pseudonymous `fc_N` id (Build W4, faces).
//     The mapping itself never leaves this store; only the fc_N SIDE of it
//     is ever handed to a sync-facing sanitizer (exifRead.js's
//     sanitizeFaces), from useFaceTags.js.
//
// Matching embeddings → people happens at READ time against the CURRENT
// enrollment (selectPhotosWith below), so adding a reference face
// re-decides every photo instantly without re-running the model — the
// scan (detect + embed) is the expensive part and is done once per photo.

import { enrollPerson, matchToEnrolled } from './faceMatch.js'

const DB_NAME = 'rt-faces'
const DB_VERSION = 3
const STORE_ENROLL = 'enrollment'
const STORE_FACES = 'faces'
// corrections — "this photo is NOT person X" overrides (keyed
// `${entryKey}::${personId}`), so a wrong match can be removed.
const STORE_CORRECT = 'corrections'
// personId → { personId, fcId } (Build W4) — see the header CLUSTERS entry.
const STORE_CLUSTER = 'clusters'

let dbPromise = null
function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_ENROLL)) db.createObjectStore(STORE_ENROLL)
      if (!db.objectStoreNames.contains(STORE_FACES)) db.createObjectStore(STORE_FACES)
      if (!db.objectStoreNames.contains(STORE_CORRECT)) db.createObjectStore(STORE_CORRECT)
      if (!db.objectStoreNames.contains(STORE_CLUSTER)) db.createObjectStore(STORE_CLUSTER)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function reqP(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
async function idbGet(store, key) {
  const db = await openDb()
  return reqP(db.transaction(store).objectStore(store).get(key))
}
async function idbGetAll(store) {
  const db = await openDb()
  return reqP(db.transaction(store).objectStore(store).getAll())
}
async function idbPut(store, key, val) {
  const db = await openDb()
  const t = db.transaction(store, 'readwrite')
  t.objectStore(store).put(val, key)
  return new Promise((res, rej) => {
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}
async function idbDelete(store, key) {
  const db = await openDb()
  const t = db.transaction(store, 'readwrite')
  t.objectStore(store).delete(key)
  return new Promise((res, rej) => {
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}
async function idbGetAllKeys(store) {
  const db = await openDb()
  return reqP(db.transaction(store).objectStore(store).getAllKeys())
}
// ─── enrollment ───────────────────────────────────────────────────

// { [personId]: { personId, embeddings: Float32Array[], thumbs: string[] } }
export async function getEnrollment() {
  const rows = await idbGetAll(STORE_ENROLL)
  const out = {}
  for (const r of rows) out[r.personId] = r
  return out
}

// Add one reference face for a person (an embedding + a small thumb for
// the UI). Appends to their exemplars.
export async function addExemplar(personId, embedding, thumb) {
  const cur = (await idbGet(STORE_ENROLL, personId)) || {
    personId,
    embeddings: [],
    thumbs: [],
  }
  cur.embeddings = [...cur.embeddings, embedding]
  cur.thumbs = [...cur.thumbs, thumb].slice(-12)
  await idbPut(STORE_ENROLL, personId, cur)
  return cur
}

// Reference centroid per enrolled person → [{ personId, centroid, count }].
// This is what matching compares a face against.
export async function enrolledCentroids() {
  const enrollment = await getEnrollment()
  return Object.values(enrollment)
    .filter((p) => p.embeddings.length > 0)
    .map((p) => enrollPerson(p.personId, p.embeddings))
}

// ─── scanned faces ────────────────────────────────────────────────

// Record the faces found in one photo (keyed by its flattened-entry key).
// faces: [{ embedding: Float32Array, box: [x,y,w,h], score }]
export async function setScannedFaces(entryKey, faces) {
  await idbPut(STORE_FACES, entryKey, { key: entryKey, faces, scannedAt: nowSafe() })
}

// All scanned records as a map { key → record }.
export async function getFacesByKey() {
  const rows = await idbGetAll(STORE_FACES)
  const map = {}
  for (const r of rows) map[r.key] = r
  return map
}

// The set of entry keys already scanned (for incremental scanning).
export async function getScannedKeys() {
  const rows = await idbGetAll(STORE_FACES)
  return new Set(rows.map((r) => r.key))
}

// ─── corrections ──────────────────────────────────────────────────

const rejKey = (entryKey, personId) => `${entryKey}::${personId}`

// "This photo is NOT person X" — removes it from X's results.
export async function addRejection(entryKey, personId) {
  await idbPut(STORE_CORRECT, rejKey(entryKey, personId), 1)
}
// Undo a rejection.
export async function removeRejection(entryKey, personId) {
  await idbDelete(STORE_CORRECT, rejKey(entryKey, personId))
}
// All rejections as a Set of `${entryKey}::${personId}`.
export async function getRejections() {
  return new Set(await idbGetAllKeys(STORE_CORRECT))
}

// ─── pseudonymous cluster ids (Build W4 — faces) ───────────────────
//
// personId → `fc_N`, assigned once (first-seen order) and never reused or
// reassigned. LOCAL-ONLY, same store discipline as everything else in this
// file — see the header. Only the fc_N SIDE of this map is ever handed to
// a sync-facing sanitizer (exifRead.js's sanitizeFaces); the map itself —
// and therefore which fc_N belongs to which family member — never leaves
// this device.

export const FACE_ID_RE = /^fc_[0-9]{1,3}$/

// { [personId]: 'fc_N' } for every person assigned a cluster id so far.
export async function getClusterMap() {
  const rows = await idbGetAll(STORE_CLUSTER)
  const map = {}
  for (const r of rows) if (r?.personId && typeof r.fcId === 'string') map[r.personId] = r.fcId
  return map
}

// PURE — the next unused fc_N given the ids already assigned (max + 1, so an
// id is never reused even if a mapping were ever removed). Exported for a
// direct unit test without touching IndexedDB.
export function nextClusterId(existingIds) {
  let max = 0
  for (const id of existingIds || []) {
    if (typeof id === 'string' && FACE_ID_RE.test(id)) max = Math.max(max, parseInt(id.slice(3), 10))
  }
  return `fc_${max + 1}`
}

// Ensure every personId in the list has an assigned cluster id, assigning
// new ones (next free fc_N) for any that don't yet. Returns the FULL updated
// map — existing assignments are never touched, only added to.
export async function ensureClusterIds(personIds) {
  const map = await getClusterMap()
  const missing = [...new Set(personIds || [])].filter((p) => p && !map[p])
  for (const personId of missing) {
    const fcId = nextClusterId(Object.values(map))
    map[personId] = fcId
    await idbPut(STORE_CLUSTER, personId, { personId, fcId })
  }
  return map
}

// PURE — personId tags → the pseudonymous ids allowed to ride a ref: drop
// anyone with no assigned cluster id yet, dedup, cap (mirrors the sync
// sanitizer's own cap — belt + suspenders, not the enforcement point, which
// is worker/src/index.js's photoFacesMode gate). Sorted by cluster-id number
// for a deterministic ref — never person/enrollment order, which would leak
// which family member enrolled first for no reason. Exported for a direct
// unit test without touching IndexedDB.
export const FACES_SYNC_MAX = 10
export function clusterIdsFor(personIds, clusterMap) {
  const ids = [...new Set(
    (personIds || [])
      .map((p) => clusterMap?.[p])
      .filter((id) => typeof id === 'string' && FACE_ID_RE.test(id))
  )]
  ids.sort((a, b) => parseInt(a.slice(3), 10) - parseInt(b.slice(3), 10))
  return ids.slice(0, FACES_SYNC_MAX)
}

// ─── the query ────────────────────────────────────────────────────

// PURE — given photo entries, the scanned-faces map, enrolled centroids,
// a person, and the user's "not X" corrections, return the entries that
// contain that person, each with the matching face's box (best-light
// sizing) and similarity. Re-run any time enrollment / threshold /
// corrections change; no model needed. → [{ entry, similarity, box }]
export function selectPhotosWith(entries, facesByKey, centroids, personId, threshold, rejections) {
  const rej = rejections instanceof Set ? rejections : null
  const out = []
  for (const e of entries) {
    if (rej && rej.has(rejKey(e.key, personId))) continue
    const rec = facesByKey[e.key]
    if (!rec || !rec.faces?.length) continue
    let best = null
    for (const f of rec.faces) {
      const m = matchToEnrolled(f.embedding, centroids, { threshold })
      if (m && m.personId === personId && (!best || m.similarity > best.similarity)) {
        best = { similarity: m.similarity, box: f.box }
      }
    }
    if (best) out.push({ entry: e, similarity: best.similarity, box: best.box })
  }
  return out
}

// PURE — count how many entries each enrolled person appears in.
// → { [personId]: count }
export function personCounts(entries, facesByKey, centroids, threshold, rejections) {
  const counts = {}
  for (const c of centroids) {
    counts[c.personId] = selectPhotosWith(entries, facesByKey, centroids, c.personId, threshold, rejections).length
  }
  return counts
}

// PURE — the inverse of personCounts: who is in EACH photo, for the Photos-tab
// "who's in the frame" overlay. → { [entryKey]: [personId, …] } in centroid
// order (stable dot order). Uses the same matcher as selectPhotosWith; no model.
export function computeFaceTags(entries, facesByKey, centroids, threshold, rejections) {
  const byEntry = {}
  for (const c of centroids) {
    for (const m of selectPhotosWith(entries, facesByKey, centroids, c.personId, threshold, rejections)) {
      ;(byEntry[m.entry.key] ||= []).push(c.personId)
    }
  }
  return byEntry
}

function nowSafe() {
  try {
    return Date.now()
  } catch {
    return 0
  }
}
