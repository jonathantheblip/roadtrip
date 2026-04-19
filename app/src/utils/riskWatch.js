// Feature 4 — Risk Watch store.
// Persists user-added flags in IndexedDB alongside the Actual Log database.
// Seed flags live in data/riskFlags.js and are returned in-memory by
// listAllFlags(). Resolution state and user-added flags go to IDB.

import { RISK_SEED } from '../data/riskFlags'

const DB_NAME = 'roadtrip-risks'
const DB_VERSION = 1

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  const p = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('flags')) {
        db.createObjectStore('flags', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('resolutions')) {
        db.createObjectStore('resolutions', { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  dbPromise = p
  p.catch(() => { if (dbPromise === p) dbPromise = null })
  return p
}

function req2promise(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function tx(storeNames, mode = 'readonly') {
  return openDb().then((db) => {
    const t = db.transaction(storeNames, mode)
    return { t, stores: storeNames.map((n) => t.objectStore(n)) }
  })
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'rf-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

async function getUserFlags() {
  const { stores } = await tx(['flags'])
  return req2promise(stores[0].getAll())
}

async function getResolutions() {
  const { stores } = await tx(['resolutions'])
  const all = await req2promise(stores[0].getAll())
  return new Map(all.map((r) => [r.id, r]))
}

// Returns [{ ...flag, resolved }] from seed + user-added, merged with
// resolution state. Does not hit IDB on every render — callers should
// cache. This is async; use a hook wrapper in components.
export async function listAllFlags() {
  const [userFlags, resolutions] = await Promise.all([getUserFlags(), getResolutions()])
  const all = [...RISK_SEED, ...userFlags]
  return all.map((f) => ({
    ...f,
    resolved: resolutions.get(f.id)?.resolved || false,
    resolvedAt: resolutions.get(f.id)?.resolvedAt || null,
  }))
}

export async function addFlag(input) {
  const record = {
    id: input.id || uuid(),
    subject: input.subject,
    riskType: input.riskType || 'other',
    details: input.details || '',
    source: input.source || '',
    dateAdded: new Date().toISOString(),
    appliesToDates: input.appliesToDates || null,
    appliesToDaysOfWeek: input.appliesToDaysOfWeek || null,
    appliesToTimesOfDay: input.appliesToTimesOfDay || null,
    keywords: input.keywords || [],
    linkedStopIds: input.linkedStopIds || [],
  }
  const { t, stores } = await tx(['flags'], 'readwrite')
  stores[0].put(record)
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve
    t.onerror = () => reject(t.error)
  })
  return record
}

export async function setResolved(id, resolved) {
  const { t, stores } = await tx(['resolutions'], 'readwrite')
  stores[0].put({ id, resolved: !!resolved, resolvedAt: resolved ? new Date().toISOString() : null })
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve
    t.onerror = () => reject(t.error)
  })
}

// Pure matching logic — used by both Risks tab and Feature 3 scorer.
// A flag applies to a stop when:
//   - linkedStopIds contains the stop id, OR
//   - a keyword matches the stop name (case-insensitive)
// A flag is active on a given date/time when:
//   - not resolved
//   - appliesToDaysOfWeek includes the DOW (or field is null)
//   - appliesToDates includes the ISO date (or field is null)
//   - appliesToTimesOfDay bracket includes the time (or field is null)
export function flagAppliesToStop(flag, stop) {
  if (flag.linkedStopIds?.includes(stop.id)) return true
  if (!flag.keywords?.length) return false
  const hay = (stop.name || '').toLowerCase()
  return flag.keywords.some((k) => hay.includes(k.toLowerCase()))
}

export function flagActiveOn(flag, when) {
  if (flag.resolved) return false
  const d = new Date(when)
  const dow = d.getDay()
  if (flag.appliesToDaysOfWeek && !flag.appliesToDaysOfWeek.includes(dow)) return false
  const iso = d.toISOString().slice(0, 10)
  if (flag.appliesToDates && !flag.appliesToDates.includes(iso)) return false
  if (flag.appliesToTimesOfDay) {
    const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
    const { start, end } = flag.appliesToTimesOfDay
    if (start && hhmm < start) return false
    if (end && hhmm > end) return false
  }
  return true
}

function pad(n) { return n.toString().padStart(2, '0') }

// For a given set of stops on a given date, return flags applying to any.
export function flagsForStopsOnDate(flags, stops, when) {
  const matches = []
  for (const flag of flags) {
    if (!flagActiveOn(flag, when)) continue
    const attached = stops.filter((s) => flagAppliesToStop(flag, s))
    if (attached.length) {
      matches.push({ flag, stops: attached })
    }
  }
  return matches
}
