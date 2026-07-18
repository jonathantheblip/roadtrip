// propagateMomentGps against real test D1 (Build 5) — moment-scoped GPS
// propagation. Verifies the mode gate (byte-identical-in-shadow, mirroring
// offsetInference.js's exact contract), the SOURCE-TIER rule (only explicit
// exif/scan prov ever seeds a propagation — never a pin/inferred/propagated
// value, the cascade-hazard guard), the 250m-disagreement refusal
// (finalizeMoment's own rule, reapplied to the reference-tier subset), and
// the no-updated_at-bump write discipline.
import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import { propagateMomentGps, photoGpsPropagationMode } from '../src/momentGpsPropagation.js'

const T0 = Date.parse('2026-07-04T16:00:00.000Z')
const at = (minOffset) => new Date(T0 + minOffset * 60000).toISOString()

// EXACT degree-latitude offset for a given meter distance along a meridian,
// using the SAME spherical-earth formula momentGpsPropagation.js's own
// haversineMeters uses (R=6371000, and dLng=0 degenerates the haversine
// formula to a pure great-circle angle) — so a test built from this lands
// EXACTLY on a real-world boundary the production code will also compute,
// not an approximation that could drift off the true 250m line.
const EARTH_R = 6371000
const metersToLatDeg = (m) => (m / EARTH_R) * (180 / Math.PI)

async function seedTrip(id = 't1') {
  await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?,?,?)')
    .bind(id, JSON.stringify({ id }), 100)
    .run()
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

