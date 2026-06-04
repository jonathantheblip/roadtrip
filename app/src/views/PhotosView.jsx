import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Image as ImageIcon, ImagePlus, RefreshCw } from 'lucide-react'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { ImportFlow, ImportToast } from '../components/ImportFlow'
import { PhotoTile, PhotoLightbox, GridPausedProvider } from '../components/PhotoAlbum'
import { flattenPhotoEntries, groupByStop } from '../lib/photoEntries'
import { count as queueCount, subscribe as subscribeQueue, drain as drainQueue } from '../lib/uploadQueue'
import { isWorkerConfigured, workerFetch, uploadPoster } from '../lib/workerSync'
import { saveMemory } from '../lib/memoryStore'
import { isVideoEncodeSupported } from '../lib/videoPipeline'

// Photos-by-event view. Punchlist 3 Item 4 — Helen's primary surface
// for the trip's photo archive, grouped by Stop/event.
//
// Tile + lightbox + helpers live in ../components/PhotoAlbum so the
// cross-trip AllPhotosView (Punchlist 4) can reuse them without
// duplicating render code. Per-trip grouping logic stays here in
// StopGroup since it's how this view stitches a single trip's
// memories into the stops timeline.
//
// "Import photos" is the sole add affordance at the top (the One True
// Importer — Stage 3 retired the single-photo dispatch composer): a bulk
// library pick (photos + video) that auto-files by GPS+time through
// PhotoBackfillTriage, is offline-safe via the upload queue, and captions
// happen in the album afterward. There is no separate dispatch modal.
//
// Aesthetic: Helen's surface palette (linen / forest accent) is the
// reference design; the other three themed views inherit via CSS vars
// when they navigate in.

export function PhotosView({ trip, traveler, onBack, tripsApi }) {
  // Re-read memories when this view-render flips (e.g. after a save).
  const [memoryTick, setMemoryTick] = useState(0)

  // Bulk importer (Stage 1). When the user picks a library batch, the
  // files land here and we hand off to PhotoBackfillTriage full-screen;
  // clearing them (cancel or "back to the trip") returns to the album,
  // and a completed import bumps memoryTick so the new photos appear.
  const [triageFiles, setTriageFiles] = useState(null)
  const importInputRef = useRef(null)
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

  // Quiet confirmation toast after an import (the smart-skip feel — the
  // clean batch saves silently, this is the only acknowledgement).
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  function showImportToast(results) {
    const props = importToastProps(results)
    if (!props) return
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(props)
    toastTimerRef.current = setTimeout(() => setToast(null), 3400)
  }
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

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
        const photoRef = { ...item.ref, storage: 'r2', key: remote.key, url: remote.url }
        // Re-upload a queued video's poster so the synced tile renders a still
        // (best-effort; mirrors uploadOrQueueVideo + App.jsx uploadQueueRunner).
        if (item.kind === 'video' && item.posterBlob) {
          const poster = await uploadPoster(item.id, item.posterBlob)
          if (poster) Object.assign(photoRef, poster)
        }
        saveMemory({
          id: item.id,
          tripId: item.tripId,
          stopId: item.stopId,
          authorTraveler: item.authorTraveler,
          visibility: 'shared',
          kind: 'photo',
          caption: item.caption,
          photoRef,
        })
      })
    } finally {
      setDraining(false)
      setMemoryTick((t) => t + 1)
    }
  }

  // Importer takes over the whole surface while a picked batch is in flight —
  // ImportFlow (its own var(--bg) chrome) analyzes, smart-skips clean imports
  // with a toast, or shows the confirm summary, and hands off to the heavy
  // reconcile editor on "Review in detail". A completed import bumps
  // memoryTick so the new photos appear, and surfaces a quiet toast.
  if (triageFiles && triageFiles.length > 0) {
    return (
      <ImportFlow
        trip={trip}
        traveler={traveler}
        files={triageFiles}
        tripsApi={tripsApi}
        onCancel={() => setTriageFiles(null)}
        onComplete={(results) => {
          setTriageFiles(null)
          setMemoryTick((t) => t + 1)
          showImportToast(results)
        }}
      />
    )
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
      <header style={{ padding: 'calc(env(safe-area-inset-top) + 60px) 18px 6px' }}>
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

      <div style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          ref={importInputRef}
          type="file"
          // Only offer video where the WebCodecs encode can actually run —
          // otherwise a picked video would be silently dropped (ImportFlow
          // skips unencodable videos, logging the skip to the dev upload log).
          accept={isVideoEncodeSupported() ? 'image/*,video/*' : 'image/*'}
          multiple
          data-testid="import-file-input"
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = Array.from(e.target.files || [])
            // Clear the value so picking the same batch twice still fires.
            e.target.value = ''
            if (files.length > 0) setTriageFiles(files)
          }}
        />
        <ImportButton onClick={() => importInputRef.current?.click()} />
      </div>

      <GridPausedProvider paused={!!lightbox}>
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
      </GridPausedProvider>

      {lightbox && (
        <PhotoLightbox
          entry={lightbox.entry}
          index={lightbox.index}
          total={lightbox.list.length}
          onPrev={lightbox.index > 0 ? () => step(-1) : null}
          onNext={lightbox.index < lightbox.list.length - 1 ? () => step(1) : null}
          onClose={closeLightbox}
          onCapturedAtChanged={() => setMemoryTick((t) => t + 1)}
        />
      )}

      {toast && <ImportToast {...toast} />}
    </div>
  )
}

