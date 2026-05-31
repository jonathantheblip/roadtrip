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
  const newStop = {
    id: newStopId(dayN),
    time: fields.time || '',
    name: card.title || fields.name || fields.title || 'New stop',
    kind: (fields.kind || 'sights').toString().toLowerCase(),
    for: ['jonathan', 'helen', 'aurelia', 'rafa'],
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
  // display that don't map to a stored property.
  const next = { ...origStop }
  if ('time' in fields) next.time = fields.time
  if ('name' in fields) next.name = fields.name
  if ('title' in fields) next.name = fields.title
  if ('address' in fields) next.address = fields.address
  if ('kind' in fields) next.kind = String(fields.kind || '').toLowerCase()
  if ('note' in fields) next.note = fields.note
  if ('notes' in fields) next.note = fields.notes
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
  let next = trip
  for (const e of edits) {
    if (!e || e.skipped) continue
    const subCard = {
      ...e,
      id: e.id || card.id,
      target: e.target || card.target,
    }
    next = applyCardToTrip(next, subCard)
  }
  return next
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
    default:
      throw new Error(`applyCardToTrip: unknown action "${card.action}"`)
  }
}
