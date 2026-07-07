import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Loader2, AlertCircle, AlertTriangle, Clock, RotateCw, Scissors, VolumeX } from 'lucide-react'
import { readExifForImport, filterByTripRange } from '../lib/photoBackfill'
import { matchPhotosToStops } from '../lib/photoMatch'
import { buildReconciliationDraft } from '../lib/reconcileDraft'
import { applyReconciliation } from '../lib/reconcileApply'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { uploadBackfillPhotos } from '../lib/photoBackfillUpload'
import { encodeVideo, isVideoEncodeSupported } from '../lib/videoPipeline'
import { extractVideoCreationDate } from '../lib/videoMeta'
import { logUploadEvent } from '../lib/uploadLog'
import { videoCopy, fmtSize, fmtDur } from '../lib/videoCopy'
import { PhotoBackfillTriage } from './PhotoBackfillTriage'

// ImportFlow — the one importer's orchestrator (Stage 2). It sits in front
// of the heavy PhotoBackfillTriage reconcile editor and decides, per batch,
// whether the import is clean enough to save SILENTLY (the Apple/Google
// Photos feel — a toast, no screen) or whether it's worth a lightweight
// CONFIRM summary first. The heavy reconcile editor stays reachable for fine
// control via "Review in detail."
//
// It reuses the production pipeline wholesale — readExifForImport (the test
// seam lives there too), matchPhotosToStops, buildReconciliationDraft,
// applyReconciliation, and the offline-safe uploadBackfillPhotos — so the
// auto-filing (GPS+time → stops + "from A→B" interstitials) is byte-identical
// to what the reconcile editor would produce if you accepted its draft as-is.
//
// Smart-skip rule (see decideClean): a clean batch — everything filed to a
// real stop, no duplicates, no off-route clusters, not huge — saves silently.
// Anything with a between-stops shot, a new-stop cluster, a duplicate, or a
// large count shows the confirm summary so the family sees it before it lands.
//
// PREPARE reads each photo's EXIF and encodes each picked video (WebCodecs, one
// at a time) with its container creation date; videos file by TIME (no
// extractable GPS yet), and a clip that won't encode is skipped, not fatal.

const PHASE = {
  PREPARING: 'preparing',
  ENCODING: 'encoding',
  ANALYZING: 'analyzing',
  CONFIRM: 'confirm',
  SAVING: 'saving',
  DETAIL: 'detail',
  ERROR: 'error',
}

// A clean batch up to this size smart-skips the confirm. Above it, even an
// all-matched import shows the summary so a big drop gets one glance.
const SMART_SKIP_MAX = 12
// A tiny batch always skips the confirm (a couple photos — just file them),
// even if one is a between-stops shot.
const TINY_BATCH = 2

// Large videos now upload via MULTIPART — uploadAssetBlob chunks anything over ~90MB
// through the Worker's R2 multipart endpoints, so a big clip (the silent "halfway"
// failure a family member hit) uploads for real instead of failing the old single POST.
// This is now just a generous SANITY cap: a pathologically huge encode (many GB) would
// bog the browser down, so refuse it up front + say so honestly rather than churn.
const VIDEO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024 // 2GB

