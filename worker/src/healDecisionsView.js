// healDecisionsView.js — the MASK-GATE RESTORE (the confirm surface's hard
// precondition, CARRYOVER_DOCUMENT_THE_TRIP "NAMED, NOT FIXED"): a per-viewer
// projection over the v2 shadow ledger (memory_heal_decisions, migration 019),
// which is written UNMASKED — recordHealDecisions feeds buildTripDecisions the
// RAW memory rows and the RAW trip, so ledger rows can reference unrevealed
// surprises, private memories, hidden stops, and (via Build 4b's naming, which
// collects trip places off the raw trip) can even carry a surprise stop's NAME
// as a discovered place_name. NOTHING may read this ledger for a viewer except
// through this projection.
//
// Mirrors photoSuggest.js's per-viewer invariants (the proven precedent):
//   • a whole trip masked from the viewer surfaces NOTHING;
//   • a row referencing ANY memory the viewer can't see (private-not-own, or an
//     unrevealed surprise hidden from them — photoSuggest.viewerCanSee, the
//     same predicate, imported not copied) is DROPPED WHOLE — never partially
//     projected, so photo_count arithmetic can't leak a hidden photo's shape;
//   • a row whose place is hidden from the viewer is dropped: a masked stop id,
//     a record-moment/implicit-base id on a day owned by a masked part, or —
//     the Build 4b twist — ANY row whose place_name string-matches a stop name
//     that is masked from this viewer (a discovered cluster near a surprise
//     stop gets NAMED after it by the namer, under a __discovered__ id the
//     stop-id check can't catch);
//   • a row whose iso_date falls on a day owned by a masked part is dropped
//     (the DAY itself is the secret there — the trip mask strips those days
//     wholesale, so their existence in a ledger read would leak).
//
// ADULTS ONLY is enforced at the ROUTE (index.js), same as suggestions — a kid
// lens never calls this; Rafa never meets tools/moves/chips.
//
// MODE: 'off' → [] (the knob-off state surfaces nothing anywhere). 'shadow' and
// 'on' both serve — UNLIKE v1 suggestions ("dark until on"), because this
// ledger IS the shadow-review learning tool: the whole point of reading it
// pre-promotion is that an adult can watch the engine decide before anything
// is allowed to move (decision #1 of the v2 arc).

import { photoHealMode } from './photoHealRunner.js'
import { viewerCanSee } from './photoSuggest.js'
import {
  isTripMaskedFrom,
  isStopMaskedFrom,
  isPartMaskedFrom,
  partDayOwner,
} from './surprises.js'
import { isRecordTargetId, parseRecordTargetId, isImplicitBaseId, IMPLICIT_BASE_PREFIX } from './dayStopIds.js'
import { listHealFeedbackForTrip } from './confirmFeedback.js'

// Per-viewer hidden-place index over one raw trip. Same three id-spaces
// photoSuggest.buildStopHiddenFromViewer covers (planned stop / record moment
// on a hidden day / implicit base on a hidden day), PLUS the extra
// projections this ledger needs that suggestions don't: the set of HIDDEN
// STOP NAMES (Build 4b's discovered-name echo — see header; lowercased, the
// review's case-variant point), the hidden stops' COORDS (4a geocodes hidden
// stops too — a landmark pin landing within the hidden radius names the
// secret by location even when every name check passes), and the bare
// day-hidden predicate (ledger rows carry iso_date directly).
const HIDDEN_NEARBY_METERS = 150 // the 4b own-places radius — same scale of "at that place"
const NAME_MATCH_MIN_LEN = 4 // CONTAINMENT checks never fire below this (trivia like "the");
// shorter hidden names (a "Zoo" surprise) still match by whole-token equality below.

