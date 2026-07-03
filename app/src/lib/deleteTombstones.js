// deleteTombstones — the OTHER half of self-healing sync.
//
// tripSyncQueue remembers EDITS that haven't reached the family (re-push them). This
// remembers DELETES that haven't been confirmed on the server yet. A delete whose
// remote call failed (offline, a network glitch on a live trip) is dangerous twice:
// it must be RETRIED, and — crucially — it must NOT be silently UNDONE by the next
// pull re-adding the stale server row (the "deleted trip/memory resurrects on
// reconnect" bug). This tiny store fixes both: the resync retries a tombstoned id,
// and the pull/merge SKIPS any tombstoned id so a row the server still holds can't
// come back. A tombstone is cleared only once the server confirms the delete.
//
// Keyed by `kind` ('trip' | 'memory') so trip and memory deletes share one honest
// engine. localStorage-backed so a stranded delete outlives the session that failed
// to land it. Pure storage + a subscribe fan-out — no network, no React.

const KEY = 'rt_delete_tombstones_v1'
const KINDS = ['trip', 'memory']
const subs = new Set()

function readAll() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}')
    const out = {}
    for (const k of KINDS) {
      out[k] = Array.isArray(o?.[k])
        ? o[k].map((x) => (typeof x === 'string' ? { id: x, at: null } : x)).filter((e) => e && typeof e.id === 'string')
        : []
    }
    return out
  } catch {
    return { trip: [], memory: [] }
  }
}

function writeAll(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* quota / private mode — non-fatal */
  }
  const total = KINDS.reduce((n, k) => n + (all[k]?.length || 0), 0)
  for (const fn of subs) {
    try {
      fn(total)
    } catch {
      /* a bad subscriber never breaks a write */
    }
  }
}

// Record that `id` (of `kind`) was deleted but the remote delete hasn't confirmed.
// Idempotent — re-marking keeps the earliest tombstone. `at` (optional ISO string) is
// metadata for a future sweep; correctness doesn't depend on it.
export function markDeleted(kind, id, at = null) {
  if (!KINDS.includes(kind) || !id || typeof id !== 'string') return
  const all = readAll()
  if (!all[kind].some((e) => e.id === id)) {
    all[kind].push({ id, at })
    writeAll(all)
  }
}

// Clear a tombstone once the server confirms the delete (or the row is gone anyway).
// Idempotent — clearing an id that isn't tombstoned is a no-op.
export function clearDeleted(kind, id) {
  if (!KINDS.includes(kind) || !id) return
  const all = readAll()
  if (all[kind].some((e) => e.id === id)) {
    all[kind] = all[kind].filter((e) => e.id !== id)
    writeAll(all)
  }
}

export function isDeleted(kind, id) {
  if (!KINDS.includes(kind) || !id) return false
  return readAll()[kind].some((e) => e.id === id)
}

// The ids of `kind` still awaiting a confirmed delete (a fresh array).
export function deletedIds(kind) {
  if (!KINDS.includes(kind)) return []
  return readAll()[kind].map((e) => e.id)
}

// Filter helper: drop any tombstoned id from a pulled list, so a stale server row
// never resurrects something the family deleted. Reads the store ONCE.
export function withoutDeleted(kind, items, idOf = (x) => x?.id) {
  if (!KINDS.includes(kind) || !Array.isArray(items)) return items
  const dead = new Set(deletedIds(kind))
  if (!dead.size) return items
  return items.filter((x) => !dead.has(idOf(x)))
}

export function count() {
  const all = readAll()
  return KINDS.reduce((n, k) => n + all[k].length, 0)
}

// Subscribe to the total tombstone count (for a "N deletes syncing…" indicator).
export function subscribe(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

// Test-only reset so unit tests start from a known-empty state.
export function _resetForTest() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
