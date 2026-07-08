// backfillSceneSignatures against REAL test D1 with a stubbed decoder (computeSig) and
// a stub R2. Verifies it adds the scene sidecar preserving other ref fields, is
// idempotent, skips non-photo refs, honors dryRun + the decode limit, and NEVER bumps
// updated_at (so it can't trigger a mass cross-device re-sync) — all the SAFE-by-
// construction properties the archive-wide write relies on.
import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import { backfillSceneSignatures } from '../src/sceneBackfill.js'

const SIG = 'ff00ff00ff00ff00'
const stubAssets = { get: async (key) => (key ? { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } : null) }
const envWith = () => ({ DB: env.DB, ASSETS: stubAssets })
const compute = () => SIG

async function seedMem(id, refs, updated_at = 100) {
  await env.DB.prepare(
    'INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, photo_r2_keys_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
  )
    .bind(id, 't1', 'jonathan', 'shared', 'photo', JSON.stringify(refs), 1, updated_at)
    .run()
}
async function memRow(id) {
  const r = await env.DB.prepare('SELECT photo_r2_keys_json, updated_at FROM memories WHERE id=?').bind(id).first()
  return { refs: JSON.parse(r.photo_r2_keys_json), updated_at: r.updated_at }
}

beforeEach(async () => {
  await applySchema(env.DB)
  for (const t of ['memories', 'trips']) await env.DB.prepare(`DELETE FROM ${t}`).run()
})

describe('backfillSceneSignatures', () => {
  it('adds a scene signature to a photo ref, preserving every other field', async () => {
    await seedMem('m1', [{ key: 'k1', mime: 'image/jpeg', lat: 42, lng: -71, capturedAt: 'x' }])
    const s = await backfillSceneSignatures(envWith(), { computeSig: compute })
    expect(s.wrote).toBe(1)
    expect(s.memsWritten).toBe(1)
    const { refs } = await memRow('m1')
    expect(refs[0].scene).toBe(SIG)
    expect(refs[0].lat).toBe(42)
    expect(refs[0].key).toBe('k1')
    expect(refs[0].capturedAt).toBe('x')
  })

  it('is idempotent — a ref that already has scene is skipped, nothing rewritten', async () => {
    await seedMem('m1', [{ key: 'k1', scene: 'deadbeefdeadbeef' }])
    const s = await backfillSceneSignatures(envWith(), { computeSig: compute })
    expect(s.alreadyHad).toBe(1)
    expect(s.computed).toBe(0)
    expect(s.memsWritten).toBe(0)
    expect((await memRow('m1')).refs[0].scene).toBe('deadbeefdeadbeef')
  })

  it('skips non-photo refs (video / note / voice)', async () => {
    await seedMem('m1', [{ key: 'k1', kind: 'video' }, { key: 'k2', kind: 'note' }])
    const s = await backfillSceneSignatures(envWith(), { computeSig: compute })
    expect(s.photoRefs).toBe(0)
    expect(s.wrote).toBe(0)
  })

  it('dryRun computes coverage but writes nothing', async () => {
    await seedMem('m1', [{ key: 'k1' }])
    const s = await backfillSceneSignatures(envWith(), { computeSig: compute, dryRun: true })
    expect(s.wrote).toBe(1)
    expect(s.memsWritten).toBe(0)
    expect('scene' in (await memRow('m1')).refs[0]).toBe(false)
  })

  it('does NOT bump updated_at (so it never triggers a mass cross-device re-sync)', async () => {
    await seedMem('m1', [{ key: 'k1' }], 100)
    await backfillSceneSignatures(envWith(), { computeSig: compute })
    expect((await memRow('m1')).updated_at).toBe(100)
  })

  it('respects the decode limit and reports hitLimit (bounded, resumable)', async () => {
    await seedMem('m1', [{ key: 'k1' }])
    await seedMem('m2', [{ key: 'k2' }])
    await seedMem('m3', [{ key: 'k3' }])
    const s = await backfillSceneSignatures(envWith(), { computeSig: compute, limit: 2 })
    expect(s.computed).toBe(2)
    expect(s.hitLimit).toBe(true)
  })

  it('skips a VIDEO ref that has no kind (identified by posterKey / video mime)', async () => {
    await seedMem('m1', [
      { key: 'v1.mp4', mime: 'video/mp4', posterKey: 'p1' }, // single-video path: no kind
      { key: 'v2', mime: 'video/quicktime' },
    ])
    const s = await backfillSceneSignatures(envWith(), { computeSig: compute })
    expect(s.photoRefs).toBe(0) // neither is treated as a still
    expect(s.wrote).toBe(0)
  })

  it('a hard failure stamps a reversible sceneFail sentinel and is NOT retried next run', async () => {
    await seedMem('m1', [{ key: 'k1' }])
    const s1 = await backfillSceneSignatures(envWith(), { computeSig: () => null })
    expect(s1.failed).toBe(1)
    expect(s1.wrote).toBe(0)
    const after = (await memRow('m1')).refs[0]
    expect(after.sceneFail).toBe(true)
    expect('scene' in after).toBe(false)
    // second run must skip it — no re-fetch, no budget burned
    const s2 = await backfillSceneSignatures(envWith(), { computeSig: () => 'ff00ff00ff00ff00' })
    expect(s2.alreadyHad).toBe(1)
    expect(s2.computed).toBe(0)
  })
})
