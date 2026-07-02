// tripParts.js — the "a trip is a sequence of parts" foundation (new-trip redesign, Phase 1).
//
// ADDITIVE and non-breaking. A trip created by the redesigned concierge carries an explicit
// `parts: Part[]`; every EXISTING (legacy) trip has none, so `getParts` derives ONE synthetic
// part that wraps the whole trip. That lets new parts-aware surfaces treat every trip uniformly
// while the existing day/stop rendering keeps reading `trip.days` directly — untouched (G5).
//
// No D1 migration: `parts` rides inside the trip's existing `data_json` blob (the worker stores
// trips as JSON and never inspects this field). The worker's draft read-filter and masking
// boundary are unaffected.
//
//   Part / "leg" = {
//     id, type,                 // type ∈ PART_TYPES
//     title?, place?,           // place: a STRING city name (NewTripComposite + the worker
//                               //   create_trip prompt both emit one) OR an OBJECT
//                               //   { name, address, lat, lng } (a single-part NewTrip stay).
//                               //   Read it ONLY through partPlaceLabel / partCoords below —
//                               //   NEVER `${part.place}` (an object renders "[object Object]").
//     coords?,                  // { lat, lng } — the leg's canonical coord slot, so a
//                               //   string-place leg can carry coordinates without reshaping
//                               //   `place` (the leg model's forward slot for tz/We-could anchoring)
//     tz?,                      // IANA zone, e.g. 'Europe/Rome' — per-leg "now"/countdowns
//     currency?, locale?,       // ISO 4217 + BCP-47 — per-leg context card + nearby search
//     members?,                 // [travelerId] — who is on THIS leg (presence scoping)
//     dateStart?, dateEnd?,     // both OPTIONAL — a loose "weekend at Grandma's" needs neither
//     days?,                    // the day/stop detail for this part (legacy days live in the one wrapper)
//     visibility?,              // surprise scoping (set by the intake; enforced by worker/src/surprises.js)
//   }
import { inferTripShape, stayPlace, stayLabel, stayPlaceCoords } from './tripShape.js'
import { localDateIso } from './localDate.js'

// The kinds of part a trip can hold. Stay/city/drive/flight are the core four; event + the
// transport trio are the "flexible, not complex" long tail (Jonathan's pick).
export const PART_TYPES = ['stay', 'city', 'drive', 'flight', 'event', 'train', 'ferry', 'cruise']

// True when the trip explicitly carries its own parts (a redesign-created composite trip).
export function hasExplicitParts(trip) {
  return Array.isArray(trip?.parts) && trip.parts.length > 0
}

// The parts of a trip. An explicit `parts[]` wins; otherwise derive ONE part that wraps the
// whole legacy trip, typed by its derived shape, so a one-part trip renders exactly as today.
// The derived wrapper is marked `derived:true` and is NEVER persisted — it's a read-time view.
export function getParts(trip) {
  if (!trip) return []
  if (hasExplicitParts(trip)) return trip.parts
  const shape = inferTripShape(trip) // 'stay' | 'route'
  const isStay = shape !== 'route'
  return [
    {
      id: `${trip.id || 'trip'}__whole`,
      type: isStay ? 'stay' : 'drive',
      derived: true,
      title: (isStay ? stayLabel(trip) : '') || trip.title || '',
      place: isStay ? stayPlace(trip) || null : null,
      dateStart: trip.dateRangeStart || null,
      dateEnd: trip.dateRangeEnd || null,
      days: trip.days || [],
    },
  ]
}

// ── Object-safe place accessors (the ONE home for reading a leg's place) ─────
// `place` is inconsistent across producers: a STRING city name (NewTripComposite
// + the worker create_trip prompt) vs an OBJECT { name, address, lat, lng } (a
// single-part NewTrip stay). Today's composite trips carry string places, so the
// display reads work — but the moment a composite leg gains coords (which per-leg
// hero / conditions / We-could / Map anchoring REQUIRES), a bare `${part.place}`
// would render "[object Object]". So every place read — label and coords — goes
// through these. Mirrors (and now replaces) MapView's local partPlaceLabel.

// The human label for a part's place: the string itself, or an object place's
// name (then address). '' when absent — the caller falls back to title/trip title.
export function partPlaceLabel(part) {
  const p = part?.place
  if (typeof p === 'string') return p.trim()
  if (p && typeof p === 'object') return String(p.name || p.address || '').trim()
  return ''
}

