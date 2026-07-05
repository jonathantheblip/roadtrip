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

// Entries are { id, author, at }: author = the traveler who MADE the edit,
// captured at mark time so the resync re-pushes under the real author (not
// whoever is active at resync); at = when the edit FIRST failed to reach the
// family (epoch ms), kept across re-marks so an honest indicator can tell a
// stuck edit from one merely in flight. Back-compat: pre-author rows were bare
// id strings → author null (the resync then falls back to the active
// traveler); pre-age rows have no stamp → at null (reads as long-stuck, never
// as freshly in flight).
function read() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(a)) return []
    return a
      .map((x) =>
        typeof x === 'string'
          ? { id: x, author: null, at: null }
          : { ...x, at: Number.isFinite(x?.at) ? x.at : null }
      )
      .filter((x) => x && typeof x.id === 'string')
  } catch {
    return []
  }
}

function write(entries) {
  // Dedupe by id (last write wins → keeps the latest editor as author).
  const byId = new Map()
  for (const e of entries) {
    byId.set(e.id, { id: e.id, author: e.author ?? null, at: Number.isFinite(e.at) ? e.at : null })
  }
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
// author to the latest editor but keeps the EARLIEST failure stamp — the age
// must answer "how long has this trip been out of sync", not "when did the
// latest retry fail".
export function markUnsynced(id, author = null) {
  if (!id || typeof id !== 'string') return
  const entries = read()
  const idx = entries.findIndex((e) => e.id === id)
  if (idx >= 0) {
    entries[idx] = { id, author: author ?? entries[idx].author ?? null, at: entries[idx].at ?? Date.now() }
  } else {
    entries.push({ id, author: author ?? null, at: Date.now() })
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

// The earliest still-pending failure stamp (epoch ms), or null when nothing is
// queued. A legacy entry with no stamp counts as 0 (unknown = long ago) so the
// indicator errs toward "stuck", never toward false calm.
export function oldestPendingAt() {
  const entries = read()
  if (!entries.length) return null
  return entries.reduce((min, e) => Math.min(min, Number.isFinite(e.at) ? e.at : 0), Infinity)
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
