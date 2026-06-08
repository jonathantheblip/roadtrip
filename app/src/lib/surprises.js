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
