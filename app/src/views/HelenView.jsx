import { useEffect, useState } from 'react'
import { Mic, Sparkles, Image as ImageIcon, ImageOff } from 'lucide-react'
import { listMemoriesForStop, listMemoriesForTrip } from '../lib/memoryStore'
import { loadAsset } from '../lib/memAssets'
import { thumbUrl } from '../lib/thumbUrl'
import { useInView } from '../lib/useInView'
import { Avatar, AvatarStack } from '../components/Avatar'
import { findArrivalStop, FlightStatus } from './FlightStatus'
import { hasActivitiesForTrip, getActivitiesForTrip } from '../data/sideActivities'
import { HelenEntries } from './HelenEntries'
import { tripPhase } from '../lib/tripPhase'

// Helen — Keeper + Planner. Warm editorial (redesign increment 2, design
// handoff helen.jsx). Sage on warm paper, soft 18px corners. Light only —
// the dark-mode toggle is dropped. Her signature threaded-memory timeline is
// PRESERVED (per the do-not-lose reconciliation) and reskinned, her photos
// entries stay prominent, and she gets a prominent "Design a trip" co-planner
// card (Helen is a full co-planner now — it opens the Claude planning chat she
// already has access to). The design's net-new surfaces (the Weave, show-me-me,
// resurfacing, decide-ripple, rich in-lens replay) are deferred to their own
// increments; today's replay/map entries stay in the shared top bar.

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function HelenView({
  trip,
  traveler,
  onOpenStop,
  onOpenSettings,
  onOpenActivities,
  onOpenPhotos,
  onOpenAllPhotos,
  onOpenClaude,
  onOpenMap,
  onOpenWeave,
  onOpenReplay,
  onOpenBook,
  onOpenSurprises,
  onCompose,
  weaveReady,
  bookHasPages,
  surpriseRevealCue,
}) {
  // Default the active day to today if today is inside the trip — mid-trip
  // openers expect the current day, and the "+" FAB walks to day.stops[0].
  const [activeDay, setActiveDay] = useState(() => {
    const today = new Date().toISOString().slice(0, 10)
    const onToday = trip.days.find((d) => d.isoDate === today)
    return onToday?.n || trip.days[0]?.n
  })
  const day = trip.days.find((d) => d.n === activeDay) || trip.days[0]
  const arrival = findArrivalStop(trip)

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', paddingBottom: 120, position: 'relative' }}>
      {/* Warm greeting header (→ Settings via the avatar) */}
      <div style={{ padding: 'calc(env(safe-area-inset-top) + 60px) 20px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif', fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text)' }}>
            {greeting()}, Helen
          </div>
          <Eyebrow color="var(--muted)" style={{ marginTop: 5 }}>{(trip.title || '').toUpperCase()}</Eyebrow>
        </div>
        <button onClick={onOpenSettings} aria-label="Settings" style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', lineHeight: 0, flexShrink: 0 }}>
          <Avatar id="helen" size={36} ring />
        </button>
      </div>

      {trip.coverPhotoUrl && (
        <div style={{ padding: '10px 20px 2px' }}>
          <img
            src={trip.coverPhotoUrl}
            alt={trip.title || 'Trip cover'}
            style={{ width: '100%', height: 168, objectFit: 'cover', borderRadius: 'var(--radius)', display: 'block', boxShadow: 'var(--shadow-card)' }}
          />
        </div>
      )}

      {/* Day chips */}
      <div style={{ padding: '12px 20px 4px', display: 'flex', gap: 8 }}>
        {trip.days.map((d) => {
          const isActive = d.n === activeDay
          const dow = (d.date || '').split(' ')[0]
          return (
            <button
              key={d.n}
              type="button"
              onClick={() => setActiveDay(d.n)}
              aria-pressed={isActive}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: 'var(--radius)',
                background: isActive ? 'var(--accent)' : 'var(--card)',
                color: isActive ? 'var(--accent-ink)' : 'var(--muted)',
                border: isActive ? 'none' : '1px solid var(--border)',
                boxShadow: isActive ? 'var(--shadow-card)' : 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em' }}>DAY {d.n}</div>
              <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 14, fontWeight: 600, marginTop: 2 }}>{dow}</div>
            </button>
          )
        })}
      </div>

      {/* Day header */}
      <div style={{ padding: '12px 20px 0' }}>
        <Eyebrow color="var(--accent-text)">DAY {day.n} · {(day.date || '').toUpperCase()}</Eyebrow>
        <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 26, fontWeight: 700, lineHeight: 1.05, marginTop: 5, color: 'var(--text)' }}>
          {day.title}
        </div>
      </div>

      {arrival?.day?.n === day.n && (
        <div style={{ padding: '14px 20px 0' }}>
          <FlightStatus stop={arrival.stop} variant="panel" framing="their" traveler={traveler} />
        </div>
      )}

      {/* Entry-points home band (Now stack + Keepsake shelf), layered above the
          co-planner entry + the threaded timeline (both preserved below). */}
      <HelenEntries
        trip={trip}
        phase={tripPhase(trip)}
        weaveReady={weaveReady}
        surpriseRevealCue={surpriseRevealCue}
        bookHasPages={bookHasPages}
        onOpenMap={onOpenMap}
        onOpenWeave={onOpenWeave}
        onOpenReplay={onOpenReplay}
        onOpenBook={onOpenBook}
        onOpenSurprises={onOpenSurprises}
        onCompose={onCompose}
      />

      {/* CO-PLANNER — Helen plans too now. Opens the Claude planning chat
          she already has access to (the locked "Helen = full co-planner"
          decision, realized with existing machinery). */}
      {onOpenClaude && (
        <div style={{ padding: '16px 20px 0' }}>
          <button
            type="button"
            data-testid="helen-plan-entry"
            onClick={onOpenClaude}
            style={{
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              border: 'none',
              borderRadius: 'var(--radius)',
              padding: '16px 18px',
              background: 'linear-gradient(120deg, var(--accent), #245C3E)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              boxShadow: '0 14px 30px -16px rgba(46, 125, 82, 0.7)',
            }}
          >
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 28, fontWeight: 300, lineHeight: 1 }}>+</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.85 }}>Plan with Claude</div>
              <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 19, fontWeight: 600, marginTop: 3, lineHeight: 1.15 }}>Design a trip, start to finish.</div>
            </div>
            <span style={{ fontSize: 20 }}>→</span>
          </button>
        </div>
      )}

      {/* Photos entries — deliberately above the timeline so Helen can add
          or browse from any day without scrolling past it (do-not-lose). */}
      {onOpenPhotos && <HelenPhotosEntry trip={trip} traveler={traveler} onOpen={onOpenPhotos} />}
      {onOpenAllPhotos && <HelenAllPhotosEntry onOpen={onOpenAllPhotos} />}

      {/* The threaded timeline — Helen's signature, PRESERVED + reskinned */}
      <div style={{ padding: '20px 0 0' }}>
        {day.stops.map((s, i) => (
          <StopWithThread
            key={s.id}
            stop={s}
            traveler={traveler}
            last={i === day.stops.length - 1}
            onOpen={() => onOpenStop(day.n, s.id)}
          />
        ))}
      </div>

      {hasActivitiesForTrip(trip.id) && onOpenActivities && (
        <button
          type="button"
          onClick={onOpenActivities}
          style={{
            margin: '24px 20px 0',
            padding: '14px 16px',
            width: 'calc(100% - 40px)',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-card)',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'inherit',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={14} style={{ color: 'var(--accent-text)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                {getActivitiesForTrip(trip.id).length} options
              </span>
              <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 16, fontStyle: 'italic', color: 'var(--text)' }}>
                Things to do
              </span>
            </div>
          </div>
          <span style={{ color: 'var(--accent-text)', fontSize: 18 }}>→</span>
        </button>
      )}

      {/* Capture FAB → the active day's first stop (where memories attach) */}
      <button
        type="button"
        aria-label="Capture memory"
        onClick={() => {
          const target = day.stops?.[0]
          if (target) onOpenStop(day.n, target.id)
        }}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 92,
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: 'none',
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(46, 125, 82, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          fontWeight: 300,
          zIndex: 20,
        }}
      >
        +
      </button>
    </div>
  )
}

