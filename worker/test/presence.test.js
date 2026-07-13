// "Who's around" (015) — the rules that must hold server-side, run against a
// REAL D1 binding through the real worker.fetch (like proposals/auth tests).
//
// NON-VACUOUS by construction: every check fails if the rule it guards is
// removed —
//   - whose presence = the SESSION traveler, never a body-supplied one (trust
//     the body → identity spoof);
//   - ★ a KID's exact GPS is NEVER stored: a non-adult's lat/lng are dropped at
//     write time, so the coordinates are literally absent from the DB (remove
//     the isAdult gate in sanitizePresence → rafa's coords land in the row, and
//     this fails on a direct column read);
//   - an ADULT's precise fix IS stored (the settled adults-precise model);
//   - latest-position-only: one row per (trip, traveler), overwritten (drop the
//     ON CONFLICT upsert → a second update inserts a duplicate / errors);
//   - a missing table degrades to [] for reads and 503 for writes (widen/remove
//     the swallow → a pre-migration deploy 500s);
//   - the cron purge removes ended-trip + stale rows (so location never lingers
//     past the trip — the settled auto-purge).

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'
import { listPresence, upsertPresence, runPresencePurge, sanitizePresence } from '../src/presence.js'

const TOK = { jonathan: 'tok-jonathan', helen: 'tok-helen', aurelia: 'tok-aurelia', rafa: 'tok-rafa' }

beforeEach(async () => {
  await applySchema(env.DB)
  for (const t of Object.keys(TOK)) await seedSession(env.DB, TOK[t], t)
  // Clean slate so lists are deterministic across the persistent store.
  await env.DB.prepare('DELETE FROM presence').run()
})

