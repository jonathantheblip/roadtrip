// surprises.js — the Surprise / Masking mechanic's pure logic.
// ----------------------------------------------------------------------------
// DOM-free on purpose: this is the SINGLE testable source of the masking
// contract, shared by
//   • the client read  (memoryStore.listMemoriesForTrip / …ForStop)
//   • the Surprises screen (views/SurprisesView.jsx)
//   • and — mirrored, in Slice 2's worker change — the server-side filter that
//     blinds Claude + the nightly weave.
//
// A "surprise" is NOT a separate entity. It's an ordinary memory carrying a
// masking layer, so that hiding "a photo from Rafa" actually makes that photo
// ABSENT from Rafa's screens and from Claude. The masking fields:
//
//   hideFrom : [travelerId, …]  OR  ['everyone']   — presence MARKS it a surprise
//   reveal   : { type:'manual'|'arrival'|'date', at }
//   conceal  : 'teaser' (default) | 'cover'
//   cover    : { icon, title, loc, time, weather, packing }   (iff conceal==='cover')
//   revealed : ISO timestamp once unlocked (falsy = still hidden)
//   surprise : { what, icon, title, detail, tint }   — the card's display identity
//
// THE MASKING CONTRACT (load-bearing). For a viewer a surprise is hidden from:
//   • teaser → the memory is DROPPED (absent — Claude never sees it).
//   • cover  → the memory is REPLACED by its `cover` stand-in (the only version
//              the recipient + Claude get; the real title/detail never appear).
// The author always sees their own in full; a revealed surprise is real for
// everyone. Non-surprise memories pass through untouched.

// ── Names ────────────────────────────────────────────────────────────────────
// Canonical relationship names (reconciled with views/PersonView.jsx REL — the
// app's established truth: Aurelia calls them Mom/Dad, Rafa calls them
// Mama/Papa/Sissy). Used for "hidden from …" labels + the reveal celebration.
const NAMES = { jonathan: 'Jonathan', helen: 'Helen', aurelia: 'Aurelia', rafa: 'Rafa' }
import { partsWithDays, hasExplicitParts } from './tripParts.js'

const REL = {
  rafa: { helen: 'Mama', jonathan: 'Papa', aurelia: 'Sissy' },
  aurelia: { helen: 'Mom', jonathan: 'Dad', rafa: 'Rafa' },
}

export function displayName(id, viewer) {
  if (id === 'everyone') return 'everyone'
  if (id === viewer) return 'you'
  return REL[viewer]?.[id] || NAMES[id] || id
}

// Format an ISO date (YYYY-MM-DD) as "June 15"; pass anything else through.
export function formatRevealDate(at) {
  if (typeof at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(at)) {
    const [y, m, d] = at.split('-').map(Number)
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    if (months[m - 1] && d) return `${months[m - 1]} ${d}`
  }
  return at || 'a date'
}

// Human label for a reveal trigger, phrased for the viewer. `asAuthor` is the
// secret-keeper's own view (the "You're keeping" list / the composer
// consequence); the default is the recipient/teaser view. For 'arrival',
// `reveal.label` holds the chosen place's name (any place — a museum, a hotel,
// a landmark — not just a driving waypoint); 'date' formats the ISO date.
// (Copy fix 2026-06-13: manual reveal read "when they choose to" — wrong for
// both viewers; it's the AUTHOR who reveals it manually.)
export function revealLabel(reveal, asAuthor = false) {
  const manual = asAuthor ? 'until you reveal it' : "when the moment's right"
  if (!reveal || typeof reveal !== 'object') return manual
  if (reveal.type === 'arrival') {
    const place = reveal.label || reveal.at || 'the place'
    return asAuthor ? `when they arrive at ${place}` : `when you arrive at ${place}`
  }
  if (reveal.type === 'date') return `on ${formatRevealDate(reveal.at)}`
  return manual
}

