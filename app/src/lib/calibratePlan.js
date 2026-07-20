// calibratePlan.js — F3 CALIBRATION: the producer side of the bounded, most-
// powerful confirm write (BUILD_SPECS_GLANCE_ENGINE.md F3 lines 170-246 + A2/A13).
// A calibration question is about a PATTERN, not a photo — "Helen's photos land
// about a day late, right?" One answer re-grades a channel's TIME evidence across
// every trip. Power demands bounds; all four lenses apply from birth.
//
// This module is PURE and DECISION-RETURNING (the S1/§16c seam discipline): it
// EXPORTS
//   • askableCalibrations(measurements, opts) → pattern[]  — the ASKABLE-SET
//       builder. A question exists ONLY when the engine's OWN instruments already
//       hold the pattern (importLagClass 'long-demote' consistent on an author, OR
//       offsetInference corroborations converging on a constant shift), the pattern
//       is human-knowable (the closed {lag, offset} set only — channel abstractions
//       are never askable), and it can be WHO-routed to the pattern's own owner
//       (never Rafa). Sources key on person × device, falling back to person alone
//       when the device is unknown (A13). Fishing is structurally impossible: no
//       measurement in → no question out.
//   • calibratePlan({ pattern, answer, ... }) → { regrade?, retire?, receiptWords }
//       the write PLAN for one answer. It never executes a write — the live wiring
//       (the mig-021 feedback POST + the corpus re-settle) is a separate step. A
//       YES re-grades EXACTLY the measured pattern's evidence (lag → that author's
//       created-at upper-bound points on the TIME channel; offset → that device's
//       shift at its EXISTING derived provenance) — MAGNITUDE FROM THE INSTRUMENT,
//       never the human, never felt (§13). It changes NO witness multiplier, NO
//       other device, NO other channel, and can NEVER move a manual/'confirmed'
//       D13-locked filing (the corpus-wide re-settle moves AUTO-tier only). A NO
//       RETIRES the hypothesis (recorded in the same ledger row), changing zero
//       grading, and is not re-asked until the measurement materially strengthens.
//
// The answer lands as a mig-021 feedback row — the EXISTING write class; the ledger
// IS the calibration store (no new store, no migration). The row's calibration
// shape is exactly what the settled CONSUMER reads: the DEVICES branch of the
// world-model fold, lattice/devices.js buildDeviceFacts — { calibration, person,
// device, answer, offsetMinutes? } (A3: ONE fold, never two parallel plumbings).
//
// Deterministic: `now`/ids come from opts; the clock is never read here.

// ---- source-key + device normalisation (matches lattice/devices.js exactly, so a
// calibration attaches to the SAME source as the photos its instrument measured;
// A13). Kept local (never imported across the app/worker mirror boundary). --------
const normStr = (s) => (typeof s === 'string' ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '')

// A device may arrive as a "make|model" string or a { make, model } object; both
// canonicalise to the SAME lowercased "make|model" key deviceKeyOf mints on a photo
// ref. Unknown device → null → the person-only fallback source (A13).
export function deviceKeyOf(d) {
  if (d == null) return null
  if (typeof d === 'string') return normStr(d) || null
  if (typeof d === 'object') {
    const mk = normStr(d.make)
    const md = normStr(d.model)
    return mk || md ? `${mk}|${md}` : null
  }
  return null
}

export const sourceKeyOf = (person, device) => `${person ?? '∅'}::${device ?? '∅'}`

// ---- declared SEEDS (§15b) — provisional until fit from the family's real data,
// never tuned by feel, each independently reasoned for THIS surface, none borrowed
// from a sibling instrument. None may be lowered by judgment; only a measurement
// re-grades. -----------------------------------------------------------------------
export const CALIBRATE_DEFAULTS = {
  // LAG (importLagClass 'long-demote') — a couple of late photos is not a habit; a
  // real "my photos upload late" pattern needs a body of long-demote evidence AND
  // for it to DOMINATE the source's informative lag reads (else it is noise, not a
  // habit). Below either → no question (no fishing).
  lagMinEvidence: 4,
  lagConsistencyFloor: 0.6,
  // OFFSET (offsetInference corroborations) — "converging on a constant shift"
  // means enough corroborated samples that fall inside a tight range. A wandering
  // clock (wide spread) is NOT a constant offset and must not be askable.
  offsetMinEvidence: 3,
  offsetMaxSpreadMin: 15,
  // A retired (NO) hypothesis re-qualifies to be asked again only when its measured
  // evidence has at least this-fold strengthened since the answer (§13; "not re-asked
  // unless the measurement later strengthens materially").
  strengthenFactor: 2,
  // WHO-routing: the child is never asked a calibration (spec 02 / F3 §3). Second
  // person, to the pattern's own owner, only.
  rafaId: 'rafa',
}

