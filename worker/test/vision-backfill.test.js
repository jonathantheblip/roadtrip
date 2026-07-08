// backfillVisionLabels against real test D1 with a stubbed API (label) + stub R2.
// Verifies the consent gate, the {name,labels,setting} write preserving other fields,
// idempotency, the visionFail sentinel, video-skip, the limit, and no updated_at bump.
import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import { backfillVisionLabels } from '../src/visionBackfill.js'

const V = { name: 'At the beach', labels: ['beach'], setting: 'outdoor' }
const stubAssets = { get: async (k) => (k ? { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } : null) }
const envOn = (over = {}) => ({ DB: env.DB, ASSETS: stubAssets, PHOTO_VISION_MODE: 'shadow', ANTHROPIC_API_KEY: 'test-key', ...over })
const label = async () => V

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

describe('backfillVisionLabels', () => {
  it('CONSENT GATE: mode unset/off → skipped, nothing sent, nothing written', async () => {
    await seedMem('m1', [{ key: 'k1' }])
    const s = await backfillVisionLabels({ DB: env.DB, ASSETS: stubAssets }, { label })
    expect(s.skipped).toBe('off')
    expect('vision' in (await memRow('m1')).refs[0]).toBe(false)
  })

  it('shadow: labels a photo ref, stores {name,labels,setting}, preserves other fields', async () => {
    await seedMem('m1', [{ key: 'k1', lat: 42, mime: 'image/jpeg' }])
    const s = await backfillVisionLabels(envOn(), { label })
    expect(s.labeled).toBe(1)
    expect(s.memsWritten).toBe(1)
    const ref = (await memRow('m1')).refs[0]
    expect(ref.vision).toEqual(V)
    expect(ref.lat).toBe(42)
  })

  it('idempotent — skips refs that already have vision or visionFail', async () => {
    await seedMem('m1', [{ key: 'k1', vision: V }, { key: 'k2', visionFail: true }])
    const s = await backfillVisionLabels(envOn(), { label })
    expect(s.alreadyHad).toBe(2)
    expect(s.labeled).toBe(0)
  })

  it('a null label (reply with no usable name) stamps a reversible visionFail sentinel', async () => {
    await seedMem('m1', [{ key: 'k1' }])
    const s = await backfillVisionLabels(envOn(), { label: async () => null })
    expect(s.failed).toBe(1)
    expect((await memRow('m1')).refs[0].visionFail).toBe(true)
  })

  it('a RETRYABLE failure (API throw / overload) does NOT stamp visionFail — re-attempted next sweep', async () => {
    await seedMem('m1', [{ key: 'k1' }])
    const s = await backfillVisionLabels(envOn(), {
      label: async () => {
        throw new Error('vision-api 529')
      },
    })
    expect(s.retryable).toBe(1)
    expect(s.failed).toBe(0)
    const ref = (await memRow('m1')).refs[0]
    expect('visionFail' in ref).toBe(false)
    expect('vision' in ref).toBe(false)
  })

  it('no ANTHROPIC key → skipped, never calls the API', async () => {
    await seedMem('m1', [{ key: 'k1' }])
    const s = await backfillVisionLabels({ DB: env.DB, ASSETS: stubAssets, PHOTO_VISION_MODE: 'shadow' }, { label })
    expect(s.skipped).toBe('no-key')
  })

  it('skips videos (posterKey / video mime)', async () => {
    await seedMem('m1', [{ key: 'v.mp4', mime: 'video/mp4', posterKey: 'p' }])
    const s = await backfillVisionLabels(envOn(), { label })
    expect(s.photoRefs).toBe(0)
    expect(s.labeled).toBe(0)
  })

  it('respects the limit (bounded API spend)', async () => {
    await seedMem('m1', [{ key: 'k1' }])
    await seedMem('m2', [{ key: 'k2' }])
    await seedMem('m3', [{ key: 'k3' }])
    const s = await backfillVisionLabels(envOn(), { label, limit: 2 })
    expect(s.labeled).toBe(2)
    expect(s.hitLimit).toBe(true)
  })

  it('does not bump updated_at (no mass cross-device re-sync)', async () => {
    await seedMem('m1', [{ key: 'k1' }], 100)
    await backfillVisionLabels(envOn(), { label })
    expect((await memRow('m1')).updated_at).toBe(100)
  })
})