// The coordinates for a part, or null. Prefers the leg's explicit `coords` slot
// (canonical — lets a string-place leg carry coordinates), then an object place's
// own lat/lng. Never throws; a string place with no `coords` returns null.
export function partCoords(part) {
  const c = part?.coords
  if (c && typeof c === 'object' && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
    return { lat: c.lat, lng: c.lng }
  }
  const p = part?.place
  if (p && typeof p === 'object' && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
    return { lat: p.lat, lng: p.lng }
  }
  return null
}

// The overall shape of a trip, generalized for parts. An explicit `trip.shape` always wins (as
// inferTripShape honors). A legacy trip (no parts) falls back to inferTripShape ('stay'|'route'),
// so isStayTrip and the existing surfaces are unaffected. A composite (2+ explicit parts) is
// 'bigger'; a single explicit part takes that part's type. This is NEW — only parts-aware code
// calls it; nothing legacy changes.
export function deriveTripShape(trip) {
  if (!trip) return 'route'
  if (trip.shape) return trip.shape
  if (!hasExplicitParts(trip)) return inferTripShape(trip)
  if (trip.parts.length >= 2) return 'bigger'
  return trip.parts[0]?.type || 'stay'
}

// How many REAL (persisted, non-derived) parts a trip has: 0 for a legacy trip, N for a composite.
export function partCount(trip) {
  return hasExplicitParts(trip) ? trip.parts.length : 0
}

// Should this trip render the COMPOSITE home ("In [city]" + the journey rail + "The
// plan"), vs the simple stay home ("At [place]")? Design decision 4c (hangout-first
// handoff): the SHAPE OF THE CONTENT decides, NOT a lone internal part. Every
// manually-created trip carries ONE synthetic part, which used to make even a plain
// stay render complex — the bug this kills. A trip is composite when it has ≥2 REAL
// legs. (Design also names "or a timed multi-event day"; that refinement is deferred
// to the scaling track — triggering the full composite frame on a one-leg busy day
// risks wrongly framing a lake-house day as "In [place]", which Design's own examples
// call "At". Revisit with the journey-rail work.)
export function isCompositeTrip(trip) {
  return partCount(trip) >= 2
}

// ── Real timed days, derived ───────────────────────────────────────────────
// A composite trip stores ONE flat `trip.days[]` (the full day-by-day detail,
// each stamped with `isoDate`) plus `parts[]` (the high-level legs, each a date
// window with no days of its own — see the worker create_trip prompt). To show a
// city/stay part day-by-day we DERIVE its days at read time: assign each saved day
// to its part by date, then enumerate the part's window into one row per day —
// real days fill in, the rest stay loose ("open space"). No storage, no migration.

// ISO 'YYYY-MM-DD' date math in UTC (no Date.now / no local-TZ drift).
function isoAddDays(iso, delta) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return null
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]) + delta * 86400000
  return new Date(t).toISOString().slice(0, 10)
}
// Inclusive list of ISO dates from start..end (≤ a guard cap so bad data can't loop forever).
function isoRange(start, end) {
  if (!start || !end || end < start) return []
  const out = []
  let cur = start.slice(0, 10)
  for (let i = 0; i < 800 && cur && cur <= end; i++) {
    out.push(cur)
    cur = isoAddDays(cur, 1)
  }
  return out
}

// The whole stay as one honest day grid — for the home's "The whole stay"
// unfold (SEE-the-plan, 2026-07-02). Enumerates the trip's REAL date window
// (dateRangeStart..End) and lays the saved days onto it by isoDate, so a
// sparse trip (a Claude-created stay that only saved the days it had plans
// for) still shows every date, with open days honestly present rather than
// silently missing. Dateless trips (or days without isoDate) fall back to
// the saved days[] in order — the original SEE wound stays fixed for them
// too. Pure; no storage.
export function stayDayGrid(trip) {
  const saved = Array.isArray(trip?.days) ? trip.days : []
  const window_ = isoRange(trip?.dateRangeStart, trip?.dateRangeEnd)
  if (!window_.length) return saved
  const byIso = new Map()
  for (const d of saved) {
    if (d?.isoDate && !byIso.has(d.isoDate)) byIso.set(d.isoDate, d)
  }
  const grid = window_.map(
    (iso) => byIso.get(iso) || { isoDate: iso, stops: [], open: true }
  )
  // Saved days OUTSIDE the window, without an isoDate, or with a duplicate
  // isoDate still belong to the trip — append them so no planned day is
  // ever silently dropped (grid holds placed days by reference).
  for (const d of saved) {
    if (!grid.includes(d)) grid.push(d)
  }
  return grid
}

