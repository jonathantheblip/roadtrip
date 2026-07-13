// Build 1 — the never-discard metadata sidecar (meta/srcName/srcMod/atSrc)
// survives the sync round-trip, AND a garbage/oversized sidecar is sanitized
// server-side rather than failing the whole memory write.
//
// Mirrors test/memory-sound-roundtrip.test.js's shape. Server-side validation
// (photoSidecar.js) is independent of the client's own bounds-check
// (app/src/lib/exifRead.js) — this file proves the WORKER never trusts the
// client blob, per the house rule (an unbounded parser shipped TWICE, in two
// separate parsers, before either was bounds-checked).

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

const TOKENS = { jonathan: 'tok-jonathan' }
function authEnv(envOverrides = {}) {
  return { ...env, DB: env.DB, FAMILY_TOKEN_JONATHAN: TOKENS.jonathan, ...envOverrides }
}

async function call(path, { method = 'GET', token, body, origin = 'http://localhost:5173', envOverrides } = {}) {
  const headers = { Origin: origin }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const req = new Request('https://worker.test' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(envOverrides), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

const VALID_META = {
  make: 'Apple', model: 'iPhone 16 Pro', lens: 'iPhone 16 Pro back triple camera 6.765mm f/1.78',
  focalMm: 6.76, iso: 1600, fnum: 1.8, expMs: 50, flash: 16,
  altM: 11.78, headingDeg: 250.4, w: 4032, h: 3024, orient: 1,
  createdAt: '2026-05-24T22:49:12.000Z', modifiedAt: '2026-05-24T22:49:12.000Z',
}

describe('the never-discard sidecar — meta/srcName/srcMod/atSrc survive postMemory → rowToMemory', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await env.DB.prepare('DELETE FROM memories').run()
  })

  it('round-trips a full valid sidecar via photoRefs[]', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-sc',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [
          {
            storage: 'r2', key: 'jonathan/m-sc/p0', mime: 'image/jpeg',
            meta: VALID_META, srcName: 'IMG_1234.HEIC', srcMod: 1748000000000, atSrc: 'exif-original',
          },
        ],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.photoRefs).toHaveLength(1)
    expect(mem.photoRefs[0].meta).toEqual(VALID_META)
    expect(mem.photoRefs[0].srcName).toBe('IMG_1234.HEIC')
    expect(mem.photoRefs[0].srcMod).toBe(1748000000000)
    expect(mem.photoRefs[0].atSrc).toBe('exif-original')

    // A SECOND device's pull (GET, a fresh rowToMemory) sees it too.
    const pull = await call('/memories', { token: TOKENS.jonathan })
    expect(pull.status).toBe(200)
    const pulled = (await pull.json()).find((m) => m.id === 'm-sc')
    expect(pulled.photoRefs[0].meta).toEqual(VALID_META)
    expect(pulled.photoRefs[0].srcName).toBe('IMG_1234.HEIC')
    expect(pulled.photoRefs[0].atSrc).toBe('exif-original')
  })

  it('round-trips the sidecar on a video PIECE (E4 heterogeneous moment)', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-sc-piece',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        pieces: [
          { kind: 'video', storage: 'r2', key: 'jonathan/m-sc-piece/v', mime: 'video/mp4', srcName: 'IMG_5678.MOV', atSrc: 'file-mtime' },
          { kind: 'note', text: 'the waterfall was louder in person' },
        ],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.pieces[0].srcName).toBe('IMG_5678.MOV')
    expect(mem.photoRefs[0].srcName).toBe('IMG_5678.MOV') // the photo/video subset carries it too
  })

  it('sanitizes an oversized/garbage sidecar server-side — the photo still saves', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-sc-bad',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [
          {
            storage: 'r2', key: 'jonathan/m-sc-bad/p0', mime: 'image/jpeg',
            meta: {
              make: 'Apple', // valid — survives
              model: 'x'.repeat(500), // over the 64-char cap — dropped
              iso: 9e18, // absurd — the offset-leak class of bug — dropped
              headingDeg: 9999, // out of [0,360] — dropped
              evil: 'DROP TABLE memories', // not on the whitelist — dropped
              orient: 1, // valid — survives
            },
            srcName: 'y'.repeat(500), // over the 200-char cap — dropped
            srcMod: -1, // not positive — dropped
            atSrc: 'made-up-source', // not on the value whitelist — dropped
          },
        ],
      },
    })
    expect(res.status).toBe(200) // the write is NEVER failed for a garbage sidecar
    const mem = await res.json()
    const ref = mem.photoRefs[0]
    expect(ref.meta.make).toBe('Apple')
    expect(ref.meta.orient).toBe(1)
    expect(ref.meta.model).toBeUndefined()
    expect(ref.meta.iso).toBeUndefined()
    expect(ref.meta.headingDeg).toBeUndefined()
    expect('evil' in ref.meta).toBe(false)
    expect(ref.srcName).toBeUndefined()
    expect(ref.srcMod).toBeUndefined()
    expect(ref.atSrc).toBeUndefined()

    // The stored JSON itself never took the garbage values either — this is
    // server-side sanitization, not just a read-side filter.
    const row = await env.DB.prepare('SELECT photo_r2_keys_json FROM memories WHERE id = ?').bind('m-sc-bad').first()
    const stored = JSON.parse(row.photo_r2_keys_json)[0]
    expect(stored.meta.model).toBeUndefined()
    expect(stored.meta.iso).toBeUndefined()
    expect('evil' in stored.meta).toBe(false)
    expect(stored.srcName).toBeUndefined()
    expect(stored.atSrc).toBeUndefined()
  })

  it('a non-object meta (hostile/malformed) is dropped entirely, never crashes the write', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-sc-hostile',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [
          { storage: 'r2', key: 'jonathan/m-sc-hostile/p0', mime: 'image/jpeg', meta: 'not-an-object', srcMod: 'not-a-number', atSrc: 12345 },
        ],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect('meta' in mem.photoRefs[0]).toBe(false)
    expect('srcMod' in mem.photoRefs[0]).toBe(false)
    expect('atSrc' in mem.photoRefs[0]).toBe(false)
  })

  it('Build 2 (§14): a full valid prov tag round-trips via photoRefs[] alongside the rest of the sidecar', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-prov',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [
          {
            storage: 'r2', key: 'jonathan/m-prov/p0', mime: 'image/jpeg',
            lat: 42.06, lng: -70.16, offsetMinutes: -240,
            srcName: 'IMG_9999.HEIC', prov: { gps: 'exif', off: 'inferred-place' },
          },
        ],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.photoRefs[0].prov).toEqual({ gps: 'exif', off: 'inferred-place' })

    const pull = await call('/memories', { token: TOKENS.jonathan })
    const pulled = (await pull.json()).find((m) => m.id === 'm-prov')
    expect(pulled.photoRefs[0].prov).toEqual({ gps: 'exif', off: 'inferred-place' })
  })

  it('Build 2 (§14): a prov with an unwhitelisted value is dropped per-key server-side, never silently passed through', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-prov-bad',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [
          {
            storage: 'r2', key: 'jonathan/m-prov-bad/p0', mime: 'image/jpeg',
            prov: { gps: 'made-up', off: 'inferred-manual' }, // gps invalid, off valid
          },
        ],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.photoRefs[0].prov).toEqual({ off: 'inferred-manual' })
    const row = await env.DB.prepare('SELECT photo_r2_keys_json FROM memories WHERE id = ?').bind('m-prov-bad').first()
    expect(JSON.parse(row.photo_r2_keys_json)[0].prov).toEqual({ off: 'inferred-manual' })
  })

  it('Build 2 (§14): a totally garbage prov (non-object) is dropped entirely, never crashes the write', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-prov-hostile',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [{ storage: 'r2', key: 'jonathan/m-prov-hostile/p0', mime: 'image/jpeg', prov: 'DROP TABLE memories' }],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect('prov' in mem.photoRefs[0]).toBe(false)
  })

  it('keeps a sidecar-less ref byte-identical to the legacy stored shape (no null pollution)', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-sc-legacy',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [{ storage: 'r2', key: 'jonathan/m-sc-legacy/p0', mime: 'image/jpeg' }],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect('meta' in mem.photoRefs[0]).toBe(false)
    expect('srcName' in mem.photoRefs[0]).toBe(false)
    const row = await env.DB.prepare('SELECT photo_r2_keys_json FROM memories WHERE id = ?').bind('m-sc-legacy').first()
    expect(row.photo_r2_keys_json).toBe(JSON.stringify([{ key: 'jonathan/m-sc-legacy/p0', mime: 'image/jpeg' }]))
  })
})

