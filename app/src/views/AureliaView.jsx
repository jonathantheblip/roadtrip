import { hasActivitiesForTrip, getActivitiesForTrip } from '../data/sideActivities'
import { LivingHeartHome } from './LivingHeartHome'
import { LookBackStrip } from '../components/LookBackStrip'
import { tripPhase } from '../lib/tripPhase'

// Aurelia — "Her roll." Redesign increment 3 (2026-06-05): the big
// LIGHT→DARK inversion. Was a rose-paper scrapbook; now a near-black
// film-roll editorial — Instrument Serif italic display (self-hosted),
// hot-pink accent, grained photo frames with a film-sprocket edge.
// Same data + behaviors as before: the "note from Dad" letter (kept as a
// cream-paper artifact slipped into the dark roll), both photos entries,
// the postcard memories, the composer, things-to-do, day nav.

// Instrument Serif (self-hosted, see styles/platform.css @font-face) is
// Aurelia's display face. The cream "note from Dad" letter keeps Fraunces
// on purpose — it reads as a real typeset letter, not app chrome.
const SERIF = "'Instrument Serif', 'Times New Roman', Georgia, serif"

export function AureliaView({ trip, traveler, pastTrips, onPlayPastTrip, onOpenStop, onOpenActivities, onOpenPhotos, onOpenAllPhotos, onShowMe, onOpenSettings, onOpenMap, onOpenWeave, onOpenReplay, onOpenBook, onCompose, onOpenEditor, weaveReady, bookHasPages, surpriseRevealCue, nowReadout, whoAround }) {
  // ONE home for EVERY phase (slice 4): the living heart is Aurelia's home during AND
  // after (its keepsake state) — it reads straight from props. Her film-roll keepsake
  // is retired; her "note from Dad" + photos/show-me entries stay; Things-to-do drops after.
  const after = tripPhase(trip) === 'after'
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', paddingBottom: 120, position: 'relative' }}>
      {trip.travelerNotes?.aurelia && (
        <div style={{ padding: 'calc(env(safe-area-inset-top) + 60px) 14px 6px' }}>
          <PersonalLetter note={trip.travelerNotes.aurelia} />
        </div>
      )}
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
        onCompose={onCompose}
        onOpenEditor={onOpenEditor}
        onOpenAllPhotos={onOpenAllPhotos}
        onOpenActivities={onOpenActivities}
        onOpenStop={onOpenStop}
      />
      <LookBackStrip trips={pastTrips} onPlay={onPlayPastTrip} />
      <AureliaPhotosBlock trip={trip} onOpenPhotos={onOpenPhotos} onOpenAllPhotos={onOpenAllPhotos} onShowMe={onShowMe} />
      {!after && <AureliaThingsToDo trip={trip} onOpenActivities={onOpenActivities} />}
    </div>
  )

}

// A grained, film-edged frame: dark photographic gradient + sprocket
// strip down the left + a bottom scrim so overlaid text stays legible.
// Used for the hero photo-album entry; children render over the scrim.
function FilmFrame({ tint, height, children }) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        overflow: 'hidden',
        background: `linear-gradient(150deg, ${shade(tint, 22)}, ${tint} 48%, ${shade(tint, -20)})`,
      }}
    >
      {/* film sprocket edge */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 14,
          background:
            'repeating-linear-gradient(180deg, #0a0a0a 0 9px, rgba(255,255,255,0.16) 9px 13px)',
        }}
      />
      {/* bottom scrim */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.82))',
        }}
      />
      {children}
    </div>
  )
}