// The parts of a trip, each augmented with a derived `days[]` and a per-part
// `dayCount`. A LEGACY trip returns its single derived wrapper untouched (days =
// trip.days) so nothing about its rendering changes (G5). A composite partitions
// trip.days[] into non-overlapping, date-clamped windows so a shared travel day
// (Rome's checkout = Tuscany's arrival) lands in exactly one part — never doubled,
// never dropped. A dated part's window is enumerated so empty days show as loose.
export function partsWithDays(trip) {
  const parts = getParts(trip)
  // Legacy / single derived wrapper already carries days = trip.days — leave as-is.
  if (!hasExplicitParts(trip)) {
    return parts.map((p) => ({ ...p, dayCount: (p.days || []).length }))
  }

  // Stable chronological order by dateStart (undated parts keep their position).
  const order = parts
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ka = a.p.dateStart || '9999-99-99'
      const kb = b.p.dateStart || '9999-99-99'
      return ka === kb ? a.i - b.i : ka < kb ? -1 : 1
    })

  // Non-overlapping [winStart, winEnd] per dated part: end at the part's own
  // dateEnd, but clamp to the day BEFORE the next dated part begins so a boundary
  // day belongs to the arriving part only. A part whose window collapses (a flight
  // sharing a city's start date) simply claims no days — it's a transit marker.
  const dated = order.filter((o) => o.p.dateStart)
  const win = new Map() // original index -> { start, end } | null
  dated.forEach((o, k) => {
    const start = o.p.dateStart.slice(0, 10)
    let end = (o.p.dateEnd && o.p.dateEnd.slice(0, 10)) || start
    const next = dated[k + 1]
    if (next) {
      const cap = isoAddDays(next.p.dateStart.slice(0, 10), -1)
      if (cap && cap < end) end = cap
    }
    win.set(o.i, end >= start ? { start, end } : null)
  })

  // Claim each saved day to the part whose window contains its date. A dateless
  // day, or one outside every window, falls to the first dated part (never lost).
  const allDays = Array.isArray(trip.days) ? trip.days : []
  const firstDatedIdx = dated.length ? dated[0].i : (parts.length ? 0 : -1)
  const claimed = new Map() // index -> day[]
  for (const day of allDays) {
    const d = typeof day?.isoDate === 'string' ? day.isoDate.slice(0, 10) : null
    let owner = -1
    if (d) {
      for (const o of dated) {
        const w = win.get(o.i)
        if (w && d >= w.start && d <= w.end) { owner = o.i; break }
      }
    }
    if (owner < 0) owner = firstDatedIdx
    if (owner < 0) continue
    if (!claimed.has(owner)) claimed.set(owner, [])
    claimed.get(owner).push(day)
  }

  // Build each part's day grid: enumerate the window, fill from claimed days by
  // date, leave the rest loose; then append any claimed day not placed by date
  // (dateless / defensive) so nothing is ever dropped.
  return parts.map((p, i) => {
    const mine = claimed.get(i) || []
    const byDate = new Map()
    for (const day of mine) {
      const d = typeof day?.isoDate === 'string' ? day.isoDate.slice(0, 10) : null
      if (d && !byDate.has(d)) byDate.set(d, day)
    }
    const w = win.get(i)
    const dates = w ? isoRange(w.start, w.end) : []
    const placed = new Set() // day OBJECTS already positioned by date
    const grid = dates.map((d) => {
      const real = byDate.get(d)
      if (real) { placed.add(real); return real }
      return { isoDate: d, stops: [], loose: true }
    })
    // Append any claimed day not placed by date (dateless / out-of-window / a
    // second day sharing a date) so a real day is NEVER dropped.
    for (const day of mine) if (!placed.has(day)) grid.push(day)
    return { ...p, days: grid, dayCount: grid.length }
  })
}

// ── Shape-aware "right now" helpers (for the living-heart home) ──────────────
// A complex/composite trip leads with WHERE IT IS NOW + WHAT'S NEXT (tickets,
// times) — never road-trip logic. These pure helpers feed that: the part the trip
// is in today, and the soonest timed thing to surface its ticket just-in-time.

