// "Who's around" (slice 8) — the client data layer + a small polling hook, plus
// this device sharing its OWN presence. Mirrors lib/proposals.js (multiplayer over
// the existing pull cadence — interval + focus/visibility, no WebSocket) and the
// worker boundary (migration 015).
//
// ★ PRIVACY (settled, enforced on BOTH ends): adults (jonathan/helen) share PRECISE
//   lat/lng; kids share ONLY the coarse "at the cabin / out" bucket they compute
//   on-device. This layer never even SENDS a kid's coordinates (the worker also
//   drops them — belt + braces). Location is shared ONLY while the app is open
//   (foreground); the UI says so and never implies background tracking. Location
//   never goes to Claude / the weave / surprises (nothing here threads into them).

import { useCallback, useEffect, useRef, useState } from 'react'
import { workerFetch, isWorkerConfigured } from './workerSync'
import { buildPresenceBody, coarseBucket } from './presenceRules'

// Pure rules (privacy gate, buckets, freshness) live in ./presenceRules so they
// unit-test without React/workerSync in the import graph. Re-export the bits the
// rest of the app reaches for through this module.
export { ADULTS, isAdultTraveler, coarseBucket, freshness, buildPresenceBody, LIVE_MS } from './presenceRules'

const POLL_MS = 20000
const HEARTBEAT_MS = 60000 // re-post our own presence at most this often

// ─── worker calls ─────────────────────────────────────────────────────────────

export async function fetchPresence(tripId) {
  if (!isWorkerConfigured() || !tripId) return []
  try {
    const r = await workerFetch(`/presence?tripId=${encodeURIComponent(tripId)}`)
    const arr = await r.json()
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

// Share THIS device's presence. Best-effort: a failure (offline / pre-migration)
// is swallowed, presence is not load-bearing.
export async function postPresence({ tripId, traveler, placeBucket, position, note }) {
  if (!isWorkerConfigured() || !tripId || !traveler) return
  const body = buildPresenceBody({ tripId, traveler, placeBucket, position, note })
  try {
    await workerFetch('/presence', { method: 'POST', body: JSON.stringify(body) })
  } catch {
    /* offline / not enabled — silent */
  }
}

// ─── the hook ───────────────────────────────────────────────────────────────

// usePresence(tripId, { enabled, traveler, place, position, note })
//   → { people, refresh }
// Polls the family's presence gently (mirror useProposals). When `enabled` (a live
// stay, foreground), ALSO shares this device's own presence: on mount, whenever the
// coarse bucket changes, and on a heartbeat. When not enabled, it shares nothing
// (silent pause — others just see the row go idle).
export function usePresence(tripId, { enabled = false, traveler, place, position, note } = {}) {
  const [people, setPeople] = useState([])
  const tripRef = useRef(tripId)
  tripRef.current = tripId

  const refresh = useCallback(async () => {
    const t = tripRef.current
    if (!t) {
      setPeople([])
      return
    }
    const list = await fetchPresence(t)
    if (tripRef.current === t) setPeople(list)
  }, [])

  // Poll the family's presence.
  useEffect(() => {
    if (!tripId || !isWorkerConfigured()) {
      setPeople([])
      return undefined
    }
    let alive = true
    const tick = () => { if (alive) refresh() }
    tick()
    const interval = setInterval(tick, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', tick)
    return () => {
      alive = false
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', tick)
    }
  }, [tripId, refresh])

  // Share THIS device's presence while enabled. Latest position/note are read from
  // refs so the heartbeat always sends the freshest fix without re-subscribing on
  // every GPS jitter; a bucket CHANGE re-posts immediately.
  const bucket = enabled ? coarseBucket(place, position) : null
  const posRef = useRef(position)
  posRef.current = position
  const noteRef = useRef(note)
  noteRef.current = note
  useEffect(() => {
    if (!enabled || !tripId || !traveler || !isWorkerConfigured()) return undefined
    let alive = true
    const send = async () => {
      if (!alive) return
      await postPresence({
        tripId,
        traveler,
        placeBucket: bucket || 'unknown',
        position: posRef.current,
        note: noteRef.current,
      })
      if (alive) refresh()
    }
    send()
    // Heartbeat keeps the live dot honest; pause posting while hidden (foreground-only).
    const hb = setInterval(() => { if (document.visibilityState !== 'hidden') send() }, HEARTBEAT_MS)
    return () => {
      alive = false
      clearInterval(hb)
    }
  }, [enabled, tripId, traveler, bucket, note, refresh])

  return { people, refresh }
}
