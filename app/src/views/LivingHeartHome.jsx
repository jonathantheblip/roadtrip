// LivingHeartHome — the ONE home for EVERY trip AND every phase. One component,
// themed by the active lens's CSS vars ([data-theme] on <body>) so it renders for
// Jonathan / Helen / Aurelia without forking, and shape-aware so it fits any trip:
// a stay/hangout/mixed ("At [place]"), the rare road trip (the day's focus), a
// complex/composite trip (the current part + a just-in-time "Next up" ticket + the
// folded plan), and a FINISHED trip (the after keepsake: "Looking back" + a photo
// wall + "Relive the trip"). Design approved 2026-06-28; complex trips + the after
// keepsake folded in 2026-06-29. It must feel alive at EVERY stage, not just when
// full (Jonathan's empty-state note). So it grows with the trip:
//   • empty/upcoming → the place leads, a countdown, a nudge to "what you could
//     do," and gentle "fills in as you go" promises (NOT sad blanks).
//   • a little → first photos + who's-here appear; the story slot promises tonight.
//   • full → the woven story, the pulse, the moments carousel.
// It LEADS with the experience and DEMOTES (never deletes) the feature entries —
// Share / Surprises / Replay / Book — to a quiet row (reconcile-before-replace).
//
// HONEST DATA (G6): the story shows the real woven opening when one exists, else a
// gentle promise (no faked narrative); the carousel shows real photos, else a
// "photos will gather here" ghost; Replay appears only when there's something to
// replay; "next" only when the live readout has one; the day count is derived from
// the real trip dates (no invented "night 2 of 4").
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Play, BookOpen, Sparkles, Share2, Compass, Plane, Ticket } from 'lucide-react'
import { fetchStoredWeave } from '../lib/weave'
import { WeaveReady } from '../components/EntryCues'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { isStayTrip, stayLabel, stayNights, stayPlaceCoords } from '../lib/tripShape'
import { findArrivalStop } from './FlightStatus'
import { sunTimes } from '../lib/sunTimes'
import { tripPhase } from '../lib/tripPhase'
import { todayLocalIso } from '../lib/localDate'
import { TRAVELERS } from '../data/travelers'
import { hasExplicitParts, currentPart, nextTimedStop, partCount, getParts } from '../lib/tripParts'
import { PartsOutline } from './PartsOutline'

