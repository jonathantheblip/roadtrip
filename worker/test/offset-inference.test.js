// backfillOffsetInference against REAL test D1 — the worker-side offset
// inference engine (Build 2, FAMILY_TRIPS_VISION §14). Verifies the tiering
// (corroborated writes, conflicting flags-only, no-signal skips), the bounded/
// idempotent/resumable shape, the volleyball-2026 fixture skip, and that it
// NEVER bumps updated_at — all the SAFE-by-construction properties the
// archive-wide write relies on. Corroboration instants are chosen against the
// REAL sun-math for Provincetown on 2026-07-04 (sunrise ≈09:11 UTC, sunset
// ≈00:21 UTC next day), not hand-waved.

import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import { backfillOffsetInference, corroborationTier } from '../src/offsetInference.js'

const PTOWN = { lat: 42.0621405, lng: -70.1633884 }
const TZ = 'America/New_York'
const DAY = '2026-07-04T16:00:00.000Z' // real midday EDT at Provincetown
const NIGHT = '2026-07-04T06:00:00.000Z' // real 2am EDT — before sunrise-1h

async function seedTrip(id, { tz, coords = PTOWN, updated_at = 100 } = {}) {
  const trip = { id, ...(tz ? { tz } : {}), lodging: { lat: coords.lat, lng: coords.lng, name: 'Stay' } }
  await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?,?,?)').bind(id, JSON.stringify(trip), updated_at).run()
}
async function seedMemory(id, tripId, refs, updated_at = 50) {
  await env.DB.prepare(
    `INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, photo_r2_keys_json, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`
  )
    .bind(id, tripId, 'jonathan', 'shared', 'photo', JSON.stringify(refs), 1, updated_at)
    .run()
}
async function memRow(id) {
  const r = await env.DB.prepare('SELECT photo_r2_keys_json, updated_at FROM memories WHERE id=?').bind(id).first()
  return { refs: JSON.parse(r.photo_r2_keys_json), updated_at: r.updated_at }
}

beforeEach(async () => {
  await applySchema(env.DB)
  for (const t of ['memories', 'trips']) await env.DB.prepare(`DELETE FROM ${t}`).run()
})

