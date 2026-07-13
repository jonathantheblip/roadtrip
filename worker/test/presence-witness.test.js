// witnessPresence / findWitnessPosition against real test D1 (Build W5,
// BUILD_PLAN_WITNESS_FLEET_2.md) — the presence-breadcrumb witness. Verifies
// the mode gate (off issues ZERO queries against presence_trail — the
// load-bearing inertness property against the not-yet-applied migration
// 020), the ±15-min hard window, the bracketing-pair widen-to-60-min rule,
// the 100m accuracy refusal, the make/model device-signature corroboration
// (and its "absent data ≠ contradiction" contingency), additive-only writes,
// and the missing-table degrade.
import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import { witnessPresence, findWitnessPosition } from '../src/presenceWitness.js'

const T0 = Date.parse('2026-07-04T16:00:00.000Z')
const atMs = (minOffset) => T0 + minOffset * 60000
const at = (minOffset) => new Date(atMs(minOffset)).toISOString()

async function seedTrip(id = 't1') {
  await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?,?,?)')
    .bind(id, JSON.stringify({ id }), 100)
    .run()
}
async function seedMemory(id, tripId, author, refs, updated_at = 50) {
  await env.DB.prepare(
    `INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, photo_r2_keys_json, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`
  )
    .bind(id, tripId, author, 'shared', 'photo', JSON.stringify(refs), 1, updated_at)
    .run()
}
async function seedCrumb(tripId, traveler, minOffset, { lat = 42.05, lng = -70.18, accuracy = 10 } = {}) {
  await env.DB.prepare(
    'INSERT INTO presence_trail (trip_id, traveler, lat, lng, accuracy, at) VALUES (?,?,?,?,?,?)'
  )
    .bind(tripId, traveler, lat, lng, accuracy, atMs(minOffset))
    .run()
}
async function memRow(id) {
  const r = await env.DB.prepare('SELECT photo_r2_keys_json, updated_at FROM memories WHERE id=?').bind(id).first()
  return { refs: JSON.parse(r.photo_r2_keys_json), updated_at: r.updated_at }
}

beforeEach(async () => {
  await applySchema(env.DB)
  for (const t of ['memories', 'trips', 'presence_trail']) await env.DB.prepare(`DELETE FROM ${t}`).run()
})

// ── the pure matcher — no D1 ─────────────────────────────────────────────
describe('findWitnessPosition (pure)', () => {
  it('a single crumb inside the ±15-min hard window, good accuracy → match', () => {
    const r = findWitnessPosition(atMs(10), [{ at: atMs(0), lat: 1, lng: 2, accuracy: 20 }])
    expect(r).toEqual({ outcome: 'match', lat: 1, lng: 2, widened: false })
  })

  it('a single crumb inside the hard window but accuracy worse than 100m → refuses (accuracy)', () => {
    const r = findWitnessPosition(atMs(10), [{ at: atMs(0), lat: 1, lng: 2, accuracy: 101 }])
    expect(r.outcome).toBe('accuracy')
  })

  it('accuracy exactly 100m is NOT "worse than 100m" → still matches', () => {
    const r = findWitnessPosition(atMs(10), [{ at: atMs(0), lat: 1, lng: 2, accuracy: 100 }])
    expect(r.outcome).toBe('match')
  })

  it('a single crumb outside the hard window (16 min) with no bracket → refuses (window)', () => {
    const r = findWitnessPosition(atMs(16), [{ at: atMs(0), lat: 1, lng: 2, accuracy: 10 }])
    expect(r.outcome).toBe('window')
  })

  it('no crumbs at all → refuses (no-crumb)', () => {
    expect(findWitnessPosition(atMs(0), []).outcome).toBe('no-crumb')
    expect(findWitnessPosition(atMs(0), null).outcome).toBe('no-crumb')
  })

  it('a bracketing pair ≤90 min apart, agreeing within 250m, WIDENS the window to 60 min', () => {
    // before @ -30min, after @ +30min → 60 min apart (≤90), ~13m apart in
    // space (≤250m). Target sits at 0 — exactly BETWEEN them, 30 min from
    // each: outside the 15-min hard window but inside the widened 60-min one.
    const before = { at: atMs(-30), lat: 42.05, lng: -70.18, accuracy: 10 }
    const after = { at: atMs(30), lat: 42.0501, lng: -70.1801, accuracy: 10 } // ~13m away
    const r = findWitnessPosition(atMs(0), [before, after])
    expect(r.outcome).toBe('match')
    expect(r.widened).toBe(true)
    expect(r.lat).toBeCloseTo((before.lat + after.lat) / 2, 6)
  })

  it('a bracketing pair > 90 min apart never widens, even if they agree in space', () => {
    // 100 min apart (over the 90-min cap); target is still only 50 min from
    // each crumb (inside the 60-min widen window on its own), isolating the
    // bracket-span cap as the ONLY thing that can refuse this one.
    const before = { at: atMs(-50), lat: 42.05, lng: -70.18, accuracy: 10 }
    const after = { at: atMs(50), lat: 42.05, lng: -70.18, accuracy: 10 }
    const r = findWitnessPosition(atMs(0), [before, after])
    expect(r.outcome).toBe('window')
  })

  it('a bracketing pair that DISAGREES beyond 250m never widens', () => {
    const before = { at: atMs(-30), lat: 42.05, lng: -70.18, accuracy: 10 }
    const after = { at: atMs(30), lat: 42.10, lng: -70.18, accuracy: 10 } // ~5.5km away
    const r = findWitnessPosition(atMs(0), [before, after])
    expect(r.outcome).toBe('window')
  })

  it('a widen-eligible bracket where either crumb has bad accuracy still refuses (accuracy)', () => {
    const before = { at: atMs(-30), lat: 42.05, lng: -70.18, accuracy: 10 }
    const after = { at: atMs(30), lat: 42.0501, lng: -70.1801, accuracy: 150 } // bad fix
    const r = findWitnessPosition(atMs(0), [before, after])
    expect(r.outcome).toBe('accuracy')
  })

  it('a single crumb (only a "before", no "after") can never widen its own window', () => {
    const r = findWitnessPosition(atMs(40), [{ at: atMs(-50), lat: 42.05, lng: -70.18, accuracy: 10 }])
    expect(r.outcome).toBe('window') // 90-min gap, no bracket partner
  })
})