// ── Wrap pickers (composer rebuild) — map REAL trip data into the item shape
//    the "wrap something real" pickers render: { id, kind, icon, title, meta }.
//    A wrapped photo/memory's `id` IS the real memory id → wrapping attaches the
//    masking layer to that memory (so it actually disappears for the hidden-from
//    person). A stop's id is the itinerary stop id. ───────────────────────────
const STOP_GLYPH = {
  lodging: '🛏️', breakfast: '🍳', lunch: '🥪', dinner: '🍽️', snack: '🍪',
  museum: '🏛️', art: '🎨', history: '🏛️', show: '🎭', theater: '🎭',
  beach: '🏖️', walk: '🚶', tour: '🧭', sights: '📸', browse: '🛍️',
  drive: '🚗', travel: '✈️', arrival: '📍', lodging_default: '📍',
}
export function stopGlyph(kind) {
  return STOP_GLYPH[String(kind || '').toLowerCase()] || '📍'
}
export function memGlyph(kind) {
  return kind === 'photo' ? '🖼️' : kind === 'voice' ? '🎙️' : '✍️'
}

// "Sat · 9:34 AM"-style meta from a memory's capture/creation time + its place.
function wrapMeta(m, trip) {
  const iso = m.capturedAt || m.createdAt || null
  let when = ''
  if (typeof iso === 'string') {
    const d = new Date(iso)
    if (!Number.isNaN(d.getTime())) {
      const day = d.toLocaleDateString(undefined, { weekday: 'short' })
      const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      when = `${day} · ${time}`
    }
  }
  const place = stopName(trip, m.stopId)
  return [place, when].filter(Boolean).join(' · ')
}

function stopName(trip, stopId) {
  if (!trip || !stopId) return ''
  for (const d of trip.days || []) {
    for (const s of d.stops || []) {
      if (s?.id === stopId) return s.name || s.title || ''
    }
  }
  return ''
}

// Items for the "A photo" / "A memory" / "A stop" wrap pickers. Excludes
// memories that are ALREADY surprises (you don't wrap a surprise). Photo kind →
// photo memories; memory kind → note/voice memories; stop kind → located stops.
export function wrapItemsForKind(kind, { memories = [], trip = null } = {}) {
  if (kind === 'A stop') {
    // Any NAMED stop can be wrapped to hide it — lat/lng is not required (that
    // was the old arrival-target constraint, a separate concern). Exclude stops
    // that are ALREADY a surprise (you don't wrap a surprise). Each item carries
    // its dayIso so the create path can find the exact stop to mark.
    const out = []
    for (const d of trip?.days || []) {
      for (const s of d.stops || []) {
        if (s && s.id && (s.name || s.title) && !isStopSurprise(s) && !s.masked) {
          out.push({
            id: s.id, kind: 'stop', icon: stopGlyph(s.kind),
            title: s.name || s.title || 'A place',
            meta: [d.title || d.date || d.isoDate, s.time].filter(Boolean).join(' · '),
            loc: s.name || s.title || 'the stop', stopId: s.id, dayIso: d.isoDate || null,
          })
        }
      }
    }
    return out
  }
  const wantPhoto = kind === 'A photo'
  return (Array.isArray(memories) ? memories : [])
    .filter((m) => m && m.id && !isSurprise(m) && !m.masked)
    .filter((m) => (wantPhoto ? m.kind === 'photo' : m.kind === 'text' || m.kind === 'voice'))
    .map((m) => ({
      id: m.id,
      kind: wantPhoto ? 'photo' : 'memory',
      icon: memGlyph(m.kind),
      title: m.caption || m.text || (wantPhoto ? 'A photo' : 'A note'),
      meta: wrapMeta(m, trip),
      memory: m,
    }))
}

// Resolve a wrapped item back from its refId (for edit pre-fill).
export function findWrapItem(kind, refId, ctx) {
  if (!refId) return null
  return wrapItemsForKind(kind, ctx).find((i) => i.id === refId) || null
}

// ── Predicates ───────────────────────────────────────────────────────────────
// A memory is a surprise iff it carries a non-empty hideFrom list.
export function isSurprise(m) {
  return !!(m && Array.isArray(m.hideFrom) && m.hideFrom.length > 0)
}

function isRevealed(m) {
  return !!(m && m.revealed)
}

// Is this surprise currently hidden FROM `viewer`? The author and a revealed
// surprise are never hidden. 'everyone' hides from all non-authors.
export function isMaskedFrom(m, viewer) {
  if (!isSurprise(m)) return false
  if (m.authorTraveler === viewer) return false
  if (isRevealed(m)) return false
  return m.hideFrom.includes('everyone') || m.hideFrom.includes(viewer)
}

