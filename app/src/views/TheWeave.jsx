import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, Heart, Check } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { TRAVELER_DOT } from '../data/travelers'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { fetchRoadRoute } from '../lib/driveRoute'
import { thumbUrl } from '../lib/thumbUrl'
import { selectWeaveDay, buildBeats, fetchWeaveNarrative } from '../lib/weave'

// Inject keyframes once for the reveal animation.
let _keyframesInjected = false
function ensureKeyframes() {
  if (_keyframesInjected || typeof document === 'undefined') return
  _keyframesInjected = true
  const s = document.createElement('style')
  s.textContent = `
    @keyframes weave-up {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `
  document.head.appendChild(s)
}

function Reveal({ children, delay = 0, style }) {
  useEffect(ensureKeyframes, [])
  return (
    <div
      style={{
        animation: `weave-up 0.45s cubic-bezier(0.22,1,0.36,1) both`,
        animationDelay: `${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// Static waveform bars — decorative visualiser for voice beats.
const WAVE_HEIGHTS = [8, 15, 11, 19, 14, 9, 17, 12, 20, 13, 7, 16, 10]

const VERB = {
  jonathan: { text: 'logged', photo: 'captured', voice: 'recorded', log: 'tracked' },
  helen:    { text: 'wrote',  photo: 'captured', voice: 'recorded' },
  aurelia:  { text: 'wrote',  photo: 'shot',     voice: 'recorded' },
  rafa:     { text: 'wrote',  photo: 'captured', voice: 'said'     },
}

function verbFor(who, kind) {
  return (VERB[who] || {})[kind] || 'contributed'
}

// ─── TheWeave ────────────────────────────────────────────────────────
//
// Full-screen overlay. Assembles a day's family contributions into one
// woven page — one beat per person, in their own lens — framed by a
// Claude-generated title + opening + closing.
//
// Props: trip (active trip), trips (all trips), traveler, onBack
export function TheWeave({ trip, trips, traveler, onBack }) {
  const [state, setState] = useState('loading') // loading | ready | empty | error
  const [weavedDay, setWeavedDay] = useState(null)   // { trip, day }
  const [beats, setBeats] = useState([])
  const [narrative, setNarrative] = useState(null)   // { title, opening, closing } | null
  const [stat, setStat] = useState(null)             // "Day N · X mi · Y stops" | null
  const [kept, setKept] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      // 1. Pick a day.
      const allTrips = trips || (trip ? [trip] : [])
      const picked = selectWeaveDay(allTrips, traveler)
      if (!picked) {
        if (!cancelled) setState('empty')
        return
      }

      // 2. Load memories for that day.
      const mems = listMemoriesForTrip(picked.trip.id, traveler)
      const dayBeats = buildBeats(picked.trip, picked.day, mems)
      if (!dayBeats.length) {
        if (!cancelled) setState('empty')
        return
      }

      if (cancelled) return

      setWeavedDay(picked)
      setBeats(dayBeats)
      setState('ready')

      // 3. Travel stat + narrative in parallel (degrade gracefully on failure).
      const dayStops = (picked.day.stops || [])

      const [routeResult, narrativeResult] = await Promise.allSettled([
        fetchRoadRoute(dayStops),
        fetchWeaveNarrative(dayBeats, null),
      ])

      if (cancelled) return

      // Format travel stat.
      const route = routeResult.status === 'fulfilled' ? routeResult.value : null
      if (route?.miles) {
        const statStr = `Day ${picked.day.n} · ${Math.round(route.miles)} mi · ${dayStops.length} stop${dayStops.length !== 1 ? 's' : ''}`
        setStat(statStr)
        // Re-request narrative with the real stat now that we have it.
        const withStat = await fetchWeaveNarrative(dayBeats, statStr).catch(() => null)
        if (!cancelled && withStat) {
          setNarrative(withStat)
          return
        }
      }

      if (!cancelled) {
        setNarrative(narrativeResult.status === 'fulfilled' ? narrativeResult.value : null)
      }
    }

    load()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Empty / loading states ──────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div
        data-testid="the-weave"
        style={{
          position: 'fixed', inset: 0,
          background: 'var(--bg)', color: 'var(--text)',
          zIndex: 60, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
          fontFamily: 'var(--font-body)',
        }}
      >
        <TopBar onBack={onBack} label="Tonight, woven" />
        <div style={{ display: 'flex', gap: 8, marginTop: 80 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--accent)',
                animation: `weave-up 0.7s ease-in-out ${i * 0.15}s infinite alternate`,
              }}
            />
          ))}
        </div>
        <style>{`@keyframes weave-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}</style>
      </div>
    )
  }

  if (state === 'empty') {
    return (
      <div
        data-testid="the-weave"
        style={{
          position: 'fixed', inset: 0,
          background: 'var(--bg)', color: 'var(--text)',
          zIndex: 60, display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--font-body)',
        }}
      >
        <TopBar onBack={onBack} label="Tonight, woven" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontStyle: 'italic', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
            No memories yet. Add a note, photo, or voice clip on a stop to see it woven here.
          </p>
        </div>
      </div>
    )
  }

  const { day } = weavedDay
  const dayLabel = day.date || `Day ${day.n}`

  // ── Ready ───────────────────────────────────────────────────────────
  return (
    <div
      data-testid="the-weave"
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--bg)', color: 'var(--text)',
        zIndex: 60, display: 'flex', flexDirection: 'column',
        fontFamily: 'var(--font-body)',
      }}
    >
      <TopBar onBack={onBack} label="Tonight, woven" />

      {/* scrollable body */}
      <div
        ref={scrollRef}
        data-testid="weave-scroll"
        style={{ flex: 1, overflowY: 'auto', padding: '4px 22px 48px' }}
      >
        {/* opening — day label + Claude title + opening line */}
        <Reveal delay={0}>
          <div style={{ paddingTop: 12, paddingBottom: 4 }}>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: 'var(--accent-text)',
                fontWeight: 600,
              }}
            >
              {dayLabel} · woven
            </div>
            <div
              data-testid="weave-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: traveler === 'rafa' ? 30 : 36,
                fontWeight: traveler === 'rafa' ? 700 : 600,
                fontStyle: traveler === 'aurelia' ? 'italic' : 'normal',
                letterSpacing: -0.5, lineHeight: 1.06, marginTop: 8,
              }}
            >
              {narrative?.title || day.title || dayLabel}
            </div>
            {narrative?.opening && (
              <div
                data-testid="weave-opening"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 15,
                  fontStyle: traveler === 'rafa' ? 'normal' : 'italic',
                  color: 'var(--muted)', marginTop: 10, lineHeight: 1.55,
                }}
              >
                {narrative.opening}
              </div>
            )}
            {!narrative?.opening && (
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontStyle: 'italic', color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
                Four people. One day. The app stitched what each of you noticed into a single page.
              </div>
            )}
          </div>
        </Reveal>

        {/* the braid */}
        <div style={{ marginTop: 4 }}>
          {beats.map((beat, i) => (
            <Reveal key={beat.who} delay={120 + i * 110}>
              <BeatBlock beat={beat} traveler={traveler} isLast={i === beats.length - 1} />
            </Reveal>
          ))}
        </div>

        {/* closing */}
        <Reveal delay={120 + beats.length * 110}>
          <div
            style={{
              marginTop: 28, paddingTop: 20,
              borderTop: '1px solid var(--border)',
              textAlign: 'center',
            }}
          >
            {narrative?.closing && (
              <div
                data-testid="weave-closing"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: traveler === 'rafa' ? 20 : 22,
                  fontWeight: traveler === 'rafa' ? 700 : 600,
                  fontStyle: traveler === 'aurelia' ? 'italic' : 'normal',
                  marginBottom: 12,
                }}
              >
                {narrative.closing}
              </div>
            )}
            {stat && (
              <div
                data-testid="weave-stat"
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 9.5, letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  marginBottom: 18,
                }}
              >
                {stat}
              </div>
            )}
            <button
              data-testid="weave-keep"
              onClick={() => setKept(true)}
              disabled={kept}
              style={{
                padding: '13px 22px',
                borderRadius: 999,
                border: `1px solid ${kept ? 'var(--border)' : 'var(--line-bold)'}`,
                cursor: kept ? 'default' : 'pointer',
                background: 'transparent',
                color: kept ? 'var(--good)' : 'var(--text)',
                fontFamily: 'var(--font-body)',
                fontWeight: 600, fontSize: 14,
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}
            >
              {kept
                ? <><Check size={15} /> In the book</>
                : <><Heart size={15} /> Keep this page</>}
            </button>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 9, letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginTop: 14,
              }}
            >
              Auto-woven every night
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}

