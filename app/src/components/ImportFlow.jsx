import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Loader2, AlertCircle } from 'lucide-react'
import { readExifForImport, filterByTripRange } from '../lib/photoBackfill'
import { matchPhotosToStops } from '../lib/photoMatch'
import { buildReconciliationDraft } from '../lib/reconcileDraft'
import { applyReconciliation } from '../lib/reconcileApply'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { uploadBackfillPhotos } from '../lib/photoBackfillUpload'
import { encodeVideo, isVideoEncodeSupported } from '../lib/videoPipeline'
import { extractVideoCreationDate } from '../lib/videoMeta'
import { logUploadEvent } from '../lib/uploadLog'
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

export function ImportFlow({ trip, traveler, files, tripsApi, onCancel, onComplete }) {
  const [phase, setPhase] = useState(PHASE.PREPARING)
  const [analysis, setAnalysis] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, currentName: null })
  const [encode, setEncode] = useState({ index: 0, total: 0, percent: 0 })
  const [error, setError] = useState(null)
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
            photo: { id, capturedAt: exif.capturedAt, lat: exif.lat, lng: exif.lng },
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
        if (videoFiles.length > 0 && isVideoEncodeSupported()) {
          setPhase(PHASE.ENCODING)
          for (let vi = 0; vi < videoFiles.length; vi++) {
            if (cancelled) return
            const f = videoFiles[vi]
            setEncode({ index: vi, total: videoFiles.length, percent: 0 })
            try {
              const capturedAtPromise = extractVideoCreationDate(f).catch(() => null)
              const enc = await encodeVideo(f, {
                onProgress: (p) => {
                  if (!cancelled) setEncode({ index: vi, total: videoFiles.length, percent: p })
                },
              })
              const capturedAt = await capturedAtPromise
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
                },
                exif: { capturedAt, lat: null, lng: null },
                photo: { id, capturedAt, lat: null, lng: null },
              })
            } catch (err) {
              // This clip won't encode on this device — skip it silently and
              // keep the rest of the batch moving. The UI stays quiet (the
              // Apple/Google Photos feel), but the swallowed skip is logged
              // to the dev upload log so it's traceable and harvestable — a
              // Bucket A silent failure, exactly as the old dispatch composer
              // recorded its silent video-encode failures.
              logUploadEvent({
                code: 'video-encode-failed',
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
          if (item.kind === 'video') videos += 1
          else if (stopId) matchedToStops += 1
          else interstitials += 1
          payload.push({
            kind: item.kind,
            file: item.file,
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
          excludedCount,
        }
        const data = { payload, out, summary }
        if (cancelled) return
        setAnalysis(data)

        if (payload.length === 0) {
          // Nothing new (all duplicates / out of range) — bounce straight back
          // with a "nothing new" toast rather than an empty confirm screen.
          onComplete?.({ ok: 0, queued: 0, reattached: 0, failed: 0, nothingNew: true })
          return
        }

        // Test seam (parallels AddDispatchModal's __RT_FORCE_BUCKETC): force
        // the confirm view so the Simulator video gate can assert "encode ran
        // → video summary" and stop before a real Worker upload. Inert in
        // production — the global is never set there.
        const forceConfirm = typeof window !== 'undefined' && !!window.__RT_IMPORT_FORCE_CONFIRM
        if (!forceConfirm && decideClean(summary)) {
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
      onComplete?.(results)
    } catch (err) {
      savingRef.current = false
      setError(err?.message || String(err))
      setPhase(PHASE.ERROR)
    }
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
  { key: 'road', icon: 'Route', phrase: 'on the road', note: 'between stops · in transit' },
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
  }
}

function IconBadge({ name, skip, small }) {
  const Glyph = ICONS[name]
  const s = small ? 28 : 38
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
        color: skip ? 'var(--muted)' : 'var(--accent)',
        background: skip
          ? 'color-mix(in srgb, var(--muted) 13%, transparent)'
          : 'color-mix(in srgb, var(--accent) 13%, transparent)',
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
      <IconBadge name={row.icon} skip={skip} small={foot} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: SANS,
            fontSize: foot ? 13 : 15.5,
            fontWeight: 500,
            letterSpacing: '-0.006em',
            lineHeight: 1.2,
            color: skip ? 'var(--muted)' : 'var(--text)',
          }}
        >
          {phrase}
        </div>
        {!foot && (
          <div
            style={{
              fontFamily: SANS,
              fontSize: 12.5,
              fontWeight: 400,
              marginTop: 2,
              lineHeight: 1.25,
              color: 'var(--muted)',
            }}
          >
            {row.note}
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
          color: skip ? 'var(--muted)' : 'var(--text)',
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

function ConfirmSummary({ batch = {}, count, onImport, onReview, onCancel }) {
  const rows = IMPORT_ROWS.map((r) => ({ ...r, count: batch[r.key] || 0 })).filter((r) => r.count > 0)
  const n = count ?? 0

  return (
    <div data-testid="import-confirm">
      {/* manifest — scrolls above the fixed action bar */}
      <div style={{ padding: '2px 22px 200px' }}>
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
