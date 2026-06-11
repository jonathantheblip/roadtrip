// AureliaEntries — the entry-points "home band" for Aurelia, layered ABOVE her
// existing photos/lens/timeline (all preserved). Film-roll: near-black, Instrument
// Serif italic, hot-pink used sparingly, grain + sprocket-hole frames. She's
// reminiscing-forward, so the grouping is INVERTED — Replay LEADS as her hero,
// the Weave + Book follow, and the only "Now" logistics (Live Map) shrink to a
// single quiet footnote. Surprises is reveal-ONLY for her (a cue, never a planner).
//
// DO-NOT-LOSE / no-dupe (§3): AureliaView already renders her personal letter
// AND the "find me in the roll" lens (aurelia-showme-entry) — this band does NOT
// repeat them. HONEST DATA (G6): real weave + cues + book-gating; no faked frame
// counts. The after-trip "share the roll" card is held until trip-level share-out.
import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { fetchStoredWeave } from '../lib/weave'
import { WeaveReady, SurpriseReveal } from '../components/EntryCues'

const ITAL = { fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--text)', lineHeight: 1.12 }
const LABEL = { fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', whiteSpace: 'nowrap' }

// A film strip edge (sprocket holes) — top or bottom.
function Sprockets({ pos }) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', [pos]: 3, left: 4, right: 4, height: 3, background: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.55) 0 3px, transparent 3px 8px)', borderRadius: 1, zIndex: 2 }} />
  )
}

export function AureliaEntries({
  trip, phase = 'during', weaveReady, surpriseRevealCue, bookHasPages,
  onOpenMap, onOpenWeave, onOpenReplay, onOpenBook,
}) {
  const [weave, setWeave] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetchStoredWeave(trip.id).then((w) => { if (!cancelled) setWeave(w) }).catch(() => {})
    return () => { cancelled = true }
  }, [trip.id])

  const after = phase === 'after'
  const revealed = surpriseRevealCue > 0

  return (
    <div data-testid="aurelia-entries" style={{ padding: '4px 20px 0' }}>
      {/* reveal-only — a quiet cue when something unlocked for her (no planner UI) */}
      {revealed && (
        <div data-testid="aurelia-reveal-note" style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <SurpriseReveal traveler="aurelia" />
        </div>
      )}

      {/* REPLAY — her hero, leads */}
      <button
        type="button" onClick={onOpenReplay} aria-label="Replay the trip" data-testid="aurelia-replay-hero"
        style={{ position: 'relative', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)', background: 'linear-gradient(160deg, #2A2230, var(--bg2))', padding: 0, color: 'var(--text)' }}
      >
        <div style={{ position: 'relative', aspectRatio: '2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sprockets pos="top" /><Sprockets pos="bottom" />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 70% at 50% 45%, transparent, rgba(0,0,0,0.45))' }} />
          <span style={{ width: 60, height: 60, borderRadius: '50%', border: '1.5px solid var(--accent)', background: 'rgba(11,10,12,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 26px color-mix(in srgb, var(--accent) 40%, transparent)', zIndex: 1 }}>
            <Play size={22} style={{ color: 'var(--accent-text)', marginLeft: 2 }} />
          </span>
          <div style={{ position: 'absolute', left: 14, bottom: 12, zIndex: 2 }}>
            <div style={{ ...LABEL, color: 'var(--accent-text)' }}>Replay</div>
            <div style={{ ...ITAL, fontSize: 26, marginTop: 2, color: '#fff' }}>{trip.title}, again</div>
          </div>
        </div>
      </button>

      {/* THE WEAVE — last night, woven */}
      <button
        type="button" onClick={onOpenWeave} aria-label="Read the Weave"
        style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 12, alignItems: 'stretch', background: 'var(--card)', borderRadius: 4, border: '1px solid var(--border)', padding: 12, marginTop: 12, cursor: 'pointer', color: 'var(--text)' }}
      >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...LABEL, color: 'var(--muted)' }}>Last night, woven</span>
            {weaveReady && <WeaveReady traveler="aurelia" />}
          </div>
          <div style={{ ...ITAL, fontSize: 21, marginTop: 7 }}>{weave?.title || 'The Weave'}</div>
          <div style={{ marginTop: 'auto', paddingTop: 9, ...LABEL, color: 'var(--muted)' }}>read the page →</div>
        </div>
      </button>

      {/* THE BOOK — her roll, kept (only once pages exist) */}
      {bookHasPages && (
        <button
          type="button" onClick={onOpenBook} aria-label="Open the book"
          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'var(--card)', borderRadius: 4, border: '1px solid var(--border)', padding: 12, marginTop: 12, cursor: 'pointer', color: 'var(--text)' }}
        >
          <div style={{ ...LABEL, color: 'var(--accent-text)' }}>The book</div>
          <div style={{ ...ITAL, fontSize: 18, marginTop: 3 }}>her roll, kept</div>
        </button>
      )}

      {/* NOW — the single quiet footnote (vanishes after the trip) */}
      {!after && (
        <button
          type="button" onClick={onOpenMap} aria-label="Open the live map"
          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 9, padding: '11px 2px', marginTop: 12, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text)' }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--live, var(--accent))' }} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--muted)' }}>where we are now</span>
          <span style={{ marginLeft: 'auto', ...LABEL, color: 'var(--muted)' }}>live map ›</span>
        </button>
      )}
    </div>
  )
}
