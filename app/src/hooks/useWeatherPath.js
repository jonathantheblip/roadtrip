import { useEffect, useState } from 'react'

// Persistent dry/wet path state for Monday Apr 20.
// 'dry' = take Lincoln Parish Park + downtown Ruston murals
// 'wet' = skip Ruston entirely, absorb into Shreveport + Buc-ee's
// null  = not yet decided
//
// Module-scope state + subscribers so both MondayWeatherCard (the writer)
// and ItineraryView (the reader, for conditional filtering) observe the
// same value. Two independent useState instances wouldn't sync.

const KEY = 'rt_mon_weather_path'
const VALID = ['dry', 'wet']
const subs = new Set()

let current = readLocal()

function readLocal() {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    return VALID.includes(v) ? v : null
  } catch {
    return null
  }
}

function writeLocal(v) {
  try {
    if (v == null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, v)
  } catch {
    /* private mode */
  }
}

function setGlobal(v) {
  if (v !== null && !VALID.includes(v)) return
  if (v === current) return
  current = v
  writeLocal(v)
  subs.forEach((cb) => cb(v))
}

export function useWeatherPath() {
  const [path, setPath] = useState(current)

  useEffect(() => {
    const cb = (v) => setPath(v)
    subs.add(cb)
    return () => { subs.delete(cb) }
  }, [])

  return { path, setPath: setGlobal }
}
