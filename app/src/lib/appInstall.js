// Per-person installed-app plumbing. Turns the active person + their picked
// emblem into the real home-screen identity: a generated manifest (name,
// person-baked start_url, colors) and a canvas-rasterized PNG icon set as
// the apple-touch-icon / favicon. Restores the technique from the
// pre-refactor useTheme.js, wired to the design's APP_IDENTITY.
//
// HONEST CAVEAT: iOS is inconsistent about honoring a data-URI
// apple-touch-icon at Add-to-Home-Screen time. This is best-effort — it
// degrades to the bundled icon-512.png when canvas isn't available (e.g.
// server/unit context) and never throws.

import { APP_IDENTITY, getSticker } from '../data/appIdentity'

const VALID = ['jonathan', 'helen', 'aurelia', 'rafa']

// Rasterize the AppIcon look (gradient + emblem) to a PNG data URI.
export function renderAppIconPng(person, emblem, size = 512) {
  const a = APP_IDENTITY[person]
  if (!a || typeof document === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const grad = ctx.createLinearGradient(0, 0, size, size)
    grad.addColorStop(0, a.bg1)
    grad.addColorStop(1, a.bg2)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (emblem) {
      ctx.font = `${Math.round(size * 0.5)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
      ctx.fillText(emblem, size / 2, size / 2 + size * 0.02)
    } else {
      ctx.fillStyle = a.fg
      ctx.font = `${a.italic ? 'italic ' : ''}600 ${Math.round(size * 0.52)}px ${a.font}`
      ctx.fillText(a.glyph, size / 2, size / 2 + size * 0.02)
    }
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

// Build a per-person manifest as a data: URI. `iconUri` may be passed in to
// avoid re-rasterizing (applyInstallIdentity renders once and shares it).
export function buildPersonManifest(person, emblem, iconUri) {
  const a = APP_IDENTITY[person]
  const icon = iconUri || renderAppIconPng(person, emblem, 512)
  const manifest = {
    name: `${a.app} — ${person[0].toUpperCase() + person.slice(1)}`,
    short_name: a.app,
    description: 'Family Trips — your front door to the trip.',
    // Bake in the person so a home-screen launch opens as whoever installed.
    start_url: `./?person=${person}`,
    scope: './',
    display: 'standalone',
    background_color: a.bg2,
    theme_color: a.bg2,
    orientation: 'portrait',
    icons: [
      icon
        ? { src: icon, sizes: '512x512', type: 'image/png', purpose: 'any' }
        : { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
  return (
    'data:application/manifest+json;charset=utf-8,' +
    encodeURIComponent(JSON.stringify(manifest))
  )
}

// Remove-and-reattach a <link rel=...> with a fresh href — Safari caches
// the parse-time favicon/manifest and ignores later .href mutations.
function swapLink(rel, href, type) {
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

// Point the installed-app identity (manifest + icon + title) at `person`
// with their chosen `emblem`. Call on person change and when a sticker is
// picked — BEFORE the user runs Add-to-Home-Screen.
export function applyInstallIdentity(person, emblem) {
  if (typeof document === 'undefined' || !VALID.includes(person)) return
  const a = APP_IDENTITY[person]
  const chosen = emblem || getSticker(person)
  try {
    const iconPng = renderAppIconPng(person, chosen, 512)
    swapLink('manifest', buildPersonManifest(person, chosen, iconPng))
    if (iconPng) {
      swapLink('apple-touch-icon', iconPng, 'image/png')
      swapLink('icon', iconPng, 'image/png')
    }
    document.title = `${a.app} · ${person[0].toUpperCase() + person.slice(1)}`
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    if (appleTitle) appleTitle.setAttribute('content', a.app)
  } catch {
    /* best-effort — never block the app on install chrome */
  }
}
