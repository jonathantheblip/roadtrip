// learn/schema.js — SCHEMA (altitude 5 of the LEARNING SPINE, DESIGN_THE_HEALING_MODEL.md
// §16c): kind-shaped GESTALT INDUCTION. This altitude turns an ANSWER into a durable,
// whisper-strength HYPOTHESIS in the lattice's fact shape — a generalization that outlives
// the one moment it came from, so the same KIND of question need not be asked again:
//
//   • a STRUCTURE answer (kind D, "were you split up?") → a rhythm-SPLIT hypothesis
//     (postable to the RHYTHMS branch: this family's days have grouping structure);
//   • a CHRISTENING (a name the world didn't hold — a kind-B name answer, or ANY correction
//     that names a place off every list) → a PLACE hypothesis (postable to PLACES: an entity
//     the family calls X exists — §17's closed-world "somewhere else?" made durable);
//   • a CALIBRATION (kind C, "when") → a device/PATTERN hypothesis (postable to DEVICES: the
//     TIME channel the machine leaned on for this moment ran wrong / held — one answer is a
//     pattern about a channel, not a fact about a photo).
//
// This is NOT what the lattice branches learn PASSIVELY from filings (places.js learns a
// place's character from filed photos; rhythms.js learns splitting from physically-parallel
// photos). SCHEMA is the ANSWER→hypothesis induction SPECIFICALLY — it reads the human
// feedback ledger (the S1 confirm surface's terminal answers) and nothing else, and it emits
// a NEW, distinctly-subjected fact the lattice branch does not already produce (so it is
// POSTABLE alongside, never a duplicate). Kind A (place-CONFIRM / picking) induces no schema
// here: that is altitude 1 (the instance/filing), which PLACES already learns from the move —
// so SCHEMA abstains on it, except a kind-A CORRECTION that names a new place, which is a
// christening by content, not by class.
//
// THE CONTRACT (every altitude of the spine):
//   1. PURE REPLAY FOLD over the feedback ledger. NO stored state; recomputed each run.
//      DETERMINISTIC — `now` comes from opts, the clock is NEVER read here; no Math.random;
//      output order stabilised by sort. Write-free.
//   2. DERIVED-TIER by construction. Confidence is CLAMPED at `confidenceCeiling`, well below
//      certainty AND below every lattice branch's own ceiling this posts into (rhythms 0.45,
//      places' character 0.4, devices' device 0.4) — an answer-INDUCED generalization is a
//      priori softer than the same branch's FILING-grounded fact, so it can only whisper. It
//      NEVER changes a witness weight, NEVER touches SETTLE_DEFAULTS, NEVER files a photo,
//      NEVER crosses a lock. It CITES its feedback rows (gauge-auditable). This honesty spine
//      is what LICENSES eager induction (§16c).
//   3. THE ASYMMETRY, STRUCTURAL (§16c / §13): a CONTRADICTION (the family CORRECTED the
//      machine) teaches MORE than an AGREEMENT — `correctWeight` > `confirmWeight`, encoded in
//      the shape, not felt. A missed lesson (failure-to-learn) costs every future repeat of
//      the question; an eager-but-soft, clamped generalization costs one reversible nudge. The
//      order is the lesson and is not tunable DOWN by judgment.
//   4. SCALE HONESTY (§16c altitude 4): recurrence-HARDENED — strength grows SMOOTHLY with the
//      family's own attested evidence (1 − 0.5^(w/half)), NEVER a cutoff. One answer already
//      whispers; repeated attestations of the SAME hypothesis sharpen it. At ~4 trips most of
//      these are whispers — correct, not a defect.
//   5. ABSENCE ABSTAINS (§13, imperfection is the medium). An `aside` (the family declined to
//      engage the schema) is silence, not a negative vote — it induces NOTHING. An empty
//      ledger folds to ZERO facts. A thin-but-real answer is NEVER muted: every engaged answer
//      seen ≥ once emits a hypothesis, and the confidence carries how thin it is. Parking or
//      hard-thresholding a channel of answers IS the pinned §13 drift — forbidden.
//   6. DECAY. An induced schema is behavioural and drifts; a christening / split / calibration
//      the family has moved past loses its voice rather than dragging new photos to an old
//      habit. Half-life is this altitude's OWN declared seed.
//
// SEEDS are DECLARED (§15b), never fitted-and-applied here: measurements are INSTRUMENTS, not
// gates — this module adds STRUCTURE, changes no measured constant, and none of its constants
// is shared with a sibling branch (a shared threshold would be the §13 heterogeneity sin). A
// later HM-5-style ablation re-grades a seed; temperament never does, and none may be lowered
// by judgment. Output is postable to the Band-1 lattice branches but NOT auto-posted (that is
// the Integrate phase + Jonathan's activation gate); this altitude is INERT.

