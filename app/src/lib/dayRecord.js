// The Record — "what actually happened," a day's second face (2026-07-02).
//
// The app tells three tenses of a trip: what we're PLANNING (day.stops),
// what's happening NOW (presence/next-up), and what actually HAPPENED —
// this module. Each day can carry `day.record`: a list of entries shaped
// like stops (loose time · name · kind · who · note · optional location)
// so every downstream consumer (StopRow rendering, photo filing, Replay,
// the Weave) can read them with the muscles it already has. The record
// NEVER touches day.stops — the plan keeps its honesty ("we planned the
// whale watch, we biked the dunes instead" stays expressible).
//
// Entries keep the ORDER they were told in — the teller's sequence is the
// day's narrative order; no time-sort second-guesses it.
//
// Pure functions only — no I/O, no React. Lives in the trip's flexible
// data (data_json); no schema/migration.

// Match TripEditor's humanDate: ISO → "Fri Jun 19" (local-noon trick so
// the calendar date never drifts across timezones).
function humanDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  if (isNaN(d)) return ''
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// A stable, idempotent entry id: a card saved twice (a retry after a sync
// wobble) UPSERTS its own rows instead of duplicating the day.
export function recordEntryId(cardId, index) {
  if (cardId) return `rec-${cardId}-${index}`
  let suffix
  try {
    suffix = crypto.randomUUID().slice(0, 6)
  } catch {
    suffix = Math.random().toString(36).slice(2, 8)
  }
  return `rec-x-${suffix}`
}

// Normalize one told-to-us entry into the canonical record shape. `name`
// is the one hard requirement — a record row about nothing is nothing.
// Returns null for a nameless entry (callers decide whether that's loud).
export function normalizeRecordEntry(raw, { cardId, index, party, recordedBy } = {}) {
  const name = (raw?.name || raw?.title || '').trim()
  if (!name) return null
  return {
    id: raw?.id || recordEntryId(cardId, index ?? 0),
    time: (raw?.time || '').trim(), // loose on purpose: "Morning", "after lunch", ""
    name,
    kind: (raw?.kind || '').toString().toLowerCase(),
    // Who was there. Unspecified → the trip's whole party (the honest
    // default for a family hangout), mirroring applyAdd's rule.
    for: Array.isArray(raw?.for) && raw.for.length ? raw.for : party || [],
    note: (raw?.note || raw?.notes || raw?.description || '').trim(),
    address: (raw?.address || raw?.location || '').trim(),
    lat: Number.isFinite(Number(raw?.lat)) && raw?.lat !== null && raw?.lat !== '' ? Number(raw.lat) : null,
    lng: Number.isFinite(Number(raw?.lng)) && raw?.lng !== null && raw?.lng !== '' ? Number(raw.lng) : null,
    source: raw?.source || 'chat', // chat | manual | evidence
    recordedBy: recordedBy || null,
    recordedAt: new Date().toISOString(),
  }
}

export function dayRecordOf(day) {
  return Array.isArray(day?.record) ? day.record : []
}

export function dayHasRecord(day) {
  return dayRecordOf(day).length > 0
}

// Write entries onto the day named by ISO date (preferred — stable across
// renumbering) or by day number. The day is CREATED if the trip hasn't
// written it yet (a hangout trip's open day exists only on the date grid):
// inserted in date order among the DATED days, dateless days keep their
// manual order, day numbers renumbered — the same rules TripEditor's
// focus-day creation follows. Entries UPSERT by id (idempotent re-saves);
// new entries append in told order. Pure: returns the next trip snapshot.
export function applyDayRecord(trip, target = {}, entries = []) {
  if (!trip) throw new Error('applyDayRecord: trip required')
  const dayIso = (target.dayIso || '').slice(0, 10)
  const dayN = target.dayN
  if (!dayIso && typeof dayN !== 'number') {
    throw new Error('applyDayRecord: target.dayIso or target.dayN required')
  }
  const srcDays = trip.data?.days || trip.days || []
  const days = srcDays.map((d) => ({ ...d }))

  let idx = -1
  if (dayIso) idx = days.findIndex((d) => d?.isoDate === dayIso)
  if (idx < 0 && typeof dayN === 'number') idx = days.findIndex((d) => d?.n === dayN)

  if (idx < 0) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) {
      throw new Error(`applyDayRecord: day ${dayIso || dayN} not found in trip`)
    }
    const newDay = {
      n: 0, isoDate: dayIso, date: humanDate(dayIso), title: '',
      drive: { from: '', to: '', hours: '', miles: 0 }, lodging: '', stops: [],
    }
    const at = days.findIndex((d) => d?.isoDate && d.isoDate > dayIso)
    if (at >= 0) days.splice(at, 0, newDay)
    else days.push(newDay)
    days.forEach((d, i) => { d.n = i + 1 })
    idx = days.findIndex((d) => d === newDay)
  }

  const existing = dayRecordOf(days[idx]).slice()
  for (const e of entries) {
    if (!e) continue
    const at = existing.findIndex((x) => x?.id === e.id)
    if (at >= 0) existing[at] = e
    else existing.push(e)
  }
  days[idx] = { ...days[idx], record: existing }

  if (trip.data) return { ...trip, data: { ...trip.data, days } }
  return { ...trip, days }
}
