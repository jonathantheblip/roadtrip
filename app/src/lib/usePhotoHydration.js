// Read-back hydration for offline-imported photos/videos — the ONE shared step
// that makes a `pending` tile show its real picture again after an offline
// relaunch.
//
// When a photo is imported while offline it's parked in the upload queue AND
// copied into the idb asset store (lib/memAssets), and its ref is left
// storage:'pending' with a SESSION object URL for the immediate in-session
// render. That object URL dies the moment the app reloads — so after an offline
// relaunch the persisted ref carries a dead `blob:` url and the album tile shows
// a skeleton/icon (the reported bug). For a video the same is true of the poster.
//
// This hook closes that gap in ONE place for every album surface: for any
// pending/idb-backed ref it loads the real blob back from idb, mints a fresh
// object URL, and returns a hydrated COPY of the memories so the existing
// flattenPhotoEntries → groupByStop render path paints the real picture. A
// re-render fires as each blob resolves. flattenPhotoEntries stays pure /
// Node-testable — hydration happens on the memories BEFORE they reach it, never
// inside it.
//
// The url cache is module-level: the same offline photo can appear on several
// surfaces at once (PhotosView + AllPhotosView) and one object URL per blob is
// enough. Cache entries for keys that later drain to R2 simply go unused; the
// app's scale (a family trip) doesn't warrant eager revocation.
import { useEffect, useMemo, useState } from 'react'
import { refIdbAssetKey } from './photoEntries.js'

const urlCache = new Map() // idbAssetKey -> object URL ('' = loaded-but-missing)
const inflight = new Map() // idbAssetKey -> Promise (de-dupes concurrent loads)
const subscribers = new Set() // mounted hooks to re-render when a blob resolves

function notifySubscribers() {
  for (const fn of subscribers) {
    try {
      fn()
    } catch {
      /* a subscriber bug must not break the cache */
    }
  }
}

// Load one idb blob into the shared cache, then re-render EVERY mounted hook —
// not just the one whose effect kicked it off. The cache is module-level, so a
// load started by one surface (or by an effect that React then unmounted, e.g.
// a StrictMode double-invoke) must still repaint whichever instance is on screen.
// Dedupes via `inflight` so concurrent surfaces don't double-load the same key.
function ensureKeyLoaded(key) {
  if (urlCache.has(key) || inflight.has(key)) return
  const p = (async () => {
    try {
      // Lazy import keeps the idb asset layer out of this module's static graph,
      // so the pure hydration logic stays Node-importable for unit tests.
      const { loadAsset } = await import('./memAssets.js')
      const blob = await loadAsset('photo', key)
      urlCache.set(key, blob ? URL.createObjectURL(blob) : '')
    } catch {
      urlCache.set(key, '') // missing/failed — render falls back, never retries forever
    } finally {
      inflight.delete(key)
      notifySubscribers()
    }
  })()
  inflight.set(key, p)
}

function refsOf(memory) {
  const out = []
  if (memory?.photoRef) out.push(memory.photoRef)
  if (Array.isArray(memory?.photoRefs)) {
    for (const r of memory.photoRefs) if (r) out.push(r)
  }
  return out
}

// Replace a pending/idb ref's render url with the resolved idb object URL (a
// video hydrates its poster). `urlForKey(idbKey)` returns the object URL for a
// loaded blob, or a falsy value when it hasn't resolved / is missing. Returns
// { ref, changed } so the caller can keep the original object identity when
// nothing changed (downstream useMemo stability). PURE — no idb, no React — so
// it's unit-testable; the hook supplies urlForKey from its module cache.
export function hydrateRefWith(ref, urlForKey) {
  if (!ref) return { ref, changed: false }
  const key = refIdbAssetKey(ref)
  if (!key) return { ref, changed: false }
  const url = urlForKey(key)
  if (!url) return { ref, changed: false } // not loaded yet, or blob missing
  if (ref.kind === 'video') {
    if (ref.posterUrl === url) return { ref, changed: false }
    return { ref: { ...ref, posterUrl: url }, changed: true }
  }
  if (ref.url === url) return { ref, changed: false }
  return { ref: { ...ref, url }, changed: true }
}

// Hydrate a memories array's pending/idb photo refs from `urlForKey`. Returns
// the SAME array identity when nothing changed (so callers' downstream useMemos
// don't recompute). PURE — the React/idb wiring lives in the hook below.
export function hydrateMemoriesWith(list, urlForKey) {
  let anyChanged = false
  const out = (list || []).map((m) => {
    const hp = hydrateRefWith(m.photoRef, urlForKey)
    const hrs = Array.isArray(m.photoRefs)
      ? m.photoRefs.map((r) => hydrateRefWith(r, urlForKey))
      : null
    const refsChanged = hp.changed || (hrs ? hrs.some((r) => r.changed) : false)
    if (!refsChanged) return m
    anyChanged = true
    return {
      ...m,
      ...(m.photoRef ? { photoRef: hp.ref } : {}),
      ...(hrs ? { photoRefs: hrs.map((r) => r.ref) } : {}),
    }
  })
  return anyChanged ? out : list || []
}

function cacheUrlForKey(key) {
  return urlCache.get(key)
}

// Hydrate a memories array for render. Pass whatever a surface already reads
// (listMemoriesForTrip / listAllLocalMemories result); get back the same array
// with offline `pending` refs' render urls filled from idb as the blobs load.
export function useHydratedMemories(memories) {
  const list = useMemo(() => memories || [], [memories])
  const [tick, setTick] = useState(0)

  // The idb keys this set of memories needs loaded. Stable string so the effect
  // only re-runs when the actual key set changes, not on every render.
  const neededKeys = useMemo(() => {
    const keys = []
    for (const m of list) {
      for (const ref of refsOf(m)) {
        const k = refIdbAssetKey(ref)
        if (k) keys.push(k)
      }
    }
    return Array.from(new Set(keys))
  }, [list])
  const neededSig = neededKeys.join('|')

  useEffect(() => {
    // Subscribe FIRST so a load that resolves between mount and the kick-off
    // below still re-renders us; unsubscribe on unmount so no setState lands on
    // an unmounted instance. The shared loader handles dedup + notify.
    const onResolved = () => setTick((t) => t + 1)
    subscribers.add(onResolved)
    for (const key of neededKeys) ensureKeyLoaded(key)
    return () => {
      subscribers.delete(onResolved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neededSig])

  // Recompute when the memories change OR a blob resolves (tick bump → fresh
  // urlCache read inside hydrateMemoriesWith).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => hydrateMemoriesWith(list, cacheUrlForKey), [list, tick])
}