export function ImportFlow({ trip, traveler, files, tripsApi, onCancel, onComplete }) {
  const [phase, setPhase] = useState(PHASE.PREPARING)
  const [analysis, setAnalysis] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, currentName: null })
  const [encode, setEncode] = useState({ index: 0, total: 0, percent: 0 })
  const [error, setError] = useState(null)
  const [retrying, setRetrying] = useState(() => new Set()) // names of couldn't-add clips being re-shrunk (#2 retry)
  // Guards the one-shot analyze effect from re-saving if React re-runs it.
  const savingRef = useRef(false)

  const { photoFiles, videoFiles } = useMemo(() => partitionByType(files), [files])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setPhase(PHASE.PREPARING)

        // PREPARE — read each photo's EXIF (honoring the headless test seam).
        // Picked videos are encoded just below, in the ENCODING phase.
        const photoItems = []
        for (let i = 0; i < photoFiles.length; i++) {
          if (cancelled) return
          const f = photoFiles[i]
          const exif = await readExifForImport(f)
          const id = itemId(f, i)
          photoItems.push({
            id,
            file: f,
            kind: 'photo',
            exif,
            photo: { id, capturedAt: exif.capturedAt, lat: exif.lat, lng: exif.lng, offsetMinutes: exif.offsetMinutes ?? null },
          })
        }
        // Videos: a sequential WebCodecs encode (CPU-heavy — one at a time,
        // with progress) + the container creation date. Filed by TIME (video
        // v1 carries no extractable GPS). A clip that won't encode is skipped,
        // not fatal to the batch. PhotosView gates the picker `accept` to
        // image-only when WebCodecs is unsupported (mirroring the dispatch
        // composer), so a video normally can't be picked on such a browser;
        // this guard is the backstop for a drag-dropped one.
        const videoItems = []
        const tooLargeVideos = [] // encoded over the upload limit — surfaced, not silently dropped
        const failedVideos = [] // shrink failed on this device — surfaced honestly (#2), never silently dropped
        const tooLongVideos = [] // over the 3:00 cap (#4) — hand off to the phone's trimmer, never dropped silently
        if (videoFiles.length > 0 && isVideoEncodeSupported()) {
          setPhase(PHASE.ENCODING)
          for (let vi = 0; vi < videoFiles.length; vi++) {
            if (cancelled) return
            const f = videoFiles[vi]
            setEncode({ index: vi, total: videoFiles.length, percent: 0 })
            try {
              const metaPromise = extractVideoCreationDate(f).catch(() => null)
              const enc = await encodeVideo(f, {
                onProgress: (p) => {
                  if (!cancelled) setEncode({ index: vi, total: videoFiles.length, percent: p })
                },
              })
              const vmeta = await metaPromise
              const capturedAt = vmeta?.capturedAt ?? null
              const offsetMinutes = vmeta?.offsetMinutes ?? null
              // SANITY CAP: large videos upload via multipart now (uploadAssetBlob), so
              // only a pathologically huge encode (over the 2GB cap) is refused up front
              // + REMEMBERED so the summary can say so honestly, instead of churning.
              if (enc.blob && enc.blob.size > VIDEO_MAX_UPLOAD_BYTES) {
                logUploadEvent({
                  code: 'video-too-large',
                  message: `encoded video ${(enc.blob.size / 1e6).toFixed(0)}MB exceeds ${(VIDEO_MAX_UPLOAD_BYTES / 1e6).toFixed(0)}MB upload limit`,
                  fileMeta: { name: f?.name || 'video', type: f?.type || null, size: enc.blob.size },
                  context: { phase: 'import-video-size-guard' },
                })
                tooLargeVideos.push({ name: f?.name || 'a video', bytes: enc.blob.size })
                continue
              }
              // Sound honesty: a clip whose source HAD audio the output
              // couldn't keep still imports (video-only), but the loss is
              // REMEMBERED — it forces the confirm, rides the ref, and chips
              // the saved tile. The technical reason goes to the dev log only.
              if (enc.sound === 'lost') {
                logUploadEvent({
                  code: 'video-sound-lost',
                  message: enc.soundReason || 'source audio could not be carried',
                  fileMeta: { name: f?.name || 'video', type: f?.type || null, size: f?.size ?? null },
                  context: { phase: 'import-video-encode' },
                })
              }
              const id = itemId(f, 1000 + vi)
              videoItems.push({
                id,
                file: f,
                kind: 'video',
                encoded: {
                  blob: enc.blob,
                  posterBlob: enc.posterBlob || null,
                  mime: 'video/mp4',
                  width: enc.width,
                  height: enc.height,
                  durationMs: enc.durationMs,
                  sound: enc.sound || null, // 'carried' | 'none' | 'lost'
                },
                exif: { capturedAt, lat: null, lng: null, offsetMinutes },
                photo: { id, capturedAt, lat: null, lng: null, offsetMinutes },
              })
            } catch (err) {
              // #2 honesty: a shrink failure is NEVER silently dropped. Classify it so
              // the confirm surfaces the right honest message — a too-long clip hands
              // off to the phone's trimmer (#4); any other failure becomes the warm
              // "couldn't add" banner with a retry (the original stays on the phone).
              // The technical detail still goes to the dev log ONLY (never the family).
              if (err?.code === 'video-too-long') {
                tooLongVideos.push({ name: f?.name || 'a video', file: f, durationMs: err.durationMs || null })
              } else {
                failedVideos.push({ name: f?.name || 'a video', file: f, bytes: f?.size ?? null })
              }
              logUploadEvent({
                code: err?.code || 'video-encode-failed',
                message: err?.message || String(err),
                stack: err?.stack || null,
                fileMeta: { name: f?.name || 'video', type: f?.type || null, size: f?.size ?? null },
                context: { phase: 'import-video-encode' },
              })
            }
          }
        }
        const items = [...photoItems, ...videoItems]
        if (cancelled) return

        // Trip-range filter (drops shots outside the trip window).
        const range = filterByTripRange(
          items.map((it) => it.photo),
          trip.dateRangeStart,
          trip.dateRangeEnd
        )
        if (range.reason === 'invalid-range') {
          setError('This trip is missing valid start/end dates — import needs both.')
          setPhase(PHASE.ERROR)
          return
        }
        const includedIds = new Set(range.included.map((p) => p.id))
        const kept = items.filter((it) => includedIds.has(it.photo.id))
        const excludedCount = items.length - kept.length

        // ANALYZE — the real matcher + reconcile draft, accepted as-is.
        setPhase(PHASE.ANALYZING)
        const photos = kept.map((it) => it.photo)
        const matchResult = matchPhotosToStops(photos, trip)
        const draft = buildReconciliationDraft(photos, trip, { matchResult })
        const { trip: out, photoBindings, photoInterstitials } = applyReconciliation(draft, trip)
        const matchById = new Map(matchResult.matches.map((m) => [m.photoId, m]))
        const existing = safeExistingPhotoMemories(trip, traveler)

        let matchedToStops = 0
        let interstitials = 0
        let duplicates = 0
        let videos = 0
        let videosBytes = 0 // total shrunk bytes across imported clips — the confirm size chip (#2 proof)
        let soundLost = 0 // clips importing WITHOUT sound their source had — the honest sound outcome
        const payload = []
        for (const item of kept) {
          // A photo that matches an EXISTING photo memory by capture time is a
          // re-import — skip it. One that matches a metadata-only memory is a
          // re-attach (link the bytes to the existing record). Videos never
          // dedup against photos: a clip shot within 60s of a still (e.g. a
          // Live Photo companion) is not a duplicate.
          const dup = item.kind === 'video' ? null : findDuplicate(item.exif?.capturedAt, existing)
          if (dup?.duplicate) {
            duplicates += 1
            continue
          }
          const stopId =
            item.photo.id in photoBindings
              ? photoBindings[item.photo.id]
              : matchById.get(item.photo.id)?.stopId ?? null
          const interstitial = photoInterstitials[item.photo.id] || null
          // Mutually-exclusive summary categories (sum to willImport): a video
          // is counted as a video (it files by time), a photo as filed-to-stop
          // or on-the-road.
          if (item.kind === 'video') {
            videos += 1
            videosBytes += item.encoded?.blob?.size || 0
            if (item.encoded?.sound === 'lost') soundLost += 1
          } else if (stopId) matchedToStops += 1
          else interstitials += 1
          payload.push({
            kind: item.kind,
            file: item.file,
            // Carry the shrunk blob through to upload. Without it uploadOrQueueVideo
            // gets no blob → a render-only pending ref that's NEVER queued or
            // uploaded (a bulk-imported video would show its poster locally and
            // silently never save). undefined for photos (they read entry.file).
            encoded: item.encoded,
            exif: item.exif,
            match: matchById.get(item.photo.id),
            reattachOf: dup?.reattach || null,
            stopId,
            interstitial,
          })
        }
        const autoAddedStops = matchResult.deviationClusters?.length || 0
        const summary = {
          willImport: payload.length,
          matchedToStops,
          interstitials,
          autoAddedStops,
          duplicates,
          videos,
          videosBytes, // total shrunk bytes across imported clips — the confirm size chip (#2 proof)
          excludedCount,
          tooLarge: tooLargeVideos.length,
          failed: failedVideos.length, // shrink failures — the warm "couldn't add" banner (#2)
          tooLong: tooLongVideos.length, // over the 3:00 cap — the "trim it" banner (#4)
          soundLost, // importing without the sound their source had — the sound-outcome banner
        }
        const data = { payload, out, summary, tooLargeVideos, failedVideos, tooLongVideos }
        if (cancelled) return
        setAnalysis(data)

        // A lost sound counts as a video notice too: the family has to SEE
        // that a clip is coming in silent before it lands — never a smart-skip.
        const hasVideoNotice =
          tooLargeVideos.length > 0 ||
          failedVideos.length > 0 ||
          tooLongVideos.length > 0 ||
          soundLost > 0
        if (payload.length === 0 && !hasVideoNotice) {
          // Nothing new (all duplicates / out of range) — bounce straight back
          // with a "nothing new" toast rather than an empty confirm screen.
          onComplete?.({ ok: 0, queued: 0, reattached: 0, failed: 0, nothingNew: true })
          return
        }
        if (payload.length === 0) {
          // ONLY problem videos (too-large / couldn't-add / too-long), nothing
          // importable — show the honest confirm so the family SEES what didn't make
          // it, never a silent "nothing new".
          setPhase(PHASE.CONFIRM)
          return
        }

        // Test seam (parallels AddDispatchModal's __RT_FORCE_BUCKETC): force
        // the confirm view so the Simulator video gate can assert "encode ran
        // → video summary" and stop before a real Worker upload. Inert in
        // production — the global is never set there.
        const forceConfirm = typeof window !== 'undefined' && !!window.__RT_IMPORT_FORCE_CONFIRM
        // A video notice (too-large / couldn't-add / too-long) must never smart-skip:
        // the family has to SEE what didn't make it (the whole point of #2), so any
        // notice forces the confirm.
        if (!forceConfirm && !hasVideoNotice && decideClean(summary)) {
          await doSave(data, () => cancelled)
        } else {
          setPhase(PHASE.CONFIRM)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || String(err))
          setPhase(PHASE.ERROR)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // Analyze the picked batch exactly once. We deliberately DON'T depend on
    // `trip`/`traveler`: saving (doSave → tripsApi.upsertTrip) mutates the
    // trip, and re-running this effect on that change would unmount the
    // in-flight reconcile editor / cancel the clean-path save before
    // onComplete. The batch is analyzed against the trip as it was at pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoFiles, videoFiles])

  async function doSave(data, isCancelled) {
    if (savingRef.current) return
    savingRef.current = true
    setPhase(PHASE.SAVING)
    setProgress({ done: 0, total: data.payload.length, currentName: null })
    try {
      // Local trip write is synchronous; the Worker mirror is non-fatal.
      await tripsApi?.upsertTrip?.(data.out)
      const results = await uploadBackfillPhotos({
        photos: data.payload,
        trip: data.out,
        traveler,
        onProgress: (p) => {
          if (!isCancelled?.()) setProgress(p)
        },
      })
      if (isCancelled?.()) return
      // `results.ok` counts every new item — photos AND videos — but carries no
      // photo/video split, so the toast used to call a video a "photo". Thread
      // the batch's video count from the analysis summary so the summary line
      // can be honest ("N photos · M videos").
      onComplete?.({ ...results, videos: data.summary?.videos || 0 })
    } catch (err) {
      savingRef.current = false
      setError(err?.message || String(err))
      setPhase(PHASE.ERROR)
    }
  }

  // #2 retry — re-run the on-device shrink on each couldn't-add clip's ORIGINAL
  // (still on the phone). A recovered clip folds into the import (files by time,
  // earns its size chip); one that fails again stays honestly in the banner —
  // never lost, never vanished. Too-long clips are NOT retried (they'd only fail
  // the cap again — they hand off to the phone's trimmer instead).
  async function retryFailedVideos() {
    const data = analysis
    const clips = data?.failedVideos || []
    if (!clips.length || (retrying && retrying.size > 0)) return
    setRetrying(new Set(clips.map((c) => c.name)))
    const recovered = []
    const stillFailed = []
    for (const clip of clips) {
      try {
        const vmeta = await extractVideoCreationDate(clip.file).catch(() => null)
        const capturedAt = vmeta?.capturedAt ?? null
        const offsetMinutes = vmeta?.offsetMinutes ?? null
        const enc = await encodeVideo(clip.file)
        if (enc.blob && enc.blob.size > VIDEO_MAX_UPLOAD_BYTES) {
          stillFailed.push(clip)
          continue
        }
        recovered.push({
          kind: 'video',
          file: clip.file,
          encoded: { blob: enc.blob, posterBlob: enc.posterBlob || null, mime: 'video/mp4', width: enc.width, height: enc.height, durationMs: enc.durationMs, sound: enc.sound || null },
          exif: { capturedAt, lat: null, lng: null, offsetMinutes },
          match: undefined,
          reattachOf: null,
          stopId: null,
          interstitial: null,
        })
      } catch {
        stillFailed.push(clip)
      }
    }
    setRetrying(new Set())
    if (!recovered.length) {
      setAnalysis({ ...data, failedVideos: stillFailed })
      return
    }
    const addedBytes = recovered.reduce((s, r) => s + (r.encoded?.blob?.size || 0), 0)
    setAnalysis({
      ...data,
      payload: [...data.payload, ...recovered],
      summary: {
        ...data.summary,
        willImport: (data.summary.willImport || 0) + recovered.length,
        videos: (data.summary.videos || 0) + recovered.length,
        videosBytes: (data.summary.videosBytes || 0) + addedBytes,
        failed: stillFailed.length,
        // A re-shrunk clip can come back sound-lost — keep the count honest.
        soundLost:
          (data.summary.soundLost || 0) +
          recovered.filter((r) => r.encoded?.sound === 'lost').length,
      },
      failedVideos: stillFailed,
    })
  }

  // "Review in detail" hands the photos to the full reconcile editor. (Videos
  // never reconcile — they file by time — so once video lands they'll be saved
  // by-time on entering detail; photo-only for now.)
  if (phase === PHASE.DETAIL) {
    return (
      <PhotoBackfillTriage
        trip={trip}
        traveler={traveler}
        files={photoFiles}
        tripsApi={tripsApi}
        onCancel={() => setPhase(PHASE.CONFIRM)}
        onComplete={onComplete}
      />
    )
  }

  if (phase === PHASE.ERROR) {
    return (
      <ImportShell trip={trip} onBack={onCancel}>
        <div style={{ padding: '24px 18px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <AlertCircle size={18} color="var(--accent)" />
          <p className="f-news" style={{ margin: 0, fontSize: 16 }}>
            {error || 'Something went wrong reading these photos.'}
          </p>
        </div>
      </ImportShell>
    )
  }

  if (phase === PHASE.PREPARING || phase === PHASE.ANALYZING) {
    return (
      <ImportShell trip={trip} onBack={onCancel}>
        <LoaderLine text={phase === PHASE.PREPARING ? 'Reading your photos…' : 'Matching them to stops…'} />
      </ImportShell>
    )
  }

  if (phase === PHASE.ENCODING) {
    return (
      <ImportShell trip={trip} onBack={null}>
        <EncodeProgress index={encode.index} total={encode.total} percent={encode.percent} />
      </ImportShell>
    )
  }

  if (phase === PHASE.SAVING) {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 100
    return (
      <ImportShell trip={trip} onBack={null}>
        <div style={{ padding: '32px 18px' }}>
          <p className="f-news" style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
            Saving…
          </p>
          <p className="f-dm" style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
            {progress.total > 0 ? `${progress.done} of ${progress.total}` : 'Filing your photos…'}
          </p>
          <ProgressBar pct={pct} />
        </div>
      </ImportShell>
    )
  }

  // CONFIRM
  return (
    <ImportShell trip={trip} onBack={onCancel}>
      <ConfirmSummary
        batch={summaryToBatch(analysis?.summary)}
        count={analysis?.summary?.willImport || 0}
        traveler={traveler}
        videos={analysis?.summary?.videos || 0}
        videosBytes={analysis?.summary?.videosBytes || 0}
        failed={analysis?.summary?.failed || 0}
        soundLost={analysis?.summary?.soundLost || 0}
        tooLongVideos={analysis?.tooLongVideos || []}
        retrying={retrying}
        onRetry={retryFailedVideos}
        onImport={() => doSave(analysis, () => false)}
        onReview={() => setPhase(PHASE.DETAIL)}
        onCancel={onCancel}
      />
    </ImportShell>
  )
}

// ─── decision ────────────────────────────────────────────────────────────

// Smart-skip: a clean batch saves silently. "Clean" = nothing the family would
// want to glance at first — no duplicates to skip, no off-route clusters we'd
// turn into stops, and either tiny or all-filed-to-stops and not huge.
function decideClean(s) {
  if (!s || s.willImport === 0) return false
  if (s.duplicates > 0 || s.autoAddedStops > 0) return false
  if (s.willImport <= TINY_BATCH) return true
  if (s.interstitials > 0) return false
  return s.willImport <= SMART_SKIP_MAX
}

// ─── confirm summary + toast (Claude Design handoff, ported) ───────────────
// Design delivered <ConfirmSummary> + <ImportToast> in the app's idiom. Ported
// with two reconciliations to the real app:
//   • TOKEN SEMANTICS: Design's `--accent-text` meant "ink ON the accent fill"
//     (system.jsx accentInk) → our `--accent-ink`. Our `--accent-text` is the
//     readable-accent-ON-bg sibling (C1), used here for the accent "→".
//   • SWITCHER DOCK: the action bar + toast clear the global persona Switcher
//     (~76–88px up, z-index 51) — the proven PhotoBackfillTriage offset; the
//     clean-phone mock has no such dock.

const SANS = 'Inter Tight, -apple-system, system-ui, sans-serif'

// Minimal line icons (currentColor; inherit accent / muted from the badge).
function Svg({ size = 18, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      {children}
    </svg>
  )
}

const ICONS = {
  Pin: (p) => (
    <Svg {...p}>
      <path d="M12 21s6.5-5.8 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.2 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.3" />
    </Svg>
  ),
  Route: (p) => (
    <Svg {...p}>
      <circle cx="6" cy="6.5" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="17.5" r="2.1" fill="currentColor" stroke="none" />
      <path d="M7.7 8.1c2.6 1.1 3.3 3 3.3 4.2 0 1.4 1.1 3 3.3 3.9" strokeDasharray="0.2 3.1" />
    </Svg>
  ),
  PinPlus: (p) => (
    <Svg {...p}>
      <path d="M12 21s6.5-5.8 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.2 12 21 12 21Z" />
      <path d="M12 7.4v6 M9 10.4h6" />
    </Svg>
  ),
  Film: (p) => (
    <Svg {...p}>
      <rect x="3.5" y="6" width="17" height="12" rx="2.4" />
      <path d="M8.6 6v12 M15.4 6v12" />
    </Svg>
  ),
  Duplicate: (p) => (
    <Svg {...p}>
      <rect x="8.5" y="8.5" width="10.5" height="10.5" rx="2.4" />
      <path d="M5 14.3V7a2 2 0 0 1 2-2h7.3" />
    </Svg>
  ),
  CalendarX: (p) => (
    <Svg {...p}>
      <rect x="4" y="5.6" width="16" height="14" rx="2.4" />
      <path d="M4 9.6h16 M8.5 4v3.2 M15.5 4v3.2" />
      <path d="M10.3 13.2l3.4 3.4 M13.7 13.2l-3.4 3.4" />
    </Svg>
  ),
  Check: (p) => (
    <Svg {...p}>
      <path d="M5 12.5l4.4 4.4L19 7.4" strokeWidth="2.2" />
    </Svg>
  ),
  Spinner: ({ size = 14 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      className="spin"
      style={{ display: 'block' }}
    >
      <path d="M12 3a9 9 0 1 1-9 9" />
    </svg>
  ),
}

// Row catalogue — ORDER defines render order; phrase may be fn(count).
const IMPORT_ROWS = [
  { key: 'filed', icon: 'Pin', phrase: 'filed to stops', note: 'matched to where you were' },
  { key: 'road', icon: 'Route', phrase: 'between stops', note: 'taken between your planned stops' },
  {
    key: 'newStops',
    icon: 'PinPlus',
    phrase: (n) => (n === 1 ? 'new stop we’ll add' : 'new stops we’ll add'),
    note: 'off-route — we didn’t plan these',
  },
  {
    key: 'videos',
    icon: 'Film',
    phrase: (n) => (n === 1 ? 'video, filed by time' : 'videos, filed by time'),
    note: 'matched by when they were taken',
  },
  {
    key: 'tooLarge',
    icon: 'CalendarX',
    phrase: (n) => (n === 1 ? 'video too large to sync' : 'videos too large to sync'),
    note: 'too big to add here — try a shorter clip',
    warn: true,
  },
  { key: 'dupes', icon: 'Duplicate', phrase: 'already imported', note: 'we’ll skip these', skip: true },
  {
    key: 'outside',
    icon: 'CalendarX',
    phrase: 'outside your trip dates',
    note: 'skipped',
    skip: true,
    footnote: true,
  },
]

// Map ImportFlow's summary → the row catalogue's keys. `newStops` is a count of
// NEW STOPS (containers), not items — it's informational; the import count is
// summary.willImport (filed + on-the-road photos + videos).
function summaryToBatch(s = {}) {
  return {
    filed: s.matchedToStops || 0,
    road: s.interstitials || 0,
    newStops: s.autoAddedStops || 0,
    videos: s.videos || 0,
    dupes: s.duplicates || 0,
    outside: s.excludedCount || 0,
    tooLarge: s.tooLarge || 0,
  }
}

function IconBadge({ name, skip, warn, small }) {
  const Glyph = ICONS[name]
  const s = small ? 28 : 38
  const tint = warn ? 'var(--danger, #8B2B1F)' : skip ? 'var(--muted)' : 'var(--accent)'
  return (
    <div
      style={{
        width: s,
        height: s,
        borderRadius: small ? 9 : 11,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: tint,
        background: `color-mix(in srgb, ${tint} 13%, transparent)`,
      }}
    >
      <Glyph size={small ? 15 : 19} />
    </div>
  )
}

function ImportRow({ row, first }) {
  const phrase = typeof row.phrase === 'function' ? row.phrase(row.count) : row.phrase
  const foot = row.footnote
  const skip = row.skip
  const warn = row.warn // a real problem (a video didn't upload) — not muted, not accent
  return (
    <div
      role="listitem"
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        columnGap: 13,
        padding: foot ? '13px 0 2px' : '14px 0',
        borderTop: first ? 'none' : '1px solid var(--border)',
      }}
    >
      <IconBadge name={row.icon} skip={skip} warn={warn} small={foot} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: SANS,
            fontSize: foot ? 13 : 15.5,
            fontWeight: 500,
            letterSpacing: '-0.006em',
            lineHeight: 1.2,
            color: warn ? 'var(--danger, #8B2B1F)' : skip ? 'var(--muted)' : 'var(--text)',
          }}
        >
          {phrase}
        </div>
        {!foot && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 2 }}>
            <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 400, lineHeight: 1.25, color: 'var(--muted)' }}>
              {row.note}
            </span>
            {row.sizeChip}
          </div>
        )}
      </div>
      <div
        className="f-news"
        style={{
          fontSize: foot ? 17 : 27,
          fontWeight: 600,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          justifySelf: 'end',
          color: warn ? 'var(--danger, #8B2B1F)' : skip ? 'var(--muted)' : 'var(--text)',
          textDecoration: skip ? 'line-through' : 'none',
          textDecorationThickness: skip ? '1.5px' : undefined,
          opacity: skip ? 0.85 : 1,
        }}
      >
        {row.count}
      </div>
    </div>
  )
}

