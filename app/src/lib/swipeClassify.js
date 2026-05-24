// Pure swipe-gesture classifier. No DOM. Lives in its own module so
// Node tests can import it without dragging React or Vite-only globals
// into the test runner.

// Classify a touch gesture into one of: 'prev' | 'next' | 'close' |
// null (no-op / accidental tap). Thresholds tuned for the lightbox
// case Helen will hit on her iPhone:
//
// - horizontal swipe must travel > 40px and exceed vertical motion
//   by ≥ 1.4× → prev (right) / next (left)
// - downward swipe must travel > 80px and exceed horizontal by ≥ 1.4×
//   → close. The asymmetry (down only) keeps an accidental upward
//   drag from dismissing the viewer.
// - duration cap (1200ms) rejects long drags that are probably part
//   of a pinch-zoom interaction, not an intentional flick.
export function classifySwipe({ dx, dy, duration }) {
  if (typeof duration === 'number' && duration > 1200) return null
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax > 40 && ax > ay * 1.4) {
    return dx < 0 ? 'next' : 'prev'
  }
  if (dy > 80 && dy > ax * 1.4) return 'close'
  return null
}
