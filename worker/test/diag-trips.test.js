// GET /diag/trips — the gated, read-only diagnostic window into the FULL trips
// table (including SOFT-DELETED rows), for reconciling trip inventory against
// what a device shows ("make sure you can see what I see"). It lives ABOVE the
// family-session auth gate and is protected by its OWN admin key
// (env.ADMIN_DIAGNOSTIC_KEY). These tests prove:
//   - with the right key: returns ALL trips incl. soft-deleted, metadata only
//   - wrong / missing key: 404 (invisible)
//   - key UNSET on the env: 404 (route doesn't exist until configured)
//   - it never leaks trip content (data_json / memories)
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'

const KEY = 'test-diag-key-0123456789'

async function seedTrip({ id, title, deletedAt = null, draft = false, updatedAt = 1000 }) {
  await env.DB.prepare(
    'INSERT INTO trips (id, title, date_range_start, date_range_end, data_json, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, title, '2026-06-19', '2026-06-21', JSON.stringify({ id, title, draft, secretNote: 'should NOT leak' }), updatedAt, deletedAt).run()
}

async function getDiag({ key, withKeyOnEnv = true } = {}) {
  const testEnv = withKeyOnEnv ? { ...env, ADMIN_DIAGNOSTIC_KEY: KEY } : { ...env }
  const headers = { Origin: 'http://localhost:5173' }
  if (key) headers.Authorization = `Bearer ${key}`
  const req = new Request('https://worker.test/diag/trips', { method: 'GET', headers })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, testEnv, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

describe('GET /diag/trips — gated diagnostic', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM trips').run()
    await seedTrip({ id: 'trip-live', title: 'Vermont — Juneteenth', updatedAt: 3000 })
    await seedTrip({ id: 'trip-draft', title: 'Provincetown draft', draft: true, updatedAt: 2000 })
    await seedTrip({ id: 'trip-deleted', title: 'A deleted trip', deletedAt: 1750000000000, updatedAt: 1000 })
  })

  it('with the right key, returns ALL trips including the soft-deleted one', async () => {
    const res = await getDiag({ key: KEY })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(3)
    const ids = body.trips.map((t) => t.id).sort()
    expect(ids).toEqual(['trip-deleted', 'trip-draft', 'trip-live'])
    const del = body.trips.find((t) => t.id === 'trip-deleted')
    expect(del.deletedAt).toBeTruthy() // the soft-delete is VISIBLE here (the whole point)
    const draft = body.trips.find((t) => t.id === 'trip-draft')
    expect(draft.draft).toBe(true)
    // newest-first by updated_at
    expect(body.trips[0].id).toBe('trip-live')
  })

  it('returns metadata ONLY — never trip content (data_json / secretNote)', async () => {
    const res = await getDiag({ key: KEY })
    const raw = await res.text()
    expect(raw).not.toContain('secretNote')
    expect(raw).not.toContain('data_json')
  })

  it('a WRONG key is 404 (route stays invisible)', async () => {
    const res = await getDiag({ key: 'wrong-key' })
    expect(res.status).toBe(404)
  })

  it('a MISSING Authorization header is 404', async () => {
    const res = await getDiag({})
    expect(res.status).toBe(404)
  })

  it('when ADMIN_DIAGNOSTIC_KEY is UNSET on the env, the route does not exist (404 even with a key)', async () => {
    const res = await getDiag({ key: KEY, withKeyOnEnv: false })
    expect(res.status).toBe(404)
  })
})
