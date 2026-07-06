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
  regenerateStoredWeaves,
} from '../src/weaveGen.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

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
  // Bundled FAMILY_TOKEN_* auth is gone (013) — each token string must be a real
  // per-device session row to authenticate. tok-rafa is seeded so the adults-only
  // /weave/regenerate test reaches the 403 (child) check, not a 401 (unknown token).
  await seedSession(env.DB, TOKEN, 'jonathan')
  await seedSession(env.DB, 'tok-rafa', 'rafa')
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

  // "Surprises by sentence" Slice 1 — the shared weave must not narrate a day
  // inside an UNREVEALED surprise part's window (it would spoil the secret).
  const COMP = (revealed = false) => ({
    id: 'c', dateRangeStart: '2026-05-20', dateRangeEnd: '2026-05-24',
    parts: [
      { id: 'p1', type: 'city', dateStart: '2026-05-20', dateEnd: '2026-05-20' },
      {
        id: 'p2', type: 'stay', dateStart: '2026-05-21', dateEnd: '2026-05-22',
        surprise: { author: 'jonathan', hideFrom: ['helen'], conceal: 'cover', reveal: { type: 'manual' }, ...(revealed ? { revealed: 'x' } : {}) },
      },
    ],
    days: [{ isoDate: '2026-05-20', stops: [{ id: 'a' }] }, { isoDate: '2026-05-21', stops: [{ id: 'b' }] }],
  })

  it('selectWeaveDayServer skips a day inside an unrevealed surprise PART window', () => {
    // Freshest past day (05-21) is inside the secret window → excluded → falls back
    // to the visible 05-20. (hasMemAll so memory presence isn't the reason it's skipped.)
    expect(selectWeaveDayServer([COMP(false)], () => true, '2026-05-22')?.day?.isoDate).toBe('2026-05-20')
  })

  it('a REVEALED surprise part no longer hides its day from the weave', () => {
    expect(selectWeaveDayServer([COMP(true)], () => true, '2026-05-22')?.day?.isoDate).toBe('2026-05-21')
  })

  it('buildBeatsServer keeps one beat per author, preferring voice > photo > text', () => {
    const day = TRIP.days[1]
    const mems = [
      { stopId: 's2a', authorTraveler: 'jonathan', kind: 'text', text: 'a note' },
      { stopId: 's2a', authorTraveler: 'jonathan', kind: 'voice', transcript: 'a clip' },
      { stopId: 's2a', authorTraveler: 'helen', kind: 'photo', caption: 'a frame' },
    ]
    const beats = buildBeatsServer(TRIP, day, mems)
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

  it('excludes an UNREVEALED surprise from the weave (masking, 010); reveal lets it rejoin', async () => {
    // Aurelia hides a surprise on the woven day. Unrevealed → it must NOT spoil
    // the shared page → not a beat (so aurelia is NOT a 4th voice). Without the
    // weave's WHERE filter she would be, so this is non-vacuous.
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, kind, text, hide_from_json, conceal, surprise_json, created_at, updated_at, deleted_at)
       VALUES ('sp-w', 'wv-trip', 's2a', 'aurelia', 'shared', 'text', 'the real secret', ?, 'teaser', ?, 2, 2, NULL)`
    ).bind(JSON.stringify(['everyone']), JSON.stringify({ what: 'A memory', title: 'the real secret' })).run()
    const masked = await runNightlyWeave(env, { nowMs: 2000, todayIso: '2026-05-22', generateNarrative: fakeNarrator })
    expect(masked.beats).toBe(3) // jonathan/helen/rafa — aurelia's surprise excluded

    // Reveal it → it rejoins as a 4th voice.
    await env.DB.prepare(`UPDATE memories SET revealed_at = '2026-05-22T00:00:00Z', updated_at = 3 WHERE id = 'sp-w'`).run()
    const revealed = await runNightlyWeave(env, { nowMs: 3000, todayIso: '2026-05-22', generateNarrative: fakeNarrator })
    expect(revealed.beats).toBe(4)
  })

  it('never weaves an unrevealed SECRET TRIP (3b) — it would spoil via /weave/latest', async () => {
    await env.DB.prepare('DELETE FROM trips').run()
    await env.DB.prepare('DELETE FROM memories').run()
    const secret = {
      id: 'wv-secret', title: 'Secret getaway', dateRangeStart: '2026-05-20', dateRangeEnd: '2026-05-24',
      days: [{ isoDate: '2026-05-21', stops: [{ id: 'x' }] }],
      surprise: { author: 'jonathan', hideFrom: ['rafa'], reveal: { type: 'manual' }, conceal: 'cover' },
    }
    await env.DB.prepare(
      `INSERT INTO trips (id, title, date_range_start, date_range_end, end_city, data_json, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, NULL, ?, 1, NULL)`
    ).bind(secret.id, secret.title, secret.dateRangeStart, secret.dateRangeEnd, JSON.stringify(secret)).run()
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, kind, text, created_at, updated_at, deleted_at)
       VALUES ('sm', 'wv-secret', 'x', 'jonathan', 'shared', 'text', 'a secret moment', 1, 1, NULL)`
    ).run()
    // The secret trip is the only one + has a memory → WITHOUT the filter it would
    // weave. With it, there's nothing weavable.
    const r = await runNightlyWeave(env, { nowMs: 1000, todayIso: '2026-05-22', generateNarrative: fakeNarrator })
    expect(r.woven).not.toBe(true)
  })
})

