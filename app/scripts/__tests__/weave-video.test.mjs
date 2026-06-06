// weave-video unit tests — pure math functions in weaveRenderer.js.
//
// These run in Node.js (no browser APIs) and verify:
//   1. Animation constants match the locked spec (5s / 150fr / 30fps).
//   2. easeWeaveUp(0)=0, easeWeaveUp(1)=1, ease-out shape correct.
//   3. fadeAlpha is 0 before startTime and 1 after startTime+duration.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  easeWeaveUp,
  fadeAlpha,
  TOTAL_FRAMES,
  DURATION,
  RENDER_W,
  RENDER_H,
} = await import('../../src/lib/weaveRenderer.js')

// ── Animation constants ───────────────────────────────────────────────

test('TOTAL_FRAMES is 150', () => {
  assert.equal(TOTAL_FRAMES, 150)
})

test('DURATION is 5.0 seconds', () => {
  assert.equal(DURATION, 5.0)
})

test('TOTAL_FRAMES / DURATION = 30fps', () => {
  assert.equal(TOTAL_FRAMES / DURATION, 30)
})

test('RENDER_W × RENDER_H is 4:5 portrait', () => {
  assert.equal(RENDER_W * 5, RENDER_H * 4)   // 576*5 = 2880 = 720*4
})

test('RENDER_H = 720 (at worker long-edge cap, no downscale)', () => {
  assert.equal(RENDER_H, 720)
})

// ── easeWeaveUp ───────────────────────────────────────────────────────

test('easeWeaveUp(0) = 0', () => {
  assert.equal(easeWeaveUp(0), 0)
})

test('easeWeaveUp(1) = 1', () => {
  assert.equal(easeWeaveUp(1), 1)
})

test('easeWeaveUp clamps negative input to 0', () => {
  assert.equal(easeWeaveUp(-1), 0)
})

test('easeWeaveUp clamps > 1 input to 1', () => {
  assert.equal(easeWeaveUp(2), 1)
})

test('easeWeaveUp(0.5) is between 0 and 1', () => {
  const v = easeWeaveUp(0.5)
  assert.ok(v > 0 && v < 1, `expected 0 < ${v} < 1`)
})

test('easeWeaveUp is an ease-out (output > input near start)', () => {
  // cubic-bezier(0.22,1,0.36,1) is a fast-ease-out, so for small x
  // the output should be significantly larger than x.
  const v = easeWeaveUp(0.2)
  assert.ok(v > 0.2, `ease-out: expected easeWeaveUp(0.2)=${v} > 0.2`)
})

test('easeWeaveUp is monotonically increasing', () => {
  let prev = 0
  for (let i = 1; i <= 10; i++) {
    const x = i / 10
    const y = easeWeaveUp(x)
    assert.ok(y > prev, `easeWeaveUp(${x})=${y} should exceed prev=${prev}`)
    prev = y
  }
})

// ── fadeAlpha ─────────────────────────────────────────────────────────

test('fadeAlpha is 0 before the element start time', () => {
  assert.equal(fadeAlpha(0, 0.6), 0)   // t=0, element starts at 0.6
})

test('fadeAlpha is 1 after start + fade duration', () => {
  // Default fade duration is 0.45s.  At t = 0.6 + 0.45 + epsilon the
  // alpha should already be at 1.
  assert.equal(fadeAlpha(1.1, 0.6), 1)
})

test('fadeAlpha is 0 for the day-label element at t=0 (startTime=0)', () => {
  // The day label starts at 0 but hasn't started fading yet (t=0).
  assert.equal(fadeAlpha(0, 0), 0)
})

test('fadeAlpha approaches 1 when t >> startTime', () => {
  assert.equal(fadeAlpha(5, 0), 1)
})

test('fadeAlpha mid-fade is between 0 and 1 exclusive', () => {
  const a = fadeAlpha(0.6 + 0.2, 0.6)  // 0.2s into a 0.45s fade
  assert.ok(a > 0 && a < 1, `expected 0 < ${a} < 1`)
})
