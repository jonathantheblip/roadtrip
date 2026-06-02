import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Play, Pause, Images, Calendar } from 'lucide-react'
import { listMemoriesForStop, listMemoriesForTrip } from '../lib/memoryStore'
import { presenceOf, capturedBy } from '../lib/replayPresence'
import { flattenPhotoEntries, formatFullDate } from '../lib/photoEntries'
import { humanDateRange } from '../lib/createTripCard'
import { thumbUrl } from '../lib/thumbUrl'
import { Avatar, AvatarStack } from '../components/Avatar'
import { TRAVELERS } from '../data/travelers'
import './ReplayView.css'

// ── REPLAY — one zoomable time spine ─────────────────────────────────────
//
// archive → trip → day → stop. ZOOM picks the scope; PLAY and SCRUB are the
// same two gestures at every scope. Increments 1+2 built day (stops) and
// stop (photos); increment 3 adds the two outer rungs — archive (trips) and
// trip (days) — completing the ladder.
//
// THE BET, CASHED: useReplayPlayer + TimeRail are reused UNCHANGED across
// all four scopes. The transport is wired to the ACTIVE level's
// (count, cursor, setCursor, beatFor); `level` selects which of four child
// lists — trips / days / stops / photos — sits underneath. The core never
// learns which scope it drives. Four child lists, one transport.

const BEAT_RICH_MS = 2600 // a stop with memories lingers
const BEAT_EMPTY_MS = 1100 // an itinerary-only stop passes at a quicker beat
const BEAT_PHOTO_MS = 2800 // a photo dwells longer than an itinerary card
const BEAT_TRIP_MS = 2200 // archive: each trip holds a beat
const BEAT_DAY_MS = 1500 // trip: each day walks
const PRELOAD_AHEAD = 2 // decode this many photos past the cursor
const STAGE_MAX_EDGE = 1600 // bounded full-bleed variant (iOS decode budget)

// PLAY: auto-advance the cursor through `count` children, pausing `beatFor`
// ms on each. Stops at the last child; pressing play again from the end
// restarts at 0. Scope-agnostic — knows nothing about stops or days.
function useReplayPlayer({ count, cursor, setCursor, beatFor }) {
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!playing) return undefined
    if (cursor >= count - 1) {
      setPlaying(false) // reached the end
      return undefined
    }
    const id = setTimeout(() => {
      setCursor((c) => Math.min(c + 1, count - 1))
    }, beatFor(cursor))
    return () => clearTimeout(id)
  }, [playing, cursor, count, beatFor, setCursor])

  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && cursor >= count - 1) setCursor(0) // restart from the top
      return !p
    })
  }, [cursor, count, setCursor])

  return { playing, setPlaying, toggle }
}

// SCRUB: a horizontal rail with one tick per sibling and a thumb at the
// cursor. Drag the thumb or tap a tick to move between siblings. Pointer
// math maps x → nearest child index. Scope-agnostic.
function TimeRail({ count, cursor, onScrub, onGrab }) {
  const trackRef = useRef(null)
  const draggingRef = useRef(false)

  const indexFromClientX = useCallback(
    (clientX) => {
      const el = trackRef.current
      if (!el || count <= 1) return 0
      const r = el.getBoundingClientRect()
      const frac = (clientX - r.left) / r.width
      return Math.max(0, Math.min(count - 1, Math.round(frac * (count - 1))))
    },
    [count]
  )

  const handleDown = (e) => {
    draggingRef.current = true
    onGrab?.() // grabbing the rail pauses PLAY — scrub is manual
    onScrub(indexFromClientX(e.clientX)) // do the scrub before capture, so a
    // capture failure (e.g. an already-released pointer id) never blocks it
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      /* InvalidPointerId — keep tracking via the move handler regardless */
    }
  }
  const handleMove = (e) => {
    if (!draggingRef.current) return
    onScrub(indexFromClientX(e.clientX))
  }
  const handleUp = (e) => {
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      /* no-op */
    }
  }

  const pct = count <= 1 ? 0 : (cursor / (count - 1)) * 100

  return (
    <div
      ref={trackRef}
      className="rpl-rail"
      role="slider"
      aria-label="Scrub"
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={cursor + 1}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      <div className="rpl-rail-line" />
      <div className="rpl-rail-fill" style={{ width: `${pct}%` }} />
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={`rpl-rail-tick ${i === cursor ? 'on' : ''}`}
          style={{ left: count <= 1 ? '0%' : `${(i / (count - 1)) * 100}%` }}
        />
      ))}
      <span className="rpl-rail-thumb" style={{ left: `${pct}%` }} />
    </div>
  )
}

