// Navigation link builders and the TikTok deep-link handoff.
// Jonathan → Waze, Helen → Apple Maps, Aurelia → TikTok then Apple Maps,
// Rafa → Apple Maps (parent is driving). Ported from the vanilla app.

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

// TikTok: try the app's custom URL scheme first, fall back to the web
// if the app isn't installed. The mobile web search renders blank so we
// warn before navigating.
export function openTikTokSearch(name) {
  const q = encodeURIComponent(name)
  const deepLink = `tiktok://search?q=${q}`
  const webUrl = `https://www.tiktok.com/search?q=${q}`

  const fallback = setTimeout(() => {
    if (!document.hidden) {
      window.alert(
        `Opening TikTok search in Safari — if it looks blank, search for "${name}" directly in the TikTok app.`
      )
      window.location.href = webUrl
    }
  }, 1200)

  const onHide = () => {
    if (document.hidden) {
      clearTimeout(fallback)
      document.removeEventListener('visibilitychange', onHide)
    }
  }
  document.addEventListener('visibilitychange', onHide)

  window.location.href = deepLink
}
