// Pure draft-mutation operations for the reconciliation triage. Each is
// immutable: it takes the current draft and returns a NEW draft with the
// one edit applied (JSON-clone under the hood, so a React setState lands
// a fresh reference and nothing aliases the previous draft). Kept out of
// the component so the trickier structural edits — promote, demote,
// merge, split — are unit-testable in Node, matching reconcileDraft.js /
// reconcileApply.js.
//
// The draft shape is exactly what buildReconciliationDraft emits; these
// only ever reshape `days[].stops[]` and `days[].interstitials[]`. The
// persistence engine (applyReconciliation) reads whatever the FINAL
// draft says, so no edit here needs a matching change there:
//   - a stop with source !== 'planned' is materialized into a real stop
//   - a stop with state 'didnt_happen' is dropped from the record
//   - planned stops keep their original fields; name / time / state win
//
// Every function is a no-op (returns an unchanged clone) when its target
// can't be found or the edit isn't allowed, so the UI can call them
// without pre-validating.

import {
  STOP_STATE,
  medianCapturedMs,
  formatClockTime,
} from './reconcileDraft.js'
import { parseStopTime } from './photoBackfill.js'

// ── core helpers ────────────────────────────────────────────────────

function clone(draft) {
  return JSON.parse(JSON.stringify(draft))
}

function findDay(draft, dayN) {
  return (draft?.days || []).find((d) => d.dayN === dayN) || null
}

function stopIndex(day, stopId) {
  return (day?.stops || []).findIndex((s) => s.stopId === stopId)
}

// A planned stop's state is a pure function of whether it carries
// photos — unless Helen has overridden it to didnt_happen, which we
// never silently undo. auto_added stops keep their state.
function recomputeState(stop) {
  if (stop.state === STOP_STATE.DIDNT_HAPPEN) return
  if (stop.source === 'planned') {
    stop.state =
      (stop.photoIds || []).length > 0
        ? STOP_STATE.HAPPENED
        : STOP_STATE.HAPPENED_NO_PHOTOS
  }
}

function parsedAt(time, dayIsoDate) {
  const at = parseStopTime(time, dayIsoDate)?.at
  return Number.isFinite(at) ? at : Number.POSITIVE_INFINITY
}

// Sort photo ids chronologically by capturedAt; ids whose photo or
// timestamp is missing sort to the end (stable among themselves).
function sortPhotoIdsByTime(photoIds, photoById) {
  if (!photoById) return [...photoIds]
  return [...photoIds].sort((a, b) => {
    const ta = Date.parse(photoById.get(a)?.capturedAt)
    const tb = Date.parse(photoById.get(b)?.capturedAt)
    const na = Number.isFinite(ta) ? ta : Number.POSITIVE_INFINITY
    const nb = Number.isFinite(tb) ? tb : Number.POSITIVE_INFINITY
    return na - nb
  })
}