// Flatten a stop's memories into an ordered photo list — the STOP level's
// children. Reuses the production album flattener (lib/photoEntries) so we
// inherit its dedup (ignores the back-compat photoRef mirror when
// photoRefs[] is present) and its caption/index labelling. Memories are
// ordered by effective capture date — capturedAt primary, createdAt
// (upload time) fallback, the existing C0 precedence — and within an album
// the cover (photoRefs[0]) leads, then its items.
function stopPhotoSequence(stop, traveler) {
  if (!stop) return []
  const mems = listMemoriesForStop(stop.id, traveler)
  const ordered = [...mems].sort((a, b) => {
    const ad = a.capturedAt || a.createdAt || ''
    const bd = b.capturedAt || b.createdAt || ''
    return ad < bd ? -1 : ad > bd ? 1 : 0
  })
  return flattenPhotoEntries(ordered)
}

// STOP level stage — a single photo, full-bleed, caption + author + date
// overlaid, fades in on decode so a not-yet-cached frame never flashes raw.
function PhotoStage({ photo }) {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    setLoaded(false)
  }, [photo?.url])
  if (!photo) return null
  const author = capturedBy({ authorTraveler: photo.author })
  const dateLabel = formatFullDate(photo.capturedAt)
  return (
    <figure className="rpl-photo">
      <img
        className={`rpl-photo-img ${loaded ? 'in' : ''}`}
        src={thumbUrl(photo.url, STAGE_MAX_EDGE)}
        alt={photo.caption || 'Memory photo'}
        onLoad={() => setLoaded(true)}
        draggable={false}
      />
      <figcaption className="rpl-photo-overlay">
        {photo.photoCountInMemory > 1 && (
          <span className="rpl-photo-idx">
            {photo.photoIndexInMemory + 1} of {photo.photoCountInMemory}
          </span>
        )}
        {photo.caption && photo.photoIndexInMemory === 0 && (
          <p className="rpl-photo-caption">{photo.caption}</p>
        )}
        <div className="rpl-photo-meta">
          {author && <Avatar id={author} size={26} />}
          <div className="rpl-photo-metatext">
            {author && <span className="rpl-photo-author">{TRAVELERS[author]?.name}</span>}
            {dateLabel && <span className="rpl-photo-date">{dateLabel}</span>}
          </div>
        </div>
      </figcaption>
    </figure>
  )
}

