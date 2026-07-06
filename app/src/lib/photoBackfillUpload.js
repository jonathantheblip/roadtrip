// Backfill upload pipeline. Takes the triage payload (the array of
// `{ file, exif, match, reattachOf, stopId, interstitial, ... }` records
// the user kept checked) and routes each photo through the upload +
// memory plumbing.
//
// Offline-safe (Importer Stage 2): a new photo is downscaled, then pushed
// straight to the Worker's R2 route. When that push fails (offline /
// Worker 5xx) the blob is parked in `lib/uploadQueue` and the memory is
// saved with a `storage:'pending'` ref so the album still renders it; the
// PhotosView sync pill drains the queue on reconnect. This mirrors
// `AddDispatchModal.queueSilently` — the proven single-photo path — so a
// bulk import survives an outage exactly the way a single dispatch does.
//
// New photos land as fresh memory records, kind='photo', captioned blank
// (per spec — no auto-captions). Re-attach candidates (the vb3-4 case:
// existing D1 metadata rows with no photo) are detected by the triage
// layer and routed through this helper as updates to the existing
// record's id + photoRefs[], so we don't fork a duplicate.

import { saveAsset, makeAssetKey } from './memAssets'
import { saveMemory } from './memoryStore'
import { mergeRefIntoExisting } from './photoRefMerge'
import { preparePhotoForUpload } from './photoPipeline'
import { enqueue, registerBackgroundSync } from './uploadQueue'
import { workerFetch, uploadAssetBlob } from './workerSync'
import { uploadPosterOrQueue } from './posterRetry'

