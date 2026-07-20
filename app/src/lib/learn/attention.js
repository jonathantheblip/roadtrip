// learn/attention.js — ATTENTION (altitude 3 of the LEARNING SPINE, DESIGN_THE_HEALING_MODEL.md
// §16c): ERROR-DRIVEN, SURPRISE-WEIGHTED per-witness credit vs the machine's own lean.
// Rescorla-Wagner / ALCOVE-shaped. For each ANSWERED moment it compares the family's answer
// (the S1 confirm surface's terminal verb + any corrected place) to the ask-time challenger
// lean captured on the feedback row (lean.hm.wit + lean.hm.top), and asks, per witness: did the
// voice that BACKED the machine's guess back the TRUTH the family revealed, or the wrong guess?
//
//   • RESPONSIBILITY is the witness's own backing of the lean (hm.wit[w].g — its mean
//     lean-credit toward the challenger's top place, healChallenger.summarizeReads). A voice
//     that spoke about a NON-lean place (g = 0) has no responsibility for this guess and is
//     ABSTAINED from — never scored for a bet it didn't place (the wit map cannot say which
//     other place a dissenter backed, so crediting its dissent would be inventing evidence,
//     §13). This is the ALCOVE attention: credit lands on the dimensions that drove the guess.
//   • OUTCOME is whether the challenger's guess (hm.top) IS the truth the family revealed —
//     confirmed ⇒ truth is the served guess; a correction to a REAL stop ⇒ truth is that stop;
//     otherwise the truth id is unknown and the moment ABSTAINS from grading (never guessed at).
//     So a moment where v1 was CORRECTED but the challenger's top was the corrected place scores
//     the challenger RIGHT — the HM voices that backed it earned credit even as v1 lost.
//   • SURPRISE is the Rescorla-Wagner prediction error |outcome − p̂|, where p̂ is the machine's
//     OWN confidence in its top pick (hm.m). A CONTRADICTION teaches MOST: a confident guess
//     (high p̂) borne WRONG is maximally surprising (|0 − p̂| large) → the voices that backed it
//     absorb the largest penalty. Calibration is SYMMETRIC (§13): a DIFFIDENT guess (low p̂)
//     borne RIGHT is just as surprising (|1 − p̂| large) → a real-but-under-trusted voice earns
//     a large reward. The divergence datum is NEVER discarded — it is the highest-taught event.
//
// This is an INSTRUMENT (§15b), not a gate. It emits a per-witness × per-CONTEXT RELIABILITY
// read for Jonathan's HOLISTIC judgment (and, one day, a supervised refit) — it NEVER
// autonomously re-weights a witness, NEVER touches SETTLE_DEFAULTS, files no photo, crosses no
// lock. It also folds altitude 4 CONTEXT: reliability lands in a PARTIAL-POOLING hierarchy
// (global ← trip-shape ← … ← trip; and person as the stated leaf), each node earning divergence
// from its PARENT only as its own data supports (empirical-Bayes shrink). The stated middle
// layers (trip-shape, place-kind) need a classifier this fold deliberately AVOIDS — as
// worker meta.js does, substituting the ledger-native trip and letting the shape layer LIGHT UP
// the moment an opts.shapeOf classifier arrives (§14, channels join as they come online). Until
// then trip nests directly under global — honest, not fabricated.
//
// It also reports the FAILURE-TO-LEARN TAX (§16c): an ask the machine already had RIGHT (a
// confirmed guess the challenger would have auto-applied) is a COST — the question asked when it
// need not have. Corrections are NOT taxed: those asks caught a real error and earned their
// friction. The tax is the asymmetry's readout — up-weight failure-to-learn — surfaced for
// judgment, NOT baked into the reliability measurement (baking it in would flatter trust before
// the family earned it — the §15b metric-hillclimb drift in a prior's costume; see worker meta.js).
//
// THE CONTRACT (every altitude of the spine):
//   1. PURE REPLAY FOLD over the feedback ledger. NO stored state; recomputed each run.
//      DETERMINISTIC — `now` comes from opts, the clock is NEVER read here; no Math.random;
//      output order stabilised by sort; accumulation is order-independent. Write-free.
//   2. DERIVED-TIER by construction. Confidence is CLAMPED at `confidenceCeiling`, well below
//      certainty AND below every OBSERVED witness's weight (currentFiling 0.7, humanConfirm
//      0.95) — a learned reliability can only whisper, never out-vote a live read. The value is
//      a reliability in [0,1]; the fact CITES its feedback rows (gauge-auditable). This honesty
//      spine is what LICENSES eager learning (§16c).
//   3. THE ASYMMETRY, STRUCTURAL (§16c / §13). A CONTRADICTION teaches more (surprise-weighted,
//      above); failure-to-learn is surfaced as a reported tax. Neither is a felt constant lowered
//      by judgment — the surprise ORDER is intrinsic to the prediction error, not a knob.
//   4. SCALE HONESTY (§16c altitude 4). Partial pooling: a thin per-context reliability SHRINKS
//      to its parent and earns divergence only as its own evidence piles up. At ~4 trips most
//      per-context reads are whispers sitting on their parent — correct, not a defect.
//   5. ABSENCE ABSTAINS (§13, imperfection is the medium). An `aside` (truth unknown) and any
//      moment with no captured lean induce NOTHING — silence, never a negative vote. A witness
//      that never backed a guess yields no fact. The empty ledger folds to ZERO facts. A
//      thin-but-real backing is NEVER muted: a voice seen once still emits, its confidence
//      carrying how thin it is. Parking or hard-thresholding a channel IS the pinned §13 drift.
//   6. DECAY. Reliability under the CURRENT machine drifts as the machine is refit; a stale read
//      fades. This altitude's OWN declared seed half-life — the most volatile of the spine.
//
// SEEDS are DECLARED (§15b), never fitted-and-applied here; none shared with a sibling (a shared
// threshold is the §13 heterogeneity sin); NONE may be lowered by judgment — only a measurement
// re-grades one. INERT: nothing is wired into the live settle; the Integrate phase + Jonathan's
// activation gate own consumption.

