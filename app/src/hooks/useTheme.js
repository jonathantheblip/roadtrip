import { useCallback, useEffect, useState } from 'react'
import { THEMES, THEME_ORDER, THEME_COLORS } from '../data/themes'
import {
  appIconSvgDataUri,
  appIconPngDataUri,
  PERSON_APP_TITLE,
} from '../utils/appIcon'

// Per-person manifest generation.
// iOS Safari reads <link rel="manifest"> at Add-to-Home-Screen time, so
// swapping this before the user taps Share captures the correct theme
// color, background, icon, and start_url for the installed PWA.
function buildPersonManifest(person) {
  const bg = THEME_COLORS[person] || THEME_COLORS.jonathan
  const iconUri = appIconSvgDataUri(person)
  const manifest = {
    name: `Jackson Family Road Trip — ${person[0].toUpperCase() + person.slice(1)}`,
    short_name: PERSON_APP_TITLE[person] || 'Road Trip',
    description: 'April 17–24, 2026 · Belmont to Texas and back',
    // start_url bakes in the selected person so a home-screen launch
    // always opens as the person who installed it, even when the
    // browser history/cookie state has been cleared.
    start_url: `./?person=${person}&tab=itinerary`,
    scope: './',
    display: 'standalone',
    background_color: bg,
    theme_color: bg,
    orientation: 'portrait',
    icons: [
      {
        src: iconUri,
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
    ],
  }
  return (
    'data:application/manifest+json;charset=utf-8,' +
    encodeURIComponent(JSON.stringify(manifest))
  )
}

const STORAGE_KEY = 'rt_person_v2'
const COOKIE_KEY = 'rt_person'
const DEFAULT = 'jonathan'

// Cookies survive the iOS Safari → standalone PWA boundary (from iOS
// 16 onwards) where localStorage does not. We write both so any of
// the three sources can hydrate the person on next launch.
function writeCookie(name, value, days = 365) {
  if (typeof document === 'undefined') return
  try {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`
  } catch {
    /* cookie blocked */
  }
}

function readCookie(name) {
  if (typeof document === 'undefined') return null
  try {
    const jar = document.cookie.split(';').map((c) => c.trim())
    for (const c of jar) {
      if (c.startsWith(name + '=')) return decodeURIComponent(c.slice(name.length + 1))
    }
  } catch {
    /* ignore */
  }
  return null
}

// Read initial person in priority order:
//   1. ?person=X query param    — captured by Add-to-Home-Screen on iOS
//   2. rt_person cookie         — crosses the standalone boundary
//   3. localStorage rt_person_v2 — survives page reloads in-browser
//   4. Default to Jonathan
function readStored() {
  if (typeof window === 'undefined') return DEFAULT
  try {
    const params = new URLSearchParams(window.location.search)
    const urlPerson = params.get('person')
    if (urlPerson && THEME_ORDER.includes(urlPerson)) return urlPerson
  } catch {
    /* ignore malformed URL */
  }
  const cookiePerson = readCookie(COOKIE_KEY)
  if (THEME_ORDER.includes(cookiePerson)) return cookiePerson
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (THEME_ORDER.includes(value)) return value
  } catch {
    /* ignore quota */
  }
  return DEFAULT
}

// Remove-and-reattach all <link rel=icon|apple-touch-icon> elements
// with a fresh href. Just setting .href via JS works in some browsers
// but many (especially mobile Safari) cache the initial favicon at
// document parse time and ignore later property mutations. Replacing
// the node with a new one forces the browser to re-fetch.
function swapLinkIcons(rel, href, type) {
  if (typeof document === 'undefined') return
  const existing = Array.from(document.querySelectorAll(`link[rel="${rel}"]`))
  const parent = existing[0]?.parentNode || document.head
  existing.forEach((el) => el.parentNode?.removeChild(el))
  const link = document.createElement('link')
  link.rel = rel
  link.href = href
  if (type) link.type = type
  parent.appendChild(link)
}

export function useTheme() {
  const [activePerson, setActivePerson] = useState(readStored)

  useEffect(() => {
    const theme = THEMES[activePerson]
    document.body.setAttribute('data-theme', activePerson)

    try {
      localStorage.setItem(STORAGE_KEY, activePerson)
    } catch {
      /* private mode */
    }
    writeCookie(COOKIE_KEY, activePerson)

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

    // Tab favicon — SVG is fine for modern browsers and Safari tab.
    const svgUri = appIconSvgDataUri(activePerson)
    swapLinkIcons('icon', svgUri, 'image/svg+xml')

    // Apple Touch Icon — iOS requires PNG for reliable home-screen
    // capture. Rasterize the same SVG through a Canvas, then swap in.
    // While the PNG is generating we set the SVG as an interim so
    // there's always something valid in the DOM.
    swapLinkIcons('apple-touch-icon', svgUri)
    appIconPngDataUri(activePerson)
      .then((pngUri) => {
        if (pngUri && document.body.getAttribute('data-theme') === activePerson) {
          swapLinkIcons('apple-touch-icon', pngUri, 'image/png')
        }
      })
      .catch(() => {
        /* keep the SVG fallback */
      })

    // Titles that iOS uses for the home-screen label.
    const appTitle = PERSON_APP_TITLE[activePerson] || 'Road Trip'
    document.title = `${theme.name} · ${appTitle}`
    const appleTitleMeta = document.querySelector(
      'meta[name="apple-mobile-web-app-title"]'
    )
    if (appleTitleMeta) appleTitleMeta.setAttribute('content', appTitle)

    // Mirror the current person in ?person= so Apple's Add-to-Home-
    // Screen captures it in the saved URL. replaceState keeps history
    // clean.
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('person') !== activePerson) {
        url.searchParams.set('person', activePerson)
        window.history.replaceState(null, '', url.toString())
      }
    } catch {
      /* older browsers */
    }

    // Swap the <link rel="manifest"> href to a per-person data: manifest
    // so iOS captures the correct theme_color, icon, and start_url at
    // Add-to-Home-Screen time. Without this, the installed PWA always
    // uses Jonathan's static manifest.
    try {
      const manifestLink = document.querySelector('link[rel="manifest"]')
      if (manifestLink) {
        const href = buildPersonManifest(activePerson)
        if (manifestLink.getAttribute('href') !== href) {
          manifestLink.setAttribute('href', href)
        }
      }
    } catch {
      /* ignore */
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
