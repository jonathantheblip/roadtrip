// Slice 2 — per-stop masking, through the REAL worker + a REAL (miniflare) D1.
// GET /trips is the read boundary; POST /trips is the save-back boundary (the new
// clobber guard); buildClaudeSystemPrompt is the Claude boundary; the date cron is
// the auto-reveal. This is the §6 red-team: it proves a hidden stop never reaches
// the recipient or Claude, AND that a recipient's save can't erase it.
//
// NON-VACUOUS: the leak assertions search the FULL serialized trip list / prompt
// for the secret strings — without the server-side mask they're right there. The
// merge assertion fails loudly if the recipient's writeback drops the hidden stop.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker, { runScheduledStopReveals, buildClaudeSystemPrompt } from '../src/index.js'
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

async function postTripAs(token, trip) {
  const req = new Request('https://worker.test/trips', {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(trip),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

// A trip with ONE hidden stop (cover, hidden from rafa) on an otherwise-visible
// trip. heroResolved.key set so getTrips' background hero-resolution skips it.
const TRIP = {
  id: 'tr-vt', title: 'Vermont week', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-05',
  heroResolved: { key: 'x' },
  days: [
    {
      isoDate: '2026-08-02', title: 'Day 2', stops: [
        { id: 's-breakfast', name: 'Pancakes at the inn', kind: 'breakfast', time: '8:00 AM' },
        {
          id: 's-candy', name: "Mo's Candy Emporium", kind: 'browse', time: '3:00 PM', address: '12 Sweet St',
          surprise: {
            author: 'jonathan', hideFrom: ['rafa'], conceal: 'cover', reveal: { type: 'manual' },
            cover: { icon: '🌳', title: 'A nature walk', loc: 'the woods', time: '3:00 PM', weather: 'mild', packing: 'sneakers' },
          },
        },
      ],
    },
  ],
}

async function seedTrip(trip) {
  await env.DB.prepare(
    `INSERT INTO trips (id, title, date_range_start, date_range_end, end_city, data_json, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL, ?, 1000, NULL)`
  ).bind(trip.id, trip.title, trip.dateRangeStart, trip.dateRangeEnd, JSON.stringify(trip)).run()
}

describe('per-stop masking (Slice 2) — GET /trips is the read boundary', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM trips').run()
    await seedTrip(TRIP)
  })

  it('the author sees the real hidden stop in full', async () => {
    const t = (await tripsAs(TOKENS.jonathan)).find((x) => x.id === 'tr-vt')
    const candy = t.days[0].stops.find((s) => s.id === 's-candy')
    expect(candy.name).toBe("Mo's Candy Emporium")
    expect(candy.surprise.hideFrom).toEqual(['rafa'])
  })

  it('a non-targeted family member sees the real stop', async () => {
    const t = (await tripsAs(TOKENS.helen)).find((x) => x.id === 'tr-vt')
    expect(t.days[0].stops.find((s) => s.id === 's-candy').name).toBe("Mo's Candy Emporium")
  })

  it('a recipient gets the COVER stand-in — the real stop NEVER leaks', async () => {
    const all = await tripsAs(TOKENS.rafa)
    const t = all.find((x) => x.id === 'tr-vt')
    const candy = t.days[0].stops.find((s) => s.id === 's-candy')
    expect(candy.name).toBe('A nature walk') // the cover
    expect(candy.masked).toBe(true)
    expect(t.days[0].stops.find((s) => s.id === 's-breakfast').name).toBe('Pancakes at the inn') // others intact
    const s = JSON.stringify(all)
    expect(s).not.toContain('Candy')
    expect(s).not.toContain('Sweet St')
  })

  it('a recipient gets a SANITIZED teaser stub (no name / place / coords)', async () => {
    const teaser = {
      ...TRIP, id: 'tr-teaser',
      days: [{
        isoDate: '2026-08-02', title: 'Day 2', stops: [{
          id: 's-secret', name: 'The Big Reveal Spot', kind: 'browse', time: '5:00 PM', address: '9 Hidden Ln', lat: 44.1, lng: -72.5,
          surprise: { author: 'jonathan', hideFrom: ['rafa'], conceal: 'teaser', reveal: { type: 'arrival', at: 's-secret', label: 'The Big Reveal Spot', lat: 44.1, lng: -72.5 } },
        }],
      }],
    }
    await seedTrip(teaser)
    const all = await tripsAs(TOKENS.rafa)
    const t = all.find((x) => x.id === 'tr-teaser')
    const stub = t.days[0].stops.find((s) => s.id === 's-secret')
    expect(stub.name).toContain("Something's coming")
    expect(stub.time).toBe('5:00 PM') // time slot kept so the day reads in order
    const s = JSON.stringify(all)
    expect(s).not.toContain('Big Reveal')
    expect(s).not.toContain('Hidden Ln')
    expect(s).not.toContain('44.1') // arrival coords stripped
  })

  it('once revealed, the recipient sees the real stop', async () => {
    const revealed = JSON.parse(JSON.stringify(TRIP))
    revealed.id = 'tr-rev'
    revealed.days[0].stops[1].surprise.revealed = '2026-08-01T00:00:00Z'
    await seedTrip(revealed)
    const t = (await tripsAs(TOKENS.rafa)).find((x) => x.id === 'tr-rev')
    expect(t.days[0].stops.find((s) => s.id === 's-candy').name).toBe("Mo's Candy Emporium")
  })
})

