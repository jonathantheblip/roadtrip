// sceneSignature.js — the grayscale conversion (pure) + the guards that keep an
// undecodable byte-stream from ever producing a false signature. The full Photon
// decode path is exercised by the archive backfill run + the existing resize route.
import { describe, it, expect } from 'vitest'
import { graysFromRgba, sceneSignatureFromBytes } from '../src/sceneSignature.js'

describe('graysFromRgba', () => {
  it('converts RGBA to luma, row-major (white→255, black→0)', () => {
    const rgba = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255])
    const g = graysFromRgba(rgba, 2)
    expect(Math.round(g[0])).toBe(255)
    expect(Math.round(g[1])).toBe(0)
  })
  it('weights green most (luma), so pure green > pure blue', () => {
    const rgba = new Uint8Array([0, 255, 0, 255, 0, 0, 255, 255])
    const g = graysFromRgba(rgba, 2)
    expect(g[0]).toBeGreaterThan(g[1])
  })
  it('returns null when the buffer is short (never a partial signature)', () => {
    expect(graysFromRgba(new Uint8Array([1, 2, 3]), 2)).toBe(null)
    expect(graysFromRgba(null, 4)).toBe(null)
  })
})

describe('sceneSignatureFromBytes — pre-decode guards', () => {
  it('null / empty bytes → null (no decode attempted)', () => {
    expect(sceneSignatureFromBytes(null)).toBe(null)
    expect(sceneSignatureFromBytes(new Uint8Array())).toBe(null)
    expect(sceneSignatureFromBytes(undefined)).toBe(null)
  })
})
