import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X, MapPin, Image as ImageIcon, Calendar, Play, Share2, Trash2, Pencil, Plus, Loader2, CloudOff, VolumeX } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import { videoCopy, fmtSize, fmtDur } from '../lib/videoCopy'
import { updateMemoryCapturedAt, updateMemoryCaption, removePhotoFromMemory } from '../lib/memoryStore'
import { isWorkerConfigured } from '../lib/workerSync'
import { isVideoEncodeSupported } from '../lib/videoPipeline'
import { canOfferReAddSound, reAddSound, isReAddInFlight, beginReAddFlight, endReAddFlight, subscribeReAddSettles } from '../lib/reAddSound'
import { ShareMomentSheet } from './ShareMomentSheet'
import { classifySwipe } from '../lib/swipeClassify'
import { isDevModeEnabled } from '../lib/uploadLog'
import { firstLine, formatShortDate, formatFullDate, photoEntryKey } from '../lib/photoEntries'
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

export function PhotoTile({ entry, onOpen, faces, traveler, uploadState, onRetryStuck }) {
  const posterColor = TRAVELER_DOT[entry.author] || 'var(--accent)'
  const [imgFailed, setImgFailed] = useState(false)
  // Foolproof-video honesty (#2/#4): a saved clip shows its shrunk size (bottom-
  // left) + length (top-right); a not-yet-uploaded clip shows an honest in-flight
  // state driven by the real outbox — never reads as "done". `uploadState` is the
  // live queue signal ('uploading' | 'stuck') the owning view passes per memory;
  // `entry.pending` is the ref's own "not on R2 yet" flag (a fallback when the
  // queue map hasn't loaded). Rafa NEVER meets an amber "stuck" — any non-saved
  // state folds to a gentle "saving…" (the honest state surfaces to a parent lens).
  const vcopy = videoCopy(traveler)
  const isRafa = traveler === 'rafa'
  let vstate = 'saved'
  if (entry.isVideo) {
    if (uploadState === 'stuck') vstate = 'stuck'
    else if (uploadState === 'uploading' || entry.pending) vstate = 'uploading'
  }
  const rafaSaving = isRafa && entry.isVideo && vstate !== 'saved'
  const showStuck = vstate === 'stuck' && !isRafa
  const isFirstInMemory = (entry.photoIndexInMemory || 0) === 0
  const memoryCount = entry.photoCountInMemory || 1
  // A video tile renders the poster still (entry.url is the .mp4) + a play
  // badge. A poster-less video falls through to the icon fallback, same as a
  // broken photo — the badge below still marks it as a video.
  const displayUrl = entry.isVideo ? entry.posterUrl : entry.url
  // Retry when the source changes. Offline idb hydration swaps a pending tile's
  // dead session blob: for a live one; for a VIDEO that lands on posterUrl while
  // entry.key (which tracks entry.url, the .mp4) stays put — so the tile is NOT
  // remounted and a sticky imgFailed from the first failed paint would keep the
  // poster on the broken-image icon forever. Clearing it on displayUrl change
  // lets the live poster (and any re-pointed photo) actually repaint.
  useEffect(() => {
    setImgFailed(false)
  }, [displayUrl])
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
        ) : imgFailed || (entry.isVideo && !displayUrl && inView && !gridPaused) ? (
          // A poster-less video (its poster never uploaded) has no displayUrl, so
          // it used to fall through to `null` and render as a blank skeleton —
          // effectively invisible in the album grid (e.g. on All-Photos), even
          // though it's a real memory. Show the icon fallback (the play badge
          // below still marks it as a video) so it's findable, same as a broken
          // photo. (A poster-less video also reaches here from imgFailed never
          // firing — there's no <img> to error.)
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
        {entry.isVideo && !showStuck && !rafaSaving && (
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
        {/* ── Foolproof-video tile states (#2/#4) ── */}
        {/* soft veil while a clip is in-flight or stuck — the poster stays visible
            but reads clearly as "not finished" (never a bare saved tile). */}
        {entry.isVideo && vstate !== 'saved' && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: showStuck
                ? 'color-mix(in srgb, var(--kept) 22%, rgba(8,10,9,0.42))'
                : 'rgba(8,10,9,0.32)',
            }}
          />
        )}
        {/* length — top-right, every video state */}
        {entry.isVideo && entry.durationMs > 0 && (
          <span data-testid="tile-video-duration" style={{ position: 'absolute', top: 6, right: 6, pointerEvents: 'none' }}>
            <TileChip>{fmtDur(entry.durationMs)}</TileChip>
          </span>
        )}
        {/* saved → the size chip (the locked proof), bottom-left */}
        {entry.isVideo && vstate === 'saved' && entry.videoBytes != null && (
          <span data-testid="tile-video-size" style={{ position: 'absolute', left: 6, bottom: 6, pointerEvents: 'none' }}>
            <TileChip>{fmtSize(entry.videoBytes)}</TileChip>
          </span>
        )}
        {/* sound couldn't come along — ONLY when the source provably had sound
            the saved copy doesn't (ref.sound === 'lost'). An honestly-silent
            source ('none') and legacy/unknown refs get no tag. Rafa's lens
            never meets it (soundChip is null on his deck). */}
        {entry.isVideo && vstate === 'saved' && entry.sound === 'lost' && vcopy.soundChip && (
          <span data-testid="tile-video-no-sound" style={{ position: 'absolute', right: 6, bottom: 6, pointerEvents: 'none' }}>
            <TileChip>{vcopy.soundChip}</TileChip>
          </span>
        )}
        {/* on its way — neutral, honest (Rafa gets the centered "saving…" instead) */}
        {entry.isVideo && vstate === 'uploading' && !rafaSaving && (
          <span
            data-testid="tile-video-uploading"
            style={{
              position: 'absolute',
              left: 6,
              bottom: 6,
              pointerEvents: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(8,10,9,0.62)',
              color: '#F2EBDA',
              borderRadius: 8,
              padding: '3px 7px',
            }}
          >
            <Loader2 size={11} className="spin" />
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 9.5, letterSpacing: '0.03em', fontWeight: 600 }}>
              {vcopy.tileWay}
            </span>
          </span>
        )}
        {/* stuck (rare, non-Rafa) — amber, honest, tap to send it now. A plain
            onClick overlay (not a nested <button>/role) so it never trips the
            axe nested-interactive gate; the sync pill is the keyboard retry path. */}
        {showStuck && (
          <div
            data-testid="tile-video-stuck"
            onClick={(e) => {
              e.stopPropagation()
              onRetryStuck?.()
            }}
            style={{
              position: 'absolute',
              inset: 0,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: 6,
              textAlign: 'center',
            }}
          >
            <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--kept)', color: '#20160a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CloudOff size={18} />
            </span>
            <span style={{ fontFamily: 'Inter Tight, system-ui, sans-serif', fontSize: 11, fontWeight: 700, color: '#F2EBDA' }}>{vcopy.tileStuck}</span>
            {vcopy.tileStuckCta && (
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 8, letterSpacing: '0.04em', color: 'rgba(242,235,218,0.85)' }}>{vcopy.tileStuckCta}</span>
            )}
          </div>
        )}
        {/* amber corner mark so a stuck clip is flagged before you read it */}
        {showStuck && (
          <span aria-hidden="true" style={{ position: 'absolute', top: 7, left: 7, width: 9, height: 9, borderRadius: 9, background: 'var(--kept)', boxShadow: '0 0 0 2px rgba(8,10,9,0.4)' }} />
        )}
        {/* Rafa — any non-saved state is a gentle centered "saving…", never amber */}
        {rafaSaving && (
          <div
            data-testid="tile-video-rafa-saving"
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#fff' }}
          >
            <Loader2 size={20} className="spin" />
            <span style={{ fontFamily: "'Fredoka', 'Inter Tight', system-ui, sans-serif", fontWeight: 600, fontSize: 12 }}>{vcopy.tileWay}</span>
          </div>
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
        {Array.isArray(faces) && faces.length > 0 && (
          <span
            data-testid="tile-face-tags"
            role="img"
            aria-label={`In this photo: ${faces.map((id) => TRAVELERS[id]?.name || id).join(', ')}`}
            style={{
              position: 'absolute',
              left: 6,
              bottom: 6,
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 5px',
              borderRadius: 999,
              // A dark scrim so the identity dots read on any photo; the names
              // ride the aria-label (the dots are decorative color).
              background: 'rgba(0,0,0,0.45)',
            }}
          >
            {faces.map((id, i) => (
              <span
                key={id}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: TRAVELER_DOT[id] || '#fff',
                  border: '1.5px solid rgba(255,255,255,0.92)',
                  marginLeft: i === 0 ? 0 : -4,
                  display: 'inline-block',
                }}
              />
            ))}
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
            // --muted only (no opacity multiplier) — the 9px tile date/location
            // label must clear AA contrast; opacity 0.85 on --muted didn't.
            color: 'var(--muted)',
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
              <span style={{ marginLeft: 2 }}>· uploaded</span>
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

// A small chip over the tile poster — the neutral mono size proof (bottom-left)
// and the clip length (top-right). White-on-dark scrim so it reads on any first
// frame; the size is a REAL stored size (#2), never an estimate.
function TileChip({ children }) {
  return (
    <span
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.02em',
        lineHeight: 1.2,
        color: '#F2EBDA',
        background: 'rgba(8,10,9,0.62)',
        borderRadius: 6,
        padding: '2px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
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
  onCaptionChanged,
  onDelete,
  onMediaReplaced,
  traveler,
  showTripName = false,
}) {
  const devMode = isDevModeEnabled()
  const [editingDate, setEditingDate] = useState(false)
  const [editingCaption, setEditingCaption] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // A real, synced memory can be shared out; a local-only photo (no memoryId)
  // or an unconfigured worker can't.
  const canShare = !!entry?.memoryId && isWorkerConfigured()
  // Only the photo's AUTHOR can delete it (the worker enforces this too). A
  // local-only photo (no memoryId) has no stored record to remove from.
  const canDelete = !!entry?.memoryId && !!traveler && entry?.author === traveler
  // The author can correct a photo's DATE — the album locks to when a photo was
  // taken (EXIF / video container date), but an EXIF-less image (a scan, a
  // screenshot, some HEIC edge) falls back to the upload time, labelled
  // "· uploaded". Letting the author fix it keeps the timeline true. Dev mode
  // keeps the affordance on any photo for diagnostics.
  const canEditDate = devMode || canDelete
  // Only the AUTHOR adds/edits/clears the caption on their own photo (content, not
  // metadata — so no dev-mode override, unlike the date). A caption is per-memory:
  // on a multi-photo album memory it's shared by every frame, as it already displays.
  const canEditCaption = canDelete
  function handleDelete() {
    const res = removePhotoFromMemory({
      memoryId: entry.memoryId,
      author: entry.author,
      photoUrl: entry.url,
      refKey: entry.refKey,
    })
    setConfirmDelete(false)
    onDelete?.(res, entry)
  }
  // Reset the editor / delete-confirm / share sheet whenever we navigate to a
  // different entry — otherwise prev/next would carry stale state forward.
  useEffect(() => {
    setEditingDate(false)
    setEditingCaption(false)
    setShareOpen(false)
    setConfirmDelete(false)
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
          // The lightbox is position:fixed over the whole screen, so this one
          // row (counter + delete + share + close) must clear the iPhone
          // notch/Dynamic Island itself.
          padding: 'calc(14px + env(safe-area-inset-top)) 16px 14px',
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
          {canDelete &&
            (confirmDelete ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={handleDelete}
                  aria-label="Confirm delete photo"
                  data-testid="lightbox-delete-confirm"
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: '#ff8a73',
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
                  <Trash2 size={16} /> Delete?
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  aria-label="Cancel delete"
                  style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: 4, opacity: 0.7 }}
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete photo"
                data-testid="lightbox-delete"
                style={{
                  background: 'transparent',
                  border: 0,
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <Trash2 size={16} />
              </button>
            ))}
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
      {/* Bottom padding clears the home-indicator bar (same fixed-overlay
          safe-area rule as the header row above). */}
      <footer style={{ padding: '14px 18px calc(24px + env(safe-area-inset-bottom))' }}>
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
        {editingCaption && canEditCaption ? (
          <CaptionEditor
            entry={entry}
            onCancel={() => setEditingCaption(false)}
            onSaved={() => {
              setEditingCaption(false)
              onCaptionChanged?.()
            }}
          />
        ) : entry.caption ? (
          canEditCaption ? (
            <button
              type="button"
              data-testid="lightbox-caption"
              aria-label="Edit caption"
              onClick={() => setEditingCaption(true)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 15.5,
                lineHeight: 1.4,
                color: '#F2EBDA',
                whiteSpace: 'pre-wrap',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>{entry.caption}</span>
              <Pencil size={13} style={{ flexShrink: 0, opacity: 0.55, marginTop: 3 }} aria-hidden="true" />
            </button>
          ) : (
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
          )
        ) : canEditCaption ? (
          <button
            type="button"
            data-testid="lightbox-add-caption"
            onClick={() => setEditingCaption(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              border: 0,
              padding: 0,
              cursor: 'pointer',
              fontFamily: 'Fraunces, Georgia, serif',
              fontStyle: 'italic',
              fontSize: 15,
              lineHeight: 1.4,
              color: 'rgba(242,235,218,0.6)',
            }}
          >
            <Plus size={14} aria-hidden="true" /> Add a caption
          </button>
        ) : null}
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
          {canEditDate && !editingDate && (
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
        {canEditDate && editingDate && (
          <CapturedAtEditor
            entry={entry}
            onCancel={() => setEditingDate(false)}
            onSaved={() => {
              setEditingDate(false)
              onCapturedAtChanged?.()
            }}
          />
        )}
        {/* "Add it again with sound" — the quiet, author-only door on a video
            whose saved copy provably lost its sound (ref.sound === 'lost';
            never on honest silence or a photo, never cross-author, never on
            Rafa's lens). Gated further by the environment: the sound-bearing
            copy must be encodable here and able to reach the family server.
            key={entry.key} remounts the row on prev/next so no in-flight or
            failure state carries onto a different clip. */}
        {canOfferReAddSound(entry, traveler) && isWorkerConfigured() && isVideoEncodeSupported() && (
          <ReAddSoundRow key={entry.key} entry={entry} traveler={traveler} onReplaced={onMediaReplaced} />
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

// Inline caption editor in the lightbox — the album's "add a few words" edit. A
// textarea in the caption's own serif, Save/Cancel in the meta pill style. Persists
// through updateMemoryCaption (single-field, self-healing sync); Save with an empty
// box clears the caption. Author-gated by the caller (canEditCaption).
function CaptionEditor({ entry, onCancel, onSaved }) {
  const [draft, setDraft] = useState(entry.caption || '')
  const [busy, setBusy] = useState(false)
  function save() {
    setBusy(true)
    try {
      updateMemoryCaption(entry.memoryId, draft)
      onSaved?.()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div data-testid="lightbox-caption-editor">
      <textarea
        autoFocus
        data-testid="lightbox-caption-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={280}
        rows={2}
        placeholder="Say something about this…"
        aria-label="Caption"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 15.5,
          lineHeight: 1.4,
          color: '#F2EBDA',
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 8,
          padding: '8px 10px',
          outline: 'none',
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" data-testid="lightbox-caption-save" onClick={save} disabled={busy} style={pillButtonStyle()}>
          Save
        </button>
        <button type="button" onClick={onCancel} disabled={busy} style={pillButtonStyle()}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// "Add it again — the sound will come along this time" (lightbox footer, on a
// sound:'lost' video, author-only — the caller gates; videoCopy's null chip is
// Rafa's second latch). The chip is a real <label> wrapping a real, PRESENT
// <input type=file> hidden sr-only style — the ONE file trigger iOS never
// blocks is a direct tap on a real file input (or its label). NEVER a scripted
// input.click(): that pattern dies silently on the device (the trip-hero cover
// picker saga — see TripIndex's "Change cover photo" control, device-verified,
// which this mirrors). The flow itself lives in lib/reAddSound: encode through
// the normal import pipeline, upload, then swap the ref ATOMICALLY — the old
// copy stays live until the new one is confirmed, and a re-pick that loses its
// sound again changes nothing (honest per-lens line, door stays open, no nag).
function ReAddSoundRow({ entry, traveler, onReplaced }) {
  const vcopy = videoCopy(traveler)
  // idle | busy | still-lost | too-long | failed. Success has no phase: the
  // parent re-resolves onto the replaced entry and this row unmounts (the
  // fresh ref's sound is no longer 'lost').
  //
  // A row MOUNTED while a flight for this clip is still settling (the user
  // swiped away and back mid-flow — key={entry.key} remounts us) adopts the
  // honest busy state instead of re-offering the chip: the C1a guard below
  // would refuse a second flow anyway, and an idle chip over a live flight
  // would be a lie.
  const [phase, setPhase] = useState(() => (isReAddInFlight(entry.refKey) ? 'busy' : 'idle'))
  const [tooLongMs, setTooLongMs] = useState(0)
  // When the flight settles, an ADOPTED busy row falls back to idle — the
  // initiating (unmounted) row's closure can't reach this one, so listen. Our
  // OWN flow is unaffected: its terminal setPhase runs after endReAddFlight
  // fired this listener (same synchronous sequence), so the honest per-clip
  // note wins over the listener's idle write.
  useEffect(() => {
    return subscribeReAddSettles((settledKey) => {
      if (settledKey !== entry.refKey) return
      setPhase((p) => (p === 'busy' ? 'idle' : p))
    })
  }, [entry.refKey])
  if (!vcopy.reAddChip) return null // a lens with no words for it has no door
  async function onPick(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = '' // picking the same file again must still fire (house rule)
    if (!file || phase === 'busy') return
    // C1a — ONE flight per clip, across remounts: without this, a swipe-away-
    // and-back mid-flow re-offers the chip, and a second pick double-uploads
    // (a second orphan) whose losing swap reads 'swap-target-missing' — a
    // lying 'failed' on a clip that was in fact just fixed.
    if (!beginReAddFlight(entry.refKey)) {
      if (isReAddInFlight(entry.refKey)) setPhase('busy') // adopt the live flight — never a dead tap
      return
    }
    setPhase('busy')
    let res
    try {
      res = await reAddSound({ file, entry })
    } catch {
      // P1 — the flow is designed to return statuses, but the swap's local
      // write (writeJson) genuinely throws on storage quota: land on the
      // honest per-lens 'failed' line, never a stranded spinner.
      res = { status: 'failed', code: 'unexpected-throw' }
    } finally {
      endReAddFlight(entry.refKey)
    }
    if (res.status === 'replaced') {
      onReplaced?.({ memoryId: entry.memoryId, newKey: photoEntryKey(entry.memoryId, res.url) })
      return
    }
    if (res.status === 'still-lost') setPhase('still-lost')
    else if (res.status === 'too-long') {
      setTooLongMs(res.durationMs)
      setPhase('too-long')
    } else setPhase('failed')
  }
  // Quiet, warm — amber never red; the note reads in the caption's own serif.
  const note = {
    margin: 0,
    fontFamily: 'Fraunces, Georgia, serif',
    fontStyle: 'italic',
    fontSize: 13.5,
    lineHeight: 1.4,
    color: '#F2A87A',
  }
  const chip = {
    position: 'relative', // anchors the sr-only input
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '7px 12px',
    borderRadius: 14,
    border: '1px solid rgba(242,235,218,0.35)',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(242,235,218,0.9)',
    fontFamily: 'Fraunces, Georgia, serif',
    fontStyle: 'italic',
    fontSize: 13.5,
    lineHeight: 1.3,
    cursor: 'pointer',
  }
  return (
    <div
      data-testid="lightbox-readd-sound"
      style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}
    >
      {phase === 'still-lost' && (
        <p data-testid="lightbox-readd-stilllost" style={note}>
          {vcopy.reAddStillLost}
        </p>
      )}
      {phase === 'too-long' && (
        <p data-testid="lightbox-readd-toolong" style={note}>
          {vcopy.tooLong ? vcopy.tooLong(fmtDur(tooLongMs)) : vcopy.reAddFailed}
        </p>
      )}
      {phase === 'failed' && (
        <p data-testid="lightbox-readd-failed" style={note}>
          {vcopy.reAddFailed}
        </p>
      )}
      {phase === 'busy' ? (
        <span data-testid="lightbox-readd-busy" style={{ ...chip, cursor: 'default' }}>
          <Loader2 size={13} className="spin" aria-hidden="true" />
          {vcopy.reAddBusy}
        </span>
      ) : (
        <label style={chip}>
          <VolumeX size={13} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.7 }} />
          {vcopy.reAddChip}
          <input
            data-testid="lightbox-readd-input"
            type="file"
            accept="video/*"
            onChange={onPick}
            // sr-only, NOT display:none — the input must be real + present for
            // the direct-tap rule (and stay reachable by assistive tech).
            style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', border: 0, clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
          />
        </label>
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
        // Landscape phones inset the sides (notch/home bar) — keep the arrow
        // tappable there, 8px otherwise.
        [isLeft ? 'left' : 'right']: isLeft
          ? 'max(8px, env(safe-area-inset-left))'
          : 'max(8px, env(safe-area-inset-right))',
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