const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const round2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : x)
const DAY = 86400000

// SEED values (§15b) — declared, independently reasoned for THIS altitude, none shared, none
// felt, and NONE may be lowered by judgment (§13); only a measurement re-grades one.
export const ATTENTION_DEFAULTS = {
  // CLAMP — reliability is a per-witness NUDGE for Jonathan's judgment; capped well below any
  // observed witness's weight (currentFiling 0.7, humanConfirm 0.95) so a learned reliability
  // can never out-vote a real read of where a photo actually is. Its own reasoning; a seed.
  confidenceCeiling: 0.5,
  // The neutral parent-of-the-parent: no reason a priori to trust or distrust a voice, so the
  // global reliability shrinks toward 0.5 and earns divergence only as data supports. A seed.
  neutralPrior: 0.5,
  // Partial-pooling strength (§16c altitude 4): the phantom PARENT mass a child context sits on
  // before its own backings move it. A context with little of its own evidence reads mostly as
  // its parent; it earns divergence as that evidence piles up. Its own reasoning, not a sibling's.
  poolStrength: 4,
  // Confidence reaches half its ceiling at this many BACKED moments — a SMOOTH ramp (n/(n+half)),
  // NEVER a "≥N = trusted" cutoff. One backing still whispers (§13 anti-mute).
  confidenceHalfN: 6,
  // DECAY — a witness's reliability under the CURRENT machine is the spine's most volatile fact
  // (a refit re-grades every voice), so this half-life is the shortest declared. Its own seed.
  decayHalfLifeDays: 365,
  // TEACHING WEIGHT = teachBase + teachGain·surprise. teachBase keeps a zero-surprise datum
  // still teaching a little (imperfection is the medium — a low-surprise agreement is never muted
  // to nothing, §13); teachGain makes a full-surprise contradiction teach base+gain — MORE. The
  // ratio is the Rescorla-Wagner error-drive; neither may be lowered by judgment. Seeds.
  teachBase: 0.5,
  teachGain: 1.0,
}

const cleanStr = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

// Mirror of confirmFeedback.js's isFilableStop (separate deployable — never imported across the
// boundary, the house rule). A REAL stop id only; a synthetic vision/discovered id names NO
// existing stop, so a correction carrying one reveals no comparable truth id — the moment then
// abstains from grading rather than guessing at a match.
const isFilableStop = (id) =>
  typeof id === 'string' && !!id && !id.startsWith('__vision__') && !id.startsWith('__discovered__')

const KNOWN_ACTIONS = new Set(['confirmed', 'corrected', 'aside'])