// ── The cover stand-in ───────────────────────────────────────────────────────
// What a masked-from viewer (and Claude, for them) sees INSTEAD of a cover-mode
// surprise: a believable ordinary record carrying ONLY the cover's fields. The
// real title/detail/photo never appear. Structural identity (id/tripId/stopId)
// is preserved so downstream React keys + stop grouping stay stable.
export function coverStandIn(m) {
  const cov = m.cover || {}
  return {
    id: m.id,
    tripId: m.tripId,
    stopId: m.stopId,
    authorTraveler: m.authorTraveler,
    visibility: m.visibility,
    kind: 'text',
    // The cover IS the only content the recipient / Claude may see.
    text: cov.title || 'A stop',
    caption: cov.title || undefined,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    capturedAt: m.capturedAt || null,
    reactions: [],
    // A flat, render-friendly cover payload — consumed by Claude's context and
    // (Slice 3) the itinerary substitution. Deliberately NO real title/detail.
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
  }
}

// ── The transform (THE security-relevant function) ───────────────────────────
// Drop teasers, substitute covers, keep everything else untouched. The worker
// mirrors this server-side in Slice 2 so masked content never reaches Claude.
export function maskForViewer(records, viewer) {
  if (!Array.isArray(records)) return []
  const out = []
  for (const m of records) {
    if (!isMaskedFrom(m, viewer)) {
      out.push(m)
      continue
    }
    if (m.conceal === 'cover') out.push(coverStandIn(m))
    // teaser → dropped (absent)
  }
  return out
}

// ── Classification reads (for the Surprises screen) ──────────────────────────
// These operate on a RAW (unmasked) record list and classify rather than hide —
// the Surprises screen is the one place that needs to know about masked records
// (to render the author's kept cards + the recipient's blurred teasers).

// Surprises THIS viewer authored — shown in full on "You're keeping".
export function authoredSurprises(records, viewer) {
  return (records || []).filter((m) => isSurprise(m) && m.authorTraveler === viewer)
}

// EVERYTHING hidden FROM this viewer (teasers + covers) — the set the data layer
// keeps out of normal reads + Claude.
export function surprisesMaskedFrom(records, viewer) {
  return (records || []).filter((m) => isMaskedFrom(m, viewer))
}

// Of those, only the TEASERS — what the "Something's coming" section surfaces as
// blurred gift cards. Covers are deliberately invisible (the viewer instead sees
// the cover stop on their itinerary, with no hint a surprise exists).
export function teasersMaskedFrom(records, viewer) {
  return surprisesMaskedFrom(records, viewer).filter((m) => m.conceal !== 'cover')
}

// ── Slice 2: auto-reveal + cue ───────────────────────────────────────────────

// Surprises authored by `viewer` that should auto-reveal ON ARRIVAL at a place
// and haven't yet — each carries the target place's lat/lng on its reveal. The
// author's device geofences these (it holds the full record and can reveal). Any
// place works (the author picked it); nothing here assumes a driving route.
export function pendingArrivalSurprises(records, viewer) {
  return (records || []).filter(
    (m) =>
      isSurprise(m) &&
      m.authorTraveler === viewer &&
      !m.revealed &&
      m.reveal?.type === 'arrival' &&
      Number.isFinite(m.reveal?.lat) &&
      Number.isFinite(m.reveal?.lng)
  )
}

// Surprises that have been REVEALED to `viewer` (they were hidden from them, now
// unwrapped) and which `viewer` hasn't seen the cue for yet — drives the in-app
// "✨ a surprise was revealed" cue. After reveal the viewer holds the full record
// (hideFrom + revealed both set), so this reads straight off the record.
export function unseenRevealsForViewer(records, viewer, seenIds = []) {
  const seen = new Set(seenIds)
  return revealedForViewer(records, viewer).filter((m) => !seen.has(m.id))
}

// All surprises that were hidden FROM `viewer` and have since been revealed —
// what the Surprises screen's "✨ Revealed for you" section shows (so the cue
// dot leads somewhere). After reveal the viewer holds the full record.
export function revealedForViewer(records, viewer) {
  return (records || []).filter(
    (m) =>
      isSurprise(m) &&
      m.revealed &&
      m.authorTraveler !== viewer &&
      (m.hideFrom.includes('everyone') || m.hideFrom.includes(viewer))
  )
}

// ── Slice 3a: cover stories render as a real stop on the recipient's plan ─────

