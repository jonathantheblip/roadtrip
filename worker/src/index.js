// Roadtrip sync Worker. Replaces CloudKit.
//
// Auth: 4 family bearer tokens (FAMILY_TOKEN_<TRAVELER> secrets). Each
// token maps to one of jonathan / helen / aurelia / rafa. Anyone with a
// valid token can read every shared memory + their own private memories,
// and write/delete on behalf of the traveler their token belongs to.
//
// Storage:
//   D1 (binding DB)       — memories, trips
//   R2 (binding ASSETS)   — audio + photo blobs, keyed by
//                           <traveler>/<memoryId>/<kind>-<rand>
//
// Routes API proxy:
//   POST /leave-when — keeps GOOGLE_PLACES_API_KEY out of the client
//   bundle. The iteration logic lives in ./leaveWhen.js.
//
// Soft delete: rows aren't dropped; deleted_at gets stamped. Pulls
// filter by updated_at > since so tombstones propagate.

import {
  iterateLeaveBy,
  callRoutesDriveDuration,
  straightLineMinutes,
} from './leaveWhen.js'

const TRAVELERS = ['jonathan', 'helen', 'aurelia', 'rafa']

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') || ''
    const cors = corsHeaders(origin, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    const path = url.pathname.replace(/\/+$/, '') || '/'

    // GET /assets/:key bypasses bearer auth so <img src> + <audio src>
    // tags can render directly on receiver devices. R2 keys are opaque
    // random strings nested under <traveler>/<memoryId>/<kind>-<rand>;
    // the only way to learn one is via authenticated GET /memories.
    // Same posture as the legacy CloudKit CKAsset.downloadURL flow,
    // which Apple also served unauthenticated.
    if (request.method === 'GET' && /^\/assets\/.+$/.test(path)) {
      try {
        return await fetchAsset(env, path.replace(/^\/assets\//, ''), cors)
      } catch (err) {
        console.error('asset fetch error', err?.stack || err)
        return json({ error: err?.message || String(err) }, 500, cors)
      }
    }

    // Auth (everything else)
    const traveler = authenticate(request, env)
    if (!traveler) {
      return json({ error: 'unauthorized' }, 401, cors)
    }

    try {

      if (path === '/memories' && request.method === 'GET') {
        return await getMemories(env, traveler, url, cors)
      }
      if (path === '/memories' && request.method === 'POST') {
        return await postMemory(env, traveler, request, url, cors)
      }
      const memMatch = path.match(/^\/memories\/([^/]+)$/)
      if (memMatch && request.method === 'DELETE') {
        return await deleteMemory(env, traveler, memMatch[1], cors)
      }

      if (path === '/trips' && request.method === 'GET') {
        return await getTrips(env, url, cors)
      }
      if (path === '/trips' && request.method === 'POST') {
        return await postTrip(env, request, cors)
      }
      const tripMatch = path.match(/^\/trips\/([^/]+)$/)
      if (tripMatch && request.method === 'DELETE') {
        return await deleteTrip(env, tripMatch[1], cors)
      }

      const uploadMatch = path.match(/^\/assets\/(audio|photo)\/([^/]+)$/)
      if (uploadMatch && request.method === 'POST') {
        return await uploadAsset(
          env, traveler, uploadMatch[1], uploadMatch[2], request, url, cors
        )
      }
      if (path === '/leave-when' && request.method === 'POST') {
        return await postLeaveWhen(env, request, cors)
      }
      if (path === '/places/nearby' && request.method === 'POST') {
        return await postPlacesNearby(env, request, cors)
      }
      if (path === '/resolve' && request.method === 'GET') {
        return await getResolve(env, url, cors)
      }
      if (path === '/draft' && request.method === 'POST') {
        return await postDraft(env, request, cors)
      }
      if (path === '/' && request.method === 'GET') {
        return json({ ok: true, traveler }, 200, cors)
      }

      return json({ error: 'not found', path }, 404, cors)
    } catch (err) {
      console.error('worker error', err?.stack || err)
      return json({ error: err?.message || String(err) }, 500, cors)
    }
  },
}

// ─── Auth ─────────────────────────────────────────────────────────────

function authenticate(request, env) {
  const auth = request.headers.get('Authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/)
  if (!m) return null
  const token = m[1].trim()
  for (const t of TRAVELERS) {
    const expected = env[`FAMILY_TOKEN_${t.toUpperCase()}`]
    if (expected && timingSafeEqual(token, expected)) return t
  }
  return null
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ─── CORS ─────────────────────────────────────────────────────────────

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  // Localhost (any port) is trusted in dev. Avoids the recurring
  // chore of enumerating every Vite port the team might bind to
  // (5173, 5174, … 5180, 4173). github.io covers prod.
  const isLocalhost = /^http:\/\/localhost(:\d+)?$/.test(origin)
  const isAllowed = allowed.includes(origin) || origin.endsWith('.github.io') || isLocalhost
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : (allowed[0] || '*'),
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

// ─── Memories ─────────────────────────────────────────────────────────

async function getMemories(env, traveler, url, cors) {
  const since = parseInt(url.searchParams.get('since') || '0', 10) || 0
  const origin = workerOrigin(env, url)
  const { results } = await env.DB.prepare(
    `SELECT * FROM memories
     WHERE updated_at > ?
       AND (visibility = 'shared' OR author_traveler = ?)
     ORDER BY updated_at ASC`
  ).bind(since, traveler).all()
  const out = results.map((r) => rowToMemory(r, origin))
  // Tell intermediaries (browser cache, any future CDN) not to hold
  // onto this — pulls must always be fresh, not the snapshot whoever
  // fetched first happened to see.
  return json(out, 200, { ...cors, 'Cache-Control': 'no-store' })
}

async function postMemory(env, traveler, request, url, cors) {
  const body = await request.json()
  if (!body?.id) return json({ error: 'missing id' }, 400, cors)
  // Server stamps updated_at to ensure monotonic incremental sync.
  const updatedAt = Date.now()
  const createdAt = body.createdAt
    ? toEpochMs(body.createdAt)
    : updatedAt
  const reactionsJson = body.reactions?.length ? JSON.stringify(body.reactions) : null

  // photoRefs[] album: store as JSON array of {key, mime}
  let photoR2Key = null
  let photoMime = null
  if (body.photoRef?.storage === 'r2') {
    photoR2Key = body.photoRef.key
    photoMime = body.photoRef.mime || null
  }
  let photoR2KeysJson = null
  if (body.photoRefs?.length) {
    photoR2KeysJson = JSON.stringify(
      body.photoRefs.map((r) => ({ key: r.key, mime: r.mime || null }))
    )
  }
  let audioR2Key = null
  let audioMime = null
  if (body.audioRef?.storage === 'r2') {
    audioR2Key = body.audioRef.key
    audioMime = body.audioRef.mime || null
  }
  const photoExternalUrlsJson = body.photoExternalURLs?.length
    ? JSON.stringify(body.photoExternalURLs)
    : null

  await env.DB.prepare(
    `INSERT INTO memories (
       id, trip_id, stop_id, author_traveler, visibility, kind,
       text, caption, transcript, transcript_lang, transcription_status,
       duration_seconds, mood, reactions_json,
       audio_r2_key, audio_mime, photo_r2_key, photo_mime,
       photo_r2_keys_json, photo_external_urls_json,
       created_at, updated_at, deleted_at
     ) VALUES (
       ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?,
       ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?,
       ?, ?, NULL
     )
     ON CONFLICT(id) DO UPDATE SET
       trip_id = excluded.trip_id,
       stop_id = excluded.stop_id,
       author_traveler = excluded.author_traveler,
       visibility = excluded.visibility,
       kind = excluded.kind,
       text = excluded.text,
       caption = excluded.caption,
       transcript = excluded.transcript,
       transcript_lang = excluded.transcript_lang,
       transcription_status = excluded.transcription_status,
       duration_seconds = excluded.duration_seconds,
       mood = excluded.mood,
       reactions_json = excluded.reactions_json,
       audio_r2_key = COALESCE(excluded.audio_r2_key, memories.audio_r2_key),
       audio_mime = COALESCE(excluded.audio_mime, memories.audio_mime),
       photo_r2_key = COALESCE(excluded.photo_r2_key, memories.photo_r2_key),
       photo_mime = COALESCE(excluded.photo_mime, memories.photo_mime),
       photo_r2_keys_json = COALESCE(excluded.photo_r2_keys_json, memories.photo_r2_keys_json),
       photo_external_urls_json = excluded.photo_external_urls_json,
       updated_at = excluded.updated_at,
       deleted_at = NULL`
  ).bind(
    body.id, body.tripId || null, body.stopId || null,
    body.authorTraveler || traveler,
    body.visibility || 'shared',
    body.kind || null,
    body.text || null, body.caption || null,
    body.transcript || null, body.transcriptLang || null,
    body.transcriptionStatus || null,
    body.durationSeconds ?? null, body.mood || null,
    reactionsJson,
    audioR2Key, audioMime, photoR2Key, photoMime,
    photoR2KeysJson, photoExternalUrlsJson,
    createdAt, updatedAt
  ).run()

  const { results } = await env.DB.prepare(
    'SELECT * FROM memories WHERE id = ?'
  ).bind(body.id).all()
  return json(rowToMemory(results[0], workerOrigin(env, url)), 200, cors)
}

async function deleteMemory(env, traveler, id, cors) {
  const now = Date.now()
  await env.DB.prepare(
    'UPDATE memories SET deleted_at = ?, updated_at = ? WHERE id = ?'
  ).bind(now, now, id).run()
  return json({ ok: true, id }, 200, cors)
}

function rowToMemory(r, origin) {
  if (!r) return null
  const photoRef = r.photo_r2_key
    ? {
        storage: 'r2',
        key: r.photo_r2_key,
        url: assetUrl(r.photo_r2_key, origin),
        mime: r.photo_mime || undefined,
      }
    : undefined
  let photoRefs
  if (r.photo_r2_keys_json) {
    try {
      const arr = JSON.parse(r.photo_r2_keys_json)
      photoRefs = arr.map((a) => ({
        storage: 'r2',
        key: a.key,
        url: assetUrl(a.key, origin),
        mime: a.mime || undefined,
      }))
    } catch {}
  }
  const audioRef = r.audio_r2_key
    ? {
        storage: 'r2',
        key: r.audio_r2_key,
        url: assetUrl(r.audio_r2_key, origin),
        mime: r.audio_mime || undefined,
      }
    : undefined
  let reactions = []
  if (r.reactions_json) {
    try { reactions = JSON.parse(r.reactions_json) } catch {}
  }
  let photoExternalURLs = []
  if (r.photo_external_urls_json) {
    try { photoExternalURLs = JSON.parse(r.photo_external_urls_json) } catch {}
  }
  return {
    id: r.id,
    tripId: r.trip_id || undefined,
    stopId: r.stop_id || undefined,
    authorTraveler: r.author_traveler,
    visibility: r.visibility,
    kind: r.kind || undefined,
    text: r.text || undefined,
    caption: r.caption || undefined,
    transcript: r.transcript || undefined,
    transcriptLang: r.transcript_lang || undefined,
    transcriptionStatus: r.transcription_status || undefined,
    durationSeconds: r.duration_seconds ?? undefined,
    mood: r.mood || undefined,
    reactions,
    photoRef,
    photoRefs,
    photoExternalURLs,
    audioRef,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : undefined,
  }
}

function assetUrl(key, origin) {
  const enc = key.split('/').map(encodeURIComponent).join('/')
  return `${origin || ''}/assets/${enc}`
}

// Resolve the absolute origin to embed in returned asset URLs. Prefers
// an env override (so we can pin to a custom domain later), falling
// back to the request URL the Worker just received. Without this,
// rowToMemory used to emit relative URLs ("/assets/...") which the
// client tried to resolve against its own origin (jonathantheblip.github.io)
// and 404'd on every photo render from a non-author device.
function workerOrigin(env, url) {
  if (env.WORKER_ORIGIN) return env.WORKER_ORIGIN.replace(/\/+$/, '')
  if (url) return `${url.protocol}//${url.host}`
  return ''
}

function toEpochMs(v) {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const ms = Date.parse(v)
    return Number.isFinite(ms) ? ms : Date.now()
  }
  return Date.now()
}

// ─── Trips ────────────────────────────────────────────────────────────

async function getTrips(env, url, cors) {
  const since = parseInt(url.searchParams.get('since') || '0', 10) || 0
  const { results } = await env.DB.prepare(
    `SELECT * FROM trips
     WHERE updated_at > ? AND deleted_at IS NULL
     ORDER BY updated_at ASC`
  ).bind(since).all()
  const out = results.map((r) => {
    try {
      const trip = JSON.parse(r.data_json)
      if (r.date_range_start) trip.dateRangeStart = r.date_range_start
      if (r.date_range_end) trip.dateRangeEnd = r.date_range_end
      if (r.end_city) trip.endCity = r.end_city
      return trip
    } catch {
      return null
    }
  }).filter(Boolean)
  return json(out, 200, { ...cors, 'Cache-Control': 'no-store' })
}

async function postTrip(env, request, cors) {
  const trip = await request.json()
  if (!trip?.id) return json({ error: 'missing id' }, 400, cors)
  const updatedAt = Date.now()
  await env.DB.prepare(
    `INSERT INTO trips (
       id, title, date_range_start, date_range_end, end_city,
       data_json, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       date_range_start = excluded.date_range_start,
       date_range_end = excluded.date_range_end,
       end_city = excluded.end_city,
       data_json = excluded.data_json,
       updated_at = excluded.updated_at,
       deleted_at = NULL`
  ).bind(
    trip.id, trip.title || null,
    trip.dateRangeStart || null, trip.dateRangeEnd || null,
    trip.endCity || null,
    JSON.stringify(trip), updatedAt
  ).run()
  return json({ ok: true, id: trip.id }, 200, cors)
}

async function deleteTrip(env, id, cors) {
  const now = Date.now()
  await env.DB.prepare(
    'UPDATE trips SET deleted_at = ?, updated_at = ? WHERE id = ?'
  ).bind(now, now, id).run()
  return json({ ok: true, id }, 200, cors)
}

// ─── Assets (R2) ──────────────────────────────────────────────────────

async function uploadAsset(env, traveler, kind, memoryId, request, url, cors) {
  const rand = Math.random().toString(36).slice(2, 10)
  const key = `${traveler}/${memoryId}/${kind}-${rand}`
  const contentType = request.headers.get('Content-Type') || 'application/octet-stream'
  await env.ASSETS.put(key, request.body, {
    httpMetadata: { contentType },
  })
  return json({
    key,
    url: assetUrl(key, workerOrigin(env, url)),
    mime: contentType,
  }, 200, cors)
}

async function fetchAsset(env, key, cors) {
  const decoded = decodeURIComponent(key)
  const obj = await env.ASSETS.get(decoded)
  if (!obj) return new Response('not found', { status: 404, headers: cors })
  const headers = new Headers(cors)
  if (obj.httpMetadata?.contentType) {
    headers.set('Content-Type', obj.httpMetadata.contentType)
  }
  headers.set('Cache-Control', 'private, max-age=31536000, immutable')
  return new Response(obj.body, { status: 200, headers })
}

// ─── Leave-when (Routes API proxy) ────────────────────────────────────

async function postLeaveWhen(env, request, cors) {
  if (!env.GOOGLE_PLACES_API_KEY) {
    return json({ error: 'Routes API not configured on worker' }, 500, cors)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400, cors)
  }

  const { origin, destination, targetArrivalISO } = body || {}
  if (
    !Number.isFinite(origin?.lat) ||
    !Number.isFinite(origin?.lng)
  ) {
    return json({ error: 'missing or invalid origin {lat,lng}' }, 400, cors)
  }
  if (
    !Number.isFinite(destination?.lat) ||
    !Number.isFinite(destination?.lng)
  ) {
    return json({ error: 'missing or invalid destination {lat,lng}' }, 400, cors)
  }
  if (typeof targetArrivalISO !== 'string') {
    return json({ error: 'missing targetArrivalISO' }, 400, cors)
  }
  const targetMs = Date.parse(targetArrivalISO)
  if (!Number.isFinite(targetMs)) {
    return json({ error: 'invalid targetArrivalISO' }, 400, cors)
  }
  if (targetMs <= Date.now()) {
    return json({ error: 'Target arrival is already past' }, 400, cors)
  }

  // Seed: client-supplied (typically drivingMinutesComputed from the
  // seed), else haversine/30mph fallback. Iteration converges fast even
  // with a wildly-off seed, but a good seed keeps it to 1 call most of
  // the time.
  const seed = Number.isFinite(body.seedDurationMinutes)
    ? body.seedDurationMinutes
    : straightLineMinutes(origin.lat, origin.lng, destination.lat, destination.lng)

  try {
    const result = await iterateLeaveBy({
      targetArrival: new Date(targetMs),
      seedDurationMinutes: seed,
      callRoutes: (departureISO) =>
        callRoutesDriveDuration({
          apiKey: env.GOOGLE_PLACES_API_KEY,
          origin,
          destination,
          departureISO,
        }),
    })
    return json(result, 200, cors)
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500, cors)
  }
}

