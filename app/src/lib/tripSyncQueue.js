// tripSyncQueue — a tiny, persistent record of trip edits that haven't reached
// the family yet (the Worker push failed, or the device was offline). Trips
// already live in the trips cache, so we only need to remember WHICH trip ids
// are unsynced; the resync re-pushes the current cached version of each on the
// next opportunity (app reopen / network back / interval). This is the trip
// analogue of lib/uploadQueue for photos — the engine behind "self-healing"
// family sync, so an edit is never silently stranded on one device.
//
// Pure storage + a subscribe fan-out. No network, no React. localStorage-backed
// so it survives a reload (the whole point — a stranded edit must outlive the
// session that failed to push it).

const KEY = 'rt_trips_unsynced_v1'
const subs = new Set()

// Entries are { id, author }: author = the traveler who MADE the edit, captured
// at mark time so the resync re-pushes under the real author (not whoever is
// active at resync). Back-compat: pre-author rows were bare id strings → author
// null (the resync then falls back to the active traveler, the old behavior).
function read() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(a)) return []
    return a
      .map((x) => (typeof x === 'string' ? { id: x, author: null } : x))
      .filter((x) => x && typeof x.id === 'string')
  } catch {
    return []
  }
}

function write(entries) {
  // Dedupe by id (last write wins → keeps the latest editor as author).
  const byId = new Map()
  for (const e of entries) byId.set(e.id, { id: e.id, author: e.author ?? null })
  const uniq = [...byId.values()]
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

// Record a trip id whose push to the family didn't land, with the EDITOR who made
// it (so the resync attributes it correctly). Idempotent; re-marking updates the
// author to the latest editor.
export function markUnsynced(id, author = null) {
  if (!id || typeof id !== 'string') return
  const entries = read()
  const idx = entries.findIndex((e) => e.id === id)
  if (idx >= 0) {
    entries[idx] = { id, author: author ?? entries[idx].author ?? null }
  } else {
    entries.push({ id, author: author ?? null })
  }
  write(entries)
}

// Clear a trip id once its push succeeds (or it no longer exists locally).
// Idempotent — clearing an id that isn't pending is a no-op.
export function markSynced(id) {
  if (!id) return
  const entries = read()
  if (entries.some((e) => e.id === id)) write(entries.filter((e) => e.id !== id))
}

// The ids still waiting to reach the family (a fresh array, safe to mutate).
export function pendingIds() {
  return read().map((e) => e.id)
}

// Full pending entries { id, author } — the resync needs the author to push under.
export function pendingEntries() {
  return read()
}

export function count() {
  return read().length
}

export function isUnsynced(id) {
  return !!id && read().some((e) => e.id === id)
}

// Subscribe to count changes (for an "N changes syncing…" indicator). Returns
// an unsubscribe fn. The callback receives the new pending count.
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
