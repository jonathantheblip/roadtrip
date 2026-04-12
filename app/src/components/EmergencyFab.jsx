import { useCallback, useEffect, useMemo, useState } from 'react'
import { STOPS } from '../data/stops'
import { filterStops } from '../utils/filterStops'
import { appleMapsUrl, wazeUrl } from '../utils/navLinks'
import { isDuringTrip, getTodayDayKey } from '../utils/tripDay'
import { useVisitedContext } from '../hooks/VisitedContext'
import { useGeolocation, distanceKm } from '../hooks/useGeolocation'
import './EmergencyFab.css'

const BATHROOM_TYPES = new Set(['food', 'gas'])

export function EmergencyFab({ activePerson }) {
  const [open, setOpen] = useState(false)
  const [sheetVisible, setSheetVisible] = useState(false)
  const { visited } = useVisitedContext()
  const { position } = useGeolocation()

  const todayKey = useMemo(() => getTodayDayKey(), [])

  const todayStops = useMemo(() => {
    if (!todayKey) return []
    return filterStops(STOPS, { category: 'planned', activePerson, day: todayKey })
  }, [todayKey, activePerson])

  const unvisited = useMemo(
    () => todayStops.filter((s) => !visited.includes(s.id)),
    [todayStops, visited]
  )

  const sortByDistance = (list) => {
    if (!position) return list
    return [...list]
      .filter((s) => s.lat != null && s.lng != null)
      .sort(
        (a, b) =>
          distanceKm(position, { lat: a.lat, lng: a.lng }) -
          distanceKm(position, { lat: b.lat, lng: b.lng })
      )
  }

  const bathroomStops = useMemo(
    () =>
      sortByDistance(
        unvisited.filter((s) => s.types.some((t) => BATHROOM_TYPES.has(t)))
      ).slice(0, 2),
    [unvisited, position]
  )

  const energyStops = useMemo(
    () =>
      sortByDistance(unvisited.filter((s) => s.types.includes('energy'))).slice(0, 2),
    [unvisited, position]
  )

  const handleOpen = useCallback(() => {
    setOpen(true)
    requestAnimationFrame(() => setSheetVisible(true))
  }, [])

  const handleClose = useCallback(() => {
    setSheetVisible(false)
    setTimeout(() => setOpen(false), 300)
  }, [])

  if (!isDuringTrip()) return null

  const icon = activePerson === 'rafa' ? '⚡' : '🚻'

  return (
    <>
      <button type="button" className="emergency-fab" onClick={handleOpen}>
        {icon}
      </button>
      {open && (
        <>
          <div className="emergency-sheet-backdrop" onClick={handleClose} />
          <div className={`emergency-sheet ${sheetVisible ? 'open' : ''}`}>
            <div className="emergency-section-title">🚻 Nearest Bathroom</div>
            {bathroomStops.length === 0 ? (
              <div className="emergency-empty">No upcoming bathroom stops today</div>
            ) : (
              bathroomStops.map((s) => (
                <EmergencyItem key={s.id} stop={s} activePerson={activePerson} />
              ))
            )}

            <div className="emergency-section-title">⚡ Nearest Energy Burn</div>
            {energyStops.length === 0 ? (
              <div className="emergency-empty">No upcoming energy stops today</div>
            ) : (
              energyStops.map((s) => (
                <EmergencyItem key={s.id} stop={s} activePerson={activePerson} showEnergy />
              ))
            )}
          </div>
        </>
      )}
    </>
  )
}

function EmergencyItem({ stop, activePerson, showEnergy }) {
  const navHref =
    activePerson === 'jonathan' ? wazeUrl(stop) : appleMapsUrl(stop.address)
  const navLabel = activePerson === 'jonathan' ? 'Waze' : 'Maps'

  return (
    <div className="emergency-item">
      <div className="emergency-item-info">
        <div className="emergency-item-name">{stop.name}</div>
        <div className="emergency-item-meta">
          {showEnergy && stop.indoor !== undefined && (
            <span className="emergency-item-tag">
              {stop.indoor ? 'Indoor' : 'Outdoor'}
            </span>
          )}{' '}
          {showEnergy && stop.pitch?.rafa && (
            <span>{stop.pitch.rafa}</span>
          )}
          {!showEnergy && stop.hours && <span>{stop.hours}</span>}
        </div>
      </div>
      <a className="emergency-nav-btn" href={navHref} target="_blank" rel="noopener">
        {navLabel}
      </a>
    </div>
  )
}
