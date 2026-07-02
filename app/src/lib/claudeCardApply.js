// Claude-in-App M2 — apply a confirmation card to a trip snapshot.
//
// Given a trip and a card (post user-edit), returns the next-trip
// snapshot ready for tripsApi.upsertTrip. Pure — no I/O, no React.
// Live shapes match the contract documented at the top of
// ConfirmCard.jsx and the system prompt in worker/src/index.js.
//
// M2's first wired shape is `add`; move/cancel/multi land in
// subsequent chunks but are stubbed below so the dispatcher fails
// loudly (rather than silently no-oping) when called early.

// Reuse the canonical human-date-range formatter so a date edited via a
// trip-settings card renders identically to one set at trip creation.
import { humanDateRange } from './createTripCard.js'
// The Record ("what actually happened") — the pure day-record model. The
// record-day card is the conversational mouth onto it.
import { normalizeRecordEntry, applyDayRecord } from './dayRecord.js'

// Convert a card.fields array into a flat { name → value } object,
// keeping the *user-edited* values from the draft (not the originals).
function fieldMap(card) {
  const out = {}
  for (const f of card.fields || []) {
    if (f && typeof f.name === 'string') out[f.name] = f.value
  }
  return out
}

// Trip-level / settings field names. A card carrying any of these is
// editing the TRIP record (destination, dates, title…), not a stop. Such
// a card belongs to applySettings (action "trip-settings") and must never
// reach a stop applier. `applyAdd` only needs a dayN, so a settings-shaped
// card mis-tagged `add` would otherwise SILENTLY write the trip-level edit
// as a junk stop — the corruption the dispatcher guards against below.
// `title` is intentionally absent: it doubles as a stop's own title on a
// legitimate `add` card, so it can't serve as a trip-level signal.
const TRIP_LEVEL_FIELDS = new Set([
  'endCity',
  'destination',
  'startCity',
  'subtitle',
  'locationLabel',
  'dates',
  'dateRange',
  'dateRangeStart',
  'dateRangeEnd',
  'shape', // the KIND of trip (stay | route) — so "make this a hangout" routes to settings, not a junk stop
])

// Return the trip-level field names present on a card (empty when none).
function tripLevelFieldsPresent(card) {
  const names = []
  for (const f of card?.fields || []) {
    if (f && typeof f.name === 'string' && TRIP_LEVEL_FIELDS.has(f.name)) {
      names.push(f.name)
    }
  }
  return names
}

// Resolve a target dayN (1-based) into the day's array index. Returns -1
// when not found. Days arrays may not be 1:1 with index — `n` is the
// authoritative day number even if reordering ever happens.
function findDayIndex(trip, dayN) {
  const days = trip?.data?.days || trip?.days || []
  for (let i = 0; i < days.length; i++) {
    if (days[i]?.n === dayN) return i
  }
  return -1
}

// Locate a stop by id across every day of the trip. Returns
// { dayIndex, stopIndex } or null if not found. Used by move + cancel
// — Sonnet emits stopId in card.target.stopId; the applier never
// guesses or substring-matches.
function findStopLocation(trip, stopId) {
  const days = trip?.data?.days || trip?.days || []
  for (let di = 0; di < days.length; di++) {
    const stops = days[di]?.stops || []
    for (let si = 0; si < stops.length; si++) {
      if (stops[si]?.id === stopId) return { dayIndex: di, stopIndex: si }
    }
  }
  return null
}

function daysOf(trip) {
  return trip?.data?.days || trip?.days || []
}

function withDays(trip, nextDays) {
  if (trip.data) return { ...trip, data: { ...trip.data, days: nextDays } }
  return { ...trip, days: nextDays }
}