// A cover stand-in memory → an ordinary itinerary-stop shape. Carries the cover's
// weather/packing as the stop note so the recipient sees what to bring. `_cover`
// marks it so a surface can style it if it wants (it renders fine as a plain stop
// otherwise). id is derived + stable so React keys + findStop resolve it.
export function coverToStop(m) {
  const cov = m.cover || {}
  const bring = [cov.weather, cov.packing].filter(Boolean).join(' · ')
  return {
    id: `cover_${m.id}`,
    name: cov.title || 'A stop',
    time: cov.time || '',
    kind: cov.loc || undefined,
    note: bring || undefined,
    _cover: true,
  }
}

// Minutes-into-the-day for a stop's free-text time ('7:00 PM', '14:00', 'evening',
// '1 PM', ''), used ONLY to ORDER a cover stop among a day's stops. Pure + local on
// purpose: the masking module stays dependency-free — importing photoBackfill's
// parseStopTime would drag the EXIF-reader chain into this eagerly-loaded module.
// Buckets mirror photoBackfill's TIME_BUCKETS; unlike it, this also accepts an
// hour with no minutes ('1 PM') so a cover authored that way still sorts right.
const DAY_BUCKETS = {
  morning: 540, am: 540, noon: 720, afternoon: 840,
  evening: 1140, pm: 1140, night: 1260, late: 1320, overnight: 1320,
}
function stopTimeMinutes(timeStr) {
  const t = (timeStr || '').trim()
  if (!t) return 720 // default: noon
  const ampm = t.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0
    const pm = ampm[3].toUpperCase() === 'PM'
    if (h === 12) h = pm ? 12 : 0
    else if (pm) h += 12
    return h * 60 + m
  }
  const h24 = t.match(/\b(\d{1,2}):(\d{2})\b/)
  if (h24) {
    const h = parseInt(h24[1], 10), m = parseInt(h24[2], 10)
    if (h >= 0 && h < 24 && m >= 0 && m < 60) return h * 60 + m
  }
  for (const key in DAY_BUCKETS) if (t.toLowerCase().includes(key)) return DAY_BUCKETS[key]
  return 720
}

// Insert cover stops into a day's real stops BY TIME, without ever reordering the
// real stops among themselves — their authored order is the source of truth (a real
// itinerary is built top-to-bottom; G5: don't disturb the working path). Each real
// stop gets a monotonically non-decreasing time key so reals always keep their
// sequence even if their times are out of order; each cover is placed before the
// first real stop that comes later in the day. Falls back to the old append-at-end
// behavior for a cover later than every real stop.
function insertCoversByTime(realStops, covers) {
  let prev = -Infinity
  const realKeys = realStops.map((s) => {
    const k = Math.max(stopTimeMinutes(s?.time), prev)
    prev = k
    return k
  })
  const sorted = covers
    .map((c) => ({ stop: c, key: stopTimeMinutes(c?.time) }))
    .sort((a, b) => a.key - b.key)
  const out = []
  let ci = 0
  for (let i = 0; i < realStops.length; i++) {
    while (ci < sorted.length && sorted[ci].key < realKeys[i]) out.push(sorted[ci++].stop)
    out.push(realStops[i])
  }
  while (ci < sorted.length) out.push(sorted[ci++].stop)
  return out
}

// Merge cover stand-ins into the trip the RECIPIENT sees: each cover whose
// `cover.dayIso` matches a day is woven into that day's stops BY TIME as an ordinary
// stop. Author/non-targeted viewers never have cover stand-ins in `memories`
// (their reads carry the real row), so this is a no-op for them. `memories` is
// the already-masked listMemoriesForTrip output. Returns the trip unchanged when
// nothing applies (referential stability for memo/render).
export function mergeCoverStops(trip, memories) {
  if (!trip || !Array.isArray(trip.days)) return trip
  const covers = (memories || []).filter((m) => m && m.isCover && m.cover?.dayIso)
  if (!covers.length) return trip
  const byDay = new Map()
  for (const m of covers) {
    const arr = byDay.get(m.cover.dayIso) || []
    arr.push(coverToStop(m))
    byDay.set(m.cover.dayIso, arr)
  }
  let changed = false
  const days = trip.days.map((d) => {
    const extra = d?.isoDate ? byDay.get(d.isoDate) : null
    if (!extra || !extra.length) return d
    changed = true
    return { ...d, stops: insertCoversByTime(d.stops || [], extra) }
  })
  return changed ? { ...trip, days } : trip
}