// DAY level inline content for the selected stop — photos→replay cue,
// text-only memories→inline list, empty→itinerary state.
function StopStage({ stop, traveler, onReplay }) {
  const memories = useMemo(
    () => listMemoriesForStop(stop.id, traveler),
    [stop.id, traveler]
  )
  const photos = useMemo(() => flattenPhotoEntries(memories), [memories])
  const who = presenceOf(stop)

  return (
    <div className="rpl-stage">
      <div className="rpl-stage-head">
        <span className="rpl-stage-time">{stop.time || '—'}</span>
        {who.length > 0 ? (
          <AvatarStack ids={who} size={22} />
        ) : (
          <span className="rpl-stage-noone" aria-label="presence unknown">
            —
          </span>
        )}
      </div>
      <h2 className="rpl-stage-name">{stop.name || stop.title || 'Stop'}</h2>
      {stop.kind && <div className="rpl-stage-kind">{stop.kind}</div>}
      {stop.address && <div className="rpl-stage-addr">{stop.address}</div>}

      {photos.length > 0 ? (
        <button type="button" className="rpl-replay-cue" onClick={onReplay}>
          <Images size={16} />
          Replay {photos.length} photo{photos.length > 1 ? 's' : ''}
          <span className="rpl-replay-arrow">→</span>
        </button>
      ) : memories.length > 0 ? (
        <ul className="rpl-mems">
          {memories.map((m) => {
            const author = capturedBy(m)
            return (
              <li key={m.id} className="rpl-mem">
                {author && <Avatar id={author} size={24} />}
                <div className="rpl-mem-body">
                  <span className="rpl-mem-kind">{m.kind || 'text'}</span>
                  <span className="rpl-mem-text">{m.text || m.caption || ''}</span>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="rpl-itin">
          {stop.note && <p className="rpl-itin-note">{stop.note}</p>}
          <div className="rpl-itin-tag">Itinerary · no memories yet</div>
        </div>
      )}
    </div>
  )
}

// Which day to open on. Reuse the trip's own nominated centerpiece
// (heroStopId) so the entry point lands on a meaningful day; fall back to
// the day containing today (live trips), then day 1.
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

// Index (not day-number) of the hero day within a trip's days[].
function heroDayIndex(trip) {
  const n = defaultDayN(trip)
  const idx = (trip?.days || []).findIndex((d) => d.n === n)
  return idx >= 0 ? idx : 0
}

// Archive ordering — by each trip's OWN start date (dateRangeStart, ISO),
// ascending so PLAY walks history forward. This deliberately ignores photo
// capture/upload time: the photo clock is unreliable (EXIF stripped on the
// real archive), but trip start dates are clean. Trips with no start date
// sort to the end rather than punching to the front.
function byStartDateAsc(a, b) {
  const ad = a?.dateRangeStart || ''
  const bd = b?.dateRangeStart || ''
  if (ad === bd) return 0
  if (!ad) return 1
  if (!bd) return -1
  return ad < bd ? -1 : 1
}

function tripDateLabel(t) {
  return t?.dateRange || humanDateRange(t?.dateRangeStart, t?.dateRangeEnd) || ''
}

export function ReplayView({ trip, trips, traveler, onExit }) {
  // Archive spine source: the whole list, date-ordered. Falls back to just
  // the entry trip if the list wasn't passed.
  const orderedTrips = useMemo(() => {
    const list = Array.isArray(trips) && trips.length ? trips : trip ? [trip] : []
    return [...list].sort(byStartDateAsc)
  }, [trips, trip])

  // Cursors — one per scope. The entry point lands at the DAY level on the
  // entry trip's hero day; archive/trip are reached by zooming OUT.
  const [archiveCursor, setArchiveCursor] = useState(() => {
    const idx = orderedTrips.findIndex((t) => t.id === trip?.id)
    return idx >= 0 ? idx : 0
  })
  const [level, setLevel] = useState('day') // 'archive' | 'trip' | 'day' | 'stop'
  const [tripCursor, setTripCursor] = useState(() => heroDayIndex(trip)) // day index
  const [dayCursor, setDayCursor] = useState(0) // stop index
  const [photoCursor, setPhotoCursor] = useState(0) // photo index

  const currentTrip = orderedTrips[archiveCursor] || null
  const days = currentTrip?.days || []
  const currentDay = days[tripCursor] || null
  const stops = currentDay?.stops || []
  const currentStop = stops[dayCursor] || null
  const photos = useMemo(
    () => stopPhotoSequence(currentStop, traveler),
    [currentStop?.id, traveler]
  )

  // Per-stop counts for the current day (day beat + zoom-in gate + badges).
  const stopData = useMemo(() => {
    const map = {}
    for (const s of stops) {
      const mems = listMemoriesForStop(s.id, traveler)
      map[s.id] = { memCount: mems.length, photoCount: flattenPhotoEntries(mems).length }
    }
    return map
  }, [stops, traveler])

  // Per-trip photo totals for the archive spine badges.
  const archivePhotoCounts = useMemo(() => {
    const map = {}
    for (const t of orderedTrips) {
      map[t.id] = flattenPhotoEntries(listMemoriesForTrip(t.id, traveler)).length
    }
    return map
  }, [orderedTrips, traveler])

  // Per-day photo totals for the trip spine badges.
  const dayPhotoCounts = useMemo(() => {
    const map = {}
    for (const d of days) {
      let n = 0
      for (const s of d.stops || []) {
        n += flattenPhotoEntries(listMemoriesForStop(s.id, traveler)).length
      }
      map[d.n] = n
    }
    return map
  }, [days, traveler])

  // The scope swap: feed the UNCHANGED core the active level's children.
  const active = useMemo(() => {
    switch (level) {
      case 'archive':
        return { count: orderedTrips.length, cursor: archiveCursor, set: setArchiveCursor }
      case 'trip':
        return { count: days.length, cursor: tripCursor, set: setTripCursor }
      case 'stop':
        return { count: photos.length, cursor: photoCursor, set: setPhotoCursor }
      default:
        return { count: stops.length, cursor: dayCursor, set: setDayCursor }
    }
  }, [level, orderedTrips.length, archiveCursor, days.length, tripCursor, photos.length, photoCursor, stops.length, dayCursor])

  const beatFor = useCallback(
    (i) => {
      if (level === 'stop') return BEAT_PHOTO_MS
      if (level === 'archive') return BEAT_TRIP_MS
      if (level === 'trip') return BEAT_DAY_MS
      return stopData[stops[i]?.id]?.memCount > 0 ? BEAT_RICH_MS : BEAT_EMPTY_MS
    },
    [level, stops, stopData]
  )

  const { playing, setPlaying, toggle } = useReplayPlayer({
    count: active.count,
    cursor: active.cursor,
    setCursor: active.set,
    beatFor,
  })

  // Auto-scroll the active spine row into view as PLAY/SCRUB move the cursor
  // (every level except the full-bleed photo stage).
  const rowRefs = useRef({})
  useEffect(() => {
    if (level === 'stop') return
    rowRefs.current[active.cursor]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active.cursor, level])

  // PRELOAD the next photos so PLAY never advances onto an undecoded frame.
  // Lives OUTSIDE the player — why the timer stays a blind clock at every
  // level and the core needed no readiness gate.
  useEffect(() => {
    if (level !== 'stop') return
    for (let k = 1; k <= PRELOAD_AHEAD; k++) {
      const p = photos[photoCursor + k]
      if (p?.url) {
        const img = new Image()
        img.src = thumbUrl(p.url, STAGE_MAX_EDGE)
      }
    }
  }, [level, photoCursor, photos])

  // ── ZOOM ladder ───────────────────────────────────────────────────────
  // Descending resets the CHILD cursor to the top; the parent cursor is left
  // untouched so zoom-out restores it.
  function enterTrip(i) {
    setPlaying(false)
    setArchiveCursor(i)
    setTripCursor(0)
    setLevel('trip')
  }
  function enterDay(j) {
    setPlaying(false)
    setTripCursor(j)
    setDayCursor(0)
    setLevel('day')
  }
  function enterStop(k) {
    setPlaying(false)
    setDayCursor(k)
    if (stopData[stops[k]?.id]?.photoCount > 0) {
      setPhotoCursor(0)
      setLevel('stop')
    }
  }
  // Zoom-out one rung; parent cursors were preserved. From the outermost
  // (archive) rung, "back" leaves replay.
  function ascend() {
    setPlaying(false)
    if (level === 'stop') setLevel('day')
    else if (level === 'day') setLevel('trip')
    else if (level === 'trip') setLevel('archive')
    else onExit()
  }

  if (!currentTrip) return null

  const themeName = traveler === 'helen' ? 'helen' : traveler

  // Breadcrumb path + what the back arrow does at this rung.
  const crumb = (() => {
    if (level === 'archive') return { sup: 'The Archive', main: `${orderedTrips.length} trips`, back: 'Exit replay' }
    if (level === 'trip') return { sup: 'The Archive', main: `${currentTrip.title} · ${tripDateLabel(currentTrip)}`, back: 'Back to archive' }
    if (level === 'day') return { sup: currentTrip.title, main: `Day ${currentDay?.n}${currentDay?.title ? ` — ${currentDay.title}` : ''}`, back: 'Back to trip' }
    return { sup: `Day ${currentDay?.n}`, main: currentStop?.name || currentStop?.title || 'Stop', back: 'Back to day' }
  })()

  return (
    <div className="rpl-root" data-theme={themeName}>
      <header className="rpl-bread">
        <button type="button" className="rpl-back" onClick={ascend} aria-label={crumb.back}>
          <ChevronLeft size={18} />
        </button>
        <div className="rpl-bread-txt">
          <span className="rpl-bread-trip">{crumb.sup}</span>
          <span className="rpl-bread-day">{crumb.main}</span>
        </div>
      </header>

      {level === 'stop' ? (
        <div className="rpl-stopwrap">
          <PhotoStage photo={photos[photoCursor]} />
        </div>
      ) : level === 'archive' ? (
        <div className="rpl-spine">
          {orderedTrips.map((t, i) => {
            const activeRow = i === archiveCursor
            const pc = archivePhotoCounts[t.id] || 0
            return (
              <div
                key={t.id}
                ref={(el) => (rowRefs.current[i] = el)}
                className={`rpl-row ${activeRow ? 'active' : ''}`}
              >
                <button type="button" className="rpl-row-head" onClick={() => enterTrip(i)}>
                  <span className="rpl-row-name">{t.title || 'Untitled trip'}</span>
                  <span className="rpl-row-sub">{tripDateLabel(t)}</span>
                  <span className="rpl-row-meta">
                    {(t.days?.length || 0)}d
                    {pc > 0 && (
                      <span className="rpl-row-badge">
                        <Images size={13} />
                        {pc}
                      </span>
                    )}
                  </span>
                </button>
                {activeRow && (
                  <div className="rpl-stage">
                    {t.subtitle && <p className="rpl-itin-note">{t.subtitle}</p>}
                    <button type="button" className="rpl-replay-cue" onClick={() => enterTrip(i)}>
                      <Calendar size={16} />
                      Open {t.days?.length || 0} day{(t.days?.length || 0) === 1 ? '' : 's'}
                      <span className="rpl-replay-arrow">→</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : level === 'trip' ? (
        <div className="rpl-spine">
          {days.map((d, j) => {
            const activeRow = j === tripCursor
            const pc = dayPhotoCounts[d.n] || 0
            return (
              <div
                key={d.n}
                ref={(el) => (rowRefs.current[j] = el)}
                className={`rpl-row ${activeRow ? 'active' : ''}`}
              >
                <button type="button" className="rpl-row-head" onClick={() => enterDay(j)}>
                  <span className="rpl-row-time">Day {d.n}</span>
                  <span className="rpl-row-name">{d.title || d.date || `Day ${d.n}`}</span>
                  <span className="rpl-row-meta">
                    {(d.stops?.length || 0)} stop{(d.stops?.length || 0) === 1 ? '' : 's'}
                    {pc > 0 && (
                      <span className="rpl-row-badge">
                        <Images size={13} />
                        {pc}
                      </span>
                    )}
                  </span>
                </button>
                {activeRow && (
                  <div className="rpl-stage">
                    {d.date && <div className="rpl-stage-addr">{d.date}</div>}
                    <button type="button" className="rpl-replay-cue" onClick={() => enterDay(j)}>
                      <Calendar size={16} />
                      Open {d.stops?.length || 0} stop{(d.stops?.length || 0) === 1 ? '' : 's'}
                      <span className="rpl-replay-arrow">→</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rpl-spine">
          {stops.map((s, i) => {
            const activeRow = i === dayCursor
            const who = presenceOf(s)
            const hasPhotos = stopData[s.id]?.photoCount > 0
            return (
              <div
                key={s.id}
                ref={(el) => (rowRefs.current[i] = el)}
                className={`rpl-row ${activeRow ? 'active' : ''}`}
              >
                <button
                  type="button"
                  className="rpl-row-head"
                  onClick={() => enterStop(i)}
                  aria-expanded={activeRow}
                >
                  <span className="rpl-row-time">{s.time || '—'}</span>
                  <span className="rpl-row-name">{s.name || s.title || 'Stop'}</span>
                  {hasPhotos && (
                    <span className="rpl-row-badge" aria-label="has photos">
                      <Images size={13} />
                      {stopData[s.id].photoCount}
                    </span>
                  )}
                  <span className="rpl-row-who">
                    {who.length > 0 ? (
                      <AvatarStack ids={who} size={18} />
                    ) : (
                      <span className="rpl-row-noone">—</span>
                    )}
                  </span>
                </button>
                {activeRow && (
                  <StopStage stop={s} traveler={traveler} onReplay={() => enterStop(i)} />
                )}
              </div>
            )
          })}
        </div>
      )}

      <footer className="rpl-transport">
        <button
          type="button"
          className="rpl-play"
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>
        <TimeRail
          count={active.count}
          cursor={active.cursor}
          onScrub={active.set}
          onGrab={() => setPlaying(false)}
        />
        <span className="rpl-count">
          {active.count ? active.cursor + 1 : 0} / {active.count}
        </span>
      </footer>
    </div>
  )
}
