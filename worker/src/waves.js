// Cross-device "Wave hi!" (migration 016) — the pure rules + D1 ops behind the
// family wave. A wave is a tiny DIRECTED ping (who → whom, on which trip); the
// recipient's device polls for unseen waves addressed to them, pops a friendly
// cue, and marks them seen.
//
// Posture (mirrors proposals.js / presence.js):
//   - the SENDER (from_traveler) is ALWAYS the session `traveler` the worker
//     passes in — NEVER a body-supplied id. index.js sets it.
//   - a traveler may only LIST / mark-seen waves addressed to THEMSELVES (the
//     route passes the session traveler as the to-filter) — you can't read or
//     dismiss someone else's waves.
//   - a missing `waves` table (deployed before migration 016) DEGRADES to empty /
//     a caught error instead of 500ing.
//   - waves carry NO location and NO message — just identities + a timestamp; they
//     never enter Claude / the weave / surprises.

import { isTraveler } from './auth.js'

// A wave not seen within this window is purged even if undelivered (the recipient
// never opened the app during the trip) — a wave is a "right now" delight, stale
// after a couple of days. Seen waves are purged immediately by the cron.
export const WAVE_STALE_MS = 48 * 60 * 60 * 1000 // 48h

export function isNoTable(err) {
  return /no such table/i.test(String(err?.message || err))
}

export function rowToWave(r) {
  return {
    id: r.id,
    tripId: r.trip_id,
    from: r.from_traveler,
    to: r.to_traveler,
    createdAt: Number(r.created_at),
    seenAt: r.seen_at != null ? Number(r.seen_at) : null,
  }
}

// CREATE a wave. `traveler` (the sender) is the SESSION identity. `to` is the
// recipient (validated). You can't wave yourself. Client-generated id → an
// idempotent retry (INSERT OR IGNORE) never duplicates.
export async function createWave(db, { id, traveler, tripId, to, now }) {
  if (!id) return { error: 'missing id' }
  if (!tripId) return { error: 'missing tripId' }
  if (!isTraveler(to)) return { error: 'bad recipient' }
  if (to === traveler) return { error: 'cannot wave yourself' }
  await db
    .prepare(
      `INSERT OR IGNORE INTO waves (id, trip_id, from_traveler, to_traveler, created_at, seen_at)
       VALUES (?, ?, ?, ?, ?, NULL)`
    )
    .bind(id, tripId, traveler, to, now)
    .run()
  return { ok: true, id }
}

// LIST the unseen waves addressed to `traveler` on a trip (oldest → newest).
// Degrades to [] if the table isn't there yet.
export async function listUnseenWaves(db, tripId, traveler) {
  if (!tripId || !isTraveler(traveler)) return []
  try {
    const { results } = await db
      .prepare(
        `SELECT * FROM waves WHERE trip_id = ? AND to_traveler = ? AND seen_at IS NULL ORDER BY created_at ASC`
      )
      .bind(tripId, traveler)
      .all()
    return results.map(rowToWave)
  } catch (err) {
    if (isNoTable(err)) return []
    throw err
  }
}

// MARK waves seen — ONLY waves addressed to `traveler` (you can't dismiss someone
// else's). Returns the count actually flipped.
export async function markWavesSeen(db, { traveler, ids, now }) {
  const list = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string').slice(0, 100)
  if (!list.length || !isTraveler(traveler)) return { seen: 0 }
  const placeholders = list.map(() => '?').join(',')
  const res = await db
    .prepare(
      `UPDATE waves SET seen_at = ? WHERE to_traveler = ? AND seen_at IS NULL AND id IN (${placeholders})`
    )
    .bind(now, traveler, ...list)
    .run()
  return { seen: res?.meta?.changes ?? 0 }
}

// Cron purge: drop SEEN waves (delivered, done) + STALE unseen (the recipient
// never opened the app — a wave is a "now" thing). Degrades to a no-op if the
// table is absent. Mirror of runPresencePurge.
export async function runWavePurge(db, { now, staleMs = WAVE_STALE_MS } = {}) {
  try {
    const res = await db
      .prepare(`DELETE FROM waves WHERE seen_at IS NOT NULL OR created_at < ?`)
      .bind(now - staleMs)
      .run()
    return { purged: res?.meta?.changes ?? 0 }
  } catch (err) {
    if (isNoTable(err)) return { purged: 0 }
    throw err
  }
}
