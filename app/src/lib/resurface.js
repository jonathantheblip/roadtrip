// resurface.js — "Looking back": pick one past moment to bring back.
//
// Surfaces a COMPLETED-trip day that has photos, shown as a card on the index
// that taps into a replay of that day. Rotates by day-of-year so it changes
// daily (deterministic within a day). Time-ago granularity (days → weeks →
// months → years) reads better than a raw date and matures into true
// anniversaries as trips age — so it works now (trips are months old) and
// becomes "a year ago today" later, with no code change.

import { listMemoriesForTrip } from './memoryStore'
import { flattenPhotoEntries } from './photoEntries'
import { dayStopIds } from './photoMatch'

function agoLabel(iso, todayMs) {
  const then = new Date(iso + 'T00:00:00').getTime()
  const days = Math.max(0, Math.floor((todayMs - then) / 86400000))
  if (days <= 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  if (days < 350) return `${Math.round(days / 30)} months ago`
  const years = Math.round(days / 365)
  return years <= 1 ? 'a year ago' : `${years} years ago`
}

function dayOfYear(iso) {
  const d = new Date(iso + 'T00:00:00')
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d - start) / 86400000)
}

// Returns { trip, day, photo, photoCount, agoLabel } or null when there's
// nothing to look back on (no completed trip with photos).
export function pickResurface(trips, traveler, todayIso) {
  const today = todayIso || new Date().toISOString().slice(0, 10)
  const todayMs = new Date(today + 'T00:00:00').getTime()

  const candidates = []
  for (const trip of trips || []) {
    // Completed trips only — ended strictly before today. (Skips the active
    // trip + anything in the future.)
    if (!trip?.dateRangeEnd || trip.dateRangeEnd >= today) continue
    const mems = listMemoriesForTrip(trip.id, traveler)
    if (!mems.length) continue
    for (const day of trip.days || []) {
      if (!day.isoDate || day.isoDate >= today) continue
      const stopIds = dayStopIds(trip, day) // planned stops + the implicit base ("At the cabin")
      const photos = flattenPhotoEntries(mems.filter((m) => stopIds.has(m.stopId)))
      if (photos.length) {
        candidates.push({ trip, day, photo: photos[0], photoCount: photos.length })
      }
    }
  }
  if (!candidates.length) return null

  // Stable-but-rotating pick: changes daily, deterministic within a day.
  const pick = candidates[dayOfYear(today) % candidates.length]
  return {
    trip: pick.trip,
    day: pick.day,
    photo: pick.photo,
    photoCount: pick.photoCount,
    agoLabel: agoLabel(pick.day.isoDate, todayMs),
  }
}
