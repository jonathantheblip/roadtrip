import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, X, ChevronDown } from 'lucide-react'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { capturedBy } from '../lib/replayPresence'
import { flattenPhotoEntries, formatFullDate } from '../lib/photoEntries'
import { dayStopIds, dayForStopId, tripImplicitBase, implicitBaseIdForDay, isHomeDay, recordEntryTargets } from '../lib/photoMatch'
import { useHydratedMemories } from '../lib/usePhotoHydration'
import { thumbUrl } from '../lib/thumbUrl'
import { fetchStoredWeave } from '../lib/weave'
import { classifySwipe } from '../lib/swipeClassify'
import { Avatar } from '../components/Avatar'
import { WeaveMark } from '../components/Glyphs'
import { TRAVELERS } from '../data/travelers'
import './ReplayView.css'

// ── REPLAY — THE REEL ────────────────────────────────────────────────────
//
// The look-back front door. ONE full-bleed surface that PLAYS the trip's
// MEMORIES (photos + videos) in time order — not the old archive→trip→day→stop
// timeline ladder (retired). Tap/swipe advances; press-and-hold pauses; a video
// plays as a real <video> and suspends auto-advance until it ends. ONE Done(✕)
// exits from anywhere in one tap.
//
// RECONCILED (do-not-lose, see CARRYOVER_LOOKBACK_DONOTLOSE.md):
// - The cinematic photo engine (CineLayer + the 2-layer crossfade + the 4
//   Ken-Burns variants + the decode-gated `.play` class + reduced-motion) is
//   REUSED UNCHANGED for photos.
// - The fixed-literal photo scrim (.rpl-photo-overlay) is reused as-is (its
//   legibility over arbitrary photos must not depend on theme tokens).
// - Per-person skin = `data-theme={person}` on the root; all color via tokens.
// - The `initial` ({tripId, dayN}) resurface/deep-link contract is preserved:
//   the reel opens scoped to that trip and starts at that day's first memory.
// - The held video-label fix's INTENT survives: a video memory shows "VIDEO"
//   (never "photo") via `entry.isVideo` — the SAME predicate the old
//   memoryKindLabel used, now sourced from flattenPhotoEntries.

const BEAT_PHOTO_MS = 2800 // a photo dwells before auto-advancing
const STAGE_MAX_EDGE = 1600 // bounded full-bleed variant (iOS decode budget)
const PRELOAD_AHEAD = 2 // decode this many photos past the cursor
const SEGMENT_MAX = 40 // ≤ this many memories → segmented story rail, else a bar
const HOLD_MS = 240 // press-and-hold beyond this pauses playback
const CINE_VARIANTS = ['a', 'b', 'c', 'd']

// PLAY: auto-advance the cursor through `count` children, pausing `beatFor` ms
// on each. `hold` suspends the timer (a video owns its own timing — it advances
// on its `ended` event, not on the clock). Stops at the last child; pressing
// play again from the end restarts at 0. Scope-agnostic.
function useReplayPlayer({ count, cursor, setCursor, beatFor, hold }) {
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!playing || hold) return undefined
    if (cursor >= count - 1) {
      setPlaying(false) // reached the end
      return undefined
    }
    const id = setTimeout(() => {
      setCursor((c) => Math.min(c + 1, count - 1))
    }, beatFor(cursor))
    return () => clearTimeout(id)
  }, [playing, cursor, count, beatFor, setCursor, hold])

  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && cursor >= count - 1) setCursor(0) // restart from the top
      return !p
    })
  }, [cursor, count, setCursor])

  return { playing, setPlaying, toggle }
}

// Ken Burns pan/zoom directions — cycled per photo so consecutive frames drift
// differently (never the same move twice in a row).

// One cinematic photo layer: starts hidden, begins its animation only once the
// image has DECODED (onLoad), so a not-yet-cached frame never flashes raw. The
// animation both fades the layer in (the crossfade) and slowly drifts it (Ken
// Burns). UNCHANGED from the shipped engine.
function CineLayer({ url, variant, alt }) {
  const [ready, setReady] = useState(false)
  return (
    <img
      className={`rpl-cine-layer rpl-cine-${variant} ${ready ? 'play' : ''}`}
      src={thumbUrl(url, STAGE_MAX_EDGE)}
      alt={alt || 'Memory photo'}
      onLoad={() => setReady(true)}
      draggable={false}
    />
  )
}

