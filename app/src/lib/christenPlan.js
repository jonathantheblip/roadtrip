// christenPlan.js — the F2 christening WRITE-PLAN (BUILD_SPECS_GLANCE_ENGINE.md
// F2 lines 72-154 + amendments A4/A6/A7/A9/A14). Band 3 / O4, TRUTH-CRITICAL:
// when PHOTO_CONFIRM_MODE flips on this decides how a "somewhere else" + a typed
// name MOVES REAL family photos. Everything here is PURE + node-tested so the
// ordering/guard/degraded logic isn't only reachable at runtime with the knob on
// (the class of gap that hid the Level-2 onResolve scope bug).
//
// The gesture: on a place-pick question the family tapped "Somewhere else". A typed
// name is a CHRISTENING — the answer doesn't pick an entity, it CREATES one (a real
// day stop). An empty field is a SKIP (residue-free, no write). And a typed name
// that positively resolves to an EXISTING stop — decided MULTIDIMENSIONALLY, never
// by the name alone — is a PICK of that stop (no twin minted).
//
// THE CONTRACT (rule 1): this returns a PLAN object (what to create/file/POST, in
// what order, the receipt, the degraded/skip/masked/deletion paths). It executes
// NOTHING — no pushTrip, no updateMemoryStop, no fetch; the live wiring is Claude's
// separate step (HealConfirmHost). Deterministic: ids come from the injected
// `newStopId` maker and the timestamp from `now` — never crypto/Math.random/Date.now.
//
// It BUILDS ON the shipped S1 seam confirmWritePlan (confirmSurface.js): the filing
// step is the same tested {source:'confirmed', D13-lock} path — a christened id is a
// REAL stop so isFilablePlace passes, and because the new stop has NO coords
// confirmedStopCoords returns null → gpsStamps:[] fall out for free (Level-2
// coord-propagation does NOT fire for a christening — nothing to propagate, spec
// lines 133-134). A collapse-to-an-existing geocoded stop DOES propagate its coords,
// exactly as any real-stop confirm — also for free, same seam.

import { confirmWritePlan } from './confirmSurface.js'
import { inferStopType } from './visionPlacement.js'

// SEEDS (§13 — measured/ablated later, never felt). A14: the christening guard
// REUSES the signage witness's Dice metric but carries its OWN threshold, fitted
// separately. Coord agree/contradict radii are generous (coords are noisy) and are
// the SECOND dimension only — never the first (proximity proposes, the name +
// another dimension disambiguate; the Provincetown stacked-places lesson: identical
// coords are LEGITIMATE for distinct stops, so proximity alone never collapses).
export const CHRISTEN_DEFAULTS = {
  diceThreshold: 0.5, // a strong name match — a SEED, fitted apart from signageFloor
  nearMeters: 200, // moment coords within this of a stop's = an AGREEING location dimension
  farMeters: 500, // moment coords beyond this from a name-matched stop = a CONTRADICTION
}

// ---- the Dice metric (A14: same metric as the signage witness, own threshold) ----
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'at', 'in', 'on', 'to', 'st', 'ave', 'rd'])
const tokens = (s) =>
  typeof s === 'string' ? s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)) : []
export function nameDice(a, b) {
  const ta = tokens(a)
  const tb = new Set(tokens(b))
  if (!ta.length || !tb.size) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return (2 * shared) / (ta.length + tb.size)
}

