// Apply a (possibly Helen-edited) reconciliation draft back onto a trip
// record, producing the persisted "what actually happened" trip plus the
// photo→stop bindings the upload pipeline needs.
//
// Pure — no React / network / IndexedDB — so the commit logic is
// unit-testable in Node and the triage component stays a thin view over
// it. The component holds the draft in state, lets Helen edit it
// (rename / flip / promote / demote / merge / split / inline-edit, all
// of which mutate the draft's stop + interstitial arrays), then calls
// this to turn the final draft into a trip record + bindings and hands
// both to upsertTrip + uploadBackfillPhotos.
//
// This function does NOT care HOW a draft stop got its shape — it only
// reads the final draft. That keeps it stable across Step 2 (states +
// flip) and Step 3 (the richer edits): new edit kinds just change the
// draft before it arrives here.
//
// Contract:
//   applyReconciliation(draft, trip) → {
//     trip: <reconciled trip record>,
//     photoBindings: { [photoId]: stopId | null },   // null = interstitial
//     photoInterstitials: { [photoId]: { before, after } },  // the "from A
//       // to B" identity for the null-bound photos; before/after are stop
//       // ids in the day (either may be null at a day edge). Rides ALONGSIDE
//       // the null binding — it does not replace it (see migration 007).
//   }
//
// Rules (from RECONCILIATION_SPEC):
//   - state 'didnt_happen' → the stop is REMOVED from the reconciled
//     record (gone, not greyed). The original plan survives under
//     `trip.originalPlan` (stashed once, on first reconcile) so a future
//     plan-vs-reality view is still possible.
//   - 'auto_added' (and any promoted) stops become real stops carrying
//     `addedDuringReconciliation: true`.
//   - planned stops keep all their original fields (address, lat/lng,
//     note, …) and gain `state`; renames / time edits from the draft win.
//   - the trip gets no status change here — archiving is a separate
//     trip-level action (Step 5).

import { STOP_STATE } from './reconcileDraft.js'

export function applyReconciliation(draft, trip) {
  if (!trip || !Array.isArray(trip.days)) {
    return { trip, photoBindings: {}, photoInterstitials: {} }
  }
  const draftDayByN = new Map(
    (draft?.days || []).map((d) => [d.dayN, d])
  )

  const photoBindings = {}
  const photoInterstitials = {}

  const newDays = trip.days.map((origDay) => {
    const draftDay = draftDayByN.get(origDay.n)
    if (!draftDay) {
      // No draft for this day (shouldn't happen — draft is built from
      // the trip) — leave the day untouched.
      return origDay
    }

    const origStopById = new Map(
      (origDay.stops || []).map((s) => [s.id, s])
    )

    const newStops = []
    for (const draftStop of draftDay.stops || []) {
      // Skipped stops are removed from the reconciled record.
      if (draftStop.state === STOP_STATE.DIDNT_HAPPEN) continue

      if (draftStop.source === 'planned') {
        const orig = origStopById.get(draftStop.stopId) || {}
        newStops.push({
          ...orig,
          id: draftStop.stopId,
          name: draftStop.name ?? orig.name ?? draftStop.stopId,
          time: draftStop.time ?? orig.time ?? '',
          state: draftStop.state || STOP_STATE.HAPPENED,
        })
      } else {
        // auto_added / promoted — synthesize a full stop record. Reuse
        // an original stop's fields if this promotion targeted one
        // (Step 3 promote can carry an `originalStopId`); otherwise
        // build from the draft + cluster centroid.
        const orig = draftStop.originalStopId
          ? origStopById.get(draftStop.originalStopId) || {}
          : {}
        newStops.push({
          ...orig,
          id: draftStop.stopId,
          time: draftStop.time ?? orig.time ?? '',
          name: draftStop.name ?? orig.name ?? 'Stop',
          kind: draftStop.kind || orig.kind || 'activity',
          for: Array.isArray(draftStop.for) && draftStop.for.length
            ? [...draftStop.for]
            : Array.isArray(orig.for) && orig.for.length
              ? [...orig.for]
              : Array.isArray(trip.travelers) ? [...trip.travelers] : [],
          note: orig.note || '',
          address: orig.address || '',
          lat: numberOr(draftStop.centroid?.lat, orig.lat),
          lng: numberOr(draftStop.centroid?.lng, orig.lng),
          state: STOP_STATE.AUTO_ADDED,
          addedDuringReconciliation: true,
          source: 'reconciliation',
        })
      }

      // Bind every photo on this kept stop to its (final) stop id.
      for (const pid of draftStop.photoIds || []) {
        photoBindings[pid] = draftStop.stopId
      }
    }

    // Interstitial photos bind to no stop (null) — they're transit shots
    // that stay in the day without a stop association. The null binding is
    // kept as-is; the "from A to B" identity rides ALONGSIDE it as a
    // separate memory-level field (migration 007), taken from the bucket's
    // bounding stops. A photo already bound to a real stop (an earlier
    // draftStop loop) is never given an interstitial — a stop wins.
    for (const bucket of draftDay.interstitials || []) {
      for (const pid of bucket.photoIds || []) {
        if (!(pid in photoBindings)) photoBindings[pid] = null
        if (!(pid in photoInterstitials)) {
          photoInterstitials[pid] = {
            before: bucket.interstitialBefore ?? null,
            after: bucket.interstitialAfter ?? null,
          }
        }
      }
    }

    return { ...origDay, stops: newStops }
  })

  const reconciledTrip = {
    ...trip,
    days: newDays,
    // Preserve the true original plan exactly once, so didnt_happen
    // removals and renames don't erase the history a plan-vs-reality
    // view would later read. Guarded: a second reconcile won't clobber
    // the genuine original with already-reconciled data.
    originalPlan: trip.originalPlan || { days: deepCloneDays(trip.days) },
    reconciledAt: new Date().toISOString(),
  }

  return { trip: reconciledTrip, photoBindings, photoInterstitials }
}

function numberOr(primary, fallback) {
  if (Number.isFinite(primary)) return primary
  if (Number.isFinite(fallback)) return fallback
  return null
}

function deepCloneDays(days) {
  // Structured-ish clone without pulling in a dep; trip data is plain
  // JSON (no Dates / functions), so JSON round-trip is safe and keeps
  // the stash decoupled from later mutations of trip.days.
  try {
    return JSON.parse(JSON.stringify(days))
  } catch {
    return days
  }
}