async function call(path, { method = 'GET', token, body } = {}) {
  const headers = { Origin: 'http://localhost:5173' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const req = new Request('https://worker.test' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

function post(token, body) {
  return call('/presence', { method: 'POST', token, body: { tripId: 'trip-1', ...body } })
}

async function listFor(trip = 'trip-1', token = TOK.jonathan) {
  return (await call(`/presence?tripId=${trip}`, { token })).json()
}

// Read the raw stored columns — the strongest proof that a kid's coordinates are
// truly absent, not merely hidden by the serializer.
function rawRow(traveler, trip = 'trip-1') {
  return env.DB.prepare('SELECT * FROM presence WHERE trip_id=? AND traveler=?').bind(trip, traveler).first()
}

describe('presence — identity is the session, never the body', () => {
  it('a member updates their own presence; whose = the SESSION, not the body', async () => {
    // Rafa updates but LIES in the body that this is jonathan's presence.
    const res = await post(TOK.rafa, { placeBucket: 'out', traveler: 'jonathan' })
    expect(res.status).toBe(200)
    const list = await listFor()
    expect(list).toHaveLength(1)
    expect(list[0].traveler).toBe('rafa') // the session, not the body's "jonathan"
    expect(list[0].placeBucket).toBe('out')
  })

  it('an unauthenticated request is rejected (401)', async () => {
    const res = await call('/presence?tripId=trip-1') // no token
    expect(res.status).toBe(401)
  })
})

describe('presence — ★ KID-COARSE: a child\'s exact GPS is NEVER stored', () => {
  it('rafa sends real coordinates → they are dropped; only the coarse bucket survives', async () => {
    const res = await post(TOK.rafa, { placeBucket: 'at_place', lat: 41.4943, lng: -72.0916, accuracy: 12 })
    expect(res.status).toBe(200)

    // Direct column read — the coordinates are literally absent from the DB.
    const row = await rawRow('rafa')
    expect(row.lat).toBeNull()
    expect(row.lng).toBeNull()
    expect(row.accuracy).toBeNull()
    expect(row.precise).toBe(0)
    expect(row.place_bucket).toBe('at_place')

    // And nothing precise leaks back out through the API, either.
    const list = await listFor()
    expect(list[0]).toMatchObject({ traveler: 'rafa', precise: false, lat: null, lng: null, placeBucket: 'at_place' })
  })

  it('aurelia (teen, also a non-adult) cannot store coordinates either', async () => {
    await post(TOK.aurelia, { placeBucket: 'out', lat: 40, lng: -70, accuracy: 5 })
    const row = await rawRow('aurelia')
    expect(row.lat).toBeNull()
    expect(row.lng).toBeNull()
    expect(row.precise).toBe(0)
  })

  it('the privacy gate is pure + direct: sanitizePresence drops a kid\'s coords', () => {
    const kid = sanitizePresence('rafa', { placeBucket: 'at_place', lat: 41.49, lng: -72.09, accuracy: 9 })
    expect(kid).toMatchObject({ precise: 0, lat: null, lng: null, accuracy: null, placeBucket: 'at_place' })
  })
})

describe('presence — ADULTS-PRECISE (the settled model)', () => {
  it('jonathan\'s precise fix IS stored', async () => {
    await post(TOK.jonathan, { placeBucket: 'at_place', lat: 41.4943, lng: -72.0916, accuracy: 14 })
    const row = await rawRow('jonathan')
    expect(row.precise).toBe(1)
    expect(Number(row.lat)).toBeCloseTo(41.4943, 4)
    expect(Number(row.lng)).toBeCloseTo(-72.0916, 4)
    expect(Number(row.accuracy)).toBe(14)
    const list = await listFor()
    expect(list[0]).toMatchObject({ traveler: 'jonathan', precise: true, placeBucket: 'at_place' })
  })

  it('an adult without a fix degrades to coarse (precise 0, no coords)', async () => {
    await post(TOK.helen, { placeBucket: 'out' }) // no lat/lng
    const row = await rawRow('helen')
    expect(row.precise).toBe(0)
    expect(row.lat).toBeNull()
    expect(row.place_bucket).toBe('out')
  })
})

describe('presence — latest-position-only (one row per person per trip)', () => {
  it('a second update overwrites the first (no history, no duplicate)', async () => {
    await post(TOK.jonathan, { placeBucket: 'out', lat: 40, lng: -70 })
    await post(TOK.jonathan, { placeBucket: 'at_place', lat: 41.5, lng: -72.1 })
    const list = await listFor()
    const mine = list.filter((p) => p.traveler === 'jonathan')
    expect(mine).toHaveLength(1) // overwritten, not appended
    expect(mine[0].placeBucket).toBe('at_place')
    expect(mine[0].lat).toBeCloseTo(41.5, 3)
  })

  it('lists only the asked trip; empty trip → []', async () => {
    await post(TOK.jonathan, { placeBucket: 'at_place' })
    await call('/presence', { method: 'POST', token: TOK.helen, body: { tripId: 'trip-2', placeBucket: 'out' } })
    const one = await listFor('trip-1')
    expect(one.map((p) => p.traveler)).toEqual(['jonathan'])
    const none = await listFor('trip-none')
    expect(none).toEqual([])
  })
})

describe('presence — manual status (note) + bucket normalization', () => {
  it('stores a manual status and caps its length; an unknown bucket → "unknown"', async () => {
    const long = 'x'.repeat(200)
    await post(TOK.helen, { placeBucket: 'nonsense', note: long })
    const row = await rawRow('helen')
    expect(row.place_bucket).toBe('unknown')
    expect(row.note.length).toBe(80) // NOTE_MAX
  })

  it('no note → null (the app then shows the auto bucket)', async () => {
    await post(TOK.jonathan, { placeBucket: 'at_place' })
    const row = await rawRow('jonathan')
    expect(row.note).toBeNull()
  })

  it('rejects an update with no tripId (400)', async () => {
    const res = await call('/presence', { method: 'POST', token: TOK.helen, body: { placeBucket: 'out' } })
    expect(res.status).toBe(400)
  })
})

describe('presence — auto-purge (location never lingers past the trip)', () => {
  async function seedTrip(id, endDate) {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO trips (id, date_range_end, data_json, updated_at) VALUES (?, ?, ?, ?)'
    ).bind(id, endDate, '{}', Date.now()).run()
  }

  it('drops presence for ENDED trips, keeps ACTIVE ones, and sweeps STALE rows', async () => {
    await seedTrip('trip-ended', '2026-06-10')   // before today → ended
    await seedTrip('trip-active', '2026-12-31')  // future → active
    await seedTrip('trip-staleonly', '2026-12-31') // active window, but its row is old

    const now = Date.now()
    // Fresh rows on the ended + active trips...
    await upsertPresence(env.DB, { traveler: 'jonathan', tripId: 'trip-ended', body: { placeBucket: 'at_place' }, now })
    await upsertPresence(env.DB, { traveler: 'helen', tripId: 'trip-active', body: { placeBucket: 'out' }, now })
    // ...and a STALE row on an active-window trip (100h old > 48h TTL).
    await upsertPresence(env.DB, { traveler: 'rafa', tripId: 'trip-staleonly', body: { placeBucket: 'out' }, now: now - 100 * 3600 * 1000 })

    const r = await runPresencePurge(env.DB, { todayIso: '2026-06-22', now })
    expect(r.purgedEnded).toBe(1)
    expect(r.purgedStale).toBe(1)

    expect(await listPresence(env.DB, 'trip-ended')).toEqual([])      // ended → gone
    expect(await listPresence(env.DB, 'trip-staleonly')).toEqual([])  // stale → gone
    const active = await listPresence(env.DB, 'trip-active')
    expect(active.map((p) => p.traveler)).toEqual(['helen'])          // active + fresh → kept
  })
})

describe('presence — pre-migration degrade (no 500 before 015 is applied)', () => {
  it('listPresence returns [] when the table is missing', async () => {
    const throwingDb = {
      prepare() {
        return { bind() { return { all() { throw new Error('D1_ERROR: no such table: presence') } } } }
      },
    }
    await expect(listPresence(throwingDb, 'trip-1')).resolves.toEqual([])
  })

  it('a NON-table D1 error still propagates (the swallow is narrow)', async () => {
    const throwingDb = {
      prepare() {
        return { bind() { return { all() { throw new Error('D1_ERROR: disk full') } } } }
      },
    }
    await expect(listPresence(throwingDb, 'trip-1')).rejects.toThrow(/disk full/)
  })

  it('runPresencePurge is a no-op (not a throw) when the table is missing', async () => {
    const throwingDb = {
      prepare() {
        return { bind() { return { run() { throw new Error('D1_ERROR: no such table: presence') } } } }
      },
    }
    await expect(runPresencePurge(throwingDb, { todayIso: '2026-06-22', now: Date.now() })).resolves.toEqual({
      purgedEnded: 0,
      purgedStale: 0,
      purgedTrail: 0,
    })
  })
})

// ── Build W5 (BUILD_PLAN_WITNESS_FLEET_2.md) — presence-trail SHADOW DISCIPLINE
// ────────────────────────────────────────────────────────────────────────────
// The load-bearing inertness property this build ships under: with
// PHOTO_PRESENCE_MODE unset (mode omitted from the call — every route this
// build's index.js touch preserves passes photoPresenceMode(env), which
// defaults 'off'), upsertPresence/runPresencePurge must query presence_trail
// ZERO times — proven here by NEVER seeding/creating the table at all and
// confirming a mode-less call still succeeds byte-identically (it would throw
// "no such table" the instant it tried to touch a table this file's
// beforeEach never creates).
describe('presence — W5 presence_trail: OFF writes zero crumbs anywhere', () => {
  it('a mode-less upsertPresence (every pre-W5 caller) never touches presence_trail', async () => {
    // No presence_trail table exists in this test DB at all (applySchema
    // creates it — see below; this describe block deliberately does NOT rely
    // on it existing, proving the omitted-mode path never queries it).
    await env.DB.prepare('DROP TABLE IF EXISTS presence_trail').run()
    const res = await upsertPresence(env.DB, {
      traveler: 'jonathan',
      tripId: 'trip-1',
      body: { placeBucket: 'at_place', lat: 41.49, lng: -72.09, accuracy: 10 },
      now: Date.now(),
    })
    expect(res.ok).toBe(true) // did NOT throw "no such table: presence_trail"
  })

  it('mode: "off" explicitly also writes zero crumbs', async () => {
    await env.DB.prepare('DROP TABLE IF EXISTS presence_trail').run()
    const res = await upsertPresence(env.DB, {
      traveler: 'jonathan',
      tripId: 'trip-1',
      body: { placeBucket: 'at_place', lat: 41.49, lng: -72.09, accuracy: 10 },
      now: Date.now(),
      mode: 'off',
    })
    expect(res.ok).toBe(true)
  })

  it('mode: "off" on runPresencePurge also never touches presence_trail', async () => {
    await env.DB.prepare('DROP TABLE IF EXISTS presence_trail').run()
    const r = await runPresencePurge(env.DB, { todayIso: '2026-06-22', now: Date.now() })
    expect(r.purgedTrail).toBe(0) // degraded/never-queried, not a throw
  })
})

describe('presence — W5 presence_trail: shadow/on APPEND a crumb (adults-precise only)', () => {
  beforeEach(async () => {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS presence_trail (
         id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT NOT NULL, traveler TEXT NOT NULL,
         lat REAL NOT NULL, lng REAL NOT NULL, accuracy REAL, at INTEGER NOT NULL
       )`
    ).run()
    await env.DB.prepare('DELETE FROM presence_trail').run()
  })

  it('mode:"on", an adult WITH a precise fix → a crumb is appended', async () => {
    const now = Date.now()
    await upsertPresence(env.DB, {
      traveler: 'jonathan', tripId: 'trip-1',
      body: { placeBucket: 'at_place', lat: 41.4943, lng: -72.0916, accuracy: 12 },
      now, mode: 'on',
    })
    const { results } = await env.DB.prepare('SELECT * FROM presence_trail WHERE trip_id=?').bind('trip-1').all()
    expect(results).toHaveLength(1)
    expect(results[0].traveler).toBe('jonathan')
    expect(Number(results[0].lat)).toBeCloseTo(41.4943, 4)
    expect(results[0].at).toBe(now)
  })

  it('mode:"shadow" ALSO appends (the ladder collects data before the witness may write)', async () => {
    await upsertPresence(env.DB, {
      traveler: 'helen', tripId: 'trip-1',
      body: { placeBucket: 'out', lat: 40.1, lng: -71.2, accuracy: 8 },
      now: Date.now(), mode: 'shadow',
    })
    const { results } = await env.DB.prepare('SELECT * FROM presence_trail WHERE trip_id=?').bind('trip-1').all()
    expect(results).toHaveLength(1)
  })

  it('mode:"on" but a KID sends real coordinates → the double gate still refuses; NO crumb', async () => {
    await upsertPresence(env.DB, {
      traveler: 'rafa', tripId: 'trip-1',
      body: { placeBucket: 'at_place', lat: 41.4943, lng: -72.0916, accuracy: 12 },
      now: Date.now(), mode: 'on',
    })
    const { results } = await env.DB.prepare('SELECT * FROM presence_trail').all()
    expect(results).toHaveLength(0) // sanitizePresence already dropped the kid's coords
  })

  it('mode:"on", an adult with NO fix (coarse-only) → no crumb (nothing precise to append)', async () => {
    await upsertPresence(env.DB, {
      traveler: 'jonathan', tripId: 'trip-1',
      body: { placeBucket: 'out' }, // no lat/lng
      now: Date.now(), mode: 'on',
    })
    const { results } = await env.DB.prepare('SELECT * FROM presence_trail').all()
    expect(results).toHaveLength(0)
  })

  it('repeated heartbeats APPEND, never overwrite (the opposite of the latest-only `presence` row)', async () => {
    const t0 = Date.now()
    await upsertPresence(env.DB, {
      traveler: 'jonathan', tripId: 'trip-1',
      body: { placeBucket: 'out', lat: 40, lng: -70, accuracy: 10 }, now: t0, mode: 'on',
    })
    await upsertPresence(env.DB, {
      traveler: 'jonathan', tripId: 'trip-1',
      body: { placeBucket: 'at_place', lat: 41.5, lng: -72.1, accuracy: 9 }, now: t0 + 60000, mode: 'on',
    })
    const { results } = await env.DB.prepare('SELECT * FROM presence_trail WHERE trip_id=?').bind('trip-1').all()
    expect(results).toHaveLength(2) // both crumbs kept, latest presence row still overwrites separately
  })

  it('a missing presence_trail table degrades to a silent no-op, never fails the live heartbeat', async () => {
    await env.DB.prepare('DROP TABLE presence_trail').run()
    const res = await upsertPresence(env.DB, {
      traveler: 'jonathan', tripId: 'trip-1',
      body: { placeBucket: 'at_place', lat: 41.49, lng: -72.09, accuracy: 10 },
      now: Date.now(), mode: 'on', // mode is ON but the table isn't there yet — must not 500
    })
    expect(res.ok).toBe(true)
    // The LIVE presence row still wrote fine — the missing trail table never
    // broke the feature that already works.
    const row = await env.DB.prepare('SELECT * FROM presence WHERE trip_id=? AND traveler=?').bind('trip-1', 'jonathan').first()
    expect(Number(row.lat)).toBeCloseTo(41.49, 3)
  })
})

describe('presence — W5 presence_trail: retention = trip + 14 days', () => {
  beforeEach(async () => {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS presence_trail (
         id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT NOT NULL, traveler TEXT NOT NULL,
         lat REAL NOT NULL, lng REAL NOT NULL, accuracy REAL, at INTEGER NOT NULL
       )`
    ).run()
    await env.DB.prepare('DELETE FROM presence_trail').run()
  })
  async function seedTrip(id, endDate) {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO trips (id, date_range_end, data_json, updated_at) VALUES (?, ?, ?, ?)'
    ).bind(id, endDate, '{}', Date.now()).run()
  }
  async function seedCrumb(tripId, traveler = 'jonathan') {
    await env.DB.prepare(
      'INSERT INTO presence_trail (trip_id, traveler, lat, lng, accuracy, at) VALUES (?,?,?,?,?,?)'
    ).bind(tripId, traveler, 41, -72, 10, Date.now()).run()
  }

  it('a trip that ended > 14 days ago → its crumbs are purged; a recently-ended trip keeps them', async () => {
    await seedTrip('trip-old', '2026-06-01')    // ended 21 days before "today" (2026-06-22)
    await seedTrip('trip-recent', '2026-06-15') // ended 7 days before "today" — inside the 14d window
    await seedCrumb('trip-old')
    await seedCrumb('trip-recent')

    const r = await runPresencePurge(env.DB, { todayIso: '2026-06-22', now: Date.now(), mode: 'on' })
    expect(r.purgedTrail).toBe(1)

    const old = await env.DB.prepare('SELECT * FROM presence_trail WHERE trip_id=?').bind('trip-old').all()
    expect(old.results).toHaveLength(0)
    const recent = await env.DB.prepare('SELECT * FROM presence_trail WHERE trip_id=?').bind('trip-recent').all()
    expect(recent.results).toHaveLength(1)
  })

  it('mode omitted → the trail sweep never runs (purgedTrail:0), even for a long-ended trip', async () => {
    await seedTrip('trip-old', '2026-06-01')
    await seedCrumb('trip-old')
    const r = await runPresencePurge(env.DB, { todayIso: '2026-06-22', now: Date.now() })
    expect(r.purgedTrail).toBe(0)
    const old = await env.DB.prepare('SELECT * FROM presence_trail WHERE trip_id=?').bind('trip-old').all()
    expect(old.results).toHaveLength(1) // untouched
  })
})
