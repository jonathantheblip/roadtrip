import { useCallback, useEffect, useState } from 'react'
import { THEMES, THEME_ORDER } from '../data/themes'
import { appIconDataUri, PERSON_APP_TITLE } from '../utils/appIcon'

const STORAGE_KEY = 'rt_person_v2'
const DEFAULT = 'jonathan'

// Read initial person from (in priority order):
//   1. ?person=X query param — set when an Apple home-screen save
//      captured the URL while a specific person was selected.
//   2. localStorage — from the last time this browser ran the app.
//   3. Default to Jonathan.
function readStored() {
  if (typeof window === 'undefined') return DEFAULT
  try {
    const params = new URLSearchParams(window.location.search)
    const urlPerson = params.get('person')
    if (urlPerson && THEME_ORDER.includes(urlPerson)) return urlPerson
  } catch {
    /* ignore malformed URL */
  }
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return THEME_ORDER.includes(value) ? value : DEFAULT
  } catch {
    return DEFAULT
  }
}

export function useTheme() {
  const [activePerson, setActivePerson] = useState(readStored)

  // On every person change, update every bit of metadata that iOS,
  // the browser, and the home-screen save flow may pick up:
  //   - data-theme on <body> → drives all CSS var switches
  //   - theme-color meta      → iOS Safari status bar color
  //   - apple-mobile-web-app-status-bar-style → status bar style
  //   - apple-touch-icon      → home-screen icon
  //   - apple-mobile-web-app-title → home-screen label
  //   - document.title        → browser tab label
  //   - ?person=X query param → captured by Add to Home Screen
  //   - localStorage          → survives reloads
  useEffect(() => {
    const theme = THEMES[activePerson]
    const body = document.body
    body.setAttribute('data-theme', activePerson)

    try {
      localStorage.setItem(STORAGE_KEY, activePerson)
    } catch {
      /* private mode / quota */
    }

    const themeColorMeta = document.querySelector('meta[name="theme-color"]')
    if (themeColorMeta)
      themeColorMeta.setAttribute('content', theme.themeColorMeta)

    const appleStatusMeta = document.querySelector(
      'meta[name="apple-mobile-web-app-status-bar-style"]'
    )
    if (appleStatusMeta) {
      const dark = activePerson === 'jonathan' || activePerson === 'rafa'
      appleStatusMeta.setAttribute('content', dark ? 'black-translucent' : 'default')
    }

    // Per-person app icon — gets captured by Apple Home-Screen save.
    const iconHref = appIconDataUri(activePerson)
    document
      .querySelectorAll('link[rel="apple-touch-icon"], link[rel="icon"]')
      .forEach((el) => el.setAttribute('href', iconHref))

    // Titles — what iOS uses as the home-screen label.
    const appTitle = PERSON_APP_TITLE[activePerson] || 'Road Trip'
    document.title = `${theme.name} · ${appTitle}`
    const appleTitleMeta = document.querySelector(
      'meta[name="apple-mobile-web-app-title"]'
    )
    if (appleTitleMeta) appleTitleMeta.setAttribute('content', appTitle)

    // Sync the ?person=X query param without pushing history — so a
    // subsequent "Add to Home Screen" captures the selection in the
    // saved URL and the app boots back into this person next time.
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('person') !== activePerson) {
        url.searchParams.set('person', activePerson)
        window.history.replaceState(null, '', url.toString())
      }
    } catch {
      /* older browsers */
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
