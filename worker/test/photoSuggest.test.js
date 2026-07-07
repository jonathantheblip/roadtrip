// Stage 0c — the SUGGESTION channel against REAL D1 (SPEC §5 D). Seeds a trip +
// memories that produce a near-miss SUGGESTION (a legacy null-prov photo filed to
// a real stop whose GPS says elsewhere → suggest, not move) and drives
// computeSuggestionsForViewer / recordDismissal through the three invariants:
// DARK-until-on, per-viewer visibility (no arithmetic leak), and synced
// family-wide dismissal.

import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import { computeSuggestionsForViewer, recordDismissal } from '../src/photoSuggest.js'

// A route trip: s-a (museum) + s-b (pier), well separated (unambiguous margin).
const TRIP = JSON.stringify({
  id: 't1', shape: 'route',
  days: [{
    n: 1, isoDate: '2026-07-01',
    stops: [
      { id: 's-a', title: 'The museum', time: '10:00 AM', lat: 30.0, lng: -90.0 },
      { id: 's-b', title: 'The pier', time: '2:00 PM', lat: 31.0, lng: -91.0 },
    ],
  }],
})

async function seedTrip(id = 't1') {
  await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?, ?, ?)').bind(id, TRIP, 200).run()
}

// A memory filed at `stopId` with one GPS photo at (lat,lng). Legacy (null prov)
// + a real current stop → 'legacy-suggest' → the engine SUGGESTS (never moves).
async function seedMemory({ id = 'm1', stopId = 's-a', lat = 31.0, lng = -91.0,
  author = 'jonathan', visibility = 'shared', prov = null, hideFrom = null, revealedAt = null }) {
  const photos = JSON.stringify([{ key: `${id}/p0`, lat, lng, capturedAt: '2026-07-01T15:00:00.000Z' }])
  await env.DB.prepare(
    `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, photo_r2_keys_json,
       stop_prov_json, hide_from_json, revealed_at, created_at, updated_at)
     VALUES (?, 't1', ?, ?, ?, ?, ?, ?, ?, 10, 50)`
  ).bind(id, stopId, author, visibility, photos, prov ? JSON.stringify(prov) : null,
    hideFrom ? JSON.stringify(hideFrom) : null, revealedAt).run()
}

const onEnv = { ...env, PHOTO_HEAL_MODE: 'on' }

beforeEach(async () => {
  await applySchema(env.DB)
  await env.DB.prepare('DELETE FROM memories').run()
  await env.DB.prepare('DELETE FROM memory_stop_moves').run()
  await env.DB.prepare('DELETE FROM memory_suggestion_dismissals').run()
  await env.DB.prepare('DELETE FROM trips').run()
})

