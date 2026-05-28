import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Image as ImageIcon } from 'lucide-react'
import { listAllLocalMemories } from '../lib/memoryStore'
import { PhotoTile, PhotoLightbox, GridPausedProvider } from '../components/PhotoAlbum'
import { groupAcrossTrips } from '../lib/photoEntries'

// AllPhotosView — Punchlist 4. A single cross-trip album that reads
// every memory the active traveler has access to and groups it by
// trip → stop, newest trip first.
//
// Reuses PhotoTile / PhotoLightbox / the data helpers from
// PhotosView's split into ../components/PhotoAlbum and
// ../lib/photoEntries — so tiles render the same multi-photo badges,
// captions are deduped per memory, broken images fall back to the
// ImageIcon, and the dev-mode capture-date editor still works.
//
// Lightbox shows an extra "TRIP NAME" line above the caption so the
// user always knows which trip's archive they're scrolling through
// (cross-trip swipe can cross trip boundaries inside one open list).
//
// Read-only — adding new photos still happens from a specific
// trip's PhotosView where the stop context is known.

export function AllPhotosView({ trips, traveler, onBack }) {
  const [memoryTick, setMemoryTick] = useState(0)
  const sections = useMemo(
    () => {
      const all = listAllLocalMemories(traveler)
      const perTrip = (trips || []).map((trip) => ({
        trip,
        memories: all.filter((m) => m.tripId === trip.id),
      }))
      return groupAcrossTrips(perTrip)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trips, traveler, memoryTick]
  )

  // Flatten every entry into a single chronological list so the
  // lightbox's prev/next can cross memory → stop → trip boundaries
  // in one swipe. The order matches what the user is scrolling: the
  // sections array is already trip-then-stop-then-memory-then-date,
  // so we just concat.
  const allEntries = useMemo(() => {
    const out = []
    for (const tripSec of sections) {
      for (const stopGroup of tripSec.stops) {
        for (const entry of stopGroup.entries) out.push(entry)
      }
    }
    return out
  }, [sections])

  const [lightbox, setLightbox] = useState(null) // { entry, index }

  // Re-resolve the open entry by key after any external change (date
  // override, drain). Same defensive pattern as PhotosView.
  useEffect(() => {
    setLightbox((lb) => {
      if (!lb) return lb
      const idx = allEntries.findIndex((e) => e.key === lb.entry.key)
      if (idx < 0) return lb
      return { ...lb, index: idx, entry: allEntries[idx] }
    })
  }, [allEntries])

  function openLightbox(entry) {
    const index = allEntries.findIndex((e) => e === entry)
    setLightbox({ entry, index: index >= 0 ? index : 0 })
  }
  function closeLightbox() {
    setLightbox(null)
  }
  function step(delta) {
    setLightbox((lb) => {
      if (!lb) return null
      const next = lb.index + delta
      if (next < 0 || next >= allEntries.length) return lb
      return { ...lb, index: next, entry: allEntries[next] }
    })
  }

  const totalPhotos = allEntries.length
  const tripsWithPhotos = sections.length

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
          <ChevronLeft size={12} /> Back
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
          All photos
        </div>
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 14,
            fontStyle: 'italic',
            color: 'var(--muted)',
            marginTop: 6,
          }}
        >
          {totalPhotos === 0
            ? 'Nothing in the archive yet.'
            : `${totalPhotos} photo${totalPhotos === 1 ? '' : 's'} across ${tripsWithPhotos} ${tripsWithPhotos === 1 ? 'trip' : 'trips'}.`}
        </div>
      </header>

      <GridPausedProvider paused={!!lightbox}>
        <div style={{ padding: '12px 14px 0' }}>
          {sections.length === 0 ? (
            <EmptyState />
          ) : (
            sections.map((tripSec) => (
              <TripSection
                key={tripSec.tripId}
                tripSec={tripSec}
                onOpen={openLightbox}
              />
            ))
          )}
        </div>
      </GridPausedProvider>

      {lightbox && (
        <PhotoLightbox
          entry={lightbox.entry}
          index={lightbox.index}
          total={allEntries.length}
          onPrev={lightbox.index > 0 ? () => step(-1) : null}
          onNext={lightbox.index < allEntries.length - 1 ? () => step(1) : null}
          onClose={closeLightbox}
          onCapturedAtChanged={() => setMemoryTick((t) => t + 1)}
          showTripName
        />
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div
      data-testid="all-photos-empty"
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
        Photos you add inside any trip will land here too.
      </p>
    </div>
  )
}

function TripSection({ tripSec, onOpen }) {
  return (
    <section
      data-testid="all-photos-trip"
      data-trip-id={tripSec.tripId}
      style={{ marginTop: 28 }}
    >
      <header
        style={{
          padding: '0 4px 8px',
          borderBottom: '1px solid var(--text)',
          marginBottom: 14,
          opacity: 0.9,
        }}
      >
        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          Trip
        </div>
        <div
          style={{
            fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text)',
            marginTop: 2,
            lineHeight: 1.15,
          }}
        >
          {tripSec.tripTitle}
        </div>
      </header>
      {tripSec.stops.map((stop) => (
        <StopGroupForAllPhotos
          key={`${tripSec.tripId}::${stop.stopKey}`}
          tripTitle={tripSec.tripTitle}
          group={stop}
          onOpen={onOpen}
        />
      ))}
    </section>
  )
}

// Same memory-group separator pattern as PhotosView's StopGroup —
// duplicated here because the cross-trip section eyebrow lists the
// trip name once at the top and we don't want the per-stop header to
// repeat it. Could be merged with StopGroup if we add a prop for
// the eyebrow content, but the small render duplication is easier
// to read than threading flags through.
function StopGroupForAllPhotos({ tripTitle, group, onOpen }) {
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
      style={{ marginTop: 18 }}
    >
      <header
        style={{
          padding: '0 4px 8px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 10,
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
            fontSize: 16,
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
              ...(runIdx > 0
                ? { paddingTop: 12, borderTop: '1px solid var(--border)' }
                : null),
            }}
          >
            {run.entries.map((entry) => (
              <PhotoTile
                key={entry.key}
                entry={entry}
                onOpen={() => onOpen(entry)}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
