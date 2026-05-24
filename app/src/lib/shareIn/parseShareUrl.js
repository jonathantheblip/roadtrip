// Parse a shared maps URL into the structured fields the Share-In
// confirmation card needs. Pure string-in / object-out, no fetch — the
// caller resolves short links via the Worker `/resolve` endpoint
// separately and feeds the resolved URL back through here.
//
// Supported input shapes:
//   - Google Maps long form:
//     https://www.google.com/maps/place/<name>/@<lat>,<lng>,...,<zoom>
//     https://maps.google.com/?q=<name>&ll=<lat>,<lng>
//   - Google short links:
//     https://maps.app.goo.gl/<token>
//     https://goo.gl/maps/<token>
//     Returns { kind: 'short', raw } — caller must resolve, then re-parse.
//   - Apple Maps:
//     https://maps.apple.com/?q=<name>&ll=<lat>,<lng>
//     https://maps.apple.com/place?coordinate=<lat>,<lng>&name=<name>
//   - Anything else: { kind: 'unknown', raw } — the confirmation card
//     opens with all fields empty and the user fills them by hand.
//
// Output:
//   {
//     kind: 'long' | 'short' | 'apple' | 'unknown',
//     name?:    string | null,
//     address?: string | null,
//     lat?:     number | null,
//     lng?:     number | null,
//     raw:      string,    // the input URL
//     hostname: string | null,
//   }

const SHORT_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
])

const LONG_GOOGLE_HOSTS = new Set([
  'maps.google.com',
  'www.google.com',
  'google.com',
])

const APPLE_HOSTS = new Set([
  'maps.apple.com',
])

export function parseShareUrl(raw) {
  const base = { name: null, address: null, lat: null, lng: null, raw, hostname: null }
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ...base, kind: 'unknown' }
  }
  let url
  try {
    url = new URL(raw)
  } catch {
    return { ...base, kind: 'unknown' }
  }
  base.hostname = url.hostname

  if (SHORT_HOSTS.has(url.hostname)) {
    return { ...base, kind: 'short' }
  }
  if (APPLE_HOSTS.has(url.hostname)) {
    return { ...base, ...parseApple(url), kind: 'apple' }
  }
  if (LONG_GOOGLE_HOSTS.has(url.hostname)) {
    return { ...base, ...parseGoogleLong(url), kind: 'long' }
  }
  return { ...base, kind: 'unknown' }
}

function parseGoogleLong(url) {
  const out = {}
  // /maps/place/<name>/@lat,lng,...
  const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)(?:\/|$)/)
  if (placeMatch) {
    out.name = humanizeSlug(decodeURIComponent(placeMatch[1]))
  }
  // @lat,lng,<zoom>z
  const atMatch = url.pathname.match(/\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$)/)
  if (atMatch) {
    out.lat = Number(atMatch[1])
    out.lng = Number(atMatch[2])
  }
  // data=...!3d<lat>!4d<lng>!... — the explicit place lat/lng inside the
  // protobuf-ish blob. More reliable than @ when both are present
  // (the @ value is the *map center*; 3d/4d is the *place* itself).
  const data = url.pathname.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (data) {
    out.lat = Number(data[1])
    out.lng = Number(data[2])
  }
  // ?q=<name>&ll=<lat>,<lng> — older sharing format / explicit URLs.
  const q = url.searchParams.get('q')
  if (!out.name && q) out.name = humanizeSlug(q)
  const ll = url.searchParams.get('ll') || url.searchParams.get('sll')
  if (ll) {
    const [a, b] = ll.split(',')
    const lat = Number(a)
    const lng = Number(b)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      out.lat = lat
      out.lng = lng
    }
  }
  // Google occasionally puts the formatted address into the path after
  // /maps/place/<name>/<address>/@... — try to pull it.
  const placeWithAddr = url.pathname.match(
    /\/maps\/place\/([^/]+)\/([^/@]+)(?=\/@|\/data|$)/
  )
  if (placeWithAddr && !out.address) {
    out.address = humanizeSlug(decodeURIComponent(placeWithAddr[2]))
  }
  return normalizeCoords(out)
}

function parseApple(url) {
  const out = {}
  const q = url.searchParams.get('q') || url.searchParams.get('name')
  if (q) out.name = humanizeSlug(q)
  const ll = url.searchParams.get('ll') || url.searchParams.get('coordinate')
  if (ll) {
    const [a, b] = ll.split(',')
    const lat = Number(a)
    const lng = Number(b)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      out.lat = lat
      out.lng = lng
    }
  }
  const addr = url.searchParams.get('address')
  if (addr) out.address = humanizeSlug(addr)
  return normalizeCoords(out)
}

function humanizeSlug(s) {
  if (typeof s !== 'string') return null
  // "Sift+Bake+Shop" → "Sift Bake Shop"; "shops-at-mohegan" left
  // alone (the hyphenated form is sometimes a real name).
  return s.replace(/\+/g, ' ').trim() || null
}

function normalizeCoords(out) {
  if (Number.isFinite(out.lat) && (out.lat < -90 || out.lat > 90)) out.lat = null
  if (Number.isFinite(out.lng) && (out.lng < -180 || out.lng > 180)) out.lng = null
  return out
}

// Whether the URL is one we'd ask the Worker to resolve. Surfaces a
// hard host allowlist so unrelated short URLs (Bitly, etc.) don't get
// hit — the user's intent for those is unclear and resolving them
// could trigger unexpected requests.
export function isResolvableShortHost(hostname) {
  return SHORT_HOSTS.has(String(hostname || '').toLowerCase())
}

// Public accessors for tests + the Worker allowlist that must stay in
// sync with this file.
export const ALLOWED_HOSTS = Object.freeze({
  short: [...SHORT_HOSTS],
  long: [...LONG_GOOGLE_HOSTS],
  apple: [...APPLE_HOSTS],
})
