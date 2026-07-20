// learn/classTrust.js — the LEARNING SPINE, altitude 6: HYPOTHESIS-CLASS TRUST →
// RETIREMENT (DESIGN_THE_HEALING_MODEL.md §16c, one altitude of six).
//
// §16c altitude 6: "per-class per-context confirm rates; a trusted class's future
// instances AUTO-APPLY SOFTLY instead of asking — the question kind retires for that
// context; the show mode whispers standing assumptions so retirement is never
// concealment." meta.js (the lattice META branch) already MEASURES the rates — per
// question-CLASS (A place / B name / C when / D grouping) × CONTEXT (family ← trip),
// Dirichlet-pooled, decaying, clamped, source-cited — and its own header pins that the
// bar/gate is deliberately NOT its job: "NO auto-apply logic, no bar, no gate lives in
// this file (that is O7's later band)." THIS file is that band.
//
// It BUILDS ON meta.js: it folds the same three ledgers, calls metaFacts for the measured
// trust, and adds the DECISION meta.js withheld —
//   • a GRADED, MOVING BAR the measured trust must clear to retire a class×context;
//   • the RETIREMENT signal (retired? how softly should it auto-apply?) as a projection-
//     side datum;
//   • the WHISPER of the standing assumption (present whenever retired) so retirement is
//     never concealment;
//   • UN-RETIREMENT on a later contradiction — reversible in BOTH directions.
//
// THE §16c ASYMMETRY, made mechanical (not promised — encoded): "slightly down-weight
// fabrication, up-weight failure-to-learn — an eager-but-soft generalization costs one
// reversible nudge; a failure to learn costs every future repeat."
//   • up-weight failure-to-learn ⇒ the resting bar LEANS toward retiring (a reliably-
//     confirmed class stops being asked as its evidence accrues; continuing to ask a
//     settled question is the expensive failure).
//   • slightly down-weight fabrication ⇒ the auto-apply is SOFT — derived-tier, clamped
//     well below certainty, and a single CONTRADICTION (a `corrected` answer) is
//     SURPRISE-WEIGHTED: it moves the bar far more than a confirm moves the score, so at
//     family scale a retired class un-retires on the first real correction (at extreme
//     confirm volumes it may take several — the bar pressure is GRADED and MOVING, never a
//     hard gate). Eager to retire, quick to reverse. This honesty spine (nothing asserts,
//     everything reverses) is what LICENSES the eager bar (§16c).
//
// Shaped like ITSELF, a DECISION on top of a measurement — not a second measurement. It
// re-derives NO rate (meta owns that); it adds only the bar + the retirement geometry.
// Its guards, baked in:
//   • NEVER asserts / never files / never a weight. The emitted nudge is `applyStrength`,
//     clamped ≤ `confidenceCeiling` (below meta's own 0.6 — a DECISION resting on a
//     measurement must be the quieter of the two), and it changes nothing: this module
//     returns derived-tier DATA the projection may consult. It crosses no lock.
//   • GRADED, MOVING BAR — never a hard gate. `retired` is a convenience readout of the
//     continuous `margin = retireScore − bar`; the ACTIONABLE output `applyStrength` ramps
//     SMOOTHLY up from 0 as the margin clears the bar, so a class barely over the bar
//     barely auto-applies. There is no "≥N answers ⇒ retire" step anywhere (that would be
//     the §13 muting drift in a gate's costume). One answer still emits a fact (a whisper),
//     it just cannot clear the bar on its own.
//   • ABSENCE ABSTAINS — a class×context with no feedback yields NO meta fact, hence no
//     retirement (never a "not trusted" negative vote). The empty ledger (today's prod
//     reality) folds to zero retirements.
//   • REVERSIBLE / PURE REPLAY — recomputed each run from the ledgers, zero stored state;
//     delete a correction row and the class re-retires, delete a confirm and the margin
//     falls — the fold unlearns exactly the rows removed. `now` comes from opts; the clock
//     is never read; no Math.random; output order is sorted.
//   • CITES its rows — carries meta's `sourceRows` (gauge-auditable), and names the
//     corrections that moved its bar.
//   • DECLARED SEEDS (§15b) — every constant is provisional, reported, never a fitted-and-
//     applied number; none is borrowed from meta/people (a shared threshold is the §13
//     heterogeneity sin). SETTLE_DEFAULTS is untouched; this file gates nothing.
//
// NOTE (altitude discipline): the feedback rows carry a per-decision `lean.hm.wit`
// (per-WITNESS contribution — healChallenger.js). That is altitude-3 ATTENTION data; it
// keys on witnesses, not question-classes, so this altitude does not read it. Class-trust
// keys on the question CLASS × context and consumes meta's class rates only.

