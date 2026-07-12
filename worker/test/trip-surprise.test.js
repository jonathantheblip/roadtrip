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
import { seedSession } from './helpers/auth.js'

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
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await seedSession(env.DB, TOKENS.helen, 'helen')
    await seedSession(env.DB, TOKENS.rafa, 'rafa')
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

  // ── Worker-only cache strip (Build 4b/4c leak fix, 2026-07-12) ─────────────
  // recordHealDecisions caches placeNames + landmarkLookups (signage query →
  // resolved venue name + exact pin, harvested from RAW unmasked memories)
  // onto trip.data_json; maskTripForViewer spreads top-level keys through, so
  // without the strip they shipped to EVERY viewer on the ordinary pull —
  // including the person a venue's stop is hidden from (confirmed finding).

  it('worker caches (placeNames/landmarkLookups) never leave the worker — for ANY viewer, author included', async () => {
    const cached = {
      id: 'tr-cached', title: 'Cape stay', dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-05',
      heroResolved: { key: 'x' },
      days: [{ isoDate: '2026-07-02', stops: [
        { id: 's-secret', name: 'A-House', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
      ] }],
      placeNames: { '42.0500,-70.1888': 'Provincetown, Massachusetts' },
      landmarkLookups: { 'ATLANTIC HOUSE BAR 1798': { pin: { lat: 42.05, lng: -70.1888, name: 'A-House' } } },
    }
    await seedTrip(cached)
    for (const tok of [TOKENS.jonathan, TOKENS.helen, TOKENS.rafa]) {
      const all = await tripsAs(tok)
      const t = all.find((x) => x.id === 'tr-cached')
      expect(t).toBeTruthy()
      expect('placeNames' in t).toBe(false)
      expect('landmarkLookups' in t).toBe(false)
      expect(JSON.stringify(all)).not.toContain('ATLANTIC HOUSE')
    }
    // And the secret stop itself is still masked for helen (the strip composes
    // with, never replaces, the existing mask).
    const helenTrip = (await tripsAs(TOKENS.helen)).find((x) => x.id === 'tr-cached')
    expect(JSON.stringify(helenTrip)).not.toContain('A-House')
  })

  // ── W1's weatherDays cache inherits the same rule (BUILD_PLAN_WITNESS_FLEET_2.md
  // W1, weatherBackfill.js) — added to WORKER_ONLY_TRIP_KEYS in the SAME commit
  // that introduces the writer, per the ledger-consumer rule this leak fix
  // established.

  it('the weatherDays cache (W1) never leaves the worker either — for ANY viewer', async () => {
    const cached = {
      id: 'tr-weather', title: 'Cape stay', dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-05',
      heroResolved: { key: 'x' },
      days: [{ isoDate: '2026-07-02', stops: [
        { id: 's-secret', name: 'A-House', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
      ] }],
      weatherDays: { '2026-07-02': { '14': { precip: 0, code: 0 } } },
    }
    await seedTrip(cached)
    for (const tok of [TOKENS.jonathan, TOKENS.helen, TOKENS.rafa]) {
      const all = await tripsAs(tok)
      const t = all.find((x) => x.id === 'tr-weather')
      expect(t).toBeTruthy()
      expect('weatherDays' in t).toBe(false)
    }
  })

  it("Claude's context never carries the worker caches either", async () => {
    const cached = {
      id: 'tr-cached2', title: 'Cape stay 2', dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-05',
      heroResolved: { key: 'x' }, days: [],
      landmarkLookups: { 'SOME SECRET SIGN': { pin: { lat: 1, lng: 2, name: 'Secret Venue LLC' } } },
    }
    await seedTrip(cached)
    const prompt = await buildClaudeSystemPrompt(env, { readerUserId: 'jonathan', tripId: 'tr-cached2' })
    expect(prompt).not.toContain('Secret Venue LLC')
    expect(prompt).not.toContain('SOME SECRET SIGN')
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