// Great-circle metres between two {lat,lng}; null when either is not fully finite
// (an un-geocoded stop / a moment with no located coords → the SPATIAL dimension
// simply ABSTAINS, it never contradicts on absence — silence is not corroboration
// and silence is not contradiction either).
export function metersBetween(a, b) {
  if (!a || !b) return null
  const ok = (v) => Number.isFinite(v)
  if (!ok(a.lat) || !ok(a.lng) || !ok(b.lat) || !ok(b.lng)) return null
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

// trip.days can live at trip.days or trip.data.days (withDays, claudeCardApply.js).
function tripDays(trip) {
  return (trip?.data?.days || trip?.days || [])
}

// The collapse candidate set: every real stop the christening could turn out to
// name — the day's stops + all trip stops — carrying coords when geocoded. The
// caller MAY pass an explicit `candidates` list (with per-candidate exemplarAgree,
// which needs the vision corpus the pure layer can't see); otherwise we derive the
// name/coords pair here and exemplar agreement defaults to SILENT (undefined).
function deriveCandidates(trip) {
  const out = []
  const seen = new Set()
  for (const day of tripDays(trip)) {
    for (const s of day?.stops || []) {
      const name = s?.name || s?.title
      if (!s?.id || !name || seen.has(s.id)) continue
      seen.add(s.id)
      const coords = Number.isFinite(s.lat) && Number.isFinite(s.lng) ? { lat: s.lat, lng: s.lng } : null
      out.push({ id: s.id, name, coords })
    }
  }
  return out
}

// THE MULTIDIMENSIONAL COLLAPSE GUARD (A9 / spec lines 47-70). A name match ALONE
// NEVER collapses. Collapse to a PICK requires a strong name match PLUS at least one
// INDEPENDENT AGREEING dimension (the moment's located coords near the stop's, OR a
// signage/lookalike match to the stop's exemplars). Two discounts:
//   • a kind-word in the typed name ("the beach") makes name↔placeType agreement NOT
//     independent — so placeType is never counted as the agreeing dimension here (we
//     only ever count coords + exemplars); recorded so the caller can't smuggle a
//     placeType "agreement" past the guard.
//   • a DECLINED candidate (one the family just tapped past by choosing "somewhere
//     else") is contradicted-by-human-act — it can NEVER collapse-collect.
// SILENCE IS NOT CORROBORATION (AUDIT-1, which GOVERNS over the older test-list line
// "no contradicting dimension → PICK"): on this corpus the other dimensions are
// usually silent, and a silence-collapse would make the name dispositive — the
// founding sin. Any contradiction (far coords / a clashing placeType the caller
// flags), or all-silent → christen a DISTINCT stop. A wrong split is cheap (one human
// merge); a wrong merge mints a false D13-locked confirm the machine may never undo.
export function resolveCollapse(name, moment, candidates, opts = {}) {
  const o = { ...CHRISTEN_DEFAULTS, ...opts }
  const nameIsKindWord = inferStopType(name) != null
  const declined = new Set(
    [moment?.placeId, ...(Array.isArray(moment?.declinedPlaceIds) ? moment.declinedPlaceIds : [])].filter(Boolean)
  )
  const momentCoords = moment?.coords && Number.isFinite(moment.coords.lat) ? moment.coords : null

  let best = null // { id, name, score, coordAgree, exemplarAgree }
  let sawContradiction = false
  for (const c of candidates || []) {
    const score = nameDice(name, c?.name)
    if (score < o.diceThreshold) continue // no strong name match → not a collapse target
    const d = metersBetween(momentCoords, c?.coords)
    const coordAgree = d != null && d <= o.nearMeters
    const coordContradict = d != null && d > o.farMeters
    // placeType is NEVER an independent agreeing dimension (the kind-word discount);
    // only coords + a caller-supplied exemplar/signage agreement count.
    const exemplarAgree = c?.exemplarAgree === true || (typeof c?.exemplarAgree === 'number' && c.exemplarAgree > 0)
    const isDeclined = declined.has(c?.id)
    if (coordContradict) sawContradiction = true
    // A declined candidate, or a contradicting one, can never collect the christening.
    if (isDeclined || coordContradict) continue
    if (!(coordAgree || exemplarAgree)) continue // SILENCE is not corroboration → not a collapse
    if (!best || score > best.score) best = { id: c.id, name: c.name, score, coordAgree, exemplarAgree }
  }

  if (best) {
    return {
      collapse: true,
      stopId: best.id,
      stopName: best.name,
      citation: `matched on name + ${best.coordAgree ? 'location' : 'lookalike'}`,
      dimensions: {
        nameScore: best.score,
        nameIsKindWord,
        coordAgree: best.coordAgree,
        exemplarAgree: best.exemplarAgree,
        contradiction: false,
      },
    }
  }
  return {
    collapse: false,
    citation: `'${String(name || '').trim()}' exists now`,
    dimensions: {
      nameIsKindWord,
      contradiction: sawContradiction, // a name-matched stop was ruled out by far coords
    },
  }
}

// The /heal-confirm body a christening POSTs: action 'confirmed' with the christened
// id as the confirmed place (spec lines 108-112 — the AUDIT-1 code-verified fix; it
// IS a human confirm of a real, now-synced stop, so the server D13 stamp + re-heal
// fire under their EXISTING 'confirmed' gates). It must NOT ride 'corrected' — the
// flip-blocker #3 fix deliberately gates stamp+re-heal off 'corrected', and that fix
// stands. guessedPlaceId = the christened id is what stampConfirmedStops server-locks
// (test #5). guessedPlaceName = the family's verbatim words.
function christenPost(tripId, moment, christenedId, name) {
  return {
    trip: tripId,
    isoDate: moment?.isoDate || null,
    memoryIds: Array.isArray(moment?.memoryIds) ? moment.memoryIds : [],
    kind: moment?.kind || null,
    action: 'confirmed',
    guessedPlaceId: christenedId,
    guessedPlaceName: name,
  }
}

// A collapse rides the SHIPPED S1 pick path: action 'corrected' with the existing
// stop as correctedPlaceId (the human corrected the guess to a KNOWN stop). The
// client's own confirmWritePlan filing already locks it source:'confirmed'; we do not
// re-decide the tested pick semantics.
function collapsePost(tripId, moment, stopId, stopName) {
  return {
    trip: tripId,
    isoDate: moment?.isoDate || null,
    memoryIds: Array.isArray(moment?.memoryIds) ? moment.memoryIds : [],
    kind: moment?.kind || null,
    action: 'corrected',
    correctedPlaceId: stopId,
    correctedPlaceName: stopName,
  }
}

// The S1 free-text fallback POST (the DEGRADED path + the no-day block): the words
// land as ordinary S1 feedback (action 'corrected', words only — NO stop id, NO
// filing), never a christening confirm of an entity that doesn't exist. This is what
// "the words land as S1 feedback words only … the S1 free-text promise" means (spec
// lines 100-103, #4 honest-copy lesson).
function freetextPost(tripId, moment, name) {
  return {
    trip: tripId,
    isoDate: moment?.isoDate || null,
    memoryIds: Array.isArray(moment?.memoryIds) ? moment.memoryIds : [],
    kind: moment?.kind || null,
    action: 'corrected',
    words: name,
  }
}

// The receipt is a STATE MACHINE, not a single string (spec "Receipt timing"): a
// christening receipt renders ONLY after the trip ack — before it, an honest pending
// ("saving your place…"). A terminal push failure replaces PENDING with the S1
// words-kept copy; a shown receipt is never retroactively falsified. Copy keys carry
// defaults; the deck (confirmCopy) owns final wording.
function receiptMachine({ name, n, deferred, blocked }) {
  const activeSuccess = deferred
    ? { key: 'christen.deferred', text: "Saved — it'll join the trip when the surprise does" }
    : { key: 'christen.receipt', text: `'${name}' is on the trip now` }
  return {
    // shown from the tap until the trip ack (or the terminal failure) resolves:
    pending: { key: 'christen.pending', text: 'Saving your place…' },
    // shown ONLY after the trip-mutate ack lands (or immediately, held, when masked):
    success: activeSuccess,
    // shown INSTEAD of success on a terminal trip-push failure — the S1 promise, never
    // the christening receipt:
    degraded: { key: 's1.freetext.kept', text: 'Kept your words' },
    // A6: the settle-time receipt covers ONLY the answer's own cascade (this n). Any
    // cross-trip effect (exemplar reach, world-model recurrence, other-moment heals)
    // surfaces LATER via the show mode as a measured actual — never predicted here.
    actuals: { movedNow: n },
    timing: 'receipt-only-after-trip-ack',
    // when a create was blocked before any write (no matching day), the ACTIVE receipt
    // is the degraded one — there is no christening to receipt.
    active: blocked ? 'degraded' : 'success',
  }
}

// The DELETION contract (spec lines 113-116): deleting a christened stop that carries
// D13-locked filings must never orphan them onto an unrenderable id — the delete
// RELEASES the locks and re-opens the photos as loose, with a visible notice. Pure +
// separately testable (O4 delete-after-filing). Release = updateMemoryStop(id, null,
// null): stopId null unfiles, prov null clears the lock (memoryStore spreads stopProv
// only when prov !== undefined), so the photo returns to the sweep, loose + unlocked.
export function releaseChristenedStop({ stopId, name, filedMemoryIds = [] } = {}) {
  const ids = Array.isArray(filedMemoryIds) ? filedMemoryIds.filter((x) => typeof x === 'string' && x) : []
  const releases = ids.map((memoryId) => ({ memoryId, stopId: null, prov: null, via: 'updateMemoryStop' }))
  const n = releases.length
  return {
    op: 'release-christened-stop',
    stopId: stopId || null,
    releases,
    notice: n
      ? { key: 'christen.loose', text: `${n} photo${n === 1 ? '' : 's'} from '${name}' ${n === 1 ? 'is' : 'are'} loose again` }
      : null,
    orphaned: false, // never a silent strand on an unrenderable id
  }
}

// christenPlan — the whole ordered write plan for one "somewhere else" + name answer.
// opts:
//   trip                 the trip (days at trip.days or trip.data.days)
//   tripId               (default trip.id) — the /heal-confirm target
//   moment               the momentFromDecision view-model { memoryIds, isoDate,
//                        placeId (the DECLINED guess), place, kind, coords?,
//                        declinedPlaceIds? }
//   name                 the family's typed words (verbatim; trimmed only for the
//                        empty check — the stop name keeps their exact words)
//   traveler             the answerer (the D13 `by`, the birth-certificate `by`)
//   newStopId            (dayN) => id  — the id maker (claudeCardApply.newStopId in
//                        prod; a deterministic stub in tests). REQUIRED to christen.
//   now                  timestamp for origin.christened.at (deterministic; no Date.now)
//   maskedForAnyMember   true → the created stop is engine-HELD off the shared agenda
//                        until the surprise reveals (the leak is closed, not accepted)
//   memoryById           Map<id,memory> (or {id:memory}) for confirmWritePlan ref-keys
//   candidates           optional explicit collapse candidates (with exemplarAgree)
//   diceThreshold/nearMeters/farMeters   guard seeds (override for tests)
export function christenPlan(opts = {}) {
  const {
    trip,
    moment = {},
    name,
    traveler = null,
    newStopId,
    now = null,
    maskedForAnyMember = false,
    memoryById,
    candidates,
    diceThreshold,
    nearMeters,
    farMeters,
  } = opts
  const tripId = opts.tripId || trip?.id || null
  // Only DEFINED overrides — spreading `undefined` would clobber CHRISTEN_DEFAULTS
  // (then `d <= undefined` is always false and coords could never agree/contradict).
  const guardOpts = {}
  if (diceThreshold !== undefined) guardOpts.diceThreshold = diceThreshold
  if (nearMeters !== undefined) guardOpts.nearMeters = nearMeters
  if (farMeters !== undefined) guardOpts.farMeters = farMeters

  // --- SKIP: empty field → zero writes anywhere, residue-free (test #1). Abandoning
  // the field must never half-write; identical to the S1 quiet skip. ---
  const words = typeof name === 'string' ? name.trim() : ''
  if (!words) {
    return {
      decision: 'skip',
      citation: 'empty field — no write',
      dimensions: {},
      createdStop: null,
      filings: [],
      gpsStamps: [],
      post: null,
      steps: [],
      receipt: { pending: null, success: null, degraded: null, active: 'none', timing: 'no-op' },
      masking: { deferred: false },
      deletion: null,
      teaching: null,
      degraded: null,
      blocked: null,
    }
  }

  // --- The multidimensional guard: is this typed name actually an EXISTING stop? ---
  const cand = Array.isArray(candidates) ? candidates : deriveCandidates(trip)
  const resolved = resolveCollapse(name, moment, cand, guardOpts)

  const n = Array.isArray(moment.memoryIds) ? moment.memoryIds.length : 0

  // === PICK (collapse to an existing stop — no twin minted, test #2) ==============
  if (resolved.collapse) {
    // File to the EXISTING stop via the shipped seam. A geocoded existing stop
    // propagates its coords (Level-2 fires — it IS a real-stop confirm); an
    // un-geocoded one yields gpsStamps:[] — both fall out of confirmWritePlan.
    const { stopFilings, gpsStamps } = confirmWritePlan(
      trip, moment, 'picked', { id: resolved.stopId, label: resolved.stopName }, traveler, memoryById
    )
    const post = collapsePost(tripId, moment, resolved.stopId, resolved.stopName)
    return {
      decision: 'pick',
      collapseTo: { stopId: resolved.stopId, stopName: resolved.stopName },
      citation: resolved.citation,
      dimensions: resolved.dimensions,
      createdStop: null, // NEVER mint a twin
      filings: stopFilings,
      gpsStamps,
      post,
      // Ordering: the existing stop is already on the synced agenda, so file → POST
      // (no trip-mutate/ack needed — the album can already render this id).
      steps: [
        { step: 'file-photos', filings: stopFilings, gpsStamps, via: 'updateMemoryStop', requires: [] },
        { step: 'confirm-post', body: post, via: 'POST /heal-confirm', requires: ['file-photos'], onFail: 'queue-retry' },
      ],
      receipt: receiptMachine({ name: resolved.stopName, n, deferred: false, blocked: false }),
      masking: { deferred: false },
      deletion: null, // the family owns a pre-existing stop; a christening didn't mint it
      teaching: {
        exemplars: { via: 'confirmedAsExemplars', stopId: resolved.stopId, memoryIds: moment.memoryIds || [] },
        levelTwoCoordProp: gpsStamps.length > 0,
      },
      degraded: null,
      blocked: null,
    }
  }

  // === CHRISTEN (create a distinct real day stop) =================================
  // Resolve the day (and its 1-based ordinal for the id). No matching day → we cannot
  // append a stop; degrade honestly to the S1 words-only fallback (never invent a
  // day, never orphan a stop). Common-sense-up-front: walk the real edge.
  const days = tripDays(trip)
  const dayIdx = days.findIndex((d) => d?.isoDate === moment.isoDate)
  const dayN = dayIdx >= 0 ? dayIdx + 1 : null

  if (dayN == null || typeof newStopId !== 'function') {
    const post = freetextPost(tripId, moment, name)
    return {
      decision: 'christen',
      blocked: dayN == null ? 'no-day' : 'no-id-maker',
      citation: resolved.citation,
      dimensions: resolved.dimensions,
      createdStop: null,
      filings: [],
      gpsStamps: [],
      // The words still land as S1 feedback — a plain 'corrected' words-only POST.
      post,
      steps: [{ step: 'confirm-post', body: post, via: 'POST /heal-confirm', requires: [], onFail: 'queue-retry' }],
      receipt: receiptMachine({ name: words, n, deferred: false, blocked: true }),
      masking: { deferred: false },
      deletion: null,
      teaching: null,
      degraded: { trigger: 'no-day', active: true, post, createdStop: null, filings: [] },
    }
  }

  const christenedId = newStopId(dayN)
  // The new stop: the EXACT shape + id convention the Claude-card builder mints
  // (claudeCardApply.js). No coords — none are known; coords arrive later honestly (a
  // GPS-bearing photo filed here, a future locate action), never invented.
  const createdStop = {
    id: christenedId,
    name, // the family's words, VERBATIM (not the trimmed check copy)
    kind: 'stop',
    // the birth certificate — data_json is schema-free, engine-readable, family-
    // invisible (spec line 78). A4: this also seeds the lexicon branch + the place's
    // dimension-signature from its confirmed photos (automatic once O8's fold lands).
    origin: { christened: { by: traveler, at: now, fromMoment: moment.memoryIds || [] } },
  }

  // The filing plan for the NEW id. Build it against the trip WITH the new stop so the
  // seam sees a real stop; because the stop has no coords, confirmedStopCoords → null
  // → gpsStamps:[] (Level-2 does NOT fire for a christening).
  const tripWithStop = withAppendedStop(trip, dayIdx, createdStop)
  const { stopFilings, gpsStamps } = confirmWritePlan(
    tripWithStop, moment, 'picked', { id: christenedId, label: name }, traveler, memoryById
  )
  const post = christenPost(tripId, moment, christenedId, name)

  // THE ORDERING GUARANTEE (the #5 orphan lesson, mandatory): a filing must never
  // point at an id the album can't render. Strict order — trip-mutate + AWAIT ACK,
  // THEN file, THEN /heal-confirm. Encoded as `requires` so the executor can't reorder.
  const steps = [
    { step: 'trip-mutate', op: 'append-stop', dayN, dayIso: moment.isoDate, stop: createdStop, via: 'pushTrip', awaitAck: true },
    { step: 'file-photos', filings: stopFilings, gpsStamps, via: 'updateMemoryStop', requires: ['trip-ack'] },
    // step-3 failure after the filings landed is QUEUED + retried through the sync-
    // honesty queue (carrying the A1 lean snapshot) — the ledger row must eventually
    // land or the retry surfaces as unsynced.
    { step: 'confirm-post', body: post, via: 'POST /heal-confirm', requires: ['trip-ack', 'file-photos'], onFail: 'queue-retry' },
  ]

  // MASKING (spec lines 118-123): a christening born from a moment masked for ANY
  // member has its shared-agenda entry DEFERRED (engine-held) until the surprise
  // reveals — the created stop must NOT hit the shared trip now, or it leaks that a
  // surprise-tagged moment exists. The whole christening (mutate/file/POST) is held
  // and replayed at reveal; the answerer's receipt stays honest.
  const masking = maskedForAnyMember
    ? { deferred: true, holdUntilReveal: true, replayTrigger: 'surprise-reveal', reason: 'moment masked for a member' }
    : { deferred: false }
  if (masking.deferred) for (const s of steps) s.holdUntilReveal = true

  return {
    decision: 'christen',
    blocked: null,
    citation: resolved.citation, // "'the beach' exists now" — the settled fact names what happened (§16b)
    dimensions: resolved.dimensions,
    createdStop,
    dayN,
    dayIso: moment.isoDate,
    filings: stopFilings,
    gpsStamps, // [] — no coords to propagate (Level-2 abstains, not a defect)
    post,
    steps,
    receipt: receiptMachine({ name: words, n, deferred: masking.deferred, blocked: false }),
    masking,
    // The delete-after-filing handler the executor wires to this stop's trip-editor
    // delete: release the D13 locks, re-open the photos loose, show the notice.
    deletion: { handler: 'releaseChristenedStop', stopId: christenedId, filedMemoryIds: stopFilings.map((f) => f.memoryId) },
    // What it teaches (the forward loop) — A6/A7 make these MEASURED-LATER, not
    // predicted at settle:
    teaching: {
      // the confirmed photos become lookalike exemplars keyed to the NEW id.
      exemplars: { via: 'confirmedAsExemplars', stopId: christenedId, memoryIds: moment.memoryIds || [] },
      // A9: the world model keys the christened stop by STOP ID, with the name as a
      // lexicon alias (rename-safe, A4); one-visit "whisper" strength, §13.
      worldModel: { keyedBy: 'stopId', stopId: christenedId, nameAlias: name, strength: 'whisper', lexicon: true },
      // A7: the exemplar/lexicon/world-model deltas ENQUEUE the same corpus-wide,
      // lock-holding, shadow-gated re-settle a calibration does — the christened stop
      // joins the trip-wide re-heal (runHealForTrip), so OTHER loose moments that
      // belong there can heal to it. AUTO-tier only; every manual/'confirmed' filing
      // is D13-locked, untouchable.
      reSettle: { scope: 'trip+corpus', trigger: 'runHealForTrip', locksHold: true, shadowGated: true, autoTierOnly: true },
      // no coords → the spatial channels abstain toward it; NO compensating boost
      // (weights are fit, never felt). Level-2 coord-propagation does not fire.
      levelTwoCoordProp: false,
    },
    // The degraded branch (terminal trip-push failure): no created stop, no filing, no
    // christening confirm — the words fall back to the S1 free-text 'corrected' POST.
    // The executor takes this when step-1 (trip-mutate/pushTrip) fails terminally,
    // replacing the PENDING state with the S1 words-kept copy.
    degraded: {
      trigger: 'trip-push-terminal-fail',
      active: false,
      createdStop: null,
      filings: [],
      gpsStamps: [],
      post: freetextPost(tripId, moment, name),
      receipt: { key: 's1.freetext.kept', text: 'Kept your words' },
    },
  }
}

// Append a stop to a day, preserving the trip.days vs trip.data.days shape (mirrors
// withDays, claudeCardApply.js). Pure — returns a new trip; used only to build the
// filing plan against a real stop (the executor's own pushTrip does the live mutate).
function withAppendedStop(trip, dayIdx, stop) {
  const days = tripDays(trip)
  const nextDays = days.map((d, i) => (i === dayIdx ? { ...d, stops: [...(d?.stops || []), stop] } : d))
  if (trip?.data) return { ...trip, data: { ...trip.data, days: nextDays } }
  return { ...trip, days: nextDays }
}
