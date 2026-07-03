// Upload queue — IndexedDB-backed persistent queue for dispatch
// uploads that couldn't go straight to the Worker (network drop,
// quota error, Worker 5xx). Survives PWA close. Drained either
// in-app (drain() called by AddDispatchModal after a successful save)
// or by the service worker's Background Sync handler when the
// network returns.
//
// Each queued item carries everything needed to re-attempt the
// upload + write the memory: the compressed blob, the kind
// ('photo' | 'video'), the target memoryId, and the memory record
// to write once the asset URL is back. We never re-encode on retry —
// the blob is already optimal at queue time.

import { logUploadEvent } from './uploadLog.js'

const DB_NAME = 'roadtrip-upload-queue'
const DB_VERSION = 1
const STORE = 'pending'

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('queuedAt', 'queuedAt')
      }
    }
    req.onerror = () => reject(req.error || new Error('IDB open failed'))
    req.onsuccess = () => resolve(req.result)
  })
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE)
}

function asPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IDB op failed'))
  })
}

// Add a queued item. `item.id` is the unique key — typically the
// memory id so a retry of an already-queued upload is a no-op.
// Returns the stored record. `lastErrorCode` is the dispatchErrors
// classify code from the most recent attempt; the dev-mode upload log
// uses it to group entries by failure reason.
export async function enqueue(item) {
  if (!item?.id) throw new Error('enqueue: item.id required')
  const record = {
    queuedAt: Date.now(),
    attempts: 0,
    lastError: null,
    lastErrorCode: null,
    ...item,
  }
  const db = await openDb()
  try {
    await asPromise(tx(db, 'readwrite').put(record))
    notifyListeners()
    return record
  } finally {
    db.close()
  }
}

async function list() {
  let db
  try {
    db = await openDb()
  } catch {
    return []
  }
  try {
    const all = await asPromise(tx(db, 'readonly').getAll())
    return Array.isArray(all) ? all : []
  } finally {
    db.close()
  }
}

export async function count() {
  const items = await list()
  return items.length
}

async function remove(id) {
  const db = await openDb()
  try {
    await asPromise(tx(db, 'readwrite').delete(id))
    notifyListeners()
  } finally {
    db.close()
  }
}

async function update(id, patch) {
  const db = await openDb()
  try {
    const store = tx(db, 'readwrite')
    const existing = await asPromise(store.get(id))
    if (!existing) return null
    const next = { ...existing, ...patch }
    await asPromise(store.put(next))
    notifyListeners()
    return next
  } finally {
    db.close()
  }
}

// ─── self-heal: drop items that can never succeed ───────────────────
//
// A queued VIDEO is a legitimate, storable clip ONLY if it is a real SHRUNK
// file, and the on-import encoder ALWAYS outputs a `video/mp4` blob. So the
// only doomed videos are those that never went through the shrinker: a RAW
// container (e.g. video/quicktime — a stranded .mov from an older build) or an
// item with no blob at all. Those can't be stored and would otherwise retry
// forever, so we purge them. Photos are always tiny + legitimate; never touched.
//
// CRITICAL: we NEVER delete a valid `video/mp4` on SIZE. The shrinker has no
// duration cap yet, so a long home video legitimately encodes to a LARGE mp4 —
// and a large-but-valid clip that's only in the queue because its upload failed
// is the FAMILY'S ONLY COPY. Deleting it on size would be permanent data loss
// (a 6-min recital → ~91MB valid mp4 → gone). Bounding size is the upload
// firewall's job (guarantee #1), and the firewall REFUSES (non-destructive) —
// it never deletes the sole copy. So the ONLY survivors here are valid mp4s (and
// photos): zero false positives against real encoder output. Pure + exported so
// it's unit-testable without a real IndexedDB.
export function isDoomedVideoItem(item) {
  if (!item || item.kind !== 'video') return false
  const b = item.blob
  if (!b) return true // nothing to upload — dead weight
  if (b.type !== 'video/mp4') return true // raw container (e.g. video/quicktime) — never shrunk
  return false // a valid mp4 is KEPT regardless of size (size is the firewall's job, not a delete)
}

// After this many failed attempts a (non-doomed) item is considered STUCK and
// reported for the honest "clip couldn't upload" surface (guarantee #2). We do
// NOT abandon it — a legit clip that failed during an outage must still upload
// when the network returns; abandoning would strand real family memories. So the
// threshold only drives the honest report, never a permanent skip. (Genuinely
// un-storable items are handled by healQueue, which removes them outright.)
export const STUCK_AFTER_ATTEMPTS = 6

export function isStuckItem(item) {
  return (item?.attempts || 0) >= STUCK_AFTER_ATTEMPTS
}