// Orthographic normalization for name matching (re-verification, 2026-07-12:
// the sources this gate defends against — vision captions, signage OCR, Places
// results — re-spell human-typed stop names: curly vs straight apostrophes,
// Café vs Cafe, A-House vs A House). NFKD + strip combining marks, then every
// non-alphanumeric run becomes one space, so both sides land on the same
// canonical form before any comparison.
const normName = (s) =>
  typeof s === 'string'
    ? s
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    : ''

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function buildHiddenIndex(trip, viewer) {
  const parts = Array.isArray(trip?.parts) ? trip.parts : []
  const owner = parts.length ? partDayOwner(parts) : null
  const dayHidden = (iso) => {
    if (!owner || !iso) return false
    const i = owner(iso)
    return i >= 0 && isPartMaskedFrom(parts[i], viewer)
  }
  const hiddenStopIds = new Set()
  const hiddenNames = new Set() // NORMALIZED (normName) — canonical spelling
  const hiddenCoords = []
  for (const day of trip?.days || []) {
    const hd = dayHidden(day?.isoDate)
    for (const s of day?.stops || []) {
      if (!s?.id) continue
      if (hd || isStopMaskedFrom(s, viewer)) {
        hiddenStopIds.add(s.id)
        const name = normName(s.name || s.title || '')
        if (name.length >= 2) hiddenNames.add(name) // 1-char names are degenerate noise
        if (Number.isFinite(s.lat) && Number.isFinite(s.lng)) hiddenCoords.push({ lat: s.lat, lng: s.lng })
      }
    }
  }
  const stopHidden = (stopId) => {
    if (!stopId) return false
    if (isRecordTargetId(stopId)) return dayHidden(parseRecordTargetId(stopId)?.isoDate)
    if (isImplicitBaseId(stopId)) return dayHidden(stopId.slice(IMPLICIT_BASE_PREFIX.length + 1))
    return hiddenStopIds.has(stopId)
  }
  // A name-bearing string "touches" a hidden place when — after normalization —
  // either contains the other (hidden names ≥4 chars: "a house" matches
  // "dinner at the a house"), or, for SHORT hidden names (a "Zoo" surprise —
  // the re-verification's reproduced bypass), the hidden name appears as a
  // whole PHRASE on word boundaries: ` at the zoo ` contains ` zoo `, and a
  // multi-token short name like "H&M" (→ "h m") matches ` h m ` too — bare
  // substring containment there would false-fire constantly ("zoomobile"),
  // equality alone would miss the caption. Broad on purpose: a false-positive
  // drop hides one field from one adult for one sweep; a false negative names
  // their surprise.
  const nameHidden = (raw) => {
    const v = normName(raw)
    if (!v) return false
    const padded = ` ${v} `
    for (const h of hiddenNames) {
      if (v === h) return true
      if (h.length >= NAME_MATCH_MIN_LEN) {
        if (v.includes(h) || h.includes(v)) return true
      } else if (padded.includes(` ${h} `)) {
        return true
      }
    }
    return false
  }
  const coordsHidden = (lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
    return hiddenCoords.some((c) => haversineMeters(lat, lng, c.lat, c.lng) <= HIDDEN_NEARBY_METERS)
  }
  return { dayHidden, stopHidden, hiddenNames, nameHidden, coordsHidden }
}

