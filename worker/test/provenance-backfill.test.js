// backfillProvenanceTags + its pure classifiers against REAL test D1 and the
// EXACT real fingerprints from the 2026-07-10 production audit (Build 2,
// FAMILY_TRIPS_VISION §14): the two known one-off manual D1-UPDATE batches
// (5 nyc-rafa-2026 ids + 31 provincetown ids, both offsetMinutes:-240) must
// classify as 'inferred-manual' — keyed on the memory's IMMUTABLE id, never
// on `updated_at` (which worker/src/index.js stamps fresh on EVERY unrelated
// POST /memories write — the exact bug this file's fix closes: an unrelated
// edit to one of these rows must NEVER cause it to silently misclassify as
// 'exif', which is permanent + un-overwritable per memoryStore.js's
// tieredWriteAllowed). A normal staggered-timestamp lat-having ref must
// classify as 'exif'; an already-tagged ref must be skipped (idempotent).
// Also verifies OCC-guard, no updated_at bump, the volleyball-2026 skip, and
// bounded/resumable.

import { env } from 'cloudflare:test'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { applySchema } from './helpers/schema.js'
import { backfillProvenanceTags, classifyGpsProv, classifyOffsetProv } from '../src/provenanceBackfill.js'

// One real id from each known batch (verbatim from the 2026-07-10 audit,
// freshly re-derived against live prod D1 the night this fix landed).
const NYC_BATCH_ID = 'mem_mraxts7d_tcl51'
const PTOWN_BATCH_ID = 'mem_mr6khc1v_f4z5i'
// updated_at is now IRRELEVANT to classification — these are just plausible
// row stamps used to seed rows in the D1-backed tests below.
const NYC_BATCH_UPDATED_AT = 1783453041025
const PTOWN_BATCH_UPDATED_AT = 1783458189845

