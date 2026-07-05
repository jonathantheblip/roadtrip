// Trip-sync conflict guard — the worker half of F1 (self-healing-photos
// foundation batch A-1).
//
// Before this, postTrip's 409 guard was dead code twice over: no client ever
// sent baseUpdatedAt, AND getTrips never emitted the row stamp — so a
// pull-only device (Helen editing a trip Jonathan created, the normal case)
// had no base it could ever learn. Worse, the OCC read filtered
// `deleted_at IS NULL`, so for a tombstoned trip the guard was SKIPPED and a
// stale device's resync re-push silently RESURRECTED deleted trips via the
// upsert's `deleted_at = NULL`.
//
// NON-VACUOUS: against the old getTrips the serverUpdatedAt assertions fail
// (field never emitted); against the old OCC read the tombstone tests fail
// (200 + a revived row instead of 409 + a still-deleted one).

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

const TOKENS = { jonathan: 'tok-jonathan', helen: 'tok-helen' }

async function call(path, { method = 'GET', token = TOKENS.jonathan, body } = {}) {
  const headers = { Origin: 'http://localhost:5173' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const req = new Request('https://worker.test' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, { ...env, DB: env.DB }, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

function baseTrip(over = {}) {
  return {
    id: 'occ-cabin-week',
    title: 'Cabin week',
    dateRangeStart: '2026-08-01',
    dateRangeEnd: '2026-08-07',
    days: [{ n: 1, isoDate: '2026-08-01', stops: [] }],
    // An explicit hero keeps getTrips' background hero resolution fully inert
    // for this trip (hasExplicitHero short-circuits before any network).
    heroImage: 'https://example.test/hero.jpg',
    ...over,
  }
}

// Push and hand back the server-stamped updatedAt (the OCC base a client carries).
async function seedTrip(trip = baseTrip()) {
  const res = await call('/trips', { method: 'POST', body: trip })
  expect(res.status).toBe(200)
  const out = await res.json()
  expect(out.updatedAt).toBeGreaterThan(0)
  return out.updatedAt
}

function readRow(id) {
  return env.DB.prepare('SELECT data_json, updated_at, deleted_at FROM trips WHERE id = ?')
    .bind(id)
    .first()
}

describe('trip OCC — the stamp, the 409, and the tombstone resurrection guard', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await seedSession(env.DB, TOKENS.helen, 'helen')
    await env.DB.prepare('DELETE FROM trips').run()
  })

  it('getTrips emits the row stamp (serverUpdatedAt) matching the push response', async () => {
    const pushedStamp = await seedTrip()
    const res = await call('/trips')
    expect(res.status).toBe(200)
    const trips = await res.json()
    const t = trips.find((x) => x.id === 'occ-cabin-week')
    expect(t).toBeTruthy()
    // Same value + shape (epoch ms number) as the push response's updatedAt —
    // a pull-only device learns its base exactly like the pushing device did.
    expect(t.serverUpdatedAt).toBe(pushedStamp)
    const row = await readRow('occ-cabin-week')
    expect(t.serverUpdatedAt).toBe(Number(row.updated_at))
  })

  it('a stale copy embedded in data_json can never shadow the row stamp', async () => {
    // A mixed-fleet client could have persisted serverUpdatedAt INSIDE the trip
    // object before the worker learned to strip it; the pull must serve the
    // ROW's stamp regardless.
    await seedTrip(baseTrip({ serverUpdatedAt: 12345 }))
    const row = await readRow('occ-cabin-week')
    expect(JSON.parse(row.data_json).serverUpdatedAt).toBeUndefined() // stripped before data_json
    const trips = await (await call('/trips')).json()
    const t = trips.find((x) => x.id === 'occ-cabin-week')
    expect(t.serverUpdatedAt).toBe(Number(row.updated_at))
  })

  it('refuses a STALE based push with 409 + storedUpdatedAt and leaves the row unchanged', async () => {
    const stamp = await seedTrip()
    // Helen edits on the current base and lands — the row moves on.
    const helenTrip = baseTrip({ title: 'Cabin week — Helen reordered', baseUpdatedAt: stamp })
    const helenRes = await call('/trips', { method: 'POST', token: TOKENS.helen, body: helenTrip })
    expect(helenRes.status).toBe(200)
    const { updatedAt: helenStamp } = await helenRes.json()
    // Jonathan re-pushes his OLD copy against a base strictly older than the
    // stored stamp (the offline-resync shape). Derived arithmetically, not from
    // wall-clock ordering — two pushes can land in the same millisecond, and
    // base == stored deliberately passes (you're current). Same pattern as
    // memory-conflict-guard.test.js.
    const stale = baseTrip({ title: 'Cabin week — STALE copy', baseUpdatedAt: helenStamp - 1 })
    const staleRes = await call('/trips', { method: 'POST', body: stale })
    expect(staleRes.status).toBe(409)
    const conflict = await staleRes.json()
    expect(conflict).toMatchObject({ error: 'conflict', id: 'occ-cabin-week', storedUpdatedAt: helenStamp })
    // Helen's edit survives — the stale full-trip push clobbered nothing.
    const row = await readRow('occ-cabin-week')
    expect(JSON.parse(row.data_json).title).toBe('Cabin week — Helen reordered')
  })

  it('accepts a push based on the CURRENT stamp (the recovery retry shape)', async () => {
    const stamp = await seedTrip()
    const res = await call('/trips', {
      method: 'POST',
      body: baseTrip({ title: 'reapplied on fresh base', baseUpdatedAt: stamp }),
    })
    expect(res.status).toBe(200)
    const { updatedAt } = await res.json()
    expect(updatedAt).toBeGreaterThanOrEqual(stamp)
    const row = await readRow('occ-cabin-week')
    expect(JSON.parse(row.data_json).title).toBe('reapplied on fresh base')
  })

  it('409s a base-less push against a DELETED trip and does NOT resurrect it', async () => {
    await seedTrip()
    const del = await call('/trips/occ-cabin-week', { method: 'DELETE' })
    expect(del.status).toBe(200)
    // The stale-device resync shape: a full-trip re-push with NO base (old
    // client). Before the guard this revived the row via deleted_at = NULL.
    const res = await call('/trips', { method: 'POST', body: baseTrip({ title: 'zombie' }) })
    expect(res.status).toBe(409)
    const out = await res.json()
    expect(out).toMatchObject({ error: 'conflict', id: 'occ-cabin-week', deleted: true })
    expect(out.storedUpdatedAt).toBeGreaterThan(0)
    const row = await readRow('occ-cabin-week')
    expect(row.deleted_at).not.toBeNull() // still dead
    expect(JSON.parse(row.data_json).title).toBe('Cabin week') // and untouched
  })

  it('409s a BASED push against a deleted trip too (deleted wins over any base)', async () => {
    const stamp = await seedTrip()
    await call('/trips/occ-cabin-week', { method: 'DELETE' })
    const res = await call('/trips', {
      method: 'POST',
      body: baseTrip({ title: 'zombie', baseUpdatedAt: stamp }),
    })
    expect(res.status).toBe(409)
    expect((await res.json()).deleted).toBe(true)
    expect((await readRow('occ-cabin-week')).deleted_at).not.toBeNull()
  })

  it('a DRAFT row is withheld from the pull but PUBLISHES cleanly on the row-stamp base — absence means hidden here, not deleted', async () => {
    // Live trip set aside as a draft: draft:true rides in data_json (the push
    // is base-less by design — no pull can ever teach a draft a base), the row
    // survives with a bumped stamp…
    const liveStamp = await seedTrip()
    const draftRes = await call('/trips', { method: 'POST', body: baseTrip({ draft: true }) })
    expect(draftRes.status).toBe(200)
    const { updatedAt: draftStamp } = await draftRes.json()
    expect(draftStamp).toBeGreaterThanOrEqual(liveStamp)
    // …and is absent from every pull from here on.
    const pulled = await (await call('/trips')).json()
    expect(pulled.find((x) => x.id === 'occ-cabin-week')).toBeUndefined()
    // A publish on a PRE-draft base (derived arithmetically — same-ms pushes
    // are real, per the stale-push test above) is a plain stale-write
    // conflict: the 409 must carry the row stamp and never claim deleted:true
    // (that word is reserved for real tombstones; the client recovery adopts
    // a delete on it).
    const stale = await call('/trips', {
      method: 'POST',
      body: baseTrip({ title: 'Cabin week — published', baseUpdatedAt: draftStamp - 1 }),
    })
    expect(stale.status).toBe(409)
    const conflict = await stale.json()
    expect(conflict.deleted).toBeUndefined()
    expect(conflict.storedUpdatedAt).toBe(draftStamp)
    // The recovery retry: draft:false based on the stamp the 409 taught. The
    // worker must take it — this is the publish landing, not a resurrection.
    const pub = await call('/trips', {
      method: 'POST',
      body: baseTrip({ title: 'Cabin week — published', baseUpdatedAt: conflict.storedUpdatedAt }),
    })
    expect(pub.status).toBe(200)
    const { updatedAt: pubStamp } = await pub.json()
    const after = await (await call('/trips')).json()
    const t = after.find((x) => x.id === 'occ-cabin-week')
    expect(t).toBeTruthy() // served again — published
    expect(t.title).toBe('Cabin week — published')
    expect(t.serverUpdatedAt).toBe(pubStamp)
  })

  it('a deleted trip stays absent from the pull (no stamp to learn, nothing served)', async () => {
    await seedTrip()
    await call('/trips/occ-cabin-week', { method: 'DELETE' })
    const trips = await (await call('/trips')).json()
    expect(trips.find((x) => x.id === 'occ-cabin-week')).toBeUndefined()
  })

  it('a whole-trip masked stand-in does not leak the row stamp', async () => {
    // Jonathan plans a surprise hidden from Helen; her pull gets the stand-in.
    await seedTrip(baseTrip({
      id: 'occ-surprise',
      surprise: { author: 'jonathan', hideFrom: ['helen'], conceal: 'teaser' },
    }))
    const forHelen = await (await call('/trips', { token: TOKENS.helen })).json()
    const standIn = forHelen.find((x) => x.id === 'occ-surprise')
    expect(standIn).toBeTruthy()
    expect(standIn.masked).toBe(true)
    // The stand-in is built fresh: the real trip's edit-time must not ride out
    // on it (a stand-in is never pushed back, so it needs no base either).
    expect(standIn.serverUpdatedAt).toBeUndefined()
    // The author still gets the real trip WITH its stamp.
    const forJonathan = await (await call('/trips')).json()
    expect(forJonathan.find((x) => x.id === 'occ-surprise').serverUpdatedAt).toBeGreaterThan(0)
  })
})
