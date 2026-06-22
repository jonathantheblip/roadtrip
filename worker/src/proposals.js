// Propose → decide (migration 014) — the pure rules + D1 ops for the family's
// "what should we do?" loop. Anyone proposes a "We could…" spot for OPEN time;
// non-deciders add a soft "I'm in"; the DECIDERS (the adults) accept/decline.
//
// Posture (mirrors auth.js):
//   - identity (proposer / voter / decider) is ALWAYS the session `traveler`
//     the worker passes in — NEVER a body-supplied id. index.js sets it.
//   - the ops take `db` (env.DB) explicitly and hold all the SQL, so they
//     unit-test directly and index.js stays a thin router.
//   - a missing `proposals` table (worker deployed before migration 014 is
//     applied) DEGRADES to empty / a caught error instead of 500ing — deploy
//     ordering can never lock anyone out.
//   - surprises never enter: a proposal references a nearby SPOT, not a memory,
//     so the surprise-masking boundary is untouched.

import { isAdult, isTraveler } from './auth.js'

export const PROPOSAL_STATUSES = ['pending', 'accepted', 'declined']

// Deciders are the adults (jonathan/helen) — the SAME list auth keys off, so a
// kid's accept/decline is refused by the server, not merely hidden in the UI.
export function canDecide(traveler) {
  return isAdult(traveler)
}

export function isNoTable(err) {
  return /no such table/i.test(String(err?.message || err))
}

function safeParse(s, fallback) {
  try {
    return s ? JSON.parse(s) : fallback
  } catch {
    return fallback
  }
}

// Row → API object (parse the JSON columns).
export function rowToProposal(r) {
  return {
    id: r.id,
    tripId: r.trip_id,
    spotId: r.spot_id,
    spot: safeParse(r.spot_json, null),
    proposedBy: r.proposed_by,
    recipients: safeParse(r.recipients_json, []),
    note: r.note || '',
    status: r.status,
    votes: safeParse(r.votes_json, []),
    decidedBy: r.decided_by || null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

// LIST a trip's proposals (family-shared within the trip; oldest → newest).
// Degrades to [] if the table isn't there yet (pre-migration).
export async function listProposals(db, tripId) {
  if (!tripId) return []
  try {
    const { results } = await db
      .prepare(`SELECT * FROM proposals WHERE trip_id = ? ORDER BY created_at ASC`)
      .bind(tripId)
      .all()
    return results.map(rowToProposal)
  } catch (err) {
    if (isNoTable(err)) return []
    throw err
  }
}

// CREATE a proposal. `traveler` (the proposer) is the SESSION identity. The id
// is client-generated (like memories) so a retried push is idempotent
// (INSERT OR IGNORE). Recipients are filtered to real travelers; note capped.
export async function createProposal(db, { id, traveler, tripId, spotId, spot, recipients, note, now }) {
  if (!id) return { error: 'missing id' }
  if (!tripId || !spotId) return { error: 'missing tripId or spotId' }
  const rec = JSON.stringify((Array.isArray(recipients) ? recipients : []).filter(isTraveler))
  const spotStr = spot && typeof spot === 'object' ? JSON.stringify(spot) : null
  await db
    .prepare(
      `INSERT OR IGNORE INTO proposals
        (id, trip_id, spot_id, spot_json, proposed_by, recipients_json, note, status, votes_json, decided_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '[]', NULL, ?, ?)`
    )
    .bind(id, tripId, spotId, spotStr, traveler, rec, (note || '').slice(0, 500), now, now)
    .run()
  return { ok: true, id }
}

// VOTE — toggle the session traveler's soft "I'm in" on a PENDING proposal.
// Adults may vote too, but their real lever is decide().
export async function voteProposal(db, { traveler, id, now }) {
  const row = await db
    .prepare(`SELECT votes_json, status FROM proposals WHERE id = ?`)
    .bind(id)
    .first()
  if (!row) return { error: 'not found' }
  if (row.status !== 'pending') return { error: 'not pending' }
  const cur = safeParse(row.votes_json, [])
  const votes = cur.includes(traveler) ? cur.filter((v) => v !== traveler) : [...cur, traveler]
  await db
    .prepare(`UPDATE proposals SET votes_json = ?, updated_at = ? WHERE id = ?`)
    .bind(JSON.stringify(votes), now, id)
    .run()
  return { ok: true, votes }
}

// DECIDE — accept/decline. DECIDERS (adults) ONLY, enforced HERE (not just the
// UI): a non-adult is refused with 403. The UPDATE is atomic on status =
// 'pending', so two adults deciding at once can't double-flip — the second is a
// no-op (changes === 0 → "already decided").
export async function decideProposal(db, { traveler, id, decision, now }) {
  if (!canDecide(traveler)) return { error: 'forbidden', status: 403 }
  if (decision !== 'accepted' && decision !== 'declined') return { error: 'bad decision', status: 400 }
  const res = await db
    .prepare(`UPDATE proposals SET status = ?, decided_by = ?, updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(decision, traveler, now, id)
    .run()
  if (!res.meta.changes) return { error: 'not found or already decided', status: 409 }
  return { ok: true, status: decision, decidedBy: traveler }
}
