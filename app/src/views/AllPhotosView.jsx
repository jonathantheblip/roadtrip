import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronsLeft, Play, Image as ImageIcon } from 'lucide-react'
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

// Sticky jump-back row styles (inline, matching this view's convention).
const JUMPROW = {
  position: 'sticky',
  top: 'env(safe-area-inset-top)',
  zIndex: 5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '8px 16px',
  background: 'var(--bg)',
  borderBottom: '1px solid var(--border)',
}
const JUMPBACK = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  maxWidth: '68%',
  padding: '7px 13px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text)',
  cursor: 'pointer',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
  letterSpacing: '0.04em',
}
const JUMPBACK_OFF = {
  ...JUMPBACK,
  cursor: 'default',
  color: 'var(--muted)',
  background: 'transparent',
  // No opacity multiplier — --muted alone holds AA on --bg; the extra 0.7 had
  // dropped "Earliest trip" below readable contrast (worst on Helen's paper bg).
}
const ELLIPSIS = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const PLAYPILL = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 15px',
  borderRadius: 999,
  border: 0,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 12,
}

export function AllPhotosView({ trips, traveler, onBack, onPlayTrip }) {
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

  // Per-trip entry lists, in display order. The lightbox navigates WITHIN one
  // trip — a swipe never silently crosses a trip boundary. (Trips render
  // newest-first, so an un-scoped swipe used to jump BACKWARD in time at every
  // boundary — the bug Jonathan saw.) Crossing to an older trip is now the
  // deliberate "jump back a trip" control; album & reel stay distinct, bridged
  // only by the per-trip Play.
  const tripEntries = useMemo(() => {
    const map = {}
    for (const sec of sections) {
      const list = []
      for (const sg of sec.stops) for (const e of sg.entries) list.push(e)
      map[sec.tripId] = list
    }
    return map
  }, [sections])

  const totalPhotos = useMemo(
    () => Object.values(tripEntries).reduce((n, l) => n + l.length, 0),
    [tripEntries]
  )
  const tripsWithPhotos = sections.length

  // ── Lightbox, scoped to a single trip: { tripId, index, key } ──────────
  const [lightbox, setLightbox] = useState(null)

  // Re-resolve the open entry by key (within its trip) after any external
  // change (date override, drain). Same defensive pattern as PhotosView.
  useEffect(() => {
    setLightbox((lb) => {
      if (!lb) return lb
      const list = tripEntries[lb.tripId] || []
      if (list.length === 0) return null
      const idx = list.findIndex((e) => e.key === lb.key)
      if (idx >= 0) return { ...lb, index: idx }
      // The open photo vanished (the viewer deleted it, or a drain/date-edit
      // moved it). Stay open on the photo now at our slot — clamped — so pruning
      // a run of photos doesn't close the viewer each time; close only when this
      // trip has no photos left.
      const at = Math.min(lb.index, list.length - 1)
      return { ...lb, index: at, key: list[at].key }
    })
  }, [tripEntries])

  function openLightbox(entry) {
    const list = tripEntries[entry.tripId] || []
    const index = Math.max(0, list.findIndex((e) => e.key === entry.key))
    setLightbox({ tripId: entry.tripId, index, key: entry.key })
  }
  function closeLightbox() {
    setLightbox(null)
  }
  function step(delta) {
    setLightbox((lb) => {
      if (!lb) return null
      const list = tripEntries[lb.tripId] || []
      const next = lb.index + delta
      if (next < 0 || next >= list.length) return lb // clamped at the trip's edge
      return { ...lb, index: next, key: list[next].key }
    })
  }

  // ── Scroll-spy: which trip is "in view" under the sticky jump-back row ──
  const sectionRefs = useRef({})
  const [activeTripId, setActiveTripId] = useState(null)
  useEffect(() => {
    if (sections.length) {
      setActiveTripId((cur) =>
        cur && sections.some((s) => s.tripId === cur) ? cur : sections[0].tripId
      )
    } else {
      setActiveTripId(null)
    }
  }, [sections])
  useEffect(() => {
    if (sections.length <= 1) return undefined
    const STICKY_OFFSET = 150 // header + sticky row; the section beneath it wins
    const BOTTOM_EPS = 2 // px slack for fractional mobile scroll metrics
    let raf = 0
    const recompute = () => {
      raf = 0
      // At the bottom of the page, the last (oldest) section IS what you're
      // looking at — even though its top never crosses the sticky line above
      // (a short final section can't scroll that high). Without this anchor, a
      // jump-back to the earliest trip near the page bottom is reverted to the
      // newest by the top-crossing test below — the "Earliest trip" state never
      // latches (worse on webkit-mobile, where the geometry lands short). Gate
      // on a genuinely scrollable page so it never fires while everything fits
      // on one screen — there you're at the top, viewing the newest.
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight
      if (maxScroll > BOTTOM_EPS && window.scrollY >= maxScroll - BOTTOM_EPS) {
        setActiveTripId(sections[sections.length - 1].tripId)
        return
      }
      let active = sections[0].tripId
      for (const sec of sections) {
        const el = sectionRefs.current[sec.tripId]
        if (!el) continue
        if (el.getBoundingClientRect().top - STICKY_OFFSET <= 0) active = sec.tripId
      }
      setActiveTripId(active)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(recompute)
    }
    recompute()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [sections])

  const activeIndex = sections.findIndex((s) => s.tripId === activeTripId)
  const activeTrip = activeIndex >= 0 ? sections[activeIndex] : sections[0] || null
  const olderTrip = activeIndex >= 0 ? sections[activeIndex + 1] || null : null

  function jumpToTrip(tripId) {
    setActiveTripId(tripId)
    const el = sectionRefs.current[tripId]
    // Instant (not smooth): a deliberate "jump back" lands at once, and the
    // synchronous scroll lets the scroll-spy settle on the target immediately
    // instead of briefly flickering the "Earliest trip" state mid-animation.
    if (el) el.scrollIntoView({ block: 'start' })
  }

  const openList = lightbox ? tripEntries[lightbox.tripId] || [] : []
  const openEntry = lightbox ? openList[lightbox.index] || null : null

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

      {sections.length > 0 && (
        <div data-testid="all-photos-jumpback-row" style={JUMPROW}>
          {sections.length > 1 ? (
            olderTrip ? (
              <button
                type="button"
                data-testid="all-photos-jumpback"
                onClick={() => jumpToTrip(olderTrip.tripId)}
                style={JUMPBACK}
              >
                <ChevronsLeft size={15} style={{ flexShrink: 0 }} />
                <span style={ELLIPSIS}>Jump back · {olderTrip.tripTitle}</span>
              </button>
            ) : (
              <span data-testid="all-photos-jumpback-disabled" style={JUMPBACK_OFF}>
                <ChevronsLeft size={15} style={{ flexShrink: 0 }} />
                <span style={ELLIPSIS}>Earliest trip</span>
              </span>
            )
          ) : (
            <span />
          )}
          {activeTrip && onPlayTrip && (
            <button
              type="button"
              data-testid="all-photos-play"
              onClick={() => onPlayTrip(activeTrip.tripId)}
              aria-label={`Play ${activeTrip.tripTitle}`}
              style={PLAYPILL}
            >
              <Play size={13} fill="currentColor" /> Play
            </button>
          )}
        </div>
      )}

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
                sectionRef={(el) => (sectionRefs.current[tripSec.tripId] = el)}
              />
            ))
          )}
        </div>
      </GridPausedProvider>

      {openEntry && (
        <PhotoLightbox
          entry={openEntry}
          index={lightbox.index}
          total={openList.length}
          onPrev={lightbox.index > 0 ? () => step(-1) : null}
          onNext={lightbox.index < openList.length - 1 ? () => step(1) : null}
          onClose={closeLightbox}
          onCapturedAtChanged={() => setMemoryTick((t) => t + 1)}
          onDelete={() => setMemoryTick((t) => t + 1)}
          traveler={traveler}
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

function TripSection({ tripSec, onOpen, sectionRef }) {
  return (
    <section
      ref={sectionRef}
      data-testid="all-photos-trip"
      data-trip-id={tripSec.tripId}
      style={{ marginTop: 28, scrollMarginTop: 150 }}
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
