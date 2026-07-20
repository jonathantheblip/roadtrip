// lexicon.js — the LEXICON branch of the world-model fact lattice
// (DESIGN_THE_HEALING_MODEL.md §16d; amendments A4, A9, A12, A14).
//
// The family's OWN names for their places — learned from CHRISTENINGS (F2: a typed name
// that creates/confirms a stop — the birth certificate `stop.origin.christened`, echoed by
// the answer ledger) and CAPTIONS (the short labels the family types onto a filed memory).
// A lexicon fact feeds signage / lookalike MATCHING (a sign or a memory that echoes "the
// jetty spot" now finds the stop the family calls that) and card WARMTH (copy that speaks
// the family's word, not a canonical label). It never places a photo on its own.
//
// This is a PURE REPLAY FOLD (§16c): all structure is recomputed each run as a fold over
// the ledgers the app already keeps (trips + memories + the answer ledger). No stored
// state; deterministic — `now` comes from opts, never the clock. A local artifact — no
// schema, no migration — until that gate. It edits NO shared file; the Integrate phase
// composes it into the signage/lookalike witnesses.
//
// The lessons live in the SHAPE, so a later reader can't quietly undo them:
//
//   • KEYED BY STOP ID; the name is an ALIAS (A9 / the founding Provincetown lesson in
//     lexical clothes). Two stops the family both call "the beach" stay TWO facts — a
//     shared name NEVER collapses two places, and one stop's alias NEVER leaks to the
//     other. Rename-safe: the editor can rename the stop and the warm word still resolves,
//     because we key the identity, not the string.
//   • A NAME NUDGES, never asserts (CLAMP). Confidence caps at `lexiconCeiling`, chosen
//     deliberately BELOW every observed human signal (a filing 0.7, a confirm 0.95, a
//     legible sign ~1). So a photo that really belongs to another stop always wins on its
//     own evidence; the family's warm name only warms and helps match — it never drags a
//     placement (the interactive-activation overconfidence trap, in lexical form).
//   • SOURCE-GRADED, never felt (§13). A christening (the family SPOKE the name) outweighs
//     a caption (ambient) by a measured seed weight, not a judgment call — and every weight
//     here is a SEED, fit from real data later, never tuned down by anxiety. No source is
//     switched off: a single caption still WHISPERS (there is no ≥N-uses cutoff).
//   • DECAYING. A name unused for years quietly softens (a place the family moved on from),
//     halving over a long, name-durable half-life — slower than a place-recurrence prior,
//     because a name outlives a visit.
//   • ABSENCE ABSTAINS (never a negative vote). A stop with no name yields no fact; an
//     unfiled memory abstains (a censored observation, §7); a long narration caption is not
//     a naming use and contributes NOTHING — that is abstention, not a demotion (§13).
//   • EVERY FACT CITES ITS ROWS. `sourceRows` lists the memory ids / christening rows the
//     alias came from — delete a row and its contribution unlearns on the next pure replay.
//   • SCALE-HONEST (§4). At ~4 trips most aliases are whispers; that is correct, not a
//     defect — the lattice fills at the family's own rate.

const DAY = 86400000
const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const numOr = (x, fallback) => (Number.isFinite(x) ? x : fallback)
const firstStr = (...xs) => {
  for (const x of xs) if (typeof x === 'string' && x.trim()) return x.trim()
  return ''
}

// A name normalizes to its identity key — trim, lower, collapse whitespace — so
// "The Jetty Spot", "the jetty spot " and "the  jetty  spot" are ONE alias (matches the
// world model's normName so the two organs agree on what "the same name" means).
export const normName = (s) => (typeof s === 'string' ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '')

// A tiny stopword set — enough to tell "the beach" (a real name: one meaningful token)
// from "at the" (all filler: no name in it). Deliberately small; it only gates the
// name-SHAPED test below, it never strips tokens from the stored value.
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'at', 'in', 'on', 'to', 'it', 'is', 'was', 'we', 'our', 'my', 'so', 'up', 'by', 'for', 'with', 'here', 'this', 'that'])
const rawWords = (s) => (typeof s === 'string' ? s.trim().split(/\s+/).filter(Boolean) : [])
const meaningfulTokens = (s) => rawWords(s).map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, '')).filter((w) => w.length > 1 && !STOP.has(w))