// The photo stage: a full-bleed photo that drifts (Ken Burns) and crossfades to
// the next (two layers kept). The cine engine, unchanged — only the caption
// overlay moved out to the reel level so a video can share the same scrim.
function CineStage({ photo }) {
  const [layers, setLayers] = useState([])
  const seqRef = useRef(0)
  useEffect(() => {
    if (!photo?.url) {
      setLayers([])
      return
    }
    setLayers((prev) => {
      // Same photo (re-render) → no new layer.
      if (prev.length && prev[prev.length - 1].url === photo.url) return prev
      const seq = (seqRef.current += 1)
      const variant = CINE_VARIANTS[seq % CINE_VARIANTS.length]
      // Keep the outgoing layer beneath the incoming one so it crossfades.
      return [...prev, { url: photo.url, variant, key: seq }].slice(-2)
    })
  }, [photo?.url])

  if (!photo) return null
  return (
    <figure className="rpl-photo">
      <div className="rpl-cine-stack">
        {layers.map((l) => (
          <CineLayer key={l.key} url={l.url} variant={l.variant} alt={photo.caption} />
        ))}
      </div>
    </figure>
  )
}

// A video memory plays as a real <video> — mirrors PhotoAlbum's lightbox
// (controls / playsInline / preload=metadata / object-fit:contain). Letterboxed
// over the same fixed #0c0b0a stage. The parent suspends auto-advance while a
// video is current and resumes when `onEnded` fires.
//
// AUTOPLAY: muted-autoplay is the only path that reliably starts inline video on
// every browser (iOS Safari blocks UNMUTED inline autoplay outright) — the same
// default Instagram/Stories use. Audio is one tap away (unmute via the controls).
// React doesn't reliably reflect the `muted` PROPERTY from the attribute, so we
// also set it on the element directly.
function VideoStage({ entry, onEnded }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.muted = true
    // Nudge playback in case the autoPlay attribute didn't take (some engines
    // need an explicit play() once muted); ignore the rejection if blocked.
    const p = el.play?.()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  }, [entry?.url])
  return (
    <div className="rpl-photo rpl-video-wrap">
      <video
        ref={ref}
        className="rpl-video"
        data-testid="rpl-reel-video"
        src={entry.url}
        poster={entry.posterUrl || undefined}
        controls
        playsInline
        autoPlay
        muted
        preload="metadata"
        onEnded={onEnded}
        onError={onEnded} /* a broken/undecodable clip advances rather than freezing PLAY */
      />
    </div>
  )
}

// Which day to open on. Reuse the trip's own nominated centerpiece (heroStopId)
// so a no-target entry lands on a meaningful day; fall back to the day
// containing today (live trips), then day 1.
function defaultDayN(trip) {
  const heroId = trip?.heroStopId
  if (heroId) {
    const d = trip.days?.find((day) => day.stops?.some((s) => s.id === heroId))
    if (d) return d.n
  }
  const today = new Date().toISOString().slice(0, 10)
  const onToday = trip?.days?.find((d) => d.isoDate === today)
  if (onToday) return onToday.n
  return trip?.days?.[0]?.n ?? 1
}