function makeMemoryId() {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

// Run the backfill upload for one triage payload. Resolves after every
// photo has been saved locally + (uploaded OR queued for sync), or has
// failed. Returns `{ ok, reattached, queued, failed, errors }`:
//   - ok:        new photos saved (whether uploaded now or queued)
//   - queued:    subset of `ok` that couldn't reach the Worker and are
//                parked for the sync pill to drain on reconnect
//   - reattached: imported photos merged into an existing memory
//
// onProgress({ done, total, currentName }) is invoked once per photo as
// we step through.
export async function uploadBackfillPhotos({
  photos,
  trip,
  traveler,
  onProgress,
}) {
  const results = { ok: 0, reattached: 0, queued: 0, failed: 0, soundLost: 0, errors: [] }
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
      // Date + coords come from the triage's EXIF read (entry.exif), which
      // honors the __RT_BACKFILL_EXIF test seam; the downscale's own EXIF is
      // identical in production but null for headless fixtures.
      const capturedAt = entry?.exif?.capturedAt || null

      // Pick the stop assignment. An explicit `entry.stopId` (set by the
      // reconciliation layer, which binds photos to the FINAL reconciled
      // stops — including auto-added ones that didn't exist at match time)
      // always wins, even when it's null (interstitial). Otherwise fall back
      // to the raw matcher result: GPS+time / time-only matches land on their
      // stop; interstitial / deviation store with stopId=null.
      const stopId =
        entry?.stopId !== undefined ? entry.stopId : entry?.match?.stopId || null

      if (entry.reattachOf) {
        // Re-attach (unchanged): the imported photo links to an existing
        // metadata-only memory. Bytes go to IDB; the memoryStore mirror
        // (workerSync.pushMemory) uploads them to R2 best-effort.
        //
        // NOTE: offline re-attach is NOT queue-backed — the shared drain
        // runner OVERWRITES a memory by id rather than MERGING refs, so
        // routing a re-attach through the queue would clobber the existing
        // record's other photos. Re-attach therefore syncs whenever
        // pushMemory next succeeds. New-photo imports (the common case) ARE
        // offline-safe via the queue below; re-attach is a rare recovery
        // edge (existing metadata row, missing bytes).
        const assetKey = makeAssetKey('photo')
        const { mime } = await saveAsset('photo', assetKey, entry.file)
        const ref = { key: assetKey, storage: 'idb', mime, capturedAt }
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
        continue
      }

      // New photo OR video. Generate the id up front so the queued item's id
      // matches the saved record's id — the drain runner re-saves by that id,
      // so the pending memory becomes the R2-backed one rather than a
      // duplicate.
      const memoryId = makeMemoryId()
      const ref =
        entry.kind === 'video'
          ? await uploadOrQueueVideo({ entry, memoryId, trip, traveler, stopId, capturedAt, results })
          : await uploadOrQueueNewPhoto({ entry, memoryId, trip, traveler, stopId, capturedAt, results })

      // An interstitial photo keeps stopId = null and carries its "from A to
      // B" identity as a memory-level field (007). On a queued photo this
      // identity lives on the local record and survives the drain's re-save
      // because saveMemory PRESERVES interstitial (and capturedAt) when the
      // caller passes undefined — the drain runner does exactly that.
      saveMemory({
        id: memoryId,
        tripId: trip.id,
        stopId,
        authorTraveler: traveler,
        visibility: 'shared',
        kind: 'photo',
        caption: '',
        photoRef: ref,
        capturedAt,
        interstitial: entry.interstitial || undefined,
      })
      results.ok += 1
      // Sound-outcome tally rides the results so the post-import toast can
      // say "N added · M without its sound" — only clips that actually saved.
      if (entry.kind === 'video' && entry.encoded?.sound === 'lost') results.soundLost += 1
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

// Downscale + upload one new photo, returning the photoRef to persist.
// On a failed Worker push the blob is enqueued and a 'pending' ref (with
// an object URL so the tile renders) is returned; `results.queued` is
// bumped. When no Worker is configured we fall back to the legacy
// IDB-local store (no queue — there's nothing to drain to).
async function uploadOrQueueNewPhoto({
  entry,
  memoryId,
  trip,
  traveler,
  stopId,
  capturedAt,
  results,
}) {
  // Downscale for upload (the M2 pipeline — guards iOS's decoded-image
  // budget). Fall back to the raw file if it can't be decoded; one bad
  // photo shouldn't fail the whole batch.
  let blob
  let mime
  try {
    const prep = await preparePhotoForUpload(entry.file)
    blob = prep.blob
    mime = prep.mime
  } catch {
    blob = entry.file
    mime = entry.file?.type || 'image/jpeg'
  }

  // baseRef carries everything the drain runner needs to reconstruct the R2
  // ref on retry (mime + capturedAt ride through item.ref). Try the Worker
  // push; on ANY failure park the blob in the queue + return a 'pending' ref
  // so the sync pill shows and the drain retries. workerFetch throws 'worker
  // not configured' when there's no Worker, so the unconfigured case enqueues
  // too — matching AddDispatchModal.queueSilently. (The importer used to
  // diverge here, going IDB-only with no pill, which read as "saved, nothing
  // syncing" in a worker-less build.)
  const baseRef = { kind: 'photo', mime, capturedAt }
  try {
    const r = await workerFetch(
      `/assets/photo/${encodeURIComponent(memoryId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': blob?.type || mime || 'application/octet-stream' },
        body: blob,
      }
    )
    const remote = await r.json() // { key, url, mime }
    return { ...baseRef, storage: 'r2', key: remote.key, url: remote.url }
  } catch (err) {
    // Offline / Worker error → park the blob for the sync pill to retry AND
    // copy it into the idb asset store so the album tile can read the real
    // picture back after an OFFLINE relaunch (the session object URL below dies
    // on reload). The ref stays storage:'pending' so two invariants hold:
    //   (a) ShareComposer still refuses an un-uploaded photo (pending gate), and
    //   (b) pushMemory leaves this upload to the queue (it skips 'pending' refs
    //       → no double-push), even though the ref now carries an idb `key`.
    // The drain rewrites the ref to r2 and removes this orphan (item.idbKey).
    // raw:true — the blob is already downscaled (preparePhotoForUpload ran);
    // don't make saveAsset downscale a second time. idb failure (private mode)
    // degrades to session-url-only, no worse than before this fix.
    let idbKey = null
    try {
      const k = makeAssetKey('photo')
      await saveAsset('photo', k, blob, mime, { raw: true })
      idbKey = k
    } catch {
      /* idb unavailable — keep the session url only */
    }
    await enqueue({
      id: memoryId,
      kind: 'photo',
      blob,
      ...(idbKey ? { idbKey } : {}),
      tripId: trip.id,
      stopId,
      authorTraveler: traveler,
      caption: '',
      ref: baseRef,
      lastError: err?.message || null,
    })
    await registerBackgroundSync().catch(() => {})
    results.queued += 1
    return {
      ...baseRef,
      storage: 'pending',
      ...(idbKey ? { key: idbKey } : {}),
      url: URL.createObjectURL(blob),
    }
  }
}

// URL.createObjectURL throws on a malformed/detached blob — rare, but this is
// the render-only fallback for a video that ALREADY failed its real upload;
// a second throw here has nothing left to fall back to.
function safeObjectUrl(blob) {
  try {
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

// Upload one already-encoded video (ImportFlow runs the WebCodecs encode in
// PREPARE), returning the photoRef to persist. Mirrors the photo path's
// offline-safe shape: try the Worker's /assets/video route, else park the
// encoded blob in the queue. The pending/local ref renders the first-frame
// poster (the encoded video itself isn't grid-renderable). Videos never use
// the IDB asset store (memAssets has no video store) — offline persistence is
// the upload queue; with no Worker the object URL covers the session.
async function uploadOrQueueVideo({ entry, memoryId, trip, traveler, stopId, capturedAt, results }) {
  const enc = entry.encoded || {}
  const blob = enc.blob
  const posterBlob = enc.posterBlob || null
  const baseRef = {
    kind: 'video',
    mime: enc.mime || 'video/mp4',
    width: enc.width,
    height: enc.height,
    durationMs: enc.durationMs,
    // The shrunk byte size — the design's "proof" value (#2). Persisted on the
    // ref (not just local) so the saved-tile size chip shows for every viewer and
    // survives the worker round-trip, exactly like width/height/durationMs. Rides
    // through the queue's item.ref → the drain re-save keeps it (no re-encode).
    bytes: Number.isFinite(blob?.size) ? blob.size : null,
    // The sound outcome ('carried' | 'none' | 'lost') persists the same way, so
    // every viewer's tile can tell "source had no sound" from "sound couldn't
    // come along". Absent on legacy refs = unknown → no tag, never a guess.
    sound: typeof enc.sound === 'string' ? enc.sound : null,
    capturedAt,
  }
  // Build the offline/render-only pending ref. The video TILE renders the
  // poster still (posterUrl), so we also copy the poster jpeg into the idb
  // asset store (the `photo` store — a poster is an image; no new store / no DB
  // bump needed) under `posterKey`, letting the tile read the still back after
  // an OFFLINE relaunch. The video itself is NOT persisted offline (poster only,
  // by design) — playback needs a reconnect; `url` stays a session object URL.
  // Returns { ref, posterIdbKey } so the catch can hand the key to the drain
  // for orphan cleanup. Best-effort idb: failure → session url only.
  async function buildPendingRef() {
    let posterIdbKey = null
    if (posterBlob) {
      try {
        const k = makeAssetKey('photo')
        await saveAsset('photo', k, posterBlob, posterBlob.type || 'image/jpeg', { raw: true })
        posterIdbKey = k
      } catch {
        /* idb unavailable — session poster url only */
      }
    }
    const src = posterBlob || blob
    // safeObjectUrl: createObjectURL can throw on a malformed/detached blob.
    // This is called from INSIDE the outer try/catch's own catch block (the
    // "nothing else to fall back to" path) — an unguarded throw here would
    // escape uploadOrQueueVideo entirely and skip the enqueue() below, so the
    // whole video's attempt (and its retry) never happens. Same "never worse
    // than session-url-only" degrade as the saveAsset try/catch just above.
    const ref = {
      ...baseRef,
      storage: 'pending',
      ...(posterIdbKey ? { posterKey: posterIdbKey } : {}),
      ...(posterBlob ? { posterUrl: safeObjectUrl(posterBlob) } : {}),
      ...(src ? { url: safeObjectUrl(src) } : {}),
    }
    return { ref, posterIdbKey }
  }

  // Nothing to upload (encode produced no blob) → render-only pending ref.
  if (!blob) {
    const { ref } = await buildPendingRef()
    return ref
  }
  // Otherwise try the push; the catch enqueues on ANY failure (offline OR no
  // Worker configured — workerFetch throws when unconfigured), matching the
  // photo path + AddDispatchModal.queueSilently.
  try {
    // A large video exceeds CF's ~100MB single-POST cap → uploadAssetBlob switches to
    // multipart transparently; a small video keeps the single POST unchanged.
    const remote = await uploadAssetBlob('video', memoryId, blob)
    const ref = { ...baseRef, storage: 'r2', key: remote.key, url: remote.url }
    // Upload the poster too so the synced tile renders a still instead of a
    // fallback icon. If it fails, uploadPosterOrQueue parks it for retry (part 2)
    // rather than dropping it silently; `ref` is left as-is until the retry lands.
    const poster = await uploadPosterOrQueue(memoryId, posterBlob, { asTraveler: traveler })
    if (poster) Object.assign(ref, poster)
    return ref
  } catch (err) {
    const { ref, posterIdbKey } = await buildPendingRef()
    await enqueue({
      id: memoryId,
      kind: 'video',
      blob,
      posterBlob,
      ...(posterIdbKey ? { posterIdbKey } : {}),
      tripId: trip.id,
      stopId,
      authorTraveler: traveler,
      caption: '',
      ref: baseRef,
      lastError: err?.message || null,
    })
    await registerBackgroundSync().catch(() => {})
    results.queued += 1
    return ref
  }
}

// ── Composer import (share-out E3) ──────────────────────────────────────
// Import ONE picked file into a "moment": upload-or-queue it (offline-safe,
// the SAME proven path the bulk importer uses) and create a trip-LEVEL memory
// (stopId:null — composer imports aren't stop-filed). Returns { id, ref,
// pending } so the composer can select the piece and, after the queue drains,
// re-read the now-r2 ref off this memory id. Reuses the private cores so there
// is ONE upload/queue contract; uploadBackfillPhotos (ImportFlow) is untouched.
//
// Video must already be encoded (entry.encoded shape from videoPipeline); the
// composer runs the WebCodecs encode before calling this, exactly as ImportFlow
// does in its PREPARE phase.
export async function saveImportedMedia({ file, kind, exif, encoded, trip, traveler }) {
  const memoryId = makeMemoryId()
  const capturedAt = exif?.capturedAt || null
  const stopId = null
  const results = { ok: 0, reattached: 0, queued: 0, failed: 0, errors: [] }
  const ref =
    kind === 'video'
      ? await uploadOrQueueVideo({ entry: { encoded }, memoryId, trip, traveler, stopId, capturedAt, results })
      : await uploadOrQueueNewPhoto({ entry: { file }, memoryId, trip, traveler, stopId, capturedAt, results })
  // A video is stored as a kind:'photo' memory whose photoRef carries the video
  // (ref.kind/mime/posterUrl distinguish it) — mirroring uploadBackfillPhotos.
  saveMemory({
    id: memoryId,
    tripId: trip.id,
    stopId,
    authorTraveler: traveler,
    visibility: 'shared',
    kind: 'photo',
    caption: '',
    photoRef: ref,
    capturedAt,
  })
  return { id: memoryId, ref, pending: ref.storage === 'pending' }
}
