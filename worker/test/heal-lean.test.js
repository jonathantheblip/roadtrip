// A1 (BUILD_SPECS_GLANCE_ENGINE.md) — the ask-time LEAN snapshot into
// memory_heal_feedback.lean_json, captured SERVER-AUTHORITATIVELY from the decisions
// ledger at answer time (the ledger is DELETE+re-INSERT per sweep, so the belief must
// be snapshotted before the next sweep overwrites it). This is the durable input O7's
// Learning Spine will credit witnesses from. Capture is best-effort — it must never
// block or fail the human's answer.
import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import { writeHealFeedback, listHealFeedbackForTrip } from '../src/confirmFeedback.js'

const AT = 1_700_000_000_000

async function seedDecisionWithHm(tripId, memoryIds, hm, place = { id: 's-cove', name: 'Herring Cove' }) {
  await env.DB.prepare(
    `INSERT INTO memory_heal_decisions
       (trip_id, iso_date, memory_ids, photo_count, place_id, place_name, tier, confidence, evidence, signals_json, reason, mode, run_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(tripId, '2026-07-04', JSON.stringify(memoryIds), 2, place.id, place.name, 'confirm', 0.7, null, JSON.stringify({ hm }), null, 'shadow', AT).run()
}

beforeEach(async () => {
  await applySchema(env.DB)
  await env.DB.prepare('DELETE FROM memory_heal_feedback').run()
  await env.DB.prepare('DELETE FROM memory_heal_decisions').run()
})

describe('A1 — server-authoritative lean capture into memory_heal_feedback.lean_json', () => {
  it('no shadow decision → lean_json is NULL (engine v1, nothing worth snapshotting)', async () => {
    const r = await writeHealFeedback(
      env, 'trip-a', 'jonathan',
      { action: 'confirmed', memoryIds: ['m1'], kind: 'A', guessedPlaceId: 's-cove', isoDate: '2026-07-04' },
      { now: AT }
    )
    expect(r.ok).toBe(true)
    expect((await listHealFeedbackForTrip(env, 'trip-a'))[0].lean).toBe(null)
  })

  it('a matching shadow decision → lean captured server-side (engine, hm read, class, guess)', async () => {
    await seedDecisionWithHm('trip-a', ['m1'], { top: 's-cove', dest: 'ask', m: 0.9, conflict: 0.8, ignorance: 0, n: 2 })
    const r = await writeHealFeedback(
      env, 'trip-a', 'jonathan',
      { action: 'confirmed', memoryIds: ['m1'], kind: 'A', guessedPlaceId: 's-cove', isoDate: '2026-07-04' },
      { now: AT }
    )
    expect(r.ok).toBe(true)
    const lean = (await listHealFeedbackForTrip(env, 'trip-a'))[0].lean
    expect(lean).toBeTruthy()
    expect(lean.engine).toBe('hm')
    expect(lean.classId).toBe('A')
    expect(lean.action).toBe('confirmed')
    expect(lean.guessed.id).toBe('s-cove')
    expect(lean.hm).toMatchObject({ top: 's-cove', n: 2 })
  })

  it('matches the decision by memory_ids OVERLAP (moment identity can drift a photo)', async () => {
    await seedDecisionWithHm('trip-a', ['m1', 'm2'], { top: 's-cove', dest: 'heal', m: 0.8, conflict: 0.3, ignorance: 0, n: 3 })
    const r = await writeHealFeedback(
      env, 'trip-a', 'jonathan',
      { action: 'confirmed', memoryIds: ['m2', 'm9'], kind: 'A', isoDate: '2026-07-04' }, // overlaps on m2
      { now: AT }
    )
    expect(r.ok).toBe(true)
    const lean = (await listHealFeedbackForTrip(env, 'trip-a'))[0].lean
    expect(lean.engine).toBe('hm')
    expect(lean.hm.top).toBe('s-cove')
  })

  it('picks the MOST-overlapping decision when several match', async () => {
    await seedDecisionWithHm('trip-a', ['m1'], { top: 's-cove', dest: 'ask', n: 1 }, { id: 's-cove', name: 'Cove' })
    await seedDecisionWithHm('trip-a', ['m1', 'm2', 'm3'], { top: 's-race', dest: 'heal', n: 3 }, { id: 's-race', name: 'Race' })
    const r = await writeHealFeedback(
      env, 'trip-a', 'jonathan',
      { action: 'confirmed', memoryIds: ['m1', 'm2', 'm3'], kind: 'A', isoDate: '2026-07-04' },
      { now: AT }
    )
    expect(r.ok).toBe(true)
    const lean = (await listHealFeedbackForTrip(env, 'trip-a'))[0].lean
    expect(lean.hm.top).toBe('s-race') // 3-overlap beats 1-overlap
    expect(lean.guessed.id).toBe('s-race')
  })

  it('capture never blocks the human answer: no decision → row still writes, lean null', async () => {
    const r = await writeHealFeedback(
      env, 'trip-a', 'jonathan',
      { action: 'aside', memoryIds: ['m1'], isoDate: '2026-07-04' },
      { now: AT }
    )
    expect(r.ok).toBe(true)
    expect((await listHealFeedbackForTrip(env, 'trip-a'))[0].lean).toBe(null)
  })

  it('SCHEMA SKEW (A1 review): a 12-column table missing lean_json degrades to INERT, never 500', async () => {
    // Simulate a D1 that applied an EARLIER 021 (before lean_json existed): the 13-value
    // INSERT hits the REAL SQLite error "table … has no column named lean_json". The
    // write path must treat that as schema-not-ready (inert), NOT re-throw and 500 the
    // family's tap. This exercises the real error string, validating isNoTable's regex.
    await env.DB.prepare('DROP TABLE IF EXISTS memory_heal_feedback').run()
    await env.DB.prepare(
      `CREATE TABLE memory_heal_feedback (
         id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT NOT NULL, iso_date TEXT,
         memory_ids TEXT NOT NULL, action TEXT NOT NULL, kind TEXT,
         guessed_place_id TEXT, guessed_place_name TEXT, corrected_place_id TEXT,
         corrected_place_name TEXT, words TEXT, by_traveler TEXT, at INTEGER NOT NULL
       )`
    ).run()
    const r = await writeHealFeedback(
      env, 'trip-a', 'jonathan',
      { action: 'confirmed', memoryIds: ['m1'], kind: 'A', isoDate: '2026-07-04' },
      { now: AT }
    )
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no-table') // inert degradation, not a thrown 500
  })
})