// A device calibration is human-knowable by construction; channel abstractions are
// not (no human knows "is the scene signal reliable?"). The closed, enumerated set.
export const ASKABLE_KINDS = new Set(['lag', 'offset'])

// ---- the instrument's measured magnitude (never the human's) ---------------------
// Deterministic mode of a finite list; ties → the numerically smallest (stable).
function modeOfNumbers(nums) {
  const counts = new Map()
  for (const n of nums) counts.set(n, (counts.get(n) || 0) + 1)
  let best = null
  let bestN = -1
  for (const [val, n] of counts) {
    if (n > bestN || (n === bestN && val < best)) {
      best = val
      bestN = n
    }
  }
  return best
}

// The evidence scalar the askable-gate + the strengthen-threshold both read.
export function patternStrength(pattern) {
  return Number.isFinite(pattern?.strength) ? pattern.strength : 0
}

// Turn ONE raw instrument measurement into a well-formed askable pattern, or null
// when it is below the measured threshold / not human-knowable / owner-less. This
// is the GATE + the ROUTER — the physics (which class, which converged shift) is the
// instrument's; this never invents a pattern the instruments didn't already hold.
export function patternFromMeasurement(m, opts = {}) {
  const o = { ...CALIBRATE_DEFAULTS, ...opts }
  if (!m || typeof m !== 'object') return null
  const kind = m.kind
  if (!ASKABLE_KINDS.has(kind)) return null // human-knowable set only — no fishing on channel abstractions
  const person = typeof m.person === 'string' && m.person.trim() ? m.person.trim() : null
  if (!person) return null // no owner ⇒ nobody to route to ⇒ not askable
  const device = deviceKeyOf(m.device) // canonical key or null (A13 person-only fallback)

  if (kind === 'lag') {
    const longDemote = Number.isFinite(m.longDemote) ? m.longDemote : 0
    const informativeTotal = Number.isFinite(m.informativeTotal) ? m.informativeTotal : 0
    const longFraction = informativeTotal > 0 ? longDemote / informativeTotal : 0
    // MEASURED gate: a real, dominant long-demote habit, not a couple of stray backfills.
    if (longDemote < o.lagMinEvidence || longFraction < o.lagConsistencyFloor) return null
    return {
      kind,
      person,
      device,
      who: person, // WHO-routing: second person, to the owner
      magnitude: 'long-demote', // the instrument's class — a confirmed lag never zeroes, it re-tiers
      strength: longDemote,
      key: sourceKeyOf(person, device),
      measured: { longDemote, informativeTotal, longFraction },
    }
  }

  // kind === 'offset' — corroborations converging on a constant shift.
  const offsets = Array.isArray(m.offsets) ? m.offsets.filter(Number.isFinite) : []
  if (offsets.length < o.offsetMinEvidence) return null
  const spread = offsets.length ? Math.max(...offsets) - Math.min(...offsets) : Infinity
  if (spread > o.offsetMaxSpreadMin) return null // wandering clock ⇒ not a constant offset ⇒ not askable
  const offsetMinutes = modeOfNumbers(offsets) // the converged constant — the instrument's number
  return {
    kind,
    person,
    device,
    who: person,
    magnitude: offsetMinutes, // the MEASURED shift; a YES corroborates it, never resizes it
    strength: offsets.length,
    key: sourceKeyOf(person, device),
    measured: { offsetMinutes, corroboratedCount: offsets.length, spreadMinutes: spread },
  }
}