const MONO = { fontFamily: 'JetBrains Mono, ui-monospace, monospace', textTransform: 'uppercase', letterSpacing: '0.14em' }
const DISPLAY = { fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.01em' }

function fmtTime(d) {
  return d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null
}
function relTime(ms) {
  if (!ms) return ''
  const min = Math.round((Date.now() - ms) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.round(hr / 24)}d ago`
}
// Day count / countdown from the real trip dates (local). No faking.
function dayInfo(trip) {
  const nights = stayNights(trip)
  const start = trip?.dateRangeStart
  const end = trip?.dateRangeEnd
  if (!start) return { nights }
  const today = todayLocalIso()
  const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / 86400000)
  if (today < start) return { nights, daysUntil: days(today, start) }
  if (end && today > end) return { nights, after: true }
  return { nights, dayX: Math.max(1, days(start, today) + 1) }
}
// ISO 'YYYY-MM-DD' + 1 day, in UTC (no local-TZ drift) — for the "Tomorrow" label.
function isoPlus1(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + 86400000).toISOString().slice(0, 10)
}

export function LivingHeartHome({
  trip, traveler, nowReadout, whoAround, weaveReady, bookHasPages,
  onOpenMap, onOpenWeave, onOpenReplay, onOpenBook, onOpenSurprises, onCompose, onOpenAllPhotos, onOpenActivities, onOpenStop,
}) {
  const [weave, setWeave] = useState(null)
  const [heroErr, setHeroErr] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetchStoredWeave(trip.id).then((w) => { if (!cancelled) setWeave(w) }).catch(() => {})
    return () => { cancelled = true }
  }, [trip.id])

  const place = stayLabel(trip)
  const isStay = isStayTrip(trip)
  const phase = tripPhase(trip)
  // When a trip is OVER, the living heart IS the keepsake (decided 2026-06-29): full
  // woven story + a photo wall + a prominent "relive it"; it sheds the upcoming /
  // agenda / now bits and the per-lens broadsheet/timeline/roll (retired). ONE home.
  const isAfter = phase === 'after'
  const di = useMemo(() => dayInfo(trip), [trip])
  // A complex/composite trip (a city break, flights + timed things) is still the
  // ONE living-heart home, shape-aware (FAMILY_TRIPS_VISION §11): it leads with the
  // PART it's in now and surfaces the next timed thing just-in-time (its ticket).
  // All gated on hasExplicitParts so stays/routes render byte-identical (G5).
  const isComplex = hasExplicitParts(trip)
  const curPart = useMemo(() => (isComplex ? currentPart(trip, todayLocalIso()) : null), [isComplex, trip])
  const partN = isComplex ? partCount(trip) : 0
  const partIdx = useMemo(
    () => (curPart ? getParts(trip).findIndex((p) => p.id === curPart.id) : -1),
    [curPart, trip]
  )
  const nextThing = useMemo(() => {
    if (!isComplex) return null
    const d = new Date()
    return nextTimedStop(trip, { todayIso: todayLocalIso(), nowMinutes: d.getHours() * 60 + d.getMinutes() })
  }, [isComplex, trip])
  const nextWhen = useMemo(() => {
    if (!nextThing) return ''
    const today = todayLocalIso()
    const dayPart = nextThing.iso === today ? 'Today'
      : nextThing.iso === isoPlus1(today) ? 'Tomorrow'
      : (nextThing.day?.date || '')
    return [dayPart, (nextThing.stop.time || '').trim()].filter(Boolean).join(' · ')
  }, [nextThing])
  // The common shapes (stay / hangout / mixed) lead with the place. The rare road
  // trip or place-less itinerary leads with the day's focus instead — a single
  // "At [place]" doesn't fit a moving or place-less trip (family-trips, never
  // road-trip logic). The place is still in the small line + the ambient day count.
  const todayTitle = useMemo(() => {
    const days = trip?.days || []
    const d = days.find((x) => x.isoDate === todayLocalIso()) || days[0]
    return (d?.title || '').trim()
  }, [trip])
  const heroBig = isAfter
    ? (isStay ? place : (trip.title || place || 'Your trip')) // a keepsake header, not "At [place]"
    : isComplex
    ? (curPart?.place ? `In ${curPart.place}` : (curPart?.title || trip.title || 'Your trip'))
    : isStay ? `At ${place}` : (todayTitle || (di.dayX ? `Day ${di.dayX}` : (trip.title || 'Your trip')))
  const coords = useMemo(() => stayPlaceCoords(trip), [trip])
  const sun = useMemo(() => (coords ? sunTimes(new Date(), coords.lat, coords.lng) : null), [coords?.lat, coords?.lng])
  const heroUrl = (!heroErr && (trip.heroImage || trip.heroResolved?.url)) || null

  const mems = useMemo(() => listMemoriesForTrip(trip.id, traveler), [trip.id, traveler])
  const sorted = useMemo(() => [...mems].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [mems])
  const photoUrls = useMemo(() => {
    const cap = isAfter ? 12 : 6 // an after-trip keepsake shows a fuller wall
    const out = []
    for (const m of sorted) {
      if (Array.isArray(m.photoRefs)) { for (const r of m.photoRefs) if (r?.url) out.push(r.url) }
      else if (m.photoRef?.url) out.push(m.photoRef.url)
      if (out.length >= cap) break
    }
    return out.slice(0, cap)
  }, [sorted, isAfter])
  const todayCount = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const s = start.getTime()
    return mems.filter((m) => (m.createdAt || 0) >= s).length
  }, [mems])
  // Per-stop memory count, so an agenda row can show "N ENTRIES" (a stop that
  // already has memories) — the same signal the old broadsheet "plan" carried.
  const memCountByStop = useMemo(() => {
    const m = new Map()
    for (const x of mems) m.set(x.stopId, (m.get(x.stopId) || 0) + 1)
    return m
  }, [mems])
  const latest = sorted[0]
  const latestLine = latest ? `${TRAVELERS[latest.authorTraveler]?.name || 'Someone'} added · ${relTime(latest.createdAt)}` : null
  const hasPhotos = photoUrls.length > 0
  const upcoming = di.daysUntil != null

  // Ambient line under the place — phase-aware, all from real dates/astronomy.
  const ambient = useMemo(() => {
    const segs = []
    if (isAfter) {
      segs.push('Looking back')
      if (di.nights > 0) segs.push(`${di.nights} night${di.nights > 1 ? 's' : ''}`)
    } else if (upcoming) {
      segs.push(di.daysUntil === 0 ? 'Today' : di.daysUntil === 1 ? 'Tomorrow' : `In ${di.daysUntil} days`)
      if (di.nights > 0) segs.push(`${di.nights} night${di.nights > 1 ? 's' : ''}`)
    } else if (di.dayX) {
      segs.push(`Day ${di.dayX}`)
      if (!isComplex && sun?.goldenHour) segs.push(`golden ${fmtTime(sun.goldenHour)}`)
    } else if (di.nights > 0) {
      segs.push(`${di.nights} night${di.nights > 1 ? 's' : ''}`)
    }
    if (isComplex && !isAfter && partN > 1 && partIdx >= 0) segs.push(`part ${partIdx + 1} of ${partN}`)
    return segs.join(' · ')
  }, [isAfter, upcoming, di.daysUntil, di.dayX, di.nights, sun?.goldenHour, isComplex, partN, partIdx])

  // ON THE AGENDA — a stay sheds the road-trip day-by-day broadsheet, but its few
  // PLANNED events (a dinner out, an activity) + any flight are "the exception"
  // (vision §3/§5) that must stay reachable. Surface today's events (or, before
  // the trip, the first day that has any) so opening a stop survives the shed.
  // Lodging is the base, not an agenda item; the flight gets its own line.
  const arrival = useMemo(() => findArrivalStop(trip), [trip])
  const agenda = useMemo(() => {
    const days = trip?.days || []
    const today = todayLocalIso()
    let day = days.find((d) => d.isoDate === today)
    if (!day && upcoming) day = days.find((d) => (d.stops || []).some((s) => s.kind !== 'lodging' && !s.flightNumber))
    const stops = (day?.stops || []).filter((s) => s.kind !== 'lodging' && !s.flightNumber)
    return { day, stops: stops.slice(0, 4) }
  }, [trip, upcoming])
  const hasAgenda = agenda.stops.length > 0 && !!onOpenStop

  return (
    <div data-testid="living-heart-home" style={{ color: 'var(--text)' }}>
      {/* HERO — the place, cinematic. Tapping it opens "where we are" (the map). */}
      <button
        type="button" onClick={onOpenMap} aria-label={`Where we are — ${isStay ? place : (curPart?.place || trip.title)}`}
        style={{
          display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', border: 0, padding: 0,
          position: 'relative', height: 300, overflow: 'hidden', background: 'linear-gradient(135deg, var(--bg2), var(--card))',
        }}
      >
        {heroUrl && (
          <img src={heroUrl} alt="" className="lh-ken" draggable={false} onError={() => setHeroErr(true)}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
              // Suppress iOS Safari's native long-press image callout (Save to
              // Photos / Copy) so a held press reaches the app, not the OS menu —
              // the same guard TripIndex's hero carries (HERO_IMG_STYLE). Without
              // it, this larger, more prominent hero re-invites the exact callout
              // bug that was fixed for the trip-card hero.
              WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none',
            }} />
        )}
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 34%, rgba(0,0,0,0.80))' }} />
        <span style={{ position: 'absolute', left: 20, right: 20, bottom: 16, display: 'block' }}>
          <span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.82)', display: 'block' }}>{trip.title}</span>
          <span style={{ ...DISPLAY, fontSize: 32, color: '#fff', lineHeight: 1.04, display: 'block', marginTop: 6 }}>{heroBig}</span>
          {ambient && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.86)', display: 'block', marginTop: 5 }}>{ambient}</span>}
        </span>
      </button>

      <div style={{ padding: '16px 20px 0' }}>
        {/* THE DAY'S STORY — always reachable (the Weave). Populated when woven;
            else a gentle promise. Either way this is THE weave entry. */}
        <button
          type="button" onClick={onOpenWeave} data-testid="open-weave" aria-label="Read the Weave"
          style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, padding: 0, color: 'var(--text)' }}
        >
          {weave?.opening ? (
            <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 16, lineHeight: 1.5, color: 'var(--text)', display: 'block' }}>{weave.opening}</span>
          ) : (
            <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 15, lineHeight: 1.5, color: 'var(--muted)', display: 'block' }}>
              {isAfter ? 'Your trip’s story lives here.' : upcoming ? 'Your trip’s story will write itself here.' : 'The day’s story appears here once the day has a little in it.'}
            </span>
          )}
          <span style={{ ...MONO, fontSize: 10, color: 'var(--accent-text)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 9 }}>
            {weaveReady && <WeaveReady traveler={traveler} />}
            {weave?.opening ? 'The story so far' : 'The Weave'} <ChevronRight size={12} />
          </span>
        </button>

        {/* THE LIVE PULSE — real "who's around" band (omitted when not present, or
            once the trip is over — there's no live presence to show then). */}
        {!isAfter && whoAround && <div style={{ marginTop: 20 }}>{whoAround}</div>}

        {/* NEXT UP — a complex trip's most imminent timed thing, surfaced
            just-in-time with its ticket image (FAMILY_TRIPS_VISION §11). Tap opens
            the stop's full detail (ticket / flight / logistics). */}
        {!isAfter && nextThing && onOpenStop && (
          <button
            type="button" onClick={() => onOpenStop(nextThing.day.n, nextThing.stop.id)}
            data-testid="next-up" aria-label={`Next up — ${nextThing.stop.name}`}
            style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, marginTop: 18, padding: '12px 13px', cursor: 'pointer', textAlign: 'left', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'min(var(--radius, 12px), 14px)', color: 'var(--text)' }}
          >
            {nextThing.stop.image ? (
              <img src={nextThing.stop.image} alt="" loading="lazy"
                style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }} />
            ) : (
              <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--bg2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {nextThing.stop.flightNumber ? <Plane size={16} style={{ color: 'var(--accent-text)' }} /> : <Ticket size={16} style={{ color: 'var(--accent-text)' }} />}
              </span>
            )}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...MONO, fontSize: 9, color: 'var(--accent-text)', display: 'block' }}>{nextWhen ? `Next up · ${nextWhen}` : 'Next up'}</span>
              <span style={{ fontSize: 14.5, color: 'var(--text)', display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nextThing.stop.name}</span>
              {(nextThing.stop.flightNumber || nextThing.stop.note) && (
                <span style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nextThing.stop.flightNumber
                    ? `${nextThing.stop.flightNumber}${nextThing.stop.flightOrigin ? ` · ${nextThing.stop.flightOrigin}→${nextThing.stop.flightDest || ''}` : ''}`
                    : nextThing.stop.note}
                </span>
              )}
            </span>
            <ChevronRight size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          </button>
        )}

        {/* WHAT YOU COULD DO — a nudge when the trip's still empty/upcoming (real:
            it opens the "We could" tray we already populate, incl. pre-trip). Gone
            once the trip is over (nothing left to do then). */}
        {!isAfter && !hasPhotos && onOpenActivities && (
          <button
            type="button" onClick={onOpenActivities} aria-label="See what you could do"
            style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, marginTop: 18, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'min(var(--radius, 12px), 14px)', color: 'var(--text)' }}
          >
            <Compass size={16} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...MONO, fontSize: 9, color: 'var(--muted)', display: 'block' }}>While you’re there</span>
              <span style={{ fontSize: 13.5, color: 'var(--text)', display: 'block', marginTop: 2 }}>See what you could do nearby</span>
            </span>
            <ChevronRight size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          </button>
        )}

        {/* PHOTOS — "Lately" during a trip; a fuller WALL once it's over (keepsake). */}
        <div style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ ...DISPLAY, fontSize: 18, color: 'var(--text)' }}>{isAfter ? 'The trip in photos' : 'Lately'}</span>
            {!isAfter && hasPhotos && todayCount > 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{todayCount} today</span>}
          </div>
          {hasPhotos ? (
            <>
              <div style={{ display: 'flex', flexWrap: isAfter ? 'wrap' : 'nowrap', gap: 9, marginTop: 11, overflowX: isAfter ? 'visible' : 'auto' }}>
                {photoUrls.map((u, i) => (
                  <button
                    key={i} type="button" onClick={onOpenAllPhotos}
                    aria-label={`Open photos — ${i + 1} of ${photoUrls.length}`}
                    style={{ flex: '0 0 auto', width: 104, height: 104, borderRadius: 'min(var(--radius, 12px), 14px)', overflow: 'hidden', border: '1px solid var(--border)', padding: 0, cursor: 'pointer', background: 'var(--bg2)' }}
                  >
                    <img src={u} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
              {!isAfter && latestLine && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>{latestLine}</div>}
            </>
          ) : (
            <div style={{ marginTop: 11, padding: '18px 14px', borderRadius: 'min(var(--radius, 12px), 14px)', border: '1px dashed var(--line-bold, var(--border))', textAlign: 'center', fontSize: 12.5, color: 'var(--muted)' }}>
              {isAfter ? 'No photos from this trip.' : 'Photos will gather here as you go'}
            </div>
          )}
        </div>

        {/* RELIVE IT — the keepsake's primary action once a trip is over. */}
        {isAfter && hasPhotos && onOpenReplay && (
          <button
            type="button" onClick={onOpenReplay} data-testid="relive-trip" aria-label="Relive the trip"
            style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18, padding: '13px 14px', cursor: 'pointer', background: 'var(--accent)', color: 'var(--accent-ink, #fff)', border: 0, borderRadius: 'min(var(--radius, 12px), 14px)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600 }}
          >
            <Play size={16} /> Relive the trip
          </button>
        )}

        {/* ON THE AGENDA — a stay's few planned events + flight (the exception,
            vision §5), kept reachable now the road-trip itinerary is shed. Each
            row opens the stop; renders only when there's something planned. */}
        {!isAfter && !isComplex && (hasAgenda || (arrival && onOpenStop)) && (
          <div style={{ marginTop: 22 }}>
            <span style={{ ...DISPLAY, fontSize: 18, color: 'var(--text)' }}>On the agenda</span>
            <div style={{ marginTop: 11, border: '1px solid var(--border)', borderRadius: 'min(var(--radius, 12px), 14px)', overflow: 'hidden' }}>
              {arrival && onOpenStop && (
                <button
                  type="button" onClick={() => onOpenStop(arrival.day.n, arrival.stop.id)}
                  aria-label={`Flight ${arrival.stop.flightNumber || ''}`.trim()}
                  style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 11, textAlign: 'left', cursor: 'pointer', background: 'var(--card)', border: 0, padding: '11px 13px', color: 'var(--text)' }}
                >
                  <Plane size={15} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ ...MONO, fontSize: 9, color: 'var(--muted)', display: 'block' }}>Flight</span>
                    <span style={{ fontSize: 13.5, color: 'var(--text)', display: 'block', marginTop: 2 }}>
                      {arrival.stop.flightNumber || 'Flight'}{arrival.stop.flightOrigin ? ` · ${arrival.stop.flightOrigin}→${arrival.stop.flightDest || ''}` : ''}
                    </span>
                  </span>
                  <ChevronRight size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                </button>
              )}
              {agenda.stops.map((s, i) => {
                const ec = memCountByStop.get(s.id) || 0
                return (
                  <button
                    key={s.id} type="button" onClick={() => onOpenStop(agenda.day.n, s.id)}
                    aria-label={s.name}
                    style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 11, textAlign: 'left', cursor: 'pointer', background: 'var(--card)', border: 0, borderTop: (i > 0 || (arrival && onOpenStop)) ? '1px solid var(--border)' : 0, padding: '11px 13px', color: 'var(--text)' }}
                  >
                    <span style={{ ...MONO, fontSize: 10, color: 'var(--muted)', width: 52, flexShrink: 0 }}>{(s.time || '').replace(' ', '')}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    {ec > 0 && <span style={{ ...MONO, fontSize: 8.5, color: 'var(--accent-text)', flexShrink: 0 }}>{ec} {ec === 1 ? 'ENTRY' : 'ENTRIES'}</span>}
                    <ChevronRight size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* THE PLAN — a complex trip's full parts → days → stops, folded in below
            the live lead (the old separate PartsTripView is retired). One home. */}
        {isComplex && !isAfter && (
          <div style={{ marginTop: 22 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ ...DISPLAY, fontSize: 18, color: 'var(--text)' }}>The plan</span>
              {partN > 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{partN} {partN === 1 ? 'part' : 'parts'}</span>}
            </div>
            <div style={{ marginTop: 11 }}>
              <PartsOutline trip={trip} onOpenStop={onOpenStop} />
            </div>
          </div>
        )}

        {/* NEXT — quiet, present but not dominating (real readout only) */}
        {nowReadout?.next && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--live, var(--accent))', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Next · {nowReadout.next}</span>
          </div>
        )}

        {/* QUIET ACTIONS — the folded features (demoted, NOT deleted: do-not-lose).
            Replay only when there's something to replay (honest). */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 18, paddingTop: 14, borderTop: nowReadout?.next ? 0 : '1px solid var(--border)' }}>
          {onCompose && <QuietAction onClick={onCompose} icon={<Share2 size={13} />} label="Share a moment" />}
          {onOpenSurprises && <QuietAction onClick={onOpenSurprises} icon={<Sparkles size={13} />} label="Surprises" />}
          {!isAfter && hasPhotos && onOpenReplay && <QuietAction onClick={onOpenReplay} icon={<Play size={13} />} label="Replay" />}
          {bookHasPages && onOpenBook && <QuietAction onClick={onOpenBook} icon={<BookOpen size={13} />} label="The book" aria="The Book · kept pages" />}
        </div>
      </div>
    </div>
  )
}

function QuietAction({ onClick, icon, label, aria }) {
  return (
    <button
      type="button" onClick={onClick} aria-label={aria || label}
      // minHeight 44 gives a comfortable phone tap target (the text-line box
      // alone was ~17px — easy to mis-tap); horizontal padding keeps the hit
      // area generous without making these quiet links look like filled buttons.
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 6px', margin: '0 -6px', background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--accent-text)', fontSize: 12.5, fontFamily: 'var(--font-body)' }}
    >
      {icon}{label}
    </button>
  )
}
