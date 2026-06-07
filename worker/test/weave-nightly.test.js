// Nightly auto-weave (WEAVE_SCOPE slice 3) — worker coverage.
//
// Three layers:
//   1. Pure logic (selectWeaveDayServer / buildBeatsServer / weaveStatLine /
//      beatSignature) — no D1, no Anthropic.
//   2. runNightlyWeave against the REAL miniflare D1 with an INJECTED fake
//      narrator (no live Claude) — proves day-selection, beat-building, the
//      D1 upsert, and the unchanged-content skip.
//   3. GET /weave/latest through the worker — proves the client read path
//      (200 with the stored weave, 204 when none, 400/401 guards).
//
// NON-VACUOUS: the fake narrator returns SPECIFIC strings; the GET asserts
// them back, so a broken select/build/upsert/read chain fails the assertion.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import worker from '../src/index.js'
import {
  selectWeaveDayServer,
  buildBeatsServer,
  weaveStatLine,
  beatSignature,
  runNightlyWeave,
} from '../src/weaveGen.js'
import { applySchema } from './helpers/schema.js'

const TOKEN = 'tok-jonathan'
const authEnv = () => ({ ...env, FAMILY_TOKEN_JONATHAN: TOKEN, ANTHROPIC_API_KEY: 'test-key' })

// ── Seed fixtures ────────────────────────────────────────────────────────
const TRIP = {
  id: 'wv-trip',
  title: 'Weave Test Trip',
  dateRangeStart: '2026-05-20',
  dateRangeEnd: '2026-05-24',
  days: [
    { isoDate: '2026-05-20', stops: [{ id: 's1a' }, { id: 's1b' }] },
    { isoDate: '2026-05-21', stops: [{ id: 's2a' }, { id: 's2b' }, { id: 's2c' }] },
    { isoDate: '2026-05-22', stops: [{ id: 's3a' }] }, // intentionally memory-free
  ],
}

// Memories live ONLY on day 2 (s2a). Day 3 is empty, so a today >= day 3
// must fall back to day 2 — exercising "most recent PAST day WITH a memory".
const SHARED_MEMS = [
  { id: 'm1', stop_id: 's2a', author_traveler: 'jonathan', kind: 'text', text: 'Drove in from the coast at dusk' },
  { id: 'm2', stop_id: 's2a', author_traveler: 'helen', kind: 'photo', caption: 'the big bridge' },
  { id: 'm3', stop_id: 's2a', author_traveler: 'rafa', kind: 'voice', transcript: 'I want pizza' },
]