// ── Slice 3b: whole-trip masking (a "totally secret trip") ───────────────────
// A trip is a surprise when its `.surprise.hideFrom` is non-empty. Mirrors the
// memory contract, applied to the trip object — which rides inside the worker's
// trips.data_json, so NO schema change. The trip-surprise shape:
//   trip.surprise = { author, hideFrom, reveal, conceal, cover, revealed }
// Modes (same teaser/cover semantics as memories): teaser → the recipient sees a
// "🎁 A surprise trip" card (keeps the dates free, no destination); cover → a
// believable fake-trip card (fake title, real dates). Both SUBSTITUTE rather than
// drop — a trip occupies dates, so the recipient must still see *something* there
// or they'd double-book. Author + revealed always see the real trip.

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

// What a masked-from viewer gets INSTEAD of the real trip: a believable stand-in
// carrying ONLY non-secret framing (the real dates, so they keep the time free) —
// never the real title / destination / days / stops. `masked:true` so it can't be
// pushed back; the server mirrors this so the real trip never reaches them.
export function tripStandIn(trip) {
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
    days: [], // NO real itinerary
    masked: true,
    _maskedTrip: true,
    _coverTrip: isCover,
  }
}

// The per-viewer transform over ONE trip — a whole-trip stand-in if the whole
// trip is hidden (3b), else mask any hidden STOP within it (Slice 2), else keep it
// untouched (same ref). Mirrors the worker's maskTripForViewer. The client copy
// protects the in-app persona switcher (the local store holds real data synced
// under one token, then re-viewed as another person on the same device) — used by
// BOTH the index (maskTripsForViewer below) AND the open-trip view (App.jsx).
export function maskTripForViewer(trip, viewer) {
  if (isTripMaskedFrom(trip, viewer)) return tripStandIn(trip)
  // Per-stop masking first, then per-part (stubs hidden parts + strips their days).
  // This client transform is defense-in-depth; the worker mirror is the boundary.
  return maskTripParts(maskTripStops(trip, viewer), viewer)
}

// ── Per-PART masking ("surprises by sentence") — mirrors worker/src/surprises.js ─
// A composite trip's parts[] can carry the same masking layer as a stop. The part's
// day-by-day detail lives in the flat trip.days[], so a hidden part must strip BOTH
// the part AND its days. Day OWNERSHIP comes from partsWithDays — the SAME derivation
// the living heart's PartsOutline renders with — so the mask can never diverge from what's shown.
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

export function partCoverStandIn(part) {
  const cov = part.surprise?.cover || {}
  return {
    id: part.id, type: part.type || 'stay',
    title: cov.title || 'A part of the trip', place: cov.loc || null,
    dateStart: part.dateStart || null, dateEnd: part.dateEnd || null,
    masked: true, _cover: true,
  }
}

export function partTeaserStub(part) {
  const rv = part.surprise?.reveal || {}
  const reveal = rv.type === 'date' ? { type: 'date', at: rv.at } : rv.type === 'arrival' ? { type: 'arrival' } : { type: 'manual' }
  return {
    id: part.id, type: part.type || 'stay',
    title: "🎁 Something's coming", place: null,
    dateStart: part.dateStart || null, dateEnd: part.dateEnd || null,
    note: `reveals ${revealLabel(reveal)}`,
    masked: true, _teaser: true,
  }
}

export function maskPartForViewer(part, viewer) {
  if (!isPartMaskedFrom(part, viewer)) return part
  return part.surprise?.conceal === 'cover' ? partCoverStandIn(part) : partTeaserStub(part)
}

export function maskTripParts(trip, viewer) {
  if (!trip || !hasExplicitParts(trip)) return trip
  // Collect the real day-objects owned by a hidden part (partsWithDays returns each
  // part's days as the SAME refs the renderer uses; synthetic loose days aren't in
  // trip.days, so they're harmless to collect).
  const withDays = partsWithDays(trip)
  const hiddenDays = new Set()
  let changed = false
  withDays.forEach((p, i) => {
    if (isPartMaskedFrom(trip.parts[i], viewer)) {
      changed = true
      ;(p.days || []).forEach((d) => hiddenDays.add(d))
    }
  })
  if (!changed) return trip
  const parts = trip.parts.map((p) => maskPartForViewer(p, viewer))
  const days = Array.isArray(trip.days) ? trip.days.filter((d) => !hiddenDays.has(d)) : trip.days
  return { ...trip, parts, days }
}

// The per-viewer transform over the trip LIST (the index / switcher).
export function maskTripsForViewer(trips, viewer) {
  if (!Array.isArray(trips)) return []
  return trips.map((t) => maskTripForViewer(t, viewer))
}

