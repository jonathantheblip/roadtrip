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

// ── Per-PART masking ("surprises by sentence", new-trip redesign) ─────────────
// A composite trip's parts[] (a flight, a city, a stay) ride in data_json and can
// carry the SAME masking layer as a stop:
//   part.surprise = { author, hideFrom, reveal, conceal, cover, revealed }
// THE LOAD-BEARING DIFFERENCE FROM A STOP: a part spans DATES, and the day-by-day
// detail for those dates lives in the flat trip.days[]. So masking the part is NOT
// enough — the days inside the part's [dateStart,dateEnd] window must be stripped
// too, or the secret leaks through the day list (and PartsTripView, which derives
// a part's days by date). The part and its days are ONE secret. Mirrors the client.
export function isPartSurprise(part) {
  return !!(part && part.surprise && Array.isArray(part.surprise.hideFrom) && part.surprise.hideFrom.length)
}

export function isPartMaskedFrom(part, viewer) {
  if (!isPartSurprise(part)) return false
  const s = part.surprise
  if (s.author === viewer) return false
  if (s.revealed) return false
  return s.hideFrom.includes('everyone') || s.hideFrom.includes(viewer)
}

function partCoverStandIn(part) {
  const cov = part.surprise?.cover || {}
  return {
    id: part.id,
    type: part.type || 'stay',
    title: cov.title || 'A part of the trip',
    place: cov.loc || null,
    dateStart: part.dateStart || null,
    dateEnd: part.dateEnd || null,
    masked: true,
    _cover: true,
  }
}

function partTeaserStub(part) {
  return {
    id: part.id,
    type: part.type || 'stay',
    title: "🎁 Something's coming",
    place: null,
    dateStart: part.dateStart || null,
    dateEnd: part.dateEnd || null,
    note: revealHint(part.surprise?.reveal),
    masked: true,
    _teaser: true,
  }
}

function maskPartForViewer(part, viewer) {
  if (!isPartMaskedFrom(part, viewer)) return part
  return part.surprise?.conceal === 'cover' ? partCoverStandIn(part) : partTeaserStub(part)
}

// Does an ISO date fall within a part's [dateStart, dateEnd] window (inclusive)?
// A part with a start but no end is a single-day point. (Primitive — the trip-level
// strip below uses CLAMPED windows so it can't diverge from the client.)
export function isoInPartWindow(iso, part) {
  if (!iso || !part?.dateStart) return false
  const d = iso.slice(0, 10)
  const start = part.dateStart.slice(0, 10)
  const end = (part.dateEnd || part.dateStart).slice(0, 10)
  return d >= start && d <= end
}

function isoDayBefore(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - 86400000).toISOString().slice(0, 10)
}

// Day → owning part INDEX, EXACTLY as app/src/lib/tripParts.js `partsWithDays`
// claims it. THE single source of part-day ownership on the server (the mask AND
// the weave both use it — no second copy to drift). A dated part's window runs from
// its dateStart to the day BEFORE the next dated part begins (clamped — so a part
// with NO dateEnd still owns every day up to the next leg). A day matching no window
// (DATELESS or out-of-window) belongs to the first dated part, or — when NO part is
// dated — to part 0 (mirrors partsWithDays' `dated.length ? dated[0].i : parts.length
// ? 0 : -1`; an earlier `-1` here under-stripped an all-undated composite = a leak).
// Returns a predicate (iso) => owning part index (or -1 when there are no parts).
export function partDayOwner(parts) {
  const list = Array.isArray(parts) ? parts : []
  const order = list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ka = a.p.dateStart || '9999-99-99'
      const kb = b.p.dateStart || '9999-99-99'
      return ka === kb ? a.i - b.i : ka < kb ? -1 : 1
    })
  const dated = order.filter((o) => o.p.dateStart)
  const win = new Map() // original index -> { start, end } | null
  dated.forEach((o, k) => {
    const start = o.p.dateStart.slice(0, 10)
    let end = (o.p.dateEnd && o.p.dateEnd.slice(0, 10)) || start
    const next = dated[k + 1]
    if (next) {
      const cap = isoDayBefore(next.p.dateStart.slice(0, 10))
      if (cap && cap < end) end = cap
    }
    win.set(o.i, end >= start ? { start, end } : null)
  })
  const firstDatedIdx = dated.length ? dated[0].i : list.length ? 0 : -1
  return (iso) => {
    const d = typeof iso === 'string' ? iso.slice(0, 10) : null
    if (d) {
      for (const o of dated) {
        const w = win.get(o.i)
        if (w && d >= w.start && d <= w.end) return o.i
      }
    }
    return firstDatedIdx
  }
}

// Predicate: does this day belong to a part HIDDEN FROM the viewer? (Built on the
// shared ownership above, so it can never diverge from the client render.)
function hiddenDayOwnership(trip, viewer) {
  const parts = trip.parts || []
  const owner = partDayOwner(parts)
  return (iso) => {
    const i = owner(iso)
    return i >= 0 && isPartMaskedFrom(parts[i], viewer)
  }
}

