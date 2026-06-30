import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, Heart, Check, Share } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { TRAVELER_DOT } from '../data/travelers'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { loadAsset } from '../lib/memAssets'
import { refIdbAssetKey } from '../lib/photoEntries'
import { fetchRoadRoute } from '../lib/driveRoute'
import { thumbUrl } from '../lib/thumbUrl'
import { selectWeaveDay, selectWeaveDayForTrip, buildBeats, fetchWeaveNarrative, fetchStoredWeave, markWeaveSeen, keepWeave, isKeepableNarrative } from '../lib/weave'
import { encodeWeavePage, shareWeave, isVideoEncodeSupported } from '../lib/weaveEncode'

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

// Hydrate offline pending/idb photo refs from the idb asset store so an
// offline-imported photo shows its REAL picture in the woven page (and in the
// "Save to Photos" video keepsake) after an offline relaunch — both read
// ref.url, which is a dead session blob: post-reload. Mirrors the album
// hydration but runs once here over the day's memories before buildBeats, so
// every downstream consumer (PhotoBeat on screen + weaveRenderer in the encode)
// receives a live url. A video ref's renderable still is its poster (loaded via
// refIdbAssetKey), painted as the beat image. r2/external refs are untouched.
async function hydrateWeaveMemories(memories) {
  return Promise.all(
    (memories || []).map(async (m) => {
      let next = m
      const patch = async (ref) => {
        const key = refIdbAssetKey(ref)
        if (!key) return ref
        const blob = await loadAsset('photo', key).catch(() => null)
        if (!blob) return ref
        return { ...ref, url: URL.createObjectURL(blob) }
      }
      if (m?.photoRef && refIdbAssetKey(m.photoRef)) {
        next = { ...next, photoRef: await patch(m.photoRef) }
      }
      if (Array.isArray(m?.photoRefs) && m.photoRefs.some((r) => refIdbAssetKey(r))) {
        next = { ...next, photoRefs: await Promise.all(m.photoRefs.map((r) => (r ? patch(r) : r))) }
      }
      return next
    })
  )
}