// Whole-trip surprises THIS viewer authored — for the Surprises "You're keeping"
// list (shown in full, with a manual Reveal now).
export function tripSurprisesKeptBy(trips, viewer) {
  return (trips || []).filter((t) => isTripSurprise(t) && t.surprise?.author === viewer)
}

// ── Slice 2: per-stop masking (hide ONE place on a trip) ─────────────────────
// A single STOP inside trip.days[].stops[] can carry the same masking layer as a
// memory or a whole trip — it rides inside trips.data_json, so NO schema change:
//   stop.surprise = { author, hideFrom, reveal, conceal, cover, revealed }
// Modes:
//   teaser → the hidden-from viewer sees a "🎁 Something's coming" PLACEHOLDER at
//            that time slot — the day still reads in order, but the real
//            name/place/coords are stripped to a SANITIZED stub.
//   cover  → the hidden-from viewer sees a believable fake stop (the cover) there.
// Both SUBSTITUTE (never drop) so the day still renders in order and the worker
// can hand the device a safe row. Author + revealed always see the real stop. The
// worker mirrors this (worker/src/surprises.js) — that mirror is the boundary.

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

// The believable cover stand-in stop (cover mode): keeps ONLY the cover's fields
// + the structural id. Never the real name/kind/address/note/who/coords. Mirrors
// coverToStop's shape (kind carries the cover location label; weather+packing
// become the note so the recipient still knows what to bring).
export function stopCoverStandIn(stop) {
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

// The sanitized teaser placeholder stop (teaser mode): the time slot is kept so
// the day reads in order, but the ONLY content is "🎁 Something's coming" + a
// SANITIZED reveal hint. Critically, an arrival reveal's place name + coords are
// DROPPED here — naming "reveals when you arrive at <place>" could name the very
// secret. The author's device does the geofencing, so the recipient never needs
// the coords. Date is safe to show ("reveals June 15").
export function stopTeaserStub(stop) {
  const rv = stop.surprise?.reveal || {}
  const reveal =
    rv.type === 'date' ? { type: 'date', at: rv.at }
      : rv.type === 'arrival' ? { type: 'arrival' }
        : { type: 'manual' }
  return {
    id: stop.id,
    name: "🎁 Something's coming",
    time: stop.time || '',
    note: `reveals ${revealLabel(reveal)}`,
    masked: true,
    _teaser: true,
  }
}

// Mask one stop for a viewer: cover → stand-in, teaser → stub, else untouched.
export function maskStopForViewer(stop, viewer) {
  if (!isStopMaskedFrom(stop, viewer)) return stop
  return stop.surprise.conceal === 'cover' ? stopCoverStandIn(stop) : stopTeaserStub(stop)
}

// Apply per-stop masking across a trip's days for a viewer. Returns the trip
// unchanged (referential stability for memo/render) when nothing applies — so the
// common no-surprise path costs nothing and never re-renders.
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

// Stop surprises THIS viewer authored — for the Surprises "You're keeping" list.
// Returns [{ stop, tripId, dayIso }] so the screen can normalize + reveal/edit.
export function stopSurprisesKeptBy(trips, viewer) {
  const out = []
  for (const t of trips || []) {
    for (const d of t.days || []) {
      for (const s of d.stops || []) {
        if (isStopSurprise(s) && s.surprise?.author === viewer) {
          out.push({ stop: s, tripId: t.id, dayIso: d.isoDate || null })
        }
      }
    }
  }
  return out
}

// Stop surprises authored by `viewer` with an ARRIVAL reveal still pending — the
// per-stop analogue of pendingArrivalSurprises. The author's device geofences
// these (it holds the full trip + can reveal). Each carries the target's
// lat/lng on its reveal. Returns [{ stop, tripId }].
export function pendingArrivalStopSurprises(trips, viewer) {
  const out = []
  for (const t of trips || []) {
    for (const d of t.days || []) {
      for (const s of d.stops || []) {
        const r = s.surprise?.reveal
        if (
          isStopSurprise(s) &&
          s.surprise.author === viewer &&
          !s.surprise.revealed &&
          r?.type === 'arrival' &&
          Number.isFinite(r.lat) &&
          Number.isFinite(r.lng)
        ) {
          out.push({ stop: s, tripId: t.id })
        }
      }
    }
  }
  return out
}