// Index prior answers by source×kind so the builder can honour A2 (a confirmed class
// is settled, don't re-ask) and F3's strengthen threshold (a retired hypothesis is
// not re-asked until the evidence materially strengthens). Latest answer wins.
function indexPriors(priorAnswers) {
  const idx = new Map()
  for (const p of priorAnswers || []) {
    if (!p || (p.answer !== 'yes' && p.answer !== 'no')) continue
    const kind = p.calibration || p.kind
    if (!ASKABLE_KINDS.has(kind)) continue
    const person = typeof p.person === 'string' ? p.person : typeof p.by_traveler === 'string' ? p.by_traveler : null
    if (!person) continue
    const key = `${sourceKeyOf(person, deviceKeyOf(p.device))}:${kind}`
    const at = Number.isFinite(p.at) ? p.at : -Infinity
    const prev = idx.get(key)
    if (!prev || at >= prev.at) {
      idx.set(key, { answer: p.answer, strengthAtAnswer: Number.isFinite(p.strengthAtAnswer) ? p.strengthAtAnswer : 0, at })
    }
  }
  return idx
}

// THE ASKABLE-SET BUILDER. measurements: the engine's own instrument reads, per
// source×kind. Returns the patterns worth asking, deterministically ordered.
export function askableCalibrations(measurements, opts = {}) {
  const o = { ...CALIBRATE_DEFAULTS, ...opts }
  const priors = indexPriors(o.priorAnswers)
  const out = []
  for (const m of measurements || []) {
    const pat = patternFromMeasurement(m, o)
    if (!pat) continue // gate: measured + human-knowable + has an owner
    // WHO-routing: never Rafa; the owner is always the measurement's own person, so a
    // question can never be asked about a third party's device (each measurement carries
    // its own owner and only that owner is routed to).
    if (pat.who === o.rafaId) continue
    const prior = priors.get(`${pat.key}:${pat.kind}`)
    if (prior) {
      if (prior.answer === 'yes') continue // settled (A2) — the question retires for this source
      if (prior.answer === 'no') {
        // Not re-asked until the evidence materially strengthens past the answer's strength.
        const need = (prior.strengthAtAnswer || 0) * o.strengthenFactor
        if (!(pat.strength >= need && pat.strength > (prior.strengthAtAnswer || 0))) continue
      }
    }
    out.push(pat)
  }
  // Deterministic, input-order-independent (§16c keystone).
  out.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      String(a.person).localeCompare(String(b.person)) ||
      String(a.device ?? '').localeCompare(String(b.device ?? '')) ||
      String(a.magnitude).localeCompare(String(b.magnitude))
  )
  return out
}

// ---- the receipt: WORDS ONLY at settle (F1's actuals rule; AMENDS the design's
// "31 photos re-sorted" example — the corpus-wide re-settle is async, so no true
// number exists yet). A measured actual surfaces LATER via the show mode. No digits.
function receiptFor(kind, answer, personLabel) {
  if (answer === 'yes') {
    return kind === 'lag'
      ? `Got it — I'll read ${personLabel} photo times that way from now on.`
      : `Got it — I'll line up that camera's clock the way it actually runs, from now on.`
  }
  return kind === 'lag'
    ? `Good to know — I'll leave ${personLabel} photo times as they are.`
    : `Good to know — I'll leave that camera's clock as it is.`
}

// A possessive label for the owner in the receipt copy (engine copy; the deck
// polishes later). opts.personName overrides the raw id. Digit-free by construction.
function personLabel(pattern, opts) {
  const name = typeof opts.personName === 'string' && opts.personName.trim() ? opts.personName.trim() : pattern.person
  return /'s\b|s'$/.test(name) ? name : `${name}'s`
}

