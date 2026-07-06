// Migration 017 — memory stop-filing provenance + the append-only move ledger.
//
// This pins the SCHEMA the coming provenance-aware worker rules bind against:
// the memories.stop_prov_json column (NULL-back-compat) and the
// memory_stop_moves ledger. It is deliberately schema-only — the worker's
// postMemory provenance RULES are a separate batch that ships only AFTER this
// migration is applied to prod (the load-bearing apply order, SPEC §4). Until
// then these assertions guarantee the migration itself is valid and wired into
// the test harness.
//
// NON-VACUOUS: against the pre-017 schema every assertion here fails —
// stop_prov_json is an unknown column and memory_stop_moves does not exist.

import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'

describe('migration 017 — stop provenance column + move ledger', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM memories').run()
    await env.DB.prepare('DELETE FROM memory_stop_moves').run()
  })

  it('memories.stop_prov_json exists, defaults NULL for a legacy row, and round-trips JSON', async () => {
    // A legacy-shaped insert that names no provenance column: the column must
    // exist and default NULL (rowToMemory will omit `stopProv` — old rows stay
    // byte-identical).
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, created_at, updated_at)
       VALUES ('m-legacy', 't1', 'jonathan', 'shared', 'note', 1, 1)`
    ).run()
    const legacy = await env.DB.prepare('SELECT stop_prov_json FROM memories WHERE id = ?')
      .bind('m-legacy').first()
    expect(legacy.stop_prov_json).toBeNull()

    // A provenance-aware write round-trips the JSON verbatim.
    const prov = JSON.stringify({ source: 'manual', by: 'helen', reason: 'hand', targetLabel: 'Race Point' })
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, stop_prov_json, created_at, updated_at)
       VALUES ('m-prov', 't1', 'helen', 'shared', 'note', ?, 1, 1)`
    ).bind(prov).run()
    const row = await env.DB.prepare('SELECT stop_prov_json FROM memories WHERE id = ?')
      .bind('m-prov').first()
    expect(JSON.parse(row.stop_prov_json)).toEqual({
      source: 'manual', by: 'helen', reason: 'hand', targetLabel: 'Race Point',
    })
  })

  it('memory_stop_moves is an append-only ledger with monotonic ids, keyed by memory', async () => {
    const ins = (from, to, source, reason, by, at) =>
      env.DB.prepare(
        `INSERT INTO memory_stop_moves
           (memory_id, from_stop, to_stop, from_label, to_label, source, reason, trip_rev, by, at)
         VALUES ('m1', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(from, to, from ? 'From' : null, to ? 'To' : null, source, reason, 100, by, at).run()

    await ins(null, 's1', 'auto', 'import', 'matcher', 10)
    await ins('s1', 's2', 'auto', 'plan', 'matcher', 20)
    await ins('s2', 's3', 'manual', 'hand', 'helen', 30)

    const { results } = await env.DB.prepare(
      'SELECT id, from_stop, to_stop, source, reason, by, at FROM memory_stop_moves WHERE memory_id = ? ORDER BY id ASC'
    ).bind('m1').all()
    expect(results.length).toBe(3)
    // Monotonic, ascending ids — the ledger's order.
    expect(results[0].id).toBeLessThan(results[1].id)
    expect(results[1].id).toBeLessThan(results[2].id)
    // The whole history is retained — the last move never erased the first.
    expect(results.map((r) => r.to_stop)).toEqual(['s1', 's2', 's3'])
    expect(results[0].from_stop).toBeNull() // moved-from-unfiled records NULL, not a string
    expect(results[2].source).toBe('manual')
    expect(results[2].by).toBe('helen')
  })

  it('the ledger outlives a deleted memory (no FK cascade erases its history)', async () => {
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, created_at, updated_at)
       VALUES ('m-del', 't1', 'jonathan', 'shared', 'note', 1, 1)`
    ).run()
    await env.DB.prepare(
      `INSERT INTO memory_stop_moves (memory_id, from_stop, to_stop, source, reason, at)
       VALUES ('m-del', null, 's1', 'auto', 'import', 5)`
    ).run()
    // Hard-delete the memory row entirely (stronger than the soft delete the
    // app uses) — the move history must remain diagnosable.
    await env.DB.prepare('DELETE FROM memories WHERE id = ?').bind('m-del').run()
    const surviving = await env.DB.prepare('SELECT COUNT(*) AS n FROM memory_stop_moves WHERE memory_id = ?')
      .bind('m-del').first()
    expect(surviving.n).toBe(1)
  })
})
