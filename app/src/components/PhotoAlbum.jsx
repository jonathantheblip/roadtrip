import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X, MapPin, Image as ImageIcon, Calendar, Play, Share2 } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import { updateMemoryCapturedAt } from '../lib/memoryStore'
import { isWorkerConfigured } from '../lib/workerSync'
import { ShareMomentSheet } from './ShareMomentSheet'
import { classifySwipe } from '../lib/swipeClassify'
import { isDevModeEnabled } from '../lib/uploadLog'
import { firstLine, formatShortDate, formatFullDate } from '../lib/photoEntries'
import { thumbUrl } from '../lib/thumbUrl'
import { useInView } from '../lib/useInView'

// When the lightbox opens over a partially-loaded grid, the full-res
// lightbox fetch joins the still-in-flight grid thumbnail fetches and
// the tab can't reach `document_idle` for 45+ seconds. See
// KNOWN_BUGS_HELEN_SURFACE.md P1.5.
//
// GridPausedProvider lets the owning view (PhotosView / AllPhotosView)
// flip a flag while the lightbox is open. PhotoTile reads the flag and
// unmounts its <img>, which cancels any in-flight fetch. When the
// lightbox closes the tiles re-mount and the worker's variant cache
// serves thumbnails fast on the second pass.
const GridPausedContext = createContext(false)
export function GridPausedProvider({ paused, children }) {
  return (
    <GridPausedContext.Provider value={!!paused}>
      {children}
    </GridPausedContext.Provider>
  )
}

// Grid tile thumbnail width. The Worker's photon endpoint serves a
// downscaled JPEG variant cached in R2; 600px CSS-pixels covers ~2x
// retina on the album grid (max tile width is ~300px on phone, ~250px
// at the 5-col desktop layout). The lightbox bypasses this and
// requests the bare URL for max fidelity.
const TILE_THUMB_WIDTH = 600

// Shared tile + lightbox + capture-date editor used by PhotosView
// (per-trip album) and AllPhotosView (cross-trip album, Punchlist 4).
//
// PhotoTile is purely presentational — it reads photoIndexInMemory /
// photoCountInMemory / capturedAtSource / locationLabel off the entry
// the caller constructed (via flattenPhotoEntries + groupByStop or
// groupAcrossTrips). The tile suppresses the caption on every
// sibling after the first photo of a multi-photo memory and stamps a
// "N/M" badge so the user can tell tiles belong to the same set.
// On <img> error the tile swaps in an ImageIcon fallback rather than
// leaving a black square next to its siblings.
//
// PhotoLightbox shows the full image with prev/next nav, keyboard +
// swipe handlers, optional trip-name extra line (Punchlist 4 — the
// cross-trip view needs the trip context), and the dev-mode capture-
// date editor that persists into memory.capturedAt via memoryStore.

