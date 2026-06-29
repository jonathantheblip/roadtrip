// LivingHeartHome — the redesigned "Now" home for a STAY. One component, themed
// entirely by the active lens's CSS vars ([data-theme] on <body>), so it renders
// correctly for Jonathan / Helen / Aurelia without forking. Design approved
// 2026-06-28: lean bones, living heart — and it must feel alive at EVERY stage,
// not just when full (Jonathan's empty-state note). So it grows with the trip:
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
import { ChevronRight, Play, BookOpen, Sparkles, Share2, Compass } from 'lucide-react'
import { fetchStoredWeave } from '../lib/weave'
import { WeaveReady } from '../components/EntryCues'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { stayLabel, stayNights, stayPlaceCoords } from '../lib/tripShape'
import { sunTimes } from '../lib/sunTimes'
import { tripPhase } from '../lib/tripPhase'
import { todayLocalIso } from '../lib/localDate'
import { TRAVELERS } from '../data/travelers'

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

export function LivingHeartHome({
  trip, traveler, nowReadout, whoAround, weaveReady, bookHasPages,
  onOpenMap, onOpenWeave, onOpenReplay, onOpenBook, onOpenSurprises, onCompose, onOpenAllPhotos, onOpenActivities,
}) {
  const [weave, setWeave] = useState(null)
  const [heroErr, setHeroErr] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetchStoredWeave(trip.id).then((w) => { if (!cancelled) setWeave(w) }).catch(() => {})
    return () => { cancelled = true }
  }, [trip.id])

  const place = stayLabel(trip)
  const phase = tripPhase(trip)
  const di = useMemo(() => dayInfo(trip), [trip])
  const coords = useMemo(() => stayPlaceCoords(trip), [trip])
  const sun = useMemo(() => (coords ? sunTimes(new Date(), coords.lat, coords.lng) : null), [coords?.lat, coords?.lng])
  const heroUrl = (!heroErr && (trip.heroImage || trip.heroResolved?.url)) || null

  const mems = useMemo(() => listMemoriesForTrip(trip.id, traveler), [trip.id, traveler])
  const sorted = useMemo(() => [...mems].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [mems])
  const photoUrls = useMemo(() => {
    const out = []
    for (const m of sorted) {
      if (Array.isArray(m.photoRefs)) { for (const r of m.photoRefs) if (r?.url) out.push(r.url) }
      else if (m.photoRef?.url) out.push(m.photoRef.url)
      if (out.length >= 6) break
    }
    return out.slice(0, 6)
  }, [sorted])
  const todayCount = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const s = start.getTime()
    return mems.filter((m) => (m.createdAt || 0) >= s).length
  }, [mems])
  const latest = sorted[0]
  const latestLine = latest ? `${TRAVELERS[latest.authorTraveler]?.name || 'Someone'} added · ${relTime(latest.createdAt)}` : null
  const hasPhotos = photoUrls.length > 0
  const upcoming = di.daysUntil != null

  // Ambient line under the place — phase-aware, all from real dates/astronomy.
  const ambient = useMemo(() => {
    const parts = []
    if (upcoming) {
      parts.push(di.daysUntil === 0 ? 'Today' : di.daysUntil === 1 ? 'Tomorrow' : `In ${di.daysUntil} days`)
      if (di.nights > 0) parts.push(`${di.nights} night${di.nights > 1 ? 's' : ''}`)
    } else if (di.dayX) {
      parts.push(`Day ${di.dayX}`)
      if (sun?.goldenHour) parts.push(`golden ${fmtTime(sun.goldenHour)}`)
    } else if (di.nights > 0) {
      parts.push(`${di.nights} night${di.nights > 1 ? 's' : ''}`)
    }
    return parts.join(' · ')
  }, [upcoming, di.daysUntil, di.dayX, di.nights, sun?.goldenHour])

  return (
    <div data-testid="living-heart-home" style={{ color: 'var(--text)' }}>
      {/* HERO — the place, cinematic. Tapping it opens "where we are" (the map). */}
      <button
        type="button" onClick={onOpenMap} aria-label={`Where we are — ${place}`}
        style={{
          display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', border: 0, padding: 0,
          position: 'relative', height: 300, overflow: 'hidden', background: 'linear-gradient(135deg, var(--bg2), var(--card))',
        }}
      >
        {heroUrl && (
          <img src={heroUrl} alt="" className="lh-ken" onError={() => setHeroErr(true)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 34%, rgba(0,0,0,0.80))' }} />
        <span style={{ position: 'absolute', left: 20, right: 20, bottom: 16, display: 'block' }}>
          <span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.82)', display: 'block' }}>{trip.title}</span>
          <span style={{ ...DISPLAY, fontSize: 32, color: '#fff', lineHeight: 1.04, display: 'block', marginTop: 6 }}>At {place}</span>
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
              {upcoming ? 'Your trip’s story will write itself here.' : 'The day’s story appears here once the day has a little in it.'}
            </span>
          )}
          <span style={{ ...MONO, fontSize: 10, color: 'var(--accent-text)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 9 }}>
            {weaveReady && <WeaveReady traveler={traveler} />}
            {weave?.opening ? 'The story so far' : 'The Weave'} <ChevronRight size={12} />
          </span>
        </button>

        {/* THE LIVE PULSE — real "who's around" band (omitted when not present) */}
        {whoAround && <div style={{ marginTop: 20 }}>{whoAround}</div>}

        {/* WHAT YOU COULD DO — a nudge when the trip's still empty/upcoming (real:
            it opens the "We could" tray we already populate, incl. pre-trip). */}
        {!hasPhotos && onOpenActivities && (
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

        {/* LATELY — the family's recent photos, or a gentle "they'll gather here" */}
        <div style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ ...DISPLAY, fontSize: 18, color: 'var(--text)' }}>Lately</span>
            {hasPhotos && todayCount > 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{todayCount} today</span>}
          </div>
          {hasPhotos ? (
            <>
              <div style={{ display: 'flex', gap: 9, marginTop: 11, overflowX: 'auto' }}>
                {photoUrls.map((u, i) => (
                  <button
                    key={i} type="button" onClick={onOpenAllPhotos} aria-label="Open photos"
                    style={{ flex: '0 0 auto', width: 104, height: 104, borderRadius: 'min(var(--radius, 12px), 14px)', overflow: 'hidden', border: '1px solid var(--border)', padding: 0, cursor: 'pointer', background: 'var(--bg2)' }}
                  >
                    <img src={u} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
              {latestLine && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>{latestLine}</div>}
            </>
          ) : (
            <div style={{ marginTop: 11, padding: '18px 14px', borderRadius: 'min(var(--radius, 12px), 14px)', border: '1px dashed var(--line-bold, var(--border))', textAlign: 'center', fontSize: 12.5, color: 'var(--muted)' }}>
              Photos will gather here as you go
            </div>
          )}
        </div>

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
          {hasPhotos && onOpenReplay && <QuietAction onClick={onOpenReplay} icon={<Play size={13} />} label="Replay" />}
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
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'var(--accent-text)', fontSize: 12.5, fontFamily: 'var(--font-body)' }}
    >
      {icon}{label}
    </button>
  )
}
