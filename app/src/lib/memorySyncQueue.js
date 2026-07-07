// memorySyncQueue — a tiny, persistent record of memory edits that haven't
// reached the family yet (the Worker mirror failed, or the device was
// offline). The memory-side sibling of tripSyncQueue, with one deliberate
// difference: entries store INTENT, not state, because the two intents replay
// with OPPOSITE semantics (research critique-0 #2 — conflating them destroys
// the fix):
//
//   { kind: 'save', memoryId }         — re-push the CURRENT local record.
//     Content edits are whole-record by design; the record itself carries the
//     latest content, so the intent is just "this record is owed".
//   { kind: 'move', memoryId, stopId } — re-apply the STORED target through
//     the provenance-aware reapply. The stopId here IS the intent, captured at
//     move time; it must NEVER be re-derived from the live record at drain
//     time — a pull may have overwritten the local filing in between, and
//     merging-from-live would replay the overwrite instead of the decision.
//     Stage B (migration 017) extends this entry with `prov`, the provenance
//     the move stamps.
//
// One entry per (memoryId, kind): a newer move intent REPLACES the stored
// target (the latest decision is the intent); a re-marked entry keeps the
// EARLIEST failure stamp so age answers "how long out of sync", not "when did
// the latest retry fail". Dequeue happens ONLY on worker-confirmed outcomes —
// the drain owns that; this module is pure storage + fan-out.
//
// localStorage-backed so a stranded edit outlives the session that failed to
// push it. No network, no React.

import { emitOutcome as emitSyncOutcome, subscribeOutcomes as subscribeSyncOutcomes } from './syncOutcomes.js'

const KEY = 'rt_memories_unsynced_v1'
const INTENT_KINDS = ['save', 'move']
const subs = new Set()

function entryKey(memoryId, kind) {
  return `${kind}:${memoryId}`
}

function read() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(a)) return []
    return a.filter(
      (x) =>
        x &&
        typeof x.memoryId === 'string' &&
        INTENT_KINDS.includes(x.kind)
    )
  } catch {
    return []
  }
}

function write(entries) {
  // Dedupe by (memoryId, kind) — last write wins so a re-mark carries the
  // latest intent (markUnsynced already merged stamps/authors before calling).
  const byKey = new Map()
  for (const e of entries) {
    byKey.set(entryKey(e.memoryId, e.kind), {
      kind: e.kind,
      memoryId: e.memoryId,
      ...(e.kind === 'move' ? { stopId: e.stopId ?? null } : {}),
      // A hand-move's provenance (Ch3) survives the normalization so the drain
      // can replay the human story; absent → byte-identical to before Ch3.
      ...(e.prov !== undefined ? { prov: e.prov } : {}),
      author: e.author ?? null,
      at: Number.isFinite(e.at) ? e.at : null,
    })
  }
  const uniq = [...byKey.values()]
  try {
    localStorage.setItem(KEY, JSON.stringify(uniq))
  } catch {
    /* quota / private mode — non-fatal */
  }
  for (const fn of subs) {
    try {
      fn(uniq.length)
    } catch {
      /* a bad subscriber never breaks a write */
    }
  }
}

// Record an intent whose push to the family didn't land. Idempotent per
// (memoryId, kind); re-marking a MOVE replaces the stored target with the
// latest decision, keeps the EARLIEST failure stamp, and updates the author to
// the latest editor (the resync attributes the push to the record's author —
// the entry's author is bookkeeping for honest indicators).
export function markUnsynced({ kind, memoryId, stopId, prov = undefined, author = null } = {}) {
  if (!INTENT_KINDS.includes(kind) || !memoryId || typeof memoryId !== 'string') return
  const entries = read()
  const idx = entries.findIndex((e) => e.memoryId === memoryId && e.kind === kind)
  // A hand-move's provenance rides the move intent so the drain replays the
  // human story with the filing (Ch3). Only set when provided — absent, the
  // entry is byte-identical to before (a plain machine/refile move stays
  // prov-less). On a re-decision the spread keeps a prior prov unless the new
  // decision supplies its own.
  if (idx >= 0) {
    entries[idx] = {
      ...entries[idx],
      ...(kind === 'move' ? { stopId: stopId ?? null } : {}),
      ...(prov !== undefined ? { prov } : {}),
      author: author ?? entries[idx].author ?? null,
      at: entries[idx].at ?? Date.now(),
    }
  } else {
    entries.push({
      kind,
      memoryId,
      ...(kind === 'move' ? { stopId: stopId ?? null } : {}),
      ...(prov !== undefined ? { prov } : {}),
      author,
      at: Date.now(),
    })
  }
  write(entries)
}