function StopWithThread({ stop, traveler, last, onOpen }) {
  const mems = listMemoriesForStop(stop.id, traveler)
  const authors = Array.from(new Set(mems.map((m) => m.authorTraveler)))
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', left: 32, top: 8, bottom: last ? 30 : 0, width: 1, background: 'var(--border)' }} />
      <div style={{ padding: '14px 20px 6px', position: 'relative' }}>
        <button
          type="button"
          onClick={onOpen}
          style={{ width: '100%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', textAlign: 'left', display: 'flex', gap: 14, alignItems: 'flex-start' }}
        >
          <div style={{ width: 24, paddingTop: 2 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--bg)', border: '2px solid var(--accent)', marginLeft: -1 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Eyebrow color="var(--muted)">{stop.time}</Eyebrow>
              <Eyebrow color="var(--muted)">{(stop.kind || '').toUpperCase()}</Eyebrow>
            </div>
            <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 17, fontWeight: 600, lineHeight: 1.2, marginTop: 4, letterSpacing: '-0.012em' }}>
              {stop.name}
            </div>
            {(stop.helenNote || stop.note) && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {stop.helenNote || stop.note}
              </div>
            )}
          </div>
        </button>

        {mems.length > 0 ? (
          <button
            type="button"
            onClick={onOpen}
            style={{
              marginLeft: 38,
              marginTop: 12,
              padding: '12px 14px',
              background: 'var(--card)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-card)',
              width: 'calc(100% - 58px)',
              textAlign: 'left',
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Eyebrow color="var(--accent-text)" style={{ fontWeight: 600 }}>
                {mems.length} {mems.length === 1 ? 'MEMORY' : 'MEMORIES'}
              </Eyebrow>
              <AvatarStack ids={authors} size={16} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {mems.slice(0, 3).map((m) => (
                <ThreadPreviewTile key={m.id} mem={m} />
              ))}
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              OPEN THREAD →
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            style={{
              marginLeft: 38,
              marginTop: 10,
              padding: '7px 14px',
              borderRadius: 999,
              border: '1px dashed var(--border)',
              background: 'transparent',
              color: 'var(--muted)',
              fontSize: 11,
              fontFamily: 'Inter Tight, system-ui, sans-serif',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 14 }}>+</span> add a memory
          </button>
        )}
      </div>
    </div>
  )
}

