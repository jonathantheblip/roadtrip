// postMemory provenance rules (SPEC §4) wired end-to-end through the real save
// path: the stored/effective stop resolution, the manual-beats-auto lock
// (refusal → the client adopts the returned row), the memory_stop_moves ledger,
// and rowToMemory surfacing stopProv. The pure rule matrix is proven in
// stop-provenance-resolver.test.js; this proves the DB wiring.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

const TOK = 'tok-jonathan'
function authEnv() {
  return { ...env, DB: env.DB, FAMILY_TOKEN_JONATHAN: TOK }
}
async function call(path, { method = 'GET', body } = {}) {
  const headers = { Origin: 'http://localhost:5173', Authorization: `Bearer ${TOK}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const req = new Request('https://worker.test' + path, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}
const save = (body) => call('/memories', { method: 'POST', body })
const provOf = (id) =>
  env.DB.prepare('SELECT stop_id, stop_prov_json FROM memories WHERE id = ?').bind(id).first()
const ledger = (id) =>
  env.DB.prepare('SELECT * FROM memory_stop_moves WHERE memory_id = ? ORDER BY id ASC').bind(id).all()

const BASE = { tripId: 't1', kind: 'note', visibility: 'shared' }

describe('postMemory — stop provenance rules + move ledger', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOK, 'jonathan')
    await env.DB.prepare('DELETE FROM memories').run()
    await env.DB.prepare('DELETE FROM memory_stop_moves').run()
  })

  it('Rule 4 — a bare-stopId insert lands NULL provenance and logs nothing (legacy, not manual-locked)', async () => {
    await save({ ...BASE, id: 'm1', stopId: 's1', text: 'hi' })
    const row = await provOf('m1')
    expect(row.stop_id).toBe('s1')
    expect(row.stop_prov_json).toBeNull() // legacy — NOT rule-3 manual
    expect((await ledger('m1')).results.length).toBe(0)
  })

  it('Rule 1 — a same-stop re-save (caption edit) never restamps provenance or logs', async () => {
    // Seed a manual filing first (a hand-move).
    await save({ ...BASE, id: 'm1', stopId: 's1', text: 'hi',
      stopProv: { source: 'manual', by: 'helen', reason: 'hand', targetLabel: 'Race Point' } })
    // Now a caption edit that carries the same stop.
    await save({ ...BASE, id: 'm1', stopId: 's1', text: 'hi', caption: 'edited' })
    const row = await provOf('m1')
    expect(JSON.parse(row.stop_prov_json)).toMatchObject({ source: 'manual', by: 'helen' })
    // Only the first (seeding) move is logged — the re-save added nothing.
    expect((await ledger('m1')).results.length).toBe(1)
  })

  it('a hand-move (manual prov) files + logs the move with snapshotted labels', async () => {
    await save({ ...BASE, id: 'm1', stopId: 's1', text: 'hi' }) // legacy at s1
    const res = await save({ ...BASE, id: 'm1', stopId: 's2', text: 'hi',
      stopProv: { source: 'manual', by: 'helen', reason: 'hand', movedFromLabel: 'The Airbnb', targetLabel: 'Race Point' } })
    expect(res.status).toBe(200)
    const returned = await res.json()
    expect(returned.stopId).toBe('s2')
    expect(returned.stopProv).toMatchObject({ source: 'manual', by: 'helen' }) // rowToMemory surfaces it
    const { results } = await ledger('m1')
    expect(results.length).toBe(1)
    expect(results[0]).toMatchObject({
      from_stop: 's1', to_stop: 's2', from_label: 'The Airbnb', to_label: 'Race Point',
      source: 'manual', reason: 'hand', by: 'helen',
    })
  })

  it('Rule 2 — a manual lock REFUSES an incoming auto move: stop stays, no ledger, returned row carries the stored filing (client adopts)', async () => {
    // Helen hand-places the photo at s1.
    await save({ ...BASE, id: 'm1', stopId: 's1', text: 'hi',
      stopProv: { source: 'manual', by: 'helen', reason: 'hand', targetLabel: 'Race Point' } })
    const before = (await ledger('m1')).results.length // 1 (the hand-move)
    // A stale AUTO push tries to move it to s2.
    const res = await save({ ...BASE, id: 'm1', stopId: 's2', text: 'hi',
      stopProv: { source: 'auto', by: 'matcher', reason: 'plan', targetLabel: 'Grand Central' } })
    expect(res.status).toBe(200)
    const returned = await res.json()
    // The lock held — the returned row still reads the MANUAL filing at s1, so
    // the client adopts it instead of believing the move landed.
    expect(returned.stopId).toBe('s1')
    expect(returned.stopProv).toMatchObject({ source: 'manual', by: 'helen' })
    const row = await provOf('m1')
    expect(row.stop_id).toBe('s1')
    expect((await ledger('m1')).results.length).toBe(before) // nothing new logged
  })

  it('Rule 3 — a differing stop with NO prov stamps manual/by:null (safe lock, never a person) + logs', async () => {
    await save({ ...BASE, id: 'm1', stopId: 's1', text: 'hi' }) // legacy at s1
    await save({ ...BASE, id: 'm1', stopId: 's2', text: 'hi' }) // old-client-style: differs, no prov
    const row = await provOf('m1')
    expect(row.stop_id).toBe('s2')
    expect(JSON.parse(row.stop_prov_json)).toMatchObject({ source: 'manual', by: null, reason: 'unknown' })
    const { results } = await ledger('m1')
    expect(results.length).toBe(1)
    expect(results[0]).toMatchObject({ from_stop: 's1', to_stop: 's2', source: 'manual', by: null })
  })

  it('manual→manual is allowed (a person re-moving their own locked photo), and logs', async () => {
    await save({ ...BASE, id: 'm1', stopId: 's1', text: 'hi',
      stopProv: { source: 'manual', by: 'helen', reason: 'hand', targetLabel: 'A' } })
    const res = await save({ ...BASE, id: 'm1', stopId: 's2', text: 'hi',
      stopProv: { source: 'manual', by: 'jonathan', reason: 'hand', targetLabel: 'B' } })
    expect((await res.json()).stopId).toBe('s2')
    const { results } = await ledger('m1')
    expect(results.length).toBe(2)
    expect(results[1]).toMatchObject({ to_stop: 's2', by: 'jonathan' })
  })

  it('a legacy row (no prov) is byte-identical on read — stopProv omitted entirely', async () => {
    await save({ ...BASE, id: 'm1', stopId: 's1', text: 'hi' })
    const res = await call('/memories')
    const list = await res.json()
    const m = list.find((x) => x.id === 'm1')
    expect(m).toBeTruthy()
    expect(m).not.toHaveProperty('stopProv') // legacy stays clean
  })
})