// Scan the queue and remove every doomed item (see isDoomedVideoItem). Each
// removal is logged to the dev upload log so a purge is traceable, never a
// silent disappearance. Returns the purged records' metadata. Best-effort: a
// removal that throws is left for the next heal. Called at the top of every
// drain so no caller can forget it.
export async function healQueue() {
  let items
  try {
    items = await list()
  } catch {
    return []
  }
  const purged = []
  for (const item of items) {
    if (!isDoomedVideoItem(item)) continue
    try {
      await remove(item.id)
      const size = item.blob?.size ?? null
      const type = item.blob?.type ?? null
      purged.push({ id: item.id, size, type })
      logUploadEvent({
        code: 'purged-raw-leftover',
        message: `dropped un-shrunk queued video (${size ?? '?'} bytes, ${type || 'no-type'}) — can never be stored`,
        fileMeta: { size, type },
        context: { phase: 'queue-heal', id: item.id, attempts: item.attempts ?? 0 },
      })
    } catch {
      /* leave it for the next heal pass */
    }
  }
  return purged
}

// Drain pass — attempt every queued item in order. `runner` takes
// the queued record and returns a Promise. On success the item is
// removed; on failure the attempts counter increments and the next
// item still runs (one bad item doesn't block the rest). Returns
// `{ drained, remaining, failures }` for the UI to surface.
//
// `lastErrorCode` is stamped onto the queue record when the thrown
// error exposes `.code`. The drain caller (PhotosView triggerDrain,
// SW sync handler) classifies generic errors before re-throwing so the
// code lands here without us re-importing the classifier.
//
// SINGLE-FLIGHT across ALL callers. There are several drain entry points —
// App.jsx's background drain (online / visibilitychange / interval / SW
// message) and PhotosView's sync-pill tap — each with its own UI guard. Those
// guards don't see each other, so a pill tap coinciding with a background drain
// could run two passes that BOTH pick up the same queued item: each POSTs the
// blob (the Worker mints a fresh R2 key per upload), so the photo lands in R2
// twice and the slower save loses, orphaning an object. This module-level guard
// serializes every drain through one owner — the check + claim are synchronous
// (set before the first await), so a concurrent caller deterministically no-ops
// and lets the in-flight pass drain the whole queue.
let draining = false
export async function drain(runner) {
  if (typeof runner !== 'function') {
    throw new Error('drain: runner function required')
  }
  if (draining) {
    return { drained: 0, remaining: await count(), failures: [], stuck: [], purged: 0, skipped: true }
  }
  draining = true
  try {
    // Self-heal FIRST: drop doomed raw leftovers so they neither retry forever
    // nor (now that multipart works) succeed at storing a raw giant.
    const purged = await healQueue()
    const items = await list()
    // FIFO so the photo Helen took first goes up first.
    items.sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0))
    let drained = 0
    const failures = []
    const stuck = []
    for (const item of items) {
      try {
        await runner(item)
        await remove(item.id)
        drained += 1
      } catch (err) {
        // Retry ALWAYS (offline-safe): a legit clip that failed during an outage
        // must still go up when the network returns — never abandoned. But once
        // it has failed enough times, report it as stuck so guarantee #2 can be
        // honest ("a clip couldn't upload") instead of failing in silence.
        const attempts = (item.attempts || 0) + 1
        await update(item.id, {
          attempts,
          lastError: err?.message || String(err),
          lastErrorCode: err?.code || item.lastErrorCode || null,
        })
        failures.push({
          id: item.id,
          error: err?.message || String(err),
          code: err?.code || null,
        })
        if (attempts >= STUCK_AFTER_ATTEMPTS) {
          stuck.push({ id: item.id, attempts, code: err?.code || null })
        }
      }
    }
    const remaining = await count()
    return { drained, remaining, failures, stuck, purged: purged.length }
  } finally {
    draining = false
  }
}

// Try to register a Background Sync so the SW drains us when network
// returns. Browsers without the API (Safari) just no-op — the in-app
// drain on next online event covers them.
export async function registerBackgroundSync(tag = 'rt-upload-queue') {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false
  try {
    // serviceWorker.ready never resolves when registration was skipped
    // (Playwright runs, dev configurations). Bound the wait so a queue
    // attempt doesn't hang waiting for an SW that's never coming.
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('sw ready timeout')), 1500)
      ),
    ])
    if (!reg?.sync) return false
    await reg.sync.register(tag)
    return true
  } catch {
    return false
  }
}

// ─── React-friendly subscription ─────────────────────────────────────
//
// PhotosView's sync pill subscribes to count changes so it updates
// the moment something is queued or drained — without polling.

const listeners = new Set()
function notifyListeners() {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      /* listener bug; don't break the queue */
    }
  }
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