// ─── Places Nearby (text search w/ location bias) ─────────────────────
//
// Powers the Jonathan-view Queue ("Bathroom / Fast food / Outside /
// Emergency" — runtime queries for "I need this NOW, where's the
// nearest one"). Wraps Places (New) searchText so the API key never
// reaches the client bundle. Returns the top results ranked by
// straight-line distance with name, address, coords, and open state.

async function postPlacesNearby(env, request, cors) {
  if (!env.GOOGLE_PLACES_API_KEY) {
    return json({ error: 'Places API not configured on worker' }, 500, cors)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400, cors)
  }

  const query = typeof body?.query === 'string' ? body.query.trim() : ''
  if (!query) return json({ error: 'missing query' }, 400, cors)
  const lat = Number(body?.location?.lat)
  const lng = Number(body?.location?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ error: 'missing or invalid location {lat,lng}' }, 400, cors)
  }
  const radius = Number.isFinite(Number(body?.radius)) ? Number(body.radius) : 1500
  const clampedRadius = Math.max(100, Math.min(50000, radius))
  const limit = Math.max(1, Math.min(10, Number(body?.limit) || 5))

  const reqBody = {
    textQuery: query,
    maxResultCount: limit,
    rankPreference: 'DISTANCE',
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: clampedRadius,
      },
    },
  }

  let res
  try {
    res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': env.GOOGLE_PLACES_API_KEY,
        'x-goog-fieldmask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.regularOpeningHours.openNow,places.currentOpeningHours.openNow,places.nationalPhoneNumber',
      },
      body: JSON.stringify(reqBody),
    })
  } catch (e) {
    return json({ error: `places fetch failed: ${e?.message || String(e)}` }, 502, cors)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return json(
      { error: `places ${res.status}: ${text.slice(0, 200)}` },
      502,
      cors
    )
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
        distanceMeters: Math.round(
          haversineMeters(lat, lng, pLat, pLng)
        ),
        openNow:
          p?.currentOpeningHours?.openNow ??
          p?.regularOpeningHours?.openNow ??
          null,
        businessStatus: p.businessStatus || null,
        phone: p.nationalPhoneNumber || null,
      }
    })
    .filter(Boolean)
    // Filter out NOT operational; CLOSED_TEMPORARILY/PERMANENTLY_CLOSED
    // are useless for "I need this NOW" queries.
    .filter((r) => !r.businessStatus || r.businessStatus === 'OPERATIONAL')
    .sort((a, b) => a.distanceMeters - b.distanceMeters)

  return json({ results, radiusMeters: clampedRadius }, 200, {
    ...cors,
    'Cache-Control': 'no-store',
  })
}

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

