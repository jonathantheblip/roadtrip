import { useEffect, useState } from 'react'
import { findDay, findStop } from './data/trips'
import { TRAVELER_ORDER } from './data/travelers'
import { Switcher } from './views/Switcher'
import { JonathanView } from './views/JonathanView'
import { HelenView } from './views/HelenView'
import { AureliaView } from './views/AureliaView'
import { RafaView } from './views/RafaView'
import { TripIndex } from './views/TripIndex'
import { StopDetail } from './views/StopDetail'
import { Settings } from './views/Settings'
import { NewTrip } from './views/NewTrip'
import { useHelenDark } from './hooks/useHelenDark'
import { useTrips } from './hooks/useTrips'
import { pullAll } from './lib/workerSync'
import { mergeFromRemote } from './lib/memoryStore'
import './styles/platform.css'

// Per-traveler palette tokens for the fixed top bar. Spec §6 dark/light:
// Jonathan permanent dark; Aurelia permanent light; Rafa permanent dark;
// Helen toggles via her settings. Returns { gradient, text }.
function topBarTokens(traveler, helenDark) {
  if (traveler === 'jonathan' || traveler === 'rafa') {
    return {
      gradient: 'linear-gradient(to bottom, rgba(20,17,13,.92), rgba(20,17,13,0))',
      text: '#F2EBDA',
      opacity: 0.7,
    }
  }
  if (traveler === 'helen' && helenDark) {
    return {
      gradient: 'linear-gradient(to bottom, rgba(20,17,13,.92), rgba(20,17,13,0))',
      text: '#F2EBDA',
      opacity: 0.7,
    }
  }
  return {
    gradient: 'linear-gradient(to bottom, rgba(245,240,231,.85), rgba(245,240,231,0))',
    text: '#1A1614',
    opacity: 0.5,
  }
}

const STORAGE_KEY = 'rt_person_v2'

// Read the active traveler the same way the existing PWA does — query
// param, cookie, then localStorage. Keeps installed home-screen launches
// landing on the right person.
function readTraveler() {
  try {
    const q = new URLSearchParams(window.location.search).get('person')
    if (TRAVELER_ORDER.includes(q)) return q
  } catch {
    /* ignore */
  }
  try {
    const m = document.cookie.match(/(?:^|; )rt_person=([^;]*)/)
    if (m) {
      const v = decodeURIComponent(m[1])
      if (TRAVELER_ORDER.includes(v)) return v
    }
  } catch {
    /* ignore */
  }
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (TRAVELER_ORDER.includes(v)) return v
  } catch {
    /* ignore */
  }
  return 'jonathan'
}

function writeTravelerCookie(value) {
  try {
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
    document.cookie = `rt_person=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`
  } catch {
    /* ignore */
  }
}

// Read the requested trip id from the URL — actual existence check
// happens in the render pass once useTrips has resolved.
function readRequestedTripId() {
  try {
    return new URLSearchParams(window.location.search).get('trip') || null
  } catch {
    return null
  }
}

// Default landing trip when the URL doesn't pin one: latest dateRangeStart
// wins, so adding a future trip auto-rolls the cold-start view forward.
function pickDefaultTrip(trips) {
  if (!trips || trips.length === 0) return null
  return trips.reduce((best, t) =>
    (t.dateRangeStart || '') > (best.dateRangeStart || '') ? t : best
  )
}

