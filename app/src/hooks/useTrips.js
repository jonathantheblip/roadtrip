import { useCallback, useEffect, useRef, useState } from 'react'
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
import { markDeleted, clearDeleted, deletedIds, withoutDeleted } from '../lib/deleteTombstones'
import { resolveTripPushConflict, runSyncBeat } from '../lib/tripSyncFlow'

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
// The one sync heartbeat: how often to re-attempt pushing trip edits that
// haven't reached the family, AND how often to re-pull so another device's
// edit shows up here without waiting for this device to foreground/reload.
// Short enough that a stranded edit clears within seconds of reconnect (the
// `online` event is unreliable on iOS), but not a tight loop. Matches the
// existing polling ceiling elsewhere in this codebase (presence.js/
// proposals.js both already poll at this same cadence).
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
  // Re-entrancy guard: mount, 'online', visibilitychange, AND the periodic
  // heartbeat can all fire refresh() close together (e.g. a device coming
  // online right as the interval ticks) — the merge itself is idempotent
  // either way, but there's no reason to fire two overlapping pulls. Lives
  // INSIDE refresh (not the lifecycle effect) so every trigger shares this
  // same guard automatically; a direct pullTrips() caller (seed()) is
  // unaffected.
  const refreshingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!isWorkerConfigured()) {
      // Stays on cache/seed — no network attempt.
      return
    }
    if (refreshingRef.current) return
    refreshingRef.current = true
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
        const localCache = readCache() || []
        // DRAFT PRESERVATION: the worker never serves a draft (getTrips filters
        // `draft:true`), so a pull's `merged` array never contains the author's own
        // drafts. Without this, `setTrips(merged)` would silently drop every local
        // draft on the next pull — the second half of the "draft vanished" bug. Keep
        // every local draft that the remote didn't return, so a draft is only ever
        // removed by an explicit delete, never by a routine sync.
        const localDraftIds = localCache.filter((t) => t.draft).map((t) => t.id)
        const carryIds = [...new Set([...unsynced, ...localDraftIds])]
        if (carryIds.length) {
          const byId = new Map(merged.map((t) => [t.id, t]))
          for (const id of carryIds) {
            const localT = localCache.find((t) => t.id === id)
            if (localT) byId.set(id, localT)
          }
          merged = [...byId.values()]
        }
        // RESURRECTION GUARD: drop any trip the family DELETED whose remote delete
        // hasn't confirmed yet. The worker may still serve the stale row (its DELETE
        // never landed), but a tombstoned id must never come back — the resync keeps
        // retrying the delete, and this skip holds the line until the server confirms.
        merged = withoutDeleted('trip', merged)
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
      refreshingRef.current = false
      setLoading(false)
    }
  }, [])

  // Carry the server-issued row stamp onto the local copy after a confirmed
  // push, so the NEXT edit/push of this trip sends a fresh, server-sourced OCC
  // base. Monotonic — never lowers an existing stamp (two overlapping pushes
  // may resolve out of order). Mirrors recordServerUpdatedAt on the memory side.
  const stampTripSynced = useCallback((id, updatedAt) => {
    if (!Number.isFinite(updatedAt)) return
    setTrips((prev) => {
      let changed = false
      const next = prev.map((t) => {
        if (t.id !== id) return t
        if (Number.isFinite(t.serverUpdatedAt) && t.serverUpdatedAt >= updatedAt) return t
        changed = true
        return { ...t, serverUpdatedAt: updatedAt }
      })
      if (changed) writeCache(next)
      return changed ? next : prev
    })
  }, [])

  // Land a specific reconciled trip (conflict-recovery output) in state + cache.
  // Replace-by-id only — never re-adds an id that's gone locally (it may have
  // been deleted here mid-recovery, and the tombstone owns that story).
  const adoptTripLocally = useCallback((next) => {
    if (!next?.id) return
    setTrips((prev) => {
      if (!prev.some((t) => t.id === next.id)) return prev
      const out = prev.map((t) => (t.id === next.id ? next : t))
      writeCache(out)
      return out
    })
  }, [])

  // The family deleted this trip on another device while an edit here was
  // still pending. The delete wins: stop retrying and drop the local copy, so
  // a stale device can never resurrect what the family removed. A DRAFT copy
  // stays — drafts are the author's local work-in-progress, never served by a
  // pull; it simply stops being owed to the family.
  const adoptFamilyDelete = useCallback((trip) => {
    markSynced(trip.id)
    if (trip.draft) return
    setTrips((prev) => {
      const next = prev.filter((t) => t.id !== trip.id)
      if (next.length === prev.length) return prev
      writeCache(next)
      return next
    })
  }, [])

  // Recover a refused-as-stale push (409): pull fresh, reapply this edit on
  // top, retry on the fresh base — bounded, never blind (tripSyncFlow). Shared
  // by the foreground save and the background resync so the two can't drift.
  const recoverConflict = useCallback(async (trip, err, asTraveler) => {
    if (err?.body?.deleted) {
      // Short-circuit: the 409 already says the trip is tombstoned — no pull
      // can teach us more (a deleted trip is absent from every pull anyway).
      // A draft lands on 'refused' (dequeue, keep the local copy) — same rule
      // as inside resolveTripPushConflict.
      return trip?.draft ? { status: 'refused' } : { status: 'deleted' }
    }
    // Hand the recovery the row stamp this 409 carried: a row the pull can't
    // serve (a draft:true row mid-publish, a corrupt data_json row) is only
    // reachable on exactly that base — absence from the pull must never be
    // read as a family delete (tripSyncFlow owns that contract).
    return resolveTripPushConflict({
      trip,
      asTraveler,
      push: pushTrip,
      pull: pullTrips,
      storedUpdatedAt: err?.body?.storedUpdatedAt,
    })
  }, [])

  // The single create/update path. Both the manual-add form and the
  // trip editor go through this — one function, one schema, one set of
  // fields (change order 2026-05-17 §3.5). Local cache is written
  // synchronously so the UI is instant and offline-tolerant; the Worker
  // push is awaited so the caller can surface a sync failure instead of
  // silently dropping it. Upsert by id: replace in place if the id is
  // already known, else prepend. Idempotent — re-saving the same record
  // (same client-stable id) updates the one row, never duplicates.
  // Returns { ok, synced, updatedAt? }: updatedAt is the server row stamp when
  // the push (or its conflict recovery) confirmed — the caller's own working
  // copy needs it as the base of its next save.
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
    // DRAFT GATE: a draft is the author's private work-in-progress — the rest of
    // the family must NOT see it until it's published. But "set aside as a draft"
    // must NEVER destroy the trip (the bug that ate the Vermont trip: this branch
    // used to call deleteTrip, a SOFT-DELETE on the server, and the trip vanished
    // with no way back). Instead we PUSH the draft: it carries `draft:true` in its
    // data_json, so the worker's getTrips read-filter (`t.draft !== true`) keeps it
    // out of every other device's pull and away from Claude — yet the row survives,
    // recoverable on any device (publish re-pushes draft:false, the same row). The
    // local cache (written above) keeps it instant; the push is best-effort so an
    // offline draft still saves locally and the resync loop is told to leave it be.
    if (trip.draft) {
      // Optimistically clear the queue (a draft isn't "owed to the family"), but
      // if the push fails — offline, e.g. creating a trip at a cabin with no
      // signal — queue it so resync re-pushes the recovery row when signal
      // returns. The worker hides draft:true from every pull and from Claude, so
      // re-pushing never leaks it; losing the trip is the failure we're fixing,
      // and the local copy is never dropped (clobber guard).
      markSynced(trip.id)
      pushTrip(trip)
        .then((res) => {
          // Learn the bumped row stamp (the worker restamps every push) so the
          // eventual PUBLISH of this trip carries a fresh base — otherwise
          // every set-aside-then-publish cycle pushes a guaranteed-stale base
          // and pays a full 409 recovery.
          if (Number.isFinite(res?.updatedAt)) stampTripSynced(trip.id, res.updatedAt)
        })
        .catch(() => markUnsynced(trip.id, getActiveTraveler()))
      return { ok: true, synced: false, reason: 'draft' }
    }
    try {
      const reached = await pushTrip(trip)
      if (reached === false || reached?.skipped) {
        // pushTrip REFUSED without throwing — a masked/surprise projection (3b) is a
        // per-recipient stand-in that is never authoritative and must never overwrite
        // the author's real row, so the worker (and pushTrip) decline to persist it. It
        // did NOT reach the family: report honestly (synced:false), and do NOT mark it
        // unsynced — a retry would be refused forever. (This case used to fall through to
        // markSynced + {synced:true}, a lie: the badge said "synced" when nothing shipped.)
        // `reached?.skipped` is the worker's own refusal shape — read the per-item
        // result, never transport success alone.
        return { ok: false, synced: false, reason: 'refused' }
      }
      // Carry the server row stamp as the base of this trip's NEXT save, so a
      // later stale copy is refused (409) instead of clobbering. `updatedAt`
      // rides back to the caller too — the trip editor teaches its own working
      // copy the fresh base with it (its clone never sees the trips state).
      const stamp = Number.isFinite(reached?.updatedAt) ? reached.updatedAt : undefined
      if (stamp !== undefined) stampTripSynced(trip.id, stamp)
      markSynced(trip.id) // reached the family — clear any prior unsynced flag
      return { ok: true, synced: true, updatedAt: stamp }
    } catch (err) {
      if (err?.status === 409) {
        // The stored trip moved on since our base (another device saved, or the
        // family deleted it). Recover deliberately — pull fresh, reapply this
        // edit on top, retry on the fresh base — never blind-overwrite.
        // Queue FIRST: recovery spans seconds of pulls and retries, and only a
        // queued id is carried by refresh()'s clobber guard — unqueued, a
        // concurrent heartbeat pull would swap the cache to the server copy
        // mid-recovery, and a 'pending' outcome would then resync the WRONG
        // (server) content as if it were this edit. Every terminal outcome
        // below settles the queue: synced/refused dequeue here, a family
        // delete dequeues inside adoptFamilyDelete, pending stays queued.
        markUnsynced(trip.id, getActiveTraveler())
        const out = await recoverConflict(trip, err)
        if (out.status === 'synced') {
          adoptTripLocally(out.trip)
          markSynced(trip.id)
          return {
            ok: true,
            synced: true,
            updatedAt: Number.isFinite(out.trip?.serverUpdatedAt) ? out.trip.serverUpdatedAt : undefined,
          }
        }
        if (out.status === 'deleted') {
          adoptFamilyDelete(trip)
          return { ok: false, synced: false, reason: 'deleted', error: 'This trip was deleted on another device.' }
        }
        if (out.status === 'refused') {
          markSynced(trip.id) // never ours to sync (a stand-in) — don't retry forever
          return { ok: false, synced: false, reason: 'refused' }
        }
        // Still conflicting / transient mid-recovery: the edit STAYS pending
        // (queued above) — the resync retries it against a fresh pull; the
        // badge + index note say so honestly (never dropped, never pushed blind).
        return { ok: false, synced: false, queued: true, error: 'Another device saved this trip at the same time — still trying.' }
      }
      // The push didn't reach the family. Remember it so resync can re-push it
      // on the next opportunity (reopen / network back / interval), instead of
      // stranding the edit on this device forever. The caller still gets a
      // synced:false result so its UI can be honest about it; `queued` lets the
      // badge show "still reaching the family" rather than a dead-end error.
      markUnsynced(trip.id, getActiveTraveler()) // capture the editor for an honest resync
      console.warn('useTrips upsertTrip: Worker push failed; kept locally', err)
      return { ok: false, synced: false, queued: true, error: err?.message || String(err) }
    }
  }, [stampTripSynced, adoptTripLocally, adoptFamilyDelete, recoverConflict])

  // Self-healing: re-push any trip edit that hasn't reached the family yet,
  // from the freshest cached version. Best-effort — a still-failing push leaves
  // the id queued for the next attempt. Pure local read of the cache (not the
  // `trips` closure) so it always pushes the latest persisted state.
  const resyncPending = useCallback(async () => {
    const remainingCount = () => pendingIds().length + deletedIds('trip').length
    if (!isWorkerConfigured()) return { resynced: 0, remaining: remainingCount() }
    let resynced = 0
    // 1) Re-push pending EDITS (unsynced trip changes).
    const entries = pendingEntries()
    if (entries.length) {
      const cache = readCache() || []
      for (const { id, author } of entries) {
        const t = cache.find((x) => x.id === id)
        if (!t || t.masked) {
          // Trip gone locally, or a masked projection that must never be pushed —
          // either way it's not ours to sync. Drop it from the queue.
          markSynced(id)
          continue
        }
        // A draft re-pushes fine: it carries draft:true, which the worker's getTrips
        // read-filter hides from every other device and from Claude, so syncing the
        // recovery row never leaks the author's private work-in-progress. This is the
        // recovery net for a draft created offline (a cabin with no signal).
        try {
          // Push AS the editor who made the change (captured at mark time), not
          // whoever is active now — so the worker's per-writer masking/clobber
          // guards apply to the real author. Null author → active traveler (old rows).
          const res = await pushTrip(t, { asTraveler: author || undefined })
          if (res === false || res?.skipped) {
            // Refused (a stand-in slipped in after the cache read) — never ours
            // to sync; same drop as the masked check above.
            markSynced(id)
            continue
          }
          if (Number.isFinite(res?.updatedAt)) stampTripSynced(id, res.updatedAt)
          markSynced(id)
          resynced += 1
        } catch (err) {
          if (err?.status === 409) {
            // Our queued copy is STALE against the family's — the exact clobber
            // this guard exists for. Recover on a fresh base (pull-as-author,
            // reapply, bounded retry) instead of blind re-pushing every 20s.
            const out = await recoverConflict(t, err, author || undefined)
            if (out.status === 'synced') {
              adoptTripLocally(out.trip)
              markSynced(id)
              resynced += 1
            } else if (out.status === 'deleted') {
              adoptFamilyDelete(t)
            } else if (out.status === 'refused') {
              markSynced(id)
            }
            /* 'pending': leave it queued; the next trigger retries fresh */
          }
          /* other errors: leave it queued; the next trigger retries */
        }
      }
    }
    // 2) Retry pending DELETES (tombstones) — a delete that never reached the family.
    // Until each confirms, the pull-side guard (withoutDeleted) keeps the trip from
    // resurrecting. deleteTrip is idempotent (a second DELETE of a gone row is fine).
    for (const id of deletedIds('trip')) {
      const gone = await deleteTrip(id)
      if (gone !== false) {
        clearDeleted('trip', id) // confirmed gone on the server
        resynced += 1
      }
      /* else: keep the tombstone; the next trigger retries, pulls keep skipping it */
    }
    return { resynced, remaining: remainingCount() }
  }, [stampTripSynced, adoptTripLocally, adoptFamilyDelete, recoverConflict])

  // Reflect the unsynced-count so an indicator can show "N changes haven't
  // reached the family yet."
  useEffect(() => subscribeUnsynced(setUnsyncedCount), [])

  // Self-healing lifecycle: attempt a resync AND a re-pull on cold load (pick
  // up edits stranded by a prior session, and another device's edits made
  // while this one was away), when the network returns, when the app comes
  // back to the foreground, and on a short interval (the iOS `online` event
  // is unreliable). Mirrors the photo upload-queue drain triggers in
  // App.jsx. The pull half is what makes a SECOND device's agenda edit show
  // up here without waiting for this device to foreground or reload —
  // refresh()'s own clobber/draft/resurrection guards already protect any
  // edit this device hasn't pushed yet, so pulling on the same heartbeat as
  // the push-resync is safe.
  useEffect(() => {
    let stopped = false
    const attempt = () => {
      if (!stopped) {
        // Push-then-pull, SERIALIZED (runSyncBeat): fired concurrently, the
        // pull could land before this device's own push and visually revert a
        // just-made edit for one heartbeat. Not awaited here — triggers stay
        // fire-and-forget exactly as before.
        runSyncBeat({ resync: resyncPending, refresh, shouldContinue: () => !stopped })
      }
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
  }, [resyncPending, refresh])

  // Back-compat aliases — existing callers (Settings album URL, App
  // create handler) keep working without learning a new name.
  const addTrip = upsertTrip
  const saveTrip = upsertTrip

  const removeTrip = useCallback(async (id) => {
    // Tombstone the id BEFORE removing it locally. This is the fix for the
    // "deleted trip resurrects" bug: deleteTrip silently returned false on a network
    // failure, removeTrip ignored it, and the next pull re-added the trip from the
    // stale D1 row. Now the tombstone (a) survives a reload so it outlives a failed
    // delete, (b) makes every pull SKIP this id (refresh's merge filters it), and
    // (c) is retried by the resync — the trip stays gone until the server confirms it.
    markDeleted('trip', id)
    setTrips((prev) => {
      const next = prev.filter((t) => t.id !== id)
      writeCache(next)
      return next
    })
    if (!isWorkerConfigured()) {
      clearDeleted('trip', id) // no worker → the local delete is the whole story
      return { ok: true, synced: false, reason: 'unconfigured' }
    }
    const gone = await deleteTrip(id)
    if (gone === false) {
      // The delete didn't reach the family. KEEP the tombstone: the resync retries it
      // and every pull skips it, so the stale server row can't resurrect the trip.
      return { ok: false, synced: false, error: 'delete not confirmed' }
    }
    clearDeleted('trip', id) // confirmed gone on the server
    return { ok: true, synced: true }
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
      try {
        const ok = await pushTrip(t)
        // Honest per-item read: a refusal (false / a worker `skipped` shape) was
        // left untouched, never "added".
        if (ok && !ok?.skipped) pushed += 1
        else skipped += 1
      } catch (err) {
        // A tombstoned seed trip 409s (the worker's resurrection guard): the
        // family deleted it, and additive-only means a reseed never undoes a
        // deletion. Counts as untouched, same as an existing live trip. Any
        // OTHER failure (offline, worker error) rethrows so Settings reports
        // "Seed failed" — a fully-failed seed must never read as "the family
        // already has every bundled trip".
        if (err?.status !== 409) throw err
        skipped += 1
      }
    }
    await refresh()
    return { pushed, skipped }
  }, [refresh])

  return { trips, source, loading, error, refresh, upsertTrip, addTrip, saveTrip, removeTrip, seed, resyncPending, unsyncedCount }
}
