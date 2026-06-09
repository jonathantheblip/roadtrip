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

// Human label for a reveal trigger. For 'arrival', `reveal.label` holds the
// chosen place's name (any place — a museum, a hotel, a landmark — not just a
// driving waypoint); 'date' formats the ISO date. Phrasing follows the design.
export function revealLabel(reveal) {
  if (!reveal || typeof reveal !== 'object') return 'when they choose to'
  if (reveal.type === 'arrival') return `when you arrive at ${reveal.label || reveal.at || 'the place'}`
  if (reveal.type === 'date') return `on ${formatRevealDate(reveal.at)}`
  return 'when they choose to'
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

// The per-viewer transform over the trip LIST — substitute stand-ins, keep the
// rest. The worker mirrors this server-side (the security boundary).
export function maskTripsForViewer(trips, viewer) {
  if (!Array.isArray(trips)) return []
  return trips.map((t) => (isTripMaskedFrom(t, viewer) ? tripStandIn(t) : t))
}

// Whole-trip surprises THIS viewer authored — for the Surprises "You're keeping"
// list (shown in full, with a manual Reveal now).
export function tripSurprisesKeptBy(trips, viewer) {
  return (trips || []).filter((t) => isTripSurprise(t) && t.surprise?.author === viewer)
}