// Ensure an intent is queued WITHOUT superseding a newer decision. markUnsynced
// is the DECISION verb — it replaces a move's stored target; this is the
// BOOKKEEPING verb for an op's failure settle. An op that began before the
// latest move can settle after it (its mirror was in flight when the user
// re-decided), and writing its older target over the entry would hand the next
// drain a stale decision to replay. If an entry exists it is newer-or-equal by
// construction (only a decision replaces targets) — leave it untouched.
export function ensureUnsynced({ kind, memoryId, stopId, prov = undefined, author = null } = {}) {
  if (!INTENT_KINDS.includes(kind) || !memoryId || typeof memoryId !== 'string') return
  if (read().some((e) => e.memoryId === memoryId && e.kind === kind)) return
  markUnsynced({ kind, memoryId, stopId, prov, author })
}

// Clear ONE intent once the worker settled it (confirmed, refused, or the
// record is no longer ours to sync). Idempotent.
export function markSynced(memoryId, kind) {
  if (!memoryId || !INTENT_KINDS.includes(kind)) return
  const entries = read()
  if (entries.some((e) => e.memoryId === memoryId && e.kind === kind)) {
    write(entries.filter((e) => !(e.memoryId === memoryId && e.kind === kind)))
  }
}

// Clear EVERY intent for a memory — the family's delete won; nothing about
// this record is owed anymore (save and move alike die with it).
export function clearAllFor(memoryId) {
  if (!memoryId) return
  const entries = read()
  if (entries.some((e) => e.memoryId === memoryId)) {
    write(entries.filter((e) => e.memoryId !== memoryId))
  }
}

// The intents still waiting to reach the family (a fresh array, safe to mutate).
export function pendingIntents() {
  return read()
}

// The LIVE entry for (memoryId, kind), or null. The drain re-reads each intent
// through this at replay time: an entry an op ahead of it settled, or whose
// move target a newer decision replaced, must never be replayed from a stale
// snapshot — the replay would re-impose the OLDER decision and win the 409
// recovery with it.
export function getIntent(memoryId, kind) {
  if (!memoryId || !INTENT_KINDS.includes(kind)) return null
  return read().find((e) => e.memoryId === memoryId && e.kind === kind) || null
}

export function count() {
  return read().length
}

// The earliest still-pending failure stamp (epoch ms), or null when nothing is
// queued. A legacy entry with no stamp counts as 0 (unknown = long ago) so an
// indicator errs toward "stuck", never toward false calm.
export function oldestPendingAt() {
  const entries = read()
  if (!entries.length) return null
  return entries.reduce((min, e) => Math.min(min, Number.isFinite(e.at) ? e.at : 0), Infinity)
}

export function isUnsynced(memoryId) {
  return !!memoryId && read().some((e) => e.memoryId === memoryId)
}

// Subscribe to count changes (for an honest "N changes syncing…" indicator).
// Returns an unsubscribe fn. The callback receives the new pending count.
export function subscribe(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

// The uniform per-outcome signal (batch A-2, carried from A-1): both queues
// expose the same emit/subscribe pair over syncOutcomes' shared vocabulary,
// so no subscriber ever has to read dequeue-alone as a truth.
export function emitOutcome(memoryId, outcome) {
  emitSyncOutcome('memory', memoryId, outcome)
}

export function subscribeOutcomes(fn) {
  return subscribeSyncOutcomes('memory', fn)
}

// Test-only reset so unit tests start from a known-empty state.
export function _resetForTest() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