async function seedMem(id, tripId, refs, updated_at = 100) {
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

describe('classifyGpsProv (pure)', () => {
  it('a ref with real lat/lng and no prov.gps → exif', () => {
    expect(classifyGpsProv({ key: 'k1', lat: 42.06, lng: -70.16 })).toBe('exif')
  })
  it('no lat/lng at all → null (nothing to tag)', () => {
    expect(classifyGpsProv({ key: 'k1' })).toBeNull()
  })
  it('already tagged → null (idempotent skip)', () => {
    expect(classifyGpsProv({ key: 'k1', lat: 1, lng: 2, prov: { gps: 'exif' } })).toBeNull()
  })
})

describe('classifyOffsetProv (pure) — the EXACT known-manual fingerprint, keyed on IDENTITY', () => {
  it('a known nyc-rafa-2026 batch id → inferred-manual', () => {
    expect(classifyOffsetProv({ key: 'k1', offsetMinutes: -240 }, NYC_BATCH_ID)).toBe('inferred-manual')
  })
  it('a known provincetown batch id → inferred-manual', () => {
    expect(classifyOffsetProv({ key: 'k1', offsetMinutes: -240 }, PTOWN_BATCH_ID)).toBe('inferred-manual')
  })
  it('offsetMinutes:-240 but the id is NOT in the known list → exif, not inferred-manual', () => {
    expect(classifyOffsetProv({ key: 'k1', offsetMinutes: -240 }, 'mem_some_other_ref')).toBe('exif')
  })
  it('a different offset value entirely on a NON-known id → exif', () => {
    expect(classifyOffsetProv({ key: 'k1', offsetMinutes: -300 }, 'mem_some_other_ref')).toBe('exif')
  })
  it('no offsetMinutes at all → null (nothing to tag)', () => {
    expect(classifyOffsetProv({ key: 'k1' }, NYC_BATCH_ID)).toBeNull()
  })
  it('already tagged → null (idempotent skip), even for a known-batch id', () => {
    expect(classifyOffsetProv({ key: 'k1', offsetMinutes: -240, prov: { off: 'inferred-manual' } }, NYC_BATCH_ID)).toBeNull()
  })

  it('REGRESSION (pure level): classification never even ACCEPTS a timestamp — the 2nd param is treated as an id, so no value shaped like updated_at can accidentally match unless it IS literally one of the 36 known ids', () => {
    // The old, broken classifier took (ref, rowUpdatedAt) and matched a
    // hardcoded Set of TWO timestamps. Passing real timestamp values here
    // (things that used to matter) now correctly fall through to 'exif',
    // because the fixed classifier only ever matches an exact known memory id.
    const ref = { key: 'k1', offsetMinutes: -240 }
    for (const notAnId of [Date.now(), NYC_BATCH_UPDATED_AT, PTOWN_BATCH_UPDATED_AT, 1783453041025]) {
      expect(classifyOffsetProv(ref, notAnId)).toBe('exif')
    }
  })

  it('SHAPE DRIFT: a known-batch id whose ref no longer matches the expected -240/no-lat shape still classifies by identity, but logs a loud warning', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // offsetMinutes has drifted away from -240 (e.g. a hypothetical future
      // direct-D1 edit bypassing the write-seam) — identity still wins.
      expect(classifyOffsetProv({ key: 'k1', offsetMinutes: -300 }, NYC_BATCH_ID)).toBe('inferred-manual')
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toMatch(/SHAPE DRIFT/)
      expect(spy.mock.calls[0][0]).toMatch(NYC_BATCH_ID)
      spy.mockClear()
      // lat/lng present where the known batch should have none — identity
      // still wins, still warns.
      expect(classifyOffsetProv({ key: 'k1', offsetMinutes: -240, lat: 1, lng: 2 }, PTOWN_BATCH_ID)).toBe('inferred-manual')
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toMatch(/SHAPE DRIFT/)
    } finally {
      spy.mockRestore()
    }
  })

  it('the expected shape (offsetMinutes:-240, no lat) on a known-batch id logs NOTHING (no false-alarm noise on the common case)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(classifyOffsetProv({ key: 'k1', offsetMinutes: -240 }, NYC_BATCH_ID)).toBe('inferred-manual')
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('backfillProvenanceTags', () => {
  it('tags the REAL nyc-rafa-2026 manual-batch fingerprint as inferred-manual', async () => {
    await seedMem('mem_mraxts7d_tcl51', 'nyc-rafa-2026', [{ key: 'k1', offsetMinutes: -240 }], NYC_BATCH_UPDATED_AT)
    const s = await backfillProvenanceTags(env)
    expect(s.offTagged).toBe(1)
    const { refs } = await memRow('mem_mraxts7d_tcl51')
    expect(refs[0].prov).toEqual({ off: 'inferred-manual' })
  })

  it('tags the REAL provincetown manual-batch fingerprint as inferred-manual', async () => {
    await seedMem(PTOWN_BATCH_ID, 'provincetown-july-4th-2026-07-2', [{ key: 'k1', offsetMinutes: -240 }], PTOWN_BATCH_UPDATED_AT)
    const s = await backfillProvenanceTags(env)
    expect(s.offTagged).toBe(1)
    const { refs } = await memRow(PTOWN_BATCH_ID)
    expect(refs[0].prov).toEqual({ off: 'inferred-manual' })
  })

  // END-TO-END REGRESSION — the EXACT scenario that was broken: seed a real
  // known-batch memory at its real batch updated_at (so an OLD timestamp-keyed
  // classifier would have matched it), then simulate an UNRELATED write to
  // that same row bumping updated_at (a caption edit, a stop reassignment —
  // worker/src/index.js's postMemory stamps updated_at = Date.now() on every
  // POST, unconditionally) BEFORE the backfill ever runs. The OLD code would
  // have silently classified this as 'exif' (permanent, un-overwritable) the
  // moment updated_at drifted off the hardcoded batch stamp. The FIX must
  // still tag it 'inferred-manual', because it never looks at updated_at.
  it('REGRESSION (end-to-end against real D1): a known-batch memory whose updated_at was bumped by an unrelated edit BEFORE the backfill runs still classifies as inferred-manual, not exif', async () => {
    await seedMem(NYC_BATCH_ID, 'nyc-rafa-2026', [{ key: 'k1', offsetMinutes: -240 }], NYC_BATCH_UPDATED_AT)
    // Simulate the unrelated write: a caption edit / re-file bumps updated_at
    // off the recorded batch stamp, exactly as worker/src/index.js does on
    // every POST /memories — the OLD fingerprint's Achilles' heel.
    const bumpedUpdatedAt = NYC_BATCH_UPDATED_AT + 86_400_000 // +1 day, unrelated edit
    await env.DB.prepare('UPDATE memories SET updated_at = ? WHERE id = ?').bind(bumpedUpdatedAt, NYC_BATCH_ID).run()
    const before = await memRow(NYC_BATCH_ID)
    expect(before.updated_at).toBe(bumpedUpdatedAt) // confirm the bump actually landed
    expect(before.updated_at).not.toBe(NYC_BATCH_UPDATED_AT) // and no longer matches the old fingerprint

    const s = await backfillProvenanceTags(env)
    expect(s.offTagged).toBe(1)
    const { refs } = await memRow(NYC_BATCH_ID)
    expect(refs[0].prov).toEqual({ off: 'inferred-manual' })
  })

  it('a normal staggered-timestamp lat-having ref classifies as exif', async () => {
    await seedMem('m1', 'trip-mp2vndah', [{ key: 'k1', lat: 43.24, lng: -72.87 }], 1751000000000)
    const s = await backfillProvenanceTags(env)
    expect(s.gpsTagged).toBe(1)
    const { refs } = await memRow('m1')
    expect(refs[0].prov).toEqual({ gps: 'exif' })
  })

  it('gps AND offset both get tagged on the same ref independently when both are present untagged', async () => {
    await seedMem('m1', 'trip-mp2vndah', [{ key: 'k1', lat: 1, lng: 2, offsetMinutes: -300 }], 1751000000000)
    const s = await backfillProvenanceTags(env)
    expect(s.gpsTagged).toBe(1)
    expect(s.offTagged).toBe(1)
    const { refs } = await memRow('m1')
    expect(refs[0].prov).toEqual({ gps: 'exif', off: 'exif' })
  })

  it('idempotent — a ref that already carries prov.gps is skipped even though it still has lat/lng', async () => {
    await seedMem('m1', 'trip-mp2vndah', [{ key: 'k1', lat: 1, lng: 2, prov: { gps: 'exif' } }], 100)
    const s = await backfillProvenanceTags(env)
    expect(s.gpsTagged).toBe(0)
    expect(s.alreadyTagged).toBe(1)
  })

  it('a ref with neither lat/lng nor offsetMinutes is never scanned at all (nothing to ever tag)', async () => {
    await seedMem('m1', 'jackson-2026', [{ key: 'k1', capturedAt: '2026-07-01T12:00:00Z' }], 100)
    const s = await backfillProvenanceTags(env)
    expect(s.refsScanned).toBe(0)
  })

  it('skips volleyball-2026 entirely', async () => {
    await seedMem('m1', 'volleyball-2026', [{ key: 'k1', lat: 41.3, lng: -72.1 }], 100)
    const s = await backfillProvenanceTags(env)
    expect(s.refsScanned).toBe(0)
    const { refs } = await memRow('m1')
    expect(refs[0].prov).toBeUndefined()
  })

  it('never bumps updated_at', async () => {
    await seedMem('m1', 'trip-mp2vndah', [{ key: 'k1', lat: 1, lng: 2 }], 888)
    await backfillProvenanceTags(env)
    expect((await memRow('m1')).updated_at).toBe(888)
  })

  it('respects the limit and reports hitLimit (bounded, resumable)', async () => {
    await seedMem(
      'm1',
      'trip-mp2vndah',
      [
        { key: 'k1', lat: 1, lng: 2 },
        { key: 'k2', lat: 3, lng: 4 },
        { key: 'k3', lat: 5, lng: 6 },
      ],
      100
    )
    const s = await backfillProvenanceTags(env, { limit: 2 })
    expect(s.gpsTagged).toBe(2)
    expect(s.hitLimit).toBe(true)
  })

  it('dryRun classifies but writes nothing', async () => {
    await seedMem('m1', 'trip-mp2vndah', [{ key: 'k1', lat: 1, lng: 2 }], 100)
    const s = await backfillProvenanceTags(env, { dryRun: true })
    expect(s.gpsTagged).toBe(1)
    const { refs } = await memRow('m1')
    expect(refs[0].prov).toBeUndefined()
  })
})
