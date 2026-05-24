import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X, Plus, MapPin, Image as ImageIcon, RefreshCw, Calendar } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import { listMemoriesForTrip, updateMemoryCapturedAt } from '../lib/memoryStore'
import { AddDispatchModal } from '../components/AddDispatchModal'
import { count as queueCount, subscribe as subscribeQueue, drain as drainQueue } from '../lib/uploadQueue'
import { isWorkerConfigured, workerFetch } from '../lib/workerSync'
import { saveMemory } from '../lib/memoryStore'
import { classifySwipe } from '../lib/swipeClassify'
import { isDevModeEnabled } from '../lib/uploadLog'

// Photos-by-event view. Punchlist 3 Item 4 — Helen's primary surface
// for the trip's photo archive, grouped by Stop/event.
//
// Each tile shows the poster's color token (Jonathan blue, Helen green,
// Aurelia pink, Rafa red), the caption truncated to the first line,
// the capture date, the location (EXIF or stop association), and the
// event/stop name. Tap → lightbox with full caption + metadata +
// prev/next nav within the same stop group.
//
// "Add photo or video" lives prominently at the top — this is where
// the FILE A DISPATCH entry point moved to (was at the bottom of
// Jonathan's view, wrong place).
//
// Aesthetic: Helen's surface palette (linen / forest accent) is the
// reference design; the other three themed views inherit via CSS vars
// when they navigate in.

