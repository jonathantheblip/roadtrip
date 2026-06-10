// JonathanEntries — the entry-points "home band" for Jonathan, layered ABOVE
// his itinerary (the itinerary in JOps is untouched). Broadsheet control
// surface: feature REGISTERS with a clay tick + mono labels + hard corners.
// Phase-aware: DURING a trip "Now" leads (Map · Weave · Surprises) with the
// pinned NowBar; AFTER, it reflows to the keepsake (Replay hero + the Book).
//
// HONEST DATA (G6): the Weave register shows the real stored weave (title +
// opening); the cues fire off the real weaveReady / surpriseRevealCue; the Book
// line appears only when the trip has kept pages. Live readouts the plumbing
// doesn't yet surface (en-route ETA, armed-surprise counts, frame counts) are
// NOT faked — the registers carry their real label and open the real feature.
import { useEffect, useState } from 'react'
import { ChevronRight, Play, BookOpen, Map as MapIcon, Lock, Sparkles } from 'lucide-react'
import { fetchStoredWeave } from '../lib/weave'
import { WeaveReady, SurpriseReveal } from '../components/EntryCues'

const MONO = { fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.14em', whiteSpace: 'nowrap' }
const SERIF = { fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em', lineHeight: 1.06 }

function Mono({ c = 'var(--muted)', size = 9.5, weight = 600, children, style }) {
  return <span style={{ ...MONO, fontSize: size, fontWeight: weight, color: c, ...style }}>{children}</span>
}

function SectionLabel({ filled, children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '17px 0 9px' }}>
      <Mono c={filled ? 'var(--text)' : 'var(--muted)'} size={10} weight={700}>{filled ? '●' : '◦'} {children}</Mono>
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      {right && <Mono c="var(--muted)">{right}</Mono>}
    </div>
  )
}

// A clickable register: clay tick + content + chevron. The whole row opens the
// feature (no nested interactive elements — clean a11y).
function Register({ onClick, label, children, tall }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        display: 'flex', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 2, overflow: 'hidden',
        minHeight: tall ? 0 : 56, color: 'var(--text)', fontFamily: 'var(--font-body)', padding: 0,
      }}
    >
      <span style={{ width: 3, alignSelf: 'stretch', background: 'var(--accent)', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</span>
    </button>
  )
}

function ArchiveLine({ onClick, kicker, title, cta, icon }) {
  return (
    <button
      type="button" onClick={onClick} aria-label={`${kicker} — ${title}`}
      style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, borderTop: '1px solid var(--border)', padding: '11px 2px', color: 'var(--text)' }}
    >
      <span style={{ width: 30, height: 30, borderRadius: 2, border: '1px solid var(--line-bold, var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--muted)' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <Mono c="var(--muted)" size={8.5}>{kicker}</Mono>
        <div style={{ ...SERIF, fontSize: 15, marginTop: 2 }}>{title}</div>
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
        <Mono c="var(--accent-text)" size={8.5} weight={700}>{cta}</Mono>
        <ChevronRight size={11} style={{ color: 'var(--accent-text)' }} />
      </span>
    </button>
  )
}

