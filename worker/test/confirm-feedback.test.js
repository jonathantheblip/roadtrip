// confirmFeedback.js + POST /heal-confirm (S1 Stage 2a) — the confirm surface's
// WRITE path, against a REAL D1 binding through the real worker.fetch.
//
// NON-VACUOUS by construction: every check fails if the rule it guards is
// removed —
//   - ADULTS ONLY: a kid (rafa AND aurelia, both non-adults per auth.js) is 403,
//     never writes (remove the isAdult gate → a kid's confirm lands);
//   - identity is the SESSION, never the body (a body-supplied `by` is ignored →
//     by_traveler is the token's traveler; trust the body → identity spoof);
//   - mode 'off' is INERT: no row, no query — the load-bearing property that lets
//     the worker ship before migration 021 is applied;
//   - a 'corrected' must actually say something (a place or words) — an empty
//     correction can't teach a negative signal against nothing;
//   - a missing table degrades to no-table/[] (widen the swallow → a pre-migration
//     deploy 500s), mirroring presence/020's inertness.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'
import {
  photoConfirmMode, validateFeedback, writeHealFeedback, listHealFeedbackForTrip, stampConfirmedStops,
} from '../src/confirmFeedback.js'

const TOK = { jonathan: 'tok-jonathan', helen: 'tok-helen', aurelia: 'tok-aurelia', rafa: 'tok-rafa' }
const AT = 1_700_000_000_000

beforeEach(async () => {
  await applySchema(env.DB)
  for (const t of Object.keys(TOK)) await seedSession(env.DB, TOK[t], t)
  await env.DB.prepare('DELETE FROM memory_heal_feedback').run()
})

const rowsFor = (trip) =>
  env.DB.prepare('SELECT * FROM memory_heal_feedback WHERE trip_id = ? ORDER BY id').bind(trip).all().then((r) => r.results)

// ── the mode resolver ───────────────────────────────────────────────────────
describe('photoConfirmMode', () => {
  it('defaults off; only on/shadow are honored; case-insensitive', () => {
    expect(photoConfirmMode({})).toBe('off')
    expect(photoConfirmMode({ PHOTO_CONFIRM_MODE: 'nonsense' })).toBe('off')
    expect(photoConfirmMode({ PHOTO_CONFIRM_MODE: 'ON' })).toBe('on')
    expect(photoConfirmMode({ PHOTO_CONFIRM_MODE: 'Shadow' })).toBe('shadow')
  })
})

// ── the pure validator ──────────────────────────────────────────────────────
describe('validateFeedback', () => {
  const base = { action: 'confirmed', memoryIds: ['m1'] }
  it('accepts a well-formed confirm / pick / free-text / aside', () => {
    expect(validateFeedback(base).ok).toBe(true)
    expect(validateFeedback({ action: 'corrected', memoryIds: ['m1'], correctedPlaceId: 's2' }).ok).toBe(true)
    expect(validateFeedback({ action: 'corrected', memoryIds: ['m1'], words: 'the Canteen' }).ok).toBe(true)
    expect(validateFeedback({ action: 'aside', memoryIds: ['m1'] }).ok).toBe(true)
  })
  it('rejects a bad body / action / kind', () => {
    expect(validateFeedback(null).error).toBe('bad-body')
    expect(validateFeedback({ action: 'skip', memoryIds: ['m1'] }).error).toBe('bad-action')
    expect(validateFeedback({ ...base, kind: 'Z' }).error).toBe('bad-kind')
  })
  it('requires a non-empty moment identity', () => {
    expect(validateFeedback({ action: 'confirmed', memoryIds: [] }).error).toBe('no-memories')
    expect(validateFeedback({ action: 'confirmed', memoryIds: [1, 2] }).error).toBe('no-memories') // non-strings filtered
  })
  it('a corrected with neither a place nor words is rejected (nothing to teach)', () => {
    expect(validateFeedback({ action: 'corrected', memoryIds: ['m1'] }).error).toBe('empty-correction')
    expect(validateFeedback({ action: 'corrected', memoryIds: ['m1'], words: '   ' }).error).toBe('empty-correction')
  })
})

