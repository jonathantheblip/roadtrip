// PARITY: worker/src/photoSidecar.js is a deliberate, independent duplicate of
// app/src/lib/exifRead.js's sanitizeMeta/sanitizeSidecar bounds-check (Build 1)
// — never imported across the client/worker boundary (separate deployables),
// per the house rule that the worker never trusts the client's own bounds
// check. Both copies must still agree on what passes and what's dropped, or a
// value the client considers valid could get silently stripped server-side
// (or worse, a value the client would have rejected could sneak through the
// worker if the two ever drift apart). One shared corpus, both hashers.

import { describe, it, expect } from 'vitest'
import { sanitizeMeta as clientSanitizeMeta, sanitizeSidecar as clientSanitizeSidecar } from '../../app/src/lib/exifRead.js'
import { sanitizeMetaServer as workerSanitizeMeta, sanitizeSidecarServer as workerSanitizeSidecar } from '../src/photoSidecar.js'

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
})
