// seqName.js — the filename-sequence witness (BUILD_PLAN_WITNESS_FLEET_2.md W2).
// Mutation-tested in the vision-label.test.js style: boundary accepted,
// near-miss rejected, oversize rejected-never-truncated, null never throws.

import { describe, it, expect } from 'vitest'
import { parseSeqName, deviceKeyFor, findSequenceInversions } from '../src/seqName.js'

describe('parseSeqName', () => {
  it('accepts the standard iPhone shape', () => {
    expect(parseSeqName('IMG_4021.HEIC')).toEqual({ prefix: 'IMG_', num: 4021 })
  })
  it('accepts the edited-copy prefix as a DISTINCT prefix (never comparable to IMG_)', () => {
    expect(parseSeqName('IMG_E4021.HEIC')).toEqual({ prefix: 'IMG_E', num: 4021 })
  })
  it('accepts every whitelisted extension, case-insensitively', () => {
    for (const ext of ['heic', 'HEIC', 'heif', 'jpg', 'JPG', 'jpeg', 'png', 'gif', 'mov', 'MOV', 'mp4']) {
      expect(parseSeqName(`IMG_1234.${ext}`)).toEqual({ prefix: 'IMG_', num: 1234 })
    }
  })
  it('rejects a non-whitelisted extension', () => {
    expect(parseSeqName('IMG_1234.tiff')).toBeNull()
    expect(parseSeqName('IMG_1234.webp')).toBeNull()
  })

  describe('digit-run BOUNDARY (3-6 digits accepted; near-miss rejected; oversize rejected-never-truncated)', () => {
    it('accepts the 3-digit lower boundary', () => {
      expect(parseSeqName('IMG_047.MOV')).toEqual({ prefix: 'IMG_', num: 47 })
    })
    it('accepts the 6-digit upper boundary', () => {
      expect(parseSeqName('IMG_123456.JPG')).toEqual({ prefix: 'IMG_', num: 123456 })
    })
    it('rejects a 2-digit near-miss (below the boundary)', () => {
      expect(parseSeqName('IMG_47.MOV')).toBeNull()
    })
    it('rejects a 7-digit oversize run — NEVER silently truncated to the first 6', () => {
      expect(parseSeqName('IMG_1234567.JPG')).toBeNull()
    })
  })

  it('the match is FULLY ANCHORED (^...$) — no partial/substring match anywhere in a longer string', () => {
    expect(parseSeqName('train_1234.jpg')).toEqual({ prefix: 'train_', num: 1234 }) // a real, if unusual, matching prefix — anchoring is about POSITION, not word content
    expect(parseSeqName('my train photo 1234.jpg')).toBeNull() // spaces break the anchor — no partial match
  })

  it('Android/WhatsApp/renamed filenames do not match the pattern → abstains (null), never coerced', () => {
    expect(parseSeqName('PXL_20230101_123456789.jpg')).toBeNull()
    expect(parseSeqName('WhatsApp Image 2026-07-04 at 10.15.32.jpeg')).toBeNull()
    expect(parseSeqName('vacation photo.jpg')).toBeNull()
    expect(parseSeqName('20260704_142233.jpg')).toBeNull()
  })

  it('a bad/absent input never throws', () => {
    expect(parseSeqName(null)).toBeNull()
    expect(parseSeqName(undefined)).toBeNull()
    expect(parseSeqName('')).toBeNull()
    expect(parseSeqName(42)).toBeNull()
    expect(parseSeqName({})).toBeNull()
  })
})

describe('deviceKeyFor', () => {
  it('combines author + make + model + prefix into one PIPE-JOINED, grep-visible string', () => {
    const ref = { srcName: 'IMG_4021.HEIC', meta: { make: 'Apple', model: 'iPhone 14' } }
    expect(deviceKeyFor(ref, 'jonathan')).toBe('jonathan|Apple|iPhone 14|IMG_')
  })
  it('two refs with the SAME author/make/model/prefix share a key', () => {
    const a = { srcName: 'IMG_4021.HEIC', meta: { make: 'Apple', model: 'iPhone 14' } }
    const b = { srcName: 'IMG_4099.HEIC', meta: { make: 'Apple', model: 'iPhone 14' } }
    expect(deviceKeyFor(a, 'jonathan')).toBe(deviceKeyFor(b, 'jonathan'))
  })
  it('a DIFFERENT prefix (e.g. the edited variant) never shares a key, even same device/author', () => {
    const a = { srcName: 'IMG_4021.HEIC', meta: { make: 'Apple', model: 'iPhone 14' } }
    const b = { srcName: 'IMG_E4021.HEIC', meta: { make: 'Apple', model: 'iPhone 14' } }
    expect(deviceKeyFor(a, 'jonathan')).not.toBe(deviceKeyFor(b, 'jonathan'))
  })
  it('an unparseable srcName → null (nothing to group)', () => {
    expect(deviceKeyFor({ srcName: 'random.jpg' }, 'jonathan')).toBeNull()
    expect(deviceKeyFor({}, 'jonathan')).toBeNull()
  })
  it('missing author/make/model degrades gracefully (empty string components), never throws', () => {
    expect(deviceKeyFor({ srcName: 'IMG_001.jpg' }, undefined)).toBe('|||IMG_')
  })
})