// A calm, neutral MONO size chip — the proof value (#2). Data, not a trophy.
function SizeChip({ children }) {
  return (
    <span
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--muted)',
        background: 'color-mix(in srgb, var(--text) 6%, transparent)',
        border: '1px solid var(--border)',
        borderRadius: 999,
        padding: '1px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

// A warm AMBER notice — couldn't-add + too-long. NEVER red. The amber is the app's
// per-person gold (--kept), tinted, so it's warm and theme/dark-mode safe by
// construction; the title stays --text so it's always readable.
function AmberBanner({ icon: Icon, title, body, cta, ctaBusy, ctaBusyLabel, onCta, help, helpText, hideLabel }) {
  const [open, setOpen] = useState(false)
  const line = 'color-mix(in srgb, var(--kept) 34%, transparent)'
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '13px 14px',
        borderRadius: 14,
        marginBottom: 12,
        background: 'color-mix(in srgb, var(--kept) 13%, transparent)',
        border: `1px solid ${line}`,
      }}
    >
      <span style={{ flexShrink: 0, color: 'var(--kept)', marginTop: 1, lineHeight: 0 }}>
        <Icon size={19} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          {title}
        </div>
        {body && <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--muted)', marginTop: 3, lineHeight: 1.4 }}>{body}</div>}
        {open && helpText && (
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--muted)', marginTop: 9, lineHeight: 1.5, paddingTop: 9, borderTop: `1px solid ${line}` }}>
            {helpText}
          </div>
        )}
        {(cta || help) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {cta && (
              <button
                type="button"
                onClick={onCta}
                disabled={ctaBusy}
                style={{ border: 'none', cursor: ctaBusy ? 'default' : 'pointer', borderRadius: 999, padding: '7px 14px', background: 'var(--kept)', color: '#20160a', fontFamily: SANS, fontWeight: 600, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: ctaBusy ? 0.7 : 1 }}
              >
                {ctaBusy ? (
                  <>
                    <Loader2 size={13} className="spin" /> {ctaBusyLabel}
                  </>
                ) : (
                  <>
                    <RotateCw size={13} /> {cta}
                  </>
                )}
              </button>
            )}
            {help && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                style={{ border: `1px solid ${line}`, cursor: 'pointer', borderRadius: 999, padding: '7px 13px', background: 'transparent', color: 'var(--kept)', fontFamily: SANS, fontWeight: 600, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Scissors size={13} /> {open ? hideLabel : help}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ConfirmSummary({
  batch = {},
  count,
  traveler,
  videos = 0,
  videosBytes = 0,
  failed = 0,
  soundLost = 0,
  tooLongVideos = [],
  retrying,
  onRetry,
  onImport,
  onReview,
  onCancel,
}) {
  const c = videoCopy(traveler)
  const isRafa = traveler === 'rafa'
  const rows = IMPORT_ROWS.map((r) => {
    const base = { ...r, count: batch[r.key] || 0 }
    // The proof chip (#2) rides the "video, filed by time" row's note.
    if (r.key === 'videos' && videosBytes > 0) {
      base.sizeChip = <SizeChip>{videos === 1 ? fmtSize(videosBytes) : `${fmtSize(videosBytes)} in all`}</SizeChip>
    }
    return base
  }).filter((r) => r.count > 0)
  const n = count ?? 0
  const busy = !!(retrying && retrying.size > 0)
  // Rafa NEVER sees a failure/too-long/lost-sound banner — his lens folds them
  // into a gentle "still saving"; the honest notice surfaces to a parent's lens.
  const showFail = !isRafa && failed > 0
  const showTooLong = !isRafa && tooLongVideos.length > 0
  const showSoundLost = !isRafa && soundLost > 0 && !!c.soundLost

  return (
    <div data-testid="import-confirm">
      {/* manifest — scrolls above the fixed action bar */}
      <div style={{ padding: '2px 22px 200px' }}>
        {/* too-long: a gentle boundary + trim hand-off (#4) */}
        {showTooLong &&
          tooLongVideos.map((clip, i) => (
            <AmberBanner
              key={`long-${i}`}
              icon={Clock}
              title={c.tooLong(fmtDur(clip.durationMs))}
              body={c.tooLongBody}
              help={c.tooLongCta}
              helpText={c.tooLongHelp}
              hideLabel={c.hide}
            />
          ))}
        {/* sound couldn't come along: the clip still imports (video-only), but
            the loss is said out loud — the source had sound; the saved copy
            won't. Warm amber, no CTA (nothing to retry — the camera-roll
            original keeps the sound). */}
        {showSoundLost && (
          <div data-testid="import-sound-lost">
            <AmberBanner icon={VolumeX} title={c.soundLost(soundLost)} body={c.soundLostBody} />
          </div>
        )}
        {/* couldn't-add: one warm banner, celebrate the rest, retry attached (#2) */}
        {showFail && (
          <AmberBanner
            icon={AlertTriangle}
            title={videos > 0 ? c.failMulti(videos, failed) : c.failSolo}
            body={c.failBody}
            cta={c.failRetry}
            ctaBusy={busy}
            ctaBusyLabel={c.retrying}
            onCta={onRetry}
          />
        )}
        <div className="smallcaps" style={{ fontSize: 9.5, color: 'var(--muted)', padding: '4px 0 2px' }}>
          How these will file
        </div>
        <div role="list">
          {rows.map((r, i) => (
            <ImportRow key={r.key} row={r} first={i === 0} />
          ))}
        </div>
      </div>

      {/* action bar — fixed, clearing the global persona Switcher dock (the proven
          PhotoBackfillTriage offset: bottom safe-area + 76px, z-index 51). */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 'calc(env(safe-area-inset-bottom) + 76px)',
          padding: '12px 22px',
          background: 'var(--bg)',
          borderTop: '1px solid var(--border)',
          zIndex: 51,
        }}
      >
        <button
          type="button"
          data-testid="import-confirm-go"
          className="btn-pill"
          onClick={onImport}
          style={{
            width: '100%',
            height: 54,
            fontSize: 17,
            letterSpacing: '-0.01em',
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            boxShadow: '0 6px 18px color-mix(in srgb, var(--accent) 35%, transparent)',
            cursor: 'pointer',
          }}
        >
          Import {n}
        </button>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 4,
            height: 44,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: SANS,
              fontSize: 14.5,
              fontWeight: 500,
              color: 'var(--muted)',
              padding: '8px 4px',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="import-confirm-review"
            onClick={onReview}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: SANS,
              fontSize: 14.5,
              fontWeight: 600,
              color: 'var(--text)',
              padding: '8px 4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            Review in detail
            <span style={{ color: 'var(--accent-text)', fontSize: 16, marginTop: -1 }}>→</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// Smart-skip toast — the only acknowledgement a clean import gets. Bottom-center,
// clears the Switcher dock (+88px). Exported for PhotosView.
export function ImportToast({ count = 0, noun = 'photos', syncing = 0, message, onClick }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    setShown(true)
  }, [])
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 'calc(env(safe-area-inset-bottom) + 88px)',
        display: 'flex',
        justifyContent: 'center',
        padding: '0 16px',
        pointerEvents: 'none',
        zIndex: 120,
      }}
    >
      <div
        data-testid="import-toast"
        role="status"
        aria-live="polite"
        onClick={onClick}
        style={{
          pointerEvents: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 11,
          maxWidth: '100%',
          padding: '11px 17px 11px 11px',
          borderRadius: 15,
          background: 'var(--card)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          boxShadow: '0 14px 34px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.45) inset',
          opacity: shown ? 1 : 0,
          transform: shown ? 'translateY(0)' : 'translateY(12px)',
          transition:
            'opacity .42s cubic-bezier(.2,.8,.3,1), transform .42s cubic-bezier(.2,.8,.3,1)',
        }}
      >
        <span
          style={{
            width: 27,
            height: 27,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
          }}
        >
          <ICONS.Check size={16} />
        </span>
        <span
          style={{
            fontFamily: SANS,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
          }}
        >
          {message || `${count} ${noun} added`}
        </span>
        {syncing > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: SANS,
              fontSize: 13.5,
              fontWeight: 500,
              color: 'var(--muted)',
              whiteSpace: 'nowrap',
            }}
          >
            <span aria-hidden style={{ opacity: 0.5 }}>·</span>
            <span style={{ display: 'inline-flex', color: 'var(--accent-text)' }}>
              <ICONS.Spinner size={13} />
            </span>
            {syncing} syncing
          </span>
        )}
      </div>
    </div>
  )
}

