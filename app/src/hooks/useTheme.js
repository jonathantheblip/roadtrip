import { useCallback, useEffect, useState } from 'react'
import { THEMES, THEME_ORDER } from '../data/themes'

const STORAGE_KEY = 'rt_person_v2'
const DEFAULT = 'jonathan'

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return THEME_ORDER.includes(value) ? value : DEFAULT
  } catch {
    return DEFAULT
  }
}

export function useTheme() {
  const [activePerson, setActivePerson] = useState(readStored)

  // Reflect the active person on <body data-theme=…> and update the
  // theme-color meta tag so iOS standalone mode paints the status bar
  // correctly. Persist to localStorage so it survives refreshes.
  useEffect(() => {
    document.body.setAttribute('data-theme', activePerson)
    try {
      localStorage.setItem(STORAGE_KEY, activePerson)
    } catch {
      /* ignore quota/private mode failures */
    }
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', THEMES[activePerson].themeColorMeta)
    const appleMeta = document.querySelector(
      'meta[name="apple-mobile-web-app-status-bar-style"]'
    )
    // Dark themes get 'black-translucent' so the status bar disappears;
    // light themes get 'default'. Stays in sync with the theme color.
    if (appleMeta) {
      const dark = activePerson === 'jonathan' || activePerson === 'rafa'
      appleMeta.setAttribute('content', dark ? 'black-translucent' : 'default')
    }
  }, [activePerson])

  const setPerson = useCallback((person) => {
    if (THEME_ORDER.includes(person)) setActivePerson(person)
  }, [])

  return {
    activePerson,
    theme: THEMES[activePerson],
    setPerson,
  }
}