// ── the DB write/read helpers ───────────────────────────────────────────────
describe('writeHealFeedback / listHealFeedbackForTrip', () => {
  it('writes a confirm row with the SESSION traveler + snapshotted fields', async () => {
    const res = await writeHealFeedback(env, 't1', 'helen', {
      isoDate: '2026-07-02', memoryIds: ['m1', 'm2'], action: 'confirmed', kind: 'A',
      guessedPlaceId: 's-angel', guessedPlaceName: 'Angel Foods', by: 'jonathan', // body `by` must be ignored
    }, { now: AT })
    expect(res.ok).toBe(true)
    const [row] = await rowsFor('t1')
    expect(row).toMatchObject({
      iso_date: '2026-07-02', action: 'confirmed', kind: 'A',
      guessed_place_id: 's-angel', guessed_place_name: 'Angel Foods',
      by_traveler: 'helen', at: AT, corrected_place_id: null, words: null,
    })
    expect(JSON.parse(row.memory_ids)).toEqual(['m1', 'm2'])
  })

  it('writes a corrected(pick) and a corrected(free-text) row', async () => {
    await writeHealFeedback(env, 't1', 'jonathan', {
      memoryIds: ['m1'], action: 'corrected', guessedPlaceId: 's-angel',
      correctedPlaceId: 's-herring', correctedPlaceName: 'Herring Cove',
    }, { now: AT })
    await writeHealFeedback(env, 't1', 'jonathan', {
      memoryIds: ['m1'], action: 'corrected', words: "this whole thing was Aurelia's birthday",
    }, { now: AT + 1 })
    const rows = await rowsFor('t1')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ action: 'corrected', corrected_place_id: 's-herring', corrected_place_name: 'Herring Cove' })
    expect(rows[1]).toMatchObject({ action: 'corrected', words: "this whole thing was Aurelia's birthday", corrected_place_id: null })
  })

  it('an aside row is durable', async () => {
    await writeHealFeedback(env, 't1', 'jonathan', { memoryIds: ['m1'], action: 'aside' }, { now: AT })
    expect(await rowsFor('t1')).toHaveLength(1)
  })

  it('validation errors never write; no-trip is rejected', async () => {
    expect((await writeHealFeedback(env, '', 'jonathan', { memoryIds: ['m1'], action: 'confirmed' })).error).toBe('no-trip')
    expect((await writeHealFeedback(env, 't1', 'jonathan', { memoryIds: ['m1'], action: 'corrected' })).error).toBe('empty-correction')
    expect(await rowsFor('t1')).toHaveLength(0)
  })

  it('listHealFeedbackForTrip returns rows newest-first with memory_ids parsed', async () => {
    await writeHealFeedback(env, 't1', 'jonathan', { memoryIds: ['m1'], action: 'confirmed' }, { now: AT })
    await writeHealFeedback(env, 't1', 'helen', { memoryIds: ['m2', 'm3'], action: 'aside' }, { now: AT + 5 })
    const list = await listHealFeedbackForTrip(env, 't1')
    expect(list.map((r) => r.action)).toEqual(['aside', 'confirmed']) // DESC by at
    expect(list[0].memoryIds).toEqual(['m2', 'm3'])
  })

  it('INERT without migration 021: a missing table → no-table on write, [] on read (never throws)', async () => {
    await env.DB.prepare('DROP TABLE memory_heal_feedback').run()
    expect((await writeHealFeedback(env, 't1', 'jonathan', { memoryIds: ['m1'], action: 'confirmed' })).error).toBe('no-table')
    expect(await listHealFeedbackForTrip(env, 't1')).toEqual([])
  })
})

