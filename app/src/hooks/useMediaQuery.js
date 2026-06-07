import { useState, useEffect } from 'react'

// Subscribe to a CSS media query and re-render when it flips.
// Initial value is read synchronously so the first paint is correct.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false,
  )
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// "A wide TOUCH device" = an iPad (Rafa's device), gating his command-center
// layout vs his phone RafaView. We require BOTH a tablet-class width AND a
// coarse (touch) pointer:
//   - iPad (touch, ≥768 wide, either orientation) → RafaPad ✓
//   - phone (touch, <768 wide) → RafaView ✓
//   - a desktop/laptop with a mouse (pointer: fine) → RafaView, even though
//     it's wide — which is what keeps the e2e matrix untouched: the chromium
//     project is Desktop Chrome (mouse), the webkit project is a 393-wide
//     iPhone, so BOTH keep rendering RafaView and no baseline shifts.
// A dedicated iPad-device viewport test exercises RafaPad explicitly.
export function useIsIpad() {
  return useMediaQuery('(min-width: 768px) and (pointer: coarse)')
}
