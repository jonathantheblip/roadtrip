// Slice 2 — runScheduledReveals: the nightly cron unwraps DATE surprises whose
// day has arrived (server-side, so it fires even if nobody opens the app).
//
// NON-VACUOUS: asserts exactly which rows flip (past/today yes, future no,
// already-revealed untouched, non-surprise untouched) and that updated_at bumps
// so the next incremental sync delivers the now-unmasked record.
import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { runScheduledReveals } from '../src/index.js'
import { applySchema } from './helpers/schema.js'

function insertDateSurprise(id, atDate, revealedAt = null) {
  return env.DB.prepare(
    `INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, hide_from_json, reveal_json, revealed_at, created_at, updated_at)
     VALUES (?, 't1', 'jonathan', 'shared', 'text', ?, ?, ?, 1, 1)`
  ).bind(id, JSON.stringify(['rafa']), JSON.stringify({ type: 'date', at: atDate }), revealedAt).run()
}

describe('runScheduledReveals — date surprises unwrap on their day', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM memories').run()
  })

  it('reveals only still-hidden date surprises on/before today', async () => {
    await insertDateSurprise('past', '2026-06-01')
    await insertDateSurprise('today', '2026-06-08')
    await insertDateSurprise('future', '2026-09-01')
    await insertDateSurprise('already', '2026-06-01', '2026-06-01T00:00:00Z')
    // An arrival surprise must NOT be touched by the date pass.
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, hide_from_json, reveal_json, created_at, updated_at)
       VALUES ('arrival', 't1', 'jonathan', 'shared', 'text', ?, ?, 1, 1)`
    ).bind(JSON.stringify(['rafa']), JSON.stringify({ type: 'arrival', at: 's1', lat: 1, lng: 2 })).run()
    // A plain (non-surprise) memory must be untouched.
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, created_at, updated_at)
       VALUES ('plain', 't1', 'helen', 'shared', 'text', 1, 1)`
    ).run()

    const r = await runScheduledReveals(env, '2026-06-08')
    expect(r.revealed).toBe(2) // past + today

    const rows = await env.DB.prepare('SELECT id, revealed_at, updated_at FROM memories').all()
    const by = Object.fromEntries(rows.results.map((x) => [x.id, x]))
    expect(by.past.revealed_at).toBeTruthy()
    expect(by.today.revealed_at).toBeTruthy()
    expect(by.future.revealed_at).toBeNull()
    expect(by.arrival.revealed_at).toBeNull()
    expect(by.plain.revealed_at).toBeNull()
    expect(by.already.updated_at).toBe(1) // unchanged — was already revealed
    expect(by.past.updated_at).not.toBe(1) // bumped for incremental sync
  })

  it('is a no-op when nothing is due', async () => {
    await insertDateSurprise('future', '2026-12-01')
    const r = await runScheduledReveals(env, '2026-06-08')
    expect(r.revealed).toBe(0)
  })
})
