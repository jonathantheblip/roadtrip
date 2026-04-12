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

// Single shared watcher so multiple components don't each open their own
// geolocation subscription — meaningful for battery on a phone held all day.
const listeners = new Set()
let state = { position: null, status: 'idle', lastKnown: loadLast() }
let watchStarted = false
let watchId = null

function emit() {
  listeners.forEach((cb) => cb(state))
}

function ensureWatch() {
  if (watchStarted) return
  watchStarted = true
  if (!('geolocation' in navigator)) {
    state = { ...state, status: 'unavailable' }
    emit()
    return
  }
  try {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }
        state = { position: next, status: 'granted', lastKnown: next }
        saveLast(next)
        emit()
      },
      (err) => {
        const nextStatus = err.code === 1 ? 'denied' : 'unavailable'
        state = { ...state, status: nextStatus }
        emit()
      },
      {
        enableHighAccuracy: false,
        maximumAge: 30000,
        timeout: 10000,
      }
    )
  } catch {
    state = { ...state, status: 'unavailable' }
    emit()
  }
}

export function useGeolocation() {
  const [snapshot, setSnapshot] = useState(state)

  useEffect(() => {
    ensureWatch()
    listeners.add(setSnapshot)
    setSnapshot(state)
    return () => {
      listeners.delete(setSnapshot)
    }
  }, [])

  return snapshot
}

// Haversine distance in km.
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
