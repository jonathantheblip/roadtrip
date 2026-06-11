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
        // High accuracy + no cache so the live dot tracks the car rather
        // than lagging ~30s / ~0.6mi behind (the pre-refactor map's worst
        // "sorta worked" flaw). Still one shared watcher for battery.
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
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

// Passive variant: subscribe to the SHARED geolocation state WITHOUT starting
// the watch. Lets global chrome (the LiveDock) show a live ETA once location is
// already granted — the watch is started by the Live Map (where the prompt
// belongs) — but NEVER triggers a permission prompt on its own. Returns the
// shared state (position null / status 'idle' until some active useGeolocation
// elsewhere starts the watch).
export function useGeolocationPassive() {
  const [snapshot, setSnapshot] = useState(state)

  useEffect(() => {
    listeners.add(setSnapshot)
    setSnapshot(state)
    return () => {
      listeners.delete(setSnapshot)
    }
  }, [])

  return snapshot
}
