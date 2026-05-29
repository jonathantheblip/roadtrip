// Backfill upload pipeline. Takes the triage payload (the array of
// `{ file, exif, match, reattachOf, ... }` records the user kept
// checked) and routes each photo through the existing
// saveAsset → saveMemory plumbing.
//
// New photos land as fresh memory records, kind='photo', captioned
// blank (per spec — no auto-captions). Re-attach candidates (the
// vb3-4 case: existing D1 metadata rows with no photo) are detected
// by the triage layer and routed through this helper as updates to
// the existing record's `id` + photoRefs[], so we don't fork a
// duplicate.

import { saveAsset, makeAssetKey } from './memAssets'
import { saveMemory } from './memoryStore'
import { mergeRefIntoExisting } from './photoRefMerge'

// Run the backfill upload for one triage payload. Resolves after
// every photo has either been saved locally + queued for sync, or
// failed. Returns `{ ok, reattached, failed, errors }`.
//
// onProgress({ done, total, currentName }) is invoked once per
// photo as we step through.
export async function uploadBackfillPhotos({
  photos,
  trip,
  traveler,
  onProgress,
}) {
  const results = { ok: 0, reattached: 0, failed: 0, errors: [] }
  const total = photos.length
  if (total === 0) {
    onProgress?.({ done: 0, total: 0, currentName: null })
    return results
  }

  for (let i = 0; i < total; i++) {
    const entry = photos[i]
    const name = entry?.file?.name || ''
    onProgress?.({ done: i, total, currentName: name })

    try {
      const assetKey = makeAssetKey('photo')
      // saveAsset auto-downscales image inputs through the M2 pipeline
      // (see memAssets.js). We pass the raw File; it returns the IDB
      // key + the post-downscale mime.
      const { mime } = await saveAsset('photo', assetKey, entry.file)

      const capturedAt = entry?.exif?.capturedAt || null
      const ref = {
        key: assetKey,
        storage: 'idb',
        mime,
        capturedAt,
      }

      // Pick the stop assignment. An explicit `entry.stopId` (set by
      // the reconciliation layer, which binds photos to the FINAL
      // reconciled stops — including auto-added ones that didn't exist
      // at match time) always wins, even when it's null (interstitial).
      // Otherwise fall back to the raw matcher result: GPS+time /
      // time-only matches land on their stop; interstitial / deviation
      // store with stopId=null.
      const stopId =
        entry?.stopId !== undefined ? entry.stopId : entry?.match?.stopId || null

      if (entry.reattachOf) {
        // Re-attach: update the existing metadata-only memory by id,
        // preserving everything that was there. saveMemory's upsert
        // path keeps createdAt and rewrites updatedAt for us.
        const existing = entry.reattachOf
        const merged = mergeRefIntoExisting(existing, ref)
        saveMemory({
          id: existing.id,
          tripId: existing.tripId,
          stopId: existing.stopId,
          authorTraveler: existing.authorTraveler || traveler,
          visibility: existing.visibility || 'shared',
          kind: 'photo',
          caption: typeof existing.caption === 'string' ? existing.caption : '',
          photoExternalURLs: existing.photoExternalURLs || [],
          photoRefs: merged,
          capturedAt: capturedAt || existing.capturedAt || null,
          mood: existing.mood,
          reactions: existing.reactions || [],
        })
        results.reattached += 1
      } else {
        // New photo memory.
        saveMemory({
          tripId: trip.id,
          stopId,
          authorTraveler: traveler,
          visibility: 'shared',
          kind: 'photo',
          caption: '',
          photoRefs: [ref],
          capturedAt,
        })
        results.ok += 1
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({
        name,
        message: err?.message || String(err),
      })
    }
  }

  onProgress?.({ done: total, total, currentName: null })
  return results
}

// `mergeRefIntoExisting` lives in `./photoRefMerge` so the dedup
// logic stays Node-testable without dragging the memAssets +
// memoryStore + photoPipeline tree into the test import graph.
export { mergeRefIntoExisting }
