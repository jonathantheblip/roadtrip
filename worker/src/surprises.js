// worker/src/surprises.js — the SERVER-SIDE masking boundary.
// ----------------------------------------------------------------------------
// The mirror of app/src/lib/surprises.js, and the real security boundary: this
// runs before any memory leaves the worker (the device-sync read) so a masked
// surprise never reaches a device — or Claude — it's hidden from. The client
// filter is UX; THIS is what the contract relies on.
//
// One deliberate difference from the client transform: a teaser masked from the
// viewer is NOT dropped but STRIPPED to a "something's coming" STUB — the
// recipient's device needs that stub to render the teaser card, but with the
// real title / detail / media removed here, server-side. A cover is swapped for
// its stand-in. Both projections carry `masked: true` so a recipient device can
// never push them back and clobber the real row (postMemory refuses a
// masked-flagged write; pushMemory skips it).

export function isSurprise(m) {
  return !!(m && Array.isArray(m.hideFrom) && m.hideFrom.length > 0)
}

// Is this surprise currently hidden FROM `viewer`? Author + revealed never are.
export function isMaskedFrom(m, viewer) {
  if (!isSurprise(m)) return false
  if (m.authorTraveler === viewer) return false
  if (m.revealed) return false
  return m.hideFrom.includes('everyone') || m.hideFrom.includes(viewer)
}

// A teaser masked from the viewer → the stub the "Something's coming" card
// needs: enough to say "a wrapped <what>, reveals <when>", nothing more.
function teaserStub(m) {
  return {
    id: m.id,
    tripId: m.tripId,
    stopId: m.stopId,
    authorTraveler: m.authorTraveler,
    visibility: m.visibility,
    hideFrom: m.hideFrom,
    reveal: m.reveal,
    conceal: 'teaser',
    // ONLY the kind of thing — never the title / detail / media.
    surprise: { what: m.surprise?.what || 'A surprise' },
    reactions: [],
    masked: true,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }
}

// A cover masked from the viewer → the believable stand-in (cover only, no real
// fields, no hideFrom — to the recipient it's an ordinary memory/stop).
function coverStandIn(m) {
  const cov = m.cover || {}
  return {
    id: m.id,
    tripId: m.tripId,
    stopId: m.stopId,
    authorTraveler: m.authorTraveler,
    visibility: m.visibility,
    kind: 'text',
    text: cov.title || 'A stop',
    caption: cov.title || undefined,
    isCover: true,
    cover: {
      icon: cov.icon || '📍',
      title: cov.title || 'A stop',
      loc: cov.loc || '',
      time: cov.time || '',
      weather: cov.weather || '',
      packing: cov.packing || '',
      // Where it sits on the recipient's itinerary (Slice 3a); omit when unset.
      ...(cov.dayIso ? { dayIso: cov.dayIso } : {}),
    },
    reactions: [],
    masked: true,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }
}

// The per-recipient transform. Author / revealed / non-targeted / non-surprise
// pass through untouched; a masked teaser is stubbed; a masked cover substituted.
export function maskMemoryForViewer(m, viewer) {
  if (!isMaskedFrom(m, viewer)) return m
  return m.conceal === 'cover' ? coverStandIn(m) : teaserStub(m)
}

// ── Whole-trip masking (Slice 3b) — server mirror ────────────────────────────
// A trip is a surprise when its `.surprise.hideFrom` is non-empty (the masking
// rides inside data_json, so no schema change). For a masked-from viewer the real
// trip is SUBSTITUTED with a believable stand-in BEFORE it leaves the worker — the
// real title/itinerary never reach them. Mirrors app/src/lib/surprises.js.

export function isTripSurprise(trip) {
  return !!(trip && trip.surprise && Array.isArray(trip.surprise.hideFrom) && trip.surprise.hideFrom.length)
}

export function isTripMaskedFrom(trip, viewer) {
  if (!isTripSurprise(trip)) return false
  const s = trip.surprise
  if (s.author === viewer) return false
  if (s.revealed) return false
  return s.hideFrom.includes('everyone') || s.hideFrom.includes(viewer)
}

function tripStandIn(trip) {
  const s = trip.surprise || {}
  const cov = s.cover || {}
  const isCover = s.conceal === 'cover'
  return {
    id: trip.id,
    title: isCover ? cov.title || 'A trip' : '🎁 A surprise trip',
    subtitle: isCover ? cov.loc || '' : 'Someone planned something',
    dateRange: trip.dateRange,
    dateRangeStart: trip.dateRangeStart,
    dateRangeEnd: trip.dateRangeEnd,
    locationLabel: isCover ? cov.loc || '' : '',
    startCity: isCover ? cov.loc || '' : '',
    endCity: isCover ? cov.loc || '' : '',
    travelers: trip.travelers,
    days: [],
    masked: true,
    _maskedTrip: true,
    _coverTrip: isCover,
  }
}

// ── Per-stop masking (Slice 2) — server mirror + the save-back clobber guard ──
// A single STOP inside trip.days[].stops[] can carry the same masking layer as a
// memory or a whole trip (rides inside data_json, no schema change):
//   stop.surprise = { author, hideFrom, reveal, conceal, cover, revealed }
// teaser → a sanitized "🎁 Something's coming" placeholder; cover → a believable
// stand-in. Both SUBSTITUTE (never drop) so the day still reads in order. Mirrors
// app/src/lib/surprises.js. maskTripForViewer below folds this into the trip read,
// so getTrips / loadTripsSummary / the Claude trip context all inherit it.