// ── the route (adults-only + mode gate + session identity) ──────────────────
describe('POST /heal-confirm', () => {
  async function call(token, body, envOverrides = {}) {
    const headers = { Origin: 'http://localhost:5173', 'content-type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const req = new Request('https://worker.test/heal-confirm', { method: 'POST', headers, body: JSON.stringify(body) })
    const ctx = createExecutionContext()
    // PHOTO_HEAL_MODE left off so the re-heal branch is skipped (this stage tests
    // the write + guards; 2b exercises the consumption).
    const res = await worker.fetch(req, { ...env, PHOTO_CONFIRM_MODE: 'shadow', ...envOverrides }, ctx)
    await waitOnExecutionContext(ctx)
    return res
  }
  const CONFIRM = { trip: 't1', isoDate: '2026-07-02', memoryIds: ['m1'], action: 'confirmed', kind: 'A' }

  it('an adult confirm writes a row and returns ok', async () => {
    const res = await call(TOK.jonathan, CONFIRM)
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    const rows = await rowsFor('t1')
    expect(rows).toHaveLength(1)
    expect(rows[0].by_traveler).toBe('jonathan')
  })

  it('the actor is the SESSION, never the body — a spoofed `by` is ignored', async () => {
    await call(TOK.helen, { ...CONFIRM, by: 'jonathan', by_traveler: 'jonathan' })
    expect((await rowsFor('t1'))[0].by_traveler).toBe('helen')
  })

  it('a KID is forbidden and writes nothing — rafa AND aurelia', async () => {
    for (const kid of [TOK.rafa, TOK.aurelia]) {
      const res = await call(kid, CONFIRM)
      expect(res.status).toBe(403)
    }
    expect(await rowsFor('t1')).toHaveLength(0)
  })

  it('mode off is inert: {disabled:true}, no row written', async () => {
    const res = await call(TOK.jonathan, CONFIRM, { PHOTO_CONFIRM_MODE: 'off' })
    expect(res.status).toBe(200)
    expect((await res.json()).disabled).toBe(true)
    expect(await rowsFor('t1')).toHaveLength(0)
  })

  it('a malformed correction is a 400, not a write', async () => {
    const res = await call(TOK.jonathan, { trip: 't1', memoryIds: ['m1'], action: 'corrected' })
    expect(res.status).toBe(400)
    expect(await rowsFor('t1')).toHaveLength(0)
  })
})

// The interactive card writes + LOCKS real filings (updateMemoryStop → postMemory,
// an always-live sync seam NOT gated on any heal knob), so the client renders it
// ONLY when GET /heal-decisions says confirm:true. The ledger itself serves in
// shadow for review — but the card must self-gate on PHOTO_CONFIRM_MODE === on,
// or a tap in the pre-flip window moves real photos (adversarial-review finding).
describe('GET /heal-decisions confirm gate', () => {
  async function confirmFlag(token, PHOTO_CONFIRM_MODE) {
    const req = new Request('https://worker.test/heal-decisions?trip=t1', {
      headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${token}` },
    })
    const ctx = createExecutionContext()
    // Ledger serves (PHOTO_HEAL_MODE shadow) — proving the card still self-gates.
    const res = await worker.fetch(req, { ...env, PHOTO_HEAL_MODE: 'shadow', PHOTO_CONFIRM_MODE }, ctx)
    await waitOnExecutionContext(ctx)
    return (await res.json()).confirm
  }
  it('confirm:true ONLY when the knob is on AND the viewer is an adult', async () => {
    expect(await confirmFlag(TOK.jonathan, 'on')).toBe(true)
    expect(await confirmFlag(TOK.jonathan, 'off')).toBe(false)
    expect(await confirmFlag(TOK.jonathan, 'shadow')).toBe(false) // shadow serves the ledger, not the card
    expect(await confirmFlag(TOK.rafa, 'on')).toBe(false)         // a kid never gets the surface
  })
})

// ── the server-authoritative 'confirmed' stamp (flip-blocker #1: the D13 lock) ──
describe('stampConfirmedStops — the D13 lock, server-side + race-free', () => {
  const TRIP = 't-stamp'
  beforeEach(() => env.DB.prepare('DELETE FROM memories WHERE trip_id = ?').bind(TRIP).run())
  const seedMem = (id, stopId, prov) =>
    env.DB.prepare(
      `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, photo_r2_keys_json, stop_prov_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(id, TRIP, stopId, 'jonathan', 'shared', '[]', prov ? JSON.stringify(prov) : null, AT, AT).run()
  const readMem = (id) =>
    env.DB.prepare('SELECT stop_id, stop_prov_json FROM memories WHERE id = ?').bind(id).first()
      .then((r) => ({ stopId: r?.stop_id, prov: r?.stop_prov_json ? JSON.parse(r.stop_prov_json) : null }))
  const body = (memoryIds, guessedPlaceId) => ({ action: 'confirmed', memoryIds, guessedPlaceId })

  it("stamps 'confirmed' over an 'auto' file at the SAME stop — the lock the re-heal race would otherwise drop", async () => {
    await seedMem('m1', 'stopA', { source: 'auto', by: 'matcher', at: AT })
    const r = await stampConfirmedStops(env, TRIP, body(['m1'], 'stopA'), 'jonathan', { now: AT + 1 })
    expect(r).toEqual({ stamped: 1, skipped: 0 })
    const m = await readMem('m1')
    expect(m.stopId).toBe('stopA')
    expect(m.prov.source).toBe('confirmed') // 'auto' upgraded to the human lock
    expect(m.prov.by).toBe('jonathan')
  })

  it('stamps an UNFILED memory (no prov) at the guessed stop', async () => {
    await seedMem('m2', null, null)
    const r = await stampConfirmedStops(env, TRIP, body(['m2'], 'stopB'), 'helen', { now: AT + 1 })
    expect(r.stamped).toBe(1)
    const m = await readMem('m2')
    expect(m.stopId).toBe('stopB')
    expect(m.prov.source).toBe('confirmed')
  })

  it("NEVER clobbers another member's MANUAL hand-file to a DIFFERENT stop (flip-blocker #2 safe default)", async () => {
    await seedMem('m3', 'stopHand', { source: 'manual', by: 'helen', at: AT })
    const r = await stampConfirmedStops(env, TRIP, body(['m3'], 'stopGuess'), 'jonathan', { now: AT + 1 })
    expect(r).toEqual({ stamped: 0, skipped: 1 })
    const m = await readMem('m3')
    expect(m.stopId).toBe('stopHand') // the hand-move stands
    expect(m.prov.source).toBe('manual')
    expect(m.prov.by).toBe('helen')
  })

  it('DOES upgrade a human file at the SAME stop (not a conflict — manual→confirmed)', async () => {
    await seedMem('m4', 'stopSame', { source: 'manual', by: 'helen', at: AT })
    const r = await stampConfirmedStops(env, TRIP, body(['m4'], 'stopSame'), 'jonathan', { now: AT + 1 })
    expect(r.stamped).toBe(1)
    expect((await readMem('m4')).prov.source).toBe('confirmed')
  })

  it('skips a nonexistent memory; a no-op body stamps nothing', async () => {
    expect(await stampConfirmedStops(env, TRIP, body(['ghost'], 'stopX'), 'jonathan')).toEqual({ stamped: 0, skipped: 1 })
    expect(await stampConfirmedStops(env, TRIP, body([], 'stopX'), 'jonathan')).toEqual({ stamped: 0, skipped: 0 })
    expect(await stampConfirmedStops(env, TRIP, body(['m'], ''), 'jonathan')).toEqual({ stamped: 0, skipped: 0 })
  })
})