export function PhotoTile({ entry, onOpen }) {
  const posterColor = TRAVELER_DOT[entry.author] || 'var(--accent)'
  const [imgFailed, setImgFailed] = useState(false)
  const isFirstInMemory = (entry.photoIndexInMemory || 0) === 0
  const memoryCount = entry.photoCountInMemory || 1
  // A video tile renders the poster still (entry.url is the .mp4) + a play
  // badge. A poster-less video falls through to the icon fallback, same as a
  // broken photo — the badge below still marks it as a video.
  const displayUrl = entry.isVideo ? entry.posterUrl : entry.url
  // IntersectionObserver-gated: the <img> isn't rendered until the
  // tile is within ~300px of the viewport. With 55 photos on a
  // typical album this caps concurrent in-flight fetches to ~10–15
  // and lets the page actually reach document_idle. native
  // loading="lazy" alone is too eager — browsers preload anything
  // within ~2 viewports.
  const { ref: tileRef, inView } = useInView({ rootMargin: '300px 0px' })
  // P1.5 — when the lightbox is open, unmount the grid <img> so any
  // in-flight thumbnail fetches cancel and the page reaches idle.
  // inView state is preserved by useInView (once: true), so tiles
  // re-mount instantly when the lightbox closes.
  const gridPaused = useContext(GridPausedContext)
  return (
    <button
      type="button"
      data-testid="photo-tile"
      data-photo-key={entry.key}
      data-photo-in-view={inView ? '1' : '0'}
      onClick={onOpen}
      style={{
        position: 'relative',
        padding: 0,
        border: '1px solid var(--border)',
        background: 'transparent',
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div
        ref={tileRef}
        style={{
          position: 'relative',
          aspectRatio: '1 / 1',
          // Sage-tinted skeleton while the thumbnail loads (or while
          // the tile is still offscreen). Previously this was solid
          // black, which made every still-loading tile look broken —
          // see KNOWN_BUGS_HELEN_SURFACE.md P0.1.
          background:
            'repeating-linear-gradient(45deg, #d6c5a8 0 6px, #c5b497 6px 12px)',
        }}
      >
        {displayUrl && !imgFailed && inView && !gridPaused ? (
          <img
            // Use ?w=600 for the grid — covers retina at the largest
            // tile size we render and keeps payload to ~50KB instead
            // of 1MB. Lightbox below uses the bare URL for full
            // fidelity. For a video this is the poster still.
            src={thumbUrl(displayUrl, TILE_THUMB_WIDTH)}
            alt={entry.caption || 'Trip photo'}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : imgFailed ? (
          <div
            data-testid="tile-image-fallback"
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            <ImageIcon size={20} />
          </div>
        ) : null /* offscreen or no url — the sage-stripe skeleton on the parent shows through */}
        {entry.isVideo && (
          <span
            data-testid="tile-video-badge"
            aria-label="Video"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)',
                color: '#F2EBDA',
                boxShadow: '0 0 0 1.5px rgba(242,235,218,0.5)',
              }}
            >
              <Play size={16} fill="currentColor" />
            </span>
          </span>
        )}
        <span
          aria-label={`Posted by ${TRAVELERS[entry.author]?.name || entry.author}`}
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: posterColor,
            boxShadow: '0 0 0 1.5px rgba(0,0,0,0.45)',
          }}
        />
        {memoryCount > 1 && (
          <span
            data-testid="tile-multi-index"
            aria-label={`Photo ${entry.photoIndexInMemory + 1} of ${memoryCount}`}
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              padding: '2px 6px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.55)',
              color: 'rgba(242,235,218,0.85)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              letterSpacing: '0.10em',
            }}
          >
            {entry.photoIndexInMemory + 1}/{memoryCount}
          </span>
        )}
      </div>
      <div
        style={{
          padding: '8px 8px 10px',
          background: 'var(--card, transparent)',
          borderTop: '1px solid var(--border)',
        }}
      >
        {entry.caption && isFirstInMemory && (
          <div
            style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 12.5,
              lineHeight: 1.3,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {firstLine(entry.caption)}
          </div>
        )}
        <div
          style={{
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            letterSpacing: '0.10em',
            color: 'var(--muted)',
            opacity: 0.85,
          }}
          data-testid="tile-date-source"
          data-source={entry.capturedAtSource}
        >
          <span
            title={
              entry.capturedAtSource === 'createdAt'
                ? 'No capture date for this photo — showing upload date'
                : entry.capturedAtSource === 'memory'
                  ? 'Capture date set for this memory'
                  : 'Capture date from EXIF'
            }
          >
            {formatShortDate(entry.capturedAt)}
            {entry.capturedAtSource === 'createdAt' && (
              <span style={{ marginLeft: 2, opacity: 0.7 }}>· uploaded</span>
            )}
          </span>
          {entry.locationLabel && (
            <>
              <span aria-hidden="true">·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, minWidth: 0, overflow: 'hidden' }}>
                <MapPin size={9} />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {entry.locationLabel}
                </span>
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// Lightbox supports both per-trip (PhotosView) and cross-trip
// (AllPhotosView) callers. When entry.tripTitle is set — populated by
// groupAcrossTrips — the footer renders an extra "TRIP NAME" line so
// the user knows which trip the open photo belongs to.
export function PhotoLightbox({
  entry,
  index,
  total,
  onPrev,
  onNext,
  onClose,
  onCapturedAtChanged,
  showTripName = false,
}) {
  const devMode = isDevModeEnabled()
  const [editingDate, setEditingDate] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  // A real, synced memory can be shared out; a local-only photo (no memoryId)
  // or an unconfigured worker can't.
  const canShare = !!entry?.memoryId && isWorkerConfigured()
  // Reset the editor + close the share sheet whenever we navigate to a
  // different entry — otherwise prev/next would carry stale state forward.
  useEffect(() => {
    setEditingDate(false)
    setShareOpen(false)
  }, [entry?.memoryId, entry?.key])
  // Keyboard for desktop; touch swipe for phone. Both call into the
  // same nav callbacks the arrow buttons use, so behavior stays
  // consistent across input modes.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && onPrev) onPrev()
      else if (e.key === 'ArrowRight' && onNext) onNext()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  const touchRef = useRef(null)
  function onTouchStart(e) {
    const t = e.touches?.[0]
    if (!t) return
    touchRef.current = { x: t.clientX, y: t.clientY, time: Date.now() }
  }
  function onTouchEnd(e) {
    const start = touchRef.current
    touchRef.current = null
    if (!start) return
    const t = e.changedTouches?.[0]
    if (!t) return
    const action = classifySwipe({
      dx: t.clientX - start.x,
      dy: t.clientY - start.y,
      duration: Date.now() - start.time,
    })
    if (action === 'prev' && onPrev) onPrev()
    else if (action === 'next' && onNext) onNext()
    else if (action === 'close') onClose()
  }

  return (
    <div
      role="dialog"
      data-testid="photo-lightbox"
      aria-label={entry.caption || 'Photo viewer'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        flexDirection: 'column',
        color: '#F2EBDA',
        touchAction: 'pan-y',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 16px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          opacity: 0.85,
        }}
      >
        <div>
          {index + 1} / {total}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {canShare && (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              aria-label="Share this moment"
              data-testid="lightbox-share"
              style={{
                background: 'transparent',
                border: 0,
                color: 'inherit',
                cursor: 'pointer',
                padding: 4,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'inherit',
                fontSize: 'inherit',
                letterSpacing: 'inherit',
                textTransform: 'inherit',
              }}
            >
              <Share2 size={16} /> Share
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 0,
              color: 'inherit',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          position: 'relative',
        }}
      >
        {onPrev && <NavArrow direction="left" onClick={onPrev} />}
        {entry.isVideo && entry.url ? (
          <video
            data-testid="lightbox-video"
            src={entry.url}
            poster={entry.posterUrl || undefined}
            controls
            playsInline
            preload="metadata"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        ) : entry.url ? (
          <img
            src={entry.url}
            alt={entry.caption || 'Trip photo'}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div style={{ color: '#a78', fontStyle: 'italic' }}>Image unavailable</div>
        )}
        {onNext && <NavArrow direction="right" onClick={onNext} />}
      </div>
      <footer style={{ padding: '14px 18px 24px' }}>
        {/* Trip name lives above the caption so the user always knows
            which trip's archive they're scrolling through — Punchlist
            4 acceptance: lightbox carries trip context. Hidden in the
            per-trip view (the page header already names the trip). */}
        {showTripName && entry.tripTitle && (
          <div
            data-testid="lightbox-trip-name"
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'rgba(242,235,218,0.6)',
              marginBottom: 8,
            }}
          >
            {entry.tripTitle}
          </div>
        )}
        {entry.caption && (
          <p
            style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 15.5,
              lineHeight: 1.4,
              margin: 0,
              color: '#F2EBDA',
              whiteSpace: 'pre-wrap',
            }}
          >
            {entry.caption}
          </p>
        )}
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9.5,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            opacity: 0.75,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: TRAVELER_DOT[entry.author] || '#fff',
                display: 'inline-block',
              }}
            />
            {TRAVELERS[entry.author]?.name || entry.author}
          </span>
          <span aria-hidden="true">·</span>
          <span
            data-testid="lightbox-date-source"
            data-source={entry.capturedAtSource}
            title={
              entry.capturedAtSource === 'createdAt'
                ? 'Upload time — no capture date on this memory.'
                : entry.capturedAtSource === 'memory'
                  ? 'Capture date set for this memory.'
                  : 'Capture date from EXIF.'
            }
          >
            {formatFullDate(entry.capturedAt)}
            {entry.capturedAtSource === 'createdAt' && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>(uploaded)</span>
            )}
          </span>
          {entry.stopName && (
            <>
              <span aria-hidden="true">·</span>
              <span>{entry.stopName}</span>
            </>
          )}
          {entry.locationLabel && (
            <>
              <span aria-hidden="true">·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={10} /> {entry.locationLabel}
              </span>
            </>
          )}
          {devMode && !editingDate && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                data-testid="lightbox-edit-date"
                onClick={() => setEditingDate(true)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(242,235,218,0.35)',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  padding: '3px 8px',
                  borderRadius: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Calendar size={10} /> Edit date
              </button>
            </>
          )}
        </div>
        {devMode && editingDate && (
          <CapturedAtEditor
            entry={entry}
            onCancel={() => setEditingDate(false)}
            onSaved={() => {
              setEditingDate(false)
              onCapturedAtChanged?.()
            }}
          />
        )}
      </footer>
      {shareOpen && entry?.memoryId && (
        <ShareMomentSheet memoryId={entry.memoryId} onClose={() => setShareOpen(false)} />
      )}
    </div>
  )
}

