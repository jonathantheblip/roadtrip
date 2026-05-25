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
// Photon — Rust→WASM image library. We import the workerd entrypoint
// which initializes synchronously against the bundled .wasm module,
// so `PhotonImage.new_from_byteslice(...)` works on the first call
// without a deferred init. Bundle impact: ~700 KB uncompressed
// (~250 KB compressed). CPU per resize at 5712×4284 → 2048: roughly
// 100 ms — fine under the Workers Standard plan (30s CPU/request).
import { PhotonImage, resize, SamplingFilter } from '@cf-wasm/photon'

const TRAVELERS = ['jonathan', 'helen', 'aurelia', 'rafa']

export default {
  async fetch(request, env, ctx) {
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
        const key = path.replace(/^\/assets\//, '')
        // ?w= triggers the on-the-fly resize branch. Photo-only,
        // since audio assets share the /assets/ prefix and resizing
        // them is meaningless. Cached variants land at
        // <key>_w<w>_q<quality> in R2 so subsequent requests skip
        // the photon CPU spend.
        const wParam = url.searchParams.get('w')
        if (wParam && key.includes('/photo-')) {
          return await fetchResizedAsset(env, ctx, key, url.searchParams, cors)
        }
        return await fetchAsset(env, key, cors)
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

      // Claude-in-App (M1)
      if (path === '/claude/chat' && request.method === 'POST') {
        return await postClaudeChat(env, traveler, request, cors)
      }
      if (path === '/claude/conversations' && request.method === 'GET') {
        return await getClaudeConversations(env, url, cors)
      }
      if (path === '/claude/conversations' && request.method === 'POST') {
        return await postClaudeConversation(env, traveler, request, cors)
      }
      const convoMsgMatch = path.match(/^\/claude\/conversations\/([^/]+)\/messages$/)
      if (convoMsgMatch && request.method === 'GET') {
        return await getClaudeConversationMessages(env, convoMsgMatch[1], cors)
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

// On-the-fly photo resize with R2-cached variants.
//
// URL: GET /assets/<key>?w=<int>[&q=<int>]
//   - w is clamped to [16, 4096]; values out of range round-trip
//     to the nearest endpoint silently
//   - q defaults to 82 (slightly tighter than the 0.85 client
//     pipeline since we're producing a thumbnail)
//
// Cache key: <key>_w<w>_q<q>. First request: fetch the original,
// run photon resize + JPEG encode, PUT to R2 at the cache key,
// serve. Subsequent requests: serve the cached variant directly.
//
// If the original isn't found, 404. If photon fails on a particular
// image, the handler falls back to serving the original — the
// album tile will still render, just bigger than ideal.
const PHOTO_RESIZE_DEFAULT_QUALITY = 82
const PHOTO_RESIZE_MIN = 16
const PHOTO_RESIZE_MAX = 4096

async function fetchResizedAsset(env, ctx, key, searchParams, cors) {
  const decoded = decodeURIComponent(key)
  // Clamp / coerce inputs.
  let w = parseInt(searchParams.get('w') || '0', 10)
  if (!Number.isFinite(w) || w <= 0) {
    return new Response('bad w', { status: 400, headers: cors })
  }
  w = Math.max(PHOTO_RESIZE_MIN, Math.min(PHOTO_RESIZE_MAX, w))
  let q = parseInt(searchParams.get('q') || '', 10)
  if (!Number.isFinite(q) || q < 1 || q > 100) q = PHOTO_RESIZE_DEFAULT_QUALITY

  const cacheKey = `${decoded}_w${w}_q${q}`

  // Cache hit — serve directly.
  const cached = await env.ASSETS.get(cacheKey)
  if (cached) {
    const headers = new Headers(cors)
    headers.set('Content-Type', cached.httpMetadata?.contentType || 'image/jpeg')
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    headers.set('X-Photon-Cache', 'HIT')
    return new Response(cached.body, { status: 200, headers })
  }

  // Cache miss — fetch original, resize, store cached variant.
  const original = await env.ASSETS.get(decoded)
  if (!original) return new Response('not found', { status: 404, headers: cors })

  const inputBytes = new Uint8Array(await original.arrayBuffer())

  let resizedBytes
  try {
    const inImg = PhotonImage.new_from_byteslice(inputBytes)
    const srcW = inImg.get_width()
    const srcH = inImg.get_height()
    // Preserve aspect, clamp to longest edge = w. If the source is
    // already <= w on its longest edge, skip the resize and just
    // re-encode (or could serve the original — but re-encoding at
    // q=82 still trims bytes for huge JPEGs).
    let targetW = srcW
    let targetH = srcH
    const longest = Math.max(srcW, srcH)
    if (longest > w) {
      const scale = w / longest
      targetW = Math.max(1, Math.round(srcW * scale))
      targetH = Math.max(1, Math.round(srcH * scale))
    }
    let outImg = inImg
    if (targetW !== srcW || targetH !== srcH) {
      outImg = resize(inImg, targetW, targetH, SamplingFilter.Lanczos3)
      inImg.free?.()
    }
    resizedBytes = outImg.get_bytes_jpeg(q)
    outImg.free?.()
  } catch (err) {
    // Photon couldn't read the bytes (corrupt, unsupported format,
    // OOM). Serve the original so the tile at least renders.
    console.error('photon resize failed', err?.stack || err)
    const headers = new Headers(cors)
    headers.set('Content-Type', original.httpMetadata?.contentType || 'image/jpeg')
    headers.set('Cache-Control', 'private, max-age=300')
    headers.set('X-Photon-Cache', 'BYPASS')
    return new Response(inputBytes, { status: 200, headers })
  }

  // Write the cached variant in the background — don't block the
  // response on R2 PUT latency. MUST go through ctx.waitUntil:
  // without it, the Worker isolate is free to terminate as soon as
  // the response stream ends and the PUT silently never lands. (We
  // hit exactly that in deploy v7c02b06: identical requests both
  // returned X-Photon-Cache: MISS because the put was getting
  // killed.) ctx.waitUntil tells the runtime to keep the isolate
  // alive until the promise settles.
  const variantBuf = resizedBytes
  const putPromise = env.ASSETS.put(cacheKey, variantBuf, {
    httpMetadata: { contentType: 'image/jpeg' },
  }).catch((err) => console.error('photon cache put failed', err?.stack || err))
  ctx?.waitUntil?.(putPromise)

  const headers = new Headers(cors)
  headers.set('Content-Type', 'image/jpeg')
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('X-Photon-Cache', 'MISS')
  return new Response(variantBuf, { status: 200, headers })
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

// ─── Claude in the App (M1) ───────────────────────────────────────────
//
// Endpoints:
//   POST /claude/chat                              — streaming SSE
//   GET  /claude/conversations?user_id&trip_id     — list (newest first)
//   GET  /claude/conversations/:id/messages        — full history
//   POST /claude/conversations                     — explicit create
//
// /claude/chat is the workhorse. The client passes
//   { user_id, trip_id, conversation_id, message }
// the Worker:
//   1. upserts the conversation row (creates if first message)
//   2. appends the user message
//   3. builds the system prompt from family_profiles + active trip + reader identity
//   4. calls Anthropic with `stream: true`
//   5. proxies the stream as our simpler shape:
//        data: { "type": "text_delta", "text": "..." }
//        data: { "type": "done", "usage": { input_tokens, output_tokens } }
//   6. persists the full assistant text + token usage on stream completion
//
// Anthropic's wire format gets parsed inside the Worker; the client only
// sees text_delta + done. Keeps the front-end small and the contract
// stable if we swap models later.

// One source of truth for the chat model — M6's budget logic reads
// this same function to estimate per-call cost from the active model's
// token rates. To swap the model without a code deploy, set the
// `CLAUDE_CHAT_MODEL` env var (a Worker `[vars]` entry or
// `wrangler secret put`); the default below is what ships if no
// override is set.
const DEFAULT_CHAT_MODEL = 'claude-sonnet-4-6'
const CLAUDE_CHAT_MAX_TOKENS = 2048
export function chatModel(env) {
  const override = typeof env?.CLAUDE_CHAT_MODEL === 'string' ? env.CLAUDE_CHAT_MODEL.trim() : ''
  return override || DEFAULT_CHAT_MODEL
}

async function postClaudeChat(env, traveler, request, cors) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'Anthropic key not configured on worker' }, 500, cors)
  }
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400, cors)
  }
  const userId = typeof body?.user_id === 'string' ? body.user_id : traveler
  const tripId = typeof body?.trip_id === 'string' && body.trip_id ? body.trip_id : null
  const conversationId =
    typeof body?.conversation_id === 'string' && body.conversation_id
      ? body.conversation_id
      : null
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!conversationId) return json({ error: 'missing conversation_id' }, 400, cors)
  if (!message) return json({ error: 'missing message' }, 400, cors)

  // Upsert conversation (idempotent — creates on first call with this id).
  await upsertConversation(env, conversationId, userId, tripId)

  // Persist user message before the model call, so a failed/aborted
  // stream still leaves a visible record on next load.
  await insertMessage(env, conversationId, 'user', message, null, null)

  // Prior message history for this conversation (excluding the one we
  // just inserted — we'll send it as the final user message below).
  const history = await listMessagesForApi(env, conversationId)
  // The just-inserted message is the last row; pop it and use the text
  // as the final user turn. (Some SQL stacks return it as the most
  // recent created_at row; we filter by id to be precise.)
  const apiMessages = history
    .filter((m) => !(m.role === 'user' && m.content === message && m.position === history.length - 1))
    .map((m) => ({ role: m.role, content: m.content }))
  apiMessages.push({ role: 'user', content: message })

  // Build the system prompt from family + active trip + reader identity.
  const systemPrompt = await buildClaudeSystemPrompt(env, { readerUserId: userId, tripId })

  // Call Anthropic with stream:true. We translate their SSE format into
  // our own minimal shape before sending bytes to the client.
  let upstream
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: chatModel(env),
        max_tokens: CLAUDE_CHAT_MAX_TOKENS,
        stream: true,
        system: systemPrompt,
        messages: apiMessages,
      }),
    })
  } catch (e) {
    return json(
      { error: `anthropic fetch failed: ${e?.message || String(e)}` },
      502,
      cors
    )
  }
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '')
    return json(
      { error: `anthropic ${upstream.status}: ${text.slice(0, 300)}` },
      502,
      cors
    )
  }

  // Pipe through a transform stream. We accumulate the assistant text +
  // final usage and write it back to D1 once the upstream stream closes.
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  ;(async () => {
    let assembled = ''
    let usage = { input_tokens: null, output_tokens: null }
    const reader = upstream.body
      .pipeThrough(new TextDecoderStream())
      .getReader()
    let buf = ''
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += value
        // Anthropic SSE frames are separated by blank lines; each frame
        // is an `event:` line followed by a `data:` JSON line. Parse
        // line-by-line, holding the trailing partial in `buf`.
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const dataStr = line.slice(5).trim()
          if (!dataStr) continue
          let event
          try {
            event = JSON.parse(dataStr)
          } catch {
            continue
          }
          if (
            event.type === 'content_block_delta' &&
            event.delta?.type === 'text_delta' &&
            typeof event.delta.text === 'string'
          ) {
            assembled += event.delta.text
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'text_delta', text: event.delta.text })}\n\n`
              )
            )
          } else if (event.type === 'message_delta' && event.usage) {
            if (typeof event.usage.input_tokens === 'number') {
              usage.input_tokens = event.usage.input_tokens
            }
            if (typeof event.usage.output_tokens === 'number') {
              usage.output_tokens = event.usage.output_tokens
            }
          } else if (event.type === 'message_start' && event.message?.usage) {
            if (typeof event.message.usage.input_tokens === 'number') {
              usage.input_tokens = event.message.usage.input_tokens
            }
          }
        }
      }
      // Persist the full assistant message + usage, then signal done.
      await insertMessage(
        env,
        conversationId,
        'assistant',
        assembled,
        usage.input_tokens,
        usage.output_tokens
      )
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'done', usage })}\n\n`
        )
      )
    } catch (e) {
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'error', message: e?.message || String(e) })}\n\n`
        )
      )
    } finally {
      await writer.close().catch(() => {})
    }
  })()

  return new Response(readable, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}

async function upsertConversation(env, id, userId, tripId) {
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO conversations (id, user_id, trip_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`
  ).bind(id, userId, tripId, now, now).run()
}

