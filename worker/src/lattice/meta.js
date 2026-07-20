// lattice/meta.js — the META branch of the world-model FACT LATTICE
// (DESIGN_THE_HEALING_MODEL.md §16d, one branch of six; §16c altitude 6).
//
// The per-family HYPOTHESIS-CLASS TRUST ledger. The confirm surface asks four KINDS
// of question — A (place-confirm), B (name), C (when), D (grouping) — and the family
// answers each with one of three terminal verbs: `confirmed` / `corrected` / `aside`.
// This branch folds the append-only feedback ledger (worker: memory_heal_feedback)
// into, PER question-class × CONTEXT, the family's confirm / correct / skip RATES.
// That IS the datum §16c altitude 6 will later read to decide a class is trusted
// enough that its future instances AUTO-APPLY SOFTLY instead of asking — the question
// kind retires for that context. We MEASURE the rate here ONLY; NO auto-apply logic,
// no bar, no gate lives in this file (that is O7's later band).
//
// This is "itself a family-fact" (§16d META): its headline subject is the whole
// FAMILY's trust in a question-class — deliberately DISTINCT from the PEOPLE branch,
// which owns the per-PERSON curation style (by_traveler × action). META never keys on
// a person. Its context axis is instead the family (the parent, the reusable trust)
// and each TRIP (a ledger-native child bucket, trip_id — NOT a trip-SHAPE, which is
// RHYTHMS' subject and needs a classifier this fold deliberately avoids). So the two
// levels form the §16c-altitude-4 partial-pooling hierarchy: family ← trip.
//
// Shaped like ITSELF, not like a neighbour. The subject is a hypothesis-class, never
// a place or a person; the value is a behavioural RATE, never a spatial membership;
// the hierarchy pools trips toward the family, never places by proximity. No constant
// is shared with worldModel / people / the bench (a shared threshold would be the §13
// heterogeneity sin). The branch guards, baked into the shape so a later reader can't
// quietly undo them:
//
//   • A fact NUDGES, never asserts — CONFIDENCE is CLAMPED at `confidenceCeiling`,
//     well below certainty. No number of confirms can manufacture a *certain* trust:
//     the strongest this ledger ever says is "lean toward retiring this question",
//     and everything O7 learns from it stays derived-tier / soft (§16c).
//   • GRADED, never a cutoff — confidence grows SMOOTHLY with the answer count
//     (`confidenceHalfN`); there is no "≥N answers = trusted" gate. One answer still
//     whispers. (Muting a thin-but-real channel is the pinned §13 drift; forbidden.)
//   • DECAYING — a curation habit is behavioural and drifts; trust-currency fades with
//     time since the class×context was last answered (`decayHalfLifeDays`), so a
//     year-stale pattern loses its voice instead of standing on a habit the family has
//     moved past. Shorter half-life than the world model's place recurrence.
//   • PARTIAL POOLING (§16c altitude 4) — a per-trip fact SHRINKS toward the family
//     parent and earns divergence from it only as that trip's own answers pile up. At
//     ~4 trips most per-trip facts are whispers sitting on their parent; that is
//     correct, not a defect (scale honesty, §16d).
//   • ABSENCE ABSTAINS — a class×context with no feedback emits NO fact (never a
//     "0% trust" negative vote). The empty ledger (today's prod reality — the confirm
//     mode has never been on) folds to ZERO facts, exactly as it should. A row with no
//     A/B/C/D class carries no hypothesis-class datum and is skipped.
//   • Every fact CITES its ledger rows (`sourceRows`) — gauge-auditable; delete the
//     rows and the fact unlearns exactly what they fed.
//   • Every number is a DECLARED SEED (§15b) — provisional until FIT from the family's
//     real answer volume, never a felt/fitted constant, and none tuned DOWN by
//     judgment (§13); only a measurement re-grades one, locally.
//
// PURE REPLAY FOLD (§16c keystone): recomputed each run from the ledger, ZERO stored
// state, DETERMINISTIC — `now` comes from opts, the clock is never read here; no
// Math.random; output order is stabilised by sort. Write-free. A local artifact — no
// schema, no migration — until that gate.

const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const DAY = 86400000

// The three terminal feedback verbs (worker/src/confirmFeedback.js
// HEAL_FEEDBACK_ACTIONS) mapped to the trust outcomes this branch counts.
const OUTCOME_OF = { confirmed: 'confirm', corrected: 'correct', aside: 'skip' }
const OUTCOMES = ['confirm', 'correct', 'skip']
const QUESTION_CLASSES = new Set(['A', 'B', 'C', 'D'])

