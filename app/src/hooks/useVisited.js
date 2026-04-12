import { useCallback, useState } from 'react'

const STORAGE_KEY = 'rt_visited'

function readVisited() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

function writeVisited(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch { /* quota */ }
}

export function useVisited() {
  const [visited, setVisited] = useState(readVisited)

  const toggle = useCallback((id) => {
    setVisited((prev) => {
      const next = prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
      writeVisited(next)
      return next
    })
  }, [])

  const markVisited = useCallback((id) => {
    setVisited((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      writeVisited(next)
      return next
    })
  }, [])

  const resetDay = useCallback((stopIds) => {
    setVisited((prev) => {
      const next = prev.filter((id) => !stopIds.includes(id))
      writeVisited(next)
      return next
    })
  }, [])

  const isVisited = useCallback((id) => visited.includes(id), [visited])

  return { visited, toggle, markVisited, resetDay, isVisited }
}