// ─── TheWeave ────────────────────────────────────────────────────────
//
// Full-screen overlay. Assembles a day's family contributions into one
// woven page — one beat per person, in their own lens — framed by a
// Claude-generated title + opening + closing.
//
// Props: trip (active trip), trips (all trips), traveler, onBack
export function TheWeave({ trip, trips, traveler, onBack, forceDayIso, initialKept = false }) {
  const [state, setState] = useState('loading') // loading | ready | empty | error
  const [weavedDay, setWeavedDay] = useState(null)   // { trip, day }
  const [beats, setBeats] = useState([])
  const [narrative, setNarrative] = useState(null)   // { title, opening, closing } | null
  const [stat, setStat] = useState(null)             // "Day N · X mi · Y stops" | null
  const [kept, setKept] = useState(initialKept)
  const [saveState, setSaveState] = useState('idle') // idle | encoding | sharing | shared
  // What shareWeave actually did: 'shared' (native share sheet — user chooses
  // Save to Photos / Messages / etc.) vs 'downloaded' (plain file download, NOT
  // a Photos save). Drives an HONEST confirmation instead of always claiming
  // "Saved to Photos".
  const [saveOutcome, setSaveOutcome] = useState(null)
  const scrollRef = useRef(null)
  const encodeAbortRef = useRef(null)

  // Cancel any in-flight encode when the overlay unmounts.
  useEffect(() => () => encodeAbortRef.current?.abort(), [])

  const videoSupported = isVideoEncodeSupported()

  async function saveToPhotos() {
    if (saveState !== 'idle') return
    encodeAbortRef.current = new AbortController()
    setSaveState('encoding')
    try {
      const blob = await encodeWeavePage({
        beats,
        narrative,
        stat,
        day: weavedDay?.day,
        traveler,
        onProgress: () => {},
        signal: encodeAbortRef.current.signal,
      })
      setSaveState('sharing')
      const outcome = await shareWeave(blob, narrative)
      setSaveOutcome(outcome) // 'shared' | 'downloaded'
      setSaveState('shared')
    } catch (err) {
      // AbortError = user dismissed share sheet or component unmounted — silent.
      const isAbort = err?.name === 'AbortError' || err?.message === 'aborted'
      if (!isAbort) console.warn('[weave] save failed:', err)
      setSaveState('idle')
    }
  }

  // A page can only join the shared book when its narrative is COMPLETE (the
  // worker's POST /weave/keep needs title + opening + closing). A page rendered
  // with only fallback framing (narrative === null) has NOTHING the book can
  // persist. Gate the Keep button on this: previously it flipped to "In the
  // book" while keepWeave silently wrote nothing, leaving the shared book empty
  // — a confirmation that lied. (Audit ROOT-5.) Shared predicate with keepWeave
  // so the UI gate and the write guard can never disagree.
  const keepable = isKeepableNarrative(narrative)

  // Keep this page → the trip's shared book. Optimistic: the button flips to
  // "In the book" immediately; persistence is fire-and-forget (keepWeave
  // swallows failures so an offline keep still reads as kept on this device).
  // The keepable gate above guarantees there's a real narrative to persist
  // before this can run, so the optimistic flip no longer over-promises.
  function keep() {
    if (kept || !keepable) return
    setKept(true)
    keepWeave({
      tripId: weavedDay?.trip?.id,
      dayIso: weavedDay?.day?.isoDate,
      narrative,
      stat,
      beats,
    })
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      // 1. Pick a day — a specific forced day (a book page), the open trip's
      //    own latest woven day, or (only when opened with NO trip context, e.g.
      //    a future index-level entry) the cross-trip discovery pick. Opening
      //    the Weave from inside a trip must show THAT trip's story, never a
      //    random page from another trip (selectWeaveDay's discovery fallback).
      let picked
      if (forceDayIso) {
        const day = (trip?.days || []).find((d) => d.isoDate === forceDayIso)
        picked = day ? { trip, day } : null
      } else if (trip) {
        picked = selectWeaveDayForTrip(trip, traveler)
      } else {
        picked = selectWeaveDay(trips || [], traveler)
      }
      if (!picked) {
        if (!cancelled) setState('empty')
        return
      }

      // 2. Load memories for that day, hydrating any offline pending/idb photo
      //    so the woven page (and its video keepsake) paint the real picture
      //    after an offline relaunch instead of a dead session blob: url.
      const mems = await hydrateWeaveMemories(
        listMemoriesForTrip(picked.trip.id, traveler)
      )
      if (cancelled) return
      const dayBeats = buildBeats(picked.trip, picked.day, mems)
      if (!dayBeats.length) {
        if (!cancelled) setState('empty')
        return
      }

      if (cancelled) return

      setWeavedDay(picked)
      setBeats(dayBeats)
      setState('ready')

      // 3. Narrative + travel stat. Try the PRE-MADE nightly weave first — if
      //    present it renders instantly with NO per-open Claude call. The real
      //    road-miles stat is computed locally either way (the stored stat is a
      //    lighter "Day N · K stops" fallback). No stored weave → build on
      //    demand (the original path), degrading gracefully on failure.
      const dayStops = (picked.day.stops || [])
      const stopsLabel = `${dayStops.length} stop${dayStops.length !== 1 ? 's' : ''}`

      const [storedResult, routeResult] = await Promise.allSettled([
        fetchStoredWeave(picked.trip.id, picked.day.isoDate),
        fetchRoadRoute(dayStops),
      ])
      if (cancelled) return

      // Road-miles only frame a day the family actually DROVE (a route trip).
      // On a stay/hangout day, "12 mi" reads as driving the family never did —
      // so the stat is just the day + its stops, no mileage. (family-trips, not
      // road-trip logic: a stat must not invent a drive.)
      const route = routeResult.status === 'fulfilled' ? routeResult.value : null
      const drove = (picked.trip?.shape || '') === 'route'
      // milesStat is the DRIVE-derived stat (null off a route) — kept separate so
      // a richer stored stat can still win when we have no drive miles. localStat
      // is the always-safe baseline shown immediately (stops only, no mileage).
      const milesStat = drove && route?.miles
        ? `Day ${picked.day.n} · ${Math.round(route.miles)} mi · ${stopsLabel}`
        : null
      const localStat = milesStat || `Day ${picked.day.n} · ${stopsLabel}`
      setStat(localStat)

      const stored = storedResult.status === 'fulfilled' ? storedResult.value : null
      if (stored?.title) {
        // Already woven last night — instant, no Claude call. Mark it seen on
        // this device so the ✦ "ready" cue clears.
        setNarrative({ title: stored.title, opening: stored.opening, closing: stored.closing })
        if (!milesStat && stored.stat) setStat(stored.stat)
        markWeaveSeen(picked.trip.id, stored.generatedAt)
        return
      }

      // Not pre-made — build the narrative on demand with the best stat we have.
      const onDemand = await fetchWeaveNarrative(dayBeats, milesStat).catch(() => null)
      if (!cancelled) setNarrative(onDemand)
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

  // Save button for the TopBar right slot (only if WebCodecs is available).
  const saveBtn = videoSupported ? (
    <button
      data-testid="weave-save-top"
      onClick={saveToPhotos}
      aria-label="Save to Photos"
      style={{
        background: 'transparent', border: 'none',
        cursor: saveState !== 'idle' ? 'default' : 'pointer',
        color: 'var(--accent-text)', padding: 4,
        display: 'flex', alignItems: 'center',
        opacity: saveState !== 'idle' ? 0.35 : 1,
      }}
    >
      <Share size={20} />
    </button>
  ) : <div style={{ width: 30 }} />

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
      <TopBar onBack={onBack} label="Tonight, woven" rightSlot={saveBtn} />

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
                One day, woven from what each of you noticed.
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
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {/* Only offer "Keep this page" when there's a complete narrative
                  to actually persist — see `keepable` above. Without it the keep
                  would no-op on the worker, so we hide the button rather than
                  show a control that lies about saving. */}
              {(keepable || kept) && (
                <button
                  data-testid="weave-keep"
                  onClick={keep}
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
              )}
              {videoSupported && (
                <button
                  data-testid="weave-save"
                  onClick={saveToPhotos}
                  disabled={saveState !== 'idle'}
                  style={{
                    padding: '13px 22px',
                    borderRadius: 999,
                    border: 'none',
                    cursor: saveState !== 'idle' ? 'default' : 'pointer',
                    background: 'var(--accent)',
                    color: 'var(--accent-ink)',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600, fontSize: 14,
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    opacity: saveState !== 'idle' ? 0.5 : 1,
                  }}
                >
                  <Share size={15} /> Save to Photos
                </button>
              )}
            </div>
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

      {/* ── Save progress modal ─────────────────────────────────── */}
      {saveState !== 'idle' && (
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 70, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: 30,
          }}
        >
          <div
            style={{
              width: '100%', maxWidth: 300,
              background: 'var(--card)',
              borderRadius: 22, padding: '24px 22px',
              textAlign: 'center',
              boxShadow: '0 30px 70px rgba(0,0,0,0.4)',
            }}
          >
            {/* Decorative thumbnail preview of the woven page */}
            <div
              style={{
                width: 132, margin: '0 auto',
                aspectRatio: '4/5', borderRadius: 12,
                overflow: 'hidden',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ padding: 12, textAlign: 'left' }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 6, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--accent-text)' }}>
                  {weavedDay?.day?.date || 'Tonight'} · woven
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, lineHeight: 1.1, marginTop: 4, color: 'var(--text)' }}>
                  {narrative?.title || weavedDay?.day?.title || 'Tonight, woven'}
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                  {['jonathan', 'helen', 'aurelia', 'rafa'].map((id) => (
                    <span key={id} style={{ width: 12, height: 12, borderRadius: '50%', background: TRAVELER_DOT[id], display: 'block' }} />
                  ))}
                </div>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ height: 3, borderRadius: 2, background: 'var(--border)', marginTop: 6, width: ['90%', '70%', '80%'][i] }} />
                ))}
              </div>
            </div>

            {(saveState === 'encoding' || saveState === 'sharing') && (
              <>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 18 }}>
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
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontStyle: 'italic', color: 'var(--muted)', marginTop: 12 }}>
                  Creating your weave…
                </div>
              </>
            )}

            {saveState === 'shared' && (
              <>
                <div style={{ width: 40, height: 40, borderRadius: '50%', margin: '16px auto 0', background: '#34C759', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={22} color="#fff" />
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, marginTop: 12, color: 'var(--text)' }}>
                  {/* Honest copy: the native share sheet path genuinely offers
                      "Save to Photos"; the fallback path ONLY downloads the file
                      to the device — claiming a Photos save there is a lie. */}
                  {saveOutcome === 'downloaded' ? 'Saved to your device' : 'Saved to Photos'}
                </div>
                <button
                  onClick={() => { setSaveState('idle'); setSaveOutcome(null) }}
                  style={{
                    marginTop: 16, padding: '11px 24px',
                    borderRadius: 999, border: 'none',
                    cursor: 'pointer',
                    background: 'var(--text)', color: 'var(--bg)',
                    fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14,
                  }}
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── TopBar ───────────────────────────────────────────────────────────
function TopBar({ onBack, label, rightSlot }) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        // Clear the iOS status bar (black-translucent → content goes full-height).
        padding: 'calc(env(safe-area-inset-top) + 10px) 16px 10px',
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
      {rightSlot ?? <div style={{ width: 30 }} />}
    </div>
  )
}