// THE WRITE PLAN for one answered calibration. Returns a plan object — never a
// write. `answer` is 'yes' | 'no'. opts: { now, id, personName }.
export function calibratePlan({ pattern, answer } = {}, opts = {}) {
  const o = { ...CALIBRATE_DEFAULTS, ...opts }
  // Guard: a malformed pattern or answer is a no-op skip, never a half-write (the
  // #4 honest-copy lesson: never promise an effect that can't happen).
  const okPattern = pattern && ASKABLE_KINDS.has(pattern.kind) && typeof pattern.person === 'string' && pattern.person
  const ans = answer === 'yes' || answer === 'no' ? answer : null
  if (!okPattern || !ans) {
    return { regrade: null, retire: null, receiptWords: '', skip: true, reason: !okPattern ? 'bad-pattern' : 'bad-answer' }
  }

  const now = Number.isFinite(o.now) ? o.now : null
  const source = { person: pattern.person, device: pattern.device ?? null }
  const isOffset = pattern.kind === 'offset'

  // The mig-021 feedback row — the EXISTING append-only write class; the ledger IS
  // the calibration store. Shape = exactly what lattice/devices.js buildDeviceFacts
  // consumes (A3). The offset MAGNITUDE is copied straight from the instrument
  // (pattern.magnitude); no human-supplied number is ever read here.
  const feedbackRow = {
    calibration: pattern.kind,
    person: pattern.person,
    by_traveler: pattern.person, // the consumer reads person from by_traveler too
    device: pattern.device ?? null,
    answer: ans,
    // Only an offset carries a magnitude in the row (the converged shift); a lag's
    // magnitude is its CLASS ('long-demote'), read by the consumer from the pattern
    // itself, so the row needs no number — keeping the ledger digit-honest.
    offsetMinutes: ans === 'yes' && isOffset && Number.isFinite(pattern.magnitude) ? pattern.magnitude : null,
    // Recorded so the builder can enforce the strengthen threshold on a later re-ask.
    strengthAtAnswer: patternStrength(pattern),
    at: now,
    id: o.id ?? null,
  }

  const label = personLabel(pattern, o)
  const receiptWords = receiptFor(pattern.kind, ans, label)

  if (ans === 'no') {
    // RETIRE — recorded in the same row, changes zero grading. The channel keeps its
    // default (measured) grading; the source's fact stays deviceCeiling.
    return {
      kind: pattern.kind,
      source,
      answer: ans,
      feedbackRow,
      regrade: null,
      retire: {
        hypothesis: { kind: pattern.kind, source },
        recorded: true, // in the same ledger row — a NO is never treated as noise
        changesGrading: false, // the founding bound: a retire re-grades nothing
        reAsk: { strengthenFactor: o.strengthenFactor, strengthAtAnswer: patternStrength(pattern) },
      },
      // A NO surfaces NO later actual — nothing moved.
      actualForLater: null,
      receiptWords,
    }
  }

  // YES — re-grade EXACTLY the measured pattern's evidence, nothing else.
  const regrade = {
    branch: 'devices', // the DEVICES branch of the ONE world-model fold (A3)
    fact: isOffset ? 'clockOffset' : 'uploadLag', // the exact fact type the consumer emits
    source, // person × device (A13) — the only source touched
    effect: {
      from: 'measured', // deviceCeiling
      to: 'confirmed', // confirmedCeiling — corroborated, firmer, still < the humanConfirm bench weight (§7 revisable)
      magnitude: pattern.magnitude, // 'long-demote' | offsetMinutes — FROM THE INSTRUMENT
      magnitudeSource: 'instrument', // never the human, never felt (§13)
    },
    // WHAT the re-grade touches on the TIME channel — per-kind, not one knob.
    regrades: isOffset
      ? {
          channel: 'time',
          target: 'device-offset', // that device's corroborated shift
          provenance: 'inferred-manual', // applied at its EXISTING derived tier — a real PROV_OFF value
          provTier: 'derived',
          provValuesUntouched: true, // PROV_OFF_VALUES is not widened by a calibration
        }
      : {
          channel: 'time',
          target: 'author-created-at-upper-bound', // a known-late author's upper bound is loose BY HABIT, not blanket-suspect
        },
    // The HARD BOUNDS — the F3 tests in object form (the promotion gate reads these).
    touchesWitnessMultipliers: false, // never moves the per-witness multipliers wholesale
    touchesOtherDevices: false, // never another person's / another device's grading
    touchesOtherChannels: false, // TIME only — never GPS/vision/etc.
    filesPhotos: false, // a calibration re-grades evidence; it never files a photo by itself
    movesLockedFilings: false, // D13 holds absolutely — manual/'confirmed' filings are untouchable
    silencesChannel: false, // a trust tier shifts; nothing zeroes
  }

  return {
    kind: pattern.kind,
    source,
    answer: ans,
    feedbackRow,
    regrade,
    retire: null,
    // GESTALT + reversibility (§7): a confirmed calibration re-reads the WHOLE corpus,
    // shadow-gated, moving AUTO-tier filings only — every manual/'confirmed' lock holds.
    reSettle: { scope: 'corpus', gate: 'shadow', locksHold: true, movesFilingTier: 'auto-only' },
    // The measured actual to surface LATER (show mode / album) once the re-settle
    // lands — the instrument's number, reported not predicted (A6). Never in the receipt.
    actualForLater: isOffset ? { offsetMinutes: pattern.magnitude } : { lagClass: pattern.magnitude },
    receiptWords, // words only, no digits — the settle receipt
  }
}

export default calibratePlan
