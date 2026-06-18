import { useEffect, useState } from 'react'

// A `now` Date that advances on its own, so anything derived from the wall
// clock (the live ledge's now/next, the map's "up next") moves through the day
// instead of freezing at whatever time the screen last rendered. Also re-reads
// the clock the moment the app returns to the foreground — a phone held all day
// sleeps the interval, and a family member glancing back at 2pm should not see
// the 9am state. Default cadence is a minute (schedule stops are minute-grained;
// a tighter tick would just burn battery).
export function useNowTick(intervalMs = 60000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const bump = () => setNow(new Date())
    const id = setInterval(bump, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') bump()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])
  return now
}