export function PhotosView({ trip, traveler, onBack, openDispatchOnMount }) {
  // Re-read memories when this view-render flips (e.g. after a save).
  const [memoryTick, setMemoryTick] = useState(0)
  const memories = useMemo(
    () => listMemoriesForTrip(trip.id, traveler),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trip.id, traveler, memoryTick]
  )
  const photoEntries = useMemo(() => flattenPhotoEntries(memories), [memories])
  const groups = useMemo(
    () => groupByStop(photoEntries, trip),
    [photoEntries, trip]
  )

  // Lightbox state: which photo is open. The viewer accepts a "list"
  // (the same-stop sibling array) so prev/next stays within the group
  // the user opened from — switching stops mid-swipe would be jarring.
  const [lightbox, setLightbox] = useState(null) // { entry, list, index }

  // When something the lightbox depends on changes (dev-mode date
  // override save, queue drain swapping a pending photoRef for an R2
  // one), the parent's `groups` recompute but the lightbox is still
  // holding the pre-edit entry. Re-resolve from the fresh group when
  // we can find the same key — otherwise leave it alone (the photo
  // was deleted out from under us, which the current UI doesn't do).
  useEffect(() => {
    setLightbox((lb) => {
      if (!lb) return lb
      const sameGroup = groups.find((g) =>
        g.entries.some((e) => e.key === lb.entry.key)
      )
      if (!sameGroup) return lb
      const idx = sameGroup.entries.findIndex((e) => e.key === lb.entry.key)
      if (idx < 0) return lb
      return { ...lb, list: sameGroup.entries, index: idx, entry: sameGroup.entries[idx] }
    })
  }, [groups])

  // Dispatch composer state. Auto-opens when the parent set
  // openDispatchOnMount (e.g. user tapped "Add photo" elsewhere).
  const [dispatchOpen, setDispatchOpen] = useState(!!openDispatchOnMount)

  // Sync pill: live count from the IndexedDB queue. Subscribes so a
  // save anywhere in the app updates this view without polling.
  const [queueSize, setQueueSize] = useState(0)
  const [draining, setDraining] = useState(false)
  useEffect(() => {
    let cancelled = false
    function refresh() {
      queueCount()
        .then((n) => {
          if (!cancelled) setQueueSize(n)
        })
        .catch(() => {})
    }
    refresh()
    const unsub = subscribeQueue(refresh)
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  function openLightbox(entry, list) {
    const index = list.findIndex((e) => e === entry)
    setLightbox({ entry, list, index: index >= 0 ? index : 0 })
  }
  function closeLightbox() {
    setLightbox(null)
  }
  function step(delta) {
    setLightbox((lb) => {
      if (!lb) return null
      const next = lb.index + delta
      if (next < 0 || next >= lb.list.length) return lb
      return { ...lb, index: next, entry: lb.list[next] }
    })
  }

  // Manual sync trigger. Drains the queue using the same worker upload
  // path the modal uses on first try. On success the memory's photoRef
  // is patched in localStorage so the album rehydrates with a usable
  // R2 URL (no more 'pending' placeholder).
  async function triggerDrain() {
    if (draining) return
    setDraining(true)
    try {
      await drainQueue(async (item) => {
        if (!isWorkerConfigured()) throw new Error('worker not configured')
        const r = await workerFetch(
          `/assets/${item.kind === 'video' ? 'video' : 'photo'}/${encodeURIComponent(item.id)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': item.blob?.type || 'application/octet-stream' },
            body: item.blob,
          }
        )
        const remote = await r.json()
        saveMemory({
          id: item.id,
          tripId: item.tripId,
          stopId: item.stopId,
          authorTraveler: item.authorTraveler,
          visibility: 'shared',
          kind: item.kind === 'video' ? 'photo' : 'photo',
          caption: item.caption,
          photoRef: { ...item.ref, storage: 'r2', key: remote.key, url: remote.url },
        })
      })
    } finally {
      setDraining(false)
      setMemoryTick((t) => t + 1)
    }
  }

  function onDispatchSaved() {
    setMemoryTick((t) => t + 1)
  }

  return (
    <div
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        minHeight: '100vh',
        paddingBottom: 120,
      }}
    >
      <header style={{ padding: '60px 18px 6px' }}>
        <button
          onClick={onBack}
          type="button"
          style={{
            background: 'transparent',
            border: 0,
            padding: 0,
            cursor: 'pointer',
            color: 'var(--muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            opacity: 0.7,
            marginBottom: 18,
          }}
        >
          <ChevronLeft size={12} /> {trip?.title || 'Trip'}
        </button>
        <div
          style={{
            fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
            fontSize: 38,
            fontWeight: 700,
            lineHeight: 0.95,
            letterSpacing: '-0.02em',
            color: 'var(--text)',
          }}
        >
          Photos
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
            marginTop: 6,
          }}
        >
          <div
            style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--muted)',
            }}
          >
            {photoEntries.length === 0
              ? 'No photos yet. Tap below to add the first one.'
              : `${photoEntries.length} photo${photoEntries.length === 1 ? '' : 's'} across ${groups.length} ${groups.length === 1 ? 'stop' : 'stops'}.`}
          </div>
          {queueSize > 0 && (
            <SyncPill count={queueSize} draining={draining} onTap={triggerDrain} />
          )}
        </div>
      </header>

      <div style={{ padding: '14px 14px 0' }}>
        <AddDispatchButton onClick={() => setDispatchOpen(true)} />
      </div>

      <div style={{ padding: '12px 14px 0' }}>
        {groups.length === 0 ? (
          <EmptyState />
        ) : (
          groups.map((group) => (
            <StopGroup
              key={group.stopKey}
              group={group}
              onOpen={(entry) => openLightbox(entry, group.entries)}
            />
          ))
        )}
      </div>

      {lightbox && (
        <Lightbox
          entry={lightbox.entry}
          index={lightbox.index}
          total={lightbox.list.length}
          onPrev={lightbox.index > 0 ? () => step(-1) : null}
          onNext={lightbox.index < lightbox.list.length - 1 ? () => step(1) : null}
          onClose={closeLightbox}
          onCapturedAtChanged={() => setMemoryTick((t) => t + 1)}
        />
      )}

      {dispatchOpen && (
        <AddDispatchModal
          trip={trip}
          traveler={traveler}
          onClose={() => setDispatchOpen(false)}
          onSaved={onDispatchSaved}
        />
      )}
    </div>
  )
}

function SyncPill({ count, draining, onTap }) {
  return (
    <button
      type="button"
      data-testid="sync-pill"
      onClick={onTap}
      title="Pending uploads — tap to retry now"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 14,
        border: '1px solid var(--accent)',
        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
        color: 'var(--text)',
        cursor: 'pointer',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}
    >
      <RefreshCw
        size={11}
        style={{
          animation: draining ? 'pulseShimmer 1s linear infinite' : 'none',
          color: 'var(--accent)',
        }}
      />
      {count} syncing
    </button>
  )
}

function AddDispatchButton({ onClick }) {
  return (
    <button
      type="button"
      data-testid="add-dispatch"
      onClick={onClick}
      style={{
        width: '100%',
        padding: '16px 14px',
        background: 'var(--card, transparent)',
        border: '1px solid var(--accent)',
        borderRadius: 10,
        cursor: 'pointer',
        textAlign: 'left',
        color: 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Plus size={18} style={{ color: 'var(--accent)' }} />
        <div>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              fontWeight: 700,
            }}
          >
            Add photo or video
          </div>
          <div
            style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontStyle: 'italic',
              fontSize: 14,
              color: 'var(--muted)',
              marginTop: 2,
            }}
          >
            from wherever you are.
          </div>
        </div>
      </div>
      <span
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 26,
          fontStyle: 'italic',
          color: 'var(--accent)',
        }}
      >
        →
      </span>
    </button>
  )
}

function EmptyState() {
  return (
    <div
      style={{
        marginTop: 28,
        padding: '32px 18px',
        textAlign: 'center',
        border: '1px dashed var(--border)',
        borderRadius: 10,
        color: 'var(--muted)',
      }}
    >
      <ImageIcon size={28} style={{ opacity: 0.45, marginBottom: 8 }} />
      <p
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontStyle: 'italic',
          fontSize: 15,
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Once the trip starts collecting photos, they'll appear here
        grouped by where you were.
      </p>
    </div>
  )
}

function StopGroup({ group, onOpen }) {
  return (
    <section
      data-testid="stop-group"
      data-stop-key={group.stopKey}
      style={{ marginTop: 22 }}
    >
      <header
        style={{
          padding: '0 4px 10px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            opacity: 0.8,
          }}
        >
          {group.dayLabel}
          {group.timeLabel ? ` · ${group.timeLabel}` : ''}
        </div>
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--text)',
            marginTop: 2,
            lineHeight: 1.2,
          }}
        >
          {group.stopName}
        </div>
      </header>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 10,
        }}
      >
        {group.entries.map((entry) => (
          <PhotoTile key={entry.key} entry={entry} onOpen={() => onOpen(entry)} />
        ))}
      </div>
    </section>
  )
}

function PhotoTile({ entry, onOpen }) {
  const posterColor = TRAVELER_DOT[entry.author] || 'var(--accent)'
  return (
    <button
      type="button"
      data-testid="photo-tile"
      data-photo-key={entry.key}
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
      <div style={{ position: 'relative', aspectRatio: '1 / 1', background: '#000' }}>
        {entry.url ? (
          <img
            src={entry.url}
            alt={entry.caption || 'Trip photo'}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <div
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
      </div>
      <div
        style={{
          padding: '8px 8px 10px',
          background: 'var(--card, transparent)',
          borderTop: '1px solid var(--border)',
        }}
      >
        {entry.caption && (
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

function Lightbox({ entry, index, total, onPrev, onNext, onClose, onCapturedAtChanged }) {
  const devMode = isDevModeEnabled()
  const [editingDate, setEditingDate] = useState(false)
  // Reset the editor whenever we navigate to a different entry —
  // otherwise prev/next would carry a stale draft forward.
  useEffect(() => {
    setEditingDate(false)
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

  // Touch swipe — left/right = prev/next, down = close. Vertical drag
  // threshold is taller (80px) so accidental scroll attempts don't
  // dismiss the lightbox. The handler dispatches via the action
  // helpers below so the gesture-classification logic is unit-testable
  // in isolation.
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
        {onPrev && (
          <NavArrow direction="left" onClick={onPrev} />
        )}
        {entry.url ? (
          <img
            src={entry.url}
            alt={entry.caption || 'Trip photo'}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div style={{ color: '#a78', fontStyle: 'italic' }}>Image unavailable</div>
        )}
        {onNext && (
          <NavArrow direction="right" onClick={onNext} />
        )}
      </div>
      <footer style={{ padding: '14px 18px 24px' }}>
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
    </div>
  )
}

// Dev-mode-only manual date editor. Surfaces in the lightbox footer
// when `localStorage.rt_dev_mode === 'true'` (same gate as the upload
// log). Lets the album owner stamp a `capturedAt` on memories that
// have no EXIF — scanned photos, screenshots of old text threads,
// videos uploaded years after capture. Persists into
// `memory.capturedAt` so the album immediately re-sorts and the sync
// mirror carries the change to every device.
function CapturedAtEditor({ entry, onCancel, onSaved }) {
  // Seed with whatever the album currently shows (memory override →
  // exif → upload time), in the local input's expected format.
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
      <button
        type="button"
        data-testid="lightbox-date-save"
        onClick={save}
        disabled={busy}
        style={pillButtonStyle()}
      >
        Save
      </button>
      <button
        type="button"
        data-testid="lightbox-date-clear"
        onClick={clearOverride}
        disabled={busy}
        style={pillButtonStyle()}
      >
        Clear
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        style={pillButtonStyle()}
      >
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

// Convert an ISO string into the `YYYY-MM-DDTHH:MM` format the
// <input type="datetime-local"> control expects. Uses the local
// timezone — the maintainer is editing what they see in the album,
// which is rendered in local time.
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

// ─── data helpers ─────────────────────────────────────────────────────

// Walk every memory and yield one entry per visible photo. A memory
// can carry a single `photoRef`, an array `photoRefs[]`, or a list of
// external URLs (`photoExternalURLs[]`) — handle all three. We dedupe
// at the URL level *within a single memory* so the back-compat mirror
// (photoRef = photoRefs[0]) doesn't render twice — but two different
// memories that happen to share a URL (test fixtures, re-uploads)
// still each get their own tile.
//
// Date precedence (album sort + label):
//   1. memory.capturedAt  — explicit album date. Set automatically at
//      save time from EXIF / video container; overridable via the
//      dev-mode lightbox affordance for retroactively-uploaded photos.
//   2. ref.capturedAt     — per-photo EXIF for multi-photo memories
//      whose entries pre-date the migration, or photoExternalURLs
//      that came through a path that wrote it.
//   3. memory.createdAt   — the upload time. Rendered with the
//      '· uploaded' label so the chronology is honest.
function flattenPhotoEntries(memories) {
  const out = []
  for (const m of memories || []) {
    const seenInThisMem = new Set()
    const refs = [m.photoRef, ...(m.photoRefs || [])].filter(Boolean)
    const memoryAt =
      typeof m.capturedAt === 'string' && m.capturedAt ? m.capturedAt : null
    function push(url, ref) {
      if (!url || seenInThisMem.has(url)) return
      seenInThisMem.add(url)
      const exifAt = ref?.capturedAt || null
      const realDate = memoryAt || exifAt
      out.push({
        key: `${m.id}::${url}`,
        memoryId: m.id,
        stopId: m.stopId || null,
        author: m.authorTraveler,
        caption: m.caption || m.text || '',
        capturedAt: realDate || m.createdAt,
        capturedAtSource: realDate
          ? memoryAt
            ? 'memory'
            : 'exif'
          : 'createdAt',
        // The memory-level capturedAt the lightbox edits — so the
        // dev-mode override knows what value to seed its input with
        // even when this entry's ref also carries a (now-secondary)
        // EXIF date.
        memoryCapturedAt: memoryAt,
        memoryCreatedAt: m.createdAt || null,
        // EXIF lat/lng if present, otherwise null. The stop-association
        // fallback for the LOCATION label is applied during grouping
        // (we need the stop record to compute it).
        exifLat: Number.isFinite(ref?.lat) ? ref.lat : null,
        exifLng: Number.isFinite(ref?.lng) ? ref.lng : null,
        exifLocation:
          typeof ref?.locationLabel === 'string' ? ref.locationLabel : null,
        url,
      })
    }
    for (const ref of refs) push(refUrl(ref), ref)
    for (const ext of m.photoExternalURLs || []) {
      if (typeof ext === 'string' && ext) push(ext, null)
    }
  }
  return out
}

function refUrl(ref) {
  if (!ref) return null
  if (typeof ref.url === 'string' && ref.url) return ref.url
  if (typeof ref === 'string') return ref
  return null
}

function groupByStop(entries, trip) {
  if (!entries.length) return []
  const stopIndex = new Map()
  for (const day of trip?.days || []) {
    for (const stop of day.stops || []) {
      stopIndex.set(stop.id, { stop, day })
    }
  }
  const buckets = new Map()
  for (const entry of entries) {
    const sid = entry.stopId || '__unassigned'
    if (!buckets.has(sid)) buckets.set(sid, [])
    const ctx = stopIndex.get(sid) || null
    buckets.get(sid).push({
      ...entry,
      stopName: ctx?.stop?.name || 'Unfiled',
      stopAddress: ctx?.stop?.address || null,
      locationLabel:
        entry.exifLocation ||
        (entry.exifLat != null && entry.exifLng != null
          ? `${entry.exifLat.toFixed(3)}, ${entry.exifLng.toFixed(3)}`
          : ctx?.stop?.address || ctx?.stop?.name || null),
      _dayN: ctx?.day?.n ?? 99,
      _stopOrder: ctx?.stop?.id
        ? (ctx.day?.stops || []).findIndex((s) => s.id === ctx.stop.id)
        : 99,
      _dayLabel: ctx?.day?.date || ctx?.day?.title || '',
      _timeLabel: ctx?.stop?.time || '',
    })
  }
  const groups = []
  for (const [stopKey, list] of buckets) {
    // Sort within group by capture date ascending per spec.
    list.sort((a, b) =>
      (a.capturedAt || '') < (b.capturedAt || '') ? -1 : 1
    )
    const first = list[0]
    groups.push({
      stopKey,
      stopName: first?.stopName || 'Unfiled',
      dayLabel: first?._dayLabel || '',
      timeLabel: first?._timeLabel || '',
      _dayN: first?._dayN ?? 99,
      _stopOrder: first?._stopOrder ?? 99,
      entries: list,
    })
  }
  // Order groups: day asc, then stop position within day asc.
  groups.sort((a, b) => {
    if (a._dayN !== b._dayN) return a._dayN - b._dayN
    return a._stopOrder - b._stopOrder
  })
  return groups
}

function firstLine(s) {
  if (!s) return ''
  const idx = s.indexOf('\n')
  return idx >= 0 ? s.slice(0, idx) : s
}

function formatShortDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function formatFullDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
