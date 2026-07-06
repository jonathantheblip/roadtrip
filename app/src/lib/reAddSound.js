// "Add it again — the sound will come along this time" (the true fix for the
// four permanently-silent videos).
//
// A stored clip labeled sound:'lost' provably HAD audio its old encode dropped;
// the shipped mp4Audio packet-copy pipeline carries sound now, so a re-pick of
// the same camera-roll video produces a sound-bearing copy. This module owns
// that pathway: the pure lens/authorship gate the lightbox affordance renders
// on, the replacement-ref builder, and the pick → encode → upload → swap flow.
//
// ATOMIC SWAP, DELIBERATELY (the safer of the two shapes): the OLD ref stays
// live and untouched until the new upload CONFIRMS, then the record swaps in
// one local write (replaceMemoryVideoRef). We do NOT route the replacement
// through the pending-ref outbox like a fresh import, because:
//   (a) the upload queue is keyed by memoryId and its drain re-saves the
//       enqueue-time ref WHOLESALE (PhotosView.triggerDrain / App.jsx
//       uploadQueueRunner both pass `photoRef` outright) — a replacement parked
//       there would fight the memory's live ref, and a crash before the drain
//       would strand the record pointing at a dead session blob URL with the
//       old (working!) video already torn down;
//   (b) a re-pick that ALSO loses its sound must leave the old copy standing
//       (the promise below) — a pending-first swap would have already given
//       the old ref up before the encode's verdict existed.
// The cost is honest and small: no tile "on its way" state for the
// replacement — the lightbox chip itself shows the in-flight state, and on
// any failure nothing anywhere has changed.
//
// SOUND HONESTY (per-clip, never a nag):
//   'carried' → replace (the whole point).
//   'none'    → replace too — a genuinely soundless source the author chose is
//               a legitimate replacement (their pick, honestly labeled).
//   'lost'    → DO NOT replace, DO NOT upload: the old copy stays, the honest
//               per-lens line says it didn't work this time, and the quiet
//               door stays open. No retry loop, no banner.
//
// Deps are injected (posterRetry's pattern): the real ones load lazily so the
// pure exports stay Node-importable for the unit suite — workerSync cannot
// import under node.

// Sanity ceiling for a single re-encoded clip — mirrors ImportFlow's
// VIDEO_MAX_UPLOAD_BYTES (not exported there; a ≤3:00 encode is ~48MB, so
// this only catches a pathological encode before it churns an upload).
const VIDEO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024 // 2GB

// PURE lens/authorship gate — everything decidable from the album entry alone.
// The component layers the two environment checks on top (isWorkerConfigured —
// the sound-bearing copy must be able to reach the family server — and
// isVideoEncodeSupported — no door on a device that can't encode).
//   - only a VIDEO whose saved copy provably lost its sound (sound === 'lost';
//     'none' is honest silence, null is legacy-unknown — neither gets the door)
//   - only the memory's AUTHOR, viewing as themselves
//   - never on Rafa's lens, even were he the author (videoCopy's null chip is
//     the second latch)
//   - only a SETTLED (r2-backed, not pending) ref: a still-uploading clip is
//     owned by the outbox drain, whose wholesale re-save would clobber a swap
//   - refKey + memoryId must exist — the swap is keyed by the stored object
export function canOfferReAddSound(entry, traveler) {
  if (!entry || typeof entry !== 'object') return false
  if (!entry.isVideo) return false
  if (entry.sound !== 'lost') return false
  if (entry.pending) return false
  if (!entry.memoryId || !entry.refKey) return false
  if (!traveler || typeof traveler !== 'string') return false
  if (traveler === 'rafa') return false
  return entry.author === traveler
}

