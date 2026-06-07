import { listMemoriesForTrip } from './memoryStore'
import { workerFetch, isWorkerConfigured } from './workerSync'

// ── Day selection ────────────────────────────────────────────────────
//
// Returns { trip, day } — the day to weave — or null if no trips/memories.
//
// Logic (Jonathan, 2026-06-06):
//   1. If today falls within a trip's date range OR up to 4 days after
//      its last day → find the most recent past day of that trip that has
//      at least one memory.
//   2. Otherwise → pick a random (trip, day) pair across ALL trips that
//      has at least one memory (discovery mode: you might land on a day
//      from any past trip).
//
// "Past day" = day.isoDate <= today (the day has happened; it's complete).
export function selectWeaveDay(trips, traveler, todayIso) {
  const today = todayIso || new Date().toISOString().slice(0, 10)
  const candidates = (trips || []).filter((t) => t.days?.length)

  // Helper: check whether a trip has any memory on a given day.
  function dayHasMemory(trip, day) {
    const stopIds = new Set((day.stops || []).map((s) => s.id))
    const mems = listMemoriesForTrip(trip.id, traveler)
    return mems.some((m) => stopIds.has(m.stopId))
  }

  // Helper: shift an ISO date string by N days.
  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }

  // 1. Look for an active trip (within range or grace window).
  const activeTrip = candidates.find((t) => {
    const start = t.dateRangeStart
    const end = t.dateRangeEnd
    if (!start || !end) return false
    return start <= today && today <= addDays(end, 4)
  })

  if (activeTrip) {
    // Most recent past day with at least one memory.
    const pastDays = (activeTrip.days || [])
      .filter((d) => d.isoDate && d.isoDate <= today)
      .sort((a, b) => b.isoDate.localeCompare(a.isoDate))
    for (const day of pastDays) {
      if (dayHasMemory(activeTrip, day)) return { trip: activeTrip, day }
    }
    return null
  }

  // 2. Discovery mode: collect all (trip, day) pairs with memories.
  const pool = []
  for (const trip of candidates) {
    for (const day of trip.days || []) {
      if (!day.isoDate) continue
      if (dayHasMemory(trip, day)) pool.push({ trip, day })
    }
  }
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

// ── Beat building ────────────────────────────────────────────────────
//
// Groups a day's memories by author and picks one representative beat
// per person.  Beat preference: voice > photo > text (most distinctive
// first).  Returns [{ who, kind, snippet, memory }].
export function buildBeats(trip, day, memories) {
  const stopIds = new Set((day.stops || []).map((s) => s.id))
  const dayMems = memories.filter((m) => stopIds.has(m.stopId))

  // Group by author.
  const byAuthor = {}
  for (const m of dayMems) {
    if (!m.authorTraveler) continue
    if (!byAuthor[m.authorTraveler]) byAuthor[m.authorTraveler] = []
    byAuthor[m.authorTraveler].push(m)
  }

  const kindRank = { voice: 0, photo: 1, text: 2 }
  const beats = []

  for (const who of Object.keys(byAuthor)) {
    const mems = byAuthor[who].slice().sort((a, b) => {
      const ra = kindRank[a.kind] ?? 3
      const rb = kindRank[b.kind] ?? 3
      return ra - rb
    })
    const best = mems[0]
    if (!best) continue

    let snippet = ''
    if (best.kind === 'voice') {
      snippet = best.transcript ? best.transcript.slice(0, 120) : 'recorded a voice clip'
    } else if (best.kind === 'photo') {
      snippet = best.caption ? best.caption.slice(0, 120) : 'took a photo'
    } else {
      snippet = best.text ? best.text.slice(0, 120) : 'left a note'
    }

    beats.push({ who, kind: best.kind || 'text', snippet, memory: best })
  }

  return beats
}

// ── Narrative fetch ──────────────────────────────────────────────────
//
// Calls POST /weave on the worker.  Returns { title, opening, closing }
// or null (worker not configured, network error, or parse failure).
// The caller should degrade gracefully on null — the braid still renders,
// just without Claude's framing.
export async function fetchWeaveNarrative(beats, stat) {
  if (!isWorkerConfigured()) return null
  const payload = {
    beats: beats.map(({ who, kind, snippet }) => ({ who, kind, snippet })),
  }
  if (stat) payload.stat = stat
  try {
    const r = await workerFetch('/weave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) return null
    const data = await r.json()
    if (typeof data?.title !== 'string') return null
    return { title: data.title, opening: data.opening, closing: data.closing }
  } catch {
    return null
  }
}

// ── Stored (pre-made) weave ──────────────────────────────────────────
//
// The nightly cron (worker `scheduled` → runNightlyWeave) pre-assembles the
// active trip's freshest day and stores the narrative. This fetches it so the
// page can render INSTANTLY — no per-open Claude call. Returns
// { tripId, dayIso, title, opening, closing, stat, generatedAt } or null when
// none exists yet / worker not configured / any error → caller falls back to
// fetchWeaveNarrative (build-on-demand). 204 (no weave yet) reads as null.
export async function fetchStoredWeave(tripId, dayIso) {
  if (!isWorkerConfigured() || !tripId) return null
  try {
    const qs = new URLSearchParams({ trip_id: tripId })
    if (dayIso) qs.set('day', dayIso)
    const r = await workerFetch(`/weave/latest?${qs.toString()}`)
    if (r.status === 204 || !r.ok) return null
    const data = await r.json()
    if (typeof data?.title !== 'string') return null
    return data
  } catch {
    return null
  }
}

// ── "Ready" cue — last-seen tracking ─────────────────────────────────
//
// The ✦ entry shows a cue when a stored weave is NEWER than the one this
// device last opened. Tracked locally (per trip) — the cue is a per-device
// "you haven't looked yet" nudge, not synced state.
const WEAVE_SEEN_KEY = 'rt_weave_seen_v1'

function readSeenMap() {
  try {
    return JSON.parse(localStorage.getItem(WEAVE_SEEN_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

export function getWeaveSeen(tripId) {
  return readSeenMap()[tripId] || 0
}

export function markWeaveSeen(tripId, generatedAt) {
  if (!tripId || !generatedAt) return
  try {
    const all = readSeenMap()
    // Never move the marker backwards.
    if ((all[tripId] || 0) >= generatedAt) return
    all[tripId] = generatedAt
    localStorage.setItem(WEAVE_SEEN_KEY, JSON.stringify(all))
  } catch {
    /* ignore — the cue is best-effort */
  }
}
