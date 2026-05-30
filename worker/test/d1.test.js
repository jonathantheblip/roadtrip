// Unit 1 — proves the miniflare D1 binding is real and seedable.
//
// This is the foundation Units 4 (worker-layer persistence) and 6 (the
// confirm→D1 integration leg) build on: applySchema(env.DB) stands up
// the full schema against a real (local, emulated) D1 binding, and rows
// round-trip through it. Direct binding access (`env` from
// 'cloudflare:test') — the unit style, distinct from smoke.test.js's
// SELF integration style.
import { env } from 'cloudflare:test'
import { beforeAll, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'

describe('D1 binding + schema seeding (miniflare)', () => {
  beforeAll(async () => {
    await applySchema(env.DB)
  })

  it('seeds the four family_profiles from migration 006', async () => {
    const { results } = await env.DB.prepare(
      'SELECT user_id FROM family_profiles ORDER BY user_id'
    ).all()
    expect(results.map((r) => r.user_id)).toEqual([
      'aurelia',
      'helen',
      'jonathan',
      'rafa',
    ])
  })

  it('round-trips a row through trips (baseline schema.sql)', async () => {
    await env.DB.prepare(
      'INSERT INTO trips (id, title, data_json, updated_at) VALUES (?, ?, ?, ?)'
    )
      .bind('trip-smoke', 'Test Trip', '{"x":1}', 123)
      .run()
    const row = await env.DB.prepare('SELECT title FROM trips WHERE id = ?')
      .bind('trip-smoke')
      .first()
    expect(row?.title).toBe('Test Trip')
  })

  it('round-trips conversations + conversation_messages (migration 006)', async () => {
    await env.DB.prepare(
      'INSERT INTO conversations (id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)'
    )
      .bind('conv-smoke', 'helen', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
      .run()
    await env.DB.prepare(
      `INSERT INTO conversation_messages (id, conversation_id, role, content, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind('msg-smoke', 'conv-smoke', 'user', 'hello', '2026-01-01T00:00:00Z')
      .run()
    const row = await env.DB.prepare(
      'SELECT content FROM conversation_messages WHERE conversation_id = ?'
    )
      .bind('conv-smoke')
      .first()
    expect(row?.content).toBe('hello')
  })
})