function CapturedAtEditor({ entry, onCancel, onSaved }) {
  const seedIso = entry.capturedAt || entry.memoryCreatedAt || new Date().toISOString()
  const [draft, setDraft] = useState(() => isoToLocalInput(seedIso))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  function save() {
    setBusy(true)
    setErr(null)
    try {
      const iso = localInputToIso(draft)
      if (!iso) {
        setErr('Pick a valid date and time.')
        setBusy(false)
        return
      }
      updateMemoryCapturedAt(entry.memoryId, iso)
      onSaved?.()
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  function clearOverride() {
    setBusy(true)
    setErr(null)
    try {
      updateMemoryCapturedAt(entry.memoryId, null)
      onSaved?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="lightbox-date-editor"
      style={{
        marginTop: 12,
        padding: '10px 12px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.18)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        color: '#F2EBDA',
      }}
    >
      <label
        htmlFor="lightbox-date-input"
        style={{
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          opacity: 0.7,
        }}
      >
        Capture date
      </label>
      <input
        id="lightbox-date-input"
        data-testid="lightbox-date-input"
        type="datetime-local"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{
          background: 'rgba(0,0,0,0.4)',
          color: '#F2EBDA',
          border: '1px solid rgba(255,255,255,0.25)',
          padding: '4px 6px',
          borderRadius: 6,
          fontFamily: 'inherit',
          fontSize: 12,
        }}
      />
      <button type="button" data-testid="lightbox-date-save" onClick={save} disabled={busy} style={pillButtonStyle()}>
        Save
      </button>
      <button type="button" data-testid="lightbox-date-clear" onClick={clearOverride} disabled={busy} style={pillButtonStyle()}>
        Clear
      </button>
      <button type="button" onClick={onCancel} disabled={busy} style={pillButtonStyle()}>
        Cancel
      </button>
      {err && (
        <span
          style={{
            flexBasis: '100%',
            fontSize: 10,
            color: '#F2A87A',
            marginTop: 4,
            textTransform: 'none',
            letterSpacing: 0,
          }}
        >
          {err}
        </span>
      )}
    </div>
  )
}

function pillButtonStyle() {
  return {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.35)',
    color: '#F2EBDA',
    padding: '3px 10px',
    borderRadius: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 10,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  }
}

function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

function localInputToIso(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function NavArrow({ direction, onClick }) {
  const isLeft = direction === 'left'
  const Icon = isLeft ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isLeft ? 'Previous photo' : 'Next photo'}
      style={{
        position: 'absolute',
        [isLeft ? 'left' : 'right']: 8,
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'rgba(0,0,0,0.55)',
        border: '1px solid rgba(255,255,255,0.25)',
        color: '#F2EBDA',
        borderRadius: '50%',
        width: 40,
        height: 40,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={22} />
    </button>
  )
}
