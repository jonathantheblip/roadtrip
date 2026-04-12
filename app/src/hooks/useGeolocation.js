import { useEffect, useState } from 'react'

const LS_KEY = 'roadtrip-last-position'

function loadLast() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveLast(pos) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(pos))
  } catch {
    /* ignore */
  }
}

export function useGeolocation() {
  const [position, setPosition] = useState(null)
  const [status, setStatus] = useState('idle') // idle | granted | denied | unavailable
  const [lastKnown] = useState(() => loadLast())

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      return
    }
    let watchId
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const next = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          }
          setPosition(next)
          setStatus('granted')
          saveLast(next)
        },
        (err) => {
          if (err.code === 1) setStatus('denied')
          else setStatus('unavailable')
        },
        {
          enableHighAccuracy: false,
          maximumAge: 30000,
          timeout: 10000,
        }
      )
    } catch {
      setStatus('unavailable')
    }
    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  return { position, status, lastKnown: position || lastKnown }
}

// Simple haversine distance in km
export function distanceKm(a, b) {
  if (!a || !b) return Infinity
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}
