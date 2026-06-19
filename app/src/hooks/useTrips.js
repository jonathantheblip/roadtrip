import { useCallback, useEffect, useState } from 'react'
import { TRIPS as SEED_TRIPS } from '../data/trips'
import { pullTrips, pushTrip, deleteTrip, isWorkerConfigured, getActiveTraveler } from '../lib/workerSync'
import {
  markUnsynced,
  markSynced,
  pendingIds,
  pendingEntries,
  count as unsyncedCountNow,
  subscribe as subscribeUnsynced,
} from '../lib/tripSyncQueue'

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
// How often to re-attempt pushing trip edits that haven't reached the family.
// Short enough that a stranded edit clears within seconds of reconnect (the
// `online` event is unreliable on iOS), but not a tight loop.
const TRIP_RESYNC_INTERVAL_MS = 20000

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

// Seed-authoritative narrative fields. The per-traveler letters
// (`trip.travelerNotes` — e.g. Aurelia's must-keep "note from Dad") are
// authored in the seed (data/trips.js) and NEVER created or edited
// in-app. A trip's D1/cache copy can predate a letter being added, and
// the Worker is canonical on pull — so without this a stale remote copy
// silently drops the letter (it disappears after the first sync). We keep
// the seed authoritative for travelerNotes ONLY (everything else still
// syncs from the Worker as normal): overlay the seed's note onto any
// trip whose id matches a seed trip that carries one.
const SEED_NOTES = new Map(
  SEED_TRIPS.filter((t) => t.travelerNotes).map((t) => [t.id, t.travelerNotes])
)
function withSeedNotes(trips) {
  if (!Array.isArray(trips)) return trips
  return trips.map((t) => {
    const note = SEED_NOTES.get(t.id)
    return note ? { ...t, travelerNotes: note } : t
  })
}

