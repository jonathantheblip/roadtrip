// Slice 2 automation for Surprises: foreground arrival-reveal geofencing + the
// in-app reveal cue. Date-based reveals are handled SERVER-SIDE (the nightly
// cron), so they aren't here.
import { useEffect, useRef } from 'react'
import { useGeolocation } from './useGeolocation'
import { listTripSurpriseRecords, revealSurprise } from '../lib/memoryStore'
import { pendingArrivalSurprises, pendingArrivalStopSurprises, unseenRevealsForViewer } from '../lib/surprises'
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
// nobody's waiting on an arrival). Covers both memory surprises and per-stop
// surprises (Slice 2 — those live in the trips, hence `trips`).
export function hasPendingArrival(trip, traveler, trips) {
  if (!trip?.id || !traveler) return false
  if (pendingArrivalSurprises(listTripSurpriseRecords(trip.id), traveler).length > 0) return true
  return pendingArrivalStopSurprises(trips || [], traveler).length > 0
}

// Reveal one per-stop surprise (Slice 2) by flipping its `revealed` inside the
// trip + upserting — the stop rides in trips.data_json, so it goes through
// tripsApi, not revealSurprise. Mirrors SurprisesView.doReveal's stop branch.
function revealStopSurprise(trips, tripsApi, tripId, stopId) {
  const target = (trips || []).find((t) => t.id === tripId)
  if (!target || !tripsApi) return
  const days = (target.days || []).map((d) => ({
    ...d,
    stops: (d.stops || []).map((st) =>
      st.id === stopId ? { ...st, surprise: { ...st.surprise, revealed: new Date().toISOString() } } : st
    ),
  }))
  tripsApi.upsertTrip({ ...target, days })
}

// Mounted ONLY when there IS a pending arrival surprise. While the app is open,
// geofences the author's own arrival-reveal surprises: within ~150m of the
// chosen place, the surprise unwraps (the author holds the full record, so it
// reveals + syncs normally). Web apps can't watch location in the background, so
// this fires only while foreground — which is when you're actually arriving.
export function ArrivalRevealWatcher({ trip, traveler, trips, tripsApi, onReveal }) {
  const { position } = useGeolocation()
  const firedRef = useRef(new Set())
  useEffect(() => {
    if (!trip?.id || !traveler || !position) return
    // Memory surprises (Slice 2 original).
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
    // Per-stop surprises (Slice 2). The author holds the real trip + reveals via
    // upsertTrip. The teaser stub the recipient gets carries no coords, so only
    // the author's device ever geofences these.
    if (tripsApi) {
      for (const { stop, tripId } of pendingArrivalStopSurprises(trips || [], traveler)) {
        const key = `stop:${stop.id}`
        if (firedRef.current.has(key)) continue
        const r = stop.surprise.reveal
        const d = haversineMeters(position.lat, position.lng, r.lat, r.lng)
        if (Number.isFinite(d) && d <= ARRIVAL_RADIUS_M) {
          firedRef.current.add(key)
          revealStopSurprise(trips, tripsApi, tripId, stop.id)
          onReveal?.(stop)
        }
      }
    }
  }, [trip?.id, traveler, position?.lat, position?.lng])
  return null
}
