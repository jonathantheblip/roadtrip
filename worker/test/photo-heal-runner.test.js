// D2a — the worker-side heal orchestration against REAL D1 (SPEC §5 D). Seeds a
// trip + memories and drives runHealForTrip / healSweep through off/shadow/on,
// the dedup, and the manual/surprise skips. This is the layer the pure engine's
// unit tests can't reach (they mock no DB) — here the ledger writes, the guarded
// apply, and the knob are exercised end to end.

import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import {
  runHealForTrip,
  healSweep,
  photoHealMode,
  rowToHealMemory,
} from '../src/photoHealRunner.js'

const NOW = 1_700_000_000_000

// A route trip with two well-separated located stops (big margins).
function tripJson(over = {}) {
  return JSON.stringify({
    id: 't1',
    shape: 'route',
    days: [
      {
        n: 1,
        isoDate: '2026-07-01',
        stops: [
          { id: 's-a', title: 'The museum', time: '10:00 AM', lat: 30.0, lng: -90.0 },
          { id: 's-b', title: 'The pier', time: '2:00 PM', lat: 31.0, lng: -91.0 },
        ],
      },
    ],
    ...over,
  })
}

async function seedTrip(id = 't1', dataJson = tripJson(), stamp = 200) {
  await env.DB.prepare(
    'INSERT INTO trips (id, data_json, updated_at) VALUES (?, ?, ?)'
  ).bind(id, dataJson, stamp).run()
}

// Seed one memory filed at `stopId`, with a single GPS photo at (lat,lng).
async function seedMemory({ id = 'm1', tripId = 't1', stopId = 's-a', lat = 31.0, lng = -91.0, prov = { source: 'auto', by: 'matcher', tripRev: 100 }, updatedAt = 50 }) {
  const photos = JSON.stringify([{ key: `${id}/p0`, lat, lng, capturedAt: '2026-07-01T15:00:00.000Z' }])
  await env.DB.prepare(
    `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, photo_r2_keys_json, stop_prov_json, created_at, updated_at)
     VALUES (?, ?, ?, 'jonathan', 'shared', ?, ?, ?, ?)`
  ).bind(id, tripId, stopId, photos, prov ? JSON.stringify(prov) : null, 10, updatedAt).run()
}

const memRow = (id = 'm1') =>
  env.DB.prepare('SELECT stop_id, stop_prov_json FROM memories WHERE id = ?').bind(id).first()
const ledger = (id = 'm1') =>
  env.DB.prepare('SELECT * FROM memory_stop_moves WHERE memory_id = ? ORDER BY id ASC').bind(id).all()

beforeEach(async () => {
  await applySchema(env.DB)
  await env.DB.prepare('DELETE FROM memories').run()
  await env.DB.prepare('DELETE FROM memory_stop_moves').run()
  await env.DB.prepare('DELETE FROM trips').run()
})

describe('photoHealMode knob', () => {
  it('defaults off; only off/shadow/on are valid', () => {
    expect(photoHealMode({})).toBe('off')
    expect(photoHealMode({ PHOTO_HEAL_MODE: '' })).toBe('off')
    expect(photoHealMode({ PHOTO_HEAL_MODE: 'nonsense' })).toBe('off')
    expect(photoHealMode({ PHOTO_HEAL_MODE: ' shadow ' })).toBe('shadow')
    expect(photoHealMode({ PHOTO_HEAL_MODE: 'on' })).toBe('on')
  })
})

describe('rowToHealMemory shaping', () => {
  it('extracts GPS photos + parses prov, drops notes/voice', async () => {
    const r = {
      id: 'm', stop_id: 's-a', updated_at: 5,
      photo_r2_keys_json: JSON.stringify([
        { key: 'k1', lat: 1, lng: 2, capturedAt: '2026-07-01T00:00:00Z' },
        { kind: 'note', text: 'hi' },
        { kind: 'voice', key: 'v1' },
        { key: 'k2' }, // no GPS
      ]),
      stop_prov_json: JSON.stringify({ source: 'manual', by: 'helen' }),
      hide_from_json: JSON.stringify(['rafa']),
      revealed_at: null,
    }
    const m = rowToHealMemory(r)
    expect(m.photos.map((p) => p.id)).toEqual(['k1', 'k2']) // note + voice dropped
    expect(m.photos[0].lat).toBe(1)
    expect(m.stopProv.source).toBe('manual')
    expect(m.hideFrom).toEqual(['rafa'])
    expect(m.storedUpdatedAt).toBe(5)
  })
})