export function useTrips() {
  // Initial render uses the cache if present, else the seed. Either
  // way the UI never sees an empty list.
  const [trips, setTrips] = useState(() => withSeedNotes(readCache() || SEED_TRIPS))
  const [source, setSource] = useState(() => (readCache() ? 'cache' : 'seed'))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // How many trip edits haven't reached the family yet (for an honest "syncing…"
  // cue). Driven by lib/tripSyncQueue, which survives reloads.
  const [unsyncedCount, setUnsyncedCount] = useState(() => unsyncedCountNow())

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
        // Overlay seed-authoritative letters so a stale remote copy that
        // predates a travelerNotes addition doesn't drop it (see above).
        let merged = withSeedNotes(remote)
        // CLOBBER GUARD: a trip with a local edit that hasn't reached the
        // family yet must NOT be overwritten by the Worker's older copy on
        // pull — that would lose the edit even on the author's device. Keep
        // the local version for any unsynced id until resync pushes it; the
        // resync (below) then makes the Worker canonical again.
        const unsynced = pendingIds()
        if (unsynced.length) {
          const localCache = readCache() || []
          const byId = new Map(merged.map((t) => [t.id, t]))
          for (const id of unsynced) {
            const localT = localCache.find((t) => t.id === id)
            if (localT) byId.set(id, localT)
          }
          merged = [...byId.values()]
        }
        writeCache(merged)
        setTrips(merged)
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
    // DRAFT GATE: a manual-add draft is the author's private work-in-progress —
    // it must NOT reach the shared worker (and the rest of the family) until it
    // is published. It lives in the local cache (written above) so the author
    // still has it; publishing flips draft:false and re-saves through this same
    // path, which then pushes. Also clear any stale unsynced flag so a trip that
    // was un-published back to draft stops being retried by the resync loop.
    if (trip.draft) {
      markSynced(trip.id)
      // A trip flipped back to draft (un-published) must be PULLED BACK from the
      // worker, or the family keeps seeing the stale published copy. Best-effort,
      // worker-only (the local cache above keeps the draft); idempotent for a
      // never-published draft (the row simply isn't there to delete).
      deleteTrip(trip.id).catch(() => {})
      return { ok: true, synced: false, reason: 'draft' }
    }
    try {
      await pushTrip(trip)
      markSynced(trip.id) // reached the family — clear any prior unsynced flag
      return { ok: true, synced: true }
    } catch (err) {
      // The push didn't reach the family. Remember it so resync can re-push it
      // on the next opportunity (reopen / network back / interval), instead of
      // stranding the edit on this device forever. The caller still gets a
      // synced:false result so its UI can be honest about it.
      markUnsynced(trip.id, getActiveTraveler()) // capture the editor for an honest resync
      console.warn('useTrips upsertTrip: Worker push failed; kept locally', err)
      return { ok: false, synced: false, error: err?.message || String(err) }
    }
  }, [])

  // Self-healing: re-push any trip edit that hasn't reached the family yet,
  // from the freshest cached version. Best-effort — a still-failing push leaves
  // the id queued for the next attempt. Pure local read of the cache (not the
  // `trips` closure) so it always pushes the latest persisted state.
  const resyncPending = useCallback(async () => {
    if (!isWorkerConfigured()) return { resynced: 0, remaining: pendingIds().length }
    const entries = pendingEntries()
    if (!entries.length) return { resynced: 0, remaining: 0 }
    const cache = readCache() || []
    let resynced = 0
    for (const { id, author } of entries) {
      const t = cache.find((x) => x.id === id)
      if (!t || t.masked || t.draft) {
        // Trip gone locally, a masked projection that must never be pushed, or
        // a draft that's the author's private work-in-progress (don't leak it to
        // the family until it's published) — either way it's not ours to sync.
        // Drop it from the queue.
        markSynced(id)
        continue
      }
      try {
        // Push AS the editor who made the change (captured at mark time), not
        // whoever is active now — so the worker's per-writer masking/clobber
        // guards apply to the real author. Null author → active traveler (old rows).
        await pushTrip(t, { asTraveler: author || undefined })
        markSynced(id)
        resynced += 1
      } catch {
        /* leave it queued; the next trigger retries */
      }
    }
    return { resynced, remaining: pendingIds().length }
  }, [])

  // Reflect the unsynced-count so an indicator can show "N changes haven't
  // reached the family yet."
  useEffect(() => subscribeUnsynced(setUnsyncedCount), [])

  // Self-healing lifecycle: attempt a resync on cold load (pick up edits
  // stranded by a prior session), when the network returns, when the app comes
  // back to the foreground, and on a short interval (the iOS `online` event is
  // unreliable). Mirrors the photo upload-queue drain triggers in App.jsx.
  useEffect(() => {
    let stopped = false
    const attempt = () => {
      if (!stopped) resyncPending()
    }
    attempt()
    const onOnline = () => attempt()
    const onVis = () => {
      if (document.visibilityState === 'visible') attempt()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVis)
    const iv = setInterval(attempt, TRIP_RESYNC_INTERVAL_MS)
    return () => {
      stopped = true
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVis)
      clearInterval(iv)
    }
  }, [resyncPending])

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

  // The one seed action (Settings "Seed trips"). ADDITIVE-ONLY by design: it
  // pushes any bundled SEED_TRIP the family is MISSING and never touches a trip
  // that already exists on the Worker. That makes it safe to run anytime — it
  // cannot revert an in-app edit or clobber a surprise someone planned, because
  // it never overwrites a live trip. To change a trip that already exists, edit
  // it in the app: that edit syncs to the whole family on its own, and the
  // worker's per-writer guards protect any stops hidden from the editor. Reports
  // how many trips it added vs. left untouched so the Settings note stays honest.
  //
  // (This replaces the old destructive force-push, which overwrote every bundled
  // trip with the file's copy — wiping in-app edits and any surprise hidden from
  // whoever pushed. That footgun is intentionally gone.)
  const seed = useCallback(async () => {
    if (!isWorkerConfigured()) return { pushed: 0, skipped: 0, reason: 'unconfigured' }
    const remote = await pullTrips()
    const existing = new Set(remote.map((t) => t.id))
    let pushed = 0
    let skipped = 0
    for (const t of SEED_TRIPS) {
      if (existing.has(t.id)) { skipped += 1; continue } // already live → never overwrite
      const ok = await pushTrip(t)
      if (ok) pushed += 1
    }
    await refresh()
    return { pushed, skipped }
  }, [refresh])

  return { trips, source, loading, error, refresh, upsertTrip, addTrip, saveTrip, removeTrip, seed, resyncPending, unsyncedCount }
}