// SEED values (§15b) — each independently reasoned for THIS branch; none borrowed
// from a sibling, none felt, none may be lowered by judgment (§13).
export const META_DEFAULTS = {
  // Symmetric Dirichlet prior: pseudo-count on EACH of {confirm, correct, skip} for the
  // family (parent) rate. Keeps a one-answer rate a WHISPER (1 confirm → 2/4, never a
  // hard 100%) and never a hard 0. SYMMETRIC on purpose: the §16c failure-mode
  // asymmetry (up-weight failure-to-learn) belongs to O7's auto-apply BAR — it must not
  // be baked into the measurement, or the ledger would flatter trust before the family
  // earned it (that would be the §15b metric-hillclimb drift in a prior's costume).
  priorAlpha: 1,
  // Partial-pooling strength: the number of virtual answers of the FAMILY parent-rate a
  // per-trip child sits on before its OWN answers move it. A trip with far fewer than
  // this many answers of a class reads mostly as the family rate; it earns divergence
  // as its data supports it (§16c altitude 4). Its own reasoning, not the bench's floor.
  poolStrength: 4,
  // Confidence reaches half its ceiling at this many answers — a SMOOTH ramp, NOT a
  // "≥N = trusted" cutoff. One answer still speaks, faintly.
  confidenceHalfN: 6,
  // The CLAMP: confidence never exceeds this, no matter how many confirms. A class-trust
  // fact nudges O7 toward retiring a question, never asserts it — capped well below
  // certainty so eager learning can only ever cost a reversible soft heal (§16c
  // derived-tier spine). Below any observed witness's weight.
  confidenceCeiling: 0.6,
  // A class×context unanswered this long has its trust-currency halved. SHORTER than the
  // world model's place half-life (730d) and PEOPLE's habit half-life (1095d): a
  // hypothesis-class's trustworthiness is the most volatile of the three — the machine
  // itself changes under it (new witnesses, refit weights), so yesterday's confirm rate
  // ages faster than a recurring place. Its own reasoning; a seed, refit later.
  decayHalfLifeDays: 365,
}

// ---- pure helpers -----------------------------------------------------------
const zeroCounts = () => ({ confirm: 0, correct: 0, skip: 0 })
const totalOf = (c) => c.confirm + c.correct + c.skip
const laterOf = (a, b) => (Number.isFinite(b) ? (Number.isFinite(a) ? Math.max(a, b) : b) : a)

// Dirichlet / partial-pooling smoothing: pull raw outcome counts toward a prior mean
// (an outcome→rate map summing to 1) by `priorStrength` phantom observations. For the
// FAMILY parent priorMean is UNIFORM (1/3 each) so this is plain Laplace regularisation;
// for a per-TRIP child priorMean is the family's OWN smoothed rates and `priorStrength`
// is the pooling weight — the SAME smoothing, re-aimed at the parent (this IS the
// partial pool). Thin data ⇒ ~priorMean (a whisper on the parent); thick data ⇒ ~raw.
const smoothRates = (counts, priorStrength, priorMean) => {
  const total = totalOf(counts)
  const denom = total + priorStrength
  const rates = {}
  for (const o of OUTCOMES) rates[o] = denom > 0 ? (counts[o] + priorStrength * priorMean[o]) / denom : priorMean[o]
  return rates
}
const UNIFORM = { confirm: 1 / 3, correct: 1 / 3, skip: 1 / 3 }

// Confidence-from-count: how much this fact has EARNED from its OWN observation count,
// smoothly (recurrence-strength shape) — never a gate, so one answer still emits at low
// weight. Reaches half at `half`; asymptotes to 1 before the ceiling caps it.
const evidenceWeight = (n, half) => 1 - Math.pow(0.5, Math.max(0, n) / (half > 0 ? half : 1))
// Staleness multiplier. No usable date ⇒ 1 (we never invent staleness we can't measure).
const decayFactor = (lastMs, nowMs, halfDays) => {
  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs) || !(halfDays > 0)) return 1
  return clamp01(Math.pow(0.5, Math.max(0, nowMs - lastMs) / (halfDays * DAY)))
}

// Assemble one fact in the lattice's common shape, guards baked in. `ownN` is the
// context's OWN answer count (family total for a family fact; the trip's total for a
// per-trip fact) — confidence rides the context's own evidence, so a thin per-trip fact
// stays a whisper even while its VALUE is pooled toward the (better-evidenced) parent.
function makeFact(questionClass, context, rates, rawCounts, rowsSet, lastMs, ownN, o, nowMs) {
  const recencyDecay = decayFactor(lastMs, nowMs, o.decayHalfLifeDays)
  const confidence = clamp01(o.confidenceCeiling * evidenceWeight(ownN, o.confidenceHalfN) * recencyDecay)
  const key =
    context.scope === 'trip'
      ? `class-trust:${questionClass}:trip:${context.trip}`
      : `class-trust:${questionClass}:family`
  return {
    subject: { branch: 'meta', fact: 'class-trust', questionClass, context, key },
    // The TRUST headline O7 reads: the (pooled) confirm rate. A rate, honestly measured
    // — the clamp that stops it asserting lives in `confidence`, per the branch contract.
    value: clamp01(rates.confirm),
    // The full confirm/correct/skip breakdown (the branch's deliverable), pooled & summing
    // to ~1 — a `corrected`-heavy class reads its distrust in `rates.correct`, not silence.
    rates: { confirm: clamp01(rates.confirm), correct: clamp01(rates.correct), skip: clamp01(rates.skip) },
    confidence, // CLAMPED ≤ confidenceCeiling — a nudge, never an assertion
    recencyDecay,
    counts: { ...rawCounts, total: totalOf(rawCounts) }, // RAW observed, for the gauge
    sourceRows: [...rowsSet].sort(sortIds), // cite the ledger; deterministic order
  }
}

