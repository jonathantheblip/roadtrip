// tripSyncFlow — the client half of honest trip sync (self-healing-photos
// foundation batch A-1: F1 conflict protection, F2 stuck-sync truth, F5
// resync-before-refresh, F6 pull watchdog).
//
// Plain .js on purpose: everything here is pure or dependency-injected so the
// unit suite (node --test) can drive every branch without a browser or a
// network. workerSync/useTrips/TripIndex/TripEditor wire the real transport
// and stores in; nothing here imports React, the network layer, or storage.

// How many times a conflicting push re-pulls and retries on a fresher base
// before the edit is left QUEUED for the next heartbeat. It is never dropped
// and never re-pushed blind — mirrors MIRROR_CONFLICT_RETRIES on the memory
// side (memoryStore.js), except the terminal state: a trip edit stays pending
// (the queue + the index note own it) rather than adopting the server row,
// because a whole-trip edit is a deliberate human act, not a background patch.
export const TRIP_CONFLICT_RETRIES = 2

// An edit that has waited longer than this reads as stuck ("hasn't reached the
// family yet — still trying"), not merely in flight. Two minutes clears any
// normal push + one heartbeat retry with room to spare.
export const TRIP_PUSH_STALE_MS = 2 * 60 * 1000

// Upper bound on one /trips pull. Long enough for the whole trips table on a
// bad cell link, short enough that a stranded await releases the refresh latch
// well before anyone reaches for a relaunch.
export const PULL_WATCHDOG_MS = 45000

// Convert an optimistic-concurrency base to epoch ms for the wire. Accepts an ISO
// string (what rowToMemory emits) or a raw number; returns NaN for anything that
// can't be a real timestamp (undefined / '' / unparseable), so the caller OMITS it
// and the worker stays last-write-wins. Lives here (not workerSync) so the unit
// suite can reach it; workerSync re-imports it for the memory path.
export function baseToEpochMs(v) {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v) return Date.parse(v)
  return NaN
}

// The exact wire shape of a trip push — extracted from workerSync.pushTrip so
// the unit suite can pin it (workerSync itself is unreachable under node --test:
// extension-less imports). serverUpdatedAt is client bookkeeping, not trip data:
// stripped from the wire copy and re-sent as baseUpdatedAt, the concurrency base
// the worker 409s against — EXCEPT for a draft, which the worker never serves
// back: no fresh base is learnable for one, so a draft push stays deliberately
// base-less (create/recover semantics). A never-synced trip (no finite stamp)
// also sends no base — a safe create under the worker's last-write-wins floor.
export function tripWireBody(trip) {
  const body = { ...trip }
  delete body.serverUpdatedAt
  const base = baseToEpochMs(trip?.serverUpdatedAt)
  if (!trip?.draft && Number.isFinite(base)) body.baseUpdatedAt = base
  return body
}

// Trip content for change comparison, with the sync bookkeeping stripped:
// serverUpdatedAt is the server row stamp a pull/push taught us (the OCC base),
// not trip data — two copies that differ only by it are the SAME trip content.
// Without the strip, every pull would read as a foreign edit to any comparer.
export function tripContentJson(trip) {
  if (!trip || typeof trip !== 'object') return JSON.stringify(trip ?? null)
  const content = { ...trip }
  delete content.serverUpdatedAt
  return JSON.stringify(content)
}

// Reapply a local deliberate edit on top of the freshly-pulled server copy.
// WHOLE-OBJECT by contract (batch A-1): the local edit wins every field it
// carries; fresh contributes only top-level fields the local copy lacks (e.g.
// a worker-resolved hero) plus the fresh OCC base. This is deliberately NOT a
// field-level deep merge of days/parts — the client cannot tell which nested
// field the human edited, so the contract is "deliberate edit wins, on a fresh
// base, bounded": the base closes the stale-BLIND-clobber class, and the
// worker's preserveHiddenStops/Parts still restores anything masked from the
// writer. True per-field trip merging is future work, not this batch.
export function mergeTripOverFresh(localTrip, freshTrip) {
  const merged = { ...freshTrip, ...localTrip }
  merged.serverUpdatedAt = freshTrip?.serverUpdatedAt
  return merged
}