function ThreadPreviewTile({ mem }) {
  const kind = mem.kind || (mem.text ? 'text' : 'photo')
  const photoRefs = mem.photoRefs?.length ? mem.photoRefs : mem.photoRef ? [mem.photoRef] : []
  // A 'photo' memory with no R2/IDB ref and no external URL has no image to
  // paint — surface a calm "unavailable" tile so the state reads as final,
  // not a forever-loading promise (KNOWN_BUGS_HELEN_SURFACE.md P0.2).
  const hasRenderableSource =
    photoRefs.some((r) => r?.url || r?.key) || (mem.photoExternalURLs?.length || 0) > 0
  const isPhotoMissing = kind === 'photo' && !hasRenderableSource
  const [photoUrl, setPhotoUrl] = useState(null)
  // Defer the fetch (R2 GET / IDB blob) until the tile nears the viewport
  // (KNOWN_BUGS_HELEN_SURFACE.md P0.4).
  const { ref: tileRef, inView } = useInView({ rootMargin: '300px 0px' })
  useEffect(() => {
    if (!inView) return
    let cancelled = false
    let created = null
    const first = photoRefs[0]
    if (kind === 'photo' && first?.url) {
      setPhotoUrl(thumbUrl(first.url, 600))
    } else if (kind === 'photo' && first?.key && first.storage === 'idb') {
      loadAsset('photo', first.key).then((blob) => {
        if (cancelled || !blob) return
        created = URL.createObjectURL(blob)
        setPhotoUrl(created)
      })
    }
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [inView, kind, photoRefs[0]?.key, photoRefs[0]?.url])
  return (
    <div ref={tileRef} style={{ flex: 1, position: 'relative' }}>
      {kind === 'photo' && !isPhotoMissing && (
        <div
          style={{
            aspectRatio: 1,
            background: photoUrl
              ? `url(${photoUrl}) center/cover no-repeat`
              : 'repeating-linear-gradient(45deg, #e2d7bf, #e2d7bf 6px, #d6c5a8 6px, #d6c5a8 12px)',
            borderRadius: 10,
          }}
        />
      )}
      {isPhotoMissing && (
        <div
          aria-label="Photo unavailable"
          style={{ aspectRatio: 1, background: 'var(--bg2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}
        >
          <ImageOff size={18} strokeWidth={1.5} />
        </div>
      )}
      {kind === 'photo' && !isPhotoMissing && photoRefs.length > 1 && (
        <div style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.65)', color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', padding: '1px 5px', borderRadius: 8 }}>
          {photoRefs.length}
        </div>
      )}
      {kind === 'voice' && (
        <div style={{ aspectRatio: 1, background: 'var(--bg2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)' }}>
          <Mic size={18} />
        </div>
      )}
      {kind === 'text' && (
        <div
          style={{ aspectRatio: 1, background: 'var(--bg2)', borderRadius: 10, padding: 6, fontFamily: 'Fraunces, Georgia, serif', fontSize: 9, fontStyle: 'italic', color: 'var(--muted)', overflow: 'hidden', lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical' }}
        >
          “{(mem.text || mem.transcript || mem.caption || '').slice(0, 80)}”
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 3, left: 3 }}>
        <Avatar id={mem.authorTraveler} size={14} ring />
      </div>
    </div>
  )
}

function Eyebrow({ children, color, style }) {
  return (
    <div
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: color || 'currentColor',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// Helen's photos entry — soft card, nods at 'this is where the trip's
// archive lives.' Counts visible photo memories as the secondary number.
function HelenPhotosEntry({ trip, traveler, onOpen }) {
  const mems = listMemoriesForTrip(trip.id, traveler)
  const photoCount = mems.reduce((n, m) => {
    if (m.photoRef || m.photoRefs?.length || m.photoExternalURLs?.length) return n + 1
    return n
  }, 0)
  return (
    <button
      type="button"
      data-testid="helen-photos-entry"
      onClick={onOpen}
      style={{
        margin: '16px 20px 0',
        padding: '14px 16px',
        width: 'calc(100% - 40px)',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-card)',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ImageIcon size={14} style={{ color: 'var(--accent-text)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            {photoCount === 0 ? 'Empty' : photoCount + ' captured'}
          </span>
          <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 16, fontStyle: 'italic', color: 'var(--text)' }}>
            Photos
          </span>
        </div>
      </div>
      <span style={{ color: 'var(--accent-text)', fontSize: 18 }}>→</span>
    </button>
  )
}

// Sibling — calmer outline-only style so the per-trip Photos entry stays
// primary. All Photos sits next to the per-trip Photos entry.
function HelenAllPhotosEntry({ onOpen }) {
  return (
    <button
      type="button"
      data-testid="helen-all-photos-entry"
      onClick={onOpen}
      style={{
        margin: '8px 20px 0',
        padding: '12px 16px',
        width: 'calc(100% - 40px)',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          The full archive
        </span>
        <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 14, fontStyle: 'italic', color: 'var(--text)' }}>
          All photos — every trip
        </span>
      </div>
      <span style={{ color: 'var(--muted)', fontSize: 16 }}>→</span>
    </button>
  )
}
