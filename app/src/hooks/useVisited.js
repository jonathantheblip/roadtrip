import { useCallback, useEffect, useState } from 'react'

// Visited-stop state, persisted per trip. The key is trip-namespaced
// (`rt_visited_<tripId>`) so visited marks from one trip never bleed into
// another — the pre-refactor hook used a single global `rt_visited` key,
// which collided the moment the app went multi-trip.
function storageKey(tripId) {
  return `rt_visited_${tripId || 'default'}`
}

function readVisited(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || []
  } catch {
    return []
  }
}

function writeVisited(key, ids) {
  try {
    localStorage.setItem(key, JSON.stringify(ids))
  } catch { /* quota */ }
}

export function useVisited(tripId) {
  const key = storageKey(tripId)
  const [visited, setVisited] = useState(() => readVisited(key))

  // Reload when the active trip changes so the hook always reflects the
  // current trip's list rather than the one it mounted with.
  useEffect(() => {
    setVisited(readVisited(key))
  }, [key])

  const toggle = useCallback((id) => {
    setVisited((prev) => {
      const next = prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
      writeVisited(key, next)
      return next
    })
  }, [key])

  const markVisited = useCallback((id) => {
    setVisited((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      writeVisited(key, next)
      return next
    })
  }, [key])

  const resetDay = useCallback((stopIds) => {
    setVisited((prev) => {
      const next = prev.filter((id) => !stopIds.includes(id))
      writeVisited(key, next)
      return next
    })
  }, [key])

  const isVisited = useCallback((id) => visited.includes(id), [visited])

  return { visited, toggle, markVisited, resetDay, isVisited }
}