// Per-viewer SIGNALS projection (adversarial review 2026-07-12, CONFIRMED
// blocker): signals_json carries name-bearing content the row-level gates
// never see — Build 4c's `pin` ({lat,lng,name,query}: the Places venue name,
// the raw signage text, exact coordinates) and sessionHeal's `visionName` —
// so a row whose place_id/place_name pass every check can still name a hidden
// venue through its signals. WHITELIST posture (the house rule): only known-
// safe scalar keys pass; the name-bearing fields pass only after the hidden-
// name/coords checks; any UNKNOWN future signal key is DROPPED (fail closed —
// a new writer must consciously add its field here with its own leak review).
//
// S1 LEAK REVIEW (2026-07-13) — the six provenance keys sessionHeal folds in
// (W8/W9) were reviewed for THIS surface and CONSCIOUSLY EXCLUDED. Each is
// engine-internal with no §3-phrasebook translation (the confirm card's
// evidence line reads only evidence/inheritedGps/pin/visionName/cohesion/dims),
// and the W7 evidence audit reads them from RAW signals_json (admin-gated), so
// the per-viewer projection loses nothing by dropping them:
//   • referenceLocatedCount (int)   — GPS-anchor count; card knows GPS via `evidence`
//   • timeAnchorSuspect     (bool)  — clock-doubt flag; variant-C copy is already humble
//   • gpsProv               (str[]) — GPS provenance-source labels
//   • dismissedBefore       (bool)  — prior-dismissal echo (a negative label)
//   • handFiledStop         (str)   — ⚠ a STOP ID: could be a surprise stop → NEVER project
//   • handFiledBy           (str)   — ⚠ a TRAVELER: names who was where → NEVER project
// The last two are outright leak vectors — do NOT whitelist them. All six drop
// for EVERY viewer incl. the author (heal-decisions-view.test.js locks this:
// whitelisting any of the six turns a test red).
const SAFE_SIGNAL_KEYS = [
  'evidence', 'inheritedGps', 'placeKind', 'naming', 'dims', 'cohesion',
  'visionBridged', 'timeFitMin', 'runnerUpMin', 'inferredTime', 'nearestMin',
  'discoveredNameSource',
]
export function projectSignalsForViewer(signals, { nameHidden, coordsHidden }) {
  if (!signals || typeof signals !== 'object') return null
  const out = {}
  for (const k of SAFE_SIGNAL_KEYS) {
    if (k in signals) out[k] = signals[k]
  }
  const vn = signals.visionName
  if (typeof vn === 'string' && vn && !nameHidden(vn)) out.visionName = vn
  const pin = signals.pin
  if (pin && typeof pin === 'object') {
    const leaks =
      nameHidden(pin.name) || nameHidden(pin.query) || coordsHidden(pin.lat, pin.lng)
    if (!leaks) out.pin = pin
  }
  return out
}

// A moment the family already gave a TERMINAL answer to (a confirm, a
// correction, or a leave-as-guess — migration 021) is DECIDED and must never be
// re-surfaced as a question. Matching is by memory-set OVERLAP, not equality:
// cluster membership can drift by a photo between sweeps, so a feedback row that
// covers a MAJORITY of a decision's memories still closes it (a stray single
// shared photo — one of nine — does NOT, so a genuinely different moment stays
// open). Family-wide: any adult's answer settles it for everyone (a confirm
// files the moment for the whole family). Returns a predicate over a decision's
// memoryIds; [] feedback (or a pre-migration-021 empty read) closes nothing.
export function buildAnsweredMatcher(feedbackRows) {
  const sets = []
  for (const f of feedbackRows || []) {
    let ids = Array.isArray(f?.memoryIds) ? f.memoryIds : null
    if (!ids) {
      try {
        ids = JSON.parse(f?.memory_ids || '[]')
      } catch {
        ids = null
      }
    }
    if (Array.isArray(ids) && ids.length) sets.push(new Set(ids.filter((x) => typeof x === 'string' && x)))
  }
  return (memoryIds) => {
    const dec = Array.isArray(memoryIds) ? memoryIds : []
    if (!dec.length || !sets.length) return false
    for (const s of sets) {
      let overlap = 0
      for (const id of dec) if (s.has(id)) overlap++
      if (overlap > 0 && overlap * 2 >= dec.length) return true // majority of THIS decision covered
    }
    return false
  }
}

