// healScoreboard.js — the honest instrument (DESIGN_THE_HEALING_MODEL.md §7).
//
// The plan's scoreboard, and the thing every richer rung of the ladder must earn
// its place against: hold out a whole trip, HIDE the family's own filings, run a
// placer BLIND, and measure how much of the family's filing it recovers — and, the
// number that actually matters, how often it would silently file to the WRONG place.
//
// It is not "green tests". It grades a placer against the family's own choices, on
// real trips, with three deliberate honesty properties:
//   1. The answer key is ONLY the family's DELIBERATE filings (source manual/
//      confirmed). Auto filings are the machine's own past guesses, not truth;
//      "unfiled" is a censored observation, never a negative. Neither is in the key.
//   2. maskFilings strips every field a placer could read to peek at the answer, so
//      we always grade a blind placer, never a cheater. (A leaky mask would score
//      beautifully and be a lie — the exact failure §11 warns about.)
//   3. It rewards SHARPNESS, not caution: a placer that abstains on everything
//      recovers nothing; one that auto-files everything misfiles. Brier captures both.
//
// Pure, zero engine dependency (the placer is injected), node/vitest-testable, and
// imported only by its test + offline eval — it never runs in the worker in prod.

// The family's DELIBERATE filing = the reference answer key. MUST match
// stopProvenance.js HUMAN_FILED exactly (a manual hand-move + a confirm-card "yes").
const HUMAN_FILED = new Set(['manual', 'confirmed'])

// Every field a placer could read to peek at the filing. Stripped by maskFilings so
// the placer goes blind. (buildTripDecisions peeks only via humanWords.js
// manualStopEvidence, which reads exactly these: stop_id/stopId + stop_prov_json/
// stopProv. If a future placer reads another filing field, add it here.)
const FILING_FIELDS = ['stop_id', 'stopId', 'stop_prov_json', 'stopProv']

const parseProv = (m) => {
  if (m?.stopProv && typeof m.stopProv === 'object') return m.stopProv
  const raw = m?.stop_prov_json
  if (typeof raw === 'string' && raw) {
    try { return JSON.parse(raw) } catch { return null }
  }
  return null
}
const stopIdOf = (m) => m?.stopId ?? m?.stop_id ?? null
// null / '' / undefined all mean "unfiled" (stopProvenance.sameStop) → not a filing.
const isFiled = (id) => typeof id === 'string' && id !== ''

// answerKey(memories) → Map(memoryId → trueStopId) for the family's own filings.
// v1 caveat: includes any non-empty human-filed stop id, incl. synthetic targets
// (__trip_base__ / __record__). Kept broad so we never silently drop a real family
// choice; a later rung may restrict to filable real stops.
export function answerKey(memories) {
  const key = new Map()
  for (const m of memories || []) {
    if (!m || m.deleted_at || m.deletedAt) continue
    const stopId = stopIdOf(m)
    const prov = parseProv(m)
    if (m.id && isFiled(stopId) && prov && HUMAN_FILED.has(prov.source)) key.set(m.id, stopId)
  }
  return key
}

// maskFilings(memories) → shallow copies with EVERY filing field removed, so a
// placer run over them cannot see (or infer via manualStopEvidence) where the
// family filed. Does not mutate the originals — the answer key still reads them.
export function maskFilings(memories) {
  return (memories || []).map((m) => {
    const c = { ...m }
    for (const f of FILING_FIELDS) delete c[f]
    return c
  })
}

// A memory in more than one decision (refs split across bursts) takes its STRONGEST
// decision — the one that would actually act. auto > confirm > leave, then confidence.
const TIER_RANK = { auto: 2, confirm: 1, leave: 0 }

// predictionsFromDecisions(decisions) → Map(memoryId → {stopId, tier, confidence}).
export function predictionsFromDecisions(decisions) {
  const pred = new Map()
  for (const d of Array.isArray(decisions) ? decisions : []) {
    const stopId = d?.place?.id ?? null
    const tier = d?.tier || 'leave'
    const confidence = Number.isFinite(d?.confidence) ? d.confidence : 0
    for (const mid of d?.memoryIds || []) {
      const prev = pred.get(mid)
      const stronger = !prev
        || TIER_RANK[tier] > TIER_RANK[prev.tier]
        || (TIER_RANK[tier] === TIER_RANK[prev.tier] && confidence > prev.confidence)
      if (stronger) pred.set(mid, { stopId, tier, confidence })
    }
  }
  return pred
}

