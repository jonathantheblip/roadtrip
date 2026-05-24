import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Image as ImageIcon, AlertCircle, Check, Loader } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import { preparePhotoForUpload } from '../lib/photoPipeline'
import { saveMemory } from '../lib/memoryStore'
import { enqueue, registerBackgroundSync } from '../lib/uploadQueue'
import { isWorkerConfigured, workerFetch } from '../lib/workerSync'
import { copyForError, classifyUploadError } from '../lib/dispatchErrors'

// AddDispatchModal — bottom-sheet composer for the "Add photo or
// video" CTA in PhotosView. M2 ships the photo path; M3 adds the
// video tab.
//
// Flow:
//   1. User picks an image via the hidden <input type=file>
//   2. preparePhotoForUpload() validates + reads EXIF + downscales
//   3. Preview renders with caption + stop dropdown (defaults to the
//      stop closest in time to the photo's capturedAt, else today's
//      first stop)
//   4. Submit: try the worker upload; on failure enqueue to
//      IndexedDB + register background sync, then save the memory
//      locally either way so the album updates instantly.
//
// Every failure surfaces a designed message from dispatchErrors.js.
// No raw error.toString() reaches the UI.

const MAX_OUTPUT_BYTES = 6 * 1024 * 1024 // sanity ceiling AFTER downscale

export function AddDispatchModal({ trip, traveler, onClose, onSaved }) {
  const fileInputRef = useRef(null)
  const [phase, setPhase] = useState('pick') // 'pick' | 'preparing' | 'preview' | 'uploading' | 'error' | 'done'
  const [prep, setPrep] = useState(null) // result of preparePhotoForUpload
  const [previewUrl, setPreviewUrl] = useState(null)
  const [caption, setCaption] = useState('')
  const [stopId, setStopId] = useState(() => defaultStopForToday(trip)?.id || '')
  const [errorCode, setErrorCode] = useState(null)
  const [errorDetail, setErrorDetail] = useState(null)

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
    setErrorCode(null)
    setErrorDetail(null)
    fileInputRef.current?.click()
  }

  async function onFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so the same file can be re-picked
    if (!file) return
    setPhase('preparing')
    setErrorCode(null)
    try {
      const result = await preparePhotoForUpload(file, {
        maxOutputBytes: MAX_OUTPUT_BYTES,
      })
      setPrep(result)
      setPhase('preview')
    } catch (err) {
      setErrorCode(err?.code || 'decode-failed')
      setErrorDetail(err?.message || null)
      setPhase('error')
    }
  }

  async function submit() {
    if (!prep || !stopId) return
    setPhase('uploading')
    setErrorCode(null)
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

    if (!isWorkerConfigured()) {
      // No worker configured (dev / offline build). Queue and let the
      // drain pass pick it up if/when worker comes online.
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
        })
        saveLocal({ ...baseRef, storage: 'pending', url: pendingPreviewUrl })
        await registerBackgroundSync().catch(() => {})
        setPhase('done')
      } catch (err) {
        setErrorCode(classifyUploadError(err) || 'storage-quota')
        setErrorDetail(err?.message || null)
        setPhase('error')
      }
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
      // Upload landed clean — release the in-session preview URL so we
      // don't leak the blob; the R2 URL takes over.
      URL.revokeObjectURL(pendingPreviewUrl)
      saveLocal({
        ...baseRef,
        storage: 'r2',
        key: remote.key,
        url: remote.url,
      })
      setPhase('done')
    } catch (err) {
      // Worker call failed — queue and notify. The memory still saves
      // locally (with a pending ref + blob URL preview) so the album
      // reflects the action immediately; the sync pill tracks the
      // backlog and the drain pass will swap the URL when the upload
      // eventually succeeds.
      const code = classifyUploadError(err) || 'network'
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
        })
        saveLocal({ ...baseRef, storage: 'pending', url: pendingPreviewUrl })
        await registerBackgroundSync().catch(() => {})
        if (code === 'network' || code === 'worker-5xx') {
          // Soft failure — informational, not an error state.
          setPhase('done')
          return
        }
        setErrorCode(code)
        setErrorDetail(err?.message || null)
        setPhase('error')
      } catch (queueErr) {
        setErrorCode(classifyUploadError(queueErr) || 'storage-quota')
        setErrorDetail(queueErr?.message || null)
        setPhase('error')
      }
    }
  }

  const errCopy = errorCode ? copyForError(errorCode) : null
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
          <Status icon={<Loader size={18} />} text="Reading EXIF and compressing…" />
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
          <Status icon={<Loader size={18} />} text="Uploading…" />
        )}
        {phase === 'error' && errCopy && (
          <ErrorPanel
            copy={errCopy}
            detail={errorDetail}
            onAction={() => {
              if (errCopy.action.kind === 'retry') {
                if (prep) submit()
                else openPicker()
              } else {
                onClose?.()
              }
            }}
            onDismiss={() => setPhase(prep ? 'preview' : 'pick')}
          />
        )}
        {phase === 'done' && (
          <Status
            icon={<Check size={18} />}
            text="Saved. Your dispatch is in the album."
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
      <p
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontStyle: 'italic',
          fontSize: 13,
          color: 'var(--muted)',
          margin: '12px 0 0',
          lineHeight: 1.4,
        }}
      >
        Videos come in M3. For now this composer handles photos only.
      </p>
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
        {' · '}
        {Math.round(prep.blob.size / 1024)} KB
        {prep.exif?.capturedAt && (
          <>
            {' · '}EXIF: {new Date(prep.exif.capturedAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </>
        )}
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

function ErrorPanel({ copy, detail, onAction, onDismiss }) {
  return (
    <div
      data-testid="dispatch-error"
      style={{
        padding: '16px 14px',
        border: '1px solid color-mix(in srgb, var(--accent) 60%, transparent)',
        borderRadius: 10,
        background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <AlertCircle size={16} style={{ color: 'var(--accent)' }} />
        <strong
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 16,
            color: 'var(--text)',
          }}
        >
          {copy.title}
        </strong>
      </div>
      <p
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 14,
          color: 'var(--text)',
          margin: '0 0 12px',
          lineHeight: 1.45,
        }}
      >
        {copy.body}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {copy.action.kind !== 'cancel' && (
          <button type="button" onClick={onDismiss} className="btn-pill" style={{ cursor: 'pointer' }}>
            Back
          </button>
        )}
        <button
          type="button"
          data-testid="dispatch-error-action"
          onClick={onAction}
          className="btn-pill"
          style={{
            cursor: 'pointer',
            background: 'var(--accent)',
            color: '#fff',
            border: '1px solid var(--accent)',
          }}
        >
          {copy.action.label}
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