import metaFacts from '../lattice/meta.js'

const DAY = 86400000
const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)

// SEED values (§15b) — each independently reasoned for THIS altitude; none borrowed from
// a sibling branch, none felt, none may be lowered by judgment (§13). Provisional until
// fit from the family's real answer volume.
export const CLASS_TRUST_DEFAULTS = {
  // The CLAMP on the emitted nudge. A retirement auto-applies SOFTLY; even a rock-solid
  // one is capped here — and DELIBERATELY below meta's confidenceCeiling (0.6): a decision
  // that RETIRES a question is downstream of the trust it rests on, so it must whisper
  // more quietly than the measurement. This is the derived-tier spine that lets the bar
  // lean eager (§16c): the worst an over-eager retirement can do is a soft, reversible heal.
  confidenceCeiling: 0.5,
  // The RESTING bar the (evidence-weighted) trust must clear to retire a class×context.
  // Set to LEAN toward retiring — up-weighting failure-to-learn: a class the family keeps
  // confirming, once its evidence has accrued, crosses it and stops being asked. Low
  // enough to retire a settled question, high enough that a thin or contested class cannot.
  // Its own reasoning; a seed, refit later — never tuned to hit a harness number (§15b).
  baseBar: 0.4,
  // Answers at which the earned-evidence weight reaches half — a SMOOTH 0→1 ramp, NOT a
  // cutoff, so one answer still whispers and none is a gate. Governs both `retireScore`'s
  // readiness and the nudge's `confidence`. Its own value (not meta's confidenceHalfN=6):
  // a downstream decision becomes actionable a touch sooner than the measurement saturates.
  readyHalfN: 5,
  // How much a SINGLE fresh contradiction (a `corrected` answer) raises the moving bar.
  // Chosen so one fresh correction (pressure ~1) lifts the bar by ~0.25 — several times
  // more than a confirm lifts the score — which IS the §16c surprise weighting: a
  // contradiction teaches more than an agreement. A fresh correction can push the bar
  // above any reachable score, forcing un-retirement; multiple fresh corrections stack.
  barPressurePerCorrection: 0.25,
  // Half-life of a correction's BAR-pressure. Deliberately SHORTER than meta's 365-day
  // trust decay: the un-retirement reflex should relax faster than the measured trust
  // fades, so a class can RE-retire within a season of clean confirming after an OLD
  // correction (while that correction still leaves a permanent dent in meta's rate). This
  // is what makes reversal work in BOTH directions. Its own reasoning; a seed.
  contradictionHalfLifeDays: 120,
  // The margin at which the soft auto-apply reaches half its clamped strength — the ramp
  // that keeps the actionable output GRADED across the bar (no snap-to-full at margin 0).
  marginHalf: 0.1,
}

const QUESTION_CLASSES = new Set(['A', 'B', 'C', 'D'])

// ---- pure helpers -----------------------------------------------------------
// Earned-evidence weight: how much a fact has earned from its own answer count, smoothly
// (mirrors meta's shape) — never a gate, so a single answer still emits at low weight.
const evidenceWeight = (n, half) => 1 - Math.pow(0.5, Math.max(0, n) / (half > 0 ? half : 1))
// Time-decay multiplier. No usable date ⇒ 1 (we never invent staleness we can't measure —
// so an undated correction stays full-pressure: the conservative, don't-retire direction).
const decayFactor = (atMs, nowMs, halfDays) => {
  if (!Number.isFinite(atMs) || !Number.isFinite(nowMs) || !(halfDays > 0)) return 1
  return clamp01(Math.pow(0.5, Math.max(0, nowMs - atMs) / (halfDays * DAY)))
}
// Smooth 0→1 ramp of the auto-apply strength as the margin clears the bar. Zero at or
// below the bar (a class that isn't retired auto-applies nothing); rises smoothly above —
// so crossing the bar is graded, never a hard step (§16c "graded and moving, never hard").
const applyRamp = (margin, half) => (margin > 0 ? clamp01(1 - Math.pow(0.5, margin / (half > 0 ? half : 1))) : 0)

const normTrip = (v) =>
  typeof v === 'string' && v ? v : v != null && v !== '' ? String(v) : null

