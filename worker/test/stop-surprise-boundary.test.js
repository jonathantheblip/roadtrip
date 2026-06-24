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
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await seedSession(env.DB, TOKENS.helen, 'helen')
    await seedSession(env.DB, TOKENS.rafa, 'rafa')
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
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await seedSession(env.DB, TOKENS.helen, 'helen')
    await seedSession(env.DB, TOKENS.rafa, 'rafa')
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
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await seedSession(env.DB, TOKENS.helen, 'helen')
    await seedSession(env.DB, TOKENS.rafa, 'rafa')
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
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await seedSession(env.DB, TOKENS.helen, 'helen')
    await seedSession(env.DB, TOKENS.rafa, 'rafa')
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

// ── "Surprises by sentence" Slice 1 — per-PART masking through the REAL worker ──
// A composite trip with a COVER surprise part hidden from Helen. The part AND the
// days inside its window must never reach her (GET /trips + the cron + POST merge).
const COMPOSITE = {
  id: 'tr-italy', title: 'Italy', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-07', heroResolved: { key: 'x' },
  parts: [
    { id: 'p-rome', type: 'city', title: 'Three days in Rome', place: 'Rome', dateStart: '2026-08-01', dateEnd: '2026-08-03' },
    {
      id: 'p-villa', type: 'stay', title: 'Secret cliffside villa', place: 'Positano', dateStart: '2026-08-05', dateEnd: '2026-08-06',
      surprise: { author: 'jonathan', hideFrom: ['helen'], conceal: 'cover', reveal: { type: 'manual' }, cover: { title: 'A few quiet days on the coast', loc: 'the coast' } },
    },
  ],
  days: [
    { isoDate: '2026-08-01', title: 'Rome', stops: [{ id: 'd1', name: 'Colosseum tour' }] },
    { isoDate: '2026-08-05', title: 'Villa', stops: [{ id: 'd2', name: 'Villa pool & cliff views' }] }, // SECRET window
  ],
}

describe('per-part masking (surprises by sentence) — through the real worker', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await seedSession(env.DB, TOKENS.helen, 'helen')
    await env.DB.prepare('DELETE FROM trips').run()
    await seedTrip(COMPOSITE)
  })

  it('the author sees the real part + its day', async () => {
    const t = (await tripsAs(TOKENS.jonathan)).find((x) => x.id === 'tr-italy')
    expect(t.parts.find((p) => p.id === 'p-villa').title).toBe('Secret cliffside villa')
    expect(t.days.find((d) => d.isoDate === '2026-08-05')).toBeTruthy()
  })

  it('a recipient gets the cover part — the secret part AND its day NEVER leak', async () => {
    const all = await tripsAs(TOKENS.helen)
    const t = all.find((x) => x.id === 'tr-italy')
    const villa = t.parts.find((p) => p.id === 'p-villa')
    expect(villa.title).toBe('A few quiet days on the coast') // the cover
    expect(villa.masked).toBe(true)
    expect(t.days).toHaveLength(1) // the secret-window day is stripped
    expect(t.days[0].isoDate).toBe('2026-08-01')
    const s = JSON.stringify(all)
    expect(s).not.toContain('Secret cliffside villa')
    expect(s).not.toContain('Villa pool') // the day's stop name is gone too
    expect(s).toContain('Three days in Rome') // visible part intact
  })

  it("Claude's context (trip open) never spoils the secret part for the recipient", async () => {
    const prompt = await buildClaudeSystemPrompt(env, { readerUserId: 'helen', tripId: 'tr-italy' })
    expect(prompt).not.toContain('Secret cliffside villa')
    expect(prompt).not.toContain('Villa pool')
    expect(prompt).toContain('Colosseum tour') // the visible day's stop is still there
    const forAuthor = await buildClaudeSystemPrompt(env, { readerUserId: 'jonathan', tripId: 'tr-italy' })
    expect(forAuthor).toContain('Villa pool') // author sees the real secret day
  })

  it("Claude's cross-trip SUMMARY never leaks the secret part or its day count (Finding 2)", async () => {
    const prompt = await buildClaudeSystemPrompt(env, { readerUserId: 'helen' }) // no tripId → summary mode
    expect(prompt).not.toContain('Secret cliffside villa')
    expect(prompt).not.toContain('Villa pool')
  })

  it('runScheduledStopReveals unwraps a date-reveal PART on its day', async () => {
    const dated = JSON.parse(JSON.stringify(COMPOSITE))
    dated.id = 'tr-italy-dated'
    dated.parts[1].surprise.reveal = { type: 'date', at: '2026-08-05' }
    await env.DB.prepare('DELETE FROM trips').run()
    await seedTrip(dated)
    // Before → masked + day stripped.
    expect((await tripsAs(TOKENS.helen)).find((x) => x.id === 'tr-italy-dated').days).toHaveLength(1)
    const onDay = await runScheduledStopReveals(env, '2026-08-05')
    expect(onDay.revealed).toBe(1)
    const t = (await tripsAs(TOKENS.helen)).find((x) => x.id === 'tr-italy-dated')
    expect(t.parts.find((p) => p.id === 'p-villa').title).toBe('Secret cliffside villa')
    expect(t.days).toHaveLength(2) // the day returns once revealed
  })

  it("a recipient's save does NOT erase the hidden part or its day", async () => {
    const helenCopy = (await tripsAs(TOKENS.helen)).find((x) => x.id === 'tr-italy')
    helenCopy.days[0].stops[0].name = 'Colosseum + Forum' // a legit edit to her visible day
    const res = await postTripAs(TOKENS.helen, helenCopy)
    expect(res.status).toBe(200)
    const t = (await tripsAs(TOKENS.jonathan)).find((x) => x.id === 'tr-italy')
    expect(t.parts.find((p) => p.id === 'p-villa').title).toBe('Secret cliffside villa') // NOT clobbered
    expect(t.days.find((d) => d.isoDate === '2026-08-05')?.stops[0].name).toBe('Villa pool & cliff views') // day restored
    expect(t.days.find((d) => d.isoDate === '2026-08-01')?.stops[0].name).toBe('Colosseum + Forum') // her edit kept
  })
})