// The part a composite trip is "in" right now: the part whose date window contains
// today; else the soonest upcoming part; else the last dated part; else the first.
// Pure — for the shape-aware hero. Returns a part (from getParts) or null.
export function currentPart(trip, todayIso) {
  const parts = getParts(trip)
  if (!parts.length) return null
  const today = String(todayIso || '').slice(0, 10)
  if (today) {
    const within = parts.find((p) => {
      const s = String(p.dateStart || '').slice(0, 10)
      const e = String(p.dateEnd || p.dateStart || '').slice(0, 10)
      return s && today >= s && today <= e
    })
    if (within) return within
    const upcoming = parts.find((p) => String(p.dateStart || '').slice(0, 10) > today && p.dateStart)
    if (upcoming) return upcoming
    const dated = parts.filter((p) => p.dateStart)
    if (dated.length) return dated[dated.length - 1]
  }
  return parts[0]
}

// Coords for "where the trip is RIGHT NOW" — the active PART's own place for a
// composite trip, falling back to the trip-level stay anchor. Fixes the multi-city
// gap where the hero / sun-times / "We could…" tray all anchored to ONE city for
// the WHOLE trip (Rome's restaurants shown while the family is in Florence). The
// Part shape already carries `place` ({ name, address, lat, lng }); this is the
// resolver that finally reads it. Returns { lat, lng, label } or null. Pure.
//
// ADDITIVE + non-breaking: a trip with no explicit parts (the common stay) returns
// exactly stayPlaceCoords(trip) — byte-identical to before. A composite whose
// active part has no coords also falls back to the trip-level anchor, so it never
// regresses below today's single-anchor behavior. Coords + label come from the
// object-safe partCoords / partPlaceLabel, so an explicit-`coords` string-place
// leg anchors too (not only an object place).
export function currentPartCoords(trip, todayIso) {
  if (hasExplicitParts(trip)) {
    const part = currentPart(trip, todayIso)
    const c = partCoords(part)
    if (c) return { lat: c.lat, lng: c.lng, label: partPlaceLabel(part) || part?.title || '' }
  }
  return stayPlaceCoords(trip)
}

// A geocodable query string for a leg's place, or null for a place-less
// (transit) leg — the per-leg mirror of stayGeocodeQuery (tripShape.js). The
// place name alone usually resolves a major city fine; when the leg carries a
// `locale` (stamped only for a leg crossing a language boundary — the B4
// populator) its region subtag names the country, appended for disambiguation
// ("Florence, Italy" beats a bare "Florence" against every namesake on
// earth). No leg carries lat/lng from any current producer (neither the AI
// concierge nor the manual composite builder) — this is the query that fills
// that gap via a keyless geocode (Nominatim), same as a stay's lodging.
export function legGeocodeQuery(part) {
  const place = partPlaceLabel(part)
  if (!place) return null
  const locale = typeof part?.locale === 'string' ? part.locale.trim() : ''
  const region = locale.split('-')[1]
  if (region) {
    try {
      const country = new Intl.DisplayNames(['en'], { type: 'region' }).of(region.toUpperCase())
      if (country && !place.toLowerCase().includes(country.toLowerCase())) return `${place}, ${country}`
    } catch {
      // An unsupported region code falls through to the bare place name.
    }
  }
  return place
}

// The CURRENT leg's own stops (day + stop merged, the same shape
// data/trips.js's allStops returns) — for scoping the live map's pins to
// WHERE THE TRIP IS NOW on a composite trip, instead of every city at once.
// A legacy/stay trip has no parts to scope by; callers keep using allStops for
// those (byte-identical, G5) and reach for this only when isCompositeTrip.
export function currentLegStops(trip, todayIso) {
  // A legacy/stay trip has no REAL leg to scope by (its one derived wrapper
  // spans the whole trip) — an explicit [] keeps this self-consistent with its
  // own name rather than silently returning "every stop" to a future caller
  // that forgets the isCompositeTrip guard.
  if (!hasExplicitParts(trip)) return []
  const today = String(todayIso || '').slice(0, 10)
  const parts = partsWithDays(trip)
  // A shared checkout/arrival day (Rome's last day = Florence's first) is a
  // real disagreement between two resolvers: currentPart's own inclusive date
  // check names the DEPARTING leg (Rome), but partsWithDays already clamped
  // that leg's window to end the day before, assigning the shared day to the
  // ARRIVING leg instead (partsWithDays' own doc comment: "a boundary day
  // belongs to the arriving part only"). Prefer whichever leg's OWN derived
  // days[] actually contains today — that's the leg whose agenda you'd
  // actually be reading on that day — and only fall back to currentPart's
  // leg (a dateless/before/after edge with no day claiming today at all).
  const owner =
    parts.find((p) => (p.days || []).some((d) => d.isoDate === today)) ||
    parts.find((p) => p.id === currentPart(trip, todayIso)?.id)
  const days = owner?.days || []
  return days.flatMap((d) => (d.stops || []).map((s) => ({ ...s, day: d.n, dayDate: d.date, dayTitle: d.title })))
}

