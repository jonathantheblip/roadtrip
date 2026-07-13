import { useEffect, useState } from 'react'
import {
  getEnrollment,
  getFacesByKey,
  enrolledCentroids,
  getRejections,
  computeFaceTags,
  ensureClusterIds,
  clusterIdsFor,
} from './faceIndex'
import { runRecognitionPass } from './faceRecognize'
import { DEFAULT_MATCH_THRESHOLD } from './faceMatch'
import { initFaceEngine } from './faceModel'
import { applyRefSidecar } from './memoryStore'

// useFaceTags — ambient "who's in the frame" tagging for the Photos tab.
//
// Design authority (family-trips-hangout §3): photos are tagged by who's in
// the frame. When the family has enrolled faces ("Show me, me"), opening the
// Photos tab quietly:
//   1. reads the on-device face index and shows tags for already-scanned shots,
//   2. runs a lazy, incremental, on-device scan of any not-yet-scanned photos
//      (reusing the proven recognizer), then refreshes the tags,
//   3. syncs a PSEUDONYMOUS cluster id per matched photo (Build W4, faces —
//      consented 2026-07-12) onto the ref via applyRefSidecar's existing
//      gap-fill seam — the same "additive, never overwrite" write every
//      other sidecar field uses.
//
// The model runs locally and the face index (raw embeddings + the id→person
// mapping) is local IndexedDB that never leaves the device — see
// faceModel.js's privacy contract for the precise, current promise. Step 3
// is the one thing that DOES reach the worker: an anonymous `fc_N` id, never
// a person's name, and it only actually lands in D1 once PHOTO_FACES_MODE is
// promoted past its shipped-OFF default — the worker's push whitelist drops
// `faces` entirely below 'on' (worker/src/index.js's photoFacesMode), so
// this hook always attempts the sync and the worker is the real gate. NO
// enrolled faces → no scan, no tags, no sync (the overlay simply doesn't
// appear). The model load is failure-tolerant: where the model isn't
// available (e.g. a plain test browser) the scan is skipped and whatever is
// already indexed still shows.
//
// Returns { [entryKey]: [personId, …] } — LOCAL personIds, for the on-screen
// overlay only; never what actually rides to the worker (see step 3 above).
export function useFaceTags(entries) {
  const [tags, setTags] = useState({})

  useEffect(() => {
    if (!entries || entries.length === 0) {
      setTags({})
      return
    }
    let cancelled = false
    const controller = new AbortController()

    async function recompute() {
      const [facesByKey, centroids, rejections] = await Promise.all([
        getFacesByKey(),
        enrolledCentroids(),
        getRejections(),
      ])
      if (cancelled || centroids.length === 0) return
      const computed = computeFaceTags(entries, facesByKey, centroids, DEFAULT_MATCH_THRESHOLD, rejections)
      setTags(computed)
      syncFaceClusterTags(entries, computed) // best-effort; never blocks the overlay
    }

    ;(async () => {
      const enrollment = await getEnrollment().catch(() => ({}))
      const enrolled = Object.values(enrollment || {}).some((p) => (p?.embeddings?.length || 0) > 0)
      if (cancelled || !enrolled) return // no enrolled faces → overlay stays off
      await recompute() // show what's already indexed, immediately
      try {
        await initFaceEngine() // loads the on-device model (no-op if already up)
        await runRecognitionPass(entries, { signal: controller.signal })
        if (!cancelled) await recompute()
      } catch {
        // Model unavailable (e.g. a browser without it) — keep whatever's
        // already indexed; the overlay just won't grow this session.
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [entries])

  return tags
}

// Best-effort sync of one recompute's matches as pseudonymous cluster ids
// onto each matched entry's ref (Build W4, faces) — never throws, never
// blocks the tagging overlay above. Assigns any missing personId→fc_N
// mappings (LOCAL, faceIndex.js), then gap-fills+pushes via
// applyRefSidecar's existing additive seam. Idempotent: applyRefSidecar
// only writes (and only then re-mirrors to the worker) when the ref doesn't
// already carry `faces`, so calling this on every recompute costs nothing
// once a photo's tags have synced once. Whether anything actually reaches
// D1 is decided entirely server-side by PHOTO_FACES_MODE — this function
// always attempts the sync; the worker silently drops it below 'on'.
async function syncFaceClusterTags(entries, tags) {
  try {
    const personIds = [...new Set(Object.values(tags).flat())]
    if (!personIds.length) return
    const clusterMap = await ensureClusterIds(personIds)
    for (const e of entries) {
      const matched = tags[e.key]
      if (!matched?.length || !e.memoryId || !e.refKey) continue
      const faces = clusterIdsFor(matched, clusterMap)
      if (faces.length) applyRefSidecar(e.memoryId, e.refKey, { faces })
    }
  } catch {
    // Local tags already rendered; a sync hiccup just retries next recompute.
  }
}
