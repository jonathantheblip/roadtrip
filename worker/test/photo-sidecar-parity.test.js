// PARITY: worker/src/photoSidecar.js is a deliberate, independent duplicate of
// app/src/lib/exifRead.js's sanitizeMeta/sanitizeSidecar bounds-check (Build 1)
// — never imported across the client/worker boundary (separate deployables),
// per the house rule that the worker never trusts the client's own bounds
// check. Both copies must still agree on what passes and what's dropped, or a
// value the client considers valid could get silently stripped server-side
// (or worse, a value the client would have rejected could sneak through the
// worker if the two ever drift apart). One shared corpus, both hashers.

import { describe, it, expect } from 'vitest'
import {
  sanitizeMeta as clientSanitizeMeta,
  sanitizeSidecar as clientSanitizeSidecar,
  sanitizeFaces as clientSanitizeFaces,
} from '../../app/src/lib/exifRead.js'
import {
  sanitizeMetaServer as workerSanitizeMeta,
  sanitizeSidecarServer as workerSanitizeSidecar,
  sanitizeFacesServer as workerSanitizeFaces,
} from '../src/photoSidecar.js'

const VALID_META = {
  make: 'Apple', model: 'iPhone 16 Pro', lens: 'iPhone 16 Pro back triple camera 6.765mm f/1.78',
  focalMm: 6.76, iso: 1600, fnum: 1.8, expMs: 50, flash: 16,
  altM: 11.78, headingDeg: 250.4, w: 4032, h: 3024, orient: 1,
  createdAt: '2026-05-24T22:49:12.000Z', modifiedAt: '2026-05-24T22:49:12.000Z',
}