// Instagram-story progress rail: ≤ SEGMENT_MAX memories → one tappable segment
// each (past filled, current bright); more → one continuous accent bar (too many
// to show as discrete ticks). Tapping a segment jumps the cursor.
function StoryRail({ count, cursor, onJump }) {
  if (count <= 1) return <div className="rpl-srail" aria-hidden="true" />
  if (count <= SEGMENT_MAX) {
    return (
      <div className="rpl-srail" role="group" aria-label="Memories">
        {Array.from({ length: count }).map((_, i) => (
          <button
            key={i}
            type="button"
            className={`rpl-srail-seg ${i < cursor ? 'past' : i === cursor ? 'on' : ''}`}
            aria-label={`Memory ${i + 1} of ${count}`}
            onClick={() => onJump(i)}
          />
        ))}
      </div>
    )
  }
  const pct = count <= 1 ? 0 : (cursor / (count - 1)) * 100
  return (
    <div className="rpl-srail rpl-srail-cont" role="group" aria-label="Memories">
      <div className="rpl-srail-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function ReplayView({ trip, trips, traveler, onExit, initial }) {
  // Single-trip reel scope. A resurface/strip target (initial.tripId) may differ
  // from the active trip; otherwise the entry trip.
  const scopeTrip = useMemo(() => {
    const id = initial?.tripId
    if (id && Array.isArray(trips)) {
      const t = trips.find((tt) => tt.id === id)
      if (t) return t
    }
    return trip || null
  }, [initial?.tripId, trips, trip])

  // The reel's children: every memory in the trip, chronological (capturedAt →
  // createdAt asc), flattened to per-photo/video entries (cover leads an album).
  // Deduped by stored-object key so a composed share-moment never doubles a
  // photo (mirrors photoEntries.dedupeByPhoto — the earlier/original wins, which
  // here is the first occurrence since we already sorted ascending).
  const scopeMems = useMemo(
    () => (scopeTrip ? listMemoriesForTrip(scopeTrip.id, traveler) : []),
    [scopeTrip?.id, traveler] // eslint-disable-line react-hooks/exhaustive-deps
  )
  // Hydrate offline `pending` refs from idb (offline-relaunch render in replay).
  const hydratedMems = useHydratedMemories(scopeMems)
  const sequence = useMemo(() => {
    if (!scopeTrip) return []
    const ordered = [...hydratedMems].sort((a, b) => {
      const ad = a.capturedAt || a.createdAt || ''
      const bd = b.capturedAt || b.createdAt || ''
      return ad < bd ? -1 : ad > bd ? 1 : 0
    })
    const flat = flattenPhotoEntries(ordered)
    const seen = new Set()
    const out = []
    for (const e of flat) {
      if (e.refKey) {
        if (seen.has(e.refKey)) continue
        seen.add(e.refKey)
      }
      out.push(e)
    }
    return out
  }, [scopeTrip?.id, hydratedMems]) // eslint-disable-line react-hooks/exhaustive-deps

  // stopId → day/stop context, for the live "Day N · Stop" chip.
  const stopCtx = useMemo(() => {
    const map = {}
    for (const d of scopeTrip?.days || []) {
      for (const s of d.stops || []) {
        map[s.id] = {
          dayN: d.n,
          stopName: s.name || s.title || '',
        }
      }
    }
    // The implicit base ("At the cabin") isn't a planned stop, so map its per-day
    // id to the lodging name → the live chip reads "Day N · At the cabin".
    const base = tripImplicitBase(scopeTrip)
    if (base) {
      for (const d of scopeTrip?.days || []) {
        if (d.isoDate && !isHomeDay(d)) {
          map[implicitBaseIdForDay(d.isoDate)] = { dayN: d.n, stopName: base.name }
        }
      }
    }
    // A photo hand-filed / healed to a named settle-sheet moment (record bridge)
    // carries a __record__ id — resolve it so the reel chip reads "Day N · <moment>".
    for (const d of scopeTrip?.days || []) {
      for (const rt of recordEntryTargets(d)) {
        map[rt.id] = { dayN: d.n, stopName: rt.name }
      }
    }
    return map
  }, [scopeTrip])

  // The day-picker's jumpable days: only trip days that actually have a memory
  // in the reel, each with the cursor index of its FIRST memory. A single such
  // day → no picker (the chip is a plain label, not a button).
  const dayList = useMemo(() => {
    const out = []
    for (const d of scopeTrip?.days || []) {
      const stopIds = dayStopIds(scopeTrip, d)
      const idx = sequence.findIndex((e) => e.stopId && stopIds.has(e.stopId))
      if (idx >= 0) {
        out.push({ n: d.n, isoDate: d.isoDate, title: d.title || d.date || '', cursorIndex: idx })
      }
    }
    return out
  }, [scopeTrip, sequence])

  // Starting cursor: a resurface target's day (initial.dayN) → that day's first
  // memory; else the trip's hero day's first memory; else the top.
  const initialCursor = useMemo(() => {
    if (!sequence.length) return 0
    const dayN = initial?.dayN != null ? initial.dayN : defaultDayN(scopeTrip)
    if (dayN != null) {
      const day = (scopeTrip?.days || []).find((d) => d.n === dayN)
      const stopIds = day ? dayStopIds(scopeTrip, day) : new Set()
      const idx = sequence.findIndex((e) => e.stopId && stopIds.has(e.stopId))
      if (idx >= 0) return idx
    }
    return 0
  }, [sequence, scopeTrip, initial?.dayN])

  const [cursor, setCursor] = useState(initialCursor)
  // Re-seat the cursor if the scope/target changes after mount (e.g. a strip
  // hands in a different trip while the reel is already open).
  useEffect(() => {
    setCursor(initialCursor)
  }, [initialCursor])

  const current = sequence[cursor] || null
  const isVideo = !!current?.isVideo
  const [sheetOpen, setSheetOpen] = useState(false)

  // The current memory's day (for the chip label + which day's weave to fetch).
  const currentDay = useMemo(() => {
    if (!current?.stopId) return null
    return dayForStopId(scopeTrip, current.stopId)
  }, [current?.stopId, scopeTrip])

  // The current day's stored woven narrative (nightly or kept) — RE-HOMED onto
  // the day-picker sheet so a replayed day still reads as a story. Stored weaves
  // only; degrades to null on any failure. Reuses GET /weave/latest.
  const [dayWeave, setDayWeave] = useState(null)
  useEffect(() => {
    setDayWeave(null)
    if (!scopeTrip?.id || !currentDay?.isoDate) return
    let cancelled = false
    fetchStoredWeave(scopeTrip.id, currentDay.isoDate).then((w) => {
      if (!cancelled) setDayWeave(w?.title ? w : null)
    })
    return () => {
      cancelled = true
    }
  }, [scopeTrip?.id, currentDay?.isoDate])

  const beatFor = useCallback(() => BEAT_PHOTO_MS, [])
  const { playing, setPlaying, toggle } = useReplayPlayer({
    count: sequence.length,
    cursor,
    setCursor,
    beatFor,
    hold: isVideo, // a video owns its own timing; resume on `ended`
  })

  const goNext = useCallback(() => {
    setPlaying(false)
    setCursor((c) => Math.min(c + 1, sequence.length - 1))
  }, [sequence.length, setPlaying])
  const goPrev = useCallback(() => {
    setPlaying(false)
    setCursor((c) => Math.max(c - 1, 0))
  }, [setPlaying])

  // A finished (or failed-to-load) video advances to the next memory, keeping
  // PLAY rolling. If it's the LAST memory, end the reel cleanly instead of
  // leaving the transport stuck showing Pause forever (the player's timer is
  // held while a video is current, so nothing else would flip it off).
  const handleVideoEnded = useCallback(() => {
    if (cursor >= sequence.length - 1) {
      setPlaying(false)
    } else {
      setCursor((c) => Math.min(c + 1, sequence.length - 1))
    }
  }, [cursor, sequence.length, setPlaying])

  // PRELOAD the next photos so PLAY never advances onto an undecoded frame.
  useEffect(() => {
    for (let k = 1; k <= PRELOAD_AHEAD; k++) {
      const e = sequence[cursor + k]
      if (e && !e.isVideo && e.url) {
        const img = new Image()
        img.src = thumbUrl(e.url, STAGE_MAX_EDGE)
      }
    }
  }, [cursor, sequence])

  // ── Gestures (photo stage only — a video owns its own touches/controls) ──
  // press-and-hold → pause while held; quick tap → advance (left third = back);
  // horizontal swipe → prev/next; swipe-down → exit. Reuses the shared
  // classifySwipe so the reel matches the rest of the app's gesture feel.
  const gestureRef = useRef(null)
  const onPointerDown = (e) => {
    const g = { x: e.clientX, y: e.clientY, t: performance.now(), holding: false, wasPlaying: playing }
    g.holdTimer = setTimeout(() => {
      g.holding = true
      setPlaying(false)
    }, HOLD_MS)
    gestureRef.current = g
  }
  const onPointerUp = (e) => {
    const g = gestureRef.current
    gestureRef.current = null
    if (!g) return
    clearTimeout(g.holdTimer)
    if (g.holding) {
      if (g.wasPlaying) setPlaying(true) // release of a hold → resume
      return
    }
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    const duration = performance.now() - g.t
    const swipe = classifySwipe({ dx, dy, duration })
    if (swipe === 'next') return goNext()
    if (swipe === 'prev') return goPrev()
    if (swipe === 'close') return onExit()
    // A tap (no significant movement): left third → prev, else → next.
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    if (frac < 0.3) goPrev()
    else goNext()
  }
  const onPointerCancel = () => {
    const g = gestureRef.current
    gestureRef.current = null
    if (g) clearTimeout(g.holdTimer)
  }
  // Clear a pending press-and-hold timer if the stage swaps photo↔video (the
  // video stage carries no pointer handlers, so no up/cancel would arrive) or
  // the reel unmounts — otherwise the timer could fire setPlaying after detach.
  useEffect(() => {
    return () => {
      if (gestureRef.current?.holdTimer) {
        clearTimeout(gestureRef.current.holdTimer)
        gestureRef.current = null
      }
    }
  }, [isVideo])

  if (!scopeTrip) return null

  const themeName = traveler === 'helen' ? 'helen' : traveler

  // Empty trip — nothing to replay yet. Keep a one-tap exit.
  if (!sequence.length) {
    return (
      <div className="rpl-root rpl-reel-empty" data-theme={themeName}>
        <button
          type="button"
          className="rpl-reel-done"
          data-testid="rpl-reel-done"
          aria-label="Done"
          onClick={onExit}
        >
          <X size={18} />
        </button>
        <p className="rpl-reel-emptytext">No memories in this trip yet.</p>
      </div>
    )
  }

  const ctx = current?.stopId ? stopCtx[current.stopId] : null
  const chipLabel = ctx
    ? `Day ${ctx.dayN}${ctx.stopName ? ` · ${ctx.stopName}` : ''}`
    : scopeTrip.title || ''
  const multiDay = dayList.length > 1 // a single jumpable day → no picker
  const currentDayN = ctx?.dayN ?? null
  const author = capturedBy({ authorTraveler: current?.author })
  const dateLabel = formatFullDate(current?.capturedAt)
  const kind = isVideo ? 'VIDEO' : 'PHOTO'
  const idxLabel =
    current && current.photoCountInMemory > 1
      ? `${kind} · ${current.photoIndexInMemory + 1} OF ${current.photoCountInMemory}`
      : kind

  return (
    <div className="rpl-root rpl-reel-root" data-theme={themeName}>
      <StoryRail
        count={sequence.length}
        cursor={cursor}
        onJump={(i) => {
          setPlaying(false)
          setCursor(i)
        }}
      />

      <div className="rpl-reel-topbar">
        {multiDay ? (
          <button
            type="button"
            className="rpl-reel-chip rpl-reel-chip-btn"
            data-testid="rpl-reel-chip"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            onClick={() => {
              setPlaying(false)
              setSheetOpen(true)
            }}
          >
            <span className="rpl-reel-chip-txt">{chipLabel}</span>
            <ChevronDown size={13} />
          </button>
        ) : (
          <div className="rpl-reel-chip" data-testid="rpl-reel-chip">
            {chipLabel}
          </div>
        )}
        <button
          type="button"
          className="rpl-reel-done"
          data-testid="rpl-reel-done"
          aria-label="Done"
          onClick={onExit}
        >
          <X size={18} />
        </button>
      </div>

      <div
        className={`rpl-reel ${isVideo ? 'is-video' : ''}`}
        data-testid="rpl-reel"
        {...(!isVideo
          ? { onPointerDown, onPointerUp, onPointerCancel }
          : {})}
      >
        <div className="rpl-reel-stage">
          {isVideo ? (
            <VideoStage entry={current} onEnded={handleVideoEnded} />
          ) : (
            <CineStage photo={current} />
          )}
          <figcaption className="rpl-photo-overlay rpl-reel-overlay">
            <span className="rpl-photo-idx">{idxLabel}</span>
            {current?.caption && current.photoIndexInMemory === 0 && (
              <p className="rpl-photo-caption">{current.caption}</p>
            )}
            <div className="rpl-photo-meta">
              {author && <Avatar id={author} size={26} />}
              <div className="rpl-photo-metatext">
                {author && <span className="rpl-photo-author">{TRAVELERS[author]?.name}</span>}
                {dateLabel && <span className="rpl-photo-date">{dateLabel}</span>}
              </div>
            </div>
          </figcaption>
        </div>
      </div>

      <div className="rpl-reel-transport">
        <span className="rpl-reel-count">
          {sequence.length ? cursor + 1 : 0} / {sequence.length}
        </span>
        {/* The play/pause disc governs PHOTO auto-advance. A video owns its own
            timing via its native controls, so the disc is hidden while a clip is
            current (it would be a dead no-op otherwise). */}
        {!isVideo && (
          <button
            type="button"
            className="rpl-reel-play"
            data-testid="rpl-reel-play"
            onClick={toggle}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
        )}
        <span className="rpl-reel-scope">{scopeTrip.title || ''}</span>
      </div>

      {sheetOpen && (
        <div
          className="rpl-sheet-backdrop"
          data-testid="rpl-daypicker"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="rpl-sheet"
            role="dialog"
            aria-label="Jump to a day"
            onClick={(e) => e.stopPropagation()}
          >
            {dayWeave && (
              <div className="rpl-dayweave" data-testid="rpl-dayweave">
                <span className="rpl-dayweave-eyebrow">
                  <WeaveMark size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} /> The weave
                </span>
                <h2 className="rpl-dayweave-title">{dayWeave.title}</h2>
                {dayWeave.opening && <p className="rpl-dayweave-opening">{dayWeave.opening}</p>}
              </div>
            )}
            <div className="rpl-daystrip">
              {dayList.map((d) => (
                <button
                  key={d.n}
                  type="button"
                  className={`rpl-daychip ${d.n === currentDayN ? 'on' : ''}`}
                  aria-current={d.n === currentDayN ? 'true' : undefined}
                  onClick={() => {
                    setSheetOpen(false)
                    setPlaying(false)
                    setCursor(d.cursorIndex)
                  }}
                >
                  <span className="rpl-daychip-n">Day {d.n}</span>
                  {d.title && <span className="rpl-daychip-t">{d.title}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