// A trip-level letter from one traveler to another, surfaced inside the
// recipient's themed view. Kept as warm cream paper even on Aurelia's
// dark roll (Jonathan's call, 2026-06-05) — it reads as a real letter
// slipped into the roll. Only the pink tape/label follow the new accent.
function PersonalLetter({ note }) {
  const paragraphs = Array.isArray(note?.body) ? note.body : [note?.body || '']
  return (
    <article
      style={{
        position: 'relative',
        background: '#FBF5EC',
        color: '#3D2424',
        borderRadius: 4,
        padding: '34px 24px 26px',
        boxShadow:
          '0 16px 38px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.3)',
        transform: 'rotate(-1.2deg)',
        border: '1px solid rgba(150, 100, 80, 0.10)',
        marginTop: 8,
      }}
    >
      {/* Pink paper tape across the top — picks up Aurelia's hot-pink
          accent so the card visually belongs to her surface even though
          the paper itself is the warmer cream of a real letter. */}
      <div
        style={{
          position: 'absolute',
          top: -10,
          left: '50%',
          transform: 'translateX(-50%) rotate(2.2deg)',
          width: 96,
          height: 22,
          background: 'rgba(255, 61, 120, 0.26)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      />

      <div
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#C03671',
          fontWeight: 700,
          marginBottom: 14,
        }}
      >
        ✉ A note from {note.from}
      </div>

      {note.salutation && (
        <div
          style={{
            fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
            fontSize: 19,
            fontStyle: 'italic',
            fontWeight: 500,
            marginBottom: 14,
            color: '#2A1818',
          }}
        >
          {note.salutation}
        </div>
      )}

      <div
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 15,
          lineHeight: 1.62,
          fontStyle: 'italic',
          color: '#3D2424',
        }}
      >
        {paragraphs.map((p, i) => (
          <p
            key={i}
            style={{ margin: i === 0 ? 0 : '14px 0 0', padding: 0 }}
          >
            {p}
          </p>
        ))}
      </div>

      {(note.closing || note.signature) && (
        <div style={{ marginTop: 22, paddingLeft: 4 }}>
          {note.closing && (
            <div
              style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 15,
                fontStyle: 'italic',
                color: '#3D2424',
              }}
            >
              {note.closing}
            </div>
          )}
          {note.signature && (
            <div
              style={{
                fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
                fontSize: 30,
                fontStyle: 'italic',
                fontWeight: 700,
                color: '#2A1818',
                marginTop: 4,
                letterSpacing: '-0.01em',
              }}
            >
              {note.signature}
            </div>
          )}
        </div>
      )}
    </article>
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

// Hand-rolled "felt {mood}" classifier from the memory's words. Cheap
// keyword bucket for v1; easy to swap for a sentiment model later.

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) + pct
  let g = ((n >> 8) & 0xff) + pct
  let b = (n & 0xff) + pct
  r = Math.max(0, Math.min(255, r))
  g = Math.max(0, Math.min(255, g))
  b = Math.max(0, Math.min(255, b))
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}


// AureliaPhotosBlock — her photos entries (the grained film-frame album CTA,
// all-trips, and the "Show me, me" face recognizer). Used on the stay home,
// where the postcard roll + day list are shed; the route/after layout renders
// the same JSX inline (do-not-lose, kept identical).
function AureliaPhotosBlock({ onOpenPhotos, onOpenAllPhotos, onShowMe }) {
  if (!onOpenPhotos) return null
  return (
    <div style={{ padding: '12px 18px 0' }}>
      <button
        type="button"
        data-testid="aurelia-photos-entry"
        onClick={onOpenPhotos}
        style={{ width: '100%', padding: 0, borderRadius: 'var(--radius)', border: '1px solid var(--line-bold)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', textAlign: 'left', position: 'relative', overflow: 'hidden' }}
      >
        <FilmFrame tint="#5C4A52" height={132}>
          <div style={{ position: 'relative', padding: '0 18px 16px 26px' }}>
            <Eyebrow color="var(--accent-text)">★ THE PHOTO ALBUM</Eyebrow>
            <div style={{ fontFamily: SERIF, fontSize: 26, fontStyle: 'italic', color: '#fff', marginTop: 4, lineHeight: 1.05 }}>every frame, this trip →</div>
          </div>
        </FilmFrame>
      </button>
      {onOpenAllPhotos && (
        <button
          type="button"
          data-testid="aurelia-all-photos-entry"
          onClick={onOpenAllPhotos}
          style={{ width: '100%', padding: '9px 14px', marginTop: 8, borderRadius: 'var(--radius)', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent-text)', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span style={{ fontFamily: SERIF, fontSize: 15, fontStyle: 'italic', fontWeight: 400 }}>✨ Every trip&rsquo;s photos</span>
          <span style={{ fontSize: 14 }}>→</span>
        </button>
      )}
      {onShowMe && (
        <button
          type="button"
          data-testid="aurelia-showme-entry"
          onClick={() => onShowMe('aurelia')}
          style={{ width: '100%', padding: '9px 14px', marginTop: 8, borderRadius: 'var(--radius)', border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--accent-ink)', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span style={{ fontFamily: SERIF, fontSize: 15, fontStyle: 'italic', fontWeight: 400 }}>📸 Show me, me — by face</span>
          <span style={{ fontSize: 14 }}>→</span>
        </button>
      )}
    </div>
  )
}

// AureliaThingsToDo — the activities pill. On a stay the "We could" tab also
// hosts this; kept reachable in-view.
function AureliaThingsToDo({ trip, onOpenActivities }) {
  if (!(hasActivitiesForTrip(trip.id) && onOpenActivities)) return null
  return (
    <div style={{ padding: '8px 18px 0' }}>
      <button
        type="button"
        onClick={onOpenActivities}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent-text)', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontFamily: SERIF, fontSize: 15, fontStyle: 'italic', fontWeight: 400 }}>✨ {getActivitiesForTrip(trip.id, trip).length} things to do</span>
        <span style={{ fontSize: 16 }}>→</span>
      </button>
    </div>
  )
}
