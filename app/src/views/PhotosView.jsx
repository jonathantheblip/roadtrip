import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Plus, Image as ImageIcon, RefreshCw } from 'lucide-react'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { AddDispatchModal } from '../components/AddDispatchModal'
import { PhotoTile, PhotoLightbox, GridPausedProvider } from '../components/PhotoAlbum'
import { flattenPhotoEntries, groupByStop } from '../lib/photoEntries'
import { count as queueCount, subscribe as subscribeQueue, drain as drainQueue } from '../lib/uploadQueue'
import { isWorkerConfigured, workerFetch } from '../lib/workerSync'
import { saveMemory } from '../lib/memoryStore'

// Photos-by-event view. Punchlist 3 Item 4 — Helen's primary surface
// for the trip's photo archive, grouped by Stop/event.
//
// Tile + lightbox + helpers live in ../components/PhotoAlbum so the
// cross-trip AllPhotosView (Punchlist 4) can reuse them without
// duplicating render code. Per-trip grouping logic stays here in
// StopGroup since it's how this view stitches a single trip's
// memories into the stops timeline.
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
