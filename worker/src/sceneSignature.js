// sceneSignature.js — WORKER-ONLY. Compute a photo's perceptual SCENE signature
// (sceneHash.js) straight from its stored (downscaled) bytes, using the Photon WASM
// decoder the worker ALREADY ships for on-the-fly resizing (index.js) — so no new
// dependency. This is how the archive's COMPOSITION dimension is recovered: the pixels
// survived the upload even though GPS and the capture offset did not. Decode → resize
// to the dHash grid → grayscale → hash. Returns a hex signature, or null when the bytes
// aren't a decodable still (video/corrupt). Pure of D1/R2 — the caller supplies bytes
// and persists the result — so `graysFromRgba` unit-tests without WASM.

import { PhotonImage, resize, SamplingFilter } from '@cf-wasm/photon'
import { sceneHashFromGray, SCENE_DEFAULTS } from './sceneHash.js'

// RGBA bytes (row-major, 4 per pixel) → n grayscale luma values, or null if short.
export function graysFromRgba(rgba, n) {
  if (!rgba || rgba.length < n * 4) return null
  const gray = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    gray[i] = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]
  }
  return gray
}

export function sceneSignatureFromBytes(bytes, opts = {}) {
  const gridW = opts.gridW ?? SCENE_DEFAULTS.gridW
  const gridH = opts.gridH ?? SCENE_DEFAULTS.gridH
  const u8 = bytes instanceof Uint8Array ? bytes : bytes ? new Uint8Array(bytes) : null
  if (!u8 || !u8.length) return null
  let inImg = null
  let small = null
  try {
    inImg = PhotonImage.new_from_byteslice(u8)
    // Nearest is enough — the dHash only compares neighbouring cells, and Nearest is
    // the cheapest sampler (this runs across the whole archive).
    small = resize(inImg, gridW, gridH, SamplingFilter.Nearest)
    const gray = graysFromRgba(small.get_raw_pixels(), gridW * gridH)
    return gray ? sceneHashFromGray(gray, gridW, gridH) : null
  } catch (err) {
    console.error('[scene-sig] decode failed', err?.stack || err)
    return null
  } finally {
    try {
      inImg?.free?.()
    } catch {}
    try {
      small?.free?.()
    } catch {}
  }
}