export default function App() {
  const [traveler, setTraveler] = useState(readTraveler)
  const [tripId, setTripId] = useState(readRequestedTripId)
  const [view, setView] = useState({ name: 'trip' }) // 'index' | 'trip' | 'stop' | 'settings' | 'new'
  const [helenDark, toggleHelenDark] = useHelenDark()
  const tripsApi = useTrips()
  const allTrips = tripsApi.trips
  const topBar = topBarTokens(traveler, helenDark)
  // Spec §6: Jonathan + Rafa permanent dark; Helen dark when toggled on.
  // Aurelia stays light. This drives the StopDetail / Settings surface.
  const darkSurface =
    traveler === 'jonathan' ||
    traveler === 'rafa' ||
    (traveler === 'helen' && helenDark)

  // Persist traveler across reloads + standalone PWA boundary.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, traveler)
    } catch {
      /* ignore */
    }
    writeTravelerCookie(traveler)
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('person') !== traveler) {
        url.searchParams.set('person', traveler)
        window.history.replaceState(null, '', url.toString())
      }
    } catch {
      /* ignore */
    }
  }, [traveler])

  // The CSS theme cascade. Helen has two palettes — `helen` (linen
  // archive) and `helen-dark` (oxblood evening). Re-runs on toggle.
  useEffect(() => {
    const themeName = traveler === 'helen' && helenDark ? 'helen-dark' : traveler
    document.documentElement.setAttribute('data-theme', themeName)
    document.body.setAttribute('data-theme', themeName)
  }, [traveler, helenDark])

  // Mirror tripId in the URL too, so a home-screen save remembers it.
  useEffect(() => {
    if (!tripId) return
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('trip') !== tripId) {
        url.searchParams.set('trip', tripId)
        window.history.replaceState(null, '', url.toString())
      }
    } catch {
      /* ignore */
    }
  }, [tripId])

  // Auto-sync from the Worker on cold load and whenever the tab returns
  // to the foreground, so the family thread updates without anyone
  // having to remember to hit Pull. Throttled so quickly toggling
  // back-and-forth doesn't spam the API. Silent — failures don't
  // surface (the explicit Pull button in Settings still gives users a
  // way to see real status when they want it).
  useEffect(() => {
    let lastRun = 0
    let cancelled = false
    const THROTTLE_MS = 5000

    async function runSync() {
      const now = Date.now()
      if (now - lastRun < THROTTLE_MS) return
      lastRun = now
      try {
        const remote = await pullAll()
        if (cancelled) return
        if (remote.length > 0) mergeFromRemote(remote)
        await tripsApi.refresh?.()
      } catch (err) {
        // Worker unconfigured / offline — fine, stay on local cache.
        console.warn('autoSync failed', err)
      }
    }

    runSync() // initial pull on cold load

    function onVisibility() {
      if (document.visibilityState === 'visible') runSync()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const trip =
    (tripId && allTrips.find((t) => t.id === tripId)) || pickDefaultTrip(allTrips)
  const day = view.name === 'stop' && trip ? findDay(trip, view.dayN) : null
  const stop = view.name === 'stop' && day ? findStop(day, view.stopId) : null

  function openTrip(id) {
    setTripId(id)
    setView({ name: 'trip' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }
  function openStop(dayN, stopId) {
    setView({ name: 'stop', dayN, stopId })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  // Day-chip strip on StopDetail uses this to jump between days. The
  // chip gives Day N → first stop of that day; the Stop view itself is
  // the only deep-link target we have today.
  function openDayFirstStop(dayN) {
    if (!trip) return
    const target = trip.days.find((d) => d.n === dayN)
    const firstStop = target?.stops?.[0]
    if (!firstStop) return
    setView({ name: 'stop', dayN, stopId: firstStop.id })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  function openSettings() {
    setView({ name: 'settings' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  function openIndex() {
    setView({ name: 'index' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  function openNewTrip() {
    setView({ name: 'new' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  async function handleCreateTrip(newTrip) {
    await tripsApi.addTrip(newTrip)
    setTripId(newTrip.id)
    setView({ name: 'trip' })
  }
  function handleTravelerSwitch(id) {
    setTraveler(id)
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  // Render the per-traveler themed surface for the active trip
  function renderTripView() {
    if (!trip) return null
    const props = {
      trip,
      traveler,
      onOpenStop: openStop,
      onOpenSettings: openSettings,
    }
    switch (traveler) {
      case 'helen':
        return <HelenView {...props} />
      case 'aurelia':
        return <AureliaView {...props} />
      case 'rafa':
        return <RafaView {...props} />
      case 'jonathan':
      default:
        return <JonathanView {...props} />
    }
  }

  return (
    <>
      {/* Top-of-screen trip / index switch — small and editorial, never the focus */}
      {view.name !== 'index' && view.name !== 'new' && (
        <div
          className="px-6"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            paddingTop: 'max(8px, env(safe-area-inset-top))',
            paddingBottom: 8,
            background: topBar.gradient,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {/* Context-aware back: from a stop or settings, "back" should
              return to the per-traveler trip home, not jump out to the
              trip index. The trip-switcher dropdown to the right still
              lets users hop trips without going through the index. */}
          {(() => {
            const inDeepView = view.name === 'stop' || view.name === 'settings'
            const label = inDeepView && trip?.title ? `← ${trip.title}` : '← Trips'
            const handler = inDeepView ? () => setView({ name: 'trip' }) : openIndex
            return (
              <button
                type="button"
                onClick={handler}
                style={{
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  cursor: 'pointer',
                  minWidth: 0,
                  flex: '0 1 auto',
                }}
              >
                <span
                  className="f-mono"
                  style={{
                    display: 'inline-block',
                    maxWidth: inDeepView ? '80vw' : '52vw',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 10,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    opacity: topBar.opacity,
                    color: topBar.text,
                  }}
                >
                  {label}
                </span>
              </button>
            )
          })()}
          {/* Trip switcher only on the trip home — on stop/settings the
              back button already carries the trip title, and rendering
              the title twice in a fixed-width bar overflows on phones. */}
          {view.name === 'trip' && (
            <select
              value={trip?.id || ''}
              onChange={(e) => openTrip(e.target.value)}
              style={{
                background: 'transparent',
                border: 0,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                opacity: topBar.opacity,
                color: topBar.text,
                maxWidth: '60vw',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: '1 1 auto',
                minWidth: 0,
                textAlign: 'right',
              }}
            >
              {allTrips.map((t) => (
                <option key={t.id} value={t.id} style={{ color: '#1A1614' }}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={openSettings}
            aria-label="Trip settings"
            style={{
              background: 'transparent',
              border: 0,
              padding: '0 4px',
              cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              opacity: topBar.opacity,
              color: topBar.text,
            }}
          >
            ⋯
          </button>
        </div>
      )}

      <div key={`${view.name}-${tripId}-${traveler}`}>
        {view.name === 'index' && (
          <TripIndex
            traveler={traveler}
            trips={allTrips}
            onOpenTrip={openTrip}
            onNewTrip={openNewTrip}
          />
        )}
        {view.name === 'new' && <NewTrip onBack={openIndex} onCreate={handleCreateTrip} />}
        {view.name === 'trip' && trip && renderTripView()}
        {view.name === 'stop' && trip && day && stop && (
          <StopDetail
            trip={trip}
            day={day}
            stop={stop}
            traveler={traveler}
            dark={darkSurface}
            onBack={() => setView({ name: 'trip' })}
            onOpenDay={openDayFirstStop}
          />
        )}
        {view.name === 'settings' && trip && (
          <Settings
            trip={trip}
            traveler={traveler}
            dark={darkSurface}
            helenDark={helenDark}
            onToggleHelenDark={toggleHelenDark}
            tripsApi={tripsApi}
            onBack={() => setView({ name: 'trip' })}
            onChangeTraveler={handleTravelerSwitch}
          />
        )}
      </div>

      {/* Bottom switcher visible everywhere except the index */}
      {view.name !== 'index' && view.name !== 'new' && (
        <Switcher active={traveler} onSwitch={handleTravelerSwitch} />
      )}
    </>
  )
}