describe('computeSuggestionsForViewer — the near-miss channel', () => {
  it('produces a suggestion for a legacy photo whose GPS says elsewhere', async () => {
    await seedTrip()
    await seedMemory({ id: 'm1', stopId: 's-a' }) // filed at museum; GPS at the pier
    const out = await computeSuggestionsForViewer(onEnv, 't1', 'jonathan')
    expect(out).toHaveLength(1)
    expect(out[0].memoryId).toBe('m1')
    expect(out[0].toStopId).toBe('s-b')
    expect(out[0].toLabel).toBe('The pier')   // labels snapshotted for display
    expect(out[0].fromLabel).toBe('The museum')
  })

  it('INVARIANT 1 — DARK until on: off + shadow surface NOTHING', async () => {
    await seedTrip()
    await seedMemory({ id: 'm1', stopId: 's-a' })
    expect(await computeSuggestionsForViewer({ ...env }, 't1', 'jonathan')).toEqual([]) // unset → off
    expect(await computeSuggestionsForViewer({ ...env, PHOTO_HEAL_MODE: 'shadow' }, 't1', 'jonathan')).toEqual([])
    expect(await computeSuggestionsForViewer(onEnv, 't1', 'jonathan')).toHaveLength(1) // on → surfaces
  })

  it('INVARIANT 2 — per-viewer: another person\'s PRIVATE memory never suggests to a viewer', async () => {
    await seedTrip()
    await seedMemory({ id: 'm-priv', stopId: 's-a', author: 'helen', visibility: 'private' })
    // Jonathan can't see Helen's private memory → no suggestion.
    expect(await computeSuggestionsForViewer(onEnv, 't1', 'jonathan')).toEqual([])
    // Helen (the author) does see her own.
    expect(await computeSuggestionsForViewer(onEnv, 't1', 'helen')).toHaveLength(1)
  })

  it('INVARIANT 2 — an UNREVEALED surprise memory suggests to NO ONE (no arithmetic leak)', async () => {
    await seedTrip()
    await seedMemory({ id: 'm-secret', stopId: 's-a', author: 'jonathan', hideFrom: ['helen'] })
    // Hidden from Helen AND not surfaced to the author either (engine gate 6) —
    // so the count can't leak the secret's shape to anyone.
    expect(await computeSuggestionsForViewer(onEnv, 't1', 'helen')).toEqual([])
    expect(await computeSuggestionsForViewer(onEnv, 't1', 'jonathan')).toEqual([])
    // Once revealed it is public → surfaces normally.
    await env.DB.prepare('UPDATE memories SET revealed_at = 123 WHERE id = ?').bind('m-secret').run()
    expect(await computeSuggestionsForViewer(onEnv, 't1', 'jonathan')).toHaveLength(1)
  })

  it('INVARIANT 3 — a dismissed (memory,to_stop) is quieted family-wide', async () => {
    await seedTrip()
    await seedMemory({ id: 'm1', stopId: 's-a' })
    expect(await computeSuggestionsForViewer(onEnv, 't1', 'jonathan')).toHaveLength(1)
    await recordDismissal(onEnv, 'm1', 's-b', 'helen')
    // Helen dismissed → quiet for EVERYONE, including Jonathan.
    expect(await computeSuggestionsForViewer(onEnv, 't1', 'jonathan')).toEqual([])
    expect(await computeSuggestionsForViewer(onEnv, 't1', 'helen')).toEqual([])
    // A dismissal of a DIFFERENT target does not quiet this one.
    await env.DB.prepare('DELETE FROM memory_suggestion_dismissals').run()
    await recordDismissal(onEnv, 'm1', 's-elsewhere', 'helen')
    expect(await computeSuggestionsForViewer(onEnv, 't1', 'jonathan')).toHaveLength(1)
  })

  it('a manual-locked memory produces NO suggestion (the lock stands)', async () => {
    await seedTrip()
    await seedMemory({ id: 'm1', stopId: 's-a', prov: { source: 'manual', by: 'helen' } })
    expect(await computeSuggestionsForViewer(onEnv, 't1', 'jonathan')).toEqual([])
  })

  it('no trip → []', async () => {
    expect(await computeSuggestionsForViewer(onEnv, 'nope', 'jonathan')).toEqual([])
  })
})

describe('recordDismissal — synced, idempotent', () => {
  it('INSERT OR IGNORE: a double-tap / racing device is one row', async () => {
    await recordDismissal(onEnv, 'm1', 's-b', 'jonathan')
    await recordDismissal(onEnv, 'm1', 's-b', 'helen') // racing second device — no-op
    const { results } = await env.DB.prepare(
      'SELECT memory_id, to_stop, dismissed_by FROM memory_suggestion_dismissals'
    ).all()
    expect(results).toHaveLength(1)
    expect(results[0].memory_id).toBe('m1')
    expect(results[0].to_stop).toBe('s-b')
    expect(results[0].dismissed_by).toBe('jonathan') // first writer's row stands
  })
})

