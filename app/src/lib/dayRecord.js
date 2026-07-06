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

// Pure siblings only: the one great-circle formula (evidenceOverlapScore's
// centroid gate) and the evidence engine's cluster radius — the same ~200m
// that decided the pins is what decides whether two centroids are one place.
import { haversineMeters } from './photoMatch.js'
import { EVIDENCE_DEFAULTS } from './evidence.js'

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
      // Rafa's "tell about today" queue (design 04/05): memory ids awaiting a
      // parent's placement. Holds POINTERS only — the audio/transcript is a
      // normal voice Memory (memoryStore.js), so this needs no new Memory
      // field and no D1 schema. Additive-only; absent on legacy records.
      pending: Array.isArray(r.pending) ? r.pending : [],
    }
  }
  // Legacy bare array (or absent) → a loose, un-kept record. Entries preserved.
  return {
    state: 'loose', keptBy: null, keptAt: null, nothing: false,
    entries: Array.isArray(r) ? r : [],
    skipped: [],
    pending: [],
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
// AND evidence drafts. Distinct from namedRecordEntries (named-only) — a draft has
// no name to narrate or file under, so any name-consuming reader stays on the
// named-only view. A half-typed MANUAL row remains hidden (isDraftEntry excludes it).
export function readableRecordEntries(day) {
  return dayRecordOf(day).filter((e) => (e?.name || '').trim() || isDraftEntry(e))
}

export function dayHasRecord(day) {
  return readableRecordEntries(day).length > 0
}

// An entry's stamps, shape-agnostic (empty on any entry that predates this).
export function entryStamps(entry) {
  return Array.isArray(entry?.stamps) ? entry.stamps : []
}

// Rafa's stamp — the ONE additive contribution a kid can make to a RECORD ENTRY
// (design 04: "sees all, breaks nothing"; the canonical shape is design 05's
// entries[].stamps: [{by,glyph}]). Appends {by, glyph, at} to the entry's stamps
// and NOTHING else — additive-only enforced HERE at the model, not just the kid
// UI: no remove fn exists anywhere in this module. A duplicate (same kid + glyph
// on the same entry) is a no-op so a double-tap doesn't pile up. Looks the day up
// directly (does NOT go through findOrCreateDay) — stamping must never CREATE a
// day; if the day or the entry has vanished out from under a stale render (an
// edit landed mid-tap), this is a silent no-op, matching "his surface never
// errors." Pure: returns the next trip snapshot, or the same trip unchanged.
export function addEntryStamp(trip, target = {}, entryId, stamp = {}) {
  if (!trip) throw new Error('addEntryStamp: trip required')
  const by = stamp.by || 'rafa'
  const glyph = typeof stamp.glyph === 'string' ? stamp.glyph.trim() : ''
  if (!glyph || !entryId) return trip
  const dayIso = (target.dayIso || '').slice(0, 10)
  const dayN = target.dayN
  const srcDays = trip.data?.days || trip.days || []
  let idx = -1
  if (dayIso) idx = srcDays.findIndex((d) => d?.isoDate === dayIso)
  if (idx < 0 && typeof dayN === 'number') idx = srcDays.findIndex((d) => d?.n === dayN)
  if (idx < 0) return trip // no such day (yet) — nothing to stamp

  const days = srcDays.map((d, i) => (i === idx ? { ...d } : d))
  const cur = readRecord(days[idx])
  const ei = cur.entries.findIndex((e) => e?.id === entryId)
  if (ei < 0) return trip // the entry vanished/renamed under a stale tap

  const entry = cur.entries[ei]
  const stamps = entryStamps(entry)
  if (stamps.some((s) => s?.by === by && s?.glyph === glyph)) return trip

  const entries = cur.entries.slice()
  entries[ei] = { ...entry, stamps: [...stamps, { by, glyph, at: new Date().toISOString() }] }
  days[idx] = { ...days[idx], record: { ...cur, entries } }
  return commitDays(trip, days)
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

// MERGE evidence drafts onto a day's record — the keep flow's writer (FIX 2 +
// FIX 5, 2026-07-06). Gold means "this day counts," never "this day is closed"
// (VISION §3): a re-keep must fold NEW evidence in without disturbing anything
// a person chose. The rules, in order:
//   • a draft whose pin id is in record.skipped (persisted or passed here)
//     writes NOTHING — "leave this out" is sticky, by id; only a genuinely new
//     photo set (a new id) may ever re-raise the place;
//   • a draft matching an existing entry BY ID updates it in place;
//   • else a draft whose photos OVERLAP an existing evidence entry's photos is
//     that same place GROWN (pin ids hash the member set, so accretion mints a
//     new id) — it updates that entry in place, most-shared-photos wins, and
//     the entry's id stays put (the stable anchor for stamps and references);
//   • anything else is a genuinely new place and appends in told order.
// On an update, evidence facts refresh (span/time words, photos, counts,
// centroid, guess) while chosen things hold: a typed name wins, an existing
// name survives an unnamed re-offer, `for` moves only when the draft carries
// the explicit whoEdited consent bit (which is wire-only — stripped here),
// and stamps/notes/keeper facts are never touched. skipped ids union.
// Manual/chat entries carry no photos and are matched by id only — a pin can
// never swallow a told memory. Pure; never touches day.stops.
// Does an evidence draft describe the SAME PLACE as an existing entry, and how
// strongly? 0 = no match; higher = more shared photos. The overlap key is
// photoIds (<memoryId>:<refIndex>) — cluster-disjoint within a clustering
// pass, so one shared photo id genuinely means one shared photo AT ONE PLACE.
// Memory-id overlap is NOT that (C1, 2026-07-06): a single multi-photo share
// can span the beach AND the dinner — two pins, one memory id — and a ≥1
// memory-id threshold folded those two places into one entry, clobbering a
// human-named entry's coordinates with the other place's.
//
// LEGACY entries (kept before drafts carried photoIds) fall back to memory-id
// overlap ONLY behind both guards:
//   • a MAJORITY of the smaller side shared (2n > min sizes) — one incidental
//     shared album-memory can't marry two places;
//   • centroids within one cluster radius (the same ~200m that formed the
//     pins) — and an entry without coordinates never matches, because a
//     duplicate place is safer than a wrong merge.
// Shared verbatim by mergeKeepDrafts and the settle sheet's covered-pin
// display so the two kernels can never disagree about what "the same place"
// means. Pure.
export function evidenceOverlapScore(draft, entry, { radiusMeters = EVIDENCE_DEFAULTS.radiusMeters } = {}) {
  const dPids = Array.isArray(draft?.photoIds) ? draft.photoIds : []
  const ePids = Array.isArray(entry?.photoIds) ? entry.photoIds : []
  if (dPids.length && ePids.length) {
    const set = new Set(ePids)
    return dPids.reduce((s, id) => s + (set.has(id) ? 1 : 0), 0)
  }
  const dMem = Array.isArray(draft?.photos) ? draft.photos : []
  const eMem = Array.isArray(entry?.photos) ? entry.photos : []
  if (!dMem.length || !eMem.length) return 0
  const set = new Set(eMem)
  const n = dMem.reduce((s, id) => s + (set.has(id) ? 1 : 0), 0)
  if (!n || 2 * n <= Math.min(dMem.length, eMem.length)) return 0
  const dLat = Number(draft?.lat)
  const dLng = Number(draft?.lng)
  const eLat = Number(entry?.lat)
  const eLng = Number(entry?.lng)
  if (![dLat, dLng, eLat, eLng].every(Number.isFinite)) return 0
  if (haversineMeters(dLat, dLng, eLat, eLng) > radiusMeters) return 0
  return n
}

export function mergeKeepDrafts(trip, target = {}, drafts = [], { skipped = [] } = {}) {
  if (!trip) throw new Error('mergeKeepDrafts: trip required')
  const { days, idx } = findOrCreateDay(trip, target)
  const cur = readRecord(days[idx])
  const skipSet = new Set([...cur.skipped, ...(Array.isArray(skipped) ? skipped.filter(Boolean) : [])])
  const entries = cur.entries.slice()

  const targetIndex = (draft) => {
    const byId = entries.findIndex((e) => e?.id === draft.id)
    if (byId >= 0) return byId
    let best = -1
    let bestN = 0
    entries.forEach((e, i) => {
      if (!e || (e.source !== 'evidence' && e.src !== 'evidence')) return
      const n = evidenceOverlapScore(draft, e)
      if (n > bestN) { best = i; bestN = n }
    })
    return best
  }

  for (const d of drafts) {
    if (!d || !d.id) continue
    if (skipSet.has(d.id)) continue // left out — never becomes an entry
    const { whoEdited, ...draft } = d
    const at = targetIndex(d)
    if (at < 0) {
      entries.push(draft)
      continue
    }
    const prev = entries[at]
    entries[at] = {
      ...prev,
      // Evidence facts refresh so the kept day's counts stay true…
      time: draft.time || prev.time,
      lat: draft.lat ?? prev.lat,
      lng: draft.lng ?? prev.lng,
      guess: draft.guess ?? prev.guess,
      span: draft.span || prev.span,
      photos: Array.isArray(draft.photos) && draft.photos.length ? draft.photos : prev.photos,
      // …and the per-photo ids ride the update, so a legacy entry graduates to
      // the honest overlap key on its first re-keep (C1).
      photoIds: Array.isArray(draft.photoIds) && draft.photoIds.length ? draft.photoIds : prev.photoIds,
      photoCount: draft.photoCount || prev.photoCount,
      // …chosen things hold.
      name: (draft.name || '').trim() ? draft.name : prev.name,
      for: whoEdited ? draft.for : (Array.isArray(prev.for) && prev.for.length ? prev.for : draft.for),
      id: prev.id,
    }
  }
  days[idx] = { ...days[idx], record: { ...cur, entries, skipped: [...skipSet] } }
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

// Rafa's OTHER additive contribution (design 04): "tell about today." The mic
// records a voice memo that becomes a normal Memory (memoryStore.js — same
// audio/transcript sync every voice memo already uses, so this needs NO new
// Memory field and NO D1 schema). This queue holds only the memory's id,
// pending a PARENT's placement — his words are "never auto-published into the
// record" until then. Creates the day if a hangout trip never wrote it (telling
// about today IS writing today's record). A duplicate id is a no-op.
export function queuePendingNote(trip, target = {}, memId) {
  if (!trip) throw new Error('queuePendingNote: trip required')
  if (!memId) return trip
  const { days, idx } = findOrCreateDay(trip, target)
  const cur = readRecord(days[idx])
  if (cur.pending.includes(memId)) return trip
  days[idx] = { ...days[idx], record: { ...cur, pending: [...cur.pending, memId] } }
  return commitDays(trip, days)
}

// The day's still-unplaced pending note memory ids. Shape-agnostic; empty on
// any day that predates this or carries none.
export function pendingNoteIds(day) {
  return readRecord(day).pending
}

// A PARENT resolves a pending note — the only function in this module that can
// (Rafa's side has no delete/edit of his own). `entryId` + `transcript` both set
// → APPENDS the transcript onto that entry's note (never overwrites one, `—`
// separated); `entryId` omitted/null → the note is simply dismissed from the
// queue and stays what it always was, an ordinary voice Memory ("a loose voice
// memory"). Either way the id drops off `pending`. A vanished/already-resolved
// id, or an entryId that no longer exists, is a no-op (not a throw) — this runs
// off a parent's UI action, and the world may have moved since it rendered.
export function resolvePendingNote(trip, target = {}, memId, entryId = null, transcript = '') {
  if (!trip) throw new Error('resolvePendingNote: trip required')
  if (!memId) return trip
  const { days, idx } = findOrCreateDay(trip, target)
  const cur = readRecord(days[idx])
  if (!cur.pending.includes(memId)) return trip

  let entries = cur.entries
  const text = (transcript || '').trim()
  if (entryId && text) {
    const ei = cur.entries.findIndex((e) => e?.id === entryId)
    if (ei >= 0) {
      entries = cur.entries.slice()
      const e = entries[ei]
      const sep = (e.note || '').trim() ? ' — ' : ''
      entries[ei] = { ...e, note: `${e.note || ''}${sep}${text}` }
    }
  }
  days[idx] = {
    ...days[idx],
    record: { ...cur, entries, pending: cur.pending.filter((id) => id !== memId) },
  }
  return commitDays(trip, days)
}