// Index the CONTRADICTIONS (only `corrected` answers) the moving bar reads, scoped exactly
// as meta scopes its facts: per class, all corrections (the family parent) and per trip
// (the child). meta measures RATES symmetrically; the bar is this altitude's own job, so
// computing it from the rows here duplicates no measurement — it adds the recency-weighted
// resistance meta deliberately omits. Each entry keeps the correction TIMES (for decayed
// pressure + a "last correction" marker) and their row ids (to cite what moved the bar).
function correctionIndex(feedback) {
  const idx = new Map() // class -> { all:[{at,id}], byTrip: Map(trip -> [{at,id}]) }
  for (const row of feedback || []) {
    if (!row || row.action !== 'corrected') continue
    const cls = row.kind
    if (!QUESTION_CLASSES.has(cls)) continue
    const at = Number.isFinite(row.at) ? row.at : null
    const id = row.id ?? null
    const trip = normTrip(row.trip_id)
    if (!idx.has(cls)) idx.set(cls, { all: [], byTrip: new Map() })
    const e = idx.get(cls)
    e.all.push({ at, id })
    if (trip != null) {
      if (!e.byTrip.has(trip)) e.byTrip.set(trip, [])
      e.byTrip.get(trip).push({ at, id })
    }
  }
  return idx
}

// Fold a scope's corrections into the bar's moving pressure: Σ decayed contribution. A
// fresh correction contributes ~1 (→ ~barPressurePerCorrection on the bar); an old one
// fades toward 0. Also returns the count, the most-recent correction time, and the cited
// ids — the gauge's "why the bar is where it is."
function contradictionPressure(list, nowMs, halfDays) {
  let pressure = 0
  let lastAt = null
  const rows = []
  for (const { at, id } of list || []) {
    pressure += decayFactor(at, nowMs, halfDays)
    if (Number.isFinite(at)) lastAt = lastAt == null ? at : Math.max(lastAt, at)
    if (id != null) rows.push(id)
  }
  return { pressure, corrections: (list || []).length, lastAt, rows }
}

const sortIds = (x, y) => {
  if (typeof x === 'number' && typeof y === 'number') return x - y
  return String(x).localeCompare(String(y))
}

