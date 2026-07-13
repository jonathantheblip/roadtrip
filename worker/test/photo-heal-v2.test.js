// v2 shadow LEARNING ledger — recordHealDecisions against REAL D1 (migration 019).
// Seeds a trip + memories, drives the recorder, and asserts the table holds the
// engine's tiered would-decisions, replaces per-trip, and respects the knob.

import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import { recordHealDecisions } from '../src/photoHealRunner.js'

const NOW = 1_700_000_000_000

const tripJson = () =>
  JSON.stringify({
    id: 't1',
    shape: 'route',
    days: [
      {
        n: 1,
        isoDate: '2026-07-01',
        stops: [{ id: 's-a', title: 'The museum', time: '10:00 AM', lat: 30.0, lng: -90.0 }],
      },
    ],
  })

async function seedTrip() {
  await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?, ?, ?)')
    .bind('t1', tripJson(), 200)
    .run()
}

// a memory with one photo ref (capturedAt + optional GPS + offset)
async function seedMemory({ id, refs }) {
  await env.DB.prepare(
    'INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, photo_r2_keys_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
  )
    .bind(id, 't1', 'jonathan', 'shared', 'photo', JSON.stringify(refs), 1, 1)
    .run()
}

async function decisions() {
  const { results } = await env.DB.prepare(
    'SELECT * FROM memory_heal_decisions WHERE trip_id = ? ORDER BY id'
  )
    .bind('t1')
    .all()
  return results
}

beforeEach(async () => {
  await applySchema(env.DB)
  // miniflare storage persists across tests; start each one clean.
  for (const t of ['memory_heal_decisions', 'memories', 'trips']) {
    await env.DB.prepare(`DELETE FROM ${t}`).run()
  }
})