export function JonathanEntries({
  trip, phase = 'during', weaveReady, surpriseRevealCue, bookHasPages,
  onOpenMap, onOpenWeave, onOpenReplay, onOpenBook, onOpenSurprises,
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
    <div data-testid="jonathan-entries" style={{ padding: '4px 20px 0' }}>
      {after ? (
        <>
          <SectionLabel filled right="The keepsake">Looking back</SectionLabel>
          {/* Replay hero — the after-trip front door */}
          <button
            type="button" onClick={onOpenReplay} aria-label="Replay the trip"
            data-testid="entries-replay-hero"
            style={{ position: 'relative', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: 2, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--card)', padding: 0, color: 'var(--text)' }}
          >
            <div style={{ aspectRatio: '1.55', background: 'linear-gradient(160deg, var(--bg2), var(--card))', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <span style={{ width: 54, height: 54, borderRadius: '50%', border: '1.5px solid var(--accent)', background: 'color-mix(in srgb, var(--bg) 60%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={20} style={{ color: 'var(--accent-text)', marginLeft: 2 }} />
              </span>
              <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12 }}>
                <Mono c="var(--accent-text)" size={9} weight={700}>Replay · the whole trip</Mono>
                <div style={{ ...SERIF, fontSize: 22, marginTop: 3 }}>{trip.title}</div>
              </div>
            </div>
          </button>
          <div style={{ marginTop: 4 }}>
            {bookHasPages && (
              <ArchiveLine onClick={onOpenBook} kicker="The Book · kept pages" title={`${trip.title}, bound`} cta="Open" icon={<BookOpen size={15} />} />
            )}
            <ArchiveLine onClick={onOpenReplay} kicker="Replay · by day" title="Day by day" cta="Play" icon={<Play size={14} style={{ color: 'var(--accent-text)' }} />} />
          </div>
          <div style={{ marginTop: 16, padding: '12px 14px', border: '1px dashed var(--line-bold, var(--border))', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
            <MapIcon size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>Live Map, the Weave &amp; Surprises stood down when the trip ended. They return on the next trip.</span>
          </div>
        </>
      ) : (
        <>
          <SectionLabel filled right="During the trip">Now</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Live Map */}
            <Register onClick={onOpenMap} label="Open the live map">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--live, var(--accent))' }} />
                  <Mono c="var(--accent-text)" weight={700}>Live · this trip</Mono>
                </span>
                <Mono c="var(--muted)">Live Map</Mono>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ ...SERIF, fontSize: 17 }}>Where we are now</div>
                <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
              </div>
            </Register>

            {/* The Weave */}
            <Register onClick={onOpenWeave} label="Read the Weave">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Mono c="var(--muted)">{weave ? 'Last night · woven' : "Today's page"}</Mono>
                {weaveReady && <WeaveReady traveler="jonathan" />}
              </div>
              <div style={{ ...SERIF, fontSize: 18 }}>{weave?.title || 'The Weave'}</div>
              {weave?.opening && (
                <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{weave.opening}</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Mono c="var(--accent-text)" weight={700}>Read the page</Mono>
                  <ChevronRight size={13} style={{ color: 'var(--accent-text)' }} />
                </span>
              </div>
            </Register>

            {/* Surprises */}
            <Register onClick={onOpenSurprises} label="Open Surprises">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <Lock size={13} style={{ color: 'var(--accent-text)' }} />
                  <Mono c="var(--accent-text)" weight={700}>Surprises</Mono>
                </span>
                {revealed ? <SurpriseReveal traveler="jonathan" /> : <Mono c="var(--muted)">Hidden &amp; revealed</Mono>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={13} style={{ color: 'var(--muted)' }} />
                  <span style={{ fontSize: 12.5, color: 'var(--text)' }}>Stage or manage a surprise</span>
                </span>
                <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
              </div>
            </Register>
          </div>

          <SectionLabel right="The archive">Looking back</SectionLabel>
          <ArchiveLine onClick={onOpenReplay} kicker="Replay · cinematic" title={`${trip.title}, in motion`} cta="Play" icon={<Play size={14} style={{ color: 'var(--accent-text)' }} />} />
          {bookHasPages && (
            <ArchiveLine onClick={onOpenBook} kicker="The Book · kept pages" title={`${trip.title}, bound`} cta="Open" icon={<BookOpen size={15} />} />
          )}
          {/* The pinned NowBar (the IA model's thumb-zone anchor) is HELD OUT
              pending Design's reconciliation with the existing FamilyDock — both
              want the bottom thumb zone. The Live Map register above already opens
              the map; the NowBar returns, in its resolved form, across all
              personas once Design answers (see RECONCILE_NOWBAR_DOCK.md). */}
        </>
      )}
    </div>
  )
}