// ─── Share-In v2 ──────────────────────────────────────────────────────
//
// Two endpoints back the client's import flow:
//   GET  /resolve?url=...  — follow redirects on Google Maps short
//                            links (maps.app.goo.gl, goo.gl). Allowlist
//                            is hardcoded so unrelated short URLs can't
//                            ride the Worker as a shortener-resolver.
//   POST /draft            — call Anthropic Claude to draft default
//                            tags (which family members would enjoy)
//                            and per-traveler descriptions for a venue.
//                            Used by the import confirmation card to
//                            pre-fill suggestions the user can edit.

const SHARE_RESOLVE_ALLOWED_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  // We also accept already-resolved long-form hosts as a no-op —
  // simplifies the client (just pipe anything through /resolve).
  'maps.google.com',
  'www.google.com',
  'google.com',
  'maps.apple.com',
])

const RESOLVE_MAX_HOPS = 5

async function getResolve(env, url, cors) {
  const target = url.searchParams.get('url')
  if (!target) return json({ error: 'missing url' }, 400, cors)

  let parsed
  try {
    parsed = new URL(target)
  } catch {
    return json({ error: 'invalid url' }, 400, cors)
  }
  if (!SHARE_RESOLVE_ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return json(
      { error: 'host not allowed', hostname: parsed.hostname },
      400,
      cors
    )
  }

  let current = parsed.toString()
  let hops = 0
  let final = current
  try {
    while (hops < RESOLVE_MAX_HOPS) {
      hops += 1
      const res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        // Workers fetch needs *some* UA on Google's short-link host or
        // it sometimes serves an interstitial instead of the 302.
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; roadtrip-sync/1.0)' },
      })
      const loc = res.headers.get('Location')
      if (res.status >= 300 && res.status < 400 && loc) {
        // Resolve relative redirects against the current step.
        try {
          current = new URL(loc, current).toString()
        } catch {
          break
        }
        final = current
        continue
      }
      final = current
      break
    }
  } catch (e) {
    return json({ error: e?.message || String(e), partial: final }, 502, cors)
  }

  return json({ resolved: final, hops }, 200, {
    ...cors,
    'Cache-Control': 'public, max-age=300',
  })
}