describe('runHealForTrip — off / shadow / on', () => {
  it('off: does nothing', async () => {
    await seedTrip()
    await seedMemory({}) // filed s-a, photo at s-b → would move
    const r = await runHealForTrip(env, 't1', { mode: 'off', now: NOW })
    expect(r.skipped).toBe('off')
    expect((await memRow()).stop_id).toBe('s-a')
    expect((await ledger()).results.length).toBe(0)
  })

  it('shadow: writes the would-move ledger, leaves the memory UNTOUCHED', async () => {
    await seedTrip()
    await seedMemory({}) // filed s-a (auto, tripRev 100), photo at s-b, trip stamp 200 → fresher
    const r = await runHealForTrip(env, 't1', { mode: 'shadow', now: NOW })
    expect(r.mode).toBe('shadow')
    expect(r.moves).toBe(1)
    expect(r.ledgerWritten).toBe(1)
    // The memory's filing is UNCHANGED — shadow applies nothing.
    expect((await memRow()).stop_id).toBe('s-a')
    const rows = (await ledger()).results
    expect(rows.length).toBe(1)
    expect(rows[0].from_stop).toBe('s-a')
    expect(rows[0].to_stop).toBe('s-b')
    expect(rows[0].source).toBe('auto')
    expect(rows[0].to_label).toBe('The pier')
    expect(rows[0].from_label).toBe('The museum')
  })

  it('shadow dedup: running twice writes ONE ledger row (same would-move)', async () => {
    await seedTrip()
    await seedMemory({})
    await runHealForTrip(env, 't1', { mode: 'shadow', now: NOW })
    await runHealForTrip(env, 't1', { mode: 'shadow', now: NOW + 1000 })
    expect((await ledger()).results.length).toBe(1)
  })

  it('on: APPLIES the move (stop_id changes) + writes the ledger', async () => {
    await seedTrip()
    await seedMemory({})
    const r = await runHealForTrip(env, 't1', { mode: 'on', now: NOW })
    expect(r.mode).toBe('on')
    expect(r.applied).toBe(1)
    const row = await memRow()
    expect(row.stop_id).toBe('s-b')
    const prov = JSON.parse(row.stop_prov_json)
    expect(prov.source).toBe('auto')
    expect(prov.by).toBe('matcher')
    expect(prov.targetLabel).toBe('The pier')
    expect((await ledger()).results.length).toBe(1)
  })

  it('on: updated_at is MONOTONIC — never regresses even when the stored stamp is AHEAD of now', async () => {
    await seedTrip('t1', tripJson(), 200)
    await seedMemory({ updatedAt: NOW + 500 }) // stored stamp ahead of the run now (skew / ratchet)
    const r = await runHealForTrip(env, 't1', { mode: 'on', now: NOW })
    expect(r.applied).toBe(1)
    const after = await env.DB.prepare('SELECT stop_id, updated_at FROM memories WHERE id = ?').bind('m1').first()
    expect(after.stop_id).toBe('s-b')
    expect(after.updated_at).toBeGreaterThan(NOW + 500) // strictly increased, NOT regressed to now
  })
})

