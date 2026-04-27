import { useEffect, useState } from 'react'
import { TRIPS, findTrip, findDay, findStop } from './data/trips'
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
import './styles/platform.css'

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

function readActiveTripId() {
  try {
    const q = new URLSearchParams(window.location.search).get('trip')
    if (q && TRIPS.find((t) => t.id === q)) return q
  } catch {
    /* ignore */
  }
  // Default: Jackson (most recently active for this family)
  return TRIPS[0]?.id || null
}

export default function App() {
  const [traveler, setTraveler] = useState(readTraveler)
  const [tripId, setTripId] = useState(readActiveTripId)
  const [drafts, setDrafts] = useState([]) // session-local trips created via NewTrip
  const [view, setView] = useState({ name: 'trip' }) // 'index' | 'trip' | 'stop' | 'settings' | 'new'

  // Persist traveler across reloads + standalone PWA boundary.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, traveler)
    } catch {
      /* ignore */
    }
    writeTravelerCookie(traveler)
    document.documentElement.setAttribute('data-theme', traveler)
    document.body.setAttribute('data-theme', traveler)
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

  const allTrips = [...drafts, ...TRIPS]
  const trip = allTrips.find((t) => t.id === tripId) || allTrips[0]
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
  function handleCreateTrip(newTrip) {
    setDrafts((d) => [newTrip, ...d])
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
            background:
              traveler === 'rafa'
                ? 'linear-gradient(to bottom, rgba(14,21,48,.92), rgba(14,21,48,0))'
                : 'linear-gradient(to bottom, rgba(245,240,231,.85), rgba(245,240,231,0))',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={openIndex}
            style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}
          >
            <span
              className="f-mono"
              style={{
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                opacity: traveler === 'rafa' ? 0.8 : 0.5,
                color: traveler === 'rafa' ? '#fff' : '#1A1614',
              }}
            >
              ← Trips
            </span>
          </button>
          <select
            value={tripId || ''}
            onChange={(e) => openTrip(e.target.value)}
            style={{
              background: 'transparent',
              border: 0,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              opacity: traveler === 'rafa' ? 0.8 : 0.5,
              color: traveler === 'rafa' ? '#fff' : '#1A1614',
            }}
          >
            {allTrips.map((t) => (
              <option key={t.id} value={t.id} style={{ color: '#1A1614' }}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div key={`${view.name}-${tripId}-${traveler}`}>
        {view.name === 'index' && <TripIndex onOpenTrip={openTrip} onNewTrip={openNewTrip} />}
        {view.name === 'new' && <NewTrip onBack={openIndex} onCreate={handleCreateTrip} />}
        {view.name === 'trip' && trip && renderTripView()}
        {view.name === 'stop' && trip && day && stop && (
          <StopDetail
            trip={trip}
            day={day}
            stop={stop}
            traveler={traveler}
            onBack={() => setView({ name: 'trip' })}
          />
        )}
        {view.name === 'settings' && trip && (
          <Settings
            trip={trip}
            traveler={traveler}
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
