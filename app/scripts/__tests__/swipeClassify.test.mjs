import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifySwipe } from '../../src/lib/swipeClassify.js'

test('classifySwipe: clean leftward swipe → next', () => {
  assert.equal(classifySwipe({ dx: -120, dy: 5, duration: 200 }), 'next')
})

test('classifySwipe: clean rightward swipe → prev', () => {
  assert.equal(classifySwipe({ dx: 120, dy: 5, duration: 200 }), 'prev')
})

test('classifySwipe: clean downward swipe → close', () => {
  assert.equal(classifySwipe({ dx: 5, dy: 150, duration: 200 }), 'close')
})

test('classifySwipe: upward swipe is never close', () => {
  // Asymmetry on purpose — upward gesture should not dismiss.
  assert.equal(classifySwipe({ dx: 5, dy: -150, duration: 200 }), null)
})

test('classifySwipe: small jiggle below threshold → null', () => {
  assert.equal(classifySwipe({ dx: 20, dy: 18, duration: 100 }), null)
})

test('classifySwipe: diagonal closer to horizontal still nav, if 1.4× dominant', () => {
  // dx=70, dy=10 → ax=70, ay=10. 70 > 10*1.4 (= 14) ✓
  assert.equal(classifySwipe({ dx: 70, dy: 10, duration: 200 }), 'prev')
})

test('classifySwipe: diagonal closer to 45° → null (no dominant axis)', () => {
  // ax=60, ay=55 — neither dominates 1.4×
  assert.equal(classifySwipe({ dx: -60, dy: 55, duration: 200 }), null)
})

test('classifySwipe: too slow → rejected', () => {
  // Same shape that would otherwise be a 'next'.
  assert.equal(classifySwipe({ dx: -120, dy: 5, duration: 1500 }), null)
})

test('classifySwipe: tiny drift after a stationary tap → null', () => {
  assert.equal(classifySwipe({ dx: 2, dy: 2, duration: 80 }), null)
})

test('classifySwipe: down-and-right diagonal where down wins → close', () => {
  // dy=110, dx=30 → 110 > 30*1.4 (=42) ✓
  assert.equal(classifySwipe({ dx: 30, dy: 110, duration: 200 }), 'close')
})

test('classifySwipe: down at exactly threshold → null (strictly >)', () => {
  assert.equal(classifySwipe({ dx: 5, dy: 80, duration: 200 }), null)
})
