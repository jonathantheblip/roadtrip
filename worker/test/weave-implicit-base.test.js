// The server weave learns the implicit base (self-healing-photos SPEC §3 A-4).
//
// On a STAY — the settled core trip shape — footprint photos file to the
// per-day implicit-base id (`__trip_base__:<iso>`), which exists in NO
// day.stops list. Every server consumer that derived a day's ids from bare
// day.stops silently dropped those memories:
//   F3  — the nightly cron never saw a stay day as "having" a shared memory
//         (no story was EVER generated for a base-filed trip), and the
//         /weave/latest freshness signature could never match a base-filed day.
//   F8  — a NULL beat_signature row served as-is forever; now it CONVERGES
//         (serve the stored text once, backfill the current signature).
//   kept — a kept page is a PRINT (VISION §3, settled): served exactly as
//         stored, no freshness 204, ever.
// Plus the fourth bare-day.stops reader found in the same route:
// secretWeaveDaySet mapped a hidden memory's day via day.stops only, so a
// base-filed surprise blanked the WHOLE trip's stored weaves (ALL_SECRET)
// instead of withholding just its own day.
//
// Signatures in this file are HAND-WRITTEN ('who:kind:snippet', the
// beatSignature format) rather than computed through buildBeatsServer, so the
// assertions stay meaningful against either side of the fix.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { runNightlyWeave } from '../src/weaveGen.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

const TOKEN = 'tok-jonathan'

// A stay the implicit base lights up on: homeBase coords + a named lodging.
// Planned stops exist (the dinners) but carry no memories — the family's
// photos all filed to the per-day base id, the device-confirmed real shape.
const STAY = {
  id: 'stay-trip',
  title: 'Cabin Week',
  dateRangeStart: '2026-07-01',
  dateRangeEnd: '2026-07-04',
  homeBase: { lat: 43.24, lng: -72.9, label: '613 Forest Mountain Rd, Peru, VT' },
  lodging: { name: 'The cabin' },
  days: [
    { isoDate: '2026-07-01', stops: [{ id: 'din1', name: 'Dinner out' }] },
    { isoDate: '2026-07-02', stops: [{ id: 'din2', name: 'Pizza night' }] },
    { isoDate: '2026-07-03', stops: [] },
  ],
}
const BASE_D2 = '__trip_base__:2026-07-02'

async function seedTrip(trip) {
  await env.DB.prepare(
    `INSERT INTO trips (id, title, date_range_start, date_range_end, end_city, data_json, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL, ?, 1000, NULL)`
  ).bind(trip.id, trip.title, trip.dateRangeStart || null, trip.dateRangeEnd || null, JSON.stringify(trip)).run()
}

async function seedMemory({ id, tripId, stopId, author = 'jonathan', text, hideFrom = null }) {
  await env.DB.prepare(
    `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, kind, text, created_at, updated_at, hide_from_json)
     VALUES (?, ?, ?, ?, 'shared', 'text', ?, 1000, 1000, ?)`
  ).bind(id, tripId, stopId, author, text, hideFrom ? JSON.stringify(hideFrom) : null).run()
}

async function seedWeaveRow({ tripId, dayIso, marker, signature = null, keptAt = null }) {
  await env.DB.prepare(
    `INSERT INTO weaves (id, trip_id, day_iso, title, opening, closing, stat, beats_json, beat_signature, generated_at, updated_at, kept_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, 1000, 1000, ?)`
  ).bind(`${tripId}::${dayIso}`, tripId, dayIso, `Title ${marker}`, `Opening mentions ${marker}.`, `Closing ${marker}.`, signature, keptAt).run()
}

async function weaveRow(id) {
  const { results } = await env.DB.prepare('SELECT * FROM weaves WHERE id = ?').bind(id).all()
  return results?.[0] || null
}

const fakeNarrator = async ({ beatLines, stat }) => ({
  title: 'Woven Stay Day',
  opening: `A day of ${beatLines.split('\n').filter(Boolean).length} voices. ${stat || ''}`.trim(),
  closing: 'That was the cabin.',
})