// Ids are D1 autoincrement integers, but a caller may pass strings — order numerically
// when both are numeric, else lexically. Stable either way.
const sortIds = (x, y) => {
  if (typeof x === 'number' && typeof y === 'number') return x - y
  return String(x).localeCompare(String(y))
}

// ---- the fold ---------------------------------------------------------------
// metaFacts(trips, memories, feedback, opts) => facts[]
//   trips, memories: accepted for the UNIFORM lattice fold signature (the Integrate phase
//                    composes every branch the same way); this branch reads NEITHER — the
//                    hypothesis-class trust ledger is a pure fold over the feedback rows.
//   feedback: [{ id, trip_id, action:'confirmed'|'corrected'|'aside', kind?:'A'|'B'|'C'|'D',
//               at }]  — the §W3 memory_heal_feedback rows (worker: listHealFeedbackForTrip).
//   opts:     { now?, ...META_DEFAULTS overrides }  — `now` is REQUIRED for decay (never
//                    read the clock); absent ⇒ recencyDecay is a neutral 1.
export function metaFacts(trips, memories, feedback, opts = {}) {
  const o = { ...META_DEFAULTS, ...opts }
  const now = Number.isFinite(o.now) ? o.now : null // deterministic: no Date.now fallback

  // Bucket every class-tagged feedback row: by class (the family parent), and within
  // each class by trip (the child context). A row with no valid A/B/C/D class carries no
  // hypothesis-class datum → skipped. A row with an unknown action → skipped.
  const byClass = new Map() // class -> { counts, rows:Set, lastMs, byTrip: Map(tripId -> {counts, rows, lastMs}) }
  for (const row of feedback || []) {
    const cls = row && row.kind
    if (!QUESTION_CLASSES.has(cls)) continue
    const outcome = OUTCOME_OF[row.action]
    if (!outcome) continue
    const id = row.id
    const at = Number.isFinite(row.at) ? row.at : null
    const trip = typeof row.trip_id === 'string' && row.trip_id ? row.trip_id : (row.trip_id != null ? String(row.trip_id) : null)

    if (!byClass.has(cls)) byClass.set(cls, { counts: zeroCounts(), rows: new Set(), lastMs: null, byTrip: new Map() })
    const c = byClass.get(cls)
    c.counts[outcome]++
    if (id != null) c.rows.add(id)
    c.lastMs = laterOf(c.lastMs, at)
    if (trip != null) {
      if (!c.byTrip.has(trip)) c.byTrip.set(trip, { counts: zeroCounts(), rows: new Set(), lastMs: null })
      const t = c.byTrip.get(trip)
      t.counts[outcome]++
      if (id != null) t.rows.add(id)
      t.lastMs = laterOf(t.lastMs, at)
    }
  }

  const facts = []
  const familyPriorStrength = 3 * o.priorAlpha // symmetric α on each of the 3 outcomes
  for (const cls of [...byClass.keys()].sort()) {
    const c = byClass.get(cls)
    const familyTotal = totalOf(c.counts)
    if (familyTotal <= 0) continue // absence abstains

    // The family parent: per-class trust across the whole family, Dirichlet-smoothed.
    const familyRates = smoothRates(c.counts, familyPriorStrength, UNIFORM)
    facts.push(makeFact(cls, { scope: 'family' }, familyRates, c.counts, c.rows, c.lastMs, familyTotal, o, now))

    // Per-trip children: pooled toward the family parent, earning divergence with their
    // own data. Confidence rides the trip's own count, so a one-answer trip is a whisper
    // whose value sits on the family rate — scale honesty, not a defect.
    for (const trip of [...c.byTrip.keys()].sort()) {
      const t = c.byTrip.get(trip)
      const tripTotal = totalOf(t.counts)
      if (tripTotal <= 0) continue
      const tripRates = smoothRates(t.counts, o.poolStrength, familyRates)
      facts.push(makeFact(cls, { scope: 'trip', trip }, tripRates, t.counts, t.rows, t.lastMs, tripTotal, o, now))
    }
  }

  // Deterministic output order, independent of input ordering.
  facts.sort((a, b) => sortIds(a.subject.key, b.subject.key))
  return facts
}

export default metaFacts
