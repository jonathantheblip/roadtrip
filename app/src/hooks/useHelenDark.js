import { useCallback, useEffect, useState } from 'react'

// Helen's per-view dark-mode toggle. Spec §6: "light by default, dark
// mode optional via toggle in her settings". Persisted in localStorage,
// not exposed elsewhere — Jonathan/Aurelia/Rafa palettes are fixed.

const KEY = 'rt_helen_dark_v1'

function read() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function useHelenDark() {
  const [dark, setDark] = useState(read)

  // Re-read on mount in case it was set by another tab / standalone
  // PWA boundary.
  useEffect(() => {
    setDark(read())
  }, [])

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev
      try {
        localStorage.setItem(KEY, next ? '1' : '0')
      } catch {
        /* private mode */
      }
      return next
    })
  }, [])

  const setExplicit = useCallback((next) => {
    setDark(next)
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])

  return [dark, toggle, setExplicit]
}