// PURE: the replacement ref's stored-object fields, built from the encode
// result + the confirmed upload (+ the poster when it landed). Deliberately
// NEVER carries capturedAt — the replacement is the same moment, and
// replaceVideoRefInRecord keeps the original ref's capture identity (see the
// documented choice there). When the poster upload failed (`poster` null) the
// posterKey/posterUrl keys are ABSENT, so the spread merge keeps the OLD
// poster on the ref (never a blank tile) until posterRetry's drain patches in
// the new one.
export function buildReplacementRef({ encoded, remote, poster } = {}) {
  const ref = {
    kind: 'video',
    storage: 'r2',
    key: remote.key,
    url: remote.url,
    mime: 'video/mp4',
    width: encoded.width,
    height: encoded.height,
    durationMs: encoded.durationMs,
    // The new file's own honest proof values — the stored clip IS the new
    // bytes, so size/length/sound must describe the file, not the old one.
    bytes: Number.isFinite(encoded.blob?.size) ? encoded.blob.size : null,
    sound: typeof encoded.sound === 'string' ? encoded.sound : null,
  }
  if (poster && poster.posterKey) {
    ref.posterKey = poster.posterKey
    ref.posterUrl = poster.posterUrl
  }
  return ref
}

// ── In-flight guard (module-level, keyed by the clip's stored refKey) ───────
// The lightbox row remounts on swipe-away/swipe-back (key={entry.key}), so
// component state cannot remember that a flow is still settling for this clip.
// Without this, a second pick mid-flight double-uploads (a second orphan) and
// the loser's swap answers 'swap-target-missing' — a LYING 'failed' on a video
// that was in fact just fixed. One flight per refKey: beginReAddFlight wins
// exactly once; endReAddFlight (always in the caller's finally) clears it and
// notifies subscribers, so a row that remounted mid-flight and adopted the
// busy state can settle back instead of spinning forever.
const inFlightReAdds = new Set()
const settleListeners = new Set()

export function isReAddInFlight(refKey) {
  return typeof refKey === 'string' && inFlightReAdds.has(refKey)
}

// True = the caller owns the flight and MUST endReAddFlight in a finally.
// False = a flow for this clip is still settling (or the key is unusable) —
// never start a second one.
export function beginReAddFlight(refKey) {
  if (!refKey || typeof refKey !== 'string') return false
  if (inFlightReAdds.has(refKey)) return false
  inFlightReAdds.add(refKey)
  return true
}

export function endReAddFlight(refKey) {
  if (!refKey || !inFlightReAdds.delete(refKey)) return
  for (const fn of [...settleListeners]) {
    try {
      fn(refKey)
    } catch {
      /* a bad subscriber never breaks a settle */
    }
  }
}

// Subscribe to flight settles (called with the settled refKey). Returns an
// unsubscribe fn. This is how a remounted row learns the flight ended — the
// initiating row's own closure can no longer reach it after the remount.
export function subscribeReAddSettles(fn) {
  settleListeners.add(fn)
  return () => settleListeners.delete(fn)
}

let _realDeps = null
async function realDeps() {
  if (_realDeps) return _realDeps
  const [vp, ws, pr, ms, ul] = await Promise.all([
    import('./videoPipeline.js'),
    import('./workerSync.js'),
    import('./posterRetry.js'),
    import('./memoryStore.js'),
    import('./uploadLog.js'),
  ])
  _realDeps = {
    encodeVideo: vp.encodeVideo,
    uploadAssetBlob: ws.uploadAssetBlob,
    uploadPosterOrQueue: pr.uploadPosterOrQueue,
    replaceMemoryVideoRef: ms.replaceMemoryVideoRef,
    logUploadEvent: ul.logUploadEvent,
  }
  return _realDeps
}

