import { useCallback, useEffect, useState } from 'react'

// Helen's per-view dark-mode toggle. Spec §6: "light by default, dark
// mode optional via toggle in her settings". Persisted in localStorage,
// not exposed elsewhere — Jonathan/Aurelia/Rafa palettes are fixed.
//
// The hook is consumed in two places (App.jsx for surface theming,
// Settings.jsx for the toggle button) so writes broadcast a custom
// event that other hook instances listen to. Storage events cover the
// cross-tab case (standalone PWA + Safari tab open at once).

const KEY = 'rt_helen_dark_v1'
const EVENT = 'rt-helen-dark-change'

function read() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function write(next) {
  try {
    localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    /* private mode */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
  } catch {
    /* ignore */
  }
}

export function useHelenDark() {
  const [dark, setDark] = useState(read)

  useEffect(() => {
    setDark(read())
    const onCustom = (e) => setDark(!!e.detail)
    const onStorage = (e) => {
      if (e.key === KEY) setDark(e.newValue === '1')
    }
    window.addEventListener(EVENT, onCustom)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(EVENT, onCustom)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev
      write(next)
      return next
    })
  }, [])

  const setExplicit = useCallback((next) => {
    setDark(next)
    write(next)
  }, [])

  return [dark, toggle, setExplicit]
}