// ── TopBar ───────────────────────────────────────────────────────────
function TopBar({ onBack, label }) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
      }}
    >
      <button
        onClick={onBack}
        aria-label="Close weave"
        style={{
          background: 'transparent', border: 'none',
          cursor: 'pointer', color: 'var(--text)', padding: 4,
        }}
      >
        <ChevronLeft size={22} />
      </button>
      <div
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, letterSpacing: '0.15em',
          textTransform: 'uppercase', color: 'var(--muted)',
        }}
      >
        {label}
      </div>
      {/* right slot kept empty — save button is slice 2 (mp4 keepsake) */}
      <div style={{ width: 30 }} />
    </div>
  )
}

// ── BeatBlock ────────────────────────────────────────────────────────
// One person's contribution in the braid.
function BeatBlock({ beat, traveler, isLast }) {
  const { who, kind, snippet, memory } = beat
  const dot = TRAVELER_DOT[who] || '#777'
  const verb = verbFor(who, kind)
  const isSelf = who === traveler

  return (
    <div style={{ position: 'relative', paddingLeft: 30, paddingTop: 22 }}>
      {/* vertical rail — extends to bottom unless last */}
      {!isLast && (
        <div
          style={{
            position: 'absolute', left: 9, top: 0, bottom: -2,
            width: 1.5, background: 'var(--border)',
          }}
        />
      )}
      {/* dot on the rail */}
      <div
        style={{
          position: 'absolute', left: 0, top: 26,
          width: 20, height: 20, borderRadius: '50%',
          background: 'var(--bg)',
          border: `1.5px solid ${dot}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, display: 'block' }} />
      </div>

      {/* avatar + verb label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <Avatar id={who} size={22} />
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9.5, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--muted)',
          }}
        >
          {verb}
        </span>
        {isSelf && (
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 8, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--accent-text)',
              opacity: 0.7,
            }}
          >
            you
          </span>
        )}
      </div>

      {/* content by kind */}
      {(kind === 'text' || kind === 'log') && (
        <TextBeat snippet={snippet} traveler={traveler} />
      )}
      {kind === 'photo' && (
        <PhotoBeat memory={memory} snippet={snippet} dot={dot} traveler={traveler} />
      )}
      {kind === 'voice' && (
        <VoiceBeat memory={memory} snippet={snippet} dot={dot} traveler={traveler} />
      )}
    </div>
  )
}

// ── Beat renderers ───────────────────────────────────────────────────
function TextBeat({ snippet, traveler }) {
  return (
    <div
      data-testid="beat-text"
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: 17,
        fontStyle: traveler === 'aurelia' ? 'italic' : 'italic',
        lineHeight: 1.55, color: 'var(--text)',
        textWrap: 'pretty',
      }}
    >
      "{snippet}"
    </div>
  )
}

function PhotoBeat({ memory, snippet, dot, traveler }) {
  const photoRef = memory?.photoRefs?.[0] || memory?.photoRef
  const src = photoRef ? thumbUrl(photoRef?.url, 320) : null

  return (
    <div data-testid="beat-photo">
      {src ? (
        <div
          style={{
            borderRadius: `min(var(--radius, 4px), 14px)`,
            overflow: 'hidden',
            maxWidth: 280, position: 'relative',
          }}
        >
          <img
            src={src}
            alt={snippet || ''}
            style={{ width: '100%', display: 'block', aspectRatio: '4/5', objectFit: 'cover' }}
            loading="lazy"
          />
          {snippet && (
            <div
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                padding: '24px 14px 12px',
                background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 16, fontStyle: 'italic', color: '#fff',
                }}
              >
                {snippet}
              </div>
            </div>
          )}
        </div>
      ) : (
        // No photo URL yet — show a tinted placeholder with caption.
        <div
          style={{
            borderRadius: `min(var(--radius, 4px), 14px)`,
            overflow: 'hidden',
            maxWidth: 280, aspectRatio: '4/5',
            background: `color-mix(in srgb, ${dot} 20%, var(--card))`,
            display: 'flex', alignItems: 'flex-end', padding: '16px 14px',
          }}
        >
          {snippet && (
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 16, fontStyle: 'italic', color: 'var(--text)',
              }}
            >
              {snippet}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function VoiceBeat({ memory, snippet, dot, traveler }) {
  const dur = memory?.durationSeconds
  return (
    <div data-testid="beat-voice">
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px',
          background: 'var(--bg2)',
          borderRadius: 999, maxWidth: 260,
        }}
      >
        {/* play button */}
        <div
          style={{
            width: 32, height: 32, borderRadius: '50%',
            background: dot,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {/* play triangle */}
          <svg width="11" height="13" viewBox="0 0 11 13" fill="none" aria-hidden="true">
            <path d="M0.5 0.5L10.5 6.5L0.5 12.5V0.5Z" fill="white" />
          </svg>
        </div>
        {/* waveform bars */}
        <div style={{ display: 'flex', gap: 2.5, alignItems: 'center', flex: 1, height: 22 }}>
          {WAVE_HEIGHTS.map((h, j) => (
            <div
              key={j}
              style={{
                width: 2.5, height: h, background: dot,
                opacity: 0.5, borderRadius: 2,
              }}
            />
          ))}
        </div>
        {dur != null && (
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9, color: 'var(--muted)',
            }}
          >
            {Math.floor(dur / 60)}:{String(dur % 60).padStart(2, '0')}
          </span>
        )}
      </div>
      {snippet && (
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontStyle: traveler === 'rafa' ? 'normal' : 'italic',
            color: 'var(--muted)', marginTop: 8, lineHeight: 1.5,
          }}
        >
          "{snippet}"
        </div>
      )}
    </div>
  )
}
