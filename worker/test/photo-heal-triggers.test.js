// D2b — the EVENT triggers wired end-to-end through the real HTTP save paths:
// postTrip fires the agenda trigger (quiesced), postMemory fires the
// photo-evidence trigger (evidenceFresh scoped to the saved memory). Proves the
// wiring + waitUntil; the decision logic itself is covered by the pure-engine +
// runner tests. Runs with PHOTO_HEAL_MODE=shadow so a would-move lands in the
// ledger without touching any memory.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'
import { scheduleAgendaHeal } from '../src/photoHealRunner.js'

const TOK = 'tok-jonathan'
const NOW = 1_700_000_000_000

// env with the knob on (shadow) + the quiesce window zeroed so tests don't wait.
function healEnv(mode = 'shadow') {
  return { ...env, DB: env.DB, FAMILY_TOKEN_JONATHAN: TOK, PHOTO_HEAL_MODE: mode, PHOTO_HEAL_QUIESCE_MS: '0' }
}

async function call(path, { method = 'GET', body, mode = 'shadow' } = {}) {
  const headers = { Origin: 'http://localhost:5173', Authorization: `Bearer ${TOK}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const req = new Request('https://worker.test' + path, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, healEnv(mode), ctx)
  await waitOnExecutionContext(ctx) // drains ctx.waitUntil — the heal trigger
  return res
}

const TRIP = {
  id: 't1', shape: 'route',
  days: [{ n: 1, isoDate: '2026-07-01', stops: [
    { id: 's-a', title: 'The museum', time: '10:00 AM', lat: 30.0, lng: -90.0 },
    { id: 's-b', title: 'The pier', time: '2:00 PM', lat: 31.0, lng: -91.0 },
  ] }],
}

async function seedTrip(stamp = 100) {
  await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?, ?, ?)')
    .bind('t1', JSON.stringify(TRIP), stamp).run()
}
// A memory filed at s-a whose photo GPS is at s-b (auto prov) → the matcher wants s-b.
async function seedMisfiledMemory() {
  const photos = JSON.stringify([{ key: 'm1/p0', lat: 31.0, lng: -91.0, capturedAt: '2026-07-01T15:00:00.000Z' }])
  await env.DB.prepare(
    `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, kind, photo_r2_keys_json, stop_prov_json, created_at, updated_at)
     VALUES ('m1', 't1', 's-a', 'jonathan', 'shared', 'photo', ?, ?, 10, 50)`
  ).bind(photos, JSON.stringify({ source: 'auto', by: 'matcher', tripRev: 50 })).run()
}
const ledger = () =>
  env.DB.prepare('SELECT * FROM memory_stop_moves WHERE memory_id = ? ORDER BY id ASC').bind('m1').all()
const stopOf = () =>
  env.DB.prepare('SELECT stop_id FROM memories WHERE id = ?').bind('m1').first()

beforeEach(async () => {
  await applySchema(env.DB)
  await seedSession(env.DB, TOK, 'jonathan')
  await env.DB.prepare('DELETE FROM memories').run()
  await env.DB.prepare('DELETE FROM memory_stop_moves').run()
  await env.DB.prepare('DELETE FROM trips').run()
})

describe('scheduleAgendaHeal (the quiesced agenda trigger)', () => {
  it('heals for a settled stamp (quiesce 0) → writes the would-move ledger', async () => {
    await seedTrip(200)
    await seedMisfiledMemory()
    const r = await scheduleAgendaHeal(healEnv(), 't1', { now: NOW, quiesceMs: 0 })
    expect(r.mode).toBe('shadow')
    expect((await ledger()).results.length).toBe(1)
  })

  it('off → skipped, no work', async () => {
    await seedTrip(200)
    await seedMisfiledMemory()
    const r = await scheduleAgendaHeal({ ...env, PHOTO_HEAL_MODE: 'off' }, 't1', { now: NOW, quiesceMs: 0 })
    expect(r.skipped).toBe('off')
    expect((await ledger()).results.length).toBe(0)
  })

  it('SUPERSEDED: a newer edit lands during the quiesce window → skip (only the last edit heals)', async () => {
    await seedTrip(100)
    await seedMisfiledMemory()
    const p = scheduleAgendaHeal(healEnv(), 't1', { now: NOW, quiesceMs: 120 })
    await new Promise((r) => setTimeout(r, 30))
    await env.DB.prepare('UPDATE trips SET updated_at = 300 WHERE id = ?').bind('t1').run() // a newer edit
    const r = await p
    expect(r.skipped).toBe('superseded')
    expect((await ledger()).results.length).toBe(0)
  })
})

describe('postMemory — the photo-evidence trigger fires via waitUntil', () => {
  // A mis-filed photo import: the client files it to s-a (auto) but the photo's
  // GPS is at s-b. (The insert itself logs a null→s-a provenance row; the
  // evidence trigger then logs the s-a→s-b would-move.)
  const importBody = {
    id: 'm1', tripId: 't1', stopId: 's-a', kind: 'photo', visibility: 'shared',
    photoRefs: [{ storage: 'r2', key: 'm1/p0', lat: 31.0, lng: -91.0, capturedAt: '2026-07-01T15:00:00.000Z' }],
    stopProv: { source: 'auto', by: 'matcher', tripRev: 50 },
  }
  const wouldMove = (rows) => rows.find((r) => r.from_stop === 's-a' && r.to_stop === 's-b')

  it('a mis-filed photo import re-checks its filing and logs the would-move (shadow)', async () => {
    await seedTrip(100)
    const res = await call('/memories', { method: 'POST', body: importBody })
    expect(res.status).toBe(200)
    const rows = (await ledger()).results
    const wm = wouldMove(rows)
    expect(wm).toBeTruthy() // the evidence trigger logged s-a→s-b
    expect(wm.source).toBe('auto')
    expect((await stopOf()).stop_id).toBe('s-a') // shadow — the memory is untouched
  })

  it('off knob → the trigger is inert (only the insert row, no would-move)', async () => {
    await seedTrip(100)
    const res = await call('/memories', { method: 'POST', mode: 'off', body: importBody })
    expect(res.status).toBe(200)
    const rows = (await ledger()).results
    expect(wouldMove(rows)).toBeFalsy() // no s-a→s-b — the trigger never ran
  })
})

describe('postTrip — the agenda trigger fires via waitUntil', () => {
  it('a trip re-save bumps the stamp and heals its memories (shadow)', async () => {
    await seedTrip(100)
    await seedMisfiledMemory()
    // Re-save the trip on a fresh OCC base → bumps the stamp → agenda trigger.
    const res = await call('/trips', { method: 'POST', body: { ...TRIP, baseUpdatedAt: 100 } })
    expect(res.status).toBe(200)
    expect((await ledger()).results.length).toBe(1) // agenda trigger logged the would-move
    expect((await stopOf()).stop_id).toBe('s-a') // shadow — untouched
  })
})
