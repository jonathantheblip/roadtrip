// placesGeocode.js — Google Places (New) text-search primitives, extracted
// VERBATIM out of index.js (Build 4, BUILD_PLAN_SIGNAL_FLEET.md 4a) so the
// photoHealRunner backfill passes (stop geocoding, landmark search) can
// resolve an address/query to coordinates without a circular import —
// index.js imports FROM photoHealRunner, so a back-import would cycle
// (the leaveWhen.js extraction precedent). Behavior is byte-identical to
// the pre-extraction index.js functions; only the module boundary moved.
// index.js re-imports both from here for its existing call sites.

// Great-circle metres — self-contained copy (mirror-safe precedent:
// sessions.js keeps its own too) so this module has no dependency back
// into index.js.
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Resolve free text (a place name, address, or city) to coordinates via
// Places (New) text search — the seam that lets the chat tools accept the
// names the model has instead of the lat/lng it never sees. Returns null
// on no match (the caller turns that into an { error } the model relays).
export async function geocodePlace(env, query) {
  const q = typeof query === 'string' ? query.trim() : ''
  if (!q) return null
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': env.GOOGLE_PLACES_API_KEY,
      'x-goog-fieldmask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({ textQuery: q, maxResultCount: 1 }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`geocode ${res.status}: ${text.slice(0, 160)}`)
    err.status = res.status
    throw err
  }
  const data = await res.json().catch(() => ({}))
  const p = (data?.places || [])[0]
  const lat = p?.location?.latitude
  const lng = p?.location?.longitude
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, name: p.displayName?.text || q, address: p.formattedAddress || null }
}

// Core Places (New) text search with optional distance bias. Shared by
// the /places/nearby HTTP endpoint (always centered — it validates
// lat/lng first) and the find_places chat tool (centered when `near`
// geocodes, text-only fallback otherwise). The API key never leaves the
// worker. Returns the {results, radiusMeters} shape both callers consume.
// Throws on a non-2xx Places response (error carries .status) so the
// caller can map it to its own error surface.
//
// requireOperational (Build 4c, BUILD_PLAN_SIGNAL_FLEET.md): when true
// (default — every pre-existing caller's behavior stays byte-for-byte
// unchanged), CLOSED_TEMPORARILY/PERMANENTLY_CLOSED results are dropped.
// The signage-driven landmark search sets this false: an archive photo may
// show a venue that has since closed, and the pin should still resolve.
export async function placesTextSearch(env, { query, lat, lng, radius, limit, languageCode, regionCode, requireOperational = true }) {
  const hasCenter = Number.isFinite(lat) && Number.isFinite(lng)
  const clampedRadius = Math.max(
    100,
    Math.min(50000, Number.isFinite(Number(radius)) ? Number(radius) : 1500)
  )
  const cappedLimit = Math.max(1, Math.min(10, Number(limit) || 5))

  const reqBody = { textQuery: query, maxResultCount: cappedLimit }
  // Localize to the DESTINATION, not Cloudflare's edge default (which skews
  // English/US): languageCode → result names + hours in the local language;
  // regionCode (a CLDR region like "IT") → local address conventions + ranking.
  // Both optional — omitted leaves today's behavior byte-for-byte unchanged.
  if (languageCode) reqBody.languageCode = String(languageCode)
  if (regionCode) reqBody.regionCode = String(regionCode)
  if (hasCenter) {
    // DISTANCE ranking + a circular bias is what powers the "nearest one
    // right now" ordering. Without a center (tool fallback) we let Places
    // rank by relevance; the caller folds the location into the query text.
    reqBody.rankPreference = 'DISTANCE'
    reqBody.locationBias = {
      circle: { center: { latitude: lat, longitude: lng }, radius: clampedRadius },
    }
  }

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': env.GOOGLE_PLACES_API_KEY,
      'x-goog-fieldmask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.regularOpeningHours.openNow,places.currentOpeningHours.openNow,places.nationalPhoneNumber,places.photos.name',
    },
    body: JSON.stringify(reqBody),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`places ${res.status}: ${text.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  const data = await res.json().catch(() => ({}))
  const places = Array.isArray(data?.places) ? data.places : []

  const results = places
    .map((p) => {
      const pLat = p?.location?.latitude
      const pLng = p?.location?.longitude
      if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) return null
      return {
        placeId: p.id || null,
        name: p.displayName?.text || '(unnamed)',
        address: p.formattedAddress || null,
        lat: pLat,
        lng: pLng,
        distanceMeters: hasCenter
          ? Math.round(haversineMeters(lat, lng, pLat, pLng))
          : null,
        openNow:
          p?.currentOpeningHours?.openNow ??
          p?.regularOpeningHours?.openNow ??
          null,
        businessStatus: p.businessStatus || null,
        phone: p.nationalPhoneNumber || null,
        // The first photo's resource name ("places/X/photos/Y"); the HTTP
        // handler turns it into a key-safe proxied URL. null when none.
        photoName: (Array.isArray(p.photos) && p.photos[0]?.name) || null,
      }
    })
    .filter(Boolean)
    // Filter out NOT operational; CLOSED_TEMPORARILY/PERMANENTLY_CLOSED are
    // useless for "I need this NOW" queries — but the landmark-search caller
    // (4c) opts OUT via requireOperational=false, since an archive photo's
    // venue may have since closed and should still resolve to a pin.
    .filter((r) => !requireOperational || !r.businessStatus || r.businessStatus === 'OPERATIONAL')

  if (hasCenter) results.sort((a, b) => a.distanceMeters - b.distanceMeters)

  return { results, radiusMeters: hasCenter ? clampedRadius : null }
}