async function insertMessage(env, conversationId, role, content, inputTok, outputTok) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO conversation_messages
       (id, conversation_id, role, content, created_at, usage_input_tokens, usage_output_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, conversationId, role, content, now, inputTok, outputTok).run()
  await env.DB.prepare(
    `UPDATE conversations SET updated_at = ? WHERE id = ?`
  ).bind(now, conversationId).run()
  return id
}

// listMessagesForApi returns the messages in chronological order
// with a `position` field so callers can identify the last row reliably.
async function listMessagesForApi(env, conversationId) {
  const { results } = await env.DB.prepare(
    `SELECT id, role, content, created_at
       FROM conversation_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC, id ASC`
  ).bind(conversationId).all()
  return (results || []).map((r, i) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    created_at: r.created_at,
    position: i,
  }))
}

async function getClaudeConversations(env, url, cors) {
  const userId = url.searchParams.get('user_id')
  if (!userId) return json({ error: 'missing user_id' }, 400, cors)
  const tripIdParam = url.searchParams.get('trip_id')

  // SQLite treats `WHERE x = NULL` as never-true, so route the null
  // case through `IS NULL` instead of binding NULL.
  let rows
  if (tripIdParam) {
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.user_id, c.trip_id, c.created_at, c.updated_at,
              (SELECT content FROM conversation_messages
                 WHERE conversation_id = c.id AND role = 'user'
                 ORDER BY created_at ASC LIMIT 1) AS preview
         FROM conversations c
        WHERE c.user_id = ? AND c.trip_id = ?
        ORDER BY c.updated_at DESC
        LIMIT 20`
    ).bind(userId, tripIdParam).all()
    rows = results
  } else {
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.user_id, c.trip_id, c.created_at, c.updated_at,
              (SELECT content FROM conversation_messages
                 WHERE conversation_id = c.id AND role = 'user'
                 ORDER BY created_at ASC LIMIT 1) AS preview
         FROM conversations c
        WHERE c.user_id = ? AND c.trip_id IS NULL
        ORDER BY c.updated_at DESC
        LIMIT 20`
    ).bind(userId).all()
    rows = results
  }
  return json(rows || [], 200, { ...cors, 'Cache-Control': 'no-store' })
}