describe('photoSidecar.js (worker) parity with exifRead.js (client)', () => {
  it('a fully-valid meta object passes identically on both sides', () => {
    expect(workerSanitizeMeta(VALID_META)).toEqual(clientSanitizeMeta(VALID_META))
    expect(workerSanitizeMeta(VALID_META)).toEqual(VALID_META)
  })

  it('every numeric bound agrees: in-range survives, out-of-range dropped, on BOTH sides', () => {
    const cases = [
      ['iso', 500000, true], ['iso', 500001, false], ['iso', -1, false], ['iso', NaN, false],
      ['fnum', 100, true], ['fnum', 100.1, false],
      ['headingDeg', 360, true], ['headingDeg', 360.1, false], ['headingDeg', -0.1, false],
      ['altM', 9000, true], ['altM', -1000, true], ['altM', 9001, false], ['altM', -1001, false],
      ['orient', 1, true], ['orient', 8, true], ['orient', 0, false], ['orient', 9, false],
      ['w', 20000, true], ['w', 0, false],
    ]
    for (const [key, value, shouldSurvive] of cases) {
      const c = workerSanitizeMeta({ [key]: value })
      const w = clientSanitizeMeta({ [key]: value })
      expect(Boolean(c?.[key] !== undefined)).toBe(shouldSurvive)
      expect(Boolean(c?.[key] !== undefined)).toBe(Boolean(w?.[key] !== undefined))
    }
  })

  it('an unwhitelisted key is dropped on both sides', () => {
    const input = { make: 'Apple', evil: 'DROP TABLE memories' }
    expect(workerSanitizeMeta(input)).toEqual({ make: 'Apple' })
    expect(clientSanitizeMeta(input)).toEqual({ make: 'Apple' })
  })

  it('sanitizeSidecar (srcName/srcMod/atSrc) agrees on both sides', () => {
    const input = { srcName: 'IMG_1234.HEIC', srcMod: 1748000000000, atSrc: 'exif-original' }
    expect(workerSanitizeSidecar(input)).toEqual(clientSanitizeSidecar(input))
    const badInput = { srcName: 'x'.repeat(500), srcMod: -1, atSrc: 'made-up' }
    expect(workerSanitizeSidecar(badInput)).toEqual({})
    expect(clientSanitizeSidecar(badInput)).toEqual({})
  })

  it('hostile / non-object input never throws on either side', () => {
    for (const bad of [null, undefined, 'garbage', 42, [], [1, 2, 3]]) {
      expect(() => workerSanitizeMeta(bad)).not.toThrow()
      expect(() => clientSanitizeMeta(bad)).not.toThrow()
      expect(workerSanitizeMeta(bad)).toEqual(clientSanitizeMeta(bad))
    }
  })

  // ── Build W4 (faces) — THE load-bearing safety property of that build:
  // ONLY the keyless `fc2-<16 lowercase hex>` cross-device tag may ever ride a
  // ref. Mutation-style: a raw embedding, a real person's name, the RETIRED
  // per-device `fc_N` shape, wrong-case/wrong-length hex, whitespace — every
  // hostile shape must be dropped, identically, on both independent sanitizer
  // copies.
  describe('sanitizeFaces / sanitizeSidecar.faces — the fc2-only fail-closed whitelist', () => {
    // Real family tags (faceIndex.js faceTagOf) + hex edges — pinned so a drift
    // in the accepted SHAPE is caught here too, not only in the app unit test.
    const J = 'fc2-d946bc4f3a5e495c' // jonathan
    const H = 'fc2-a44ef94680c3f2ad' // helen
    const R = 'fc2-6dcf0a1fd2038d9d' // rafa

    it('a valid fc2 array passes identically on both sides, in order, deduped', () => {
      const input = [J, H, J, R, 'fc2-0000000000000000', 'fc2-ffffffffffffffff']
      const expected = [J, H, R, 'fc2-0000000000000000', 'fc2-ffffffffffffffff']
      expect(workerSanitizeFaces(input)).toEqual(expected)
      expect(clientSanitizeFaces(input)).toEqual(expected)
    })

    it('caps at 10 on both sides', () => {
      const input = Array.from({ length: 15 }, (_, i) => 'fc2-' + i.toString(16).padStart(16, '0'))
      expect(workerSanitizeFaces(input)).toHaveLength(10)
      expect(clientSanitizeFaces(input)).toHaveLength(10)
      expect(workerSanitizeFaces(input)).toEqual(clientSanitizeFaces(input))
    })

    it('mutation battery: raw embedding numbers, a real name, the RETIRED fc_N shape, wrong-case/length hex, and whitespace are ALL dropped on both sides', () => {
      const hostile = [
        0.123, -0.456, 0.789, // raw embedding-shaped numbers (not even strings)
        'jonathan', 'helen', 'aurelia', 'rafa', // a real person's id/name
        'fc_1', 'fc_42', 'fc_999', // the RETIRED per-device shape — must NOT come back
        'fc2-D946BC4F3A5E495C', // uppercase hex — wrong case
        'fc2-d946bc4f3a5e495', // 15 hex — too short
        'fc2-d946bc4f3a5e495cc', // 17 hex — too long
        'fc2-d946bc4f3a5e495g', // non-hex char
        'fc2-', // no hex at all
        'fc2d946bc4f3a5e495c', // missing the hyphen
        ' fc2-d946bc4f3a5e495c', 'fc2-d946bc4f3a5e495c ', // whitespace — never trimmed-and-accepted
        'hello world', // arbitrary non-fc2 string
        { fc: 1 }, null, undefined, true, // non-string junk
      ]
      expect(workerSanitizeFaces(hostile)).toBeUndefined()
      expect(clientSanitizeFaces(hostile)).toBeUndefined()

      // Mixed batch: only the genuinely fc2-shaped survive, everything else in
      // the SAME array is dropped — never all-or-nothing. Order is preserved.
      const mixed = [J, 'jonathan', R, 0.5, 'fc_1', 'fc2-d946bc4f3a5e495g', H]
      const expected = [J, R, H]
      expect(workerSanitizeFaces(mixed)).toEqual(expected)
      expect(clientSanitizeFaces(mixed)).toEqual(expected)
    })

    it('a non-array faces value is dropped entirely on both sides', () => {
      for (const bad of [null, undefined, J, 42, { 0: J }]) {
        expect(workerSanitizeFaces(bad)).toBeUndefined()
        expect(clientSanitizeFaces(bad)).toBeUndefined()
      }
    })

    it('faces rides sanitizeSidecar identically on both sides, alongside the rest of the sidecar', () => {
      const input = { srcName: 'IMG_1.HEIC', atSrc: 'exif-original', faces: [J, H, 'jonathan', 'fc_1'] }
      const expected = { srcName: 'IMG_1.HEIC', atSrc: 'exif-original', faces: [J, H] }
      expect(workerSanitizeSidecar(input)).toEqual(expected)
      expect(clientSanitizeSidecar(input)).toEqual(expected)
    })

    it('hostile faces input never throws on either side, on its own or inside sanitizeSidecar', () => {
      for (const bad of [null, undefined, 'garbage', 42, {}, [null, undefined, 42, {}]]) {
        expect(() => workerSanitizeFaces(bad)).not.toThrow()
        expect(() => clientSanitizeFaces(bad)).not.toThrow()
        expect(workerSanitizeFaces(bad)).toEqual(clientSanitizeFaces(bad))
        expect(() => workerSanitizeSidecar({ faces: bad })).not.toThrow()
        expect(() => clientSanitizeSidecar({ faces: bad })).not.toThrow()
      }
    })
  })
})
