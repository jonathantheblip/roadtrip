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

// Generate a stable, traceable ID for a Claude-proposed stop. Pattern
// `cl-<dayN>-<short>` so audit logs can recognize Claude-authored data
// at a glance, separate from the manual `j<dayN>-<n>` shape.
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
    lat: null,
    lng: null,
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

// Dispatcher — picks the action handler. M2 ships `add` first; the rest
// throw so a misordered chunk doesn't silently do nothing.
export function applyCardToTrip(trip, card) {
  if (!trip || !card || typeof card !== 'object') {
    throw new Error('applyCardToTrip: trip and card required')
  }
  switch (card.action) {
    case 'add':
      return applyAdd(trip, card)
    case 'move':
    case 'cancel':
    case 'multi':
      throw new Error(`applyCardToTrip: action "${card.action}" not yet wired`)
    default:
      throw new Error(`applyCardToTrip: unknown action "${card.action}"`)
  }
}