async function getLatest(qs) {
  const req = new Request(`https://worker.test/weave/latest${qs}`, {
    headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${TOKEN}` },
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, { ...env }, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

beforeEach(async () => {
  await applySchema(env.DB)
  await seedSession(env.DB, TOKEN, 'jonathan')
  await env.DB.prepare('DELETE FROM weaves').run()
  await env.DB.prepare('DELETE FROM memories').run()
  await env.DB.prepare('DELETE FROM trips').run()
})

// ── F3: the nightly weave sees base-filed memories ─────────────────────────
describe('runNightlyWeave — stay trips with base-filed memories', () => {
  it('weaves a day whose ONLY memories are filed to the implicit-base id', async () => {
    await seedTrip(STAY)
    await seedMemory({ id: 'm1', tripId: STAY.id, stopId: BASE_D2, author: 'jonathan', text: 'porch coffee' })
    await seedMemory({ id: 'm2', tripId: STAY.id, stopId: BASE_D2, author: 'helen', text: 'kids in the creek' })

    const r = await runNightlyWeave(env, { nowMs: 5000, todayIso: '2026-07-03', generateNarrative: fakeNarrator })
    expect(r.woven).toBe(true)
    expect(r.dayIso).toBe('2026-07-02')
    expect(r.beats).toBe(2) // jonathan + helen — both base-filed

    const row = await weaveRow('stay-trip::2026-07-02')
    expect(row.title).toBe('Woven Stay Day')
    // The stored fingerprint covers the base-filed beats, so a later base-filed
    // change (not just a planned-stop one) re-weaves.
    expect(row.beat_signature).toBe('helen:text:kids in the creek|jonathan:text:porch coffee')
  })

  it('mixes planned-stop and base-filed memories into one day\'s beats', async () => {
    await seedTrip(STAY)
    await seedMemory({ id: 'm1', tripId: STAY.id, stopId: 'din2', author: 'jonathan', text: 'best pizza vote' })
    await seedMemory({ id: 'm2', tripId: STAY.id, stopId: BASE_D2, author: 'helen', text: 'hammock hour' })

    const r = await runNightlyWeave(env, { nowMs: 5000, todayIso: '2026-07-03', generateNarrative: fakeNarrator })
    expect(r.woven).toBe(true)
    expect(r.beats).toBe(2) // the base-filed voice counts alongside the planned-stop one
  })

  it('a base-filed memory on ANOTHER day never leaks into this day\'s beats (per-day ids)', async () => {
    await seedTrip(STAY)
    await seedMemory({ id: 'm1', tripId: STAY.id, stopId: BASE_D2, author: 'jonathan', text: 'porch coffee' })
    await seedMemory({ id: 'm2', tripId: STAY.id, stopId: '__trip_base__:2026-07-01', author: 'helen', text: 'arrival night' })

    const r = await runNightlyWeave(env, { nowMs: 5000, todayIso: '2026-07-03', generateNarrative: fakeNarrator })
    expect(r.dayIso).toBe('2026-07-02') // freshest day with a memory
    expect(r.beats).toBe(1) // helen's 07-01 base memory stays on 07-01
  })
})

// ── F3: /weave/latest freshness understands base-filed days ────────────────
describe('GET /weave/latest — freshness on base-filed days', () => {
  it('serves 200 when the stored signature matches the day\'s base-filed beats', async () => {
    await seedTrip(STAY)
    await seedMemory({ id: 'm1', tripId: STAY.id, stopId: BASE_D2, author: 'jonathan', text: 'porch coffee' })
    await seedWeaveRow({
      tripId: STAY.id, dayIso: '2026-07-02', marker: 'BASEFRESH',
      signature: 'jonathan:text:porch coffee',
    })
    const res = await getLatest(`?trip_id=${STAY.id}&day=2026-07-02`)
    expect(res.status).toBe(200)
    expect(JSON.stringify(await res.json())).toContain('BASEFRESH')
  })

  it('serves 204 when a NEW base-filed memory lands after the row was written', async () => {
    await seedTrip(STAY)
    await seedMemory({ id: 'm1', tripId: STAY.id, stopId: BASE_D2, author: 'jonathan', text: 'porch coffee' })
    await seedWeaveRow({
      tripId: STAY.id, dayIso: '2026-07-02', marker: 'BASESTALE',
      signature: 'jonathan:text:porch coffee',
    })
    await seedMemory({ id: 'm2', tripId: STAY.id, stopId: BASE_D2, author: 'helen', text: 'kids in the creek' })
    const res = await getLatest(`?trip_id=${STAY.id}&day=2026-07-02`)
    expect(res.status).toBe(204)
  })

  it('end-to-end: the nightly row for a base-filed day survives its own freshness check', async () => {
    await seedTrip(STAY)
    await seedMemory({ id: 'm1', tripId: STAY.id, stopId: BASE_D2, author: 'jonathan', text: 'porch coffee' })
    await runNightlyWeave(env, { nowMs: 5000, todayIso: '2026-07-03', generateNarrative: fakeNarrator })

    const res = await getLatest(`?trip_id=${STAY.id}&day=2026-07-02`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.title).toBe('Woven Stay Day')
  })
})

// ── F8-lite: NULL beat_signature rows converge instead of serving stale forever
describe('GET /weave/latest — NULL-signature backfill', () => {
  it('serves the stored narrative once, backfills the current signature onto the row', async () => {
    await seedTrip(STAY)
    await seedMemory({ id: 'm1', tripId: STAY.id, stopId: 'din2', author: 'jonathan', text: 'best pizza vote' })
    await seedWeaveRow({ tripId: STAY.id, dayIso: '2026-07-02', marker: 'NULLSIG', signature: null })

    const first = await getLatest(`?trip_id=${STAY.id}&day=2026-07-02`)
    expect(first.status).toBe(200) // stale-at-most-once: the stored text still serves
    expect(JSON.stringify(await first.json())).toContain('NULLSIG')

    const row = await weaveRow('stay-trip::2026-07-02')
    expect(row.beat_signature).toBe('jonathan:text:best pizza vote') // converged
  })

  it('after the backfill, the next real change trips the honest 204', async () => {
    await seedTrip(STAY)
    await seedMemory({ id: 'm1', tripId: STAY.id, stopId: 'din2', author: 'jonathan', text: 'best pizza vote' })
    await seedWeaveRow({ tripId: STAY.id, dayIso: '2026-07-02', marker: 'NULLSIG', signature: null })
    expect((await getLatest(`?trip_id=${STAY.id}&day=2026-07-02`)).status).toBe(200) // backfill read

    await seedMemory({ id: 'm2', tripId: STAY.id, stopId: 'din2', author: 'helen', text: 'a late add' })
    const second = await getLatest(`?trip_id=${STAY.id}&day=2026-07-02`)
    expect(second.status).toBe(204) // the row converged — stale no longer serves forever
  })

  it('an orphan row (no trip) still serves and is left alone — nothing to compare against', async () => {
    await seedWeaveRow({ tripId: 'orphan', dayIso: '2026-07-02', marker: 'ORPHANNULL', signature: null })
    const res = await getLatest('?trip_id=orphan&day=2026-07-02')
    expect(res.status).toBe(200)
    expect((await weaveRow('orphan::2026-07-02')).beat_signature).toBe(null)
  })

  it('a NULL-signature row whose day is GONE from trip.days serves and stays NULL (no backfill target)', async () => {
    // A weaves row can outlive the day that produced it (an edit restructures
    // trip.days; the row stays). With no current day to fingerprint, the row
    // serves as stored and keeps its NULL — never stamped with a bogus empty
    // signature it could later false-204 against.
    await seedTrip(STAY)
    await seedWeaveRow({ tripId: STAY.id, dayIso: '2026-06-30', marker: 'DAYGONE', signature: null })
    const res = await getLatest(`?trip_id=${STAY.id}&day=2026-06-30`)
    expect(res.status).toBe(200)
    expect(JSON.stringify(await res.json())).toContain('DAYGONE')
    expect((await weaveRow('stay-trip::2026-06-30')).beat_signature).toBe(null)
  })
})

// ── Kept rows are PRINTS (settled) ──────────────────────────────────────────
describe('GET /weave/latest — kept pages are prints', () => {
  it('serves a kept row as stored even when its signature no longer matches the day', async () => {
    await seedTrip(STAY)
    await seedMemory({ id: 'm1', tripId: STAY.id, stopId: 'din2', author: 'jonathan', text: 'best pizza vote' })
    await seedWeaveRow({
      tripId: STAY.id, dayIso: '2026-07-02', marker: 'KEPTPRINT',
      signature: 'helen:text:an older day entirely', keptAt: 2000,
    })
    const res = await getLatest(`?trip_id=${STAY.id}&day=2026-07-02`)
    expect(res.status).toBe(200) // no freshness 204 for a print
    expect(JSON.stringify(await res.json())).toContain('KEPTPRINT')
  })

  it('never backfills a signature onto a kept NULL-signature row (prints are never compared)', async () => {
    await seedTrip(STAY)
    await seedMemory({ id: 'm1', tripId: STAY.id, stopId: 'din2', author: 'jonathan', text: 'best pizza vote' })
    await seedWeaveRow({ tripId: STAY.id, dayIso: '2026-07-02', marker: 'KEPTNULL', signature: null, keptAt: 2000 })
    expect((await getLatest(`?trip_id=${STAY.id}&day=2026-07-02`)).status).toBe(200)
    expect((await weaveRow('stay-trip::2026-07-02')).beat_signature).toBe(null)
  })
})

// ── secretWeaveDaySet: a base-filed hidden memory maps to ITS day ───────────
describe('GET /weave/latest — base-filed surprise memories', () => {
  it('withholds only the hidden memory\'s own day, not the whole trip', async () => {
    await seedTrip(STAY)
    await seedWeaveRow({ tripId: STAY.id, dayIso: '2026-07-01', marker: 'PLAINDAY' })
    await seedWeaveRow({ tripId: STAY.id, dayIso: '2026-07-02', marker: 'SECRETDAY' })
    // An unrevealed surprise filed to day 2's implicit base — the id encodes
    // its day, so secrecy must land on 07-02 alone.
    await seedMemory({ id: 'sp1', tripId: STAY.id, stopId: BASE_D2, author: 'jonathan', text: 'the secret', hideFrom: ['helen'] })

    expect((await getLatest(`?trip_id=${STAY.id}&day=2026-07-02`)).status).toBe(204) // withheld
    const ok = await getLatest(`?trip_id=${STAY.id}&day=2026-07-01`)
    expect(ok.status).toBe(200) // the other day still serves
    expect(JSON.stringify(await ok.json())).toContain('PLAINDAY')
  })
})