describe('per-stop masking — Claude must not spoil a hidden stop', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM trips').run()
    await seedTrip(TRIP)
  })

  it("Claude's context for a recipient with the trip open shows the cover, never the real stop", async () => {
    const prompt = await buildClaudeSystemPrompt(env, { readerUserId: 'rafa', tripId: 'tr-vt' })
    expect(prompt).not.toContain('Candy')
    expect(prompt).not.toContain('Sweet St')
    expect(prompt).toContain('A nature walk') // the cover stands in
    expect(prompt).toContain('Pancakes at the inn') // the visible stop still there
  })

  it("Claude's context for the AUTHOR has the real hidden stop", async () => {
    const prompt = await buildClaudeSystemPrompt(env, { readerUserId: 'jonathan', tripId: 'tr-vt' })
    expect(prompt).toContain("Mo's Candy Emporium")
  })
})

describe('per-stop masking — POST /trips is the save-back boundary (clobber guard)', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM trips').run()
    await seedTrip(TRIP)
  })

  it("a recipient's save (with the stop as the cover) does NOT erase the hidden stop", async () => {
    // Rafa pulls → gets the cover stand-in → edits the trip (renames breakfast) → saves.
    const rafaCopy = (await tripsAs(TOKENS.rafa)).find((x) => x.id === 'tr-vt')
    rafaCopy.days[0].stops[0].name = 'Waffles at the inn' // a legit edit to a visible stop
    const res = await postTripAs(TOKENS.rafa, rafaCopy)
    expect(res.status).toBe(200)
    // The author re-reads: the real hidden stop SURVIVED, rafa's edit applied.
    const t = (await tripsAs(TOKENS.jonathan)).find((x) => x.id === 'tr-vt')
    const candy = t.days[0].stops.find((s) => s.id === 's-candy')
    expect(candy.name).toBe("Mo's Candy Emporium") // NOT clobbered
    expect(candy.surprise.hideFrom).toEqual(['rafa']) // masking intact
    expect(t.days[0].stops.find((s) => s.id === 's-breakfast').name).toBe('Waffles at the inn') // edit kept
  })

  it("a recipient deleting the whole day does NOT erase the hidden stop", async () => {
    const res = await postTripAs(TOKENS.rafa, { ...TRIP, days: [] })
    expect(res.status).toBe(200)
    const t = (await tripsAs(TOKENS.jonathan)).find((x) => x.id === 'tr-vt')
    const candy = t.days?.[0]?.stops?.find((s) => s.id === 's-candy')
    expect(candy?.name).toBe("Mo's Candy Emporium")
  })

  it('the AUTHOR can still reveal/edit/delete their own hidden stop freely', async () => {
    const mine = JSON.parse(JSON.stringify(TRIP))
    mine.days[0].stops[1].surprise.revealed = 'now' // author reveals it
    const res = await postTripAs(TOKENS.jonathan, mine)
    expect(res.status).toBe(200)
    const t = (await tripsAs(TOKENS.jonathan)).find((x) => x.id === 'tr-vt')
    expect(t.days[0].stops[1].surprise.revealed).toBe('now')
  })
})

describe('per-stop masking — date auto-reveal cron', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM trips').run()
  })

  it('runScheduledStopReveals unwraps a date-reveal stop on its day; recipient then sees it real', async () => {
    const dated = JSON.parse(JSON.stringify(TRIP))
    dated.id = 'tr-dated'
    dated.days[0].stops[1].surprise.reveal = { type: 'date', at: '2026-08-02' }
    await seedTrip(dated)
    // Before its day → still masked.
    expect((await tripsAs(TOKENS.rafa)).find((x) => x.id === 'tr-dated').days[0].stops[1].name).toBe('A nature walk')
    const early = await runScheduledStopReveals(env, '2026-07-01')
    expect(early.revealed).toBe(0)
    // On its day → the cron unwraps it.
    const onDay = await runScheduledStopReveals(env, '2026-08-02')
    expect(onDay.revealed).toBe(1)
    expect((await tripsAs(TOKENS.rafa)).find((x) => x.id === 'tr-dated').days[0].stops[1].name).toBe("Mo's Candy Emporium")
  })
})
