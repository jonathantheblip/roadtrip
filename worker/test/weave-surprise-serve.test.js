// Stale-weave SERVE guard (Surprises masking) — the security boundary for stored
// weaves. A `weaves` row is the family's SHARED day narrative; if it was woven/kept
// BEFORE that day's content became a surprise, the saved prose can still name the
// secret. GET /weave/latest and GET /weave/book must WITHHOLD a day's stored weave
// while that day is under an unrevealed surprise, then serve it again once revealed.
//
// NON-VACUOUS: every withheld case ALSO asserts the row physically exists in `weaves`
// (so 204/exclusion means "withheld", not "absent"), and the marker strings are right
// there in the stored narrative — drop the guard and the served/booked responses carry
// the secret and these go red.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

const TOKENS = { jonathan: 'tok-j', helen: 'tok-h', rafa: 'tok-r' }
const authEnv = () => ({ ...env })

async function seedTrip(trip) {
  await env.DB.prepare(
    `INSERT INTO trips (id, title, date_range_start, date_range_end, end_city, data_json, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL, ?, 1000, NULL)`
  ).bind(trip.id, trip.title, trip.dateRangeStart || null, trip.dateRangeEnd || null, JSON.stringify(trip)).run()
}

// A stored weave whose narrative literally names the secret (the leak we're guarding).
async function seedWeave({ tripId, dayIso, marker, kept = false }) {
  const id = `${tripId}::${dayIso}`
  await env.DB.prepare(
    `INSERT INTO weaves (id, trip_id, day_iso, title, opening, closing, stat, beats_json, beat_signature, generated_at, updated_at, kept_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 1000, 1000, ?)`
  ).bind(id, tripId, dayIso, `Title ${marker}`, `Opening mentions ${marker}.`, `Closing ${marker}.`, kept ? 2000 : null).run()
}

async function seedHiddenMemory({ tripId, stopId, marker, hideFrom = ['rafa'], revealedAt = null }) {
  await env.DB.prepare(
    `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, kind, text, created_at, updated_at, hide_from_json, revealed_at)
     VALUES (?, ?, ?, 'jonathan', 'shared', 'text', ?, 1000, 1000, ?, ?)`
  ).bind(`mem-${marker}`, tripId, stopId, `secret note ${marker}`, JSON.stringify(hideFrom), revealedAt).run()
}

async function weaveRowExists(id) {
  const { results } = await env.DB.prepare('SELECT id FROM weaves WHERE id = ?').bind(id).all()
  return (results || []).length === 1
}

