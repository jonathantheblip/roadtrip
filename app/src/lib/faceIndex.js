// faceIndex.js — the on-device "who's in the frame" data layer. The one
// place the recognizer's results live, and the one query PersonView
// ("Show me, me") asks: photosWith(personId).
//
// Stored in IndexedDB, LOCAL-ONLY — nothing here ever leaves this device
// (the load-bearing family-privacy promise — see faceModel.js for the full,
// precise contract). Three stores:
//   • ENROLLMENT  — each family member's reference face embeddings, from
//     the "teach the app your family" step.
//   • FACES       — per photo (keyed by the flattened-entry key), the
//     face embeddings + boxes the recognition pass found.
//   • CORRECTIONS — "this photo is NOT person X" overrides.
// The cross-device face TAG (`fc2-…`) is no longer a stored mapping: it is a
// pure function of the shared family-member id (faceTagOf, below), so there
// is nothing per-device to persist or reconcile. (The old per-device `fc_N`
// CLUSTERS store is dropped on the DB_VERSION-4 upgrade.)
//
// Matching embeddings → people happens at READ time against the CURRENT
// enrollment (selectPhotosWith below), so adding a reference face
// re-decides every photo instantly without re-running the model — the
// scan (detect + embed) is the expensive part and is done once per photo.

import { enrollPerson, matchToEnrolled } from './faceMatch.js'

const DB_NAME = 'rt-faces'
const DB_VERSION = 4
const STORE_ENROLL = 'enrollment'
const STORE_FACES = 'faces'
// corrections — "this photo is NOT person X" overrides (keyed
// `${entryKey}::${personId}`), so a wrong match can be removed.
const STORE_CORRECT = 'corrections'
// Retired 2026-07-14 (keyless fc2 tags — BUILD_PLAN_FACES_KEYLESS.md): the old
// per-device `fc_N` map. Kept named only so the DB_VERSION-4 upgrade can drop
// the store on every device's next open.
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
      // Drop the retired per-device fc_N store (keyless cutover — the tag is
      // now a pure function of the personId; nothing to persist).
      if (db.objectStoreNames.contains(STORE_CLUSTER)) db.deleteObjectStore(STORE_CLUSTER)
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

// ─── pseudonymous cross-device face tags (Build W4 — faces; keyless 2026-07-14) ───
//
// A photo's face tag is a PURE, DETERMINISTIC function of the shared
// family-member id (`faceTagOf`) — the SAME on every device, with no key, no
// setup, and nothing to reconcile. This replaces the old per-device `fc_N`
// numbering, which assigned ids in local first-seen order and so DISAGREED
// across devices (false-bridging different people, false-splitting one
// person). Why no shared secret is needed: the tag's only job is cross-device
// SAMENESS for the engine's jaccard face dimension — not secrecy from a
// server that already holds the photos, times, and photographer. See
// BUILD_PLAN_FACES_KEYLESS.md.
//
// LOCAL-ONLY still holds for everything that matters: the raw embeddings and
// the id→person mapping never leave this device (faceModel.js's contract).
// Only the opaque `fc2-…` tag is ever handed to a sync-facing sanitizer
// (exifRead.js's sanitizeFaces), and only the worker's PHOTO_FACES_MODE gate
// decides whether even that reaches D1.

// PURE — the stable face tag for a family-member id: `fc2-` + a 64-bit FNV-1a
// hash (lowercase hex, zero-padded to 16). NOT a secret — a deterministic,
// non-crypto pseudonym, chosen so every device computes byte-identical tags
// from the id they already share. Total: any value in → a valid tag out.
export function faceTagOf(personId) {
  const bytes = new TextEncoder().encode(String(personId))
  let h = 0xcbf29ce484222325n // FNV-1a 64-bit offset basis
  const PRIME = 0x100000001b3n
  const MASK = 0xffffffffffffffffn
  for (const b of bytes) {
    h ^= BigInt(b)
    h = (h * PRIME) & MASK
  }
  return 'fc2-' + h.toString(16).padStart(16, '0')
}

// PURE — the person tags found in a photo → the `fc2-…` ids allowed to ride
// its ref: map each through faceTagOf, dedup, sort (lexicographic — stable,
// and uncorrelated with enrollment order so it leaks nothing about who
// enrolled first), cap at FACES_SYNC_MAX. No lookup map anymore: the tag IS a
// pure function of the id. The cap mirrors the sync sanitizer's own bound
// (belt + suspenders; the real enforcement point is worker/src/index.js's
// photoFacesMode gate). Exported for a direct unit test.
export const FACES_SYNC_MAX = 10
export function clusterIdsFor(personIds) {
  const ids = [...new Set(
    (personIds || [])
      .filter((p) => typeof p === 'string' && p.length > 0)
      .map((p) => faceTagOf(p))
  )]
  ids.sort()
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
