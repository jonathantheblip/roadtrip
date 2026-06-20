import { test } from 'node:test'
import assert from 'node:assert/strict'

// Only the PURE blank-frame detector is unit-tested here — the seek/draw/encode
// orchestration needs a real <video>/canvas and is covered by the simulator gate.
const { isBlankImageData } = await import('../../src/lib/videoPipeline.js')

function rgba(pixels) {
  const data = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach(([r, g, b], i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  })
  return data
}

test('isBlankImageData: an all-black frame is blank (the classic black open frame)', () => {
  assert.equal(isBlankImageData(rgba(Array(1000).fill([0, 0, 0]))), true)
})

test('isBlankImageData: a uniform gray frame (no contrast) is blank', () => {
  assert.equal(isBlankImageData(rgba(Array(1000).fill([128, 128, 128]))), true)
})

test('isBlankImageData: a frame with real contrast is NOT blank', () => {
  const px = []
  for (let i = 0; i < 1000; i++) px.push(i % 2 ? [240, 240, 240] : [10, 20, 30])
  assert.equal(isBlankImageData(rgba(px)), false)
})

test('isBlankImageData: a dim-but-varied frame is NOT blank', () => {
  const px = []
  for (let i = 0; i < 1000; i++) px.push(i % 3 === 0 ? [60, 70, 80] : [2, 3, 4])
  assert.equal(isBlankImageData(rgba(px)), false)
})

test('isBlankImageData: empty / null buffer is treated as blank', () => {
  assert.equal(isBlankImageData(new Uint8ClampedArray(0)), true)
  assert.equal(isBlankImageData(null), true)
})