describe('computeSuggestionsForViewer — surprise masking is UPSTREAM (review-major fix)', () => {
  // A composite trip: a PUBLIC part (day 1) + a part HIDDEN FROM HELEN (day 2)
  // whose stop is 'French Laundry'. A shared memory filed at the public museum
  // but whose photo GPS-matches the hidden stop → the engine suggests moving it
  // THERE. Helen must NEVER see that suggestion (its label would leak the secret
  // place's name); Jonathan (the surprise's author) does.
  const COMPOSITE = JSON.stringify({
    id: 'tc', shape: 'stay',
    parts: [
      { id: 'p1', dateStart: '2026-07-01', dateEnd: '2026-07-01' },
      { id: 'p2', dateStart: '2026-07-02', dateEnd: '2026-07-02', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
    ],
    days: [
      { n: 1, isoDate: '2026-07-01', stops: [{ id: 's-pub', title: 'The museum', time: '10:00 AM', lat: 30.0, lng: -90.0 }] },
      { n: 2, isoDate: '2026-07-02', stops: [{ id: 's-secret', title: 'French Laundry', time: '7:00 PM', lat: 31.0, lng: -91.0 }] },
    ],
  })
  async function seedCompositeMemory() {
    // Filed at the public museum; its photo is on day 2 at the hidden stop.
    const photos = JSON.stringify([{ key: 'mc/p0', lat: 31.0, lng: -91.0, capturedAt: '2026-07-02T19:00:00.000Z' }])
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, photo_r2_keys_json, stop_prov_json, created_at, updated_at)
       VALUES ('mc', 'tc', 's-pub', 'jonathan', 'shared', ?, NULL, 10, 50)`
    ).bind(photos).run()
  }

  it('a target stop inside a PART hidden from the viewer never surfaces to them (no name leak)', async () => {
    await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?, ?, ?)').bind('tc', COMPOSITE, 200).run()
    await seedCompositeMemory()
    // Jonathan (author) sees the suggestion → French Laundry.
    const forJ = await computeSuggestionsForViewer(onEnv, 'tc', 'jonathan')
    expect(forJ).toHaveLength(1)
    expect(forJ[0].toStopId).toBe('s-secret')
    expect(forJ[0].toLabel).toBe('French Laundry')
    // Helen — the surprise is hidden from her → NOTHING (the leak the review caught).
    const forH = await computeSuggestionsForViewer(onEnv, 'tc', 'helen')
    expect(forH).toEqual([])
  })

  it('a WHOLE-TRIP surprise hidden from the viewer surfaces nothing at all', async () => {
    const HIDDEN_TRIP = JSON.stringify({
      id: 'th', shape: 'route',
      surprise: { author: 'jonathan', hideFrom: ['helen'] },
      days: [{ n: 1, isoDate: '2026-07-01', stops: [
        { id: 's-a', title: 'The museum', time: '10:00 AM', lat: 30.0, lng: -90.0 },
        { id: 's-b', title: 'The pier', time: '2:00 PM', lat: 31.0, lng: -91.0 },
      ] }],
    })
    await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?, ?, ?)').bind('th', HIDDEN_TRIP, 200).run()
    const photos = JSON.stringify([{ key: 'mh/p0', lat: 31.0, lng: -91.0, capturedAt: '2026-07-01T15:00:00.000Z' }])
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, photo_r2_keys_json, stop_prov_json, created_at, updated_at)
       VALUES ('mh', 'th', 's-a', 'jonathan', 'shared', ?, NULL, 10, 50)`
    ).bind(photos).run()
    expect(await computeSuggestionsForViewer(onEnv, 'th', 'helen')).toEqual([]) // whole trip hidden from Helen
    expect(await computeSuggestionsForViewer(onEnv, 'th', 'jonathan')).toHaveLength(1) // author sees it
  })
})

describe('computeSuggestionsForViewer — a RECORD MOMENT on a hidden day cannot leak either (re-verify fix)', () => {
  it('a suggestion targeting a __record__ moment on a part-hidden day is dropped for the hidden viewer', async () => {
    const COMP_REC = JSON.stringify({
      id: 'tr', shape: 'stay',
      parts: [
        { id: 'p1', dateStart: '2026-07-01', dateEnd: '2026-07-01' },
        { id: 'p2', dateStart: '2026-07-02', dateEnd: '2026-07-02', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
      ],
      days: [
        { n: 1, isoDate: '2026-07-01', stops: [{ id: 's-pub', title: 'The museum', time: '10:00 AM', lat: 30.0, lng: -90.0 }] },
        { n: 2, isoDate: '2026-07-02',
          stops: [{ id: 's-sec', title: 'A stop', time: '7:00 PM', lat: 31.0, lng: -91.0 }],
          record: { state: 'kept', entries: [
            { id: 'ring', name: 'Ring shopping — Tiffany', lat: 32.0, lng: -92.0, span: { startMs: Date.parse('2026-07-02T16:00:00.000Z') } },
          ] } },
      ],
    })
    await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?, ?, ?)').bind('tr', COMP_REC, 200).run()
    // Shared memory filed at the public museum; its photo GPS-matches the hidden day's RECORD moment.
    const photos = JSON.stringify([{ key: 'mr/p0', lat: 32.0, lng: -92.0, capturedAt: '2026-07-02T16:05:00.000Z' }])
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, photo_r2_keys_json, stop_prov_json, created_at, updated_at)
       VALUES ('mr', 'tr', 's-pub', 'jonathan', 'shared', ?, NULL, 10, 50)`
    ).bind(photos).run()
    // Jonathan (author) sees the record moment; its date-scoped id resolves its name.
    const forJ = await computeSuggestionsForViewer(onEnv, 'tr', 'jonathan')
    expect(forJ).toHaveLength(1)
    expect(forJ[0].toStopId).toBe('__record__:2026-07-02:ring')
    expect(forJ[0].toLabel).toBe('Ring shopping — Tiffany')
    // Helen — the moment is on a part hidden from her → NOTHING (the residual leak, now closed).
    expect(await computeSuggestionsForViewer(onEnv, 'tr', 'helen')).toEqual([])
  })
})
