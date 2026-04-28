import { useEffect, useRef, useState } from 'react'

// Sticky day-chip strip used at the top of every themed view (and on
// StopDetail). Tap a chip → smooth-scroll to the day section anchor
// (`id="trip-day-N"`) inside the same view. Active chip tracks the day
// nearest the top of the viewport via IntersectionObserver.
//
// Sticky positioning and overflow-x scroll on the same element triggers
// a Safari touch bug where chips near the strip edges swallow taps;
// the wrapper / scroll-wrapper split below avoids it.
//
// While a programmatic scroll is in flight, the observer is suppressed
// for ~700ms so the active chip doesn't flicker through intermediate
// days during the animation.
export function DayChips({ days, activeDayN, onJump }) {
  const [observed, setObserved] = useState(activeDayN || days[0]?.n)
  const suppressObserverUntil = useRef(0)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const elements = days
      .map((d) => document.getElementById(`trip-day-${d.n}`))
      .filter(Boolean)
    if (!elements.length) return

    const obs = new IntersectionObserver(
      (entries) => {
        if (Date.now() < suppressObserverUntil.current) return
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length) {
          const id = visible[0].target.id // "trip-day-3"
          const n = parseInt(id.replace('trip-day-', ''), 10)
          if (!Number.isNaN(n)) setObserved(n)
        }
      },
      // The chips sit at top: ~76 px. Push the rootMargin top up so a
      // section is "active" once its header crosses just below the chips.
      { rootMargin: '-90px 0px -55% 0px', threshold: [0, 0.1] }
    )
    elements.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [days])

  // Fallback to explicit prop when no observer fires (e.g. StopDetail).
  const active = activeDayN ?? observed

  function handleClick(d) {
    // Optimistically reflect the tap so the user sees the chip light up
    // immediately, even before scroll/navigate completes.
    setObserved(d.n)
    suppressObserverUntil.current = Date.now() + 700

    if (onJump) {
      onJump(d.n)
      return
    }
    const target = document.getElementById(`trip-day-${d.n}`)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (!days || days.length <= 1) return null

  return (
    <div className="day-chips" aria-label="Days in this trip">
      <div className="day-chips-scroll">
        {days.map((d) => (
          <button
            key={d.n}
            type="button"
            onClick={() => handleClick(d)}
            className={`day-chip${d.n === active ? ' active' : ''}`}
            aria-current={d.n === active ? 'page' : undefined}
            aria-label={`Day ${d.n}${d.title ? ' — ' + d.title : ''}`}
          >
            {d.n}
          </button>
        ))}
      </div>
    </div>
  )
}