// scoreAgainstKey(key, predictions) → the metrics, for one held-out trip.
//   recovered — the app would SILENTLY file it to the SAME stop (auto + correct):
//               it reproduced the family's own choice, unprompted. What we want.
//   misfiled  — the app would SILENTLY file it to a DIFFERENT stop (auto + wrong):
//               the dangerous outcome the whole abstention line exists to prevent.
//   abstained — the app would NOT silently commit (confirm / leave / no prediction):
//               not a recovery, but honest. askedTopCorrect = of those, how many had
//               the RIGHT stop as their top (confirm) guess — a good two-tap card.
//   brier     — mean squared error of confidence-as-p(top guess is correct); lower is
//               better; rewards being sharp where sharp is earned, not just cautious.
export function scoreAgainstKey(key, predictions) {
  let recovered = 0, misfiled = 0, abstained = 0, askedTopCorrect = 0, brierSum = 0
  for (const [mid, trueStop] of key) {
    const p = predictions.get(mid) || { stopId: null, tier: 'leave', confidence: 0 }
    const correct = p.stopId != null && p.stopId === trueStop
    if (p.tier === 'auto') {
      if (correct) recovered++
      else misfiled++
    } else {
      abstained++
      if (correct) askedTopCorrect++
    }
    const conf = Number.isFinite(p.confidence) ? p.confidence : 0
    brierSum += (conf - (correct ? 1 : 0)) ** 2
  }
  const n = key.size
  const rate = (x) => (n ? x / n : 0)
  return {
    n,
    recovered, misfiled, abstained, askedTopCorrect,
    recoveryRate: rate(recovered),
    misfileRate: rate(misfiled),
    abstainRate: rate(abstained),
    askedTopCorrectRate: rate(askedTopCorrect),
    brier: n ? brierSum / n : null,
  }
}

// scoreTrip — the whole loop for ONE held-out trip: mask its filings, run the placer
// BLIND, compare its predictions to the family's held-out answer key.
//   placer(trip, maskedMemories, opts) → decisions[]   (REQUIRED, injected)
// The floor and every richer rung grade through the same call. A cross-trip world-
// model rung "holds out the whole trip" by being handed a placer already denied this
// trip's evidence — the harness needs no change, just a placer bound to that context.
export function scoreTrip(trip, memories, { placer, opts = {} } = {}) {
  if (typeof placer !== 'function') {
    throw new Error('scoreTrip: a placer(trip, memories, opts) function is required')
  }
  const key = answerKey(memories)
  const decisions = placer(trip, maskFilings(memories), opts)
  return scoreAgainstKey(key, predictionsFromDecisions(decisions))
}

// scoreCorpus — blocked by trip (each trip held out and scored on its OWN key), then
// aggregated BOTH ways: pooled (photo-weighted) and per-trip mean (each trip counts
// once, so one photo-heavy trip can't dominate the headline).
export function scoreCorpus(perTrip) {
  const rows = (perTrip || []).filter((r) => r && r.n > 0)
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0)
  const mean = (f) => (rows.length ? sum(f) / rows.length : 0)
  const pooledN = sum((r) => r.n)
  const pooledRate = (f) => (pooledN ? sum(f) / pooledN : 0)
  return {
    trips: rows.length,
    pooledN,
    pooled: {
      recoveryRate: pooledRate((r) => r.recovered),
      misfileRate: pooledRate((r) => r.misfiled),
      abstainRate: pooledRate((r) => r.abstained),
      brier: pooledN ? sum((r) => (r.brier ?? 0) * r.n) / pooledN : null,
    },
    perTripMean: {
      recoveryRate: mean((r) => r.recoveryRate),
      misfileRate: mean((r) => r.misfileRate),
      abstainRate: mean((r) => r.abstainRate),
      brier: mean((r) => r.brier ?? 0),
    },
  }
}