async function postClaudeConversation(env, traveler, request, cors) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400, cors)
  }
  const id = typeof body?.id === 'string' && body.id ? body.id : crypto.randomUUID()
  const userId = typeof body?.user_id === 'string' ? body.user_id : traveler
  const tripId = typeof body?.trip_id === 'string' && body.trip_id ? body.trip_id : null
  await upsertConversation(env, id, userId, tripId)
  return json({ id, user_id: userId, trip_id: tripId }, 200, cors)
}

async function getClaudeConversationMessages(env, conversationId, cors) {
  const { results } = await env.DB.prepare(
    `SELECT id, role, content, created_at, usage_input_tokens, usage_output_tokens
       FROM conversation_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC, id ASC`
  ).bind(conversationId).all()
  return json(results || [], 200, { ...cors, 'Cache-Control': 'no-store' })
}

// System prompt — pulls profiles + active trip + reader identity.
// Exported so the unit test can call it without a live D1 binding by
// stubbing env.DB.
export async function buildClaudeSystemPrompt(env, { readerUserId, tripId }) {
  const profiles = await loadFamilyProfiles(env)
  const reader = profiles[readerUserId] || profiles.helen || profiles.jonathan
  const trip = tripId ? await loadTrip(env, tripId) : null

  const lines = []
  lines.push(
    'You are Claude, a thinking partner helping the Jackson family plan and live their trips inside their family trip app.'
  )
  lines.push(
    'Be warm, specific, and grounded. Speak naturally — not in bullet lists unless the question begs for one. Never invent venues, hours, addresses, or other specifics; if you do not know a concrete detail, say so and point the reader back to the app or to checking directly.'
  )
  lines.push(
    'Your job is to help with trip-planning, surfacing tradeoffs, and answering questions about the family\'s trips. You do not take actions yet; in this version you only talk. If asked to make a change, explain what you would change and tell the reader to make the edit themselves for now.'
  )

  lines.push('')
  lines.push('## Who is talking to you right now')
  lines.push(formatReader(reader))

  lines.push('')
  lines.push('## The family')
  for (const id of ['jonathan', 'helen', 'aurelia', 'rafa']) {
    const p = profiles[id]
    if (!p) continue
    lines.push(formatProfile(p))
  }

  lines.push('')
  if (trip) {
    lines.push('## The trip currently open in the app')
    lines.push(formatTrip(trip))
  } else {
    lines.push('## Trip context')
    lines.push(
      'No specific trip is currently open. The reader is on the trips list. Help them plan, compare, or pick — without invoking specifics of a trip you have not been shown.'
    )
  }

  lines.push('')
  lines.push('## Style')
  lines.push(
    '- Use the reader\'s name once when it lands naturally; do not over-do it.'
  )
  lines.push(
    '- Both adults drive. Do not call Jonathan "the driver" or describe Helen as "being driven." Refer to the family\'s travel without gendered driving framing.'
  )
  lines.push(
    '- Treat any uncertainty as a place to ask a question, not to fabricate. If the family member could verify in the app, say so.'
  )

  return lines.join('\n')
}