// SEED values — every number here is provisional until FIT from the family's real data
// (the §13 ablation/calibration lane). None may be tuned DOWN by judgment: demotion-by-
// anxiety is the pinned likeliest drift — only a measurement re-grades a source, locally,
// and even then it whispers rather than goes silent.
export const LEXICON_DEFAULTS = {
  // CLAMP: a name nudges matching/warmth, never asserts a placement — and, crucially,
  // sits BELOW every observed human signal in the bench (currentFiling 0.7, humanConfirm
  // 0.95, a legible sign up to ~1) so a real observation of another place always wins.
  // Above the pure recurrence prior's 0.5 (a christening is a human naming, stronger than
  // a mere "this place recurs" guess) but still far below certainty.
  lexiconCeiling: 0.55,
  // SOURCE grades (a "use" is one time the family named this stop). A christening is the
  // family SPEAKING the name deliberately; a caption is ambient. The ratio is the whole
  // "source-graded not felt" lesson — a seed, fit by ablation, never lowered by temperament.
  christeningWeight: 1.0,
  captionWeight: 0.35,
  // Smooth growth with weighted use-count — NO cutoff. One caption still whispers; a
  // christening lands meaningfully; repeats harden it toward (never to) the ceiling.
  halfUses: 1.0, // weighted uses at which alias strength reaches ~0.5
  // A name is durable — it decays SLOWER than a place-recurrence prior (worldModel: 730d):
  // the family keeps calling a place its name long after the last visit. Still it must
  // fade — a name unused for ~3 years is halved.
  decayHalfLifeDays: 1095,
  // A caption is a NAME use only when it is name-SHAPED — a short label ("Blue Heron",
  // "the jetty spot", "Grandma's"), not a sentence ("what a beautiful sunset over the
  // harbor"). A longer caption ABSTAINS from naming (it is not a negative — echo-matching
  // a known alias inside a long caption is a future refinement, deliberately not v1).
  captionNameMaxWords: 5,
}

const strengthFromUses = (weighted, half) => (half > 0 ? 1 - Math.pow(0.5, Math.max(0, weighted) / half) : 0)
const decay = (latestMs, nowMs, halfDays) => {
  if (!Number.isFinite(latestMs) || !Number.isFinite(nowMs) || !(halfDays > 0)) return 1 // no clock / no timestamp → can't decay → abstain from decaying (never a penalty)
  return clamp01(Math.pow(0.5, Math.max(0, nowMs - latestMs) / (halfDays * DAY)))
}

// A caption counts as the family NAMING this place when it reads like a label, not a
// narration: short (≤ captionNameMaxWords) and carrying at least one meaningful token.
function isNameShaped(raw, o) {
  const words = rawWords(raw)
  if (!words.length || words.length > o.captionNameMaxWords) return false
  return meaningfulTokens(raw).length >= 1
}

// Index every trip's real stops (christened or not). A lexicon fact may only attach to a
// REAL stop — never a base/synthetic id (`__trip_base__:…`, `__vision__`, `__discovered__`)
// which name nothing the family would christen (the synthetic-id trap the confirm-stamp
// fix flagged). Handles both corpus shapes: trip.days[].stops and the flattened trip.stops.
function indexStops(trips) {
  const stopsByTrip = new Map() // tripId -> Map(stopId -> stop)
  const realStopIds = new Set()
  for (const trip of trips || []) {
    if (!trip) continue
    const m = new Map()
    const absorb = (stop) => {
      if (stop && stop.id != null && !m.has(stop.id)) { m.set(stop.id, stop); realStopIds.add(stop.id) }
    }
    for (const day of trip.days || []) for (const stop of day.stops || []) absorb(stop)
    for (const stop of trip.stops || []) absorb(stop)
    stopsByTrip.set(trip.id, m)
  }
  return { stopsByTrip, realStopIds }
}

// Collect NAME USES: every time the family named a specific stop, as {stopId, kind, raw,
// norm, ts, weight, row}. Christening uses are deduped by (stopId, name) so ONE christening
// seen in both the birth certificate and the answer ledger counts once but cites both rows.
function collectUses(trips, memories, feedback, o, idx) {
  const { stopsByTrip, realStopIds } = idx
  const christenByKey = new Map() // `${stopId} ${norm}` -> use (deduped)
  const addChristening = (stopId, raw, ts, row) => {
    const norm = normName(raw)
    if (!stopId || !norm || !realStopIds.has(stopId)) return // never name a stop that doesn't exist
    const key = `${stopId} ${norm}`
    const prev = christenByKey.get(key)
    if (prev) {
      if (!prev.rows.includes(row)) prev.rows.push(row)
      if (Number.isFinite(ts)) prev.ts = Number.isFinite(prev.ts) ? Math.max(prev.ts, ts) : ts
    } else {
      christenByKey.set(key, { stopId, kind: 'christening', raw: raw.trim(), norm, ts: numOr(ts, null), weight: o.christeningWeight, rows: [row] })
    }
  }

  // (1) the durable birth certificate — the christened NAME is the stop's own name (F2).
  for (const [, stops] of stopsByTrip) {
    for (const [stopId, stop] of stops) {
      const ch = stop && stop.origin && stop.origin.christened
      if (!ch) continue
      const raw = typeof stop.name === 'string' ? stop.name.trim() : ''
      if (raw) addChristening(stopId, raw, numOr(ch.at, null), `christen:${stopId}`)
    }
  }
  // (2) the answer ledger corroborates when it carries the name (defensive: the ledger
  //     schema is not frozen, so read several plausible fields; abstain when a row names
  //     no stop or no word). Never depended on — (1) is authoritative for the name text.
  for (const f of feedback || []) {
    const isChristen = f && (f.kind === 'christening' || f.kind === 'christen' || f.christened === true || (f.origin && f.origin.christened))
    if (!isChristen) continue
    const stopId = f.stopId ?? f.stop_id ?? f.placeId ?? f.correctedPlaceId ?? f.confirmedStopId ?? f.christenedStopId
    const raw = firstStr(f.name, f.christenedName, f.placeName, f.text)
    if (!raw) continue
    addChristening(stopId, raw, numOr(f.at ?? f.createdAt ?? f.created_at, null), f.id ?? `christen-fb:${stopId}`)
  }

  const uses = [...christenByKey.values()].map((u) => ({ ...u, row: u.rows[0], rows: u.rows }))

  // (3) captions — a name-shaped label on a memory the family already FILED to a real stop.
  //     The filing is the family's own act, so harvesting the label they wrote there is
  //     honest; we invent no association. Unfiled / synthetic-filed / narration → abstain.
  for (const mem of memories || []) {
    if (!mem) continue
    if ((mem.deleted_at ?? mem.deletedAt) != null) continue // tombstone → the row is gone
    const stopId = mem.stop_id ?? mem.stopId
    if (!stopId) continue // unfiled → abstain (a censored observation, never a negative — §7)
    const tripId = mem.trip_id ?? mem.tripId
    const exists = (tripId != null && stopsByTrip.get(tripId)?.has(stopId)) || realStopIds.has(stopId)
    if (!exists) continue // base / synthetic id, or a deleted stop → name nothing
    const raw = typeof mem.caption === 'string' ? mem.caption.trim() : ''
    if (!isNameShaped(raw, o)) continue // empty or narration → not a NAME use (abstain)
    uses.push({ stopId, kind: 'caption', raw, norm: normName(raw), ts: numOr(mem.created_at ?? mem.createdAt, null), weight: o.captionWeight, row: mem.id, rows: [mem.id] })
  }
  return uses
}

