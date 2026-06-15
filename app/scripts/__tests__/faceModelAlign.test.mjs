// Regression test for the box-crop fallback in faceModel.alignFaceTo112.
//
// The no-keypoints branch used to read `detection.boundingBox`, a field
// that does not exist on the engine's detection shape (scrfd.js returns
// `{ box: { originX, originY, width, height }, ... }`). Any face detected
// WITHOUT eye keypoints therefore hit the `else` branch and threw
// `Cannot read properties of undefined (reading 'originX')`. This proves
// the fallback now reads `detection.box` and runs without crashing — and
// that it still derives the crop region from origin/width/height.
//
// Pure node test: stub OffscreenCanvas so the fallback's canvas math runs
// without a real DOM. We capture the drawImage source-rect args to prove
// the box fields were actually consumed (non-vacuous).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { alignFaceTo112 } from '../../src/lib/faceModel.js'

function installCanvasStub() {
  const calls = []
  const ctx = {
    setTransform() {},
    drawImage(...args) {
      calls.push(args)
    },
    getImageData(_x, _y, w, h) {
      return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }
    },
  }
  globalThis.OffscreenCanvas = class {
    constructor(w, h) {
      this.width = w
      this.height = h
    }
    getContext() {
      return ctx
    }
  }
  return calls
}

test('alignFaceTo112 box-crop fallback reads detection.box (no keypoints) without crashing', () => {
  const calls = installCanvasStub()
  const source = { width: 400, height: 300 }
  // No keypoints → forces the box-crop fallback branch.
  const detection = { box: { originX: 100, originY: 50, width: 80, height: 80 } }

  let result
  assert.doesNotThrow(() => {
    result = alignFaceTo112(source, 400, 300, detection)
  }, 'fallback must not throw on a keypoint-less detection')

  assert.equal(result.width, 112)
  assert.equal(result.height, 112)

  // The fallback derives the crop from box center (140,90) ± half, where
  // half = max(80,80)*0.7 = 56. Proves origin/width/height were consumed
  // (i.e. it read `.box`, not the old undefined `.boundingBox`).
  const draw = calls.find((c) => c.length === 9)
  assert.ok(draw, 'expected a 9-arg drawImage (source-rect crop)')
  const [, sx, sy, sw, sh] = draw
  assert.equal(sx, 140 - 56) // cx - half
  assert.equal(sy, 90 - 56) // cy - half
  assert.equal(sw, 112) // half * 2
  assert.equal(sh, 112)
})

test('alignFaceTo112 old .boundingBox-only shape now fails fast (field rename verified)', () => {
  installCanvasStub()
  const source = { width: 400, height: 300 }
  // The buggy contract: a detection carrying ONLY boundingBox and no box.
  // Post-fix the code reads `.box`, so this should throw — confirming the
  // code no longer depends on the non-existent boundingBox field.
  const detection = { boundingBox: { originX: 1, originY: 1, width: 10, height: 10 } }
  assert.throws(() => alignFaceTo112(source, 400, 300, detection))
})