describe('backfillOffsetInference', () => {
  it('mode:"on" + CORROBORATED: an outdoor photo at real local midday gets offsetMinutes written + prov.off=inferred-place', async () => {
    await seedTrip('t1', { tz: TZ })
    await seedMemory('m1', 't1', [{ key: 'k1', capturedAt: DAY, vision: { setting: 'outdoor' } }])
    const s = await backfillOffsetInference(env, { mode: 'on' })
    expect(s.corroborated).toBe(1)
    expect(s.wrote).toBe(1)
    expect(s.memsWritten).toBe(1)
    const { refs } = await memRow('m1')
    expect(refs[0].offsetMinutes).toBe(-240)
    expect(refs[0].prov).toEqual({ off: 'inferred-place' })
  })

  it('mode:"on" + CONFLICTING: an outdoor label at real local 2am is flagged with detail, never written (conflicting NEVER writes, any mode)', async () => {
    await seedTrip('t1', { tz: TZ })
    await seedMemory('m1', 't1', [{ key: 'k1', capturedAt: NIGHT, vision: { setting: 'outdoor' } }])
    const s = await backfillOffsetInference(env, { mode: 'on' })
    expect(s.conflicting).toBe(1)
    expect(s.wrote).toBe(0)
    expect(s.conflicts).toHaveLength(1)
    expect(s.conflicts[0]).toMatchObject({ tripId: 't1', memoryId: 'm1', refKey: 'k1', proposedOffsetMinutes: -240, capturedAt: NIGHT })
    const { refs } = await memRow('m1')
    expect(refs[0].offsetMinutes).toBeUndefined()
  })

  it('mode:"on" + NO SIGNAL: indoor, or no vision at all, is counted but never written (no-signal NEVER writes, any mode)', async () => {
    await seedTrip('t1', { tz: TZ })
    await seedMemory('m1', 't1', [
      { key: 'k1', capturedAt: DAY, vision: { setting: 'indoor' } },
      { key: 'k2', capturedAt: DAY }, // no vision at all
    ])
    const s = await backfillOffsetInference(env, { mode: 'on' })
    expect(s.noSignal).toBe(2)
    expect(s.wrote).toBe(0)
    const { refs } = await memRow('m1')
    expect(refs[0].offsetMinutes).toBeUndefined()
    expect(refs[1].offsetMinutes).toBeUndefined()
  })

  it('skips a ref that already has offsetMinutes (idempotent target selection)', async () => {
    await seedTrip('t1', { tz: TZ })
    await seedMemory('m1', 't1', [{ key: 'k1', capturedAt: DAY, offsetMinutes: -240, vision: { setting: 'outdoor' } }])
    const s = await backfillOffsetInference(env, { mode: 'on' })
    expect(s.refsScanned).toBe(0)
  })

  it('skips a trip with no trip.tz resolved yet (honest abstention)', async () => {
    await seedTrip('t1', {}) // no tz
    await seedMemory('m1', 't1', [{ key: 'k1', capturedAt: DAY, vision: { setting: 'outdoor' } }])
    const s = await backfillOffsetInference(env, { mode: 'on' })
    expect(s.tripsNoTz).toBe(1)
    expect(s.refsScanned).toBe(0)
  })

  it('never bumps updated_at (a computed enrichment, not a family edit)', async () => {
    await seedTrip('t1', { tz: TZ })
    await seedMemory('m1', 't1', [{ key: 'k1', capturedAt: DAY, vision: { setting: 'outdoor' } }], 555)
    await backfillOffsetInference(env, { mode: 'on' })
    expect((await memRow('m1')).updated_at).toBe(555)
  })

  it('skips volleyball-2026 entirely (confirmed fixture data — never derive or write anything for it)', async () => {
    await seedTrip('volleyball-2026', { tz: TZ })
    await seedMemory('m1', 'volleyball-2026', [{ key: 'k1', capturedAt: DAY, vision: { setting: 'outdoor' } }])
    const s = await backfillOffsetInference(env, { mode: 'on' })
    expect(s.tripsConsidered).toBe(0)
    const { refs } = await memRow('m1')
    expect(refs[0].offsetMinutes).toBeUndefined()
  })

  it('respects the limit and reports hitLimit (bounded, resumable)', async () => {
    await seedTrip('t1', { tz: TZ })
    const refs = Array.from({ length: 3 }, (_, i) => ({ key: `k${i}`, capturedAt: DAY, vision: { setting: 'outdoor' } }))
    await seedMemory('m1', 't1', refs)
    const s = await backfillOffsetInference(env, { mode: 'on', limit: 2 })
    expect(s.corroborated).toBe(2)
    expect(s.hitLimit).toBe(true)
    const { refs: after } = await memRow('m1')
    expect(after.filter((r) => Number.isFinite(r.offsetMinutes)).length).toBe(2)
  })

  // THE SHADOW CONTRACT (Build 2 fix — this is the exact bug the reviewer
  // reproduced live: a corroborated candidate landed a REAL write under
  // 'shadow'). offsetMinutes is family-visible (photoMatch.js's day binning +
  // sessionHeal.js's time reasoning), so shadow must be a true DB no-op.
  it('mode:"shadow" computes the full tier breakdown but writes NOTHING to the ref', async () => {
    await seedTrip('t1', { tz: TZ })
    await seedMemory('m1', 't1', [{ key: 'k1', capturedAt: DAY, vision: { setting: 'outdoor' } }])
    const s = await backfillOffsetInference(env, { mode: 'shadow' })
    expect(s.corroborated).toBe(1)
    expect(s.wrote).toBe(1) // the WOULD-write count — reported for review
    expect(s.memsWritten).toBe(0) // but zero rows actually touched
    const { refs } = await memRow('m1')
    expect(refs[0].offsetMinutes).toBeUndefined()
    expect(refs[0].prov).toBeUndefined()
  })

  it('mode omitted entirely (the fail-safe default) also writes NOTHING — never assume "on"', async () => {
    await seedTrip('t1', { tz: TZ })
    await seedMemory('m1', 't1', [{ key: 'k1', capturedAt: DAY, vision: { setting: 'outdoor' } }])
    const s = await backfillOffsetInference(env)
    expect(s.corroborated).toBe(1)
    expect(s.memsWritten).toBe(0)
    const { refs } = await memRow('m1')
    expect(refs[0].offsetMinutes).toBeUndefined()
  })

  it('an unrecognized mode value also writes NOTHING (fail safe, same posture as photoHealMode)', async () => {
    await seedTrip('t1', { tz: TZ })
    await seedMemory('m1', 't1', [{ key: 'k1', capturedAt: DAY, vision: { setting: 'outdoor' } }])
    const s = await backfillOffsetInference(env, { mode: 'bogus' })
    expect(s.corroborated).toBe(1)
    expect(s.memsWritten).toBe(0)
    const { refs } = await memRow('m1')
    expect(refs[0].offsetMinutes).toBeUndefined()
  })

  it('a video ref (kind:"video") is eligible; a note/voice E4 piece is never touched', async () => {
    await seedTrip('t1', { tz: TZ })
    await seedMemory('m1', 't1', [
      { key: 'v1.mp4', kind: 'video', capturedAt: DAY, vision: { setting: 'outdoor' } },
      { kind: 'note', text: 'hi' },
      { kind: 'voice', key: 'a1', capturedAt: DAY },
    ])
    const s = await backfillOffsetInference(env, { mode: 'on' })
    expect(s.refsScanned).toBe(1) // only the video
    expect(s.corroborated).toBe(1)
  })
})

describe('corroborationTier (pure)', () => {
  it('outdoor + a real daylight instant → corroborated', () => {
    expect(corroborationTier({ vision: { setting: 'outdoor' }, capturedAt: DAY }, PTOWN)).toBe('corroborated')
  })
  it('outdoor + a real nighttime instant → conflicting', () => {
    expect(corroborationTier({ vision: { setting: 'outdoor' }, capturedAt: NIGHT }, PTOWN)).toBe('conflicting')
  })
  it('indoor → no-signal regardless of time (can neither corroborate nor disprove)', () => {
    expect(corroborationTier({ vision: { setting: 'indoor' }, capturedAt: DAY }, PTOWN)).toBe('no-signal')
    expect(corroborationTier({ vision: { setting: 'indoor' }, capturedAt: NIGHT }, PTOWN)).toBe('no-signal')
  })
  it('no vision at all → no-signal', () => {
    expect(corroborationTier({ capturedAt: DAY }, PTOWN)).toBe('no-signal')
  })
  it('no coords → no-signal (defensive, never throws)', () => {
    expect(corroborationTier({ vision: { setting: 'outdoor' }, capturedAt: DAY }, null)).toBe('no-signal')
  })
  it('a bad capturedAt → no-signal, never throws', () => {
    expect(corroborationTier({ vision: { setting: 'outdoor' }, capturedAt: 'garbage' }, PTOWN)).toBe('no-signal')
  })
})