// Map the upload results → <ImportToast> props (the design's quiet, count-first
// voice). The common case is "N photos added [· M syncing]"; re-attach and the
// nothing-new case get a plain message line.
function importToastProps(r) {
  if (!r) return null
  if (r.nothingNew) return { message: 'Nothing new to import' }
  if (r.ok > 0) {
    return { count: r.ok, noun: r.ok === 1 ? 'photo' : 'photos', syncing: r.queued || 0 }
  }
  if (r.reattached > 0) {
    return { message: `${r.reattached} re-attached` }
  }
  return { message: 'Nothing new to import' }
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
          color: 'var(--accent-text)',
        }}
      />
      {count} syncing
    </button>
  )
}

// Primary action (Importer Stage 1): bulk-pick from the library, then
// auto-file by GPS+time through the triage. The sole add affordance on
// this surface (Stage 3 retired the single-photo dispatch composer).
function ImportButton({ onClick }) {
  return (
    <button
      type="button"
      data-testid="import-photos"
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
        <ImagePlus size={18} style={{ color: 'var(--accent-text)' }} />
        <div>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--accent-text)',
              fontWeight: 700,
            }}
          >
            Import photos
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
            from your library — we'll match them to stops.
          </div>
        </div>
      </div>
      <span
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 26,
          fontStyle: 'italic',
          color: 'var(--accent-text)',
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
  // Partition the stop's entries into contiguous runs by memoryId.
  // Two memories captured at the same stop used to flow into one
  // CSS grid, so tile 5's "1/4" badge looked like a numbering
  // glitch rather than the start of a new memory. Each run renders
  // as its own grid with a thin hairline between runs — the badge
  // now reads unambiguously as "photo X of memory Y."
  const memoryRuns = []
  for (const entry of group.entries) {
    const last = memoryRuns[memoryRuns.length - 1]
    if (last && last.memoryId === entry.memoryId) {
      last.entries.push(entry)
    } else {
      memoryRuns.push({ memoryId: entry.memoryId, entries: [entry] })
    }
  }
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {memoryRuns.map((run, runIdx) => (
          <div
            key={`${group.stopKey}::${run.memoryId}::${runIdx}`}
            data-testid="memory-group"
            data-memory-id={run.memoryId}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 10,
              // Thin hairline above every memory after the first —
              // sits inside the flex column gap and reads as a
              // separator without looking like a heavy block. The
              // first run shows no rule (the stop header already
              // anchors the top of the section).
              ...(runIdx > 0
                ? {
                    paddingTop: 12,
                    borderTop: '1px solid var(--border)',
                  }
                : null),
            }}
          >
            {run.entries.map((entry) => (
              <PhotoTile key={entry.key} entry={entry} onOpen={() => onOpen(entry)} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
