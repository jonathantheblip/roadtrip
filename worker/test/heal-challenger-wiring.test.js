// O2b — the challenger SHADOW read wired into recordHealDecisions against REAL D1.
// Proves: (1) inert by default (no signals_json.hm, hmShadowed 0); (2) opted in, the
// challenger summary rides in signals_json.hm and the INCUMBENT still fills every served
// field byte-for-byte (additive-only); (3) a sibling trip (world-model input) is
// tolerated. The pure adapter/summary logic is unit-tested in heal-challenger.test.js.

import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import { recordHealDecisions, decisionEngineMode } from '../src/photoHealRunner.js'

const NOW = Date.UTC(2026, 6, 10)
const capAt = (h, m = 0) => new Date(Date.UTC(2026, 6, 4, h, m)).toISOString()

// Real stops carry `.name` (the challenger adapter) — the incumbent's fixtures use
// `.title`, so we set BOTH to the same value so each engine emits without ambiguity.
const tripJson = (id) =>
  JSON.stringify({
    id,
    shape: 'stay',
    dateRangeStart: '2026-07-04',
    dateRangeEnd: '2026-07-06',
    days: [
      {
        n: 1,
        isoDate: '2026-07-04',
        stops: [
          { id: 's-cove', name: 'Herring Cove', title: 'Herring Cove', time: '10:00 AM', lat: 42.052, lng: -70.18 },
          { id: 's-race', name: 'Race Point', title: 'Race Point', time: '11:00 AM', lat: 42.05, lng: -70.18 },
        ],
      },
    ],
  })

async function seedTrip(id, stamp = 300) {
  await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?,?,?)').bind(id, tripJson(id), stamp).run()
}
async function seedMemory(id, tripId, stamp = 60) {
  const refs = JSON.stringify([
    { key: `${id}-a`, capturedAt: capAt(10, 0), lat: 42.051, lng: -70.18, prov: { gps: 'exif' }, vision: { placeType: 'beach', signage: 'Herring Cove' } },
    { key: `${id}-b`, capturedAt: capAt(10, 3), lat: 42.051, lng: -70.18, prov: { gps: 'exif' } },
  ])
  await env.DB.prepare(
    `INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, photo_r2_keys_json, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).bind(id, tripId, 'jonathan', 'shared', 'photo', refs, 1, stamp).run()
}
const SERVED_COLS = ['iso_date', 'memory_ids', 'photo_count', 'place_id', 'place_name', 'tier', 'confidence', 'evidence', 'reason']
async function decisionsFor(tripId) {
  const { results } = await env.DB.prepare(
    `SELECT ${SERVED_COLS.join(', ')}, signals_json FROM memory_heal_decisions WHERE trip_id=? ORDER BY iso_date, place_id`
  ).bind(tripId).all()
  return results
}

beforeEach(async () => {
  await applySchema(env.DB)
  await env.DB.prepare('DELETE FROM memory_heal_decisions').run()
  await env.DB.prepare('DELETE FROM memories').run()
  await env.DB.prepare('DELETE FROM trips').run()
})

describe('decisionEngineMode knob', () => {
  it('defaults off; only off/shadow/hm are valid', () => {
    expect(decisionEngineMode({})).toBe('off')
    expect(decisionEngineMode({ PHOTO_DECISION_ENGINE: '' })).toBe('off')
    expect(decisionEngineMode({ PHOTO_DECISION_ENGINE: 'nonsense' })).toBe('off')
    expect(decisionEngineMode({ PHOTO_DECISION_ENGINE: ' shadow ' })).toBe('shadow')
    expect(decisionEngineMode({ PHOTO_DECISION_ENGINE: 'hm' })).toBe('hm')
  })
})

describe('O2 — challenger shadow wiring in recordHealDecisions', () => {
  it('inert by default: no signals_json.hm, hmShadowed 0', async () => {
    await seedTrip('trip-a')
    await seedMemory('m1', 'trip-a')
    const r = await recordHealDecisions({ ...env, PHOTO_HEAL_MODE: 'shadow' }, 'trip-a', { now: NOW })
    expect(r.hmShadowed).toBe(0)
    const decs = await decisionsFor('trip-a')
    expect(decs.length).toBeGreaterThan(0)
    for (const d of decs) expect(JSON.parse(d.signals_json).hm).toBeUndefined()
  })

  it('shadow on: hm rides in signals_json; served fields unchanged (additive-only)', async () => {
    await seedTrip('trip-a')
    await seedMemory('m1', 'trip-a')
    // baseline: incumbent only
    await recordHealDecisions({ ...env, PHOTO_HEAL_MODE: 'shadow' }, 'trip-a', { now: NOW })
    const base = await decisionsFor('trip-a')
    // opted in: challenger shadows
    const r = await recordHealDecisions({ ...env, PHOTO_HEAL_MODE: 'shadow', PHOTO_DECISION_ENGINE: 'shadow' }, 'trip-a', { now: NOW })
    expect(r.hmShadowed).toBeGreaterThan(0)
    const shad = await decisionsFor('trip-a')
    expect(shad.length).toBe(base.length)
    // EVERY served column is byte-identical — the shadow touched none of them
    for (const col of SERVED_COLS) {
      expect(shad.map((d) => d[col])).toEqual(base.map((d) => d[col]))
    }
    // signals_json differs ONLY by the added hm key: stripping hm gives back the base
    for (let i = 0; i < shad.length; i++) {
      const b = JSON.parse(base[i].signals_json)
      const { hm, ...rest } = JSON.parse(shad[i].signals_json)
      expect(rest).toEqual(b) // additive-only: base signals untouched
    }
    // and at least one row carries a well-formed hm summary
    const hm = shad.map((d) => JSON.parse(d.signals_json).hm).find(Boolean)
    expect(hm).toBeTruthy()
    expect(hm).toHaveProperty('n')
    expect(hm).toHaveProperty('dest')
    expect(typeof hm.n).toBe('number')
  })

  it('a sibling trip (world-model input) is tolerated and still shadows', async () => {
    await seedTrip('trip-a')
    await seedMemory('m1', 'trip-a')
    await seedTrip('trip-b') // other trip → name-keyed world model
    const r = await recordHealDecisions({ ...env, PHOTO_HEAL_MODE: 'shadow', PHOTO_DECISION_ENGINE: 'shadow' }, 'trip-a', { now: NOW })
    expect(r.hmShadowed).toBeGreaterThan(0)
  })
})
