import { useEffect, useState } from 'react'
import {
  getEnrollment,
  getFacesByKey,
  enrolledCentroids,
  getRejections,
  computeFaceTags,
} from './faceIndex'
import { runRecognitionPass } from './faceRecognize'
import { DEFAULT_MATCH_THRESHOLD } from './faceMatch'
import { initFaceEngine } from './faceModel'

// useFaceTags — ambient "who's in the frame" tagging for the Photos tab.
//
// Design authority (family-trips-hangout §3): photos are tagged by who's in
// the frame. When the family has enrolled faces ("Show me, me"), opening the
// Photos tab quietly:
//   1. reads the on-device face index and shows tags for already-scanned shots,
//   2. runs a lazy, incremental, on-device scan of any not-yet-scanned photos
//      (reusing the proven recognizer), then refreshes the tags.
//
// Everything stays on the device (the model runs locally; the index is local
// IndexedDB; nothing leaves). NO enrolled faces → no scan, no tags (the overlay
// simply doesn't appear). The model load is failure-tolerant: where the model
// isn't available (e.g. a plain test browser) the scan is skipped and whatever
// is already indexed still shows.
//
// Returns { [entryKey]: [personId, …] }.
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
      setTags(computeFaceTags(entries, facesByKey, centroids, DEFAULT_MATCH_THRESHOLD, rejections))
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
