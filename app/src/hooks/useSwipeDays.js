import { useCallback, useRef, useState } from 'react'
import { nextDayKey, prevDayKey } from '../utils/tripDay'

export function useSwipeDays(filterDay, setFilterDay) {
  const [swipeX, setSwipeX] = useState(0)
  const touch = useRef({ startX: 0, startY: 0, tracking: false })

  const onTouchStart = useCallback((e) => {
    const t = e.touches[0]
    touch.current = { startX: t.clientX, startY: t.clientY, tracking: true }
    setSwipeX(0)
  }, [])

  const onTouchMove = useCallback((e) => {
    if (!touch.current.tracking) return
    const t = e.touches[0]
    const dx = t.clientX - touch.current.startX
    const dy = t.clientY - touch.current.startY
    if (Math.abs(dy) > 30 && Math.abs(dx) < Math.abs(dy)) {
      touch.current.tracking = false
      setSwipeX(0)
      return
    }
    setSwipeX(dx * 0.3)
  }, [])

  const onTouchEnd = useCallback(() => {
    if (!touch.current.tracking) { setSwipeX(0); return }
    const dx = touch.current.startX ? swipeX / 0.3 : 0
    touch.current.tracking = false

    if (filterDay === 'all') { setSwipeX(0); return }

    if (dx < -50) {
      const next = nextDayKey(filterDay)
      if (next) setFilterDay(next)
    } else if (dx > 50) {
      const prev = prevDayKey(filterDay)
      if (prev) setFilterDay(prev)
    }
    setSwipeX(0)
  }, [filterDay, setFilterDay, swipeX])

  return {
    swipeX,
    swipeHandlers: { onTouchStart, onTouchMove, onTouchEnd },
  }
}