// ── BeatBlock ────────────────────────────────────────────────────────
// One person's contribution in the braid.
function BeatBlock({ beat, traveler, isLast }) {
  const { who, kind, snippet, hasWords, memory } = beat
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
        <TextBeat snippet={snippet} hasWords={hasWords} traveler={traveler} />
      )}
      {kind === 'photo' && (
        <PhotoBeat memory={memory} snippet={snippet} hasWords={hasWords} dot={dot} traveler={traveler} />
      )}
      {kind === 'voice' && (
        <VoiceBeat memory={memory} snippet={snippet} hasWords={hasWords} dot={dot} traveler={traveler} />
      )}
    </div>
  )
}

// ── Beat renderers ───────────────────────────────────────────────────
function TextBeat({ snippet, hasWords = true, traveler }) {
  return (
    <div
      data-testid="beat-text"
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: 17,
        fontStyle: traveler === 'aurelia' ? 'italic' : 'italic',
        lineHeight: 1.55, color: hasWords ? 'var(--text)' : 'var(--muted)',
        textWrap: 'pretty',
      }}
    >
      {hasWords ? `"${snippet}"` : snippet}
    </div>
  )
}

function PhotoBeat({ memory, snippet, hasWords = true, dot, traveler }) {
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
          {hasWords && snippet && (
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
          {hasWords && snippet && (
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

function VoiceBeat({ memory, snippet, hasWords = true, dot, traveler }) {
  const dur = memory?.durationSeconds
  // Resolve a playable audio URL for the clip, mirroring ThreadedMemories'
  // VoiceBubble: prefer the synced R2 url so non-author devices can play, fall
  // back to the author's local IDB blob. Null when there's nothing to play (an
  // older voice beat with no audioRef) → the button stays inert + dimmed
  // instead of being a dead control.
  const [audioUrl, setAudioUrl] = useState(null)
  const audioElRef = useRef(null)
  useEffect(() => {
    let active = true
    let createdObjectUrl = null
    const ref = memory?.audioRef
    if (ref?.url) {
      setAudioUrl(ref.url)
    } else if (ref?.key) {
      loadAsset('audio', ref.key).then((blob) => {
        if (!active || !blob) return
        createdObjectUrl = URL.createObjectURL(blob)
        setAudioUrl(createdObjectUrl)
      }).catch(() => {})
    }
    return () => {
      active = false
      // Stop any in-flight playback when the beat unmounts.
      audioElRef.current?.pause()
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memory?.audioRef?.key, memory?.audioRef?.url])

  function play() {
    if (!audioUrl) return
    // Reuse one element so repeated taps restart cleanly.
    if (!audioElRef.current) audioElRef.current = new Audio(audioUrl)
    audioElRef.current.currentTime = 0
    audioElRef.current.play().catch(() => {})
  }

  const playable = !!audioUrl
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
        {/* play button — actually plays the voice clip */}
        <button
          type="button"
          onClick={play}
          disabled={!playable}
          aria-label={playable ? 'Play voice clip' : 'Voice clip unavailable'}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            background: dot,
            border: 'none', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            cursor: playable ? 'pointer' : 'default',
            opacity: playable ? 1 : 0.45,
          }}
        >
          {/* play triangle */}
          <svg width="11" height="13" viewBox="0 0 11 13" fill="none" aria-hidden="true">
            <path d="M0.5 0.5L10.5 6.5L0.5 12.5V0.5Z" fill="white" />
          </svg>
        </button>
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