// ---- defensive ledger accessors (thread the real feedback-row shape) --------
// listHealFeedbackForTrip rows (snake_case) OR the client body shape — read both.
const rowAction = (f) => (typeof f?.action === 'string' ? f.action : null)
const rowAt = (f) => (Number.isFinite(f?.at) ? f.at : null)
const rowId = (f) => (f?.id != null ? String(f.id) : null)
const rowTrip = (f) => cleanStr(f?.trip_id ?? f?.tripId)
const rowTraveler = (f) => cleanStr(f?.by_traveler ?? f?.byTraveler)
const rowGuessedId = (f) => cleanStr(f?.guessed_place_id ?? f?.guessedPlaceId)
const rowCorrectedId = (f) => cleanStr(f?.corrected_place_id ?? f?.correctedPlaceId)

// The ask-time challenger snapshot (server-authoritative, readMomentLean): the per-witness
// contribution map, the modal top the map is keyed to, and the machine's confidence in it.
const witOf = (f) => {
  const w = f?.lean?.hm?.wit
  return w && typeof w === 'object' ? w : null
}
const topOf = (f) => cleanStr(f?.lean?.hm?.top)
const confOf = (f) => (Number.isFinite(f?.lean?.hm?.m) ? clamp01(f.lean.hm.m) : 0.5) // p̂; neutral when unknown

// The TRUTH id the family revealed, to compare against the challenger's guess (hm.top):
//   • confirmed ⇒ the served guess the family affirmed;
//   • corrected ⇒ the corrected place, but ONLY when it is a REAL stop (a name/free-text/synthetic
//     correction names no comparable stop id → unknown → abstain);
//   • aside ⇒ unknown (the family declined; truth is not revealed).
function truthIdOf(f, action) {
  if (action === 'confirmed') return rowGuessedId(f)
  if (action === 'corrected') {
    const id = rowCorrectedId(f)
    return isFilableStop(id) ? id : null
  }
  return null
}

// ---- graded shapes (soft, never cutoffs) ------------------------------------
// Empirical-Bayes shrink: pull an observed rate (hit/mass) toward its parent by `pseudo` phantom
// units of parent mass. Thin data ⇒ ~parent (a whisper on the parent); thick ⇒ ~raw. THIS is the
// altitude-4 partial pool (mirrors people.js/meta.js, re-aimed per level).
const shrink = (hit, mass, parentRate, pseudo) =>
  mass + pseudo > 0 ? (hit + pseudo * clamp01(parentRate)) / (mass + pseudo) : clamp01(parentRate)
// Confidence-from-count: how much this context has EARNED from its OWN backed-moment count,
// smoothly — never a gate, so one backing still emits at low weight. Reaches half at `half`.
const evidenceWeight = (n, half) => (half > 0 ? n / (n + half) : n > 0 ? 1 : 0)
// Staleness multiplier. No usable date ⇒ 1 (we never INVENT staleness we can't measure, §13).
const decayFactor = (lastMs, nowMs, halfDays) => {
  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs) || !(halfDays > 0)) return 1
  return clamp01(Math.pow(0.5, Math.max(0, nowMs - lastMs) / (halfDays * DAY)))
}

// One per-(witness, context) accumulator. hit/mass are surprise-AND-responsibility weighted (the
// reliability estimator); right/wrong are the RAW moment tallies for the gauge; n is the backed
// moment count (rides confidence); rows cite the ledger; lastMs drives decay.
const newAcc = () => ({ hit: 0, mass: 0, sSum: 0, n: 0, right: 0, wrong: 0, rows: new Set(), lastMs: null })
const bump = (acc, inc, hitInc, s, o, at, id) => {
  acc.mass += inc
  acc.hit += hitInc
  acc.sSum += s
  acc.n += 1
  if (o) acc.right += 1
  else acc.wrong += 1
  if (id != null) acc.rows.add(id)
  if (Number.isFinite(at)) acc.lastMs = acc.lastMs == null ? at : Math.max(acc.lastMs, at)
}