const DAY = 86400000
const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const round3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x)
const cleanStr = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const normName = (s) => (typeof s === 'string' ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '')

// Mirror of confirmFeedback.js's isFilableStop (separate deployable — never imported across
// the boundary, the house rule). A REAL stop id only; a synthetic vision/discovered id is a
// LABEL that records feedback but names NO existing stop — so a correction carrying one is a
// CHRISTENING (a new entity), exactly as the write path treats it.
const isFilableStop = (id) =>
  typeof id === 'string' && !!id && !id.startsWith('__vision__') && !id.startsWith('__discovered__')

// Compact tier ranks — mirror healChallenger.js (o = observed, d = derived, p = prior). Used
// only to break a grade tie when reading hm.wit to name the leaned channel; a stronger tier
// wins a tie, never overrides a higher grade.
const TIER_RANK = { o: 3, d: 2, p: 1 }

// The four question CLASSES the S1 confirm surface asks (worker meta.js / people.js settled
// mapping): A place-confirm · B name · C when · D grouping. SCHEMA maps three of them; A
// (picking) is altitude 1, learned by PLACES from the filing — not induced here.
const KIND_NAME = 'B' // christening (a name)
const KIND_WHEN = 'C' // calibration (a pattern in time)
const KIND_GROUPING = 'D' // structure (split / merge)

// SEED values (§15b) — declared, independently reasoned for THIS altitude, none shared, none
// felt, and NONE may be lowered by judgment (§13); only a measurement re-grades one.
export const SCHEMA_DEFAULTS = {
  // CLAMP — the softest tier in the spine. An answer-INDUCED generalization is capped below
  // certainty AND below every branch ceiling it might post into (rhythms 0.45, places'
  // character 0.4, devices' device 0.4), so a filing-grounded fact in the target branch always
  // out-speaks a hypothesis merely induced from an answer. Its own reasoning; a seed.
  confidenceCeiling: 0.35,
  // The ASYMMETRY (§16c #3 / §13), encoded as weights, not felt: a CONTRADICTION is a
  // failure-to-learn signal and teaches MORE; an AGREEMENT is real but weaker evidence of the
  // schema. correctWeight > confirmWeight IS the lesson; the ORDER is not tunable down. An
  // `aside` carries NO weight — declining to engage the schema is silence (§13 absence).
  correctWeight: 1.0,
  confirmWeight: 0.5,
  // Recurrence-hardening: the summed attested weight at which strength reaches ~0.5 — a SMOOTH
  // saturating ramp (1 − 0.5^(w/half)), NEVER a cutoff. One answer already whispers; repeats
  // of the SAME hypothesis sharpen it (recurrence-hardened, §16c altitude 5).
  evidenceHalf: 2,
  // DECAY — an induced schema drifts; a pattern the family has moved past fades. Shorter than
  // a place's recurrence half-life: an ANSWER is one moment in time, not a standing footprint.
  decayHalfLifeDays: 730,
  // Emit floor — a hypothesis whose clamped confidence is pure noise isn't worth emitting. An
  // emit floor ONLY, never a decision cutoff (§13: the branch that consumes decides, not this).
  minConfidence: 0.02,
}

// ---- graded shapes (soft, never cutoffs) ------------------------------------
// Smooth saturating growth in the family's own attested evidence — seen-once still whispers.
const saturating = (w, half) => 1 - Math.pow(0.5, Math.max(0, w) / (half > 0 ? half : 1))
// A hypothesis's voice fades with time since it was last attested. No usable date ⇒ 1 (we
// never INVENT staleness we can't measure, §13).
const decayFactor = (lastMs, nowMs, halfDays) => {
  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs) || !(halfDays > 0)) return 1
  return clamp01(Math.pow(0.5, Math.max(0, nowMs - lastMs) / (halfDays * DAY)))
}