// Deterministic display form: prefer a christening's verbatim words (the family's chosen
// name), else the most-recent caption; ties broken by ts desc then lexicographically.
function displayForm(groupUses) {
  const ranked = [...groupUses].sort((a, b) =>
    (b.weight - a.weight) ||
    ((Number.isFinite(b.ts) ? b.ts : -Infinity) - (Number.isFinite(a.ts) ? a.ts : -Infinity)) ||
    a.raw.localeCompare(b.raw))
  return ranked[0].raw
}

// buildLexicon — the pure fold: (trips, memories, feedback, opts) => the family's names.
// Returns { facts, byStop }. Each fact NUDGES, never asserts:
//   { subject: <stopId>, value: <the family's word>, normalized, confidence in [0,1]
//     (CLAMPED < certainty), recencyDecay, tier:'prior', uses, sources, sourceRows:[ids] }
export function buildLexicon(trips, memories, feedback, opts = {}) {
  const o = { ...LEXICON_DEFAULTS, ...opts }
  const now = Number.isFinite(opts.now) ? opts.now : null // NEVER Date.now() — deterministic replay
  const idx = indexStops(trips)
  const uses = collectUses(trips, memories, feedback, o, idx)

  const groups = new Map() // `${stopId} ${norm}` -> { stopId, norm, uses:[] }
  for (const u of uses) {
    const key = `${u.stopId} ${u.norm}`
    if (!groups.has(key)) groups.set(key, { stopId: u.stopId, norm: u.norm, uses: [] })
    groups.get(key).uses.push(u)
  }

  const facts = []
  for (const g of groups.values()) {
    const weighted = g.uses.reduce((s, u) => s + u.weight, 0)
    const strength = strengthFromUses(weighted, o.halfUses)
    const tsList = g.uses.map((u) => u.ts).filter(Number.isFinite)
    const latestTs = tsList.length ? Math.max(...tsList) : null
    const recencyDecay = decay(latestTs, now, o.decayHalfLifeDays)
    const confidence = clamp01(o.lexiconCeiling * strength * recencyDecay)
    // union of every cited row across the group's uses (gauge-auditable provenance)
    const sourceRows = [...new Set(g.uses.flatMap((u) => u.rows || [u.row]))]
    const sources = [...new Set(g.uses.map((u) => u.kind))].sort()
    facts.push({
      subject: g.stopId,
      value: displayForm(g.uses),
      normalized: g.norm,
      confidence,
      recencyDecay,
      tier: 'prior', // a clamped, non-observed nudge — heals softly, never files silently
      uses: weighted,
      sources,
      sourceRows,
    })
  }
  // deterministic order — subject, then strongest alias first, then name
  facts.sort((a, b) => String(a.subject).localeCompare(String(b.subject)) || (b.confidence - a.confidence) || a.normalized.localeCompare(b.normalized))

  const byStop = new Map()
  for (const f of facts) {
    if (!byStop.has(f.subject)) byStop.set(f.subject, [])
    byStop.get(f.subject).push(f)
  }
  return { facts, byStop }
}

// The aliases the family uses for one stop, strongest first (for the Integrate phase's
// signage/lookalike matching + warm copy). Absent stop → [] (abstains like any missing
// signal). A convenience read over buildLexicon's result; it decides nothing.
export function aliasesForStop(lexicon, stopId) {
  return (lexicon?.byStop?.get(stopId) || []).slice()
}