describe('the direction-flip cooldown is ON-only', () => {
  const seedRecentMove = (source) =>
    env.DB.prepare(
      `INSERT INTO memory_stop_moves (memory_id, from_stop, to_stop, source, reason, trip_rev, by, at)
       VALUES ('m1', 's-x', 's-y', ?, 'agenda-change', 150, 'matcher', ?)`
    ).bind(source, NOW - 60_000).run() // 1 min ago, well within the 10-min window

  it('shadow ignores the cooldown — a distinct would-move is still logged after a recent move', async () => {
    await seedTrip('t1', tripJson(), 200)
    await seedMemory({})
    await seedRecentMove('manual') // a DIFFERENT (s-x,s-y) move so dedup can't skip; only cooldown could
    const r = await runHealForTrip(env, 't1', { mode: 'shadow', now: NOW })
    expect(r.moves).toBe(1) // NOT throttled in shadow — the review window must reveal it
    expect((await ledger()).results.length).toBe(2) // the seeded row + the new would-move
  })

  it('on respects the cooldown — a recent move blocks a re-move (anti-oscillation)', async () => {
    await seedTrip('t1', tripJson(), 200)
    await seedMemory({})
    await seedRecentMove('auto')
    const r = await runHealForTrip(env, 't1', { mode: 'on', now: NOW })
    expect(r.moves).toBe(0) // cooldown → no would-move → nothing applied
    expect((await memRow()).stop_id).toBe('s-a') // unchanged
    expect((await ledger()).results.length).toBe(1) // only the seeded row; no new move logged
  })
})

describe('the settled skips (prime directive)', () => {
  it('manual lock: a hand-filed memory is never moved or logged', async () => {
    await seedTrip()
    await seedMemory({ prov: { source: 'manual', by: 'helen' } }) // filed s-a, photo at s-b
    const r = await runHealForTrip(env, 't1', { mode: 'shadow', now: NOW })
    expect(r.moves ?? 0).toBe(0)
    expect((await ledger()).results.length).toBe(0)
    expect((await memRow()).stop_id).toBe('s-a')
  })

  it('surprise target: a photo whose GPS points at an unrevealed surprise stop is not moved', async () => {
    // s-b is an unrevealed surprise; the memory (photo at s-b) must not surface.
    const surpriseTrip = tripJson({
      days: [
        {
          n: 1, isoDate: '2026-07-01',
          stops: [
            { id: 's-a', title: 'The museum', time: '10:00 AM', lat: 30.0, lng: -90.0 },
            { id: 's-b', title: 'The pier', time: '2:00 PM', lat: 31.0, lng: -91.0, surprise: { hideFrom: ['rafa'] } },
          ],
        },
      ],
    })
    await seedTrip('t1', surpriseTrip, 200)
    await seedMemory({})
    const r = await runHealForTrip(env, 't1', { mode: 'shadow', now: NOW })
    expect(r.moves ?? 0).toBe(0)
    expect((await ledger()).results.length).toBe(0)
  })

  it('no fresher agenda: an auto memory at an equal trip stamp does NOT move (gate 5)', async () => {
    await seedTrip('t1', tripJson(), 100) // trip stamp 100
    await seedMemory({ prov: { source: 'auto', by: 'matcher', tripRev: 100 } }) // memRev 100 == stamp
    const r = await runHealForTrip(env, 't1', { mode: 'shadow', now: NOW })
    expect(r.moves ?? 0).toBe(0) // stale-agenda → suggestion, not a would-move
    expect((await ledger()).results.length).toBe(0)
  })
})

describe('healSweep (the daily backstop)', () => {
  it('off env → skipped', async () => {
    await seedTrip()
    await seedMemory({})
    const r = await healSweep({ ...env, PHOTO_HEAL_MODE: undefined }, { now: NOW })
    expect(r.skipped).toBe('off')
  })

  it('shadow env → heals every active trip, writes the ledger', async () => {
    await seedTrip('t1', tripJson(), 200)
    await seedMemory({ id: 'm1', tripId: 't1' })
    const r = await healSweep({ ...env, PHOTO_HEAL_MODE: 'shadow' }, { now: NOW })
    expect(r.mode).toBe('shadow')
    expect(r.trips).toBe(1)
    expect(r.tripsWithMoves).toBe(1)
    expect((await ledger('m1')).results.length).toBe(1)
    // Memory still untouched (shadow).
    expect((await memRow('m1')).stop_id).toBe('s-a')
  })
})