// ---- defensive ledger accessors (thread the real feedback-row shape) --------
// listHealFeedbackForTrip rows (snake_case) OR the client body shape — read both.
const rowAction = (f) => (typeof f?.action === 'string' ? f.action : null)
const rowKind = (f) => (typeof f?.kind === 'string' ? f.kind : null)
const rowAt = (f) => (Number.isFinite(f?.at) ? f.at : null)
const rowGuessedName = (f) => cleanStr(f?.guessed_place_name ?? f?.guessedPlaceName)
const rowGuessedId = (f) => cleanStr(f?.guessed_place_id ?? f?.guessedPlaceId)
const rowCorrectedName = (f) => cleanStr(f?.corrected_place_name ?? f?.correctedPlaceName)
const rowCorrectedId = (f) => cleanStr(f?.corrected_place_id ?? f?.correctedPlaceId)
// A citable id — a row that can't be cited can't teach (gauge-auditability is load-bearing at
// THIS altitude: the whole point is answer→hypothesis provenance, so confidence must be
// EXACTLY explained by sourceRows). An uncited row is dropped, never counted un-auditably.
const rowId = (f) => (f?.id != null ? String(f.id) : null)

// The channel the machine LEANED on for this moment, read from the ask-time challenger snapshot
// (lean.hm.wit = { <witness>: { n, g, t } }, healChallenger.summarizeReads). The dominant
// witness = highest mean lean-credit g, a stronger tier breaking a tie, the name breaking THAT
// (deterministic). null when no challenger read was captured (engine 'v1' → hm null) — the
// calibration then keys on the class ('when') itself, still a real pattern.
function dominantChannel(f) {
  const wit = f?.lean?.hm?.wit
  if (!wit || typeof wit !== 'object') return null
  let best = null
  let bestG = -Infinity
  let bestT = -1
  for (const name of Object.keys(wit).sort()) {
    const c = wit[name]
    if (!c) continue
    const g = Number.isFinite(c.g) ? c.g : 0
    const t = TIER_RANK[c.t] || 0
    if (g > bestG || (g === bestG && t > bestT)) {
      best = name
      bestG = g
      bestT = t
    }
  }
  return best
}