// A leg's field, resolved: leg's own value → trip-level default → null.
function legField(part, trip, k) {
  if (part && part[k] != null) return part[k]
  if (trip && trip[k] != null) return trip[k]
  return null
}

// deriveCurrentLeg — the current leg PLUS its resolved orientation context AND
// the trip's "today" in that leg's zone. TIMEZONE-AWARE and SELF-CONSISTENT: ONE
// leg drives everything (zone + hero + agenda), so the hero city and the clock's
// zone can never disagree at a cross-tz boundary (the split-brain a two-variable
// version had). Resolution:
//   1. bootstrap a provisional zone from the device-local date,
//   2. take "today" in that zone and select the leg containing it,
//   3. read THAT SAME leg's own zone/fields back + its own `todayIso`.
// `now` is the instant (a Date; default new Date() for the live home — the e2e
// clock stub freezes it; unit tests pass a fixed instant for determinism).
// tz/currency/locale resolve leg-field → trip default → null; members is the
// leg's own roster (or null = everyone). GREENFIELD today (no producer writes
// these), so legTz is null → todayIso === device today and the home stays
// byte-identical ("no delta → no module", Design 05). Pure; never throws.
export function deriveCurrentLeg(trip, now = new Date()) {
  const provisional = currentPart(trip, localDateIso(now))
  const provTz = legField(provisional, trip, 'tz')
  const todayIso = localDateIso(now, provTz)
  const part = currentPart(trip, todayIso)
  return {
    part,
    todayIso,
    tz: legField(part, trip, 'tz'),
    currency: legField(part, trip, 'currency'),
    locale: legField(part, trip, 'locale'),
    members: part && Array.isArray(part.members) ? part.members : null,
  }
}

// A leg's progress relative to "today" — done / now / upcoming — for the
// composite trip's journey rail (hangout-first 03: "Rome ✓ · Florence ● ·
// Venice"). `curPart` is whatever deriveCurrentLeg/currentPart already
// resolved, so "now" always agrees with the hero/clock (never a second
// opinion on which leg is active). Other legs are dated by their own window
// vs todayIso; a dateless leg (no end date) is never mistaken for done.
export function legStatus(part, curPart, todayIso) {
  if (!part) return 'upcoming'
  if (curPart && part.id === curPart.id) return 'now'
  const end = String(part.dateEnd || part.dateStart || '').slice(0, 10)
  const today = String(todayIso || '').slice(0, 10)
  if (end && today && end < today) return 'done'
  return 'upcoming'
}

// "3:00 PM" / "9:00 AM" / "17:00" → minutes since midnight, or null when
// unparseable (an untimed stop sorts to the front of its day).
export function clockMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})\s*([ap]m)?/i.exec(String(t || '').trim())
  if (!m) return null
  let h = +m[1]
  const ap = (m[3] || '').toLowerCase()
  if (ap === 'pm' && h !== 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  return h * 60 + (+m[2])
}

// The next timed thing on a trip — the soonest non-lodging, non-skipped stop at or
// after `now` (across all dated days) — so the home can surface its time, name, and
// ticket image just-in-time. Returns { day, stop, iso, minutes } or null. Pure;
// `now` = { todayIso, nowMinutes }. With no todayIso it returns the trip's very
// first timed stop (an upcoming trip's opener).
export function nextTimedStop(trip, now = {}) {
  const today = String(now.todayIso || '').slice(0, 10)
  const nowMin = Number.isFinite(now.nowMinutes) ? now.nowMinutes : 0
  const cands = []
  for (const day of trip?.days || []) {
    const iso = typeof day?.isoDate === 'string' ? day.isoDate.slice(0, 10) : null
    if (!iso) continue
    for (const s of day.stops || []) {
      if (!s || s.skipped || s.kind === 'lodging') continue
      const mins = clockMinutes(s.time)
      cands.push({ day, stop: s, iso, minutes: mins == null ? 0 : mins })
    }
  }
  cands.sort((a, b) => (a.iso === b.iso ? a.minutes - b.minutes : a.iso < b.iso ? -1 : 1))
  for (const c of cands) {
    if (!today || c.iso > today || (c.iso === today && c.minutes >= nowMin)) return c
  }
  return null
}