// ---- the fold ---------------------------------------------------------------
// classTrust(trips, memories, feedback, opts) => retirements[]
//   trips, memories: accepted for the uniform lattice/spine fold signature; this altitude
//                    reads NEITHER directly — it consumes meta's fold (which reads them for
//                    the same reason) plus the feedback rows for the bar.
//   feedback: the §W3 memory_heal_feedback rows — { id, trip_id, action, kind, at, ... }
//             (worker: listHealFeedbackForTrip). The bar reads `corrected` rows only.
//   opts:     { now?, meta?, ...CLASS_TRUST_DEFAULTS overrides }
//             - now: the deterministic clock (ms). Threaded to meta AND to the bar's decay;
//                    absent ⇒ neutral decay everywhere (never read the clock).
//             - meta: optional seed overrides forwarded to metaFacts (heterogeneity: my
//                    seeds never re-seed meta, and its seeds never re-seed me).
// Returns one derived-tier retirement per class×context meta produced a fact for (i.e. per
// class×context answered ≥ once); absence abstains. Sorted, deterministic.
export function classTrust(trips, memories, feedback, opts = {}) {
  const o = { ...CLASS_TRUST_DEFAULTS, ...opts }
  const now = Number.isFinite(o.now) ? o.now : null // deterministic: no Date.now fallback

  // meta owns the MEASUREMENT: per class×context pooled confirm/correct/skip rates, the
  // clamped confidence, the decay, the cited rows. We consume it; we never re-derive it.
  const facts = metaFacts(trips, memories, feedback, { now, ...(opts.meta && typeof opts.meta === 'object' ? opts.meta : {}) })
  const corr = correctionIndex(feedback)

  const out = []
  for (const fact of facts) {
    const { questionClass, context } = fact.subject
    const total = fact.counts?.total || 0
    const recencyDecay = Number.isFinite(fact.recencyDecay) ? fact.recencyDecay : 1

    // TRUST = meta's pooled confirm rate (honest, symmetric). READINESS = how much this
    // context's OWN evidence has earned, smoothly, faded by staleness — one answer whispers.
    // The retire SCORE is their product: graded in [0,1], rising with confirmations and
    // evidence, and a per-trip fact stays a whisper (low readiness on its own count) even
    // while its trust is pooled toward the family parent — scale honesty (§16c altitude 4).
    const trust = clamp01(fact.value)
    const readiness = clamp01(evidenceWeight(total, o.readyHalfN) * recencyDecay)
    const retireScore = clamp01(trust * readiness)

    // The MOVING BAR: resting bar + surprise-weighted, recency-decayed contradiction
    // pressure scoped to THIS class×context. A fresh correction lifts the bar sharply
    // (un-retirement); as it ages the lift relaxes and the class can re-retire — reversal
    // in both directions, purely from the rows. (The correction also permanently lowers
    // meta's rate, so `trust` keeps a lasting dent even after the bar-pressure has faded.)
    const scope =
      context.scope === 'trip'
        ? corr.get(questionClass)?.byTrip.get(context.trip) || []
        : corr.get(questionClass)?.all || []
    const cp = contradictionPressure(scope, now, o.contradictionHalfLifeDays)
    const bar = clamp01(o.baseBar + o.barPressurePerCorrection * cp.pressure)

    const margin = retireScore - bar
    const retired = margin > 0

    // The emitted NUDGE — derived-tier, CLAMPED, and GRADED across the bar: confidence is
    // capped ≤ ceiling (a nudge, never an assertion); the ramp keeps the auto-apply soft
    // right at the bar and only firmer well over it. Not retired ⇒ 0 (we still ASK).
    const confidence = clamp01(o.confidenceCeiling * evidenceWeight(total, o.readyHalfN) * recencyDecay)
    const applyStrength = retired ? clamp01(confidence * applyRamp(margin, o.marginHalf)) : 0

    // Cite meta's rows AND the corrections that moved the bar (deterministic order).
    const sourceRows = [...new Set([...(fact.sourceRows || []), ...cp.rows])].sort(sortIds)

    const key =
      context.scope === 'trip'
        ? `class-trust-retirement:${questionClass}:trip:${context.trip}`
        : `class-trust-retirement:${questionClass}:family`

    out.push({
      subject: { branch: 'learn', altitude: 6, fact: 'class-trust-retirement', questionClass, context, key },
      // The projection-side RETIREMENT SIGNAL.
      retired, // convenience readout; `margin`/`applyStrength` are the graded truth
      applyStrength, // derived-tier soft auto-apply weight ∈ [0, confidenceCeiling]; 0 while asking
      margin, // retireScore − bar: the continuous signal (never a hard gate)
      retireScore,
      bar, // the MOVING bar (rises with recent contradictions)
      trust, // meta's measured pooled confirm rate — the headline this rests on
      confidence, // CLAMPED ≤ confidenceCeiling — a nudge, never an assertion
      recencyDecay,
      // Why the bar is where it is (gauge): the recency-weighted contradiction load.
      contradiction: { corrections: cp.corrections, pressure: cp.pressure, lastAt: cp.lastAt },
      counts: { ...fact.counts }, // raw observed, from meta
      // The WHISPER of the standing assumption — present WHENEVER retired, so the show mode
      // can surface "we've been getting this kind right, so we'll assume it (tap to review)".
      // Retirement is NEVER concealment (§16c): a retired question always carries its whisper.
      whisper: retired
        ? {
            questionClass,
            context,
            standingAssumption: 'auto-apply-machine-guess',
            trust, // the measured confirm rate behind the assumption
            strength: applyStrength, // how softly it auto-applies
            reviewable: true, // always reversible — a single correction un-retires it
            sourceRows,
          }
        : null,
      sourceRows, // cite the ledger; deterministic order
    })
  }

  out.sort((a, b) => sortIds(a.subject.key, b.subject.key))
  return out
}

// Projection-side SELECTOR (pure): the retirement for a given question CLASS × context, or
// null. `context` is { scope:'family' } or { scope:'trip', trip }. The show mode consults
// this to decide whether to auto-apply softly (and render the whisper) vs ask.
export function retirementFor(retirements, questionClass, context = { scope: 'family' }) {
  const wantTrip = context && context.scope === 'trip' ? normTrip(context.trip) : null
  for (const r of retirements || []) {
    const c = r?.subject?.context
    if (r?.subject?.questionClass !== questionClass || !c) continue
    if (context.scope === 'trip') {
      if (c.scope === 'trip' && normTrip(c.trip) === wantTrip) return r
    } else if (c.scope === 'family') {
      return r
    }
  }
  return null
}

export default classTrust
