// Cross-device "Wave hi!" (migration 016) — the client data layer + the receive
// hook. Sending a wave POSTs it; the recipient's device polls for unseen waves
// addressed to them (the same gentle cadence the rest uses), pops a friendly cue,
// and marks them seen so each shows once. A wave carries no location/content —
// just who waved at whom — and never touches Claude/the weave.

import { useCallback, useEffect, useRef, useState } from 'react'
import { workerFetch, isWorkerConfigured } from './workerSync'

function newId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `wave_${crypto.randomUUID()}`
  } catch {
    /* fall through */
  }
  return `wave_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`
}

// Send a wave to `to` on this trip. Best-effort (offline / pre-migration is
// swallowed — the on-screen flip is optimistic delight, not load-bearing).
export async function sendWave(tripId, to) {
  if (!isWorkerConfigured() || !tripId || !to) return
  try {
    await workerFetch('/waves', { method: 'POST', body: JSON.stringify({ id: newId(), tripId, to }) })
  } catch {
    /* silent */
  }
}

export async function fetchWaves(tripId) {
  if (!isWorkerConfigured() || !tripId) return []
  try {
    const r = await workerFetch(`/waves?tripId=${encodeURIComponent(tripId)}`)
    const arr = await r.json()
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

const POLL_MS = 15000

// useWaves(tripId, { enabled }) → { waves, markSeen }
// Polls the unseen waves addressed to ME; markSeen(ids) tells the worker they've
// been shown AND drops them locally so the cue moves on to the next.
export function useWaves(tripId, { enabled = true } = {}) {
  const [waves, setWaves] = useState([])
  const tripRef = useRef(tripId)
  tripRef.current = tripId

  const refresh = useCallback(async () => {
    const t = tripRef.current
    if (!t) {
      setWaves([])
      return
    }
    const list = await fetchWaves(t)
    if (tripRef.current === t) setWaves(list)
  }, [])

  useEffect(() => {
    if (!enabled || !tripId || !isWorkerConfigured()) {
      setWaves([])
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
  }, [enabled, tripId, refresh])

  const markSeen = useCallback(async (ids) => {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean)
    if (!list.length) return
    setWaves((cur) => cur.filter((w) => !list.includes(w.id))) // optimistic — show once
    try {
      await workerFetch('/waves/seen', { method: 'POST', body: JSON.stringify({ ids: list }) })
    } catch {
      /* it'll re-appear on the next poll if the mark didn't stick — harmless */
    }
  }, [])

  return { waves, markSeen }
}
