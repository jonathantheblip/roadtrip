import { hasActivitiesForTrip, getActivitiesForTrip } from '../data/sideActivities'
import { PhotoTile, PhotoLightbox } from '../components/PhotoAlbum'
import { TRAVELER_DOT } from '../data/travelers'
import { LivingHeartHome } from './LivingHeartHome'
import { LookBackStrip } from '../components/LookBackStrip'
import { tripPhase } from '../lib/tripPhase'

// Jonathan — Ops. Broadsheet mission-control (redesign increment 1,
// design handoff jonathan.jsx). Two modes off one masthead toggle:
//   OPS    — day tabs, editorial headline, live ticker, Risk Watch,
//            the plan, the flight, quick-log/Queue.
//   RECORD — "the family picture desk": the trip's real photos as a
//            lead frame + grid (reuses PhotoTile/PhotoLightbox).
// Tokens are jonathan's themes.css block (clay accent, hard 2px, mono
// micro-labels). All content is REAL trip data — nothing here is the
// prototype's static NY copy. Where the prototype faked a feature
// (the Risk Watch cascade *recompute*; a dispatch composer; the Weave),
// this surface wires the real signal we actually have or defers to a
// later increment, per the working agreement (the UI only promises
// what the plumbing delivers).

// Jonathan's masthead identity dot, now sourced from the shared canonical
// TRAVELER_DOT (cross-cutting identity-color consolidation, 2026-06-05) —
// no longer a local literal. Same value (#2E6BB8 = the design dot).
const JONATHAN_DOT = TRAVELER_DOT.jonathan

const ORDINALS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

// Mono micro-label — uppercase, tracked, tiny. The newsroom voice.
function JLabel({ children, color, weight = 500, size = 9.5, style }) {
  return (
    <span
      style={{
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: size,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        fontWeight: weight,
        color: color || 'inherit',
        ...style,
      }}
    >
      {children}
    </span>
  )
}


export function JonathanView({
  trip,
  traveler,
  pastTrips,
  onPlayPastTrip,
  onOpenStop,
  onOpenSettings,
  onOpenActivities,
  onOpenPhotos,
  onOpenAllPhotos,
  onOpenMap,
  onOpenWeave,
  onOpenReplay,
  onOpenBook,
  onOpenSurprises,
  onCompose,
  weaveReady,
  bookHasPages,
  surpriseRevealCue,
  nowReadout,
  whoAround,
}) {
  // ONE home for EVERY phase (slice 4): the living heart is Jonathan's home during
  // AND after (its keepsake state) — it reads straight from props. The road-trip
  // broadsheet (JMasthead / JOps / JRecord) is retired.
  // After a trip ends, "Things to do" drops (nothing left to plan) — matching
  // Helen's and Aurelia's lenses, which already gate it the same way.
  const after = tripPhase(trip) === 'after'
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', paddingBottom: 120 }}>
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
        onOpenAllPhotos={onOpenAllPhotos}
        onOpenActivities={onOpenActivities}
        onOpenStop={onOpenStop}
      />
      <LookBackStrip trips={pastTrips} onPlay={onPlayPastTrip} />
      <JStayArchive trip={trip} after={after} onOpenPhotos={onOpenPhotos} onOpenAllPhotos={onOpenAllPhotos} onOpenActivities={onOpenActivities} />
    </div>
  )
}

// JStayArchive — Jonathan's quiet archive/affordance row on a STAY, where the
// broadsheet masthead + JOps are shed. Re-homes the photos-desk entry
// (jonathan-photos-entry — the photo-test harness clicks it), all-photos, and
// Things to do as mono "register" lines below the living heart. The 4-tab shell
// (Photos / We-could) also hosts these; this keeps them reachable in-view.
function JStayArchive({ trip, after, onOpenPhotos, onOpenAllPhotos, onOpenActivities }) {
  const showActs = !after && hasActivitiesForTrip(trip.id) && onOpenActivities
  const Line = ({ testid, onClick, kicker, title }) => (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 11, width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', borderLeft: '2px solid var(--accent)', borderRadius: 2, padding: '12px 13px', color: 'var(--text)' }}
    >
      <span style={{ minWidth: 0 }}>
        <JLabel color="var(--muted)" size={8.5}>{kicker}</JLabel>
        <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 15, marginTop: 3, color: 'var(--text)' }}>{title}</div>
      </span>
      <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 18, fontStyle: 'italic', color: 'var(--accent-text)', flexShrink: 0 }}>→</span>
    </button>
  )
  return (
    <div style={{ padding: '20px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {onOpenPhotos && <Line testid="jonathan-photos-entry" onClick={onOpenPhotos} kicker="The record" title="The family's photos" />}
      {onOpenAllPhotos && <Line testid="jonathan-all-photos-entry" onClick={onOpenAllPhotos} kicker="The archive" title="All photos — every trip" />}
      {showActs && <Line onClick={onOpenActivities} kicker={`${getActivitiesForTrip(trip.id, trip).length} options`} title="Things to do" />}
    </div>
  )
}

