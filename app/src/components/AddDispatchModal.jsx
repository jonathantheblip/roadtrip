import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Image as ImageIcon, Check, Loader } from 'lucide-react'
import { preparePhotoForUpload } from '../lib/photoPipeline'
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
// video" CTA in PhotosView. M2 ships the photo path; M3 adds the
// video tab.
//
// Per the carryover §3, this surface no longer renders per-code error
// copy. Failures collapse to:
//   - Bucket A (silent): jump to 'done', let the sync pill carry it.
//   - Bucket C (3 fixed plain-language messages): a single panel.
//
// Every silent and surfaced failure is captured in the dev-mode upload
// log via logUploadEvent() so Jonathan can trace what happened without
// re-running the bug.

const MAX_OUTPUT_BYTES = 6 * 1024 * 1024 // sanity ceiling AFTER downscale

export function AddDispatchModal({ trip, traveler, onClose, onSaved }) {
  const fileInputRef = useRef(null)
  const [phase, setPhase] = useState('pick') // 'pick' | 'preparing' | 'preview' | 'uploading' | 'bucketC' | 'done'
  const [prep, setPrep] = useState(null) // result of preparePhotoForUpload
  const [previewUrl, setPreviewUrl] = useState(null)
  const [caption, setCaption] = useState('')
  const [stopId, setStopId] = useState(() => defaultStopForToday(trip)?.id || '')
  const [bucketCOutcome, setBucketCOutcome] = useState(null)
  // Track how many times the current file has been through the pipeline.
  // §3: decode/encode failures retry silently once; only on attempt 2
  // do they upgrade to a Bucket C 'photo-unreadable' outcome.
  const decodeAttemptsRef = useRef(0)
  const lastPickedFileRef = useRef(null)

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

  function openPicker() {
    setBucketCOutcome(null)
    decodeAttemptsRef.current = 0
    lastPickedFileRef.current = null
    fileInputRef.current?.click()
  }

  async function runPipeline(file, { attempt }) {
    return preparePhotoForUpload(file, { maxOutputBytes: MAX_OUTPUT_BYTES })
      .then((result) => ({ ok: true, result }))
      .catch((err) => ({
        ok: false,
        err,
        code: err?.code || classifyUploadError(err) || 'decode-failed',
        attempt,
      }))
  }

  async function onFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so the same file can be re-picked
    if (!file) return
    lastPickedFileRef.current = file
    decodeAttemptsRef.current = 1
    setPhase('preparing')
    setBucketCOutcome(null)

    const fileMeta = fileMetaForLog(file)
    let outcome = await runPipeline(file, { attempt: 1 })

    if (!outcome.ok) {
      // Log the first failure silently — §3 traceability.
      logUploadEvent({
        code: outcome.code,
        message: outcome.err?.message,
        stack: outcome.err?.stack,
        fileMeta,
        attempt: 1,
        context: { phase: 'prepare' },
      })

      // Surface Bucket C for size-cap errors immediately (no retry —
      // the file isn't going to be smaller next time).
      if (outcome.code === 'still-too-large') {
        setBucketCOutcome('photo-too-large')
        setPhase('bucketC')
        return
      }

      // Decode / encode failures get one silent retry per §3.
      if (
        outcome.code === 'decode-failed' ||
        outcome.code === 'heic-decode-failed' ||
        outcome.code === 'canvas-encode-failed'
      ) {
        decodeAttemptsRef.current = 2
        outcome = await runPipeline(file, { attempt: 2 })
        if (!outcome.ok) {
          logUploadEvent({
            code: outcome.code,
            outcome: 'photo-unreadable',
            message: outcome.err?.message,
            stack: outcome.err?.stack,
            fileMeta,
            attempt: 2,
            context: { phase: 'prepare-retry' },
          })
          setBucketCOutcome('photo-unreadable')
          setPhase('bucketC')
          return
        }
      } else {
        // Everything else (missing-file, is-video, not-image,
        // unsupported-image, too-large-input) is Bucket A — silent.
        // Jump straight back to the picker so Helen can try a
        // different file without seeing a technical message.
        setPhase('pick')
        return
      }
    }

    setPrep(outcome.result)
    setPhase('preview')
  }

  async function submit() {
    if (!prep || !stopId) return
    setPhase('uploading')
    setBucketCOutcome(null)
    const memoryId = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    const capturedAt = prep.exif?.capturedAt || new Date().toISOString()
    const baseRef = {
      kind: 'photo',
      mime: prep.mime,
      width: prep.width,
      height: prep.height,
      originalWidth: prep.originalWidth,
      originalHeight: prep.originalHeight,
      capturedAt,
      lat: prep.exif?.lat ?? null,
      lng: prep.exif?.lng ?? null,
    }

    // Build the memory shape we'll save locally either way. The R2
    // URL gets stitched in on success; on failure the queued record
    // carries the blob and the memory gets a temporary local ref.
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
      })
      onSaved?.(rec)
    }

    // Tiles need a URL to render. While the upload is pending we hand
    // the album a session-scoped blob URL so the photo appears the
    // moment Helen submits — even before the worker confirms. Once the
    // drain succeeds the memory's photoRef is rewritten to the R2 URL.
    const pendingPreviewUrl = URL.createObjectURL(prep.blob)
    const fileMeta = {
      name: prep.mime || 'photo',
      type: prep.mime,
      size: prep.blob?.size,
      exifDate: prep.exif?.capturedAt || null,
    }

    async function queueSilently(triggeringErr) {
      const code = classifyUploadError(triggeringErr) || 'network'
      try {
        await enqueue({
          id: memoryId,
          tripId: trip.id,
          stopId,
          kind: 'photo',
          blob: prep.blob,
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
          context: { phase: 'upload-queued' },
        })
        setPhase('done')
      } catch (queueErr) {
        // The queue itself failed (most often storage-quota). §3 says
        // never surface this — log + skip + move to done. Helen sees
        // the tile from the in-memory blob URL we already created.
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
      // No worker configured (dev / offline build). Queue silently.
      await queueSilently(new Error('worker not configured'))
      return
    }

    try {
      const r = await workerFetch(
        `/assets/photo/${encodeURIComponent(memoryId)}`,
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
      // Worker call failed — silent queue, no error UI. The sync pill
      // in the album header is the user-visible signal.
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
            Add photo
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
          ref={fileInputRef}
          type="file"
          accept="image/*"
          data-testid="dispatch-file-input"
          onChange={onFileChange}
          style={{ display: 'none' }}
        />

        {phase === 'pick' && <PickPanel onPick={openPicker} />}
        {phase === 'preparing' && (
          <Status icon={<Loader size={18} />} text="Reading your photo…" />
        )}
        {phase === 'preview' && prep && (
          <PreviewPanel
            previewUrl={previewUrl}
            prep={prep}
            caption={caption}
            onCaptionChange={setCaption}
            stopId={stopId}
            stopOptions={stopOptions}
            onStopChange={setStopId}
            onCancel={() => {
              setPrep(null)
              setPreviewUrl(null)
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
              setBucketCOutcome(null)
              setPrep(null)
              setPreviewUrl(null)
              setPhase('pick')
              // Defer the picker open so the panel unmount completes
              // before the file dialog grabs focus.
              setTimeout(() => openPicker(), 0)
            }}
            onClose={onClose}
          />
        )}
        {phase === 'done' && (
          <Status
            icon={<Check size={18} />}
            text="Saved. Your photo is in the album."
            tone="ok"
          />
        )}
      </div>
    </div>
  )
}

function PickPanel({ onPick }) {
  return (
    <div style={{ padding: '8px 0' }}>
      <button
        type="button"
        data-testid="open-picker"
        onClick={onPick}
        style={{
          width: '100%',
          padding: '24px 14px',
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
        }}
      >
        <ImageIcon size={18} style={{ color: 'var(--accent)' }} />
        Pick a photo from this phone
      </button>
    </div>
  )
}

function PreviewPanel({
  previewUrl,
  prep,
  caption,
  onCaptionChange,
  stopId,
  stopOptions,
  onStopChange,
  onCancel,
  onSubmit,
}) {
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
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Preview"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        )}
      </div>
      {/* Internal metadata line. Kept visible for now so dev-mode hands
          have a quick check while M3 lands, but it's deliberately
          terse and uses only what Helen would understand if she saw it
          (no MB/bytes/EXIF labels). */}
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
        {prep.width}×{prep.height} from {prep.originalWidth}×{prep.originalHeight}
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
