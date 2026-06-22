// HelenEntries — the entry-points "home band" for Helen, layered ABOVE her
// threaded timeline (the timeline is untouched). Warm editorial: soft white
// cards on warm paper, sage accents, Fraunces, radius 18. She plans AND keeps,
// so Surprises (create) and the keepsake trio (Weave/Book/Replay) are all
// first-class; the Weave card is her front door. Phase-aware: during a trip a
// "Now" stack + a "Keepsake" shelf; after, the keepsake rises to the front door.
//
// HONEST DATA (G6): real stored weave (title + opening) + the real cues +
// book-gating; the wrapped-surprise chips / counts the design shows are NOT
// faked — the Surprises card opens the real surface where they live. The
// after-trip "Share the trip" card is held until trip-level share-out exists
// (the per-memory share already ships; see share-out).
import { useEffect, useState } from 'react'
import { ChevronRight, Play, BookOpen, Plus } from 'lucide-react'
import { fetchStoredWeave } from '../lib/weave'
import { WeaveReady, SurpriseReveal } from '../components/EntryCues'

const SERIF = { fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em', lineHeight: 1.1 }
const EYEBROW = { fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }

function Eyebrow({ children, c = 'var(--accent-text)' }) {
  return <div style={{ ...EYEBROW, color: c }}>{children}</div>
}
function Divider({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '18px 0 11px' }}>
      <Eyebrow c="var(--text)">{children}</Eyebrow>
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      {right && <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--muted)' }}>{right}</span>}
    </div>
  )
}
function ReadCta({ children = 'Read the page' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--accent-text)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600 }}>
      {children}<ChevronRight size={14} />
    </span>
  )
}
// A soft white card that opens a feature (the whole card is the button).
// Forwards data-testid so callers can hook a specific card (e.g. the after-trip
// replay hero) — without it, the prop is silently dropped and the hook is dead.
function Card({ onClick, label, children, style, 'data-testid': testId }) {
  return (
    <button
      type="button" onClick={onClick} aria-label={label} data-testid={testId}
      style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow-card)', padding: 16, color: 'var(--text)', fontFamily: 'var(--font-body)', ...style }}
    >
      {children}
    </button>
  )
}

