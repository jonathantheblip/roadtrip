import { useEffect, useRef, useState } from 'react'
import { Clock, MapPin, AlertCircle, RotateCw, X, Navigation } from 'lucide-react'
import { TRAVELERS } from '../data/travelers'
import {
  computeLeaveWhen,
  defaultBufferMinutes,
  formatTimeOfDay,
  parseStopTime,
  reachability,
  roundToNextNMinutes,
} from '../lib/leaveWhen'

// "Getting there" modal (Design decision 2). It reads the MODE and shapes
// itself to it — a short walk shouldn't wear a car's clothing:
//   - WALK (short straight-line hop): "About a N-min walk." Open-ended (a stop
//     with no fixed time) shows NO leave-by at all — "no need to time it." A
//     fixed time gets a gentle nudge ("head out around H:MM — not an alarm"),
//     never a red countdown. Deep-link → Apple Maps WALKING. No Worker call.
//   - DRIVE (anything farther): today's traffic-aware leave-by, unchanged — a
//     big "Leave by H:MMpm" from the Worker, "≈ N min in traffic", the amber
//     "Heavier than usual" pill, the 30-min live countdown (amber ≤10, red if
//     past), "Open in Maps/Waze", and "Re-check" (bypasses the 5-min cache).
//
// Transit ETAs are intentionally NOT shown (no transit data source — we won't
// fabricate "Blue Line ~18 min"); that face waits for a real source.
// Two origin modes: the trip's place/home base (default) or geolocation.

const COUNTDOWN_THRESHOLD_MS = 30 * 60 * 1000
const AMBER_THRESHOLD_MS = 10 * 60 * 1000

// The first, friendly segment of an origin label ("Harbor Breeze, 690 …" →
// "Harbor Breeze") for the "from [place]" line. Empty → the caller omits it.
function shortPlaceLabel(label) {
  return String(label || '').split(',')[0].trim()
}

function defaultTargetArrival() {
  // Now + 1 hour, rounded up to the next 15-min boundary.
  return roundToNextNMinutes(new Date(Date.now() + 60 * 60 * 1000), 15)
}

