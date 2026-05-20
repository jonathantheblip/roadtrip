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

  // The single create/update path. Both the manual-add form and the
  // trip editor go through this — one function, one schema, one set of
  // fields (change order 2026-05-17 §3.5). Local cache is written
  // synchronously so the UI is instant and offline-tolerant; the Worker
  // push is awaited so the caller can surface a sync failure instead of
  // silently dropping it. Upsert by id: replace in place if the id is
  // already known, else prepend. Idempotent — re-saving the same record
  // (same client-stable id) updates the one row, never duplicates.
  const upsertTrip = useCallback(async (trip) => {
    setTrips((prev) => {
      const exists = prev.some((t) => t.id === trip.id)
      const next = exists
        ? prev.map((t) => (t.id === trip.id ? trip : t))
        : [trip, ...prev]
      writeCache(next)
      return next
    })
    if (!isWorkerConfigured()) {
      return { ok: true, synced: false, reason: 'unconfigured' }
    }
    try {
      await pushTrip(trip)
      return { ok: true, synced: true }
    } catch (err) {
      // Kept locally; caller decides whether to block (create flow) or
      // proceed (incremental editor autosave). Never silently swallowed.
      console.warn('useTrips upsertTrip: Worker push failed; kept locally', err)
      return { ok: false, synced: false, error: err?.message || String(err) }
    }
  }, [])

  // Back-compat aliases — existing callers (Settings album URL, App
  // create handler) keep working without learning a new name.
  const addTrip = upsertTrip
  const saveTrip = upsertTrip

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

  // Force-push every SEED_TRIP to the Worker, overwriting whatever is
  // already in D1. Used when the seed file picks up an update (a new
  // keypad code, a corrected stop time) and the family needs the
  // change pushed to their phones without waiting for one-by-one edits
  // through the TripEditor. WARNING: this stomps in-app edits to any
  // trip whose id is present in SEED_TRIPS — only use when you know the
  // seed is canonical (the usual case: Claude updated trips.js and just
  // shipped a new build, no one has edited that trip in the app).
  const forcePushSeed = useCallback(async () => {
    if (!isWorkerConfigured()) return { pushed: 0, reason: 'unconfigured' }
    let pushed = 0
    const errors = []
    for (const t of SEED_TRIPS) {
      try {
        await pushTrip(t)
        pushed += 1
      } catch (err) {
        errors.push(`${t.id}: ${err?.message || String(err)}`)
      }
    }
    await refresh()
    return { pushed, errors }
  }, [refresh])

  return { trips, source, loading, error, refresh, upsertTrip, addTrip, saveTrip, removeTrip, seed, forcePushSeed }
}