async function seed() {
  await env.DB.prepare(
    `INSERT INTO trips (id, title, date_range_start, date_range_end, end_city, data_json, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, NULL)`
  ).bind(TRIP.id, TRIP.title, TRIP.dateRangeStart, TRIP.dateRangeEnd, JSON.stringify(TRIP), 1).run()

  for (const m of SHARED_MEMS) {
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, kind, text, caption, transcript, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, 'shared', ?, ?, ?, ?, ?, ?, NULL)`
    ).bind(
      m.id, TRIP.id, m.stop_id, m.author_traveler, m.kind,
      m.text || null, m.caption || null, m.transcript || null, 1, 1
    ).run()
  }
}

const fakeNarrator = async ({ beatLines, stat }) => ({
  title: 'Woven Test Day',
  opening: `A day of ${beatLines.split('\n').filter(Boolean).length} voices. ${stat || ''}`.trim(),
  closing: 'That was the test.',
})

async function getLatest(qs, { token = TOKEN } = {}) {
  const headers = { Origin: 'http://localhost:5173' }
  if (token) headers.Authorization = `Bearer ${token}`
  const req = new Request(`https://worker.test/weave/latest${qs}`, { method: 'GET', headers })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

beforeEach(async () => {
  await applySchema(env.DB)
  // miniflare D1 storage persists across beforeEach within a file — clean
  // slate so each test's exact-row assertions are isolated.
  await env.DB.prepare('DELETE FROM weaves').run()
  await env.DB.prepare('DELETE FROM memories').run()
  await env.DB.prepare('DELETE FROM trips').run()
  await seed()
})
afterEach(() => vi.unstubAllGlobals())

// ── 1. Pure logic ────────────────────────────────────────────────────────
describe('weaveGen — pure logic', () => {
  const hasMem = (trip, day) => day.isoDate === '2026-05-21'

  it('selectWeaveDayServer picks the active trip\'s most recent past day with a memory', () => {
    const picked = selectWeaveDayServer([TRIP], hasMem, '2026-05-22')
    expect(picked?.day?.isoDate).toBe('2026-05-21')
  })

  it('selectWeaveDayServer honours the +4-day grace window', () => {
    expect(selectWeaveDayServer([TRIP], hasMem, '2026-05-27')?.day?.isoDate).toBe('2026-05-21')
    expect(selectWeaveDayServer([TRIP], hasMem, '2026-05-30')).toBe(null) // 6 days past end
  })

  it('selectWeaveDayServer returns null when no trip is active', () => {
    expect(selectWeaveDayServer([TRIP], hasMem, '2026-01-01')).toBe(null)
  })

  it('buildBeatsServer keeps one beat per author, preferring voice > photo > text', () => {
    const day = TRIP.days[1]
    const mems = [
      { stopId: 's2a', authorTraveler: 'jonathan', kind: 'text', text: 'a note' },
      { stopId: 's2a', authorTraveler: 'jonathan', kind: 'voice', transcript: 'a clip' },
      { stopId: 's2a', authorTraveler: 'helen', kind: 'photo', caption: 'a frame' },
    ]
    const beats = buildBeatsServer(day, mems)
    expect(beats).toHaveLength(2) // jonathan + helen
    const jb = beats.find((b) => b.who === 'jonathan')
    expect(jb.kind).toBe('voice') // voice beats text
    expect(jb.snippet).toBe('a clip')
  })

  it('weaveStatLine renders "Day N · K stops"', () => {
    expect(weaveStatLine(TRIP, TRIP.days[1])).toBe('Day 2 · 3 stops')
    expect(weaveStatLine(TRIP, TRIP.days[2])).toBe('Day 3 · 1 stop')
  })

  it('beatSignature is stable and order-independent', () => {
    const a = [{ who: 'helen', kind: 'photo', snippet: 'x' }, { who: 'rafa', kind: 'voice', snippet: 'y' }]
    const b = [{ who: 'rafa', kind: 'voice', snippet: 'y' }, { who: 'helen', kind: 'photo', snippet: 'x' }]
    expect(beatSignature(a)).toBe(beatSignature(b))
    const c = [{ who: 'helen', kind: 'photo', snippet: 'CHANGED' }, { who: 'rafa', kind: 'voice', snippet: 'y' }]
    expect(beatSignature(a)).not.toBe(beatSignature(c))
  })
})

// ── 2. runNightlyWeave against real D1 ────────────────────────────────────
describe('runNightlyWeave', () => {
  it('weaves the active trip\'s freshest day and stores it', async () => {
    const r = await runNightlyWeave(env, {
      nowMs: 1000, todayIso: '2026-05-22', generateNarrative: fakeNarrator,
    })
    expect(r.woven).toBe(true)
    expect(r.tripId).toBe('wv-trip')
    expect(r.dayIso).toBe('2026-05-21')
    expect(r.beats).toBe(3) // jonathan, helen, rafa

    const { results } = await env.DB.prepare('SELECT * FROM weaves WHERE id = ?')
      .bind('wv-trip::2026-05-21').all()
    expect(results[0].title).toBe('Woven Test Day')
    expect(results[0].stat).toBe('Day 2 · 3 stops')
    expect(results[0].generated_at).toBe(1000)
  })

  it('is idempotent — a second run with unchanged content skips (no Claude, no bump)', async () => {
    await runNightlyWeave(env, { nowMs: 1000, todayIso: '2026-05-22', generateNarrative: fakeNarrator })

    const narrator = vi.fn(fakeNarrator)
    const r2 = await runNightlyWeave(env, { nowMs: 9999, todayIso: '2026-05-22', generateNarrative: narrator })
    expect(r2.skipped).toBe('unchanged')
    expect(narrator).not.toHaveBeenCalled() // skipped BEFORE the Claude call

    const { results } = await env.DB.prepare('SELECT generated_at FROM weaves WHERE id = ?')
      .bind('wv-trip::2026-05-21').all()
    expect(results[0].generated_at).toBe(1000) // NOT bumped to 9999
  })

  it('re-weaves when a new memory changes the day\'s beats', async () => {
    await runNightlyWeave(env, { nowMs: 1000, todayIso: '2026-05-22', generateNarrative: fakeNarrator })
    // Aurelia adds a memory → beats change → signature changes → re-weave.
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, kind, text, created_at, updated_at, deleted_at)
       VALUES ('m4', 'wv-trip', 's2a', 'aurelia', 'shared', 'text', 'late arrival', 2, 2, NULL)`
    ).run()
    const r = await runNightlyWeave(env, { nowMs: 5000, todayIso: '2026-05-22', generateNarrative: fakeNarrator })
    expect(r.woven).toBe(true)
    expect(r.beats).toBe(4)

    const { results } = await env.DB.prepare('SELECT generated_at FROM weaves WHERE id = ?')
      .bind('wv-trip::2026-05-21').all()
    expect(results[0].generated_at).toBe(5000) // bumped
  })

  it('skips when no trip is active', async () => {
    const r = await runNightlyWeave(env, {
      nowMs: 1000, todayIso: '2026-08-01', generateNarrative: fakeNarrator,
    })
    expect(r.skipped).toBe('no-active-day')
  })
})

// ── 3. GET /weave/latest ──────────────────────────────────────────────────
describe('GET /weave/latest', () => {
  it('401 without a token', async () => {
    const res = await getLatest('?trip_id=wv-trip', { token: null })
    expect(res.status).toBe(401)
  })

  it('400 without trip_id', async () => {
    const res = await getLatest('')
    expect(res.status).toBe(400)
  })

  it('204 when no weave is stored yet', async () => {
    const res = await getLatest('?trip_id=wv-trip')
    expect(res.status).toBe(204)
  })

  it('returns the stored weave after a nightly run', async () => {
    await runNightlyWeave(env, { nowMs: 1000, todayIso: '2026-05-22', generateNarrative: fakeNarrator })
    const res = await getLatest('?trip_id=wv-trip')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.dayIso).toBe('2026-05-21')
    expect(data.title).toBe('Woven Test Day')
    expect(data.stat).toBe('Day 2 · 3 stops')
    expect(data.generatedAt).toBe(1000)
  })

  it('honours an explicit &day=', async () => {
    await runNightlyWeave(env, { nowMs: 1000, todayIso: '2026-05-22', generateNarrative: fakeNarrator })
    const hit = await getLatest('?trip_id=wv-trip&day=2026-05-21')
    expect(hit.status).toBe(200)
    const miss = await getLatest('?trip_id=wv-trip&day=2026-05-20')
    expect(miss.status).toBe(204) // no weave for day 1
  })
})

// ── Smoke: the scheduled handler is wired ─────────────────────────────────
describe('worker.scheduled', () => {
  it('exposes a scheduled() handler for the cron trigger', () => {
    expect(typeof worker.scheduled).toBe('function')
  })
})