// Build W4 (faces) — pseudonymous fc_N cluster ids are the ONE sidecar field
// with a SECOND gate beyond the shape whitelist: the PHOTO_FACES_MODE knob,
// enforced entirely server-side (photoFacesMode in worker/src/index.js). The
// knob ships OFF — this proves that even a perfectly-shaped, consented
// client payload writes ZERO bytes for `faces` until the family is promoted,
// and that once promoted the pseudonymous ids (and ONLY those) round-trip
// exactly like every other sidecar field.
describe('Build W4 — faces: PHOTO_FACES_MODE gates the sync write independently of shape validity', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await env.DB.prepare('DELETE FROM memories').run()
  })

  it('PHOTO_FACES_MODE unset (default OFF): a valid fc_N array is dropped entirely — zero bytes in D1', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-faces-off',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [{ storage: 'r2', key: 'jonathan/m-faces-off/p0', mime: 'image/jpeg', faces: ['fc_1', 'fc_2'] }],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect('faces' in mem.photoRefs[0]).toBe(false)
    const row = await env.DB.prepare('SELECT photo_r2_keys_json FROM memories WHERE id = ?').bind('m-faces-off').first()
    expect('faces' in JSON.parse(row.photo_r2_keys_json)[0]).toBe(false)
  })

  it("PHOTO_FACES_MODE='shadow': same zero-bytes discipline as off", async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      envOverrides: { PHOTO_FACES_MODE: 'shadow' },
      body: {
        id: 'm-faces-shadow',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [{ storage: 'r2', key: 'jonathan/m-faces-shadow/p0', mime: 'image/jpeg', faces: ['fc_1'] }],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect('faces' in mem.photoRefs[0]).toBe(false)
  })

  it("PHOTO_FACES_MODE='on': a valid fc_N array round-trips through postMemory → rowToMemory on a SECOND device", async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      envOverrides: { PHOTO_FACES_MODE: 'on' },
      body: {
        id: 'm-faces-on',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [{ storage: 'r2', key: 'jonathan/m-faces-on/p0', mime: 'image/jpeg', faces: ['fc_2', 'fc_1'] }],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.photoRefs[0].faces).toEqual(['fc_2', 'fc_1'])

    // A second device's pull sees it too — and note the pull path applies
    // NO mode gate of its own (the gate is write-time only); the bytes are
    // already honestly in D1, so they round-trip.
    const pull = await call('/memories', { token: TOKENS.jonathan, envOverrides: { PHOTO_FACES_MODE: 'off' } })
    const pulled = (await pull.json()).find((m) => m.id === 'm-faces-on')
    expect(pulled.photoRefs[0].faces).toEqual(['fc_2', 'fc_1'])
  })

  it("PHOTO_FACES_MODE='on' still enforces the shape whitelist — a raw embedding / person name / malformed id never reaches D1 even though the gate is open", async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      envOverrides: { PHOTO_FACES_MODE: 'on' },
      body: {
        id: 'm-faces-on-hostile',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [
          {
            storage: 'r2', key: 'jonathan/m-faces-on-hostile/p0', mime: 'image/jpeg',
            faces: ['fc_1', 'jonathan', 'fc_1000', 0.5123, 'DROP TABLE memories', 'fc_2'],
          },
        ],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.photoRefs[0].faces).toEqual(['fc_1', 'fc_2'])
    const row = await env.DB.prepare('SELECT photo_r2_keys_json FROM memories WHERE id = ?').bind('m-faces-on-hostile').first()
    expect(JSON.parse(row.photo_r2_keys_json)[0].faces).toEqual(['fc_1', 'fc_2'])
  })

  it("PHOTO_FACES_MODE='on' enforces the 10-cap end-to-end", async () => {
    const many = Array.from({ length: 14 }, (_, i) => `fc_${i + 1}`)
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      envOverrides: { PHOTO_FACES_MODE: 'on' },
      body: {
        id: 'm-faces-cap',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [{ storage: 'r2', key: 'jonathan/m-faces-cap/p0', mime: 'image/jpeg', faces: many }],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.photoRefs[0].faces).toHaveLength(10)
  })

  it('an invalid PHOTO_FACES_MODE value (typo) fails safe to OFF, same as unset', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      envOverrides: { PHOTO_FACES_MODE: 'ON' }, // wrong case — not in the enum
      body: {
        id: 'm-faces-typo',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [{ storage: 'r2', key: 'jonathan/m-faces-typo/p0', mime: 'image/jpeg', faces: ['fc_1'] }],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect('faces' in mem.photoRefs[0]).toBe(false)
  })

  it('a sidecar-less / faces-less ref stays byte-identical (no null pollution from the new field)', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      envOverrides: { PHOTO_FACES_MODE: 'on' },
      body: {
        id: 'm-faces-legacy',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [{ storage: 'r2', key: 'jonathan/m-faces-legacy/p0', mime: 'image/jpeg' }],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect('faces' in mem.photoRefs[0]).toBe(false)
    const row = await env.DB.prepare('SELECT photo_r2_keys_json FROM memories WHERE id = ?').bind('m-faces-legacy').first()
    expect(row.photo_r2_keys_json).toBe(JSON.stringify([{ key: 'jonathan/m-faces-legacy/p0', mime: 'image/jpeg' }]))
  })
})