export function HelenEntries({
  trip, phase = 'during', weaveReady, surpriseRevealCue, bookHasPages, nowReadout, whoAround,
  onOpenMap, onOpenWeave, onOpenReplay, onOpenBook, onOpenSurprises, onCompose,
}) {
  const [weave, setWeave] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetchStoredWeave(trip.id).then((w) => { if (!cancelled) setWeave(w) }).catch(() => {})
    return () => { cancelled = true }
  }, [trip.id])

  const after = phase === 'after'
  const revealed = surpriseRevealCue > 0

  // The keepsake shelf (Book + Replay side by side). `showReplay` is false when
  // the shelf sits UNDER the after-trip Replay hero — otherwise the hero + this
  // tile are two identical "Replay the trip" cards on one screen.
  const buildShelf = (showReplay) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
      {bookHasPages ? (
        <Card onClick={onOpenBook} label="Open the book" style={{ flex: 1, padding: 0, overflow: 'hidden', minHeight: 150 }}>
          <div style={{ height: 92, background: 'linear-gradient(150deg, color-mix(in srgb, var(--accent) 80%, #fff), var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 50, height: 64, background: 'var(--card)', borderRadius: '2px 5px 5px 2px', boxShadow: '0 6px 16px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11, color: 'var(--accent-text)' }}>{trip.title?.split(' ')[0] || 'Trip'}</div>
          </div>
          <div style={{ padding: '11px 13px' }}>
            <Eyebrow>The book</Eyebrow>
            <div style={{ ...SERIF, fontSize: 15, marginTop: 4 }}>Open the book</div>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--muted)' }}>Export as a reel</span>
          </div>
        </Card>
      ) : (
        <div style={{ flex: 1, borderRadius: 18, border: '1.5px dashed var(--line-bold, var(--border))', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, minHeight: 150 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'color-mix(in srgb, var(--accent) 14%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BookOpen size={18} style={{ color: 'var(--accent-text)' }} /></div>
          <div style={{ ...SERIF, fontSize: 16 }}>The book starts with one kept page.</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.45 }}>Keep a Weave page and it&rsquo;s bound here.</div>
        </div>
      )}
      {showReplay && (
        <Card onClick={onOpenReplay} label="Replay the trip" style={{ flex: 1, padding: 0, overflow: 'hidden', minHeight: 150 }}>
          <div style={{ height: 96, background: 'linear-gradient(160deg, var(--bg2), var(--card))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}><Play size={17} style={{ color: 'var(--accent-text)', marginLeft: 2 }} /></span>
          </div>
          <div style={{ padding: '11px 13px' }}>
            <Eyebrow c="var(--muted)">Looking back&hellip;</Eyebrow>
            <div style={{ ...SERIF, fontSize: 15, marginTop: 4 }}>Replay the trip</div>
          </div>
        </Card>
      )}
    </div>
  )

  return (
    <div data-testid="helen-entries" style={{ padding: '4px 20px 0' }}>
      {after ? (
        <>
          <Divider right={trip.title}>Keepsake</Divider>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Replay hero — the after-trip front door */}
            <Card onClick={onOpenReplay} label="Replay the trip" data-testid="helen-replay-hero" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ position: 'relative', aspectRatio: '1.55', background: 'linear-gradient(160deg, var(--bg2), var(--card))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 5px 16px rgba(0,0,0,0.2)' }}><Play size={19} style={{ color: 'var(--accent-text)', marginLeft: 2 }} /></span>
                <div style={{ position: 'absolute', left: 16, right: 16, bottom: 13 }}>
                  <Eyebrow c="var(--muted)">Replay · the whole trip</Eyebrow>
                  <div style={{ ...SERIF, fontSize: 21, marginTop: 3 }}>{trip.title}, in full</div>
                </div>
              </div>
            </Card>
            {buildShelf(false) /* hero above already IS the replay entry */}
          </div>
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>The live map &amp; nightly Weave rest until your next trip.</span>
          </div>
        </>
      ) : (
        <>
          {revealed && (
            <div data-testid="helen-reveal-note" style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 4, padding: '10px 12px', borderRadius: 14, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)' }}>
              <SurpriseReveal traveler="helen" />
            </div>
          )}

          <Divider right="During the trip">Now</Divider>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* The Weave — her front door */}
            <Card onClick={onOpenWeave} label="Read the Weave" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Eyebrow>{weave ? 'Last night, woven' : "Today's page"}</Eyebrow>
                  {weaveReady && <WeaveReady traveler="helen" />}
                </div>
                <div style={{ ...SERIF, fontSize: 22 }}>{weave?.title || 'The Weave'}</div>
                {weave?.opening && (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{weave.opening}</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 13 }}>
                  <ReadCta />
                </div>
              </div>
            </Card>

            {/* Live Map — "where we are now". On a stay the dock is gone, so this
                carries the live "At [place] · next" readout itself; on a route the
                dock shows it → the generic "Open the map" stands. */}
            <Card onClick={onOpenMap} label="Open the live map">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--live, var(--accent))' }} />
                    <Eyebrow>Where we are now</Eyebrow>
                  </span>
                  <div style={{ ...SERIF, fontSize: 16, marginTop: 5 }}>{nowReadout?.now || 'Open the map'}</div>
                  {nowReadout?.next && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Next · {nowReadout.next}
                    </div>
                  )}
                </div>
                <ReadCta>Open map</ReadCta>
              </div>
            </Card>

            {/* Who's around — live family presence (slice 8), right under the live readout */}
            {whoAround}

            {/* Surprises — her planner card */}
            <Card onClick={onOpenSurprises} label="Plan or manage a surprise">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Eyebrow>You&rsquo;re keeping</Eyebrow>
                {revealed && <SurpriseReveal traveler="helen" />}
              </div>
              <div style={{ ...SERIF, fontSize: 16, marginTop: 6 }}>Plan a surprise</div>
              <div style={{ marginTop: 11, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 12, padding: 11, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600 }}>
                <Plus size={15} /> Wrap something
              </div>
            </Card>

            {/* Share a moment — compose one and send it to the family (the
                designed home for what used to live only in the ⋯ menu). */}
            {onCompose && (
              <Card onClick={onCompose} label="Share a moment">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <Eyebrow c="var(--muted)">Send one out</Eyebrow>
                    <div style={{ ...SERIF, fontSize: 16, marginTop: 5 }}>Share a moment</div>
                  </div>
                  <ReadCta>Compose</ReadCta>
                </div>
              </Card>
            )}
          </div>

          <Divider right="Looking back">Keepsake</Divider>
          {buildShelf(true) /* during: no hero, so the shelf carries replay */}
        </>
      )}
    </div>
  )
}
