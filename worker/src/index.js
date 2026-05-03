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
// Soft delete: rows aren't dropped; deleted_at gets stamped. Pulls
// filter by updated_at > since so tombstones propagate.

const TRAVELERS = ['jonathan', 'helen', 'aurelia', 'rafa']

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') || ''
    const cors = corsHeaders(origin, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    // Auth
    const traveler = authenticate(request, env)
    if (!traveler) {
      return json({ error: 'unauthorized' }, 401, cors)
    }

    try {
      const path = url.pathname.replace(/\/+$/, '') || '/'

      if (path === '/memories' && request.method === 'GET') {
        return await getMemories(env, traveler, url, cors)
      }
      if (path === '/memories' && request.method === 'POST') {
        return await postMemory(env, traveler, request, cors)
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
      const fetchMatch = path.match(/^\/assets\/(.+)$/)
      if (fetchMatch && request.method === 'GET') {
        return await fetchAsset(env, fetchMatch[1], cors)
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
  const isAllowed = allowed.includes(origin) || origin.endsWith('.github.io')
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
  const { results } = await env.DB.prepare(
    `SELECT * FROM memories
     WHERE updated_at > ?
       AND (visibility = 'shared' OR author_traveler = ?)
     ORDER BY updated_at ASC`
  ).bind(since, traveler).all()
  const out = results.map((r) => rowToMemory(r, env))
  return json(out, 200, cors)
}

async function postMemory(env, traveler, request, cors) {
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
  return json(rowToMemory(results[0], env), 200, cors)
}

async function deleteMemory(env, traveler, id, cors) {
  const now = Date.now()
  await env.DB.prepare(
    'UPDATE memories SET deleted_at = ?, updated_at = ? WHERE id = ?'
  ).bind(now, now, id).run()
  return json({ ok: true, id }, 200, cors)
}

function rowToMemory(r, env) {
  if (!r) return null
  const workerOrigin = env.WORKER_ORIGIN || ''
  const photoRef = r.photo_r2_key
    ? {
        storage: 'r2',
        key: r.photo_r2_key,
        url: assetUrl(r.photo_r2_key, workerOrigin),
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
        url: assetUrl(a.key, workerOrigin),
        mime: a.mime || undefined,
      }))
    } catch {}
  }
  const audioRef = r.audio_r2_key
    ? {
        storage: 'r2',
        key: r.audio_r2_key,
        url: assetUrl(r.audio_r2_key, workerOrigin),
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
  // Origin is empty in dev → relative URL still works because the client
  // joins it with VITE_WORKER_URL itself.
  const enc = key.split('/').map(encodeURIComponent).join('/')
  return `${origin}/assets/${enc}`
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
  return json(out, 200, cors)
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
  const origin = env.WORKER_ORIGIN || `${url.protocol}//${url.host}`
  return json({
    key,
    url: `${origin}/assets/${key.split('/').map(encodeURIComponent).join('/')}`,
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

// ─── Helpers ──────────────────────────────────────────────────────────

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}