function toInputValue(d) {
  // datetime-local needs YYYY-MM-DDTHH:mm in local time
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromInputValue(s) {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

// Map a thrown error (from computeLeaveWhen → workerFetch) to friendly,
// trip-appropriate copy. The raw message ("worker 500: …", a JSON body, or a
// stack) must never reach the family — that's logged to the console instead.
export function friendlyLeaveWhenError(e) {
  const status = e?.status
  if (status === 401 || status === 403) return "We couldn't reach the travel-time service. Try again in a moment."
  if (status === 429) return 'Checking a lot right now — give it a few seconds and try again.'
  if (typeof status === 'number' && status >= 500) return "The travel-time service is having a moment. Tap re-check to try again."
  // No status → almost always offline / network blip in the field.
  if (e?.message === 'worker not configured') return "Travel times aren't available right now."
  return "We couldn't work out a leave-by time. Check your connection and tap re-check."
}

function mapsLinkFor(destination, traveler, name, mode = 'drive') {
  // A walk always opens Apple Maps WALKING directions — Waze is a driving app,
  // so the mode wins over a traveler's Waze preference for an on-foot hop.
  if (mode === 'walk') {
    return `https://maps.apple.com/?daddr=${destination.lat},${destination.lng}&dirflg=w`
  }
  if (TRAVELERS[traveler]?.maps === 'waze') {
    return `https://waze.com/ul?ll=${destination.lat},${destination.lng}&navigate=yes`
  }
  return `https://maps.apple.com/?q=${encodeURIComponent(
    name || ''
  )}&ll=${destination.lat},${destination.lng}`
}

export function LeaveWhenModal({
  destination,
  destinationName,
  defaultOrigin,
  defaultTarget,
  seedDurationMinutes,
  traveler,
  onClose,
}) {
  const initialTarget = defaultTarget || defaultTargetArrival()
  const [targetISO, setTargetISO] = useState(toInputValue(initialTarget))

  const [originMode, setOriginMode] = useState('home') // 'home' | 'here'
  const [hereCoords, setHereCoords] = useState(null)
  const [geoError, setGeoError] = useState(null)

  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [refreshCounter, setRefreshCounter] = useState(0)

  // Live countdown ticker — only enabled once we have a result inside
  // the COUNTDOWN_THRESHOLD window.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!result) return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [result])

  // Resolve the effective origin based on the mode toggle.
  const effectiveOrigin =
    originMode === 'here' && hereCoords ? hereCoords : defaultOrigin

  // The travel MODE (decision 2). A short straight-line hop from the origin is a
  // WALK; anything farther keeps today's DRIVE flow. Recomputes live as the
  // origin toggles (home ↔ here). `hasFixedTime` = the caller passed a real stop
  // time; an open-ended stop (no target) gets no leave-by at all on a walk.
  const reach = reachability(effectiveOrigin, destination)
  const mode = reach.mode
  const hasFixedTime = !!defaultTarget
  const originLabel =
    originMode === 'here' ? 'where you are' : shortPlaceLabel(defaultOrigin?.label)

  // Geolocation request when the user flips the toggle.
  useEffect(() => {
    if (originMode !== 'here' || hereCoords) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Geolocation not available; using home base.')
      setOriginMode('home')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHereCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoError(null)
      },
      () => {
        setGeoError('Location denied; using home base.')
        setOriginMode('home')
      },
      { timeout: 8000, maximumAge: 60_000 }
    )
  }, [originMode, hereCoords])

  // Kick off the Worker call any time inputs change — DRIVE mode only. A walk
  // never asks the Worker (there's no traffic to beat); clear any stale drive
  // result so flipping origin from a far drive to a near walk goes calm.
  useEffect(() => {
    if (mode !== 'drive') {
      setResult(null)
      setError(null)
      setLoading(false)
      return
    }
    const target = fromInputValue(targetISO)
    if (!target || !effectiveOrigin) return
    if (target.getTime() <= Date.now()) {
      setError('Target time is already past.')
      setResult(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    computeLeaveWhen({
      origin: effectiveOrigin,
      destination,
      targetArrival: target,
      seedDurationMinutes,
      bypassCache: refreshCounter > 0,
    })
      .then((r) => {
        if (!cancelled) setResult(r)
      })
      .catch((e) => {
        if (!cancelled) {
          // Never surface the raw worker error ("worker 500: …", JSON bodies)
          // to the family — keep it in the console for us, show plain copy.
          console.error('[LeaveWhen] compute failed', e)
          setError(friendlyLeaveWhenError(e))
          setResult(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [targetISO, effectiveOrigin, destination, seedDurationMinutes, refreshCounter, mode])

  // Compute the countdown banner. Recomputes every render (tick state
  // forces re-render every 30s).
  void tick
  let countdown = null
  if (result?.leaveBy) {
    const msToLeave = result.leaveBy.getTime() - Date.now()
    if (msToLeave <= COUNTDOWN_THRESHOLD_MS) {
      countdown = msToLeave < 0
        ? { text: 'Leave-by passed', tone: 'past' }
        : msToLeave <= AMBER_THRESHOLD_MS
          ? { text: `Leave in ${Math.max(1, Math.round(msToLeave / 60_000))} min`, tone: 'soon' }
          : { text: `Leave in ${Math.round(msToLeave / 60_000)} min`, tone: 'ok' }
    }
  }

  // Walk soft-nudge: head out roughly walkMinutes before the target — a gentle
  // "around H:MM," never a countdown. Only when there's a real fixed time.
  const walkTarget = fromInputValue(targetISO)
  const walkHeadOut =
    mode === 'walk' && hasFixedTime && walkTarget
      ? new Date(walkTarget.getTime() - (reach.walkMinutes || 0) * 60_000)
      : null

  // Whether to show the "Be there by" time input: always for a drive; for a
  // walk only when there's a fixed time to nudge toward (open-ended → hidden).
  const showTimeInput = mode === 'drive' || (mode === 'walk' && hasFixedTime)

  const mapsUrl = mapsLinkFor(destination, traveler, destinationName, mode)

  return (
    <div
      role="dialog"
      aria-label="Getting there"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'color-mix(in srgb, var(--bg, #000) 70%, transparent)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'var(--bg)',
          color: 'var(--text)',
          width: '100%',
          maxWidth: 480,
          maxHeight: '92vh',
          overflowY: 'auto',
          borderRadius: '16px 16px 0 0',
          padding: '22px 22px 30px',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.32)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 18,
          }}
        >
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              opacity: 0.6,
            }}
          >
            Getting there
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 0,
              padding: 4,
              cursor: 'pointer',
              color: 'var(--muted)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {destinationName && (
          <div
            style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 14,
              color: 'var(--text)',
            }}
          >
            To {destinationName}
          </div>
        )}

        {mode === 'walk' ? (
          <WalkBlock
            walkMinutes={reach.walkMinutes}
            headOut={walkHeadOut}
            hasFixedTime={hasFixedTime}
            originLabel={originLabel}
          />
        ) : (
          <ResultBlock
            loading={loading}
            error={error}
            result={result}
            countdown={countdown}
          />
        )}

        {showTimeInput && (
          <div style={{ marginTop: 22 }}>
            <Label>Be there by</Label>
            <input
              type="datetime-local"
              value={targetISO}
              onChange={(e) => setTargetISO(e.target.value)}
              style={inputStyle}
            />
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <Label>Leaving from</Label>
          <div style={{ display: 'flex', gap: 6 }}>
            <OriginPill
              active={originMode === 'home'}
              onClick={() => setOriginMode('home')}
              label="Home base"
            />
            <OriginPill
              active={originMode === 'here'}
              onClick={() => setOriginMode('here')}
              label="From here"
              icon={<Navigation size={11} />}
            />
          </div>
          {geoError && (
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: 'var(--muted)',
                fontStyle: 'italic',
              }}
            >
              {geoError}
            </div>
          )}
          {originMode === 'here' && !hereCoords && !geoError && (
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: 'var(--muted)',
                fontStyle: 'italic',
              }}
            >
              Locating…
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap' }}>
          {mode === 'walk' ? (
            // A walk opens Apple Maps walking directions; no traffic "re-check"
            // (there's no Worker call to redo).
            <a className="btn-pill" href={mapsUrl} target="_blank" rel="noreferrer">
              <Navigation size={12} />
              Walk there
            </a>
          ) : (
            <>
              <a className="btn-pill" href={mapsUrl} target="_blank" rel="noreferrer">
                <MapPin size={12} />
                {TRAVELERS[traveler]?.maps === 'waze' ? 'Open in Waze' : 'Open in Maps'}
              </a>
              <button
                type="button"
                className="btn-pill"
                onClick={() => setRefreshCounter((c) => c + 1)}
                style={{ cursor: 'pointer' }}
                disabled={loading}
              >
                <RotateCw size={12} />
                Re-check
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// The WALK face (decision 2) — warm, never a countdown. Open-ended shows no
// time at all ("no need to time it"); a fixed time gets a gentle "head out
// around H:MM" nudge. The precise time comes from the walking deep-link.
function WalkBlock({ walkMinutes, headOut, hasFixedTime, originLabel }) {
  return (
    <div style={resultBlockStyle}>
      <div style={headlineStyle}>About a {walkMinutes}-min walk</div>
      {hasFixedTime && headOut ? (
        <div style={subTextStyle}>
          Head out around {formatTimeOfDay(headOut)} — a gentle nudge, not an alarm.
        </div>
      ) : (
        <div style={subTextStyle}>No need to time it — head over when you like.</div>
      )}
      {originLabel && (
        <div style={{ ...subTextStyle, fontStyle: 'normal', fontSize: 12, marginTop: 2, opacity: 0.8 }}>
          from {originLabel}
        </div>
      )}
    </div>
  )
}

function ResultBlock({ loading, error, result, countdown }) {
  if (loading && !result) {
    return (
      <div style={resultBlockStyle}>
        <SkeletonHeadline />
        <div style={subTextStyle}>Computing leave-by…</div>
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ ...resultBlockStyle, color: 'var(--accent-text)' }}>
        <div style={{ ...headlineStyle, fontSize: 22 }}>—</div>
        <div style={subTextStyle}>{error}</div>
      </div>
    )
  }
  if (!result) {
    return (
      <div style={resultBlockStyle}>
        <div style={{ ...headlineStyle, opacity: 0.4 }}>—</div>
      </div>
    )
  }

  const headlineColor =
    countdown?.tone === 'past'
      ? 'var(--accent)'
      : countdown?.tone === 'soon'
        ? 'var(--accent-warning, #f59e0b)'
        : 'var(--text)'

  return (
    <div style={resultBlockStyle}>
      <div style={{ ...headlineStyle, color: headlineColor }}>
        {countdown ? countdown.text : `Leave by ${formatTimeOfDay(result.leaveBy)}`}
      </div>
      <div style={subTextStyle}>
        ≈ {result.durationMinutes} min in traffic
      </div>
      {result.trafficNote && (
        <div
          style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 12,
            background: 'color-mix(in srgb, var(--accent-warning, #f59e0b) 18%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent-warning, #f59e0b) 50%, transparent)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            letterSpacing: '0.06em',
            color: 'var(--text)',
          }}
        >
          <AlertCircle size={10} />
          {result.trafficNote}
        </div>
      )}
    </div>
  )
}

