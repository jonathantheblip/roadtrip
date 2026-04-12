export function buildShareText(stop, person) {
  const pitch =
    stop.pitch?.[person] ||
    stop.pitch?.jonathan ||
    stop.pitch?.helen ||
    ''
  if (person === 'aurelia') {
    return pitch ? `${stop.name} ✨ ${pitch}` : stop.name
  }
  return pitch ? `${stop.name} — ${pitch}` : stop.name
}

export async function shareStop(stop, person) {
  const text = buildShareText(stop, person)
  const data = { title: stop.name, text }
  try {
    if (navigator.share) {
      await navigator.share(data)
      return 'shared'
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return 'copied'
    }
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled'
  }
  return 'unavailable'
}
