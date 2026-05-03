import { useCallback, useEffect, useState } from 'react'
import { TRIPS as SEED_TRIPS } from '../data/trips'
import { pullTrips, pushTrip, deleteTrip, isWorkerConfigured } from '../lib/workerSync'

// useTrips — single source of truth for the trip list.
//
// The sync Worker is canonical when reachable; trips.js (`SEED_TRIPS`)
// is the fallback for cold-start / offline / unconfigured Worker.
// Local cache in localStorage bridges launches before the first pull
// completes so the app boots instantly.
//
// Reads:
//   1. Hydrate from localStorage cache (instant, possibly stale).
//   2. If empty, fall back to SEED_TRIPS.
//   3. Once mounted, pullTrips() from the Worker and replace the cache.
//
// Writes:
//   • addTrip(trip) — push to Worker, then update local cache.
//   • saveTrip(trip) — same path, used for in-place edits (e.g. setting
//     sharedAlbumURL).
//   • removeTrip(id), seed() helper for the Settings button.

const CACHE_KEY = 'rt_trips_cache_v1'

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length ? parsed : null
  } catch {
    return null
  }
}

function writeCache(trips) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(trips))
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function useTrips() {
  // Initial render uses the cache if present, else the seed. Either
  // way the UI never sees an empty list.
  const [trips, setTrips] = useState(() => readCache() || SEED_TRIPS)
  const [source, setSource] = useState(() => (readCache() ? 'cache' : 'seed'))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!isWorkerConfigured()) {
      // Stays on cache/seed — no network attempt.
      return
    }
    setLoading(true)
    setError(null)
    try {
      const remote = await pullTrips()
      if (remote.length) {
        writeCache(remote)
        setTrips(remote)
        setSource('worker')
      } else {
        // Worker returned zero — keep showing whatever we had so a
        // pre-seed state doesn't blank the app. The Settings panel
        // exposes a Seed button for the first-run case.
      }
      // Surface per-source pull diagnostics even when remote.length is 0
      // so Settings can show why a pull came back empty.
      if (remote.errors?.length) {
        setError(remote.errors.join(' · '))
      }
    } catch (err) {
      console.warn('useTrips refresh failed', err)
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addTrip = useCallback(async (trip) => {
    // Local update is synchronous so the UI flips immediately;
    // Worker push is fire-and-forget. If the push fails the trip
    // still lives in the cache and will retry on next refresh.
    setTrips((prev) => {
      const next = [trip, ...prev.filter((t) => t.id !== trip.id)]
      writeCache(next)
      return next
    })
    if (isWorkerConfigured()) {
      const ok = await pushTrip(trip)
      if (!ok) console.warn('useTrips addTrip: Worker push failed; kept locally')
    }
  }, [])

  const saveTrip = useCallback(async (trip) => {
    setTrips((prev) => {
      const next = prev.map((t) => (t.id === trip.id ? trip : t))
      writeCache(next)
      return next
    })
    if (isWorkerConfigured()) {
      await pushTrip(trip)
    }
  }, [])

  const removeTrip = useCallback(async (id) => {
    setTrips((prev) => {
      const next = prev.filter((t) => t.id !== id)
      writeCache(next)
      return next
    })
    if (isWorkerConfigured()) {
      await deleteTrip(id)
    }
  }, [])

  // One-shot seeder for the Settings button. Pushes any SEED_TRIPS the
  // remote doesn't already have. Idempotent — re-running is safe.
  const seed = useCallback(async () => {
    if (!isWorkerConfigured()) return { pushed: 0, reason: 'unconfigured' }
    const remote = await pullTrips()
    const existing = new Set(remote.map((t) => t.id))
    let pushed = 0
    for (const t of SEED_TRIPS) {
      if (existing.has(t.id)) continue
      const ok = await pushTrip(t)
      if (ok) pushed += 1
    }
    await refresh()
    return { pushed }
  }, [refresh])

  return { trips, source, loading, error, refresh, addTrip, saveTrip, removeTrip, seed }
}
