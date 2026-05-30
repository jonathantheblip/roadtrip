import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Image as ImageIcon, Film, Check, Loader } from 'lucide-react'
import { preparePhotoForUpload } from '../lib/photoPipeline'
import { encodeVideo, isVideoEncodeSupported } from '../lib/videoPipeline'
import { extractVideoCreationDate } from '../lib/videoMeta'
import { saveMemory } from '../lib/memoryStore'
import { enqueue, registerBackgroundSync } from '../lib/uploadQueue'
import { isWorkerConfigured, workerFetch } from '../lib/workerSync'
import {
  classifyUploadError,
  userFacingErrorForOutcome,
  copyForOutcome,
} from '../lib/dispatchErrors'
import { logUploadEvent } from '../lib/uploadLog'

// AddDispatchModal — bottom-sheet composer for the "Add photo or
// video" CTA in PhotosView. M2 shipped the photo path; M3 wires the
// video path (WebCodecs encode in a worker, MP4 mux via mp4-muxer).
//
// Per the carryover §3, this surface renders no per-code error copy.
// Failures collapse to:
//   - Bucket A (silent): jump to 'done', let the sync pill carry it.
//   - Bucket C (3 fixed plain-language messages): a single panel.
//
// The video picker is only rendered when WebCodecs is supported on
// this device. iOS Safari ≥17.4 + Chromium qualify; older Safari +
// every other browser without VideoEncoder do not, and the affordance
// is hidden entirely (no "Update iOS" copy ever).
//
// Every silent and surfaced failure is captured in the dev-mode upload
// log via logUploadEvent() so Jonathan can trace what happened without
// re-running the bug.

const MAX_OUTPUT_BYTES = 6 * 1024 * 1024 // sanity ceiling AFTER photo downscale
const VIDEO_MAX_OUTPUT_BYTES = 25 * 1024 * 1024 // §4 post-encode cap

