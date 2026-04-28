// Shared IndexedDB asset store for Memory blobs (audio + photo).
// Keyed by an opaque random key referenced from the Memory record's
// audioRef / photoRef. Each kind lives in its own object store so we
// can index / quota-clear them independently.

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

export async function saveAsset(kind, key, blob, mime) {
  if (!STORES[kind]) throw new Error(`unknown asset kind: ${kind}`)
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORES[kind], 'readwrite')
    t.objectStore(STORES[kind]).put({
      key,
      blob,
      mime: mime || blob?.type || '',
      savedAt: Date.now(),
    })
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
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

export async function deleteAsset(kind, key) {
  if (!STORES[kind] || !key) return
  const db = await openDb()
  return new Promise((resolve) => {
    const t = db.transaction(STORES[kind], 'readwrite')
    t.objectStore(STORES[kind]).delete(key)
    t.oncomplete = () => resolve()
    t.onerror = () => resolve()
  })
}
