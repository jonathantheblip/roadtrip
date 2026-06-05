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
export async function drain(runner) {
  if (typeof runner !== 'function') {
    throw new Error('drain: runner function required')
  }
  const items = await list()
  // FIFO so the photo Helen took first goes up first.
  items.sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0))
  let drained = 0
  const failures = []
  for (const item of items) {
    try {
      await runner(item)
      await remove(item.id)
      drained += 1
    } catch (err) {
      await update(item.id, {
        attempts: (item.attempts || 0) + 1,
        lastError: err?.message || String(err),
        lastErrorCode: err?.code || item.lastErrorCode || null,
      })
      failures.push({
        id: item.id,
        error: err?.message || String(err),
        code: err?.code || null,
      })
    }
  }
  const remaining = await count()
  return { drained, remaining, failures }
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
