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

function read() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function write(ids) {
  const uniq = [...new Set(ids)]
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

// Record a trip id whose push to the family didn't land. Idempotent.
export function markUnsynced(id) {
  if (!id || typeof id !== 'string') return
  const ids = read()
  if (!ids.includes(id)) write([...ids, id])
}

// Clear a trip id once its push succeeds (or it no longer exists locally).
// Idempotent — clearing an id that isn't pending is a no-op.
export function markSynced(id) {
  if (!id) return
  const ids = read()
  if (ids.includes(id)) write(ids.filter((x) => x !== id))
}

// The ids still waiting to reach the family (a fresh array, safe to mutate).
export function pendingIds() {
  return read()
}

export function count() {
  return read().length
}

export function isUnsynced(id) {
  return !!id && read().includes(id)
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
