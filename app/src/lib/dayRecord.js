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

// The Record's shape evolved for the keep flow (2026-07-02): a day's record
// grew from a flat ARRAY of entries to an OBJECT that ALSO carries day-level
// state — { state:'loose'|'kept', keptBy, keptAt, nothing, entries, skipped }.
// This is the ONE normalizer every reader and writer routes through, so the two
// shapes coexist forever: a LEGACY bare array (records written before this,
// live on the family's active trip) reads as a loose, un-kept record and its
// entries are NEVER lost. All of this lives in the trip's flexible data
// (data_json); the worker treats that blob as opaque, so there is NO schema or
// migration. `state` is 'loose' until the keep flow sets it 'kept'.
export function readRecord(day) {
  const r = day?.record
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    return {
      state: r.state === 'kept' ? 'kept' : 'loose',
      keptBy: r.keptBy || null,
      keptAt: r.keptAt || null,
      nothing: r.nothing === true,
      entries: Array.isArray(r.entries) ? r.entries : [],
      skipped: Array.isArray(r.skipped) ? r.skipped : [],
    }
  }
  // Legacy bare array (or absent) → a loose, un-kept record. Entries preserved.
  return {
    state: 'loose', keptBy: null, keptAt: null, nothing: false,
    entries: Array.isArray(r) ? r : [],
    skipped: [],
  }
}

// The entries a reader iterates — shape-agnostic (legacy array OR the object).
export function dayRecordOf(day) {
  return readRecord(day).entries
}

// The record entries a READER should see: named ones only. A record row
// about nothing is nothing (same rule normalizeRecordEntry enforces for the
// chat mouth) — so a half-typed row in the editor's record mode, which lives
// in the working copy until it earns a name, never leaks onto the home or the
// plan. The editor still edits the raw array (dayRecordOf); read faces use this.
export function namedRecordEntries(day) {
  return dayRecordOf(day).filter((e) => (e?.name || '').trim())
}

// An entry is a DRAFT when a machine drafted it from a photo cluster and no person
// has named it yet (name:''). It renders DASHED with its machine guess (never a
// human name — honesty rule #1). A nameless MANUAL editor working row is NOT a draft
// (no evidence source) and stays hidden; naming a draft in the settle sheet sets its
// name so it graduates to a memory (keeping `guess` for honesty). `src` is checked
// too for the design's richer entry shape (05) landing later.
export function isDraftEntry(e) {
  return !!e && !(e?.name || '').trim() && (e?.source === 'evidence' || e?.src === 'evidence')
}

// The record entries a READER should see once evidence is in play: named memories
// AND evidence drafts. Distinct from namedRecordEntries (named-only), which the
// Weave narration and photo-name filing still use — a draft has no name to narrate
// or file under. A half-typed MANUAL row remains hidden (isDraftEntry excludes it).
export function readableRecordEntries(day) {
  return dayRecordOf(day).filter((e) => (e?.name || '').trim() || isDraftEntry(e))
}

export function dayHasRecord(day) {
  return readableRecordEntries(day).length > 0
}

// Find the day named by target (dayIso preferred — stable across renumbering —
// else dayN). The day is CREATED if the trip hasn't written it yet (a hangout
// trip's open day exists only on the date grid): inserted in date order among
// the DATED days, dateless days keep their manual order, day numbers renumbered
// — the same rules TripEditor's focus-day creation follows. Returns { days, idx }
// where `days` is a fresh shallow-cloned array so a caller can reassign days[idx]
// purely. Shared by applyDayRecord + keepDay so day-finding lives in ONE place.
function findOrCreateDay(trip, target = {}) {
  const dayIso = (target.dayIso || '').slice(0, 10)
  const dayN = target.dayN
  if (!dayIso && typeof dayN !== 'number') {
    throw new Error('dayRecord: target.dayIso or target.dayN required')
  }
  const srcDays = trip.data?.days || trip.days || []
  const days = srcDays.map((d) => ({ ...d }))

  let idx = -1
  if (dayIso) idx = days.findIndex((d) => d?.isoDate === dayIso)
  if (idx < 0 && typeof dayN === 'number') idx = days.findIndex((d) => d?.n === dayN)

  if (idx < 0) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) {
      throw new Error(`dayRecord: day ${dayIso || dayN} not found in trip`)
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
  return { days, idx }
}

// Reattach the days array to the trip at the right level (seed root vs D1 .data).
function commitDays(trip, days) {
  if (trip.data) return { ...trip, data: { ...trip.data, days } }
  return { ...trip, days }
}

// Write entries onto a day's record (creating the day if needed). Entries UPSERT
// by id (idempotent re-saves); new entries append in told order. Preserves any
// day-level state (kept/keptBy/nothing) — a record-write must never silently
// un-keep a day the family kept. Pure: returns the next trip snapshot.
export function applyDayRecord(trip, target = {}, entries = []) {
  if (!trip) throw new Error('applyDayRecord: trip required')
  const { days, idx } = findOrCreateDay(trip, target)
  const cur = readRecord(days[idx]) // object form — coerces a legacy bare array
  const existing = cur.entries.slice()
  for (const e of entries) {
    if (!e) continue
    const at = existing.findIndex((x) => x?.id === e.id)
    if (at >= 0) existing[at] = e
    else existing.push(e)
  }
  days[idx] = { ...days[idx], record: { ...cur, entries: existing } }
  return commitDays(trip, days)
}

// KEEP a day — the settle action, the design's centerpiece: the day wears gold.
// Marks the record state='kept' with who + when, PRESERVING its entries (never
// discards them, never touches day.stops). A nothing-day (nothing:true) is a
// valid keep with no entries ("we stayed put, gloriously"). The FIRST keeper's
// timestamp wins (kept once, added-to after — contract in the design's 02).
// Creates the day if a hangout trip never wrote it. Pure.
export function keepDay(trip, target = {}, { keptBy = null, nothing = false } = {}) {
  if (!trip) throw new Error('keepDay: trip required')
  const { days, idx } = findOrCreateDay(trip, target)
  const cur = readRecord(days[idx])
  days[idx] = {
    ...days[idx],
    record: {
      ...cur,
      state: 'kept',
      keptBy: cur.keptBy || keptBy || null,
      keptAt: cur.keptAt || new Date().toISOString(),
      // First keeper settles the day — a nothing-day stays a nothing-day even if
      // a later (cross-device) re-keep passes nothing:false, same as keptBy/keptAt.
      nothing: cur.nothing === true || nothing === true,
    },
  }
  return commitDays(trip, days)
}

// Day-level record state readers (shape-agnostic via readRecord).
export function dayRecordIsKept(day) {
  return readRecord(day).state === 'kept'
}
export function dayRecordIsNothing(day) {
  return readRecord(day).nothing === true
}
export function dayRecordKeptBy(day) {
  return readRecord(day).keptBy || null
}
