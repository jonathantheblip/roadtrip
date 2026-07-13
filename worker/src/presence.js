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
//
// ★ AMENDED 2026-07-12 (Build W5, BUILD_PLAN_WITNESS_FLEET_2.md) — the ONE
//   NAMED EXCEPTION to the paragraph above: worker/src/presenceWitness.js,
//   gated behind its own env.PHOTO_PRESENCE_MODE (see photoPresenceMode
//   below; ships OFF). It reads a SEPARATE, append-only table (migration
//   020's presence_trail, added by this same build — NOT this `presence`
//   table, and NOT yet applied to prod D1), matches a still-unlocated photo
//   against its own author's crumbs, and writes only
//   `ref.prov.gps='inferred-presence'` + coordinates back onto the memory —
//   it never re-exposes a raw crumb anywhere, never to a screen, another
//   device, or Claude. Everything else in this paragraph's original claim
//   still holds: no GET route ever serves a crumb, the weave/surprises never
//   thread through either table, and THIS `presence` table (latest-position)
//   is untouched by the exception — amended, not silently contradicted.

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

// presence_trail (migration 020) retention: trip + this many days, then
// purged by the extended runPresencePurge below. A tunable Jonathan can
// revisit later; this is the shipped default (BUILD_PLAN_WITNESS_FLEET_2.md
// W5's consented design).
export const PRESENCE_TRAIL_RETENTION_DAYS = 14

export function isNoTable(err) {
  return /no such table/i.test(String(err?.message || err))
}

const PRESENCE_MODES = new Set(['off', 'shadow', 'on'])

// THE KNOB (Build W5, BUILD_PLAN_WITNESS_FLEET_2.md) — env.PHOTO_PRESENCE_MODE.
// OWN and INDEPENDENT — unlike W0's per-lever knobs (photoTzMode et al.), this
// does NOT fall back to inheriting a caller-resolved global mode, because it
// is not a split-off piece of the old master switch: it is a brand-new,
// separately-consented write class (migration 020's presence_trail — WRITTEN
// but NOT YET APPLIED to prod D1 as of this build). Defaults OFF when
// unset/unrecognized (fail-safe, same shape as index.js's photoFacesMode).
// Ships OFF: off is the ONE value that guarantees zero queries against
// presence_trail from EITHER consumer (appendPresenceTrail/runPresencePurge
// below, and presenceWitness.js's own gate on this same function) — the
// load-bearing inertness property against a table that may not exist yet.
export function photoPresenceMode(env) {
  const raw = typeof env?.PHOTO_PRESENCE_MODE === 'string' ? env.PHOTO_PRESENCE_MODE.trim() : ''
  return PRESENCE_MODES.has(raw) ? raw : 'off'
}

// "2026-06-22" minus `days` → "2026-06-08". Used to turn "trip + 14 days"
// retention into a date the existing `date_range_end < ?` shape can compare
// against directly (same query shape as the ended-trips sweep below, offset).
function isoDateMinusDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
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

// Append this fix to the APPEND-ONLY history (migration 020's presence_trail
// — distinct from the latest-only `presence` row upsertPresence also writes
// above). Build W5. ONLY when the caller passes an EXPLICIT 'shadow'/'on'
// mode — every call site that predates this build, and every existing test,
// omits `mode` entirely and takes the OLD code path unchanged (this function
// is simply never invoked, so the live heartbeat stays byte-identical when
// the knob is off). Reuses sanitizePresence's OWN double gate: `s.precise===1`
// can only ever be true for an adult WITH a real fix (kids are refused before
// this point, always — sanitizePresence above), so this needs no separate
// kid check of its own. Best-effort: a missing table (the mode flipped ahead
// of migration 020 being applied) degrades to a silent no-op — it must never
// fail the live heartbeat this rides alongside.
async function appendPresenceTrail(db, { traveler, tripId, s, now, mode }) {
  if (mode !== 'shadow' && mode !== 'on') return
  if (s.precise !== 1) return
  try {
    await db
      .prepare(
        `INSERT INTO presence_trail (trip_id, traveler, lat, lng, accuracy, at) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(tripId, traveler, s.lat, s.lng, s.accuracy, now)
      .run()
  } catch (err) {
    if (!isNoTable(err)) throw err
  }
}

// UPSERT this device's latest presence for a trip. `traveler` is the SESSION
// identity (never the body). Latest-position-only: one row per (trip, traveler),
// overwritten each update; created_at is preserved across updates (first seen).
// `mode` (Build W5, optional) is the caller-resolved photoPresenceMode(env) —
// when it's 'shadow'/'on', this ALSO appends a crumb to presence_trail (see
// appendPresenceTrail above); omitted (every pre-W5 caller) → unchanged.
export async function upsertPresence(db, { traveler, tripId, body, now, mode }) {
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
  await appendPresenceTrail(db, { traveler, tripId, s, now, mode })
  return { ok: true, presence: { tripId, traveler, ...s, updatedAt: now } }
}

// Auto-purge (settled requirement). Runs in the nightly cron. Two sweeps on
// the LIVE `presence` table (unaffected by Build W5 — always run, exactly as
// before):
//   1) trips that have ENDED (date_range_end before today) — the trip's over, so
//      its presence is dropped wholesale.
//   2) STALE rows (not refreshed within PRESENCE_STALE_MS) — a safety net for
//      trips with no end date or orphaned rows; presence is "now" or it's gone.
// A THIRD sweep (Build W5), on presence_trail, ONLY when `mode` is an
// EXPLICIT 'shadow'/'on' (mirrors appendPresenceTrail's gate exactly — an
// omitted mode, every pre-W5 caller, never queries presence_trail at all):
// drops a trip's crumbs once it ended more than PRESENCE_TRAIL_RETENTION_DAYS
// ago ("retention = trip + 14 days", the consented design). Degrades to a
// no-op if a table is absent (pre-migration), never a 500.
export async function runPresencePurge(db, { todayIso, now, staleMs = PRESENCE_STALE_MS, mode } = {}) {
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
    let purgedTrail = 0
    if (mode === 'shadow' || mode === 'on') {
      try {
        const cutoff = isoDateMinusDays(todayIso, PRESENCE_TRAIL_RETENTION_DAYS)
        const trail = await db
          .prepare(
            `DELETE FROM presence_trail WHERE trip_id IN (
               SELECT id FROM trips WHERE date_range_end IS NOT NULL AND date_range_end < ?
             )`
          )
          .bind(cutoff)
          .run()
        purgedTrail = trail?.meta?.changes ?? 0
      } catch (err) {
        if (!isNoTable(err)) throw err
      }
    }
    return { purgedEnded: ended?.meta?.changes ?? 0, purgedStale: stale?.meta?.changes ?? 0, purgedTrail }
  } catch (err) {
    if (isNoTable(err)) return { purgedEnded: 0, purgedStale: 0, purgedTrail: 0 }
    throw err
  }
}