describe('findSequenceInversions', () => {
  const T0 = Date.parse('2026-07-04T14:00:00.000Z')
  const HR = 3600000

  it('no inversion when capturedAt is non-decreasing in sequence-number order', () => {
    const refs = [
      { key: 'k1', srcName: 'IMG_4021.HEIC', capturedAt: new Date(T0).toISOString(), author: 'jonathan' },
      { key: 'k2', srcName: 'IMG_4022.HEIC', capturedAt: new Date(T0 + HR).toISOString(), author: 'jonathan' },
    ]
    expect(findSequenceInversions(refs)).toEqual([])
  })

  it('flags an inversion: a LATER sequence number with an EARLIER capturedAt (clock suspicion)', () => {
    const refs = [
      { key: 'k1', srcName: 'IMG_4021.HEIC', capturedAt: new Date(T0).toISOString(), author: 'jonathan' },
      { key: 'k2', srcName: 'IMG_4022.HEIC', capturedAt: new Date(T0 - HR).toISOString(), author: 'jonathan' }, // clock went BACK
    ]
    const inv = findSequenceInversions(refs)
    expect(inv).toHaveLength(1)
    expect(inv[0]).toMatchObject({ refKeyA: 'k1', refKeyB: 'k2', seqA: 4021, seqB: 4022 })
  })

  it('a large numeric jump (e.g. a 9999-wrap) is IGNORED, not treated as an inversion (decided: ignore, not modular math)', () => {
    const refs = [
      { key: 'k1', srcName: 'IMG_9998.HEIC', capturedAt: new Date(T0).toISOString(), author: 'jonathan' },
      // "IMG_0001" sorts numerically FIRST among {1, 9998} region, but here we
      // test the adjacent-pair case directly: a huge gap between neighbors in
      // sorted order is skipped regardless of capturedAt direction.
      { key: 'k2', srcName: 'IMG_9999.HEIC', capturedAt: new Date(T0 + HR).toISOString(), author: 'jonathan' },
      { key: 'k3', srcName: 'IMG_0001.HEIC', capturedAt: new Date(T0 + 2 * HR).toISOString(), author: 'jonathan' },
    ]
    // Sorted by num: k3(1), k1(9998), k2(9999). k3→k1 gap=9997 (>1000, ignored).
    // k1→k2 gap=1 (checked): capturedAt goes T0 → T0+HR, non-decreasing → no inversion.
    expect(findSequenceInversions(refs)).toEqual([])
  })

  it('different device keys (different prefix) never cross-compare', () => {
    const refs = [
      { key: 'k1', srcName: 'IMG_4021.HEIC', capturedAt: new Date(T0).toISOString(), author: 'jonathan' },
      { key: 'k2', srcName: 'IMG_E4020.HEIC', capturedAt: new Date(T0 - HR).toISOString(), author: 'jonathan' }, // earlier num, earlier time — would be fine anyway, but different prefix regardless
    ]
    expect(findSequenceInversions(refs)).toEqual([])
  })

  it('different authors on the SAME make/model/prefix never cross-compare (a shared-family-phone edge case, accepted)', () => {
    const refs = [
      { key: 'k1', srcName: 'IMG_4021.HEIC', capturedAt: new Date(T0).toISOString(), author: 'jonathan' },
      { key: 'k2', srcName: 'IMG_4022.HEIC', capturedAt: new Date(T0 - HR).toISOString(), author: 'helen' },
    ]
    expect(findSequenceInversions(refs)).toEqual([])
  })

  it('a ref with no srcName, or a bad capturedAt, is skipped — never throws', () => {
    const refs = [
      { key: 'k1', capturedAt: new Date(T0).toISOString(), author: 'jonathan' },
      { key: 'k2', srcName: 'IMG_4022.HEIC', capturedAt: 'garbage', author: 'jonathan' },
    ]
    expect(findSequenceInversions(refs)).toEqual([])
  })

  it('non-array / empty input never throws', () => {
    expect(findSequenceInversions([])).toEqual([])
    expect(findSequenceInversions(null)).toEqual([])
    expect(findSequenceInversions(undefined)).toEqual([])
  })

  it('a four-item run flags ONLY the truly-inverted adjacent pair, not the whole group', () => {
    const refs = [
      { key: 'k1', srcName: 'IMG_010.HEIC', capturedAt: new Date(T0).toISOString(), author: 'j' },
      { key: 'k2', srcName: 'IMG_011.HEIC', capturedAt: new Date(T0 + 2 * HR).toISOString(), author: 'j' },
      { key: 'k3', srcName: 'IMG_012.HEIC', capturedAt: new Date(T0 + HR).toISOString(), author: 'j' }, // dips back — the only inversion
      { key: 'k4', srcName: 'IMG_013.HEIC', capturedAt: new Date(T0 + 3 * HR).toISOString(), author: 'j' }, // recovers, non-decreasing from k3
    ]
    const inv = findSequenceInversions(refs)
    expect(inv).toHaveLength(1)
    expect(inv[0]).toMatchObject({ refKeyA: 'k2', refKeyB: 'k3', seqA: 11, seqB: 12 })
  })
})
