// backfillVisionLabels against real test D1 with a stubbed API (label) + stub R2.
// Verifies the consent gate, the {name,labels,setting} write preserving other fields,
// idempotency, the visionFail sentinel, video-skip, the limit, and no updated_at bump.
import { env } from 'cloudflare:test'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { applySchema } from './helpers/schema.js'
import { backfillVisionLabels } from '../src/visionBackfill.js'

// A fully-processed label — every backfill-eligible field present (signage:
// null is a real, determined "no legible signage", not "never asked").
const V = { name: 'At the beach', labels: ['beach'], setting: 'outdoor', placeType: 'beach', signage: null }
// An OLD-SHAPE label from before placeType existed (BUILD 3, §16) — the third
// backfill-eligible state.
const V_OLD_SHAPE = { name: 'At the beach', labels: ['beach'], setting: 'outdoor' }
// A label that has placeType but predates signage (BUILD 4c) — the fourth
// backfill-eligible state, and the archive's REAL current shape (the Build 3
// placeType run already completed 263/263).
const V_NEEDS_SIGNAGE = { name: 'At the beach', labels: ['beach'], setting: 'outdoor', placeType: 'beach' }
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

  it('idempotent — skips refs that already have vision WITH placeType, or visionFail', async () => {
    await seedMem('m1', [{ key: 'k1', vision: V }, { key: 'k2', visionFail: true }])
    const s = await backfillVisionLabels(envOn(), { label })
    expect(s.alreadyHad).toBe(2)
    expect(s.labeled).toBe(0)
    expect(s.placeTyped).toBe(0)
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

  describe('placeType-only re-run (BUILD 3, §16 — the third backfill-eligible state)', () => {
    it('an already-labeled OLD-SHAPE ref is re-asked, but ONLY placeType is written — name/labels/setting untouched', async () => {
      await seedMem('m1', [{ key: 'k1', lat: 42, vision: V_OLD_SHAPE }])
      // The stubbed `label` here answers with a COMPLETELY DIFFERENT name/labels — if
      // the backfill ever let that leak onto an already-reviewed ref, this test would
      // catch it (rule #1: never regenerate the family-facing caption).
      const freshReply = { name: 'A totally different caption', labels: ['nope'], setting: 'indoor', placeType: 'beach' }
      const s = await backfillVisionLabels(envOn(), { label: async () => freshReply })
      expect(s.placeTyped).toBe(1)
      expect(s.labeled).toBe(0)
      const ref = (await memRow('m1')).refs[0]
      expect(ref.vision.name).toBe('At the beach') // untouched
      expect(ref.vision.labels).toEqual(['beach']) // untouched
      expect(ref.vision.setting).toBe('outdoor') // untouched
      expect(ref.vision.placeType).toBe('beach') // the ONE new field
      expect(ref.lat).toBe(42) // unrelated fields survive too
    })

    it('an invalid/unusable fresh reply stamps placeType: null (a determined, permanent non-answer) — never a guess', async () => {
      await seedMem('m1', [{ key: 'k1', vision: V_OLD_SHAPE }])
      const s = await backfillVisionLabels(envOn(), {
        label: async () => ({ name: 'x', labels: [], setting: null, placeType: null }),
      })
      expect(s.placeTypeFailed).toBe(1)
      expect(s.placeTyped).toBe(0)
      const ref = (await memRow('m1')).refs[0]
      expect(ref.vision.name).toBe('At the beach') // still untouched
      expect('placeType' in ref.vision).toBe(true)
      expect(ref.vision.placeType).toBe(null)
    })

    // DEFENSE-IN-DEPTH: the write site must never trust `v.placeType` just because the
    // one wired `label` impl (parseVisionReply/extractPlaceType) already enforces the
    // enum — it independently re-validates via isValidPlaceType, mirroring the
    // server-side re-check pattern in photoSidecar.js. A hostile/malformed `placeType`
    // from a stub (standing in for a future different `label` implementation) must be
    // dropped, never stored raw.
    it('a hostile/out-of-enum placeType from `label` is dropped at the write site, never stored raw', async () => {
      await seedMem('m1', [{ key: 'k1', vision: V_OLD_SHAPE }])
      const s = await backfillVisionLabels(envOn(), {
        label: async () => ({ name: 'x', labels: [], setting: null, placeType: "'; DROP TABLE memories; --" }),
      })
      expect(s.placeTypeFailed).toBe(1)
      expect(s.placeTyped).toBe(0)
      const ref = (await memRow('m1')).refs[0]
      expect(ref.vision.placeType).toBe(null)
    })

    it('a non-string placeType (number/object) from `label` is dropped at the write site', async () => {
      await seedMem('m1', [{ key: 'k1', vision: V_OLD_SHAPE }])
      const s = await backfillVisionLabels(envOn(), {
        label: async () => ({ name: 'x', labels: [], setting: null, placeType: { $ne: null } }),
      })
      expect(s.placeTypeFailed).toBe(1)
      const ref = (await memRow('m1')).refs[0]
      expect(ref.vision.placeType).toBe(null)
    })

    it('a null-shape ref (indistinguishable from "asked, no answer") is idempotent — not re-billed next sweep', async () => {
      // Also carries signage: null — otherwise this ref would now be eligible
      // for the signage-only pass below (BUILD 4c added a fourth state), which
      // isn't what THIS test is checking.
      await seedMem('m1', [{ key: 'k1', vision: { ...V_OLD_SHAPE, placeType: null, signage: null } }])
      const s = await backfillVisionLabels(envOn(), { label })
      expect(s.alreadyHad).toBe(1)
      expect(s.placeTyped).toBe(0)
      expect(s.placeTypeFailed).toBe(0)
    })

    it('a fully unlabeled ref (no vision at all) still gets the FULL label, not the placeType-only path', async () => {
      await seedMem('m1', [{ key: 'k1' }])
      const s = await backfillVisionLabels(envOn(), { label })
      expect(s.labeled).toBe(1)
      expect(s.placeTyped).toBe(0)
      expect((await memRow('m1')).refs[0].vision).toEqual(V)
    })

    it('an R2 miss on a placeType-only ref stamps placeType: null WITHOUT touching visionFail or the existing label', async () => {
      await seedMem('m1', [{ key: 'missing', vision: V_OLD_SHAPE }])
      const s = await backfillVisionLabels({ ...envOn(), ASSETS: { get: async () => null } }, { label })
      expect(s.placeTypeFailed).toBe(1)
      const ref = (await memRow('m1')).refs[0]
      expect(ref.visionFail).toBeUndefined()
      expect(ref.vision.name).toBe('At the beach')
      expect(ref.vision.placeType).toBe(null)
    })

    it('a RETRYABLE failure on a placeType-only ref writes nothing — re-attempted next sweep', async () => {
      await seedMem('m1', [{ key: 'k1', vision: V_OLD_SHAPE }])
      const s = await backfillVisionLabels(envOn(), {
        label: async () => { throw new Error('vision-api 529') },
      })
      expect(s.retryable).toBe(1)
      expect(s.placeTyped).toBe(0)
      expect(s.placeTypeFailed).toBe(0)
      const ref = (await memRow('m1')).refs[0]
      expect('placeType' in ref.vision).toBe(false)
    })

    it('does not bump updated_at for a placeType-only write either', async () => {
      await seedMem('m1', [{ key: 'k1', vision: V_OLD_SHAPE }], 100)
      await backfillVisionLabels(envOn(), { label })
      expect((await memRow('m1')).updated_at).toBe(100)
    })
  })

  describe('signage-only re-run (BUILD 4c — the fourth backfill-eligible state)', () => {
    it('an already-placeTyped ref is re-asked, but ONLY signage is written — name/labels/setting/placeType untouched', async () => {
      await seedMem('m1', [{ key: 'k1', lat: 42, vision: V_NEEDS_SIGNAGE }])
      // A completely different fresh reply — if the backfill let ANY of this leak
      // onto the reviewed fields (including placeType, already reviewed once), this
      // test catches it.
      const freshReply = { name: 'A different caption', labels: ['nope'], setting: 'indoor', placeType: 'museum', signage: 'Spiritus Pizza' }
      const s = await backfillVisionLabels(envOn(), { label: async () => freshReply })
      expect(s.signaged).toBe(1)
      expect(s.labeled).toBe(0)
      expect(s.placeTyped).toBe(0)
      const ref = (await memRow('m1')).refs[0]
      expect(ref.vision.name).toBe('At the beach') // untouched
      expect(ref.vision.placeType).toBe('beach') // untouched — even though the fresh reply said 'museum'
      expect(ref.vision.signage).toBe('Spiritus Pizza') // the ONE new field
      expect(ref.lat).toBe(42)
    })

    it('an invalid/unusable fresh reply stamps signage: null (a determined, permanent non-answer)', async () => {
      await seedMem('m1', [{ key: 'k1', vision: V_NEEDS_SIGNAGE }])
      const s = await backfillVisionLabels(envOn(), {
        label: async () => ({ name: 'x', labels: [], setting: null, placeType: null, signage: null }),
      })
      expect(s.signageFailed).toBe(1)
      expect(s.signaged).toBe(0)
      const ref = (await memRow('m1')).refs[0]
      expect('signage' in ref.vision).toBe(true)
      expect(ref.vision.signage).toBe(null)
      expect(ref.vision.placeType).toBe('beach') // still untouched
    })

    it('a hostile/oversized signage from `label` is dropped at the write site, never stored raw', async () => {
      await seedMem('m1', [{ key: 'k1', vision: V_NEEDS_SIGNAGE }])
      const s = await backfillVisionLabels(envOn(), {
        label: async () => ({ name: 'x', labels: [], setting: null, placeType: null, signage: 'A'.repeat(200) }),
      })
      expect(s.signageFailed).toBe(1)
      expect((await memRow('m1')).refs[0].vision.signage).toBe(null)
    })

    it('a null-shape signage (indistinguishable from "asked, no answer") is idempotent — not re-billed next sweep', async () => {
      await seedMem('m1', [{ key: 'k1', vision: { ...V_NEEDS_SIGNAGE, signage: null } }])
      const s = await backfillVisionLabels(envOn(), { label })
      expect(s.alreadyHad).toBe(1)
      expect(s.signaged).toBe(0)
      expect(s.signageFailed).toBe(0)
    })

    it('an R2 miss on a signage-only ref stamps signage: null WITHOUT touching visionFail or the existing label', async () => {
      await seedMem('m1', [{ key: 'missing', vision: V_NEEDS_SIGNAGE }])
      const s = await backfillVisionLabels({ ...envOn(), ASSETS: { get: async () => null } }, { label })
      expect(s.signageFailed).toBe(1)
      const ref = (await memRow('m1')).refs[0]
      expect(ref.visionFail).toBeUndefined()
      expect(ref.vision.name).toBe('At the beach')
      expect(ref.vision.signage).toBe(null)
    })

    it('a RETRYABLE failure on a signage-only ref writes nothing — re-attempted next sweep', async () => {
      await seedMem('m1', [{ key: 'k1', vision: V_NEEDS_SIGNAGE }])
      const s = await backfillVisionLabels(envOn(), {
        label: async () => { throw new Error('vision-api 529') },
      })
      expect(s.retryable).toBe(1)
      expect(s.signaged).toBe(0)
      expect(s.signageFailed).toBe(0)
      const ref = (await memRow('m1')).refs[0]
      expect('signage' in ref.vision).toBe(false)
    })

    it('a fully unlabeled ref still gets the FULL label (name+labels+setting+placeType+signage), not the signage-only path', async () => {
      await seedMem('m1', [{ key: 'k1' }])
      const s = await backfillVisionLabels(envOn(), { label })
      expect(s.labeled).toBe(1)
      expect(s.signaged).toBe(0)
      expect((await memRow('m1')).refs[0].vision).toEqual(V)
    })

    it('a placeType-only ref (predates BOTH placeType and signage) takes the placeType path, not signage-only', async () => {
      await seedMem('m1', [{ key: 'k1', vision: V_OLD_SHAPE }])
      const s = await backfillVisionLabels(envOn(), { label })
      expect(s.placeTyped).toBe(1)
      expect(s.signaged).toBe(0)
    })

    it('does not bump updated_at for a signage-only write either', async () => {
      await seedMem('m1', [{ key: 'k1', vision: V_NEEDS_SIGNAGE }], 100)
      await backfillVisionLabels(envOn(), { label })
      expect((await memRow('m1')).updated_at).toBe(100)
    })
  })

  // THE BLOCKER (confirmed 2026-07-10, hotfixed same night): parseVisionReply's
  // pre-existing all-or-nothing `name` gate discarded the ENTIRE parsed reply — including
  // a perfectly valid placeType — whenever the model's reply omitted/blanked `name`. The
  // placeType-only re-run then stamped `placeType: null` as a PERMANENT completion
  // sentinel, silently and irrecoverably losing a real, available signal. These tests
  // exercise the REAL `visionLabel` (no `label` override — the default), with only
  // `fetch` stubbed, so they prove the fix through the actual production code path
  // (visionBackfill.js → visionLabel.js → extractPlaceType), not just the parser in
  // isolation.
  describe('THE BLOCKER FIX: a valid placeType survives a missing/blank name (via the real visionLabel, fetch stubbed)', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })
    function stubAnthropicReply(text) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(JSON.stringify({ content: [{ type: 'text', text }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        )
      )
    }

    it('placeType-only re-run: blank name + valid placeType → placeType captured, not lost to null-forever', async () => {
      await seedMem('m1', [{ key: 'k1', vision: V_OLD_SHAPE }])
      stubAnthropicReply('{"name":"","labels":["sand"],"setting":"outdoor","placeType":"beach"}')
      const s = await backfillVisionLabels(envOn()) // no label override — the REAL visionLabel
      expect(s.placeTyped).toBe(1)
      expect(s.placeTypeFailed).toBe(0)
      const ref = (await memRow('m1')).refs[0]
      expect(ref.vision.placeType).toBe('beach')
      expect(ref.vision.name).toBe('At the beach') // the existing reviewed caption, untouched
    })

    it('placeType-only re-run: name key absent entirely + valid placeType → still captured', async () => {
      await seedMem('m1', [{ key: 'k1', vision: V_OLD_SHAPE }])
      stubAnthropicReply('{"labels":["water"],"setting":"outdoor","placeType":"waterfront"}')
      const s = await backfillVisionLabels(envOn())
      expect(s.placeTyped).toBe(1)
      expect((await memRow('m1')).refs[0].vision.placeType).toBe('waterfront')
    })

    it('a genuinely useless reply (no name, no valid placeType) still stamps null — no false signal invented', async () => {
      await seedMem('m1', [{ key: 'k1', vision: V_OLD_SHAPE }])
      stubAnthropicReply('{"labels":["blur"]}')
      const s = await backfillVisionLabels(envOn())
      expect(s.placeTypeFailed).toBe(1)
      expect((await memRow('m1')).refs[0].vision.placeType).toBe(null)
    })

    it('the full-label path (never-labeled ref) is UNCHANGED: blank name still stamps visionFail, even with a valid placeType', async () => {
      await seedMem('m1', [{ key: 'k1' }]) // no prior vision at all — takes the full-label path, not placeType-only
      stubAnthropicReply('{"name":"","labels":["sand"],"setting":"outdoor","placeType":"beach"}')
      const s = await backfillVisionLabels(envOn())
      expect(s.labeled).toBe(0)
      expect(s.failed).toBe(1)
      const ref = (await memRow('m1')).refs[0]
      expect(ref.visionFail).toBe(true)
      expect('vision' in ref).toBe(false)
    })
  })
})
