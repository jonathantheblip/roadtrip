// Reliable video posters (BUG 2 part 2).
//
// When a video's poster (the still the tile shows) fails to upload — online, or
// when the offline queue drains — the video has already synced WITHOUT a still,
// and nothing retried it: the family saw a fallback icon forever. This module
// makes the poster eventually land. On a failed poster upload we persist the
// poster jpeg to idb + a small marker; drainPendingPosters() re-uploads it and
// patches the (already-synced) memory's ref via updateMemoryPoster, so the real
// frame appears everywhere. Strictly additive + best-effort — it never blocks or
// changes the video upload itself.
//
// The dependencies are injected (the real ones are loaded LAZILY, so this module
// stays Node-importable and its marker lifecycle is unit-testable without a
// network, idb, or the browser-coupled workerSync/memAssets/memoryStore chain).

const KEY = 'rt_pending_posters_v1'
const MAX_ATTEMPTS = 8

let _realDeps = null
async function realDeps() {
  if (_realDeps) return _realDeps
  const [ws, ma, ms] = await Promise.all([
    import('./workerSync'),
    import('./memAssets'),
    import('./memoryStore'),
  ])
  _realDeps = {
    uploadPoster: ws.uploadPoster,
    saveAsset: ma.saveAsset,
    loadAsset: ma.loadAsset,
    removeAsset: ma.removeAsset,
    makeAssetKey: ma.makeAssetKey,
    updateMemoryPoster: ms.updateMemoryPoster,
  }
  return _realDeps
}

function readMarkers() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function writeMarkers(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage unavailable — nothing to retry from */
  }
}

export function pendingPosterCount() {
  return readMarkers().length
}

// Is a poster retry in flight for this memory? Lets a video tile show a gentle
// "thumbnail still uploading" hint (vs. a bare fallback icon) while we keep
// trying — and stop once it lands (the marker is cleared on success/give-up).
export function hasPendingPoster(memoryId) {
  if (!memoryId) return false
  return readMarkers().some((p) => p.memoryId === memoryId)
}

// Upload a poster; on ANY failure persist it + a marker for a later retry, then
// return null. Same `{posterKey,posterUrl}|null` contract as uploadPoster, so
// call sites swap in place with no other change.
export async function uploadPosterOrQueue(memoryId, posterBlob, opts = {}, deps) {
  deps = deps || (await realDeps())
  const poster = await deps.uploadPoster(memoryId, posterBlob, opts)
  if (poster) return poster
  if (!posterBlob) return null // nothing to retry (encode produced no poster)
  try {
    const posterIdbKey = deps.makeAssetKey('photo')
    await deps.saveAsset('photo', posterIdbKey, posterBlob, posterBlob.type || 'image/jpeg', { raw: true })
    const list = readMarkers().filter((p) => p.memoryId !== memoryId)
    list.push({ memoryId, posterIdbKey, asTraveler: opts.asTraveler || null, attempts: 0 })
    writeMarkers(list)
  } catch {
    /* idb unavailable → can't queue; the video keeps showing the fallback icon */
  }
  return null
}

// Retry every pending poster. On success, patch the synced memory's ref so the
// real still shows everywhere, then drop the marker + its idb orphan. On
// failure, bump attempts and give up after MAX_ATTEMPTS (a permanently dead
// poster must not retry forever). Returns { uploaded, remaining }.
export async function drainPendingPosters(deps) {
  const list = readMarkers()
  if (!list.length) return { uploaded: 0, remaining: 0 }
  // Don't burn the give-up budget while OFFLINE — an offline failure is
  // recoverable on reconnect, so an offline pass must NOT touch attempts or drop
  // markers (otherwise a flaky-network video loses its still forever, the exact
  // bug this set out to fix). Only genuine ONLINE failures count toward the cap.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { uploaded: 0, remaining: list.length, offline: true }
  }
  deps = deps || (await realDeps())
  let uploaded = 0
  const keep = []
  for (const p of list) {
    let blob = null
    try {
      blob = await deps.loadAsset('photo', p.posterIdbKey)
    } catch {
      /* fall through — treat as gone */
    }
    if (!blob) continue // poster blob is gone → drop the marker (can't retry)
    const poster = await deps.uploadPoster(
      p.memoryId,
      blob,
      p.asTraveler ? { asTraveler: p.asTraveler } : {}
    )
    if (poster) {
      deps.updateMemoryPoster(p.memoryId, poster.posterKey, poster.posterUrl)
      try {
        await deps.removeAsset('photo', p.posterIdbKey)
      } catch {
        /* orphan cleanup is best-effort */
      }
      uploaded += 1
    } else {
      const attempts = (p.attempts || 0) + 1
      if (attempts < MAX_ATTEMPTS) {
        keep.push({ ...p, attempts })
      } else {
        try {
          await deps.removeAsset('photo', p.posterIdbKey)
        } catch {
          /* give up — drop the idb orphan too */
        }
      }
    }
  }
  // Re-read before writing: a marker QUEUED concurrently during our awaits (a
  // live video import, or another drain) must not be clobbered by our blind
  // overwrite. We only own the memoryIds we actually processed this pass.
  const processed = new Set(list.map((p) => p.memoryId))
  const concurrent = readMarkers().filter((p) => !processed.has(p.memoryId))
  writeMarkers([...keep, ...concurrent])
  return { uploaded, remaining: keep.length + concurrent.length }
}