// ── regenerateStoredWeaves: rewrite saved pages after a prompt fix ─────────
describe('regenerateStoredWeaves', () => {
  it('rewrites a stored narrative in place from its own beats, leaving beats + signature intact', async () => {
    await runNightlyWeave(env, { nowMs: 1000, todayIso: '2026-05-22', generateNarrative: fakeNarrator })
    const before = await env.DB.prepare(
      'SELECT title, beats_json, beat_signature FROM weaves WHERE id = ?'
    ).bind('wv-trip::2026-05-21').all()
    expect(before.results[0].title).toBe('Woven Test Day')

    // A "fixed prompt" narrator returns different wording for the same beats.
    const fixed = async ({ beatLines }) => ({
      title: 'A Bridge, A Drive, A Wish',
      opening: `Reframed from ${beatLines.split('\n').filter(Boolean).length} voices.`,
      closing: 'Quietly closed.',
    })
    const r = await regenerateStoredWeaves(env, { nowMs: 7777, generateNarrative: fixed })
    expect(r).toMatchObject({ total: 1, updated: 1, failed: 0 })

    const after = await env.DB.prepare(
      'SELECT title, beats_json, beat_signature, updated_at FROM weaves WHERE id = ?'
    ).bind('wv-trip::2026-05-21').all()
    expect(after.results[0].title).toBe('A Bridge, A Drive, A Wish') // narrative rewritten
    expect(after.results[0].beats_json).toBe(before.results[0].beats_json) // beats untouched
    expect(after.results[0].beat_signature).toBe(before.results[0].beat_signature) // signature intact
    expect(after.results[0].updated_at).toBe(7777)
  })

  it('regenerates EVERY stored page, not just an active trip\'s freshest day', async () => {
    await runNightlyWeave(env, { nowMs: 1000, todayIso: '2026-05-22', generateNarrative: fakeNarrator })
    // A second stored page on day 1 (a past/inactive day the nightly cron skips).
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, kind, text, created_at, updated_at, deleted_at)
       VALUES ('d1m', 'wv-trip', 's1a', 'jonathan', 'shared', 'text', 'day one note', 1, 1, NULL)`
    ).run()
    await runNightlyWeave(env, { nowMs: 1000, todayIso: '2026-05-20', generateNarrative: fakeNarrator })
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM weaves').all()
    expect(count.results[0].n).toBe(2)

    const r = await regenerateStoredWeaves(env, {
      nowMs: 8888,
      generateNarrative: async () => ({ title: 'REGEN', opening: 'o', closing: 'c' }),
    })
    expect(r).toMatchObject({ total: 2, updated: 2 })
    const titles = await env.DB.prepare('SELECT title FROM weaves').all()
    expect(titles.results.every((x) => x.title === 'REGEN')).toBe(true)
  })

  it('POST /weave/regenerate is adults-only (403 for a child token)', async () => {
    const childReq = new Request('https://worker.test/weave/regenerate', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173', Authorization: 'Bearer tok-rafa' },
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(childReq, { ...authEnv(), FAMILY_TOKEN_RAFA: 'tok-rafa' }, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(403)
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
