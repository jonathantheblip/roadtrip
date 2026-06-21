// The little book (WEAVE_SCOPE slice 3, part 2) — keep + book worker coverage.
//
// POST /weave/keep marks a (trip, day) weave kept (upserting on-demand weaves
// that have no nightly row); GET /weave/book returns the trip's SHARED book —
// every kept weave, oldest day first. NON-VACUOUS: keep specific titles, read
// them back ordered; assert un-kept rows are excluded and generated_at/kept_at
// semantics hold.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

const TOKEN = 'tok-jonathan'
const authEnv = () => ({ ...env, FAMILY_TOKEN_JONATHAN: TOKEN, ANTHROPIC_API_KEY: 'test-key' })

const PAGE = {
  tripId: 'bk-trip',
  dayIso: '2026-05-21',
  title: 'Kept Day Two',
  opening: 'Four roads met in one apartment.',
  closing: 'That was Friday.',
  stat: 'Day 2 · 3 stops',
  beats: [
    { who: 'jonathan', kind: 'text', snippet: 'wheels down' },
    { who: 'rafa', kind: 'voice', snippet: 'i want pizza' },
  ],
}

async function keep(body, { token = TOKEN } = {}) {
  const headers = { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const req = new Request('https://worker.test/weave/keep', { method: 'POST', headers, body: JSON.stringify(body) })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

async function getBook(qs, { token = TOKEN } = {}) {
  const headers = { Origin: 'http://localhost:5173' }
  if (token) headers.Authorization = `Bearer ${token}`
  const req = new Request(`https://worker.test/weave/book${qs}`, { method: 'GET', headers })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

async function rowKeptAt(id) {
  const { results } = await env.DB.prepare('SELECT generated_at, kept_at FROM weaves WHERE id = ?').bind(id).all()
  return results[0]
}

beforeEach(async () => {
  await applySchema(env.DB)
  await seedSession(env.DB, TOKEN, 'jonathan')
  await env.DB.prepare('DELETE FROM weaves').run()
})

describe('POST /weave/keep', () => {
  it('401 without a token', async () => {
    expect((await keep(PAGE, { token: null })).status).toBe(401)
  })

  it('400 when required fields are missing', async () => {
    expect((await keep({ tripId: 'bk-trip', dayIso: '2026-05-21' })).status).toBe(400)
  })

  it('persists an on-demand weave (no prior row) and marks it kept', async () => {
    const res = await keep(PAGE)
    expect(res.status).toBe(200)
    const row = await rowKeptAt('bk-trip::2026-05-21')
    expect(row.kept_at).toBeGreaterThan(0)
    expect(row.generated_at).toBeGreaterThan(0)
  })

  it('keeps an existing nightly row WITHOUT clobbering generated_at', async () => {
    // Pre-seed a nightly (un-kept) row with a fixed generated_at.
    await env.DB.prepare(
      `INSERT INTO weaves (id, trip_id, day_iso, title, opening, closing, stat, beats_json, beat_signature, generated_at, updated_at, kept_at)
       VALUES ('bk-trip::2026-05-21','bk-trip','2026-05-21','Nightly','o','c',NULL,NULL,NULL,1000,1000,NULL)`
    ).run()
    await keep(PAGE)
    const row = await rowKeptAt('bk-trip::2026-05-21')
    expect(row.generated_at).toBe(1000) // preserved
    expect(row.kept_at).toBeGreaterThan(0) // now kept
  })

  it('is idempotent — re-keeping preserves the original kept_at', async () => {
    await keep(PAGE)
    const first = (await rowKeptAt('bk-trip::2026-05-21')).kept_at
    await keep(PAGE) // Date.now() has advanced, but COALESCE keeps the first
    const second = (await rowKeptAt('bk-trip::2026-05-21')).kept_at
    expect(second).toBe(first)
  })
})

describe('GET /weave/book', () => {
  it('401 without a token', async () => {
    expect((await getBook('?trip_id=bk-trip', { token: null })).status).toBe(401)
  })

  it('400 without trip_id', async () => {
    expect((await getBook('')).status).toBe(400)
  })

  it('empty book when nothing is kept', async () => {
    const res = await getBook('?trip_id=bk-trip')
    expect(res.status).toBe(200)
    expect((await res.json()).pages).toEqual([])
  })

  it('returns kept pages oldest-first and EXCLUDES un-kept rows', async () => {
    // An un-kept nightly row that must NOT appear in the book.
    await env.DB.prepare(
      `INSERT INTO weaves (id, trip_id, day_iso, title, opening, closing, stat, beats_json, beat_signature, generated_at, updated_at, kept_at)
       VALUES ('bk-trip::2026-05-19','bk-trip','2026-05-19','Unkept','o','c',NULL,NULL,NULL,1000,1000,NULL)`
    ).run()
    // Keep day 2 then day 1 (out of order) — book must come back day-1-first.
    await keep(PAGE) // 2026-05-21
    await keep({ ...PAGE, dayIso: '2026-05-20', title: 'Kept Day One' })

    const res = await getBook('?trip_id=bk-trip')
    const { pages } = await res.json()
    expect(pages.map((p) => p.dayIso)).toEqual(['2026-05-20', '2026-05-21'])
    expect(pages[0].title).toBe('Kept Day One')
    expect(pages[1].title).toBe('Kept Day Two')
    expect(pages[1].stat).toBe('Day 2 · 3 stops')
  })
})