// ─── shared chrome + bits ──────────────────────────────────────────────────

function ImportShell({ trip, onBack, children }) {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', paddingBottom: 80 }}>
      <div style={{ padding: 'calc(env(safe-area-inset-top) + 60px) 18px 4px' }}>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="link-quiet f-dm"
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              opacity: 0.7,
              color: 'var(--text)',
            }}
          >
            <ChevronLeft size={14} /> Back
          </button>
        ) : null}
        <h1 className="f-news" style={{ fontSize: 28, lineHeight: 1.05, fontWeight: 700, marginTop: onBack ? 18 : 0 }}>
          Import photos
        </h1>
        <p className="f-news-i" style={{ fontSize: 14, opacity: 0.6, marginTop: 6 }}>
          {trip?.title}
        </p>
      </div>
      {children}
    </div>
  )
}

function LoaderLine({ text }) {
  return (
    <div style={{ padding: '32px 18px', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--muted)' }}>
      <Loader2 size={18} className="spin" />
      <p className="f-news" style={{ margin: 0, fontSize: 16 }}>{text}</p>
    </div>
  )
}

function EncodeProgress({ index, total, percent }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent || 0)))
  return (
    <div data-testid="import-encoding" data-percent={clamped} style={{ padding: '24px 18px 26px' }}>
      <div
        className="f-mono smallcaps"
        style={{ fontSize: 9, letterSpacing: '0.22em', color: 'var(--muted)', marginBottom: 10 }}
      >
        {total > 1 ? `Preparing video ${index + 1} of ${total}` : 'Preparing your video'}
      </div>
      <div
        className="f-news"
        style={{ fontSize: 64, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', color: 'var(--text)' }}
      >
        {clamped}
        <span style={{ fontSize: 22, fontStyle: 'italic', opacity: 0.6, fontWeight: 400, marginLeft: 4 }}>%</span>
      </div>
      <ProgressBar pct={clamped} />
      <p
        className="f-mono smallcaps"
        style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--muted)', opacity: 0.7, marginTop: 10 }}
      >
        Keep this screen open
      </p>
    </div>
  )
}