// ---- the fold ---------------------------------------------------------------
// foldAttention(feedback, opts) => { facts, report }
//   feedback: the §W3 memory_heal_feedback rows (worker: listHealFeedbackForTrip), each
//     { id, trip_id, action:'confirmed'|'corrected'|'aside', kind?, by_traveler?,
//       guessed_place_id?, corrected_place_id?, at?,
//       lean?:{ engine, guessed, hm:{ top, m, ..., wit:{<witness>:{n,g,t}} } } }.
//     May be empty (today's prod reality — the confirm mode has never been on) ⇒ ZERO facts.
//   opts: { now?, shapeOf?, ...ATTENTION_DEFAULTS overrides }.
//     - `now`: the deterministic clock (ms). REQUIRED for decay; absent ⇒ a neutral recencyDecay
//              of 1 (facts stand, never silently zeroed). NEVER Date.now.
//     - `shapeOf(tripId)`: OPTIONAL trip-shape classifier. When supplied, a `shape:*` context
//              lights up and each trip nests under its shape (the §16c altitude-4 middle layer).
//              Absent ⇒ trip nests directly under global — no fabricated classifier (§1 grounding).
// Returns { facts, report }:
//   facts:  per-witness × per-context reliability, lattice-shaped { subject, value, confidence,
//           recencyDecay, backing, surpriseMean, parent, counts, sourceRows }, sorted by key.
//   report: a compact INSTRUMENT summary incl. the failure-to-learn tax — for Jonathan's holistic
//           judgment; it re-weights no witness, files nothing, crosses no lock.
export function foldAttention(feedback, opts = {}) {
  const o = { ...ATTENTION_DEFAULTS, ...opts }
  const now = Number.isFinite(opts.now) ? opts.now : NaN // deterministic: no Date.now fallback
  const shapeOf = typeof opts.shapeOf === 'function' ? opts.shapeOf : null

  // perWitness: name -> { global, shapes:Map, trips:Map, persons:Map } of accumulators.
  const perW = new Map()
  const wOf = (name) => {
    let w = perW.get(name)
    if (!w) { w = { global: newAcc(), shapes: new Map(), trips: new Map(), persons: new Map() }; perW.set(name, w) }
    return w
  }
  const cellOf = (m, key) => { let c = m.get(key); if (!c) { c = newAcc(); m.set(key, c) } return c }
  const tripShape = new Map() // trip -> shapeKey (for the altitude-4 nesting parent)

  const report = {
    moments: 0, scored: 0, graded: 0, ungraded: 0, skipped: 0,
    byAction: { confirmed: 0, corrected: 0, aside: 0 },
    right: 0, wrong: 0,
    failureToLearnTax: 0, // Σ p̂ over asks the challenger already had RIGHT — avoidable friction (§16c)
    caughtErrors: 0, // asks that caught a real error (challenger wrong) — friction that earned its keep
    taxRate: 0,
  }

  for (const f of feedback || []) {
    if (!f || typeof f !== 'object') continue
    const action = rowAction(f)
    if (!KNOWN_ACTIONS.has(action)) continue // unknown verb → not an answered moment
    report.moments += 1
    report.byAction[action] += 1

    const wit = witOf(f)
    if (!wit) { report.skipped += 1; continue } // no challenger read captured → can't attribute (abstain)
    report.scored += 1

    const top = topOf(f)
    const truthId = truthIdOf(f, action)
    if (top == null || truthId == null) { report.ungraded += 1; continue } // truth/guess unknown → abstain

    const pHat = confOf(f)
    const oOut = String(top) === String(truthId) ? 1 : 0 // did the challenger's guess = the truth?
    report.graded += 1
    if (oOut) {
      report.right += 1
      // Tax ONLY a CONFIRM the challenger already had right — pure avoidable friction. A
      // correction caught a real (v1) error even when the challenger's own guess agreed, so it is
      // NEVER taxed (the header contract; §16c: a correction is the loop WORKING, not a failure to
      // learn). Gating on action, not outcome, is the fix (the verify caught the outcome-gate).
      if (action === 'confirmed') report.failureToLearnTax += pHat
    } else { report.wrong += 1; report.caughtErrors += 1 } // wrong → the ask caught it

    const s = Math.abs(oOut - pHat) // Rescorla-Wagner prediction error (surprise)
    const teach = o.teachBase + o.teachGain * s // a contradiction/surprising-success teaches MORE
    const at = rowAt(f)
    const id = rowId(f)
    const trip = rowTrip(f)
    const person = rowTraveler(f)
    const shapeKey = shapeOf && trip != null ? cleanStr(shapeOf(trip)) : null
    if (shapeKey && trip != null) tripShape.set(trip, shapeKey)

    for (const name of Object.keys(wit).sort()) {
      const c = wit[name]
      const g = Number.isFinite(c?.g) ? c.g : 0
      if (!(g > 0)) continue // spoke, but not for this guess → no responsibility → abstain (§13)
      const inc = g * teach // responsibility × teaching weight
      const hitInc = inc * oOut
      const w = wOf(name)
      bump(w.global, inc, hitInc, s, oOut, at, id)
      if (trip != null) bump(cellOf(w.trips, trip), inc, hitInc, s, oOut, at, id)
      if (person != null) bump(cellOf(w.persons, person), inc, hitInc, s, oOut, at, id)
      if (shapeKey != null) bump(cellOf(w.shapes, shapeKey), inc, hitInc, s, oOut, at, id)
    }
  }

  report.failureToLearnTax = round2(report.failureToLearnTax)
  report.taxRate = report.graded > 0 ? round2(report.failureToLearnTax / report.graded) : 0

  // Assemble facts, PARENT-BEFORE-CHILD so each level pools onto an already-computed parent:
  // global (← neutralPrior), then shapes (← global), then trips (← their shape else global), then
  // persons (← global). Confidence rides each context's OWN backed-moment count (a thin child is a
  // whisper even while its value is pooled toward the better-evidenced parent — scale honesty).
  const facts = []
  const witnessSummary = []
  const mkFact = (witness, context, key, acc, parentRate) => {
    const reliability = shrink(acc.hit, acc.mass, parentRate, o.poolStrength)
    const recencyDecay = decayFactor(acc.lastMs, now, o.decayHalfLifeDays)
    const confidence = clamp01(o.confidenceCeiling * evidenceWeight(acc.n, o.confidenceHalfN) * recencyDecay)
    return {
      subject: { branch: 'attention', fact: 'witness-reliability', witness, context, key },
      // The RELIABILITY headline: the surprise-and-responsibility-weighted rate at which this
      // voice's backings were borne out, pooled toward its parent. A rate honestly measured — the
      // clamp that stops it asserting lives in `confidence`, per the derived-tier contract.
      value: clamp01(reliability),
      confidence, // CLAMPED ≤ confidenceCeiling (< 1) — a nudge, never an assertion or a re-weight
      recencyDecay,
      parent: clamp01(parentRate), // the value it was pooled toward — audit the altitude-4 pooling
      backing: round2(acc.mass), // surprise-weighted responsibility mass (the gauge's evidence)
      surpriseMean: acc.n > 0 ? round2(acc.sSum / acc.n) : 0, // how much these data taught, on average
      counts: { backedRight: acc.right, backedWrong: acc.wrong, moments: acc.n }, // RAW, for the gauge
      sourceRows: [...acc.rows].sort(), // cite the ledger; delete a row and the lesson unlearns
    }
  }

  for (const witness of [...perW.keys()].sort()) {
    const w = perW.get(witness)
    const gRate = shrink(w.global.hit, w.global.mass, o.neutralPrior, o.poolStrength)
    facts.push(mkFact(witness, { scope: 'global' }, `witness-reliability:${witness}:global`, w.global, o.neutralPrior))
    witnessSummary.push({
      witness,
      reliability: round2(clamp01(gRate)),
      moments: w.global.n,
      backing: round2(w.global.mass),
      backedRight: w.global.right,
      backedWrong: w.global.wrong,
    })

    const shapeRate = new Map()
    for (const shapeKey of [...w.shapes.keys()].sort()) {
      const acc = w.shapes.get(shapeKey)
      const rate = shrink(acc.hit, acc.mass, gRate, o.poolStrength)
      shapeRate.set(shapeKey, rate)
      facts.push(mkFact(witness, { scope: 'shape', shape: shapeKey }, `witness-reliability:${witness}:shape:${shapeKey}`, acc, gRate))
    }
    for (const trip of [...w.trips.keys()].sort()) {
      const acc = w.trips.get(trip)
      const sk = tripShape.get(trip)
      const parentRate = sk != null && shapeRate.has(sk) ? shapeRate.get(sk) : gRate // nest under shape when known
      facts.push(mkFact(witness, { scope: 'trip', trip }, `witness-reliability:${witness}:trip:${trip}`, acc, parentRate))
    }
    for (const person of [...w.persons.keys()].sort()) {
      const acc = w.persons.get(person)
      facts.push(mkFact(witness, { scope: 'person', person }, `witness-reliability:${witness}:person:${person}`, acc, gRate))
    }
  }

  facts.sort((a, b) => (a.subject.key < b.subject.key ? -1 : a.subject.key > b.subject.key ? 1 : 0))
  report.witnesses = witnessSummary // already witness-sorted
  return { facts, report }
}

export default foldAttention