// ── Build 2 (§14) — shadow REALLY means shadow for the offset-inference
// engine ──────────────────────────────────────────────────────────────────
// THE EXACT BUG: healSweep called backfillOffsetInference(env) unconditionally
// (default dryRun=false), so a corroborated candidate landed a REAL write to
// photo_r2_keys_json the moment PHOTO_HEAL_MODE was anything but 'off' —
// including 'shadow', directly contradicting this file's own header comment,
// worker/src/index.js's comment on the same knob, and
// BUILD_PLAN_SIGNAL_FLEET.md's explicit "shadow: nothing family-visible
// moves." This is the live-armed reproduction: the SAME corroborated
// candidate run through healSweep under 'shadow' must leave the ref
// byte-identical; under 'on' it must actually write. Both cases live here so
// the contrast is explicit — the real sun-math (Provincetown, 2026-07-04) is
// the same corpus offset-inference.test.js uses.
describe('healSweep — the offset-inference engine obeys shadow (Build 2 regression)', () => {
  const OI_TZ = 'America/New_York'
  const OI_PTOWN = { lat: 42.0621405, lng: -70.1633884 }
  const OI_DAY = '2026-07-04T16:00:00.000Z' // real midday EDT at Provincetown

  async function seedOffsetTrip(id, stamp = 300) {
    const trip = { id, tz: OI_TZ, lodging: { lat: OI_PTOWN.lat, lng: OI_PTOWN.lng, name: 'Stay' }, days: [] }
    await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?,?,?)')
      .bind(id, JSON.stringify(trip), stamp)
      .run()
  }
  // A corroborated candidate: an outdoor-labeled photo at a real local
  // daylight instant, no offsetMinutes yet — exactly what CORROBORATED-tags
  // in offset-inference.test.js.
  function offsetCandidateRefsJson() {
    return JSON.stringify([{ key: 'k1', capturedAt: OI_DAY, vision: { setting: 'outdoor' } }])
  }
  async function seedOffsetMemory(id, tripId, stamp = 60) {
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, photo_r2_keys_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(id, tripId, 'jonathan', 'shared', 'photo', offsetCandidateRefsJson(), 1, stamp).run()
  }
  async function rawRefsJson(id) {
    const r = await env.DB.prepare('SELECT photo_r2_keys_json FROM memories WHERE id=?').bind(id).first()
    return r.photo_r2_keys_json
  }

  it('mode="shadow": the SAME corroborated candidate leaves photo_r2_keys_json BYTE-IDENTICAL, stats report the would-be tier breakdown', async () => {
    await seedOffsetTrip('t-oi-shadow')
    await seedOffsetMemory('m-oi-shadow', 't-oi-shadow')
    const before = await rawRefsJson('m-oi-shadow')
    // Scene backfill is a SEPARATE, unrelated best-effort pass that also
    // touches photo_r2_keys_json (marking sceneFail on a ref with no real R2
    // asset) — disable it here so the byte-identical assertion below isolates
    // the offset-inference engine specifically, not scene's own unrelated write.
    const r = await healSweep({ ...env, PHOTO_HEAL_MODE: 'shadow', PHOTO_SCENE_BACKFILL_LIMIT: 0 }, { now: NOW })
    expect(r.mode).toBe('shadow')
    // Reported would-be tier breakdown — the review deliverable for shadow.
    expect(r.offsetInference.corroborated).toBe(1)
    expect(r.offsetInference.wrote).toBe(1)
    expect(r.offsetInference.memsWritten).toBe(0)
    const after = await rawRefsJson('m-oi-shadow')
    expect(after).toBe(before) // byte-identical — a true DB no-op
    const refs = JSON.parse(after)
    expect(refs[0].offsetMinutes).toBeUndefined()
    expect(refs[0].prov).toBeUndefined()
  })

  it('mode="on": the IDENTICAL candidate IS updated with offsetMinutes + prov.off="inferred-place"', async () => {
    await seedOffsetTrip('t-oi-on')
    await seedOffsetMemory('m-oi-on', 't-oi-on')
    const r = await healSweep({ ...env, PHOTO_HEAL_MODE: 'on', PHOTO_SCENE_BACKFILL_LIMIT: 0 }, { now: NOW })
    expect(r.mode).toBe('on')
    expect(r.offsetInference.corroborated).toBe(1)
    expect(r.offsetInference.memsWritten).toBe(1)
    const refs = JSON.parse(await rawRefsJson('m-oi-on'))
    expect(refs[0].offsetMinutes).toBe(-240)
    expect(refs[0].prov).toEqual({ off: 'inferred-place' })
  })
})
