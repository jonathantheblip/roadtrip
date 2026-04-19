import { DAYS_ORDER } from '../data/meta'
import { TRIP_DATES } from '../data/tripCalendar'

export function getTodayDayKey() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  for (const [key, date] of Object.entries(TRIP_DATES)) {
    if (y === date.getFullYear() && m === date.getMonth() && d === date.getDate()) {
      return key
    }
  }
  return null
}

export function isDuringTrip() {
  return getTodayDayKey() !== null
}

export function nextDayKey(current) {
  const idx = DAYS_ORDER.indexOf(current)
  if (idx < 0 || idx >= DAYS_ORDER.length - 1) return null
  return DAYS_ORDER[idx + 1]
}

export function prevDayKey(current) {
  const idx = DAYS_ORDER.indexOf(current)
  if (idx <= 0) return null
  return DAYS_ORDER[idx - 1]
}