export function isStopSurprise(stop) {
  return !!(stop && stop.surprise && Array.isArray(stop.surprise.hideFrom) && stop.surprise.hideFrom.length)
}

export function isStopMaskedFrom(stop, viewer) {
  if (!isStopSurprise(stop)) return false
  const s = stop.surprise
  if (s.author === viewer) return false
  if (s.revealed) return false
  return s.hideFrom.includes('everyone') || s.hideFrom.includes(viewer)
}

function stopCoverStandIn(stop) {
  const cov = stop.surprise?.cover || {}
  const bring = [cov.weather, cov.packing].filter(Boolean).join(' · ')
  return {
    id: stop.id,
    name: cov.title || 'A stop',
    time: cov.time || stop.time || '',
    kind: cov.loc || undefined,
    note: bring || undefined,
    masked: true,
    _cover: true,
  }
}

function fmtRevealDate(at) {
  if (typeof at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(at)) {
    const [, m, d] = at.split('-').map(Number)
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    if (months[m - 1] && d) return `${months[m - 1]} ${d}`
  }
  return at || 'a date'
}

// SANITIZED reveal hint for the teaser stub — mirrors the client's
// `reveals ${revealLabel(...)}`. An arrival reveal's place name + coords are
// DROPPED (they'd name the secret); only a generic "when you arrive" survives.
function revealHint(reveal) {
  if (reveal?.type === 'date') return `reveals on ${fmtRevealDate(reveal.at)}`
  if (reveal?.type === 'arrival') return 'reveals when you arrive at the place'
  return "reveals when the moment's right"
}

function stopTeaserStub(stop) {
  return {
    id: stop.id,
    name: "🎁 Something's coming",
    time: stop.time || '',
    note: revealHint(stop.surprise?.reveal),
    masked: true,
    _teaser: true,
  }
}

function maskStopForViewer(stop, viewer) {
  if (!isStopMaskedFrom(stop, viewer)) return stop
  return stop.surprise.conceal === 'cover' ? stopCoverStandIn(stop) : stopTeaserStub(stop)
}

// Apply per-stop masking across a trip's days. Referential stability: returns the
// trip unchanged when nothing applies (the common no-surprise path costs nothing).
export function maskTripStops(trip, viewer) {
  if (!trip || !Array.isArray(trip.days)) return trip
  let changed = false
  const days = trip.days.map((d) => {
    const stops = d.stops || []
    let dayChanged = false
    const out = stops.map((s) => {
      const m = maskStopForViewer(s, viewer)
      if (m !== s) dayChanged = true
      return m
    })
    if (!dayChanged) return d
    changed = true
    return { ...d, stops: out }
  })
  return changed ? { ...trip, days } : trip
}

export function maskTripForViewer(trip, viewer) {
  if (isTripMaskedFrom(trip, viewer)) return tripStandIn(trip)
  return maskTripStops(trip, viewer)
}

// ── The save-back clobber guard (the NEW per-stop danger) ─────────────────────
// A whole-trip stand-in carries `masked:true` so postTrip can refuse it. But a
// PER-STOP-masked trip is otherwise a REAL, editable trip — a recipient can
// legitimately co-plan it. The danger: a writer who had a stop hidden from them
// never received it (they got a stub/cover), so their saved copy is MISSING the
// real stop. Writing that back would erase the hidden stop for everyone — the
// surprise destroyed. So before persisting, restore from the STORED trip every
// stop hidden from the writer: drop the writer's projection of it, then re-insert
// the real stored stop at its stored position. The author / non-targeted / a
// revealed stop are never masked-from the writer → nothing to restore (fast path).
//
// Returns the reconciled days array (the writer's edits to everything they COULD
// see, plus the protected stops restored). Pure — index.js does the D1 read/write.
export function preserveHiddenStops(storedTrip, incomingTrip, writer) {
  const incomingDays = Array.isArray(incomingTrip?.days) ? incomingTrip.days : []
  const storedDays = Array.isArray(storedTrip?.days) ? storedTrip.days : []

  // Every stored stop hidden FROM this writer, with where it lived.
  const protectedStops = []
  storedDays.forEach((d, di) => {
    ;(d.stops || []).forEach((s, si) => {
      if (isStopMaskedFrom(s, writer)) protectedStops.push({ stop: s, dayIso: d.isoDate || null, di, si })
    })
  })
  if (!protectedStops.length) return incomingDays // fast path: nothing to protect

  // Work on a shallow clone (clone the day objects + stops we touch).
  const days = incomingDays.map((d) => ({ ...d, stops: Array.isArray(d.stops) ? d.stops.slice() : [] }))
  const protectedIds = new Set(protectedStops.map((p) => p.stop.id))
  // Drop any echo of a protected id from the writer's incoming stops (a cover
  // stand-in or stub carries the same id; a teaser-dropped stop won't be present).
  for (const d of days) d.stops = d.stops.filter((s) => !protectedIds.has(s?.id))

  for (const p of protectedStops) {
    // Destination day: by isoDate, else by stored index, else recreate (the
    // writer dropped the whole day the secret lived on).
    let dest = p.dayIso ? days.find((d) => d.isoDate === p.dayIso) : days[p.di]
    if (!dest) {
      const sd = storedDays[p.di] || { isoDate: p.dayIso }
      dest = { ...sd, stops: [] }
      days.splice(Math.min(p.di, days.length), 0, dest)
    }
    if (!Array.isArray(dest.stops)) dest.stops = []
    dest.stops.splice(Math.min(p.si, dest.stops.length), 0, p.stop)
  }
  return days
}
