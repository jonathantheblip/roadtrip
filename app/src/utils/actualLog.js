// IndexedDB wrapper for the Actual Route Log (Feature 1).
// Plain IndexedDB — dexie would be overkill for this volume.
// Schema v1:
//   - stops:      keyPath 'id', indexed by 'date'
//   - days:       keyPath 'date' (one record per trip day — reflection, totals)
//
// API surface is promise-based and intentionally small.

const DB_NAME = 'roadtrip-log'
const DB_VERSION = 2

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  const p = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('stops')) {
        const s = db.createObjectStore('stops', { keyPath: 'id' })
        s.createIndex('by_date', 'date', { unique: false })
      }
      if (!db.objectStoreNames.contains('days')) {
        db.createObjectStore('days', { keyPath: 'date' })
      }
      // v2: audio memos — one per date, Blob stored directly.
      if (!db.objectStoreNames.contains('memos')) {
        db.createObjectStore('memos', { keyPath: 'date' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  dbPromise = p
  // Clear the cached promise on failure so the next call can retry the
  // open (e.g. after a transient quota or upgrade error), instead of
  // replaying the same rejection forever.
  p.catch(() => { if (dbPromise === p) dbPromise = null })
  return p
}

function tx(storeNames, mode = 'readonly') {
  return openDb().then((db) => {
    const t = db.transaction(storeNames, mode)
    return { t, stores: storeNames.map((n) => t.objectStore(n)) }
  })
}

function req2promise(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// -------- stops --------

export async function addStop(stop) {
  const record = {
    id: stop.id || uuid(),
    date: stop.date,
    arrivalTime: stop.arrivalTime || null,
    departureTime: stop.departureTime || null,
    name: stop.name,
    type: stop.type || 'other',
    location: stop.location || '',
    notes: stop.notes || '',
    servedWhom: stop.servedWhom || [],
    wasPlanned: !!stop.wasPlanned,
    plannedStopRef: stop.plannedStopRef || null,
    createdAt: stop.createdAt || Date.now(),
  }
  const { t, stores } = await tx(['stops'], 'readwrite')
  stores[0].put(record)
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve
    t.onerror = () => reject(t.error)
  })
  return record
}

export async function updateStop(id, patch) {
  const { t, stores } = await tx(['stops'], 'readwrite')
  const cur = await req2promise(stores[0].get(id))
  if (!cur) throw new Error('stop not found')
  const next = { ...cur, ...patch, id }
  stores[0].put(next)
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve
    t.onerror = () => reject(t.error)
  })
  return next
}

export async function deleteStop(id) {
  const { t, stores } = await tx(['stops'], 'readwrite')
  stores[0].delete(id)
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve
    t.onerror = () => reject(t.error)
  })
}

export async function getStopsByDate(date) {
  const { stores } = await tx(['stops'])
  const idx = stores[0].index('by_date')
  const stops = await req2promise(idx.getAll(date))
  return stops.sort((a, b) => (a.arrivalTime || '').localeCompare(b.arrivalTime || ''))
}

export async function getAllStops() {
  const { stores } = await tx(['stops'])
  const all = await req2promise(stores[0].getAll())
  return all.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return (a.arrivalTime || '').localeCompare(b.arrivalTime || '')
  })
}

// -------- days (reflection + totals) --------

export async function getDay(date) {
  const { stores } = await tx(['days'])
  return req2promise(stores[0].get(date))
}

export async function putDay(day) {
  const record = {
    date: day.date,
    departureLocation: day.departureLocation || '',
    overnightLocation: day.overnightLocation || '',
    totalDrivingHours: day.totalDrivingHours ?? null,
    reflection: day.reflection || '',
    updatedAt: Date.now(),
  }
  const { t, stores } = await tx(['days'], 'readwrite')
  stores[0].put(record)
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve
    t.onerror = () => reject(t.error)
  })
  return record
}

export async function getAllDays() {
  const { stores } = await tx(['days'])
  const all = await req2promise(stores[0].getAll())
  return all.sort((a, b) => a.date.localeCompare(b.date))
}

// -------- audio memos (Feature 6) --------

export async function saveMemo({ date, blob, durationSeconds, mime }) {
  const record = {
    date,
    blob,
    durationSeconds,
    mime: mime || blob?.type || 'audio/mp4',
    recordedAt: new Date().toISOString(),
  }
  const { t, stores } = await tx(['memos'], 'readwrite')
  stores[0].put(record)
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve
    t.onerror = () => reject(t.error)
  })
  return record
}

export async function getMemo(date) {
  const { stores } = await tx(['memos'])
  return req2promise(stores[0].get(date))
}

export async function deleteMemo(date) {
  const { t, stores } = await tx(['memos'], 'readwrite')
  stores[0].delete(date)
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve
    t.onerror = () => reject(t.error)
  })
}

// -------- seed & export --------

const SEED_KEY = 'roadtrip-log-seeded-v2'

export async function seedIfNeeded(seedData) {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(SEED_KEY)) return
  for (const day of seedData.days || []) {
    await putDay(day)
  }
  for (const stop of seedData.stops || []) {
    await addStop(stop)
  }
  localStorage.setItem(SEED_KEY, String(Date.now()))
}

// Recent meal categories across the last N days — fuel for novelty check.
export async function recentMealCategories(beforeDate, days = 2) {
  const all = await getAllStops()
  const cutoff = new Date(beforeDate)
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  return all
    .filter((s) => s.type === 'meal' && s.date >= cutoffIso && s.date < beforeDate)
    .map((s) => ({
      name: s.name,
      notes: s.notes,
      date: s.date,
    }))
}

// Export one or more days to markdown. Tries to match the saturday_apr18_actual.md style.
export async function exportDaysToMarkdown(dateList) {
  const lines = []
  for (const date of dateList) {
    const day = await getDay(date)
    const stops = await getStopsByDate(date)
    const memo = await getMemo(date)
    lines.push(`# ${humanDate(date)} — Actual Route`)
    lines.push('')
    if (day?.departureLocation && day?.overnightLocation) {
      lines.push(`**Route:** ${day.departureLocation} → ${day.overnightLocation}`)
    }
    if (day?.totalDrivingHours != null) {
      lines.push(`**Total driving:** ~${day.totalDrivingHours}h`)
    }
    lines.push('')
    if (stops.length) {
      lines.push('## Stops, in order')
      lines.push('')
      for (const s of stops) {
        const title = s.arrivalTime ? `${s.arrivalTime} — ${s.name}` : s.name
        lines.push(`### ${title}`)
        if (s.location) lines.push(`*${s.location}*`)
        if (s.notes) lines.push(s.notes)
        if (s.servedWhom?.length) {
          lines.push(`_Served: ${s.servedWhom.join(', ')}_`)
        }
        lines.push('')
      }
    }
    if (day?.reflection) {
      lines.push('## Reflection')
      lines.push('')
      lines.push(day.reflection)
      lines.push('')
    }
    if (memo) {
      const ext = (memo.mime || 'audio/mp4').includes('webm') ? 'webm' : 'm4a'
      const filename = memoFilename(date, ext)
      const mmss = fmtDur(memo.durationSeconds)
      lines.push(`[Audio memo: ${filename} (${mmss})]`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

export function memoFilename(date, ext = 'm4a') {
  const d = new Date(date + 'T12:00:00')
  const dowNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  const dow = dowNames[d.getDay()]
  const yyyymmdd = date.replace(/-/g, '')
  return `${dow}_${yyyymmdd}_memo.${ext}`
}

function fmtDur(sec) {
  if (!sec) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec - m * 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function humanDate(iso) {
  try {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
  } catch {
    return iso
  }
}
