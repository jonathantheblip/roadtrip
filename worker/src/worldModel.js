// worldModel.js — HM-3 of the Healing Model (DESIGN_THE_HEALING_MODEL.md §12.3).
//
// The durable cross-trip organ: the family's recurring places (the beach house,
// Grandma's, the Provincetown town beach) learned across trips and fed back into the
// bench as ONE more witness — a CLAMPED, DECAYING prior. It is a piece of the whole,
// never the whole (§9.1): a prior nudges, it must never assert.
//
// Lessons in the shape:
//   • CLAMPED — the prior emits tier 'prior' (non-observed) and a membership capped far
//     below certainty (priorCeiling). Through the settling engine a place supported ONLY
//     by the prior can heal softly at most, NEVER file silently — so a strong recurring
//     pattern can never manufacture a confident misfile of the off-rhythm photo (the
//     interactive-activation overconfidence trap).
//   • DECAYING — a place's prior fades with time since it was last seen (a sold beach
//     house, a Grandma who's gone): a stale pattern quietly loses its voice instead of
//     dragging new photos to a place that no longer exists.
//   • GRADED, never a cutoff — recurrence strength grows smoothly with visits; there is
//     no "≥N trips = recurring" gate. A place seen once still whispers.
//   • Matched by NAME, not coordinates — identical coordinates are LEGITIMATELY different
//     places (the Provincetown lodging + beach on one spot), so the world model keeps
//     them DISTINCT and never merges by proximity (the founding lesson).
//   • Emergent (§14) — supplied to the bench it speaks; absent, it abstains in the same
//     grammar as any missing signal.
//
// Pure + node-tested; deterministic (all times passed in, never read from the clock). A
// local artifact — no schema, no migration — until that gate.

const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const normName = (s) => (typeof s === 'string' ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '')
const DAY = 86400000

export const WORLD_DEFAULTS = {
  priorCeiling: 0.5, // CLAMP: the prior nudges, never asserts — capped far below certainty
  recurrenceHalf: 2, // visits at which recurrence strength reaches ~0.5 (smooth, no cutoff)
  decayHalfLifeDays: 730, // a place unseen this long has its prior halved
}

// buildWorldModel — aggregate stops across trips into recurring places, matched BY NAME.
// trips: [{ id, endMs?, stops:[{ name, lat?, lng?, timeMin? }] }]
export function buildWorldModel(trips, opts = {}) {
  const byKey = new Map()
  for (const trip of trips || []) {
    const endMs = Number.isFinite(trip.endMs) ? trip.endMs : null
    for (const stop of trip.stops || []) {
      const key = normName(stop.name)
      if (!key) continue
      if (!byKey.has(key)) byKey.set(key, { key, name: stop.name, tripIds: new Set(), latSum: 0, lngSum: 0, coordN: 0, lastSeenMs: null, timeSum: 0, timeN: 0 })
      const wp = byKey.get(key)
      wp.tripIds.add(trip.id ?? Symbol())
      if (Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) { wp.latSum += stop.lat; wp.lngSum += stop.lng; wp.coordN++ }
      if (Number.isFinite(endMs)) wp.lastSeenMs = wp.lastSeenMs == null ? endMs : Math.max(wp.lastSeenMs, endMs)
      if (Number.isFinite(stop.timeMin)) { wp.timeSum += stop.timeMin; wp.timeN++ }
    }
  }
  const places = [...byKey.values()].map((wp) => ({
    key: wp.key,
    name: wp.name,
    lat: wp.coordN ? wp.latSum / wp.coordN : null,
    lng: wp.coordN ? wp.lngSum / wp.coordN : null,
    visits: wp.tripIds.size,
    lastSeenMs: wp.lastSeenMs,
    typicalMin: wp.timeN ? wp.timeSum / wp.timeN : null,
  }))
  return { places, byName: new Map(places.map((p) => [p.key, p])) }
}

const recurrenceStrength = (visits, half) => 1 - Math.pow(0.5, Math.max(0, visits) / (half > 0 ? half : 1))
const decay = (lastSeenMs, nowMs, halfDays) => {
  if (!Number.isFinite(lastSeenMs) || !Number.isFinite(nowMs) || !(halfDays > 0)) return 1
  return clamp01(Math.pow(0.5, Math.max(0, nowMs - lastSeenMs) / (halfDays * DAY)))
}

// The clamped, decayed prior membership a candidate place earns from the world model.
export function worldModelPrior(worldModel, candidatePlace, nowMs, opts = {}) {
  const o = { ...WORLD_DEFAULTS, ...opts }
  const wp = worldModel?.byName?.get(normName(candidatePlace?.name))
  if (!wp) return 0
  return clamp01(o.priorCeiling * recurrenceStrength(wp.visits, o.recurrenceHalf) * decay(wp.lastSeenMs, nowMs, o.decayHalfLifeDays))
}

// The bench witness: emit the prior as graded placement support (tier 'prior'). v1 is a
// per-place recurrence prior, uniform across the trip's photos — photo-specificity comes
// from the other witnesses; the prior only says "this recurring place is a priori plausible."
export function worldModelWitness(points, places, worldModel, opts = {}, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : opts.now
  const priorByPlace = {}
  for (const pl of places || []) {
    const m = worldModelPrior(worldModel, pl, now, opts)
    if (m > 0) priorByPlace[pl.id] = m
  }
  if (!Object.keys(priorByPlace).length) return []
  const out = []
  for (const pt of points || []) out.push({ kind: 'placement', witness: 'worldModel', tier: 'prior', photoId: pt.id, support: { ...priorByPlace } })
  return out
}
