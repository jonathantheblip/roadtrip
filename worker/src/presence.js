// "Who's around" (migration 015) — the pure rules + D1 ops for live family
// presence during an ACTIVE trip. Each family member's latest "where + what"
// shows on the Now tab: a coarse place bucket ("at the cabin / out"), an
// optional manual status, and a freshness timestamp (the live/idle dot).
//
// Posture (mirrors proposals.js / auth.js):
//   - identity (whose presence) is ALWAYS the session `traveler` the worker
//     passes in — NEVER a body-supplied id. index.js sets it.
//   - the ops take `db` (env.DB) explicitly and hold all the SQL, so they
//     unit-test directly and index.js stays a thin router.
//   - a missing `presence` table (worker deployed before migration 015 is
//     applied) DEGRADES to empty / a caught error instead of 500ing — deploy
//     ordering can never lock anyone out.
//
// ★ THE LOAD-BEARING PRIVACY RULE (settled): adults (jonathan/helen) store
//   PRECISE lat/lng; KIDS (aurelia/rafa) NEVER DO. `sanitizePresence` drops any
//   coordinates from a non-adult's request on the floor — so even a kid's own
//   client (or anything spoofing a kid's session) cannot land raw GPS in the
//   table. A kid's exact location never leaves their device; only the coarse
//   bucket they computed on-device is stored. The GET needs no per-viewer
//   masking BECAUSE the privacy already happened at write time.
//
// ★ Location stays OUT of Claude / the weave / surprises: nothing else in the
//   worker reads this table. It is isolated by construction — never thread a
//   presence read into buildClaudeSystemPrompt, the weave, or any cover path.

import { isAdult, isTraveler } from './auth.js'

// The coarse "where are you" buckets everyone shares. The client computes this
// on-device (distance from the stay place) and sends only the token; the place
// NAME lives in the trip, not here.
export const PLACE_BUCKETS = ['at_place', 'out', 'unknown']

// A manual status ("at the beach", "napping") is capped so a row stays small.
export const NOTE_MAX = 80

// Presence is ephemeral: a row not refreshed within this window is purged by the
// cron even if its trip has no clean end date (foreground-only sharing means a
// live row is re-posted constantly; a stale one is no longer "now").
export const PRESENCE_STALE_MS = 48 * 60 * 60 * 1000 // 48h

export function isNoTable(err) {
  return /no such table/i.test(String(err?.message || err))
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function normalizeBucket(b) {
  return PLACE_BUCKETS.includes(b) ? b : 'unknown'
}

function normalizeNote(n) {
  if (typeof n !== 'string') return null
  const t = n.trim()
  return t ? t.slice(0, NOTE_MAX) : null
}

// ★ THE PRIVACY GATE. Given the SESSION traveler and the raw request body,
// decide exactly what gets stored. For a non-adult, coordinates are dropped
// unconditionally (precise=0, lat/lng/accuracy NULL) — the body's lat/lng are
// ignored entirely. For an adult, a finite fix is stored (precise=1); an adult
// without a fix degrades to coarse (precise=0) but still shares the bucket.
export function sanitizePresence(traveler, body) {
  const placeBucket = normalizeBucket(body?.placeBucket)
  const note = normalizeNote(body?.note)
  if (isAdult(traveler)) {
    const lat = num(body?.lat)
    const lng = num(body?.lng)
    if (lat != null && lng != null) {
      return { precise: 1, lat, lng, accuracy: num(body?.accuracy), placeBucket, note }
    }
    return { precise: 0, lat: null, lng: null, accuracy: null, placeBucket, note }
  }
  // Kid (or any non-adult identity): coarse ONLY, always. Raw GPS never stored.
  return { precise: 0, lat: null, lng: null, accuracy: null, placeBucket, note }
}

// Row → API object.
export function rowToPresence(r) {
  return {
    tripId: r.trip_id,
    traveler: r.traveler,
    precise: !!r.precise,
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    accuracy: r.accuracy != null ? Number(r.accuracy) : null,
    placeBucket: r.place_bucket || 'unknown',
    note: r.note || null,
    updatedAt: Number(r.updated_at),
    createdAt: Number(r.created_at),
  }
}

// LIST a trip's presence (family-shared within the trip; stable by traveler).
// No per-viewer masking — a kid's precise coords were never stored, and adults'
// precise location is shared family-wide by the settled model. Degrades to []
// if the table isn't there yet (pre-migration).
export async function listPresence(db, tripId) {
  if (!tripId) return []
  try {
    const { results } = await db
      .prepare(`SELECT * FROM presence WHERE trip_id = ? ORDER BY traveler ASC`)
      .bind(tripId)
      .all()
    return results.map(rowToPresence)
  } catch (err) {
    if (isNoTable(err)) return []
    throw err
  }
}

// UPSERT this device's latest presence for a trip. `traveler` is the SESSION
// identity (never the body). Latest-position-only: one row per (trip, traveler),
// overwritten each update; created_at is preserved across updates (first seen).
export async function upsertPresence(db, { traveler, tripId, body, now }) {
  if (!isTraveler(traveler)) return { error: 'bad traveler' }
  if (!tripId) return { error: 'missing tripId' }
  const s = sanitizePresence(traveler, body)
  await db
    .prepare(
      `INSERT INTO presence
        (trip_id, traveler, precise, lat, lng, accuracy, place_bucket, note, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(trip_id, traveler) DO UPDATE SET
         precise = excluded.precise,
         lat = excluded.lat,
         lng = excluded.lng,
         accuracy = excluded.accuracy,
         place_bucket = excluded.place_bucket,
         note = excluded.note,
         updated_at = excluded.updated_at`
    )
    .bind(tripId, traveler, s.precise, s.lat, s.lng, s.accuracy, s.placeBucket, s.note, now, now)
    .run()
  return { ok: true, presence: { tripId, traveler, ...s, updatedAt: now } }
}

// Auto-purge (settled requirement). Runs in the nightly cron. Two sweeps:
//   1) trips that have ENDED (date_range_end before today) — the trip's over, so
//      its presence is dropped wholesale.
//   2) STALE rows (not refreshed within PRESENCE_STALE_MS) — a safety net for
//      trips with no end date or orphaned rows; presence is "now" or it's gone.
// Degrades to a no-op if the table is absent (pre-migration), never a 500.
export async function runPresencePurge(db, { todayIso, now, staleMs = PRESENCE_STALE_MS } = {}) {
  try {
    const ended = await db
      .prepare(
        `DELETE FROM presence WHERE trip_id IN (
           SELECT id FROM trips WHERE date_range_end IS NOT NULL AND date_range_end < ?
         )`
      )
      .bind(todayIso)
      .run()
    const stale = await db
      .prepare(`DELETE FROM presence WHERE updated_at < ?`)
      .bind(now - staleMs)
      .run()
    return { purgedEnded: ended?.meta?.changes ?? 0, purgedStale: stale?.meta?.changes ?? 0 }
  } catch (err) {
    if (isNoTable(err)) return { purgedEnded: 0, purgedStale: 0 }
    throw err
  }
}
