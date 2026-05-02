// Navigation link builders and the TikTok deep-link handoff.
// Per-person preferred maps app: Jonathan → Waze, Helen → Apple Maps,
// Aurelia → TikTok then Apple Maps, Rafa → Apple Maps. Ported from the
// vanilla app.

export function wazeUrl(stop) {
  if (stop.lat != null && stop.lng != null) {
    return `https://waze.com/ul?ll=${stop.lat},${stop.lng}&navigate=yes`
  }
  return `https://waze.com/ul?q=${encodeURIComponent(stop.address || stop.name)}&navigate=yes`
}

export function appleMapsUrl(address) {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`
}

export function googleMapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

// TikTok: try the app's custom URL scheme via window.open so a deep-link
// miss doesn't leave a blank Safari tab replacing the PWA.
// Spec v2 requirement: use window.open, not anchor navigation or
// location.href, because anchor-style navigation to tiktok:// on iOS
// produces a blank frame when the TikTok app isn't installed.
export function openTikTokSearch(name) {
  const q = encodeURIComponent(name)
  const deepLink = `tiktok://search?q=${q}`
  const webUrl = `https://www.tiktok.com/search?q=${q}`

  // Open in a new tab/window first — this is what fixes the blank screen.
  // If the TikTok app claims the URL, iOS backgrounds us and the new tab
  // gets closed. If not, we fall through to the web URL.
  const win = window.open(deepLink, '_blank')

  const fallback = setTimeout(() => {
    if (!document.hidden) {
      if (win && !win.closed) {
        try { win.location.href = webUrl } catch { /* cross-origin, ignore */ }
      } else {
        window.open(webUrl, '_blank')
      }
    }
  }, 900)

  const onHide = () => {
    if (document.hidden) {
      clearTimeout(fallback)
      document.removeEventListener('visibilitychange', onHide)
    }
  }
  document.addEventListener('visibilitychange', onHide)
}