// ── the D1-backed sweep ───────────────────────────────────────────────────
describe('witnessPresence — shadow discipline (the load-bearing inertness property)', () => {
  it('mode omitted → skipped:"off", ZERO queries (proven by dropping presence_trail first)', async () => {
    await env.DB.prepare('DROP TABLE presence_trail').run()
    await seedTrip()
    await seedMemory('m1', 't1', 'jonathan', [{ key: 'p1', capturedAt: at(0) }])
    const r = await witnessPresence(env, {})
    expect(r).toEqual({ skipped: 'off' })
  })

  it('mode:"off" explicitly → same, zero queries', async () => {
    await env.DB.prepare('DROP TABLE presence_trail').run()
    await seedTrip()
    const r = await witnessPresence(env, { mode: 'off' })
    expect(r).toEqual({ skipped: 'off' })
  })

  it('a missing presence_trail table under mode:"on" degrades to a no-op, never throws', async () => {
    await env.DB.prepare('DROP TABLE presence_trail').run()
    await seedTrip()
    await seedMemory('m1', 't1', 'jonathan', [{ key: 'p1', capturedAt: at(0) }])
    const r = await witnessPresence(env, { mode: 'on' })
    expect(r.skipped).toBe('no-table')
  })
})

describe('witnessPresence — matching + writes', () => {
  it('mode:"on": a matching crumb within the hard window writes lat/lng + prov.gps="inferred-presence"', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', 'jonathan', [{ key: 'p1', capturedAt: at(10) }])
    await seedCrumb('t1', 'jonathan', 0, { lat: 42.05, lng: -70.18, accuracy: 15 })
    const s = await witnessPresence(env, { mode: 'on' })
    expect(s.matched).toBe(1)
    expect(s.memsWritten).toBe(1)
    const { refs } = await memRow('m1')
    expect(refs[0].lat).toBe(42.05)
    expect(refs[0].lng).toBe(-70.18)
    expect(refs[0].prov).toEqual({ gps: 'inferred-presence' })
  })

  it('mode:"shadow": computes the match but writes NOTHING (byte-identical, the established contract)', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', 'jonathan', [{ key: 'p1', capturedAt: at(10) }])
    await seedCrumb('t1', 'jonathan', 0, { lat: 42.05, lng: -70.18, accuracy: 15 })
    const s = await witnessPresence(env, { mode: 'shadow' })
    expect(s.matched).toBe(1)
    expect(s.memsWritten).toBe(0)
    const { refs } = await memRow('m1')
    expect(refs[0].lat).toBeUndefined()
    expect(refs[0].prov).toBeUndefined()
  })

  it('ADDITIVE ONLY: a ref that already carries lat/lng is never touched, even with a perfect crumb match', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', 'jonathan', [
      { key: 'p1', capturedAt: at(10), lat: 1, lng: 2, prov: { gps: 'exif' } },
    ])
    await seedCrumb('t1', 'jonathan', 0, { lat: 42.05, lng: -70.18, accuracy: 15 })
    const s = await witnessPresence(env, { mode: 'on' })
    expect(s.refsScanned).toBe(0) // needsGps() excludes it before it's ever a target
    const { refs } = await memRow('m1')
    expect(refs[0].lat).toBe(1) // untouched
    expect(refs[0].prov).toEqual({ gps: 'exif' })
  })

  it('accuracy worse than 100m refuses (no write, counted)', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', 'jonathan', [{ key: 'p1', capturedAt: at(10) }])
    await seedCrumb('t1', 'jonathan', 0, { accuracy: 250 })
    const s = await witnessPresence(env, { mode: 'on' })
    expect(s.matched).toBe(0)
    expect(s.refusedAccuracy).toBe(1)
    const { refs } = await memRow('m1')
    expect(refs[0].lat).toBeUndefined()
  })

  it('a DIFFERENT traveler\'s crumb never matches (identity-scoped, not just trip-scoped)', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', 'jonathan', [{ key: 'p1', capturedAt: at(10) }])
    await seedCrumb('t1', 'helen', 0, { accuracy: 10 }) // wrong traveler
    const s = await witnessPresence(env, { mode: 'on' })
    expect(s.refusedNoCrumb).toBe(1)
    const { refs } = await memRow('m1')
    expect(refs[0].lat).toBeUndefined()
  })

  it('a KID-authored memory is never a target, even if a (hypothetical) crumb existed for them', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', 'rafa', [{ key: 'p1', capturedAt: at(10) }])
    await seedCrumb('t1', 'rafa', 0, { accuracy: 10 }) // should never exist in prod (adults-only writer), belt+braces
    const s = await witnessPresence(env, { mode: 'on' })
    expect(s.refsScanned).toBe(0) // isAdult gate excludes it before it's ever a target
  })
})