// PURE per-viewer filter over raw ledger rows. `memoryRows` are raw D1 memory
// rows (id, visibility, author_traveler, hide_from_json, revealed_at) for the
// same trip; a memory id in a decision that is MISSING from them (deleted
// since the ledger run — rows are only replaced on the next sweep) is treated
// as invisible: stale rows must fail CLOSED, never leak a ghost. `feedbackRows`
// (migration 021, optional) close moments the family already answered.
export function filterDecisionsForViewer(trip, decisionRows, memoryRows, viewer, feedbackRows = []) {
  if (isTripMaskedFrom(trip, viewer)) return []
  const hidden = buildHiddenIndex(trip, viewer)
  const { dayHidden, stopHidden, nameHidden } = hidden
  const memById = new Map((memoryRows || []).map((r) => [r.id, r]))
  const isAnswered = buildAnsweredMatcher(feedbackRows)

  const out = []
  for (const row of decisionRows || []) {
    let memoryIds
    try {
      memoryIds = JSON.parse(row.memory_ids || '[]')
    } catch {
      continue // an unparseable row is dropped, never served half-read
    }
    if (!Array.isArray(memoryIds)) continue
    let visible = true
    for (const id of memoryIds) {
      const mem = memById.get(id)
      if (!mem || !viewerCanSee(mem, viewer)) {
        visible = false
        break
      }
    }
    if (!visible) continue
    if (dayHidden(row.iso_date)) continue
    if (row.place_id && stopHidden(row.place_id)) continue
    // case-insensitive + containment (the review's case-variant point) — a
    // discovered/vision place_name echoing a hidden stop's name drops the row.
    if (row.place_name && nameHidden(row.place_name)) continue
    // Already answered by the family (confirm/correct/aside) → decided, not a
    // question anymore. Checked after the mask gates so it never widens exposure.
    if (isAnswered(memoryIds)) continue
    let signals = null
    try {
      signals = row.signals_json ? JSON.parse(row.signals_json) : null
    } catch {
      signals = null
    }
    // reason strings embed place/vision names ("looks like X", "12m from X,
    // clear") — scrub the whole string if it touches a hidden name.
    const reason = typeof row.reason === 'string' && nameHidden(row.reason) ? null : (row.reason ?? null)
    out.push({
      isoDate: row.iso_date,
      memoryIds,
      photoCount: row.photo_count,
      placeId: row.place_id ?? null,
      placeName: row.place_name ?? null,
      tier: row.tier,
      confidence: row.confidence ?? null,
      evidence: row.evidence ?? null,
      signals: projectSignalsForViewer(signals, hidden),
      reason,
      mode: row.mode,
      runAt: row.run_at,
    })
  }
  return out
}

// Load + project the ledger for one trip and one viewer. Returns [] when the
// knob is off, the trip is missing, or nothing survives projection.
export async function listHealDecisionsForViewer(env, tripId, viewer) {
  if (photoHealMode(env) === 'off') return []
  if (!tripId) return []
  const tripRow = await env.DB.prepare(
    'SELECT data_json FROM trips WHERE id = ? AND deleted_at IS NULL'
  ).bind(tripId).first()
  if (!tripRow) return []
  let trip
  try {
    trip = JSON.parse(tripRow.data_json)
  } catch {
    return []
  }
  const { results: decisionRows } = await env.DB.prepare(
    'SELECT iso_date, memory_ids, photo_count, place_id, place_name, tier, confidence, evidence, signals_json, reason, mode, run_at FROM memory_heal_decisions WHERE trip_id = ? ORDER BY iso_date, id'
  ).bind(tripId).all()
  if (!decisionRows || !decisionRows.length) return []
  const { results: memoryRows } = await env.DB.prepare(
    'SELECT id, visibility, author_traveler, hide_from_json, revealed_at FROM memories WHERE trip_id = ? AND deleted_at IS NULL'
  ).bind(tripId).all()
  // Migration 021 (S1 feedback) — [] when the table is unapplied, so a
  // pre-migration worker closes nothing (inert). Trip-wide (family-wide).
  const feedbackRows = await listHealFeedbackForTrip(env, tripId)
  return filterDecisionsForViewer(trip, decisionRows, memoryRows || [], viewer, feedbackRows)
}
