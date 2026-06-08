// Slice 3b — whole-trip masking. GET /trips is the security boundary: a trip
// masked from the viewer is substituted with a believable stand-in BEFORE it
// leaves the worker, so the real title/itinerary never reach the recipient.
//
// NON-VACUOUS: the recipient-leak assertions search the FULL serialized trip
// list for the secret strings — without the server-side mask, they're right
// there and the recipient case goes red.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker, { runScheduledTripReveals, buildClaudeSystemPrompt } from '../src/index.js'
import { applySchema } from './helpers/schema.js'

const TOKENS = { jonathan: 'tok-j', helen: 'tok-h', rafa: 'tok-r' }
function authEnv() {
  return { ...env, FAMILY_TOKEN_JONATHAN: TOKENS.jonathan, FAMILY_TOKEN_HELEN: TOKENS.helen, FAMILY_TOKEN_RAFA: TOKENS.rafa }
}

async function tripsAs(token) {
  const req = new Request('https://worker.test/trips', { headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${token}` } })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  expect(res.status).toBe(200)
  return res.json()
}

// heroResolved.key set so getTrips' background hero-resolution skips it (keeps
// the test hermetic — no Places/network).
const SECRET = {
  id: 'tr-secret', title: 'Disney World surprise!', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-05',
  heroResolved: { key: 'x' },
  days: [{ isoDate: '2026-08-01', title: 'Magic Kingdom', stops: [{ id: 's', name: 'Cinderella Castle' }] }],
  surprise: { author: 'jonathan', hideFrom: ['rafa'], reveal: { type: 'manual' }, conceal: 'cover', cover: { title: 'Visiting Grandma', loc: "Grandma's house" } },
}

async function seedTrip(trip) {
  await env.DB.prepare(
    `INSERT INTO trips (id, title, date_range_start, date_range_end, end_city, data_json, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL, ?, 1000, NULL)`
  ).bind(trip.id, trip.title, trip.dateRangeStart, trip.dateRangeEnd, JSON.stringify(trip)).run()
}

describe('whole-trip masking (3b) — GET /trips is the boundary', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM trips').run()
    await seedTrip(SECRET)
  })

  it('GUARD: a masked trip-projection push is refused and never clobbers the real trip', async () => {
    // A recipient device pushing back the cover stand-in it received.
    const req = new Request('https://worker.test/trips', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${TOKENS.rafa}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'tr-secret', title: 'Visiting Grandma', masked: true, days: [] }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, authEnv(), ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).skipped).toBe('masked-projection')
    // The author's real trip is intact.
    const t = (await tripsAs(TOKENS.jonathan)).find((x) => x.id === 'tr-secret')
    expect(t.title).toBe('Disney World surprise!')
    expect(t.days.length).toBe(1)
  })

  it('the author sees the real trip in full', async () => {
    const t = (await tripsAs(TOKENS.jonathan)).find((x) => x.id === 'tr-secret')
    expect(t.title).toBe('Disney World surprise!')
    expect(t.days.length).toBe(1)
  })

  it('a non-targeted family member sees the real trip', async () => {
    const t = (await tripsAs(TOKENS.helen)).find((x) => x.id === 'tr-secret')
    expect(t.title).toBe('Disney World surprise!')
  })

  it('a recipient gets the cover stand-in — the real trip NEVER leaks', async () => {
    const all = await tripsAs(TOKENS.rafa)
    const t = all.find((x) => x.id === 'tr-secret')
    expect(t).toBeTruthy()
    expect(t.title).toBe('Visiting Grandma') // the cover
    expect(t.dateRangeStart).toBe('2026-08-01') // real dates kept (so they don't double-book)
    expect(t.days).toEqual([]) // no real itinerary
    expect(t.masked).toBe(true)
    expect(JSON.stringify(all)).not.toContain('Disney')
    expect(JSON.stringify(all)).not.toContain('Cinderella')
    expect(JSON.stringify(all)).not.toContain('Magic Kingdom')
  })

  it('once revealed, the recipient sees the real trip', async () => {
    await env.DB.prepare("UPDATE trips SET data_json = json_set(data_json, '$.surprise.revealed', '2026-08-01'), updated_at = 2000 WHERE id = 'tr-secret'").run()
    const t = (await tripsAs(TOKENS.rafa)).find((x) => x.id === 'tr-secret')
    expect(t.title).toBe('Disney World surprise!')
  })

  // ── Claude must not spoil a secret trip (the §6 red-team fix) ──────────────

  it("Claude's cross-trip summary for a recipient shows the cover, never the real trip", async () => {
    const prompt = await buildClaudeSystemPrompt(env, { readerUserId: 'rafa', tripId: null })
    expect(prompt).not.toContain('Disney')
    expect(prompt).not.toContain('Cinderella')
    expect(prompt).toContain('Visiting Grandma') // the cover stands in
  })

  it("Claude's context for a recipient with the (cover) trip open gets the cover, not the real trip", async () => {
    const prompt = await buildClaudeSystemPrompt(env, { readerUserId: 'rafa', tripId: 'tr-secret' })
    expect(prompt).not.toContain('Disney')
    expect(prompt).not.toContain('Cinderella')
    expect(prompt).not.toContain('Magic Kingdom')
  })

  it("Claude's context for the AUTHOR has the real trip", async () => {
    const prompt = await buildClaudeSystemPrompt(env, { readerUserId: 'jonathan', tripId: 'tr-secret' })
    expect(prompt).toContain('Disney World surprise!')
  })

  it('runScheduledTripReveals unwraps a date-reveal trip on its day; recipient then sees it real', async () => {
    // A date-reveal secret trip whose date is today.
    const dated = { ...SECRET, id: 'tr-dated', surprise: { author: 'jonathan', hideFrom: ['rafa'], reveal: { type: 'date', at: '2026-08-01' }, conceal: 'cover', cover: { title: 'Visiting Grandma' } } }
    await seedTrip(dated)
    // Before its day → still masked.
    expect((await tripsAs(TOKENS.rafa)).find((x) => x.id === 'tr-dated').title).toBe('Visiting Grandma')
    const early = await runScheduledTripReveals(env, '2026-07-01')
    expect(early.revealed).toBe(0)
    // On its day → the cron unwraps it.
    const onDay = await runScheduledTripReveals(env, '2026-08-01')
    expect(onDay.revealed).toBe(1)
    expect((await tripsAs(TOKENS.rafa)).find((x) => x.id === 'tr-dated').title).toBe('Disney World surprise!')
  })
})
