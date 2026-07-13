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
  // ONLY fc_N-shaped pseudonymous cluster ids may ever ride a ref. Mutation-
  // style: a raw embedding array, a real person's name, a too-long fc_ id, a
  // non-fc string — every hostile shape must be dropped, identically, on
  // both independent sanitizer copies.
  describe('sanitizeFaces / sanitizeSidecar.faces — the fc_N-only fail-closed whitelist', () => {
    it('a valid fc_N array passes identically on both sides, in order, deduped', () => {
      const input = ['fc_1', 'fc_2', 'fc_1', 'fc_42', 'fc_999']
      const expected = ['fc_1', 'fc_2', 'fc_42', 'fc_999']
      expect(workerSanitizeFaces(input)).toEqual(expected)
      expect(clientSanitizeFaces(input)).toEqual(expected)
    })

    it('caps at 10 on both sides', () => {
      const input = Array.from({ length: 15 }, (_, i) => `fc_${i + 1}`)
      expect(workerSanitizeFaces(input)).toHaveLength(10)
      expect(clientSanitizeFaces(input)).toHaveLength(10)
      expect(workerSanitizeFaces(input)).toEqual(clientSanitizeFaces(input))
    })

    it('mutation battery: a raw embedding array, a person name, an oversized fc_ id, and a non-fc string are ALL dropped on both sides — only fc_1..fc_999 pass', () => {
      const hostile = [
        0.123, -0.456, 0.789, // raw embedding-shaped numbers (not even strings)
        'jonathan', 'helen', 'aurelia', 'rafa', // a real person's id/name
        'fc_1000', // 4 digits — one over the {1,3} bound
        'fc_', // no digits at all
        'FC_1', // wrong case
        ' fc_1', 'fc_1 ', // whitespace — must not be trimmed-and-accepted
        'fc_01x', // trailing garbage after digits
        'hello world', // arbitrary non-fc string
        { fc: 1 }, null, undefined, true, // non-string junk
      ]
      expect(workerSanitizeFaces(hostile)).toBeUndefined()
      expect(clientSanitizeFaces(hostile)).toBeUndefined()

      // Mixed batch: only the genuinely fc_1..fc_999-shaped survive, everything
      // else in the SAME array is dropped — never all-or-nothing.
      const mixed = ['fc_1', 'jonathan', 'fc_42', 0.5, 'fc_1000', 'fc_7']
      const expected = ['fc_1', 'fc_42', 'fc_7']
      expect(workerSanitizeFaces(mixed)).toEqual(expected)
      expect(clientSanitizeFaces(mixed)).toEqual(expected)
    })

    it('a non-array faces value is dropped entirely on both sides', () => {
      for (const bad of [null, undefined, 'fc_1', 42, { 0: 'fc_1' }]) {
        expect(workerSanitizeFaces(bad)).toBeUndefined()
        expect(clientSanitizeFaces(bad)).toBeUndefined()
      }
    })

    it('faces rides sanitizeSidecar identically on both sides, alongside the rest of the sidecar', () => {
      const input = { srcName: 'IMG_1.HEIC', atSrc: 'exif-original', faces: ['fc_1', 'fc_2', 'jonathan'] }
      const expected = { srcName: 'IMG_1.HEIC', atSrc: 'exif-original', faces: ['fc_1', 'fc_2'] }
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