function SkeletonHeadline() {
  return (
    <div
      style={{
        height: 38,
        width: '60%',
        background:
          'linear-gradient(90deg, var(--border) 0%, color-mix(in srgb, var(--border) 50%, transparent) 50%, var(--border) 100%)',
        backgroundSize: '200% 100%',
        borderRadius: 6,
        animation: 'pulseShimmer 1.4s ease-in-out infinite',
      }}
    />
  )
}

function Label({ children }) {
  return (
    <div
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        opacity: 0.55,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  )
}

function OriginPill({ active, onClick, label, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '7px 12px',
        borderRadius: 14,
        border: '1px solid',
        borderColor: active ? 'var(--text)' : 'var(--border)',
        background: active ? 'var(--text)' : 'transparent',
        color: active ? 'var(--bg)' : 'inherit',
        cursor: 'pointer',
        fontFamily: 'Inter Tight, system-ui, sans-serif',
        fontSize: 12,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {icon}
      {label}
    </button>
  )
}

const resultBlockStyle = {
  paddingTop: 4,
}

const headlineStyle = {
  fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
  fontSize: 36,
  fontWeight: 700,
  lineHeight: 1.05,
  letterSpacing: '-0.02em',
}

const subTextStyle = {
  fontFamily: 'Fraunces, Georgia, serif',
  fontStyle: 'italic',
  fontSize: 14,
  color: 'var(--muted)',
  marginTop: 4,
}