// The flow. Returns one of (the component maps each to its per-lens line):
//   { status: 'replaced', sound, url }   — swapped; `url` re-keys the lightbox
//   { status: 'still-lost' }             — the re-pick lost its sound too;
//                                          NOTHING uploaded, NOTHING changed
//   { status: 'too-long', durationMs }   — over the 3:00 cap (the deck's
//                                          existing tooLong line names it)
//   { status: 'failed', code }           — encode/upload/swap failure; the old
//                                          copy stands untouched
export async function reAddSound({ file, entry }, deps) {
  deps = deps || (await realDeps())
  const devLog = (code, message) => {
    // Technical reasons go to the dev upload log ONLY (ImportFlow's rule) —
    // the family reads the per-lens line, never a code.
    try {
      deps.logUploadEvent?.({
        code,
        message,
        fileMeta: { name: file?.name || 'video', type: file?.type || null, size: file?.size ?? null },
        context: { phase: 're-add-sound', memoryId: entry?.memoryId || null },
      })
    } catch {
      /* the log must never break the flow */
    }
  }

  // 1. Encode through the SAME pipeline as a fresh import — duration cap and
  //    designed error codes included.
  let enc
  try {
    enc = await deps.encodeVideo(file)
  } catch (err) {
    if (err?.code === 'video-too-long') {
      devLog('re-add-too-long', `re-pick is ${Math.round((err.durationMs || 0) / 1000)}s`)
      return { status: 'too-long', durationMs: err.durationMs || 0 }
    }
    devLog(err?.code || 're-add-encode-failed', err?.message || 'encode failed')
    return { status: 'failed', code: err?.code || 'video-encode-failed' }
  }

  // 2. The honest verdict BEFORE any upload: a re-pick that lost its sound
  //    again replaces nothing (and costs no upload — we would not keep it).
  if (enc.sound === 'lost') {
    devLog('re-add-sound-lost-again', enc.soundReason || 'source audio could not be carried')
    return { status: 'still-lost' }
  }
  if (!enc.blob) {
    devLog('re-add-encode-failed', 'encode produced no blob')
    return { status: 'failed', code: 'video-encode-failed' }
  }
  if (enc.blob.size > VIDEO_MAX_UPLOAD_BYTES) {
    devLog('re-add-too-large', `encoded ${(enc.blob.size / 1e6).toFixed(0)}MB exceeds the upload ceiling`)
    return { status: 'failed', code: 'video-too-large' }
  }

  // 3. Upload the new copy (multipart for a large blob — the shared entry the
  //    three existing video sites use), crediting the AUTHOR (the gate makes
  //    author === viewer, but explicit is exact).
  let remote
  try {
    remote = await deps.uploadAssetBlob('video', entry.memoryId, enc.blob, { asTraveler: entry.author })
  } catch (err) {
    devLog('re-add-upload-failed', err?.message || 'upload failed')
    return { status: 'failed', code: 'upload-failed' }
  }
  if (!remote?.key || !remote?.url) {
    devLog('re-add-upload-failed', 'upload answered without a key/url')
    return { status: 'failed', code: 'upload-failed' }
  }

  // 4. Poster — best-effort, marker-queued on failure exactly like a fresh
  //    video (posterRetry heals it later via updateMemoryPoster; meanwhile the
  //    spread merge keeps the OLD poster rendering).
  const poster = await deps.uploadPosterOrQueue(entry.memoryId, enc.posterBlob || null, {
    asTraveler: entry.author,
  })

  // 5. THE ATOMIC SWAP — the first moment anything stored changes. Preserves
  //    the memory's identity wholesale; mirrors with a 409-surviving reapply;
  //    a failed mirror queues a 'save' intent the drain replays (the swapped
  //    ref rides the record itself). The replaced .mp4 becomes an orphaned R2
  //    object by design — orphan class "replaced-video-asset", cleanup out of
  //    scope (see replaceMemoryVideoRef).
  const res = deps.replaceMemoryVideoRef(entry.memoryId, {
    refKey: entry.refKey,
    next: buildReplacementRef({ encoded: enc, remote, poster }),
  })
  if (res?.status !== 'replaced') {
    // The memory (or its video) vanished mid-flow — deleted on another device.
    // Nothing local changed; the fresh upload is an orphan of the same class.
    devLog('re-add-swap-target-missing', `swap answered ${res?.status || 'nothing'}`)
    return { status: 'failed', code: 'swap-target-missing' }
  }
  devLog('re-add-replaced', `sound ${enc.sound}; ${remote.key} replaces ${entry.refKey}`)
  return { status: 'replaced', sound: enc.sound, url: remote.url }
}
