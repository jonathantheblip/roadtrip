import { Sparkles, Image as ImageIcon } from 'lucide-react'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { hasActivitiesForTrip, getActivitiesForTrip } from '../data/sideActivities'
import { LivingHeartHome } from './LivingHeartHome'
import { LookBackStrip } from '../components/LookBackStrip'
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


export function HelenView({
  trip,
  traveler,
  pastTrips,
  onPlayPastTrip,
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
  onOpenEditor,
  weaveReady,
  bookHasPages,
  surpriseRevealCue,
  nowReadout,
  whoAround,
}) {
  // ONE home for EVERY phase (slice 4): the living heart is Helen's home during AND
  // after (its keepsake state) — it reads straight from props. Her threaded-timeline
  // keepsake is retired; co-planner + photos entries stay; Things-to-do drops after.
  const after = tripPhase(trip) === 'after'
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', paddingBottom: 120, position: 'relative' }}>
      <LivingHeartHome
        trip={trip}
        traveler={traveler}
        nowReadout={nowReadout}
        whoAround={whoAround}
        weaveReady={weaveReady}
        bookHasPages={bookHasPages}
        onOpenMap={onOpenMap}
        onOpenWeave={onOpenWeave}
        onOpenReplay={onOpenReplay}
        onOpenBook={onOpenBook}
        onOpenSurprises={onOpenSurprises}
        onCompose={onCompose}
        onOpenEditor={onOpenEditor}
        onOpenAllPhotos={onOpenAllPhotos}
        onOpenActivities={onOpenActivities}
        onOpenStop={onOpenStop}
      />
      <LookBackStrip trips={pastTrips} onPlay={onPlayPastTrip} />
      <HelenCoPlanner onOpenClaude={onOpenClaude} />
      {onOpenPhotos && <HelenPhotosEntry trip={trip} traveler={traveler} onOpen={onOpenPhotos} />}
      {onOpenAllPhotos && <HelenAllPhotosEntry onOpen={onOpenAllPhotos} />}
      {!after && <HelenThingsToDo trip={trip} onOpenActivities={onOpenActivities} />}
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

// CO-PLANNER — Helen plans too (the locked "Helen = full co-planner" decision).
// Opens the Claude planning chat. Used on the stay home (the road-trip chrome is
// shed there); the route/after layout renders the same card inline (do-not-lose).
function HelenCoPlanner({ onOpenClaude }) {
  if (!onOpenClaude) return null
  return (
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
  )
}

// THINGS TO DO — the activities entry. On a stay the "We could" tab also hosts
// this; the entry is kept reachable in-view (the share-in flow opens it here).
function HelenThingsToDo({ trip, onOpenActivities }) {
  if (!(hasActivitiesForTrip(trip.id) && onOpenActivities)) return null
  return (
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
  )
}