describe('witnessPresence — device (make/model) corroboration, the AirDrop-import wrinkle', () => {
  it('a candidate matching the traveler\'s OWN known device signature is HIGH confidence (not lowConfidence)', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', 'jonathan', [
      // a REFERENCE-tier ref establishes jonathan's device signature
      { key: 'ref1', capturedAt: at(-100), lat: 42.05, lng: -70.18, prov: { gps: 'exif' }, meta: { make: 'Apple', model: 'iPhone 15' } },
      { key: 'p1', capturedAt: at(10), meta: { make: 'Apple', model: 'iPhone 15' } },
    ])
    await seedCrumb('t1', 'jonathan', 0, { lat: 42.05, lng: -70.18, accuracy: 15 })
    const s = await witnessPresence(env, { mode: 'on' })
    expect(s.matched).toBe(1)
    expect(s.matchedLowConfidence).toBe(0)
  })

  it('a candidate whose meta CONTRADICTS the traveler\'s known device signature is REFUSED (the AirDrop hazard)', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', 'jonathan', [
      { key: 'ref1', capturedAt: at(-100), lat: 42.05, lng: -70.18, prov: { gps: 'exif' }, meta: { make: 'Apple', model: 'iPhone 15' } },
      { key: 'p1', capturedAt: at(10), meta: { make: 'Samsung', model: 'Galaxy S24' } }, // not jonathan's phone
    ])
    await seedCrumb('t1', 'jonathan', 0, { lat: 42.05, lng: -70.18, accuracy: 15 })
    const s = await witnessPresence(env, { mode: 'on' })
    expect(s.matched).toBe(0)
    expect(s.refusedDeviceMismatch).toBe(1)
    const { refs } = await memRow('m1')
    expect(refs.find((r) => r.key === 'p1').lat).toBeUndefined()
  })

  it('NO signature yet + NO meta on the candidate → matches anyway, marked lowConfidence (the pre-authorized contingency)', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', 'jonathan', [{ key: 'p1', capturedAt: at(10) }]) // no meta at all, no other refs
    await seedCrumb('t1', 'jonathan', 0, { lat: 42.05, lng: -70.18, accuracy: 15 })
    const s = await witnessPresence(env, { mode: 'on' })
    expect(s.matched).toBe(1)
    expect(s.matchedLowConfidence).toBe(1)
    expect(s.refusedDeviceMismatch).toBe(0) // absence of data is never treated as a contradiction
  })
})

describe('witnessPresence — bounded + prov round-trip', () => {
  it('respects the limit (PHOTO_PRESENCE_WITNESS_LIMIT / injected limit), leaving the rest untouched', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', 'jonathan', [
      { key: 'p1', capturedAt: at(10) },
      { key: 'p2', capturedAt: at(11) },
    ])
    await seedCrumb('t1', 'jonathan', 0, { lat: 42.05, lng: -70.18, accuracy: 15 })
    const s = await witnessPresence(env, { mode: 'on', limit: 1 })
    expect(s.matched).toBe(1)
    expect(s.hitLimit).toBe(true)
    const { refs } = await memRow('m1')
    const written = refs.filter((r) => r.lat != null)
    expect(written).toHaveLength(1)
  })

  it('"volleyball-2026" (the fixture trap) is always skipped', async () => {
    await seedTrip('volleyball-2026')
    await seedMemory('m1', 'volleyball-2026', 'jonathan', [{ key: 'p1', capturedAt: at(10) }])
    await seedCrumb('volleyball-2026', 'jonathan', 0, { accuracy: 10 })
    const s = await witnessPresence(env, { mode: 'on' })
    expect(s.tripsConsidered).toBe(0)
    expect(s.refsScanned).toBe(0)
  })
})