describe('recordHealDecisions — v2 shadow learning ledger', () => {
  it('a GPS session on a stop records an AUTO decision with signals', async () => {
    await seedTrip()
    // a burst at the museum: one geotagged photo → the whole session is located.
    // W8 item 4: `prov: {gps:'exif'}` is what real production data carries
    // (either a genuine EXIF read, or provenanceBackfill's retroactive tag) —
    // without it this GPS would be inferred-tier and the moment would only
    // reach 'confirm', never a silent 'auto' (see the dedicated W8 test below).
    await seedMemory({
      id: 'm1',
      refs: [{ key: 'k1', capturedAt: '2026-07-01T10:05:00.000Z', offsetMinutes: 0, lat: 30.0, lng: -90.0, prov: { gps: 'exif' } }],
    })
    const r = await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
    expect(r.recorded).toBe(1)

    const rows = await decisions()
    expect(rows.length).toBe(1)
    expect(rows[0].tier).toBe('auto')
    expect(rows[0].place_id).toBe('s-a')
    expect(rows[0].evidence).toBe('gps')
    expect(rows[0].mode).toBe('shadow')
    expect(rows[0].run_at).toBe(NOW)
    expect(JSON.parse(rows[0].memory_ids)).toEqual(['m1'])
    expect(JSON.parse(rows[0].signals_json).evidence).toBe('gps')
  })

  it('a no-GPS session time-fitting a planned stop records a CONFIRM (never auto)', async () => {
    await seedTrip()
    await seedMemory({
      id: 'm2',
      refs: [{ key: 'k2', capturedAt: '2026-07-01T10:05:00.000Z', offsetMinutes: 0 }], // no GPS
    })
    await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
    const rows = await decisions()
    expect(rows.length).toBe(1)
    expect(rows[0].tier).toBe('confirm')
    expect(rows[0].place_id).toBe('s-a')
    expect(rows[0].evidence).toBe('time-only')
  })

  it('REPLACES the trip rows each run (bounded current-state, no duplication)', async () => {
    await seedTrip()
    await seedMemory({ id: 'm1', refs: [{ key: 'k1', capturedAt: '2026-07-01T10:05:00.000Z', offsetMinutes: 0, lat: 30, lng: -90 }] })
    await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
    await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW + 1000 })
    const rows = await decisions()
    expect(rows.length).toBe(1) // not 2 — replaced, not appended
    expect(rows[0].run_at).toBe(NOW + 1000)
  })

  it('agenda-free: a GPS burst with no NAMED stop records a DISCOVERED auto (files where it WAS, not the base)', async () => {
    // A hangout day: a stay trip with lodging (the ~1km implicit base) and NO named
    // stops at all. A located photo ~85m from the lodging used to dissolve into
    // "the base"; now it files to a DISCOVERED spot at its own coordinates — the
    // trip documenting itself from where the photo was, with no stop ever entered.
    await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?, ?, ?)')
      .bind(
        't1',
        JSON.stringify({
          id: 't1',
          shape: 'stay',
          lodging: { lat: 30.0, lng: -90.0 },
          days: [{ n: 1, isoDate: '2026-07-01', stops: [] }],
        }),
        200
      )
      .run()
    await seedMemory({
      id: 'm1',
      refs: [{ key: 'k1', capturedAt: '2026-07-01T15:00:00.000Z', offsetMinutes: 0, lat: 30.0006, lng: -90.0006, prov: { gps: 'exif' } }],
    })
    const r = await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
    expect(r.recorded).toBe(1)
    const rows = await decisions()
    expect(rows.length).toBe(1)
    expect(rows[0].tier).toBe('auto')
    expect(rows[0].place_id).toMatch(/^__discovered__:/)
    // BUILD 4b: the discovered spot is ~85m from the (unnamed) lodging — the
    // ONE nearby trip place — so it's named from that, not left as raw coords.
    expect(rows[0].place_name).toBe('the place we stayed')
    expect(rows[0].evidence).toBe('gps')
  })

  it('vision NAMES an otherwise-unplaced moment: a no-GPS burst with a vision label → confirm at that name', async () => {
    // a hangout day with no stops and no GPS → the burst would LEAVE; vision rescues it
    await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?, ?, ?)')
      .bind('t1', JSON.stringify({ id: 't1', shape: 'stay', days: [{ n: 1, isoDate: '2026-07-01', stops: [] }] }), 200)
      .run()
    await seedMemory({
      id: 'm1',
      refs: [
        {
          key: 'k1',
          capturedAt: '2026-07-01T15:00:00.000Z',
          offsetMinutes: 0,
          vision: { name: 'At the beach', labels: ['beach'], setting: 'outdoor' },
        },
      ],
    })
    const r = await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
    expect(r.recorded).toBe(1)
    const rows = await decisions()
    expect(rows.length).toBe(1)
    expect(rows[0].tier).toBe('confirm')
    expect(rows[0].place_name).toBe('At the beach')
    expect(rows[0].place_id).toMatch(/^__vision__:/)
    expect(rows[0].evidence).toBe('vision')
  })

  it('mode off records nothing', async () => {
    await seedTrip()
    await seedMemory({ id: 'm1', refs: [{ key: 'k1', capturedAt: '2026-07-01T10:05:00.000Z', offsetMinutes: 0, lat: 30, lng: -90 }] })
    const r = await recordHealDecisions(env, 't1', { mode: 'off', now: NOW })
    expect(r.skipped).toBe('off')
    expect((await decisions()).length).toBe(0)
  })

  // ── W8 (BUILD_PLAN_WITNESS_FLEET_2.md) ──────────────────────────────────────
  describe('W8 — the time-witness pack', () => {
    it('item 4: a located GPS session with NO reference-tier provenance never silently auto-files (rule 1 gap closed)', async () => {
      await seedTrip()
      // same fixture as the very first test in this file, MINUS `prov` — the
      // exact gap the constitution names: a coordinate with no exif/scan tag.
      await seedMemory({
        id: 'm1',
        refs: [{ key: 'k1', capturedAt: '2026-07-01T10:05:00.000Z', offsetMinutes: 0, lat: 30.0, lng: -90.0 }],
      })
      await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
      const rows = await decisions()
      expect(rows.length).toBe(1)
      expect(rows[0].tier).toBe('confirm') // located at the place, but not a silent auto
      expect(rows[0].place_id).toBe('s-a')
      expect(JSON.parse(rows[0].signals_json).referenceLocatedCount).toBe(0)
    })

    it('item 4: a SEPARATE session no longer inherits a non-reference GPS anchor\'s evidence (used to silently auto-file)', async () => {
      await seedTrip()
      // m1 GPS-anchors 's-a' with NO prov (inferred-tier). m2 is a SEPARATE
      // moment (45m gap — past buildMoments' 40m time bond, no shared non-time
      // dimension to bridge it) with NO GPS at all, sitting 40m from 's-a's
      // OWN declared time (10:00 AM) — close + unambiguous (the only place on
      // this trip). Under the PRE-W8 rule, m1's bare coordinate match would
      // have unconditionally flipped 's-a'.gpsEvidenced=true, and m2 would then
      // have silently AUTO-FILED to 's-a' purely by riding m1's ungrounded
      // anchor — zero evidence of its own. That's the rule-1 leak, closed here.
      await seedMemory({
        id: 'm1',
        refs: [{ key: 'k1', capturedAt: '2026-07-01T10:05:00.000Z', offsetMinutes: 0, lat: 30.0, lng: -90.0 }],
      })
      await seedMemory({
        id: 'm2',
        refs: [{ key: 'k2', capturedAt: '2026-07-01T09:20:00.000Z', offsetMinutes: 0 }], // no GPS
      })
      await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
      const rows = await decisions()
      expect(rows.length).toBe(2)
      const m2Row = rows.find((r) => JSON.parse(r.memory_ids).includes('m2'))
      expect(m2Row.tier).toBe('confirm') // NEVER a silent auto on borrowed, ungrounded evidence
      expect(m2Row.evidence).not.toBe('gps')
    })

    it('item 1(a): a ref with NO capturedAt at all is no longer invisible — memory.created_at is an upper bound, inside the trip window', async () => {
      await seedTrip() // day 2026-07-01
      // no capturedAt whatsoever; created_at falls ON the trip's own day.
      await env.DB.prepare(
        'INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, photo_r2_keys_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
      )
        .bind('m1', 't1', 'jonathan', 'shared', 'photo', JSON.stringify([{ key: 'k1' }]), Date.parse('2026-07-01T12:00:00.000Z'), 1)
        .run()
      const r = await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
      expect(r.recorded).toBe(1) // previously 0 — the ref was silently skipped
      const rows = await decisions()
      expect(rows.length).toBe(1)
      expect(rows[0].tier).not.toBe('auto') // leave/confirm-grade only, never a silent auto
      expect(JSON.parse(rows[0].signals_json).timeAnchorSuspect).toBe(true)
    })

    it('item 1(a): a created-at-only ref OUTSIDE the trip window is still skipped (abstain, not a guess)', async () => {
      await seedTrip() // day 2026-07-01
      await env.DB.prepare(
        'INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, photo_r2_keys_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
      )
        .bind('m1', 't1', 'jonathan', 'shared', 'photo', JSON.stringify([{ key: 'k1' }]), Date.parse('2026-09-15T12:00:00.000Z'), 1)
        .run()
      const r = await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
      expect(r.recorded).toBe(0) // outside the trip's day window — abstains exactly like the old skip
    })

    it('item 3: a passenger (screenshot-like) ref rides the moment but withholds its GPS from anchoring', async () => {
      await seedTrip()
      await seedMemory({
        id: 'm1',
        refs: [
          // a real camera photo, reference-tier GPS — anchors the moment.
          { key: 'k1', capturedAt: '2026-07-01T10:05:00.000Z', offsetMinutes: 0, lat: 30.0, lng: -90.0, prov: { gps: 'exif' }, srcName: 'IMG_0001.HEIC', meta: { make: 'Apple' } },
          // a screenshot re-encoded to jpeg: srcName survives as .PNG, no meta at
          // all (the sidecar ran, found nothing) — a passenger, 4 minutes later
          // (same burst), carrying its OWN (bogus) GPS that must NOT anchor.
          { key: 'k2', capturedAt: '2026-07-01T10:09:00.000Z', offsetMinutes: 0, lat: 41.0, lng: -71.0, prov: { gps: 'exif' }, srcName: 'IMG_0002.PNG' },
        ],
      })
      await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
      const rows = await decisions()
      expect(rows.length).toBe(1) // one moment — the passenger still RIDES it
      expect(JSON.parse(rows[0].memory_ids)).toEqual(['m1'])
      expect(rows[0].tier).toBe('auto') // k1 alone reference-anchors the moment
      expect(rows[0].place_id).toBe('s-a') // the museum — k1's own location, NOT k2's
      // exactly one reference-located member (k1) — k2's GPS never counted.
      expect(JSON.parse(rows[0].signals_json).referenceLocatedCount).toBe(1)
    })
  })
})