// ---- the fold ---------------------------------------------------------------
// schemaFacts(feedback, opts) => hypotheses[]
//   feedback: the §W3 memory_heal_feedback rows (worker: listHealFeedbackForTrip), each
//     { id, action:'confirmed'|'corrected'|'aside', kind?:'A'|'B'|'C'|'D',
//       guessed_place_id?/name?, corrected_place_id?/name?, at?,
//       lean?:{ engine, classId, action, guessed, hm:{ ..., wit:{<witness>:{n,g,t}} } } }.
//     May be empty (today's prod reality — the confirm mode has never been on) ⇒ ZERO facts.
//   opts: { now?, ...SCHEMA_DEFAULTS overrides }. `now` is REQUIRED for decay; absent ⇒ a
//     neutral recencyDecay of 1 (facts stand, never silently zeroed).
// Returns lattice-shaped derived facts — { type, subject, postTo, value, confidence,
// recencyDecay, sourceRows } — POSTABLE to the Band-1 branch named by `postTo`, sorted by
// subject for determinism. Never auto-posted (that is activation, Jonathan's gate).
export function schemaFacts(feedback, opts = {}) {
  const o = { ...SCHEMA_DEFAULTS, ...opts }
  const now = Number.isFinite(opts.now) ? opts.now : NaN // deterministic: no Date.now fallback

  // One accumulator per induced hypothesis (keyed by its subject). Each gathers the summed
  // attested weight (recurrence-hardening), the raw confirm/correct tallies (the gauge's
  // breakdown), its cited feedback rows, and the latest attestation instant (decay).
  const hyp = new Map() // subject -> { type, postTo, value, weight, confirmations, corrections, rows:Set, lastMs }
  const bump = (subject, type, postTo, seedValue, weight, isCorrection, id, at) => {
    if (!(weight > 0)) return // an aside (no weight) never induces — absence abstains (§13)
    if (!hyp.has(subject)) hyp.set(subject, { type, postTo, value: seedValue, weight: 0, confirmations: 0, corrections: 0, rows: new Set(), lastMs: null })
    const h = hyp.get(subject)
    h.weight += weight
    if (isCorrection) h.corrections += 1
    else h.confirmations += 1
    if (id != null) h.rows.add(id) // cite; confidence is counted from cited weight only (below)
    if (Number.isFinite(at)) h.lastMs = h.lastMs == null ? at : Math.max(h.lastMs, at)
  }

  for (const f of feedback || []) {
    if (!f || typeof f !== 'object') continue
    const action = rowAction(f)
    if (action !== 'confirmed' && action !== 'corrected') continue // 'aside' & unknowns abstain
    const id = rowId(f)
    if (id == null) continue // uncitable ⇒ can't teach auditably (see rowId)
    const at = rowAt(f)
    const kind = rowKind(f)
    const isCorrection = action === 'corrected'
    const weight = isCorrection ? o.correctWeight : o.confirmWeight

    // === CHRISTENING → a PLACE hypothesis =====================================
    // A name the world model did NOT already hold as a real stop. A CORRECTION naming a place
    // off every list (a non-filable / absent id + a name) is the §17 closed-world christening,
    // regardless of the question's class. A kind-B name CONFIRM whose guess was the machine's
    // OWN christening candidate (a synthetic, non-filable id) affirms that new name — a weaker
    // attestation of the same entity. A picking-confirm to a REAL stop (filable id) is NOT a
    // christening — that entity already exists and PLACES already learns it from the filing.
    if (isCorrection && rowCorrectedName(f) && !isFilableStop(rowCorrectedId(f))) {
      const name = rowCorrectedName(f)
      bump(`place:christened:${normName(name)}`, 'christening', 'places', { name }, weight, true, id, at)
    } else if (!isCorrection && kind === KIND_NAME && rowGuessedName(f) && !isFilableStop(rowGuessedId(f))) {
      const name = rowGuessedName(f)
      bump(`place:christened:${normName(name)}`, 'christening', 'places', { name }, weight, false, id, at)
    }

    // === STRUCTURE → a rhythm-SPLIT hypothesis ================================
    // A kind-D (grouping) answer engages the family's split/merge schema. A CORRECTION (they
    // RESTRUCTURED the machine's grouping) is strong split-schema evidence; a CONFIRM (the
    // grouping held) is weaker. One family-level splitting-propensity prior, recurrence-hardened
    // — a DISTINCT subject from rhythms.js's filing-observed `rhythm:splits`, so it is postable
    // alongside, never a duplicate.
    if (kind === KIND_GROUPING) {
      bump('rhythm:split', 'split', 'rhythms', {}, weight, isCorrection, id, at)
    }

    // === CALIBRATION → a device/PATTERN hypothesis ============================
    // A kind-C ("when") answer calibrates the TIME channel: a CORRECTION says the machine
    // misread the moment's time (a failure-to-learn about a channel, up-weighted); a CONFIRM
    // affirms it. The channel is named from the ask-time challenger lean (hm.wit's dominant
    // witness) so repeated corrections against the SAME leaned channel harden a per-channel
    // pattern — "calibrations post patterns". No lean captured ⇒ key on the class itself. This
    // is derived-tier: it NEVER re-weights the witness — §13 forbids demoting a channel; the
    // hypothesis only WHISPERS that a channel has drifted, for a later reader to weigh softly.
    if (kind === KIND_WHEN) {
      const channel = dominantChannel(f) || 'when'
      bump(`pattern:calibration:${channel}`, 'calibration', 'devices', { channel }, weight, isCorrection, id, at)
    }
  }

  const facts = []
  for (const [subject, h] of hyp) {
    // Confidence is counted from CITED weight only — but bump already gated on a citable id, so
    // h.weight is exactly the summed weight of h.rows. recurrence-hardened × decayed × clamped.
    const strength = saturating(h.weight, o.evidenceHalf)
    const recencyDecay = decayFactor(h.lastMs, now, o.decayHalfLifeDays)
    const confidence = clamp01(o.confidenceCeiling * strength * recencyDecay)
    if (confidence < o.minConfidence) continue // emit floor only, not a decision cutoff
    facts.push({
      type: h.type,
      subject,
      postTo: h.postTo, // the Band-1 lattice branch this hypothesis is POSTABLE to (never auto-posted)
      value: { ...h.value, confirmations: h.confirmations, corrections: h.corrections, evidence: round3(h.weight) },
      confidence, // CLAMPED ≤ confidenceCeiling (< 1) — a nudge, never an assertion or a file
      recencyDecay,
      sourceRows: [...h.rows].sort(), // cite the ledger; delete a row and the lesson unlearns
    })
  }
  facts.sort((a, b) => (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0))
  return facts
}

export default schemaFacts