function slug(s) {
  return String(s).replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// "From A to B" / "Before B" / "After A" / "In transit" — same framing
// the draft builder uses, so a demoted stop's bucket reads consistently.
function transitTitle(beforeName, afterName) {
  if (beforeName && afterName) return `From ${beforeName} to ${afterName}`
  if (afterName) return `Before ${afterName}`
  if (beforeName) return `After ${beforeName}`
  return 'In transit'
}

// ── inline edits ────────────────────────────────────────────────────

export function renameStop(draft, dayN, stopId, name) {
  const next = clone(draft)
  const day = findDay(next, dayN)
  const stop = day?.stops?.find((s) => s.stopId === stopId)
  if (stop) stop.name = name
  return next
}

export function retimeStop(draft, dayN, stopId, time) {
  const next = clone(draft)
  const day = findDay(next, dayN)
  const stop = day?.stops?.find((s) => s.stopId === stopId)
  if (stop) stop.time = time
  return next
}

// ── state override (the happened / didn't-happen axis) ──────────────

// Mark a stop didn't-happen → it's dropped from the record on save.
// Guarded: a stop carrying photos is proof it happened, so it can't be
// flipped here (the UI only offers this on no-photo stops; the guard
// keeps the invariant even if that ever slips).
export function markDidntHappen(draft, dayN, stopId) {
  const next = clone(draft)
  const day = findDay(next, dayN)
  const stop = day?.stops?.find((s) => s.stopId === stopId)
  if (stop && (stop.photoIds || []).length === 0) {
    stop.state = STOP_STATE.DIDNT_HAPPEN
  }
  return next
}

// Undo a didnt_happen back to its no-photos resting state.
export function restoreStop(draft, dayN, stopId) {
  const next = clone(draft)
  const day = findDay(next, dayN)
  const stop = day?.stops?.find((s) => s.stopId === stopId)
  if (stop && stop.state === STOP_STATE.DIDNT_HAPPEN) {
    stop.state = STOP_STATE.HAPPENED_NO_PHOTOS
  }
  return next
}

// ── structural edits ────────────────────────────────────────────────

// Demote an auto_added (or promoted) stop back to an interstitial
// bucket: the stop disappears and its photos become transit shots bound
// to no stop. No-op on a planned stop (those leave via markDidntHappen,
// not demotion — a planned stop is part of the itinerary, not a
// discovery).
export function demoteToInterstitial(draft, dayN, stopId) {
  const next = clone(draft)
  const day = findDay(next, dayN)
  if (!day) return next
  const i = stopIndex(day, stopId)
  if (i < 0) return next
  const stop = day.stops[i]
  if (stop.source === 'planned') return next

  const prev = day.stops[i - 1] || null
  const nextStop = day.stops[i + 1] || null
  const beforeId = prev?.stopId || null
  const afterId = nextStop?.stopId || null
  const key = `interstitial:${beforeId || 'start'}-${afterId || 'end'}`

  day.stops.splice(i, 1)

  if (!Array.isArray(day.interstitials)) day.interstitials = []
  let bucket = day.interstitials.find((b) => b.key === key)
  if (!bucket) {
    bucket = {
      key,
      interstitialBefore: beforeId,
      interstitialAfter: afterId,
      title: transitTitle(prev?.name, nextStop?.name),
      photoIds: [],
    }
    day.interstitials.push(bucket)
  }
  bucket.photoIds.push(...(stop.photoIds || []))
  return next
}

// Promote an interstitial bucket into a real (auto_added) stop. The new
// stop carries a placeholder name for Helen to rename, sits at the time
// slot of its photos' median capture, and inherits the bucket's photos.
// `photoById` (id → { capturedAt }) supplies the timing.
export function promoteToStop(draft, dayN, bucketKey, photoById) {
  const next = clone(draft)
  const day = findDay(next, dayN)
  if (!day) return next
  const bi = (day.interstitials || []).findIndex((b) => b.key === bucketKey)
  if (bi < 0) return next
  const bucket = day.interstitials[bi]
  const photoIds = sortPhotoIdsByTime(bucket.photoIds || [], photoById)
  const medianMs = medianCapturedMs(photoIds, photoById || new Map())
  const time = formatClockTime(medianMs)

  const newStop = {
    stopId: `promoted-${dayN}-${slug(bucketKey)}`,
    name: 'New stop',
    time,
    kind: 'activity',
    for: [],
    state: STOP_STATE.AUTO_ADDED,
    source: 'auto_added',
    addedDuringReconciliation: true,
    photoIds,
    clusterId: null,
    centroid: null,
    distanceToRouteMeters: null,
  }

  day.interstitials.splice(bi, 1)
  insertStopByTime(day, newStop)
  return next
}

// Merge one stop's photos into a neighbor and drop the absorbed stop.
// The kept stop (`intoStopId`) keeps its identity, name, and time; it
// just gains the photos and, if it's a planned stop, re-derives its
// state (a no-photos stop that absorbs photos becomes 'happened').
export function mergeStops(draft, dayN, stopId, intoStopId, photoById) {
  const next = clone(draft)
  if (stopId === intoStopId) return next
  const day = findDay(next, dayN)
  if (!day) return next
  const fromIdx = stopIndex(day, stopId)
  const into = day.stops?.find((s) => s.stopId === intoStopId)
  if (fromIdx < 0 || !into) return next
  const from = day.stops[fromIdx]

  into.photoIds = sortPhotoIdsByTime(
    [...(into.photoIds || []), ...(from.photoIds || [])],
    photoById
  )
  day.stops.splice(fromIdx, 1)
  recomputeState(into)
  return next
}

// Split a stop's photos (chronologically) into two stops at the
// midpoint. The original keeps the earlier half; a new auto_added stop
// carrying the later half is inserted right after it. No-op below two
// photos (nothing to split).
export function splitStop(draft, dayN, stopId, photoById) {
  const next = clone(draft)
  const day = findDay(next, dayN)
  if (!day) return next
  const i = stopIndex(day, stopId)
  if (i < 0) return next
  const stop = day.stops[i]
  const ordered = sortPhotoIdsByTime(stop.photoIds || [], photoById)
  if (ordered.length < 2) return next

  const cut = Math.ceil(ordered.length / 2)
  const firstHalf = ordered.slice(0, cut)
  const secondHalf = ordered.slice(cut)

  stop.photoIds = firstHalf
  recomputeState(stop)

  const medianMs = medianCapturedMs(secondHalf, photoById || new Map())
  const newStop = {
    stopId: uniqueSplitId(day, stopId),
    name: `${stop.name} (2)`,
    time: formatClockTime(medianMs),
    kind: stop.kind || 'activity',
    for: Array.isArray(stop.for) ? [...stop.for] : [],
    state: STOP_STATE.AUTO_ADDED,
    source: 'auto_added',
    addedDuringReconciliation: true,
    photoIds: secondHalf,
    clusterId: null,
    centroid: null,
    distanceToRouteMeters: null,
  }
  day.stops.splice(i + 1, 0, newStop)
  return next
}

// ── insertion helpers ───────────────────────────────────────────────

// Insert a stop at the first position whose existing stop is later in
// the day, so a promoted stop lands in its chronological slot without
// disturbing the rest of the order.
function insertStopByTime(day, newStop) {
  const at = parsedAt(newStop.time, day.dayIsoDate)
  const stops = day.stops || (day.stops = [])
  let idx = stops.findIndex((s) => parsedAt(s.time, day.dayIsoDate) > at)
  if (idx < 0) idx = stops.length
  stops.splice(idx, 0, newStop)
}

function uniqueSplitId(day, stopId) {
  const ids = new Set((day.stops || []).map((s) => s.stopId))
  let n = 2
  let candidate = `${stopId}-split-${n}`
  while (ids.has(candidate)) {
    n += 1
    candidate = `${stopId}-split-${n}`
  }
  return candidate
}