function ProgressBar({ pct }) {
  return (
    <div style={{ marginTop: 16, height: 6, borderRadius: 3, background: 'var(--bg2, #EEE7D8)', overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          height: '100%',
          background: 'var(--accent)',
          transition: 'width 200ms',
        }}
      />
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────

function partitionByType(files) {
  const photoFiles = []
  const videoFiles = []
  for (const f of files || []) {
    const t = (f?.type || '').toLowerCase()
    if (t.startsWith('video/')) videoFiles.push(f)
    else photoFiles.push(f)
  }
  return { photoFiles, videoFiles }
}

function itemId(file, i) {
  return `pick-${i}-${file?.name || 'unnamed'}-${file?.size || 0}`
}

function safeExistingPhotoMemories(trip, traveler) {
  try {
    return listMemoriesForTrip(trip.id, traveler).filter((m) => m.kind === 'photo')
  } catch {
    return []
  }
}

// Duplicate / re-attach detection — same ±60s capture-time heuristic the
// reconcile editor uses (PhotoBackfillTriage#isDuplicateOf). Kept in step with
// that copy: same EXIF time within 60s as an existing photo memory = duplicate
// (skip); same time as a metadata-only memory = re-attach (link the bytes).
function findDuplicate(capturedAt, existingMemories) {
  if (!capturedAt) return null
  const t = Date.parse(capturedAt)
  if (!Number.isFinite(t)) return null
  for (const m of existingMemories) {
    if (!m?.capturedAt) continue
    const mt = Date.parse(m.capturedAt)
    if (!Number.isFinite(mt)) continue
    if (Math.abs(t - mt) > 60_000) continue
    const hasPhoto = m.photoRefs?.length > 0 || !!m.photoRef
    if (hasPhoto) return { duplicate: m, reattach: null }
    return { duplicate: null, reattach: m }
  }
  return null
}