export function AddDispatchModal({ trip, traveler, onClose, onSaved }) {
  const photoInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const [phase, setPhase] = useState('pick') // 'pick' | 'preparing' | 'encoding' | 'preview' | 'uploading' | 'bucketC' | 'done'
  // `prep` holds the prepared upload payload for either a photo or a
  // video. Shape:
  //   { kind: 'photo', blob, mime, width, height, originalWidth, originalHeight, exif }
  //   { kind: 'video', blob, mime, width, height, durationMs, posterBlob }
  const [prep, setPrep] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [posterUrl, setPosterUrl] = useState(null)
  const [caption, setCaption] = useState('')
  const [stopId, setStopId] = useState(() => defaultStopForToday(trip)?.id || '')
  const [bucketCOutcome, setBucketCOutcome] = useState(null)
  const [encodeProgress, setEncodeProgress] = useState(0)
  // Track how many times the current file has been through the pipeline.
  // §3: decode/encode failures retry silently once; only on attempt 2
  // do they upgrade to a Bucket C 'photo-unreadable' outcome.
  const decodeAttemptsRef = useRef(0)
  const lastPickedFileRef = useRef(null)
  const videoSupported = useMemo(() => isVideoEncodeSupported(), [])

  // Test hook for screenshot capture — when the page sets
  // `window.__RT_FORCE_BUCKETC = 'photo-too-large' | 'video-too-long'
  // | 'photo-unreadable'`, the modal mounts directly into the Bucket C
  // panel for that outcome. Production code paths never read this.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const forced = window.__RT_FORCE_BUCKETC
    if (typeof forced === 'string' && forced) {
      setBucketCOutcome(forced)
      setPhase('bucketC')
    }
  }, [])

  // Pick the closest stop to the photo's capturedAt time once EXIF
  // resolves — Helen most often uploads "from when we were at X."
  useEffect(() => {
    if (prep?.kind !== 'photo') return
    if (!prep?.exif?.capturedAt) return
    const closest = closestStopByTime(trip, prep.exif.capturedAt)
    if (closest) setStopId(closest.id)
  }, [prep, trip])

  useEffect(() => {
    if (!prep?.blob) return
    const url = URL.createObjectURL(prep.blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [prep])

  // Video posters live separately so the tile in the album has
  // something to render while the upload is pending.
  useEffect(() => {
    if (!prep?.posterBlob) {
      setPosterUrl(null)
      return
    }
    const url = URL.createObjectURL(prep.posterBlob)
    setPosterUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [prep])

  function openPhotoPicker() {
    setBucketCOutcome(null)
    decodeAttemptsRef.current = 0
    lastPickedFileRef.current = null
    photoInputRef.current?.click()
  }

  function openVideoPicker() {
    setBucketCOutcome(null)
    decodeAttemptsRef.current = 0
    lastPickedFileRef.current = null
    videoInputRef.current?.click()
  }

  async function runPhotoPipeline(file, { attempt }) {
    return preparePhotoForUpload(file, { maxOutputBytes: MAX_OUTPUT_BYTES })
      .then((result) => ({ ok: true, result: { kind: 'photo', ...result } }))
      .catch((err) => ({
        ok: false,
        err,
        code: err?.code || classifyUploadError(err) || 'decode-failed',
        attempt,
      }))
  }

  async function runVideoPipeline(file, { onProgress }) {
    // Read the container creation date in parallel with the encode —
    // it's cheap and gives us the album's source-of-truth date even
    // when the user uploads weeks after capture. Tolerates a parse
    // failure: returns null and the album falls back to upload time.
    const capturedAtPromise = extractVideoCreationDate(file).catch(() => null)
    return encodeVideo(file, { onProgress })
      .then(async (result) => ({
        ok: true,
        result: {
          kind: 'video',
          mime: 'video/mp4',
          blob: result.blob,
          width: result.width,
          height: result.height,
          durationMs: result.durationMs,
          posterBlob: result.posterBlob || null,
          capturedAt: await capturedAtPromise,
        },
      }))
      .catch((err) => ({
        ok: false,
        err,
        code: err?.code || classifyUploadError(err) || 'video-encode-failed',
      }))
  }

  async function onPhotoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    lastPickedFileRef.current = file
    decodeAttemptsRef.current = 1
    setPhase('preparing')
    setBucketCOutcome(null)

    const fileMeta = fileMetaForLog(file)
    let outcome = await runPhotoPipeline(file, { attempt: 1 })

    if (!outcome.ok) {
      // Log the first failure silently — §3 traceability.
      logUploadEvent({
        code: outcome.code,
        message: outcome.err?.message,
        stack: outcome.err?.stack,
        fileMeta,
        attempt: 1,
        context: { phase: 'photo-prepare' },
      })

      if (outcome.code === 'still-too-large') {
        setBucketCOutcome('photo-too-large')
        setPhase('bucketC')
        return
      }
      if (
        outcome.code === 'decode-failed' ||
        outcome.code === 'heic-decode-failed' ||
        outcome.code === 'canvas-encode-failed'
      ) {
        decodeAttemptsRef.current = 2
        outcome = await runPhotoPipeline(file, { attempt: 2 })
        if (!outcome.ok) {
          logUploadEvent({
            code: outcome.code,
            outcome: 'photo-unreadable',
            message: outcome.err?.message,
            stack: outcome.err?.stack,
            fileMeta,
            attempt: 2,
            context: { phase: 'photo-prepare-retry' },
          })
          setBucketCOutcome('photo-unreadable')
          setPhase('bucketC')
          return
        }
      } else {
        // Bucket A — silent reset to picker.
        setPhase('pick')
        return
      }
    }
    setPrep(outcome.result)
    setPhase('preview')
  }

  async function onVideoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    lastPickedFileRef.current = file
    setPhase('encoding')
    setEncodeProgress(0)
    setBucketCOutcome(null)

    const fileMeta = fileMetaForLog(file)
    const outcome = await runVideoPipeline(file, {
      onProgress: (pct) => setEncodeProgress(pct),
    })

    if (!outcome.ok) {
      logUploadEvent({
        code: outcome.code,
        message: outcome.err?.message,
        stack: outcome.err?.stack,
        fileMeta,
        attempt: 1,
        context: { phase: 'video-encode' },
      })
      // §4: WebCodecs-unavailable is silent (the picker shouldn't have
      // been visible anyway). Encode failures are silent — the file
      // isn't going to encode differently on retry; we don't surface
      // Bucket C unless the user asked us to try again explicitly.
      setPhase('pick')
      return
    }

    // 25 MB post-encode cap (§4). The Worker can accept much larger,
    // but this is a reasonable cellular ceiling.
    if (outcome.result.blob.size > VIDEO_MAX_OUTPUT_BYTES) {
      logUploadEvent({
        code: 'video-too-large',
        outcome: 'video-too-long',
        message: `encoded ${outcome.result.blob.size} > ${VIDEO_MAX_OUTPUT_BYTES}`,
        fileMeta: { ...fileMeta, encodedSize: outcome.result.blob.size },
        attempt: 1,
        context: { phase: 'video-size-cap' },
      })
      setBucketCOutcome('video-too-long')
      setPhase('bucketC')
      return
    }

    setPrep(outcome.result)
    setPhase('preview')
  }

  async function submit() {
    if (!prep || !stopId) return
    setPhase('uploading')
    setBucketCOutcome(null)
    const memoryId = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    const isVideo = prep.kind === 'video'
    // capturedAtSource — what the album's top-level capturedAt is
    // derived from. Memory-level capturedAt is the source-of-truth
    // for sort + label; null lets the album fall back to upload time
    // with the '· uploaded' label. We intentionally do NOT stamp the
    // ref with a fake `new Date()` when no real source exists — the
    // album reads the absence as "no capture date for this content"
    // and the fallback path renders correctly.
    const capturedAtSource = isVideo
      ? prep.capturedAt || null
      : prep.exif?.capturedAt || null
    const baseRef = isVideo
      ? {
          kind: 'video',
          mime: prep.mime,
          width: prep.width,
          height: prep.height,
          durationMs: prep.durationMs,
          capturedAt: capturedAtSource,
        }
      : {
          kind: 'photo',
          mime: prep.mime,
          width: prep.width,
          height: prep.height,
          originalWidth: prep.originalWidth,
          originalHeight: prep.originalHeight,
          capturedAt: capturedAtSource,
          lat: prep.exif?.lat ?? null,
          lng: prep.exif?.lng ?? null,
        }

    // The album reads memories as 'kind: photo' for tile rendering
    // regardless of payload, with photoRef.kind distinguishing video.
    // The poster URL is what shows in the tile while the upload is
    // pending; the actual video is fetched lazily from the lightbox.
    function saveLocal(photoRef) {
      const rec = saveMemory({
        id: memoryId,
        tripId: trip.id,
        stopId,
        authorTraveler: traveler,
        visibility: 'shared',
        kind: 'photo',
        caption: caption.trim() || null,
        photoRef,
        // Memory-level date passes through to the album as the
        // primary sort + label. null when neither EXIF (photos) nor
        // mvhd/Apple Keys (videos) gave us a date — the album then
        // shows the upload time with the '· uploaded' label.
        capturedAt: capturedAtSource,
      })
      onSaved?.(rec)
    }

    const pendingPreviewUrl = isVideo
      ? URL.createObjectURL(prep.posterBlob || prep.blob)
      : URL.createObjectURL(prep.blob)
    const fileMeta = {
      name: isVideo ? 'video' : prep.mime || 'photo',
      type: prep.mime,
      size: prep.blob?.size,
      exifDate: isVideo ? prep.capturedAt || null : prep.exif?.capturedAt || null,
    }

    async function queueSilently(triggeringErr) {
      const code = classifyUploadError(triggeringErr) || 'network'
      try {
        await enqueue({
          id: memoryId,
          tripId: trip.id,
          stopId,
          kind: isVideo ? 'video' : 'photo',
          blob: prep.blob,
          posterBlob: isVideo ? prep.posterBlob || null : null,
          caption: caption.trim() || null,
          authorTraveler: traveler,
          ref: baseRef,
          lastErrorCode: code,
          lastError: triggeringErr?.message || null,
        })
        saveLocal({ ...baseRef, storage: 'pending', url: pendingPreviewUrl })
        await registerBackgroundSync().catch(() => {})
        logUploadEvent({
          code,
          message: triggeringErr?.message,
          stack: triggeringErr?.stack,
          fileMeta,
          attempt: 1,
          context: { phase: 'upload-queued', kind: isVideo ? 'video' : 'photo' },
        })
        setPhase('done')
      } catch (queueErr) {
        // §3: queue-insert failure stays silent — never crash the
        // composer. The in-memory blob URL keeps the tile alive.
        const queueCode = classifyUploadError(queueErr) || 'storage-quota'
        logUploadEvent({
          code: queueCode,
          message: queueErr?.message,
          stack: queueErr?.stack,
          fileMeta,
          attempt: 1,
          context: { phase: 'queue-insert-failed' },
        })
        saveLocal({ ...baseRef, storage: 'pending', url: pendingPreviewUrl })
        setPhase('done')
      }
    }

    if (!isWorkerConfigured()) {
      await queueSilently(new Error('worker not configured'))
      return
    }

    // The Worker's /assets/photo/:id route handles arbitrary content
    // types — it routes to R2 by inspecting Content-Type, so the same
    // endpoint serves video/mp4 uploads. No worker-side change needed.
    const endpoint = isVideo ? 'video' : 'photo'
    try {
      const r = await workerFetch(
        `/assets/${endpoint}/${encodeURIComponent(memoryId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': prep.mime },
          body: prep.blob,
        }
      )
      const remote = await r.json() // { key, url, mime }
      URL.revokeObjectURL(pendingPreviewUrl)
      saveLocal({
        ...baseRef,
        storage: 'r2',
        key: remote.key,
        url: remote.url,
      })
      setPhase('done')
    } catch (err) {
      await queueSilently(err)
    }
  }

  const stopOptions = useMemo(() => allStopOptions(trip), [trip])

  return (
    <div
      role="dialog"
      data-testid="add-dispatch-modal"
      aria-label="Add photo or video"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        background: 'color-mix(in srgb, var(--bg, #000) 70%, transparent)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'var(--bg)',
          color: 'var(--text)',
          width: '100%',
          maxWidth: 480,
          maxHeight: '92vh',
          overflowY: 'auto',
          borderRadius: '16px 16px 0 0',
          padding: '22px 22px 30px',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.32)',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              opacity: 0.6,
            }}
          >
            {videoSupported ? 'Add photo or video' : 'Add photo'}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 0,
              padding: 4,
              cursor: 'pointer',
              color: 'var(--muted)',
            }}
          >
            <X size={18} />
          </button>
        </header>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          data-testid="dispatch-file-input"
          onChange={onPhotoChange}
          style={{ display: 'none' }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          data-testid="dispatch-video-input"
          onChange={onVideoChange}
          style={{ display: 'none' }}
        />

        {phase === 'pick' && (
          <PickPanel
            onPickPhoto={openPhotoPicker}
            onPickVideo={videoSupported ? openVideoPicker : null}
          />
        )}
        {phase === 'preparing' && (
          <Status icon={<Loader size={18} />} text="Reading your photo…" />
        )}
        {phase === 'encoding' && (
          <EncodingPanel percent={encodeProgress} />
        )}
        {phase === 'preview' && prep && (
          <PreviewPanel
            previewUrl={previewUrl}
            posterUrl={posterUrl}
            prep={prep}
            caption={caption}
            onCaptionChange={setCaption}
            stopId={stopId}
            stopOptions={stopOptions}
            onStopChange={setStopId}
            onCancel={() => {
              setPrep(null)
              setPreviewUrl(null)
              setPosterUrl(null)
              setPhase('pick')
            }}
            onSubmit={submit}
          />
        )}
        {phase === 'uploading' && (
          <Status icon={<Loader size={18} />} text="Sharing…" />
        )}
        {phase === 'bucketC' && bucketCOutcome && (
          <BucketCErrorPanel
            outcome={bucketCOutcome}
            onPickAnother={() => {
              const wasVideo = bucketCOutcome === 'video-too-long'
              setBucketCOutcome(null)
              setPrep(null)
              setPreviewUrl(null)
              setPosterUrl(null)
              setPhase('pick')
              setTimeout(() => {
                if (wasVideo && videoSupported) openVideoPicker()
                else openPhotoPicker()
              }, 0)
            }}
            onClose={onClose}
          />
        )}
        {phase === 'done' && (
          <Status
            icon={<Check size={18} />}
            text={
              prep?.kind === 'video'
                ? 'Saved. Your video is in the album.'
                : 'Saved. Your photo is in the album.'
            }
            tone="ok"
          />
        )}
      </div>
    </div>
  )
}

function PickPanel({ onPickPhoto, onPickVideo }) {
  const buttonStyle = {
    width: '100%',
    padding: '20px 14px',
    background: 'transparent',
    border: '1px dashed var(--accent)',
    borderRadius: 12,
    cursor: 'pointer',
    color: 'var(--text)',
    fontFamily: 'Fraunces, Georgia, serif',
    fontSize: 16,
    fontStyle: 'italic',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  }
  return (
    <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        type="button"
        data-testid="open-picker"
        onClick={onPickPhoto}
        style={buttonStyle}
      >
        <ImageIcon size={18} style={{ color: 'var(--accent)' }} />
        Pick a photo
      </button>
      {onPickVideo && (
        <button
          type="button"
          data-testid="open-video-picker"
          onClick={onPickVideo}
          style={buttonStyle}
        >
          <Film size={18} style={{ color: 'var(--accent)' }} />
          Pick a video
        </button>
      )}
    </div>
  )
}

// Encoding progress for the video path. Spec §4 wants Fraunces serif
// for the big percent number and a thin mono bar underneath — without
// it Helen will think the app froze.
function EncodingPanel({ percent }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent || 0)))
  return (
    <div
      data-testid="dispatch-encoding"
      data-percent={clamped}
      style={{
        padding: '24px 18px 26px',
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card, transparent)',
      }}
    >
      <div
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 10,
        }}
      >
        Preparing your video
      </div>
      <div
        style={{
          fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
          fontSize: 64,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: '-0.03em',
          color: 'var(--text)',
        }}
      >
        {clamped}
        <span
          style={{
            fontSize: 22,
            fontStyle: 'italic',
            opacity: 0.6,
            fontWeight: 400,
            marginLeft: 4,
          }}
        >
          %
        </span>
      </div>
      <div
        aria-hidden="true"
        style={{
          marginTop: 14,
          height: 4,
          width: '100%',
          background: 'var(--border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          data-testid="dispatch-encoding-bar"
          style={{
            height: '100%',
            width: `${clamped}%`,
            background: 'var(--accent)',
            transition: 'width 120ms ease-out',
          }}
        />
      </div>
      <p
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          opacity: 0.7,
          marginTop: 10,
        }}
      >
        Keep this screen open
      </p>
    </div>
  )
}

function PreviewPanel({
  previewUrl,
  posterUrl,
  prep,
  caption,
  onCaptionChange,
  stopId,
  stopOptions,
  onStopChange,
  onCancel,
  onSubmit,
}) {
  const isVideo = prep.kind === 'video'
  return (
    <div>
      <div
        style={{
          width: '100%',
          aspectRatio: '4 / 3',
          background: '#000',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        {isVideo && previewUrl ? (
          <video
            src={previewUrl}
            poster={posterUrl || undefined}
            controls
            playsInline
            data-testid="dispatch-preview-video"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              background: '#000',
            }}
          />
        ) : (
          previewUrl && (
            <img
              src={previewUrl}
              alt="Preview"
              data-testid="dispatch-preview-image"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          )
        )}
      </div>
      {/* Internal metadata line — terse, no MB/bytes/EXIF labels per §3. */}
      <div
        data-testid="prep-metadata"
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 12,
          opacity: 0.85,
        }}
      >
        {isVideo
          ? `${prep.width}×${prep.height} · ${Math.max(1, Math.round((prep.durationMs || 0) / 1000))}s`
          : `${prep.width}×${prep.height} from ${prep.originalWidth}×${prep.originalHeight}`}
      </div>

      <label style={labelStyle}>Caption (optional)</label>
      <textarea
        data-testid="dispatch-caption"
        value={caption}
        onChange={(e) => onCaptionChange(e.target.value)}
        rows={2}
        placeholder="One line for the album, or two."
        style={{
          width: '100%',
          padding: '8px 10px',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'transparent',
          color: 'var(--text)',
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 14.5,
          resize: 'vertical',
        }}
      />

      <label style={{ ...labelStyle, marginTop: 14 }}>Attach to event</label>
      <select
        data-testid="dispatch-stop"
        value={stopId}
        onChange={(e) => onStopChange(e.target.value)}
        style={{
          width: '100%',
          padding: '9px 10px',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'transparent',
          color: 'var(--text)',
          fontFamily: 'Inter Tight, system-ui, sans-serif',
          fontSize: 14,
        }}
      >
        {stopOptions.map((opt) => (
          <option key={opt.id} value={opt.id} style={{ color: '#1A1614' }}>
            Day {opt.dayN} · {opt.time} · {opt.name}
          </option>
        ))}
      </select>

      <div style={{ display: 'flex', gap: 8, marginTop: 22, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} className="btn-pill" style={{ cursor: 'pointer' }}>
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          data-testid="dispatch-submit"
          disabled={!stopId}
          className="btn-pill"
          style={{
            cursor: stopId ? 'pointer' : 'not-allowed',
            background: 'var(--accent)',
            color: '#fff',
            border: '1px solid var(--accent)',
          }}
        >
          Save dispatch
        </button>
      </div>
    </div>
  )
}

function Status({ icon, text, tone }) {
  return (
    <div
      data-testid="dispatch-status"
      style={{
        padding: '18px 14px',
        border: '1px solid var(--border)',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: tone === 'ok' ? 'var(--accent)' : 'var(--text)',
        fontFamily: 'Fraunces, Georgia, serif',
        fontSize: 14.5,
      }}
    >
      {icon}
      <span>{text}</span>
    </div>
  )
}

// The ONLY user-visible failure surface. Renders one of the three
// Bucket C plain-language outcomes from dispatchErrors.js. There is no
// per-code variation — anything that needs to be more specific should
// be queued silently and logged to the dev panel instead.
function BucketCErrorPanel({ outcome, onPickAnother, onClose }) {
  const copy = copyForOutcome(outcome)
  return (
    <div
      data-testid="dispatch-bucketC"
      data-outcome={outcome}
      style={{
        padding: '20px 16px',
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--card, transparent)',
      }}
    >
      <p
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 17,
          fontWeight: 600,
          margin: '0 0 8px',
          color: 'var(--text)',
          lineHeight: 1.3,
        }}
      >
        {copy.title}
      </p>
      <p
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 14.5,
          color: 'var(--text)',
          margin: '0 0 16px',
          lineHeight: 1.45,
          opacity: 0.85,
        }}
      >
        {copy.body}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onClose}
          className="btn-pill"
          style={{ cursor: 'pointer' }}
        >
          Close
        </button>
        <button
          type="button"
          onClick={onPickAnother}
          data-testid="dispatch-bucketC-action"
          className="btn-pill"
          style={{
            cursor: 'pointer',
            background: 'var(--accent)',
            color: '#fff',
            border: '1px solid var(--accent)',
          }}
        >
          Pick another
        </button>
      </div>
    </div>
  )
}

const labelStyle = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 9,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  opacity: 0.55,
  marginBottom: 6,
  display: 'block',
}

// ─── stop association helpers ────────────────────────────────────────

function allStopOptions(trip) {
  const out = []
  for (const day of trip?.days || []) {
    for (const stop of day.stops || []) {
      out.push({ id: stop.id, dayN: day.n, time: stop.time || '', name: stop.name || stop.id })
    }
  }
  return out
}

function defaultStopForToday(trip) {
  const today = new Date().toISOString().slice(0, 10)
  const day =
    (trip?.days || []).find((d) => d.isoDate === today) ||
    (trip?.days || [])[0]
  return day?.stops?.[0] || null
}

function closestStopByTime(trip, isoTimestamp) {
  if (!trip || !isoTimestamp) return null
  const t = Date.parse(isoTimestamp)
  if (Number.isNaN(t)) return null
  let best = null
  let bestDelta = Infinity
  for (const day of trip.days || []) {
    if (!day.isoDate) continue
    for (const stop of day.stops || []) {
      const stopMs = stopMillis(day.isoDate, stop.time)
      if (stopMs == null) continue
      const delta = Math.abs(t - stopMs)
      if (delta < bestDelta) {
        bestDelta = delta
        best = stop
      }
    }
  }
  return best
}

function stopMillis(isoDate, timeStr) {
  if (!isoDate || !timeStr) return null
  const m = String(timeStr).trim().match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  const ampm = (m[3] || '').toUpperCase()
  if (ampm === 'PM' && h < 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  const d = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(h, min, 0, 0)
  return d.getTime()
}

function fileMetaForLog(file) {
  if (!file) return null
  return {
    name: file.name,
    type: file.type,
    size: file.size,
  }
}