async function getLatest(qs, token = TOKENS.rafa) {
  const req = new Request(`https://worker.test/weave/latest${qs}`, {
    headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${token}` },
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

async function getBook(qs, token = TOKENS.rafa) {
  const req = new Request(`https://worker.test/weave/book${qs}`, {
    headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${token}` },
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

beforeEach(async () => {
  await applySchema(env.DB)
  await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
  await seedSession(env.DB, TOKENS.helen, 'helen')
  await seedSession(env.DB, TOKENS.rafa, 'rafa')
  await env.DB.prepare('DELETE FROM weaves').run()
  await env.DB.prepare('DELETE FROM trips').run()
  await env.DB.prepare('DELETE FROM memories').run()
})

describe('stale-weave serve guard — GET /weave/latest', () => {
  it('WHOLE-TRIP surprise: the stored weave is withheld (204) from EVERYONE, incl. the author', async () => {
    await seedTrip({
      id: 'wt', title: 'Disney World surprise!', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-01',
      days: [{ isoDate: '2026-08-01', stops: [{ id: 's', name: 'Castle' }] }],
      surprise: { author: 'jonathan', hideFrom: ['rafa'], reveal: { type: 'manual' }, conceal: 'cover' },
    })
    await seedWeave({ tripId: 'wt', dayIso: '2026-08-01', marker: 'DISNEYSECRET' })

    expect(await weaveRowExists('wt::2026-08-01')).toBe(true) // the row IS there…
    expect((await getLatest('?trip_id=wt&day=2026-08-01', TOKENS.rafa)).status).toBe(204) // …but withheld from the hidden viewer
    expect((await getLatest('?trip_id=wt&day=2026-08-01', TOKENS.jonathan)).status).toBe(204) // …and globally (author too)
    expect((await getLatest('?trip_id=wt', TOKENS.rafa)).status).toBe(204) // latest-day request: all days secret → 204
  })

  it('PER-PART surprise: a hidden part\'s days are withheld; the latest request falls back to a non-secret day', async () => {
    // Part 0 (flight, 08-01..08-02) is normal; Part 1 (stay, 08-03..08-05) is the SECRET.
    await seedTrip({
      id: 'pt', title: 'A trip', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-05',
      parts: [
        { type: 'flight', title: 'BOS→X', dateStart: '2026-08-01', dateEnd: '2026-08-02' },
        { type: 'stay', title: 'Hotel', dateStart: '2026-08-03', dateEnd: '2026-08-05',
          surprise: { author: 'jonathan', hideFrom: ['rafa'], conceal: 'teaser' } },
      ],
      days: [
        { isoDate: '2026-08-02', stops: [{ id: 'a', name: 'Flight' }] },
        { isoDate: '2026-08-04', stops: [{ id: 'b', name: 'Pool' }] },
      ],
    })
    await seedWeave({ tripId: 'pt', dayIso: '2026-08-02', marker: 'FLIGHTOK' })
    await seedWeave({ tripId: 'pt', dayIso: '2026-08-04', marker: 'STAYSECRET' }) // the LATEST day, and secret

    // The secret day is withheld.
    expect((await getLatest('?trip_id=pt&day=2026-08-04')).status).toBe(204)
    expect(await weaveRowExists('pt::2026-08-04')).toBe(true)
    // The non-secret day still serves.
    const ok = await getLatest('?trip_id=pt&day=2026-08-02')
    expect(ok.status).toBe(200)
    expect(JSON.stringify(await ok.json())).toContain('FLIGHTOK')
    // The latest-day request SKIPS the secret 08-04 and returns the non-secret 08-02 —
    // never the secret one.
    const latest = await getLatest('?trip_id=pt')
    expect(latest.status).toBe(200)
    const body = JSON.stringify(await latest.json())
    expect(body).toContain('FLIGHTOK')
    expect(body).not.toContain('STAYSECRET')
  })

  it('PER-STOP surprise: the day carrying a hidden stop is withheld', async () => {
    await seedTrip({
      id: 'st', title: 'A trip', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-01',
      days: [{ isoDate: '2026-08-01', stops: [
        { id: 's1', name: 'Lunch' },
        { id: 's2', name: 'Dinner', surprise: { author: 'jonathan', hideFrom: ['rafa'], conceal: 'teaser' } },
      ] }],
    })
    await seedWeave({ tripId: 'st', dayIso: '2026-08-01', marker: 'DINNERSECRET' })
    expect(await weaveRowExists('st::2026-08-01')).toBe(true)
    expect((await getLatest('?trip_id=st&day=2026-08-01')).status).toBe(204)
  })

  it('PER-MEMORY surprise: a day with a hidden unrevealed memory is withheld (stale-row case)', async () => {
    await seedTrip({
      id: 'mt', title: 'A trip', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-01',
      days: [{ isoDate: '2026-08-01', stops: [{ id: 'mstop', name: 'Beach' }] }],
    })
    await seedWeave({ tripId: 'mt', dayIso: '2026-08-01', marker: 'MEMSECRET' }) // woven before the memory was hidden
    await seedHiddenMemory({ tripId: 'mt', stopId: 'mstop', marker: 'x' })
    expect(await weaveRowExists('mt::2026-08-01')).toBe(true)
    expect((await getLatest('?trip_id=mt&day=2026-08-01')).status).toBe(204)
  })

  it('REVEAL restores it: once the surprise is revealed, the stored weave serves again', async () => {
    await seedTrip({
      id: 'rv', title: 'A trip', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-01',
      days: [{ isoDate: '2026-08-01', stops: [
        { id: 's2', name: 'Dinner', surprise: { author: 'jonathan', hideFrom: ['rafa'], conceal: 'teaser', revealed: '2026-08-02' } },
      ] }],
    })
    await seedWeave({ tripId: 'rv', dayIso: '2026-08-01', marker: 'NOWREVEALED' })
    const res = await getLatest('?trip_id=rv&day=2026-08-01')
    expect(res.status).toBe(200)
    expect(JSON.stringify(await res.json())).toContain('NOWREVEALED')
  })

  it('REGRESSION: a plain non-surprise trip serves its stored weave normally', async () => {
    await seedTrip({
      id: 'plain', title: 'A trip', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-01',
      days: [{ isoDate: '2026-08-01', stops: [{ id: 's', name: 'Walk' }] }],
    })
    await seedWeave({ tripId: 'plain', dayIso: '2026-08-01', marker: 'NORMAL' })
    const res = await getLatest('?trip_id=plain&day=2026-08-01')
    expect(res.status).toBe(200)
    expect(JSON.stringify(await res.json())).toContain('NORMAL')
  })

  it('REGRESSION: a weave for a trip with NO trip row serves (orphan; nothing to mask)', async () => {
    await seedWeave({ tripId: 'orphan', dayIso: '2026-08-01', marker: 'ORPHAN' })
    const res = await getLatest('?trip_id=orphan&day=2026-08-01')
    expect(res.status).toBe(200)
    expect(JSON.stringify(await res.json())).toContain('ORPHAN')
  })
})

describe('stale-weave serve guard — GET /weave/book', () => {
  it('excludes a kept page whose day is under an unrevealed surprise; keeps the rest', async () => {
    await seedTrip({
      id: 'bk', title: 'A trip', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-02',
      days: [
        { isoDate: '2026-08-01', stops: [{ id: 'a', name: 'Lunch' }] },
        { isoDate: '2026-08-02', stops: [
          { id: 'b', name: 'Dinner', surprise: { author: 'jonathan', hideFrom: ['rafa'], conceal: 'teaser' } },
        ] },
      ],
    })
    await seedWeave({ tripId: 'bk', dayIso: '2026-08-01', marker: 'KEPTOK', kept: true })
    await seedWeave({ tripId: 'bk', dayIso: '2026-08-02', marker: 'KEPTSECRET', kept: true })

    const res = await getBook('?trip_id=bk')
    expect(res.status).toBe(200)
    const { pages } = await res.json()
    const body = JSON.stringify(pages)
    expect(pages.map((p) => p.dayIso)).toEqual(['2026-08-01']) // the secret day's page is gone
    expect(body).toContain('KEPTOK')
    expect(body).not.toContain('KEPTSECRET')
  })

  it('a whole-trip surprise empties the book entirely', async () => {
    await seedTrip({
      id: 'bkwt', title: 'Secret trip', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-01',
      days: [{ isoDate: '2026-08-01', stops: [{ id: 's', name: 'X' }] }],
      surprise: { author: 'jonathan', hideFrom: ['rafa'], reveal: { type: 'manual' }, conceal: 'cover' },
    })
    await seedWeave({ tripId: 'bkwt', dayIso: '2026-08-01', marker: 'BOOKSECRET', kept: true })
    const res = await getBook('?trip_id=bkwt')
    expect(res.status).toBe(200)
    expect((await res.json()).pages).toEqual([])
  })
})

// Red-team finding #1/#2: a `weaves` row is keyed by its own day_iso and is NEVER
// deleted, so it can OUTLIVE the trip.days that produced it (an edit removed/restructured
// the day or stop). Secrecy must be decided against the surprise LAYERS, not trip.days
// membership, or such a row escapes the guard. These would all serve the secret under
// the first (trip.days-bound) implementation.
describe('stale-weave serve guard — rows that outlive trip.days', () => {
  it('PER-PART: a hidden part withholds its DATE window even for a day_iso absent from trip.days', async () => {
    // Part 1 (stay, 08-03..08-05) is the SECRET. A weave row exists for 08-04 (in its
    // window) but the 08-04 day object is GONE from trip.days (removed in a later edit).
    await seedTrip({
      id: 'gap', title: 'A trip', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-05',
      parts: [
        { type: 'flight', title: 'BOS→X', dateStart: '2026-08-01', dateEnd: '2026-08-02' },
        { type: 'stay', title: 'Hotel', dateStart: '2026-08-03', dateEnd: '2026-08-05',
          surprise: { author: 'jonathan', hideFrom: ['rafa'], conceal: 'teaser' } },
      ],
      days: [{ isoDate: '2026-08-02', stops: [{ id: 'a', name: 'Flight' }] }], // NO 08-04 day object
    })
    await seedWeave({ tripId: 'gap', dayIso: '2026-08-04', marker: 'GAPSECRET' })
    expect(await weaveRowExists('gap::2026-08-04')).toBe(true)
    expect((await getLatest('?trip_id=gap&day=2026-08-04')).status).toBe(204) // withheld by date window
    // The latest (no-day) request must also never surface it.
    const latest = await getLatest('?trip_id=gap')
    expect(latest.status).toBe(204) // 08-04 is the only row and it's secret
  })

  it('PER-MEMORY: a hidden memory whose stop is GONE from trip.days withholds the whole trip (conservative)', async () => {
    await seedTrip({
      id: 'ghost', title: 'A trip', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-02',
      days: [{ isoDate: '2026-08-01', stops: [{ id: 'realstop', name: 'Beach' }] }],
    })
    await seedWeave({ tripId: 'ghost', dayIso: '2026-08-01', marker: 'GHOSTSECRET' })
    await seedWeave({ tripId: 'ghost', dayIso: '2026-08-02', marker: 'GHOSTOTHER' })
    // The hidden memory points at a stop that no longer exists in trip.days.
    await seedHiddenMemory({ tripId: 'ghost', stopId: 'deleted-stop', marker: 'g' })
    // Can't locate the day → withhold every stored weave for the trip.
    expect((await getLatest('?trip_id=ghost&day=2026-08-01')).status).toBe(204)
    expect((await getLatest('?trip_id=ghost&day=2026-08-02')).status).toBe(204)
    expect((await getLatest('?trip_id=ghost')).status).toBe(204)
    expect((await getBook('?trip_id=ghost')).status).toBe(200)
  })

  it('a NULL-stop hidden memory never leaks via a weave and does NOT over-mask', async () => {
    // A memory with no stop never enters a day's beats → it can't be in any weave, so it
    // must NOT trigger the conservative whole-trip withhold.
    await seedTrip({
      id: 'nullstop', title: 'A trip', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-01',
      days: [{ isoDate: '2026-08-01', stops: [{ id: 's', name: 'Walk' }] }],
    })
    await seedWeave({ tripId: 'nullstop', dayIso: '2026-08-01', marker: 'NULLSTOPOK' })
    await seedHiddenMemory({ tripId: 'nullstop', stopId: null, marker: 'n' })
    const res = await getLatest('?trip_id=nullstop&day=2026-08-01')
    expect(res.status).toBe(200)
    expect(JSON.stringify(await res.json())).toContain('NULLSTOPOK')
  })

  it('FAIL CLOSED: a present trip with UNPARSEABLE data_json withholds its stored weave', async () => {
    await env.DB.prepare(
      `INSERT INTO trips (id, title, date_range_start, date_range_end, end_city, data_json, updated_at, deleted_at)
       VALUES ('broken', 'A trip', '2026-08-01', '2026-08-01', NULL, '{not valid json', 1000, NULL)`
    ).run()
    await seedWeave({ tripId: 'broken', dayIso: '2026-08-01', marker: 'BROKENSECRET' })
    expect(await weaveRowExists('broken::2026-08-01')).toBe(true)
    expect((await getLatest('?trip_id=broken&day=2026-08-01')).status).toBe(204)
  })
})
