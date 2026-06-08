// Slice 2 automation for Surprises: foreground arrival-reveal geofencing + the
// in-app reveal cue. Date-based reveals are handled SERVER-SIDE (the nightly
// cron), so they aren't here.
import { useEffect, useRef } from 'react'
import { useGeolocation } from './useGeolocation'
import { listTripSurpriseRecords, revealSurprise } from '../lib/memoryStore'
import { pendingArrivalSurprises, unseenRevealsForViewer } from '../lib/surprises'
import { haversineMeters } from '../lib/photoMatch'

const ARRIVAL_RADIUS_M = 150
const SEEN_KEY = (t) => `rt_surprise_reveal_seen_${t}_v1`

function readSeen(traveler) {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY(traveler)) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function writeSeen(traveler, ids) {
  try {
    localStorage.setItem(SEEN_KEY(traveler), JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

// Count of surprises freshly revealed TO `traveler` that they haven't
// acknowledged — drives the reveal cue (a dot on the ⋯ menu). Cheap LS read.
export function countUnseenReveals(trip, traveler) {
  if (!trip?.id || !traveler) return 0
  return unseenRevealsForViewer(listTripSurpriseRecords(trip.id), traveler, readSeen(traveler)).length
}

// Acknowledge every currently-revealed-for-me surprise (called when the viewer
// opens the Surprises screen) so the cue clears.
export function markRevealsSeen(trip, traveler) {
  if (!trip?.id || !traveler) return
  const items = unseenRevealsForViewer(listTripSurpriseRecords(trip.id), traveler, readSeen(traveler))
  if (!items.length) return
  writeSeen(traveler, [...readSeen(traveler), ...items.map((m) => m.id)])
}

// Whether `traveler` has any pending arrival-reveal surprise — gates whether we
// engage geolocation at all (so there's no permission prompt / battery cost when
// nobody's waiting on an arrival).
export function hasPendingArrival(trip, traveler) {
  if (!trip?.id || !traveler) return false
  return pendingArrivalSurprises(listTripSurpriseRecords(trip.id), traveler).length > 0
}

// Mounted ONLY when there IS a pending arrival surprise. While the app is open,
// geofences the author's own arrival-reveal surprises: within ~150m of the
// chosen place, the surprise unwraps (the author holds the full record, so it
// reveals + syncs normally). Web apps can't watch location in the background, so
// this fires only while foreground — which is when you're actually arriving.
export function ArrivalRevealWatcher({ trip, traveler, onReveal }) {
  const { position } = useGeolocation()
  const firedRef = useRef(new Set())
  useEffect(() => {
    if (!trip?.id || !traveler || !position) return
    const pending = pendingArrivalSurprises(listTripSurpriseRecords(trip.id), traveler)
    for (const s of pending) {
      if (firedRef.current.has(s.id)) continue
      const d = haversineMeters(position.lat, position.lng, s.reveal.lat, s.reveal.lng)
      if (Number.isFinite(d) && d <= ARRIVAL_RADIUS_M) {
        firedRef.current.add(s.id)
        revealSurprise(s.id)
        onReveal?.(s)
      }
    }
  }, [trip?.id, traveler, position?.lat, position?.lng])
  return null
}