// /draft — call Claude to suggest default tags + per-traveler
// descriptions. Body shape:
//   { name: string, address?: string, category: string }
// Response:
//   { tags: string[], descriptions: Record<traveler, string> }
//
// The client uses these as starter values in the confirmation card;
// every field is editable before save. We never silently save the
// model output — the user opts in by tapping Save.

const FAMILY = ['jonathan', 'helen', 'aurelia', 'rafa']

const FAMILY_VOICES = {
  jonathan: 'Direct, dad-driver lens. One sentence that surfaces the operational angle (drive, parking, kid-wrangling).',
  helen: 'Editorial, evocative. One or two sentences that name an aesthetic — what the light, the menu, or the texture of the place feels like.',
  aurelia: 'Teen-photogenic angle. One sentence focused on content, vibes, or food worth posting about.',
  rafa: 'Five-year-old lens. One short sentence about what specifically delights a young kid (slides, animals, snacks, levers).',
}

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'

async function postDraft(env, request, cors) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'Anthropic key not configured on worker' }, 500, cors)
  }
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400, cors)
  }
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const address = typeof body?.address === 'string' ? body.address.trim() : ''
  const category = typeof body?.category === 'string' ? body.category.trim() : ''
  if (!name) return json({ error: 'missing name' }, 400, cors)
  if (!category) return json({ error: 'missing category' }, 400, cors)

  const familyVoiceLines = FAMILY.map(
    (t) => `- ${t}: ${FAMILY_VOICES[t]}`
  ).join('\n')

  const userPrompt =
    `A family of four is on a trip and has just shared a place to add to "Things to do" for the trip:\n\n` +
    `Name: ${name}\n` +
    (address ? `Address: ${address}\n` : '') +
    `Category: ${category}\n\n` +
    `Family members:\n${familyVoiceLines}\n\n` +
    `Two outputs:\n` +
    `1. tags — array of which family members are most likely to enjoy this place. Include anyone for whom this is a genuinely good fit; skip anyone for whom it's a poor fit. At least one tag is required.\n` +
    `2. descriptions — one entry per *tagged* family member, written in their voice above. Skip family members who are NOT in tags.\n\n` +
    `Respond with a single JSON object: {"tags":[...],"descriptions":{...}}. ` +
    `No prose, no markdown — just the JSON.`

  let res
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
  } catch (e) {
    return json(
      { error: `anthropic fetch failed: ${e?.message || String(e)}` },
      502,
      cors
    )
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return json(
      { error: `anthropic ${res.status}: ${text.slice(0, 300)}` },
      502,
      cors
    )
  }
  const payload = await res.json().catch(() => ({}))
  const text =
    (Array.isArray(payload?.content) &&
      payload.content.map((c) => (c?.type === 'text' ? c.text : '')).join('')) ||
    ''
  const parsed = parseDraftJson(text)
  if (!parsed) {
    return json(
      { error: 'could not parse draft', raw: text.slice(0, 500) },
      502,
      cors
    )
  }
  return json(parsed, 200, { ...cors, 'Cache-Control': 'no-store' })
}

// Extract the first JSON object from the model's response. Models
// usually obey the "JSON only" instruction but occasionally wrap with
// ```json fences or a leading sentence; this strips both gracefully
// and falls back to null when nothing parses.
function parseDraftJson(text) {
  if (typeof text !== 'string') return null
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const slice = cleaned.slice(start, end + 1)
  let raw
  try {
    raw = JSON.parse(slice)
  } catch {
    return null
  }
  const tags = Array.isArray(raw?.tags)
    ? raw.tags.filter((t) => FAMILY.includes(t))
    : []
  const descriptions = {}
  if (raw?.descriptions && typeof raw.descriptions === 'object') {
    for (const t of tags) {
      const v = raw.descriptions[t]
      if (typeof v === 'string' && v.trim()) descriptions[t] = v.trim()
    }
  }
  if (!tags.length) return null
  return { tags, descriptions }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}