// Apply per-part masking across a composite trip: each part hidden from the viewer
// is swapped for a stub/cover AND the trip.days OWNED BY a hidden part are STRIPPED
// (the part + its days are one secret). Day ownership matches the client exactly
// (hiddenDayOwnership). Referential stability when nothing applies.
export function maskTripParts(trip, viewer) {
  if (!trip || !Array.isArray(trip.parts) || !trip.parts.length) return trip
  let changed = false
  const parts = trip.parts.map((p) => {
    const m = maskPartForViewer(p, viewer)
    if (m !== p) changed = true
    return m
  })
  if (!changed) return trip
  const isHiddenDay = hiddenDayOwnership(trip, viewer)
  const days = Array.isArray(trip.days) ? trip.days.filter((d) => !isHiddenDay(d?.isoDate)) : trip.days
  return { ...trip, parts, days }
}

export function maskTripForViewer(trip, viewer) {
  if (isTripMaskedFrom(trip, viewer)) return tripStandIn(trip)
  // Per-stop masking first (hides individual stops in visible days), then per-part
  // (stubs hidden parts + strips their whole day window). Both fold into every read.
  return maskTripParts(maskTripStops(trip, viewer), viewer)
}

// ── Worker-only cache strip (the Build 4b/4c leak fix, 2026-07-12) ────────────
// recordHealDecisions caches Build 4b/4c resolution results on trip.data_json
// (`placeNames`: coord→locality names; `landmarkLookups`: signage-query →
// resolved venue name + exact pin) — harvested from RAW, unmasked memories and
// the RAW trip. maskTripForViewer substitutes hidden stops/parts/days but
// spreads the rest of the trip object through (`{...trip, days}`), so these
// top-level keys sailed out on the ordinary GET /trips pull to EVERY family
// member — a resolved secret-venue name/pin could reach the exact person a
// stop is hidden from (adversarial review, confirmed). Clients have NO reader
// for these keys (they're worker-side caches, clobber-recomputable by design),
// so the fix is to strip them from every serve path, all viewers, always —
// applied ALONGSIDE maskTripForViewer at each exit, deliberately NOT inside it
// (this function mirrors app/src/lib/surprises.js; a server-only strip inside
// the mirrored body would widen the documented drift). Keep this list in sync
// with every worker-written trip.data_json cache. `weatherDays`
// (BUILD_PLAN_WITNESS_FLEET_2.md W1, weatherBackfill.js) added here in the
// SAME commit that introduces the writer — the ledger-consumer rule this leak
// fix established, stated at its own execution site so it can't be missed.
const WORKER_ONLY_TRIP_KEYS = ['placeNames', 'landmarkLookups', 'weatherDays']
export function stripWorkerCaches(trip) {
  if (!trip || typeof trip !== 'object') return trip
  if (!WORKER_ONLY_TRIP_KEYS.some((k) => k in trip)) return trip // referential stability
  const out = { ...trip }
  for (const k of WORKER_ONLY_TRIP_KEYS) delete out[k]
  return out
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

// ── The save-back clobber guard for PARTS (mirrors preserveHiddenStops) ───────
// A part-masked trip is otherwise a REAL, editable trip (a recipient can co-plan
// the parts they CAN see). The danger: a writer hidden from a part received neither
// the real part (they got a stub/cover) NOR its days (stripped) — so their saved
// copy is missing both. Writing it back would erase the surprise for everyone. So
// before persisting, restore from the STORED trip every part hidden from the writer
// AND the stored days inside its window. Returns { parts, days }. Pure — index.js
// does the D1 read/write. Author / non-targeted / revealed → fast path (nothing to
// protect). Only called for trips that actually carry parts (legacy stays untouched).
export function preserveHiddenParts(storedTrip, incomingTrip, writer) {
  const storedParts = Array.isArray(storedTrip?.parts) ? storedTrip.parts : []
  const incomingParts = Array.isArray(incomingTrip?.parts) ? incomingTrip.parts : []
  const incomingDays = Array.isArray(incomingTrip?.days) ? incomingTrip.days : []
  const storedDays = Array.isArray(storedTrip?.days) ? storedTrip.days : []

  const protectedParts = []
  storedParts.forEach((part, pi) => {
    if (isPartMaskedFrom(part, writer)) protectedParts.push({ part, pi })
  })
  if (!protectedParts.length) return { parts: incomingParts, days: incomingDays } // fast path

  // Restore the parts: drop the writer's echo (a stub/cover carries the same id),
  // then re-insert each stored real part at its stored index.
  const protectedIds = new Set(protectedParts.map((p) => p.part.id))
  const parts = incomingParts.filter((p) => !protectedIds.has(p?.id))
  for (const { part, pi } of protectedParts) parts.splice(Math.min(pi, parts.length), 0, part)

  // Restore the days OWNED BY a protected part — using the SAME clamped ownership
  // the mask used to strip them (hiddenDayOwnership), so restore covers exactly what
  // was hidden (incl. a no-dateEnd part's full run + a dateless day on the first
  // part). Drop the writer's days there (a gap / echoes), re-insert the stored days.
  const isProtectedDay = hiddenDayOwnership(storedTrip, writer)
  const days = incomingDays.filter((d) => !isProtectedDay(d?.isoDate))
  storedDays.forEach((day, di) => {
    if (isProtectedDay(day?.isoDate)) days.splice(Math.min(di, days.length), 0, day)
  })
  return { parts, days }
}