// Recover from a 409 on a trip push (the stored row moved on since our base).
// Protocol mirrors the memory-side resolveSaveConflict: re-pull AS the edit's
// author, reapply our edit on top of the fresh copy (mergeTripOverFresh),
// retry with the fresh base, bounded. Outcomes (the caller owns the queue and
// cache updates):
//   'synced'  — the reapplied edit landed; `trip` carries the new server stamp.
//   'deleted' — the family deleted this trip; the edit must adopt the delete
//               (a stale device must never resurrect it). ONLY the worker's
//               own tombstone answer (`deleted:true` on a 409) proves this —
//               never absence from a pull, which also covers LIVE rows getTrips
//               withholds (the author's draft row mid-publish, a row whose
//               data_json no longer parses). Never reported for a DRAFT copy:
//               a draft is the author's local-only work-in-progress — its push
//               refusal must keep the local copy, so it lands on 'refused'.
//   'refused' — the worker will never take this push (a masked stand-in, or a
//               draft whose published row the family deleted); retrying is
//               pointless — dequeue, local copy stays.
//   'pending' — transient (offline, pull failed, or still conflicting after
//               the bounded retries): the edit STAYS queued for the next
//               heartbeat — never dropped, never pushed blind.
// `storedUpdatedAt` is the row stamp the initiating 409 carried — the recovery
// base for a row the pull can't serve (see the absent branch). `push`/`pull`
// are injected (workerSync.pushTrip/pullTrips) so the unit suite can drive
// every branch without a network.
export async function resolveTripPushConflict({
  trip,
  asTraveler,
  push,
  pull,
  storedUpdatedAt = null,
  retries = TRIP_CONFLICT_RETRIES,
}) {
  // The newest row stamp the worker's 409s have taught us this recovery.
  let knownStored = Number.isFinite(storedUpdatedAt) ? storedUpdatedAt : null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let remote
    try {
      remote = await pull({ asTraveler })
    } catch {
      return { status: 'pending' } // offline mid-recovery — same as a plain failed push
    }
    if (!Array.isArray(remote) || remote.errors?.length) return { status: 'pending' }
    const fresh = remote.find((t) => t?.id === trip.id)
    let merged
    if (fresh) {
      if (fresh.masked) return { status: 'refused' } // never reapply onto a stand-in
      // Always merge the ORIGINAL edit over the latest fresh copy — chaining
      // merged outputs would let a stale fresh-only field outlive a fresher one.
      merged = mergeTripOverFresh(trip, fresh)
    } else {
      // Absent from a successful pull proves NOTHING about deletion: getTrips
      // also withholds LIVE rows it will never serve (a draft:true row — the
      // publish-after-set-aside shape — or a row whose data_json no longer
      // parses). Reading absence as a family delete here destroyed real trips
      // (the Vermont class: publish → 409 → recovery pull misses the hidden
      // draft row → local copy dropped as "deleted"). So: retry on the newest
      // stored stamp the 409s taught us — a hidden-but-live row takes the push
      // (a draft publishes, a corrupt row is repaired by this copy); a
      // genuinely tombstoned row answers deleted:true below, the ONE
      // authoritative delete signal. A draft copy dequeues instead (never
      // served → nothing recoverable by pulling); no known stamp → stay
      // pending — never guess with a blind base-less push.
      if (trip?.draft) return { status: 'refused' }
      if (!Number.isFinite(knownStored)) return { status: 'pending' }
      merged = { ...trip, serverUpdatedAt: knownStored }
    }
    try {
      const res = await push(merged, { asTraveler })
      // Sync-honesty: read the per-item result, never transport success alone.
      if (res === false || res?.skipped) return { status: 'refused' }
      const updatedAt = Number.isFinite(res?.updatedAt) ? res.updatedAt : merged.serverUpdatedAt
      return { status: 'synced', trip: { ...merged, serverUpdatedAt: updatedAt } }
    } catch (err) {
      if (err?.status !== 409) return { status: 'pending' }
      if (err?.body?.deleted) return trip?.draft ? { status: 'refused' } : { status: 'deleted' }
      if (Number.isFinite(err?.body?.storedUpdatedAt)) knownStored = err.body.storedUpdatedAt
      /* someone saved again mid-recovery — loop: re-pull an even fresher base */
    }
  }
  return { status: 'pending' }
}

// The honest index note for edits still owed to the family. Plain family
// language, two registers: in flight (young) vs stuck (older than
// TRIP_PUSH_STALE_MS — the resync is clearly not landing). `oldestAt` is the
// EARLIEST queue stamp (epoch ms, tripSyncQueue.oldestPendingAt); an entry
// with no stamp counts as stuck, so the note errs toward "still trying",
// never toward false calm. Returns null when nothing is pending.
export function pendingTripPushNote(count, oldestAt, now = Date.now()) {
  const n = Number(count)
  if (!Number.isFinite(n) || n < 1) return null
  const oldest = Number.isFinite(oldestAt) ? oldestAt : 0
  if (now - oldest >= TRIP_PUSH_STALE_MS) {
    return n === 1
      ? "A change hasn't reached the family yet — still trying."
      : `${n} changes haven't reached the family yet — still trying.`
  }
  return n === 1
    ? 'A change is still reaching the family…'
    : `${n} changes are still reaching the family…`
}

// One heartbeat of the trips sync lifecycle, in the only safe order: push the
// stranded edits FIRST, then pull. Fired concurrently (`resync(); refresh()`)
// the pull can land before the push and visually revert the editor's own edit
// for one heartbeat — the clobber guard stops carrying the local copy the
// moment markSynced runs, while the pull's snapshot predates the push. A
// failed resync must never block the pull (the resync reports its own
// failures through the queue).
export async function runSyncBeat({ resync, refresh, shouldContinue = () => true }) {
  try {
    await resync()
  } catch {
    /* queue keeps the stranded edits; the pull must still run */
  }
  if (shouldContinue()) await refresh()
}

// F6 — the pull watchdog. One hung /trips fetch would otherwise latch
// useTrips' refresh guard forever (its finally only runs if the promise
// settles), killing live-pull until relaunch — the iOS-PWA resume class.
// AbortSignal.timeout fits the existing plumbing exactly: workerFetch spreads
// opts straight into fetch(), so the signal rides through with no new
// plumbing, bounds the body read too, and a timer frozen by suspension fires
// on resume — the precise moment a stranded await must be released. An
// environment without it just keeps the old unbounded behavior.
export function pullWatchdogSignal(ms = PULL_WATCHDOG_MS) {
  try {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(ms)
    }
  } catch {
    /* detection only — no support, no watchdog */
  }
  return undefined
}