// Generate a stable, traceable ID for a Claude-proposed stop. Pattern
// `cl-<dayN>-<short>` so audit logs can recognize Claude-authored data
// at a glance, separate from the manual `j<dayN>-<n>` shape.
function coordOrNull(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function newStopId(dayN) {
  let suffix
  try {
    suffix = crypto.randomUUID().slice(0, 6)
  } catch {
    suffix = Math.random().toString(36).slice(2, 8)
  }
  return `cl-${dayN || 'x'}-${suffix}`
}

function applyAdd(trip, card) {
  const target = card?.target || {}
  const dayN = target.dayN
  const idx = findDayIndex(trip, dayN)
  if (idx < 0) {
    throw new Error(`applyAdd: day ${dayN} not found in trip`)
  }
  const fields = fieldMap(card)
  const dayArr = (trip.data?.days || trip.days).slice()
  const day = { ...dayArr[idx] }
  const stops = Array.isArray(day.stops) ? day.stops.slice() : []
  // Mirror the canonical stop shape used by TripEditor.addStop so the
  // stop renders everywhere the manual composer's stops render.
  // Tag the new stop for the trip's ACTUAL travel party, not a hardcoded family
  // of four — a stop Claude adds to a Jonathan+Helen-only trip should be "for"
  // those two, not silently include the kids who aren't on the trip (which then
  // shows wrong avatar chips). Falls back to the full family only when a trip
  // carries no traveler list (renderer-safe; a stop with no `for` reads sparse).
  const party = (trip.travelers?.length ? trip.travelers : trip.data?.travelers) || ['jonathan', 'helen', 'aurelia', 'rafa']
  const newStop = {
    id: newStopId(dayN),
    time: fields.time || '',
    name: card.title || fields.name || fields.title || 'New stop',
    kind: (fields.kind || 'sights').toString().toLowerCase(),
    for: party,
    note: fields.notes || fields.note || fields.description || '',
    address: fields.address || fields.location || '',
    // Honor geocoded coords when a caller supplies them (Calendar Pull
    // passes lat/lng for the map). Absent / null / '' → null, unchanged
    // for every existing caller (Claude cards don't emit coord fields).
    // Guard the null/'' cases explicitly — Number(null) and Number('')
    // are 0, which would wrongly stamp a stop at the equator.
    lat: coordOrNull(fields.lat),
    lng: coordOrNull(fields.lng),
    url: '',
    reservation: '',
    confirmation: '',
    phone: '',
    source: 'claude',
    claudeMeta: {
      cardId: card.id || null,
      addedAt: new Date().toISOString(),
    },
  }
  const position = target.position
  if (typeof position === 'number' && position >= 0 && position < stops.length) {
    stops.splice(position, 0, newStop)
  } else {
    stops.push(newStop)
  }
  day.stops = stops
  dayArr[idx] = day
  if (trip.data) {
    return { ...trip, data: { ...trip.data, days: dayArr } }
  }
  return { ...trip, days: dayArr }
}

// Apply a `move` card — edit a stop in place, optionally relocating to
// a different day. Sonnet identifies the stop via target.stopId. Card
// fields whose names match canonical stop properties (time, name,
// address, kind, note) overwrite those properties. Cross-day moves
// happen when target.dayN differs from the stop's current day.
// The stop properties a move card can actually change. A card that changes
// NONE of them (and isn't relocating across days) would apply as a silent
// no-op — the live "swap dinner → Saved ✓ → nothing changed" bug
// (2026-07-01): the model emitted `from`/`to` display prose instead of
// canonical fields, fieldMap() came back empty, and the card still
// reported success. Zero actual changes must FAIL LOUD (G6/G7). The check
// is VALUE-based (next vs. current), so a card that merely echoes the
// stop's existing values back is caught too — same lived experience,
// different card shape.
const CANONICAL_STOP_PROPS = ['time', 'name', 'address', 'kind', 'note']

function applyMove(trip, card) {
  const target = card?.target || {}
  const stopId = target.stopId
  if (!stopId) throw new Error('applyMove: target.stopId required')
  const loc = findStopLocation(trip, stopId)
  if (!loc) throw new Error(`applyMove: stop ${stopId} not found`)
  const fields = fieldMap(card)
  const days = daysOf(trip).map((d) => ({ ...d, stops: [...(d.stops || [])] }))
  const origStop = days[loc.dayIndex].stops[loc.stopIndex]
  // Apply field updates by canonical name. Unknown field names are
  // ignored — Sonnet may emit derived fields (e.g., "Duration") for
  // display that don't map to a stored property. The `location` /
  // `description` aliases mirror applyAdd (and the worker prompt documents
  // them un-scoped to action) — alias first, canonical name last, so the
  // canonical name wins when both are present (same precedence as add).
  const next = { ...origStop }
  if ('time' in fields) next.time = fields.time
  if ('name' in fields) next.name = fields.name
  if ('title' in fields) next.name = fields.title
  if ('location' in fields) next.address = fields.location
  if ('address' in fields) next.address = fields.address
  if ('kind' in fields) next.kind = String(fields.kind || '').toLowerCase()
  if ('description' in fields) next.note = fields.description
  if ('note' in fields) next.note = fields.note
  if ('notes' in fields) next.note = fields.notes
  // No-op guard: the card must actually CHANGE a stop property or relocate
  // the stop to a different day. Otherwise "Saved ✓" would be a lie.
  const changedField = CANONICAL_STOP_PROPS.some((k) => next[k] !== origStop[k])
  const crossDay = typeof target.dayN === 'number' && days[loc.dayIndex].n !== target.dayN
  if (!changedField && !crossDay) {
    throw new Error(
      'applyMove: card carried no editable stop fields and no day change — refusing a no-op save'
    )
  }
  next.claudeMeta = {
    ...(origStop.claudeMeta || {}),
    cardId: card.id || null,
    editedAt: new Date().toISOString(),
  }
  // Same-day update: replace in place.
  if (typeof target.dayN !== 'number' || days[loc.dayIndex].n === target.dayN) {
    days[loc.dayIndex].stops[loc.stopIndex] = next
    return withDays(trip, days)
  }
  // Cross-day relocation: remove from current day, append to target day.
  const newDayIdx = findDayIndex(trip, target.dayN)
  if (newDayIdx < 0) {
    throw new Error(`applyMove: target day ${target.dayN} not found`)
  }
  days[loc.dayIndex].stops.splice(loc.stopIndex, 1)
  days[newDayIdx].stops.push(next)
  return withDays(trip, days)
}

// Apply a `cancel` card — remove a stop from its day's stops array.
function applyCancel(trip, card) {
  const target = card?.target || {}
  const stopId = target.stopId
  if (!stopId) throw new Error('applyCancel: target.stopId required')
  const loc = findStopLocation(trip, stopId)
  if (!loc) throw new Error(`applyCancel: stop ${stopId} not found`)
  const days = daysOf(trip).map((d, i) =>
    i === loc.dayIndex
      ? { ...d, stops: (d.stops || []).filter((_, si) => si !== loc.stopIndex) }
      : d
  )
  return withDays(trip, days)
}

// Apply a `multi` card — fold each non-skipped sub-edit through its
// own applier. Skipped edits (the reader unchecked them in the UI)
// don't run. Each sub-edit inherits the parent card's id so the
// resulting stops carry one cardId stamp (the multi-edit's), keeping
// re-load detection coherent.
function applyMulti(trip, card) {
  const edits = Array.isArray(card.edits) ? card.edits : []
  const live = edits.filter((e) => e && !e.skipped)
  // Defense-in-depth: the UI disables Save at zero live rows, but a card
  // arriving here with nothing to run must not report success (no-op class).
  if (!live.length) {
    throw new Error('applyMulti: no live edits on the card — refusing a no-op save')
  }
  let next = trip
  for (const e of live) {
    // A move/cancel sub-edit must name its OWN stop. Inheriting the parent
    // card's stopId is never right here: pre-fix, a target-less cancel row
    // labeled "Lobster Roll Co." would have deleted whatever stop the
    // PARENT target pointed at — a destructive wrong-stop edit. Fail loud
    // instead of guessing.
    if ((e.action === 'move' || e.action === 'cancel') && !e.target?.stopId) {
      throw new Error(
        `applyMulti: sub-edit "${e.title || e.action}" (${e.action}) needs its own ` +
          'target.stopId — refusing to guess the stop'
      )
    }
    const subCard = {
      ...e,
      id: e.id || card.id,
      target: e.target || card.target,
    }
    try {
      next = applyCardToTrip(next, subCard)
    } catch (err) {
      // A no-op ROW inside a batch: rewrap naming the row, so the reader
      // learns WHICH row to Skip — the batch is atomic (nothing above was
      // written), and "the card carried no change" would be false for a
      // batch whose other rows carried real ones.
      if (/refusing a no-op save/.test(String(err?.message || ''))) {
        throw new Error(
          `applyMulti: sub-edit "${e.title || e.action}" carried no actual change — ` +
            'skip that row to save the rest (refusing a no-op save)'
        )
      }
      throw err
    }
  }
  return next
}

// Apply a `record-day` card — write "what actually happened" onto a day's
// RECORD (day.record), never its plan (day.stops). Entries arrive as the
// card's `entries` array (each row skippable in the UI, same escape hatch
// as multi); they keep told order; ids derive from the card so a retried
// save upserts instead of duplicating. Zero live NAMED entries fails loud
// (the silent no-op class — "Saved ✓" on nothing recorded would be a lie).
function applyRecordDay(trip, card) {
  const target = card?.target || {}
  const raw = Array.isArray(card.entries) ? card.entries : []
  const party =
    (trip.travelers?.length ? trip.travelers : trip.data?.travelers) || []
  const live = raw.filter((e) => e && !e.skipped)
  const entries = live
    .map((e, i) =>
      normalizeRecordEntry(e, {
        cardId: card.id || null,
        index: raw.indexOf(e), // index in the FULL list — stable across skips
        party,
        recordedBy: card.recordedBy || null,
      })
    )
    .filter(Boolean)
  if (!entries.length) {
    throw new Error(
      'applyRecordDay: no named entries to record — refusing a no-op save'
    )
  }
  return applyDayRecord(trip, { dayIso: target.dayIso, dayN: target.dayN }, entries)
}

// Merge trip-level field updates into the record at the correct level —
// the seed shape keeps fields at the root, the D1 row shape nests them
// under `.data` (same split withDays handles for days). Never touches
// days/stops: those keys are absent from `patch`, so the existing array
// passes through by reference, untouched.
function withTripFields(trip, patch) {
  if (trip.data) return { ...trip, data: { ...trip.data, ...patch } }
  return { ...trip, ...patch }
}

// Apply a `trip-settings` card — edit TRIP-LEVEL fields (destination,
// title, dates, start city, subtitle, location label) on the trip
// record. Touches ONLY trip-level keys; days and stops pass through
// untouched. Field logic mirrors cardToTrip at trip creation
// (createTripCard.js:131–141) so a setting edited here matches one set
// at creation. Only keys the card actually carries are written, so a
// one-field edit leaves every other field intact.
function applySettings(trip, card) {
  const fields = fieldMap(card)
  const cur = trip.data || trip // current trip-level values live here
  const patch = {}

  if ('title' in fields) patch.title = fields.title || cur.title || 'Untitled trip'
  if ('subtitle' in fields) {
    patch.subtitle = fields.subtitle || ''
    // cardToTrip mirrors subtitle → overview; keep them in lockstep.
    patch.overview = fields.subtitle || ''
  }
  // endCity is the canonical "destination"; accept `destination` as the
  // worker-prompt alias, writing both to endCity.
  if ('endCity' in fields) patch.endCity = fields.endCity || ''
  if ('destination' in fields) patch.endCity = fields.destination || ''
  if ('startCity' in fields) patch.startCity = fields.startCity || ''
  if ('locationLabel' in fields) patch.locationLabel = fields.locationLabel || ''
  // The trip KIND. Only the two valid values are written (an explicit trip.shape
  // wins in inferTripShape, flipping the home shell stay↔route); a loose word that
  // leaked through as the value is IGNORED so the heuristic still decides — and so a
  // real road trip can't be flipped to a stay by a bad value (G5). Mirrors cardToTrip.
  if ('shape' in fields && (fields.shape === 'stay' || fields.shape === 'route')) {
    patch.shape = fields.shape
  }

  // Dates: ISO yyyy-mm-dd start/end. When either changes, recompute the
  // human-readable dateRange string the themed views render — exactly as
  // cardToTrip does — carrying the unchanged endpoint forward.
  if ('dateRangeStart' in fields || 'dateRangeEnd' in fields) {
    const ds =
      'dateRangeStart' in fields ? fields.dateRangeStart || null : cur.dateRangeStart ?? null
    const de =
      'dateRangeEnd' in fields ? fields.dateRangeEnd || null : cur.dateRangeEnd ?? null
    patch.dateRangeStart = ds
    patch.dateRangeEnd = de
    patch.dateRange = humanDateRange(ds, de)
  }

  // No-op guard: nothing recognized to write (e.g. only an unknown field
  // name, or a shape value that wasn't one of the two valid kinds). The bad
  // value still never lands — but the reader hears "that didn't apply"
  // instead of a false Saved ✓.
  if (Object.keys(patch).length === 0) {
    throw new Error(
      'applySettings: card carried no recognized trip-level changes — refusing a no-op save'
    )
  }

  return withTripFields(trip, patch)
}

// Dispatcher — picks the action handler.
export function applyCardToTrip(trip, card) {
  if (!trip || !card || typeof card !== 'object') {
    throw new Error('applyCardToTrip: trip and card required')
  }
  switch (card.action) {
    case 'add': {
      // Guard: a settings-shaped card (carrying trip-level fields like
      // endCity / dates) mis-tagged `add` must NOT fall through to
      // applyAdd — which only needs a dayN and would silently write the
      // trip-level edit as a junk stop. Fail loud instead; trip-level
      // edits route through applySettings ("trip-settings"). This stays
      // as defense even after that applier ships, against a mis-tagged
      // card. (Commit 3 wraps this raw message in plain language.)
      const strayTripFields = tripLevelFieldsPresent(card)
      if (strayTripFields.length) {
        throw new Error(
          `applyCardToTrip: card tagged "add" carries trip-level field(s) ` +
            `[${strayTripFields.join(', ')}] — this is a trip-settings edit, ` +
            `not a stop add; refusing to create a stop`
        )
      }
      return applyAdd(trip, card)
    }
    case 'move':
      return applyMove(trip, card)
    case 'cancel':
      return applyCancel(trip, card)
    case 'multi':
      return applyMulti(trip, card)
    case 'record-day':
      return applyRecordDay(trip, card)
    case 'trip-settings':
      return applySettings(trip, card)
    default:
      throw new Error(`applyCardToTrip: unknown action "${card.action}"`)
  }
}

// Map a thrown apply/commit error to a plain, reader-facing line. The
// reader NEVER sees a raw internal message, a code, or a stack — only one
// of these three plain strings. The raw error is preserved for devs by
// the caller (ConfirmCard.handleSave logs it to the upload-log trace
// surface). Mirrors ClaudeChat's userFacingClaudeError for the streaming
// path. Pure + exported so the mapping is unit-tested directly.
export function userFacingApplyError(err) {
  const raw = String(err?.message || err || '')
  const msg = raw.toLowerCase()
  // The no-op guards are checked FIRST: their fixed suffixes are
  // distinctive, and a model-authored row title interpolated into the
  // message (a stop could be named "Lost & Not Found") must never steer
  // the mapping into the wrong branch below.
  // A no-op ROW in a batch — name it, so the reader knows what to Skip.
  const rowMatch = /sub-edit "(.+?)" carried no actual change/.exec(raw)
  if (rowMatch) {
    return `The “${rowMatch[1]}” edit in that batch didn't actually carry a change, so nothing was saved. Skip that row to save the rest, or ask again.`
  }
  // The no-op guard: the card resolved to zero actual changes (or a batched
  // edit didn't name its stop). Saving it would have reported success while
  // changing nothing — the live dinner-swap bug. Be honest instead.
  if (/no-op save|refusing to guess the stop/.test(msg)) {
    return "That card didn't actually carry a change, so I didn't save it. Try asking again — say exactly what should move or change."
  }
  // A day or stop the card targeted is no longer where it was — the most
  // common genuine failure (the trip changed under the draft).
  if (/not found/.test(msg)) {
    return "I couldn't find that day or stop in the trip — it may have changed since. Tap back in and try again."
  }
  // A trip-level / settings-shaped edit the apply path refused (the guard,
  // or a malformed trip-settings card).
  if (/trip-level field|trip-settings/.test(msg)) {
    return "I couldn't apply that as a trip change. Try rephrasing what you'd like to update."
  }
  return 'Something went wrong applying that change. Try again, or rephrase what you were asking.'
}