async function loadFamilyProfiles(env) {
  const out = {}
  try {
    const { results } = await env.DB.prepare(
      `SELECT user_id, display_name, age, role, dietary, interests, tolerances, notes
         FROM family_profiles`
    ).all()
    for (const r of results || []) out[r.user_id] = r
  } catch {
    // family_profiles missing (migration not yet run) — fall back to a
    // minimal in-memory seed so the chat endpoint still works.
    return {
      jonathan: { user_id: 'jonathan', display_name: 'Jonathan', age: 'Dad', role: 'ops' },
      helen: { user_id: 'helen', display_name: 'Helen', age: 'Mom', role: 'archive' },
      aurelia: { user_id: 'aurelia', display_name: 'Aurelia', age: '13', role: 'her stuff' },
      rafa: { user_id: 'rafa', display_name: 'Rafa', age: '4', role: 'mission' },
    }
  }
  return out
}

async function loadTrip(env, tripId) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, title, date_range_start, date_range_end, end_city, data_json
         FROM trips
        WHERE id = ? AND deleted_at IS NULL`
    ).bind(tripId).all()
    const row = results?.[0]
    if (!row) return null
    let data = null
    try { data = JSON.parse(row.data_json) } catch {}
    return {
      id: row.id,
      title: row.title || data?.title,
      dateRangeStart: row.date_range_start || data?.dateRangeStart,
      dateRangeEnd: row.date_range_end || data?.dateRangeEnd,
      endCity: row.end_city || data?.endCity,
      data,
    }
  } catch {
    return null
  }
}

function formatReader(p) {
  if (!p) return 'The reader\'s identity could not be resolved.'
  const bits = [`Name: ${p.display_name}`]
  if (p.age) bits.push(`Age: ${p.age}`)
  if (p.role) bits.push(`Role in the family: ${p.role}`)
  if (p.tolerances) bits.push(`Things they have asked for: ${p.tolerances}`)
  return bits.join('. ') + '.'
}

function formatProfile(p) {
  const bits = [`- ${p.display_name}`]
  if (p.age) bits.push(`(${p.age})`)
  if (p.role) bits.push(`— ${p.role}`)
  let line = bits.join(' ')
  const tail = []
  if (p.interests) tail.push(`interests: ${p.interests}`)
  if (p.dietary) tail.push(`dietary: ${p.dietary}`)
  if (p.tolerances) tail.push(`tolerances: ${p.tolerances}`)
  if (p.notes) tail.push(p.notes)
  if (tail.length) line += `. ${tail.join('; ')}.`
  return line
}

function formatTrip(t) {
  if (!t) return ''
  const lines = []
  lines.push(`Title: ${t.title || '(untitled)'}`)
  if (t.dateRangeStart || t.dateRangeEnd) {
    lines.push(`Dates: ${t.dateRangeStart || '?'} → ${t.dateRangeEnd || '?'}`)
  }
  if (t.endCity) lines.push(`End city: ${t.endCity}`)
  const days = t.data?.days
  if (Array.isArray(days) && days.length) {
    lines.push(`Days: ${days.length}`)
    for (const d of days) {
      const dayLine = [
        `  Day ${d.n}${d.date ? ` (${d.date})` : ''}${d.name ? `: ${d.name}` : ''}`,
      ]
      lines.push(dayLine.join(''))
      const stops = Array.isArray(d.stops) ? d.stops : []
      for (const s of stops) {
        const parts = []
        if (s.time) parts.push(s.time)
        if (s.kind) parts.push(s.kind)
        const head = parts.join(' · ')
        const title = s.title || s.name || '(stop)'
        const sub = s.location || s.loc || s.address || ''
        lines.push(`    • ${head ? head + ' — ' : ''}${title}${sub ? ` @ ${sub}` : ''}`)
      }
    }
  }
  return lines.join('\n')
}

// ─── Helpers ──────────────────────────────────────────────────────────

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}