const inputStyle = {
  width: '100%',
  padding: '9px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--text)',
  fontFamily: 'Inter Tight, system-ui, sans-serif',
  fontSize: 14,
}

// Vague itinerary time words → an approximate local hour, so a "Dinner" or
// "Evening" stop still gets a sensible arrival default instead of falling all
// the way back to "now + 1 hour" (which had nothing to do with the booking).
const VAGUE_ARRIVAL_HOURS = {
  morning: 8, breakfast: 8, brunch: 11, noon: 12, midday: 12, lunch: 12,
  afternoon: 14, dinner: 19, evening: 19, sundown: 19, sunset: 19, night: 20,
}
function vagueStopArrival(timeStr, isoDate) {
  const key = String(timeStr || '').trim().toLowerCase()
  const hour = VAGUE_ARRIVAL_HOURS[key]
  if (!Number.isFinite(hour) || typeof isoDate !== 'string') return null
  const d = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(hour, 0, 0, 0)
  return d
}

// Convenience: derive a sensible default target arrival from a Stop.
// stop.time (free-text like "3:45PM" OR a vague word like "Dinner"),
// day.isoDate ("2026-05-22"), and kind-driven buffer combine into
// target = startTime − buffer. Only a stop with genuinely no time at all
// returns null (the modal then falls back to now + 1h).
export function leaveWhenDefaultForStop(stop, day) {
  if (!stop || !day) return null
  const start = parseStopTime(stop.time, day.isoDate) || vagueStopArrival(stop.time, day.isoDate)
  if (!start) return null
  const buffer = stop.arrivalBuffer ?? defaultBufferMinutes(stop.kind)
  return new Date(start.getTime() - buffer * 60 * 1000)
}
