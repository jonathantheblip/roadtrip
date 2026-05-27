// useInView — fire once when an element first enters (or nears) the
// viewport. Used by photo tile components to defer image fetching
// until the tile is about to be seen.
//
// Why this exists: Helen's Fun @ the Sun album has 55 photos. With
// `<img loading="lazy">` alone, every tile within ~2 viewports of
// the visible area is preloaded — on a 1372px desktop that's most
// of the album. All 55 photos hit the network at once at full
// resolution, and the page never reaches document_idle.
//
// IntersectionObserver with a generous rootMargin (~300px) gives a
// real lazy-load: only a handful of tiles are "near enough" to fetch
// at any time, naturally capping concurrent in-flight requests
// without needing an explicit semaphore.
//
// Contract:
//   const { ref, inView } = useInView({ rootMargin: '300px' })
//   <div ref={ref}>...</div>
//
// Once inView becomes true it stays true — there's no point in
// unloading an image once decoded. Setting `once: false` lets a
// caller opt into continuous tracking (not currently used).

import { useEffect, useRef, useState } from 'react'

export function useInView({ rootMargin = '300px 0px', once = true } = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (inView && once) return
    const el = ref.current
    if (!el) return
    // No-op in environments that lack IO (very old browsers, certain
    // test runners). Treat as always-in-view so behavior degrades to
    // the eager-load state we're moving away from, but doesn't break.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        if (entry.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { rootMargin }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin, once, inView])

  return { ref, inView }
}