describe('propagateMomentGps', () => {
  it('mode "on": propagates an exif-sourced member coords onto an unlocated moment-mate', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', [
      { key: 'src', capturedAt: at(0), lat: 42.05, lng: -70.18, prov: { gps: 'exif' } },
      { key: 'target', capturedAt: at(5) }, // same moment (5 min apart), no coords at all
    ])
    const s = await propagateMomentGps(env, { mode: 'on' })
    expect(s.wouldPropagate).toBe(1)
    expect(s.wrote).toBe(1)
    expect(s.memsWritten).toBe(1)
    const { refs } = await memRow('m1')
    const target = refs.find((r) => r.key === 'target')
    expect(target.lat).toBe(42.05)
    expect(target.lng).toBe(-70.18)
    expect(target.prov).toEqual({ gps: 'propagated' })
  })

  it("S1 Level 2: a 'confirmed'-sourced member (a family confirm of a real stop) SEEDS a propagation, like exif/scan", async () => {
    await seedTrip()
    await seedMemory('m1', 't1', [
      { key: 'src', capturedAt: at(0), lat: 42.05, lng: -70.18, prov: { gps: 'confirmed' } },
      { key: 'target', capturedAt: at(5) }, // unlocated moment-mate
    ])
    const s = await propagateMomentGps(env, { mode: 'on' })
    expect(s.wrote).toBe(1)
    const target = (await memRow('m1')).refs.find((r) => r.key === 'target')
    expect(target.lat).toBe(42.05)
    expect(target.prov).toEqual({ gps: 'propagated' }) // the mate stays INFERRED (no re-propagation)
  })

  it('mode:"shadow" computes wouldPropagate but writes NOTHING (byte-identical, the offsetInference.js contract)', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', [
      { key: 'src', capturedAt: at(0), lat: 42.05, lng: -70.18, prov: { gps: 'exif' } },
      { key: 'target', capturedAt: at(5) },
    ])
    const s = await propagateMomentGps(env, { mode: 'shadow' })
    expect(s.wouldPropagate).toBe(1)
    expect(s.memsWritten).toBe(0)
    const target = (await memRow('m1')).refs.find((r) => r.key === 'target')
    expect(target.lat).toBeUndefined()
    expect(target.prov).toBeUndefined()
  })

  it('mode omitted / unrecognized also writes nothing (fail safe, MANDATORY per the plan — ref lat/lng is family-visible)', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', [
      { key: 'src', capturedAt: at(0), lat: 42.05, lng: -70.18, prov: { gps: 'exif' } },
      { key: 'target', capturedAt: at(5) },
    ])
    await propagateMomentGps(env)
    await propagateMomentGps(env, { mode: 'bogus' })
    const target = (await memRow('m1')).refs.find((r) => r.key === 'target')
    expect(target.lat).toBeUndefined()
  })

  it('SOURCE-TIER RULE: a coord-bearing member with NO exif/scan prov never seeds a propagation', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', [
      { key: 'inferred-src', capturedAt: at(0), lat: 42.05, lng: -70.18, prov: { gps: 'inferred-place' } },
      { key: 'target', capturedAt: at(5) },
    ])
    const s = await propagateMomentGps(env, { mode: 'on' })
    expect(s.sourceMoments).toBe(0)
    expect(s.wouldPropagate).toBe(0)
    const target = (await memRow('m1')).refs.find((r) => r.key === 'target')
    expect(target.lat).toBeUndefined()
  })

  it('SOURCE-TIER RULE: absent prov on a coord-bearing member ALSO never seeds (stricter than the general Build 2 rule)', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', [
      { key: 'no-prov-src', capturedAt: at(0), lat: 42.05, lng: -70.18 }, // coords, but no prov at all
      { key: 'target', capturedAt: at(5) },
    ])
    const s = await propagateMomentGps(env, { mode: 'on' })
    expect(s.sourceMoments).toBe(0)
    const target = (await memRow('m1')).refs.find((r) => r.key === 'target')
    expect(target.lat).toBeUndefined()
  })

  it('SOURCE-TIER RULE: a "propagated" member never itself seeds a further propagation (cascade guard)', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', [
      { key: 'already-propagated', capturedAt: at(0), lat: 42.05, lng: -70.18, prov: { gps: 'propagated' } },
      { key: 'target', capturedAt: at(5) },
    ])
    const s = await propagateMomentGps(env, { mode: 'on' })
    expect(s.sourceMoments).toBe(0)
  })

  it('THE 250m-DISAGREEMENT REFUSAL: two reference-tier sources that disagree never fabricate a centroid', async () => {
    await seedTrip()
    // A shared `faces` tag keeps the blended score high enough that sessions.js's
    // OWN split branch doesn't fire (matching the plan's real live example: a
    // multi-person moment merges on a NON-gps dimension despite wide GPS
    // disagreement) — isolating THIS test to Build 5's own 250m refusal, reapplied
    // to the reference-tier subset, rather than accidentally exercising the pure
    // engine's unrelated split logic.
    await seedMemory('m1', 't1', [
      { key: 'src1', capturedAt: at(0), lat: 42.05, lng: -70.18, prov: { gps: 'exif' }, faces: ['mom'] },
      { key: 'src2', capturedAt: at(5), lat: 43.0, lng: -71.0, prov: { gps: 'scan' }, faces: ['mom'] }, // ~120km away
      { key: 'target', capturedAt: at(10), faces: ['mom'] },
    ])
    const s = await propagateMomentGps(env, { mode: 'on' })
    expect(s.sourceMoments).toBe(1)
    expect(s.disagreements).toBe(1)
    expect(s.wouldPropagate).toBe(0)
    const target = (await memRow('m1')).refs.find((r) => r.key === 'target')
    expect(target.lat).toBeUndefined()
  })

  it('NEAR BOUNDARY: two sources ~499m apart (~249.5m centroid spread) AGREE', async () => {
    // Not the literal mathematical 250.000m line — floating-point geo-distance
    // is not perfectly symmetric AT that exact line (centroid→p1 and
    // centroid→p2 differ by ~2e-10m, enough to flip a strict <= right at the
    // knife-edge), so this pins a value UNAMBIGUOUSLY on the agree side
    // instead of chasing a inherently float-unstable exact boundary.
    await seedTrip()
    const dLat = metersToLatDeg(499) // centroid spread ≈ 249.5m
    await seedMemory('m1', 't1', [
      { key: 'src1', capturedAt: at(0), lat: 42.05, lng: -70.18, prov: { gps: 'exif' }, faces: ['mom'] },
      { key: 'src2', capturedAt: at(3), lat: 42.05 + dLat, lng: -70.18, prov: { gps: 'scan' }, faces: ['mom'] },
      { key: 'target', capturedAt: at(6), faces: ['mom'] },
    ])
    const s = await propagateMomentGps(env, { mode: 'on' })
    expect(s.disagreements).toBe(0)
    expect(s.wouldPropagate).toBe(1)
  })

  it('NEAR BOUNDARY: two sources ~502m apart (~251m centroid spread) REFUSE — the line is a real cutoff, not a fiction', async () => {
    await seedTrip()
    const dLat = metersToLatDeg(502) // spread = 251m — just past the 250m radius
    await seedMemory('m1', 't1', [
      { key: 'src1', capturedAt: at(0), lat: 42.05, lng: -70.18, prov: { gps: 'exif' }, faces: ['mom'] },
      { key: 'src2', capturedAt: at(3), lat: 42.05 + dLat, lng: -70.18, prov: { gps: 'scan' }, faces: ['mom'] },
      { key: 'target', capturedAt: at(6), faces: ['mom'] },
    ])
    const s = await propagateMomentGps(env, { mode: 'on' })
    expect(s.disagreements).toBe(1)
    expect(s.wouldPropagate).toBe(0)
  })

  it('agreeing sources within 250m: the moment DOES locate and DOES propagate the centroid', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', [
      { key: 'src1', capturedAt: at(0), lat: 42.0500, lng: -70.1800, prov: { gps: 'exif' } },
      { key: 'src2', capturedAt: at(3), lat: 42.0501, lng: -70.1799, prov: { gps: 'scan' } }, // a few meters away
      { key: 'target', capturedAt: at(6) },
    ])
    const s = await propagateMomentGps(env, { mode: 'on' })
    expect(s.disagreements).toBe(0)
    expect(s.wouldPropagate).toBe(1)
    const target = (await memRow('m1')).refs.find((r) => r.key === 'target')
    expect(target.lat).toBeCloseTo(42.05005, 3)
  })

  it('a video ref is an eligible target; a note/voice E4 piece is never touched', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', [
      { key: 'src', capturedAt: at(0), lat: 42.05, lng: -70.18, prov: { gps: 'exif' } },
      { key: 'v.mp4', kind: 'video', capturedAt: at(2) },
      { kind: 'note', text: 'hi' },
    ])
    const s = await propagateMomentGps(env, { mode: 'on' })
    expect(s.wouldPropagate).toBe(1)
    const video = (await memRow('m1')).refs.find((r) => r.key === 'v.mp4')
    expect(video.lat).toBe(42.05)
  })

  it('never bumps updated_at (a computed enrichment, not a family edit)', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', [
      { key: 'src', capturedAt: at(0), lat: 42.05, lng: -70.18, prov: { gps: 'exif' } },
      { key: 'target', capturedAt: at(5) },
    ], 777)
    await propagateMomentGps(env, { mode: 'on' })
    expect((await memRow('m1')).updated_at).toBe(777)
  })

  it('skips volleyball-2026 entirely (confirmed fixture data)', async () => {
    await seedTrip('volleyball-2026')
    await seedMemory('m1', 'volleyball-2026', [
      { key: 'src', capturedAt: at(0), lat: 42.05, lng: -70.18, prov: { gps: 'exif' } },
      { key: 'target', capturedAt: at(5) },
    ])
    const s = await propagateMomentGps(env, { mode: 'on' })
    expect(s.tripsConsidered).toBe(0)
    const target = (await memRow('m1')).refs.find((r) => r.key === 'target')
    expect(target.lat).toBeUndefined()
  })

  it('a target ref outside the moment (far in time, its own separate moment) is never touched', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', [
      { key: 'src', capturedAt: at(0), lat: 42.05, lng: -70.18, prov: { gps: 'exif' } },
      { key: 'far-target', capturedAt: at(300) }, // 5 hours later — a different moment entirely
    ])
    const s = await propagateMomentGps(env, { mode: 'on' })
    expect(s.wouldPropagate).toBe(0)
    const target = (await memRow('m1')).refs.find((r) => r.key === 'far-target')
    expect(target.lat).toBeUndefined()
  })

  it('respects the limit and reports hitLimit (bounded, resumable)', async () => {
    await seedTrip()
    await seedMemory('m1', 't1', [
      { key: 'src', capturedAt: at(0), lat: 42.05, lng: -70.18, prov: { gps: 'exif' } },
      { key: 't1r', capturedAt: at(2) },
      { key: 't2r', capturedAt: at(4) },
      { key: 't3r', capturedAt: at(6) },
    ])
    const s = await propagateMomentGps(env, { mode: 'on', limit: 2 })
    expect(s.wouldPropagate).toBe(2)
    expect(s.hitLimit).toBe(true)
  })
})

describe('photoGpsPropagationMode — the W0 per-lever knob (defaults to inheriting the caller-resolved global mode)', () => {
  it('its OWN var wins when recognized', () => {
    expect(photoGpsPropagationMode({ PHOTO_GPS_PROPAGATION_MODE: 'on' }, 'shadow')).toBe('on')
  })
  it('falls back to the caller-supplied global mode when unset', () => {
    expect(photoGpsPropagationMode({}, 'shadow')).toBe('shadow')
  })
  it('an unrecognized own-var value falls back to the global mode too', () => {
    expect(photoGpsPropagationMode({ PHOTO_GPS_PROPAGATION_MODE: 'bogus' }, 'on')).toBe('on')
  })
  it('an unrecognized fallback defaults all the way to off (fail safe)', () => {
    expect(photoGpsPropagationMode({}, 'bogus')).toBe('off')
    expect(photoGpsPropagationMode({}, undefined)).toBe('off')
  })
})
