// lattice/people.js — the PEOPLE branch of the world-model FACT LATTICE
// (DESIGN_THE_HEALING_MODEL.md §16d, one branch of six).
//
// The family MEMBERS as first-class subjects of learning. HM-3's world model held
// PLACES only; §16d's catch was that §16c's schema induction had nowhere to post what
// it learns about *people*. This branch is that home. Four people-shaped families of
// fact, every one grounded in a signal the app ALREADY HOLDS:
//
//   • photographer habits — which author shoots which KIND of place (author_traveler ×
//     the photos' vision placeType). "Rafa shoots beaches; Dad shoots dinners." Feeds
//     the uploader witness: a memory's author nudges toward the place-kinds they favour.
//   • presence & groupings — who is on a scene with whom (co-occurrence over trip-days),
//     and who SPLITS OFF (a scene they authored alone). The who's-together tally (§9.2)
//     lifted to a durable cross-trip fact.
//   • curation styles — who FILES / CONFIRMS / SETS-ASIDE (the feedback ledger's
//     by_traveler × action). The per-person half of §16c's class-trust.
//   • answer-routing voice — whose answers land on which question CLASS (by_traveler ×
//     kind A/B/C/D). "Structure questions? ask Mom." Feeds WHO-routing (§17).
//
// This is a fact LATTICE branch, shaped like ITSELF — not like the place-list world
// model, not like a bench witness. The guards it shares with every branch (§16d):
//
//   • A fact NUDGES, never asserts. Confidence is CLAMPED at `confidenceCeiling`, well
//     below any observed witness's weight — so the off-habit photo (Rafa's one museum
//     shot) always wins on its own evidence; the habit can only whisper. There is no
//     data volume that lets a people-fact assert.
//   • Absence ABSTAINS; it is NEVER a negative vote (§13, §16b-heterogeneous). A person
//     with no photos yields no photographer fact; an empty feedback ledger yields no
//     curation/voice facts; a place-kind someone never shot yields no fact — silence,
//     not a zero. And a MINORITY reading is never demoted to silence: a kind shot once
//     still speaks (imperfection is the medium — the pinned §13 drift is muting a real
//     but thin channel, so this branch emits a fact for every reading seen ≥ once and
//     lets the confidence carry how thin it is).
//   • Scale honesty by SHRINKAGE-TO-PARENT (empirical-Bayes partial pooling). At ~4
//     trips a person's share estimate is PULLED toward the family baseline (their
//     parent) until their own data outweighs the pseudocount — so a habit seen twice is
//     a whisper near the family average, not a confident claim. The lattice fills at the
//     family's own rate (§16d).
//   • DECAY. A person who's gone quiet has their facts fade (a member who moved away, a
//     child whose style changed) — a stale pattern loses its voice rather than dragging
//     new photos toward an old habit.
//   • Every fact CITES its source rows (memory ids / feedback ids) — gauge-auditable;
//     deleting a cited row unlearns exactly the fact it fed (§16d, §7).
//   • Every constant is a DECLARED SEED (§15b) — provisional until fit from real data,
//     never a felt value, and none shared with a sibling branch (§13 heterogeneity).
//
// PURE REPLAY FOLD (§16c keystone): recomputed each run from the ledgers, zero stored
// state, DETERMINISTIC — `now` comes from opts, the clock is never read here. Write-free.

const DAY = 86400000
const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)

// SEED values (§15b) — provisional until fit from the family's real data (HM-5-style
// ablation), never tuned by feel, and each independently reasoned for THIS branch (no
// constant is borrowed from worldModel/bench — a shared threshold would be the §13
// heterogeneity sin). None may be lowered by judgment; only a measurement re-grades.
export const PEOPLE_DEFAULTS = {
  // CLAMP — a people-fact is a prior on a PERSON, the softest kind of nudge; capped
  // well below the observed-witness band (currentFiling 0.7, humanConfirm 0.95) so it
  // can never out-vote a real read of where a photo actually is.
  confidenceCeiling: 0.45,
  // Empirical-Bayes pseudocount: a person's share is pulled toward the family baseline
  // as if by this many phantom observations of the average. Small enough that a genuine
  // habit surfaces within a few trips, large enough that one or two photos don't assert
  // a "habit" — the mechanical form of "at ~4 trips, whispers shrinking to their parent".
  shrinkPseudo: 4,
  // Observations at which the evidence-weight reaches ~0.5 (a smooth ramp 0→1, NOT a
  // cutoff): confidence grows with how many times we actually saw the reading. A fact
  // seen once is a real whisper, not an absence.
  confidenceHalf: 6,
  // A person's habit/curation style persists longer than a place stays relevant, so this
  // half-life is independently longer than the world model's place decay — people change
  // their rhythms slower than a beach house gets sold. Seed, its own reasoning.
  decayHalfLifeDays: 1095,
}

const KNOWN_ACTIONS = new Set(['confirmed', 'corrected', 'aside'])
const KNOWN_KINDS = new Set(['A', 'B', 'C', 'D'])

// ---- pure helpers -----------------------------------------------------------
// Empirical-Bayes shrink: pull an observed share toward its parent (the family
// baseline) by `pseudo` phantom observations of that parent. Thin data ⇒ ~parent
// (a whisper near the average); thick data ⇒ ~raw. This IS scale honesty (§16d).
const shrink = (count, total, parentShare, pseudo) =>
  total + pseudo > 0 ? (count + pseudo * clamp01(parentShare)) / (total + pseudo) : 0
// Evidence-weight: how much this fact has EARNED, smoothly, from its own observation
// count — never a gate, so a single sighting still emits (at low weight).
const evidenceWeight = (n, half) => (half > 0 ? n / (n + half) : n > 0 ? 1 : 0)
// Decay a fact by how long since the person was last active. No usable date ⇒ 1 (we
// don't penalise what we can't date — that would be inventing staleness, §13).
const decayFactor = (lastMs, nowMs, halfDays) => {
  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs) || !(halfDays > 0)) return 1
  return clamp01(Math.pow(0.5, Math.max(0, nowMs - lastMs) / (halfDays * DAY)))
}
// Assemble one fact in the lattice's common shape, with the branch guards baked in.
const makeFact = (type, subject, value, count, total, lastMs, nowMs, rows, o) => {
  const recencyDecay = decayFactor(lastMs, nowMs, o.decayHalfLifeDays)
  const confidence = clamp01(o.confidenceCeiling * evidenceWeight(count, o.confidenceHalf) * recencyDecay)
  return {
    type,
    subject,
    value: { ...value, observations: count, of: total },
    confidence, // CLAMPED ≤ confidenceCeiling — a nudge, never an assertion
    recencyDecay,
    sourceRows: [...rows].map(String).sort(), // cite the ledger; deterministic order
  }
}

const authorOf = (m) =>
  (typeof m?.author_traveler === 'string' && m.author_traveler) ||
  (typeof m?.authorTraveler === 'string' && m.authorTraveler) ||
  (typeof m?.author === 'string' && m.author) ||
  null

function photosOf(m) {
  if (Array.isArray(m?.photos)) return m.photos
  if (Array.isArray(m?.photo_r2_keys)) return m.photo_r2_keys
  if (typeof m?.photo_r2_keys_json === 'string') {
    try {
      const a = JSON.parse(m.photo_r2_keys_json)
      return Array.isArray(a) ? a : []
    } catch {
      return []
    }
  }
  return []
}
// vision placeType lives at p.vision.placeType (raw memory) or p.placeType (points shape).
const placeTypeOf = (p) => (p && typeof p === 'object' ? p.vision?.placeType ?? p.placeType ?? null : null)

// ---- the fold ---------------------------------------------------------------
// buildPeopleFacts(trips, memories, feedback, opts) => facts[]
//   trips:    [{ id, endMs?, days?:[{ isoDate, stops:[{ id }] }] }]  (recency + scene-day scoping)
//   memories: [{ id, trip_id, stop_id?, author_traveler, photo_r2_keys_json|photos[] }]
//   feedback: [{ id, by_traveler, action, kind?, at? }]              (the §W3 heal-feedback ledger)
//   opts:     { now?, ...PEOPLE_DEFAULTS overrides }                 (now is REQUIRED for decay; never read the clock)
export function buildPeopleFacts(trips, memories, feedback, opts = {}) {
  const o = { ...PEOPLE_DEFAULTS, ...opts }
  const now = Number.isFinite(opts.now) ? opts.now : null // deterministic: no Date.now fallback

  // trip → last-seen ms (recency) and stop → local day (scene scoping)
  const tripEnd = new Map()
  const stopDay = new Map()
  for (const t of trips || []) {
    if (t?.id == null) continue
    tripEnd.set(t.id, Number.isFinite(t.endMs) ? t.endMs : null)
    for (const d of t.days || []) for (const s of d.stops || []) if (s?.id != null) stopDay.set(String(s.id), d.isoDate ?? null)
  }
  const lastMsOfTrip = (tid) => (tripEnd.has(tid) ? tripEnd.get(tid) : null)

  const facts = []

  // === photographer habits : author_traveler × photos' placeType ============
  // Per author, the SHARE of their photos that are each place-kind, shrunk toward the
  // family-wide place-kind mix (the parent). Silence for a kind never shot; a whisper
  // for one shot once (the §13 anti-mute guard made mechanical).
  const habit = new Map() // traveler -> placeType -> { count, rows:Set, lastMs }
  const authorTotal = new Map() // traveler -> total placeType-bearing photos
  const familyType = new Map() // placeType -> count (the parent)
  let familyTypeTotal = 0
  for (const m of memories || []) {
    const a = authorOf(m)
    if (!a) continue // no author → abstain (can't attribute a habit)
    const tid = m.trip_id ?? m.tripId ?? null
    const last = lastMsOfTrip(tid)
    for (const p of photosOf(m)) {
      const t = placeTypeOf(p)
      if (!t) continue // no vision on this photo → abstain (absence, never a zero)
      if (!habit.has(a)) habit.set(a, new Map())
      const byType = habit.get(a)
      if (!byType.has(t)) byType.set(t, { count: 0, rows: new Set(), lastMs: null })
      const cell = byType.get(t)
      cell.count++
      if (m.id != null) cell.rows.add(m.id)
      cell.lastMs = Number.isFinite(last) ? (cell.lastMs == null ? last : Math.max(cell.lastMs, last)) : cell.lastMs
      authorTotal.set(a, (authorTotal.get(a) || 0) + 1)
      familyType.set(t, (familyType.get(t) || 0) + 1)
      familyTypeTotal++
    }
  }
  for (const [a, byType] of habit) {
    const total = authorTotal.get(a) || 0
    for (const [t, cell] of byType) {
      const parent = familyTypeTotal ? (familyType.get(t) || 0) / familyTypeTotal : 0
      const share = shrink(cell.count, total, parent, o.shrinkPseudo)
      facts.push(makeFact('photographer', a, { dimension: 'placeType', placeType: t, share }, cell.count, total, cell.lastMs, now, cell.rows, o))
    }
  }

  // === presence & groupings : scene co-occurrence, and who splits off ========
  // A "scene" is (trip, day) — the finest scope the app can attribute without a clock
  // it can trust. Day comes from the memory's stop (mapped through the trip) first,
  // then a memory-level iso date, then the whole trip. Authors sharing a scene are
  // together; an author alone on a scene split off.
  const scenes = new Map() // sceneKey -> Map(traveler -> Set(memId))
  const sceneTrip = new Map() // sceneKey -> tripId (for recency)
  for (const m of memories || []) {
    const a = authorOf(m)
    if (!a) continue
    const tid = m.trip_id ?? m.tripId ?? null
    if (tid == null) continue // no trip → can't scope a scene → abstain from presence
    const sid = m.stop_id ?? m.stopId ?? null
    let day = sid != null && stopDay.has(String(sid)) ? stopDay.get(String(sid)) : null
    if (day == null) day = m.iso_date ?? m.isoDate ?? null
    if (day == null) day = '__trip__'
    const key = `${tid}::${day}`
    if (!scenes.has(key)) { scenes.set(key, new Map()); sceneTrip.set(key, tid) }
    const byTrav = scenes.get(key)
    if (!byTrav.has(a)) byTrav.set(a, new Set())
    if (m.id != null) byTrav.get(a).add(m.id)
  }
  // pair co-presence (Jaccard over scenes) + solo tallies, with family parents
  const travScenes = new Map() // traveler -> Set(sceneKey)
  const travLastMs = new Map() // traveler -> lastMs
  const pair = new Map() // 'a b' -> { inter:Set(sceneKey), rows:Set, lastMs, a, b }
  const solo = new Map() // traveler -> { count, rows:Set, lastMs }
  let soloMemberships = 0
  let allMemberships = 0
  for (const [key, byTrav] of scenes) {
    const travs = [...byTrav.keys()].sort()
    const last = lastMsOfTrip(sceneTrip.get(key))
    for (const tr of travs) {
      if (!travScenes.has(tr)) travScenes.set(tr, new Set())
      travScenes.get(tr).add(key)
      if (Number.isFinite(last)) travLastMs.set(tr, Math.max(travLastMs.get(tr) ?? -Infinity, last))
      allMemberships++
    }
    if (travs.length === 1) {
      const tr = travs[0]
      soloMemberships++
      if (!solo.has(tr)) solo.set(tr, { count: 0, rows: new Set(), lastMs: null })
      const s = solo.get(tr)
      s.count++
      for (const id of byTrav.get(tr)) s.rows.add(id)
      s.lastMs = Number.isFinite(last) ? (s.lastMs == null ? last : Math.max(s.lastMs, last)) : s.lastMs
    }
    for (let i = 0; i < travs.length; i++) {
      for (let j = i + 1; j < travs.length; j++) {
        const pk = `${travs[i]} ${travs[j]}`
        if (!pair.has(pk)) pair.set(pk, { inter: new Set(), rows: new Set(), lastMs: null, a: travs[i], b: travs[j] })
        const pr = pair.get(pk)
        pr.inter.add(key)
        for (const id of byTrav.get(travs[i])) pr.rows.add(id)
        for (const id of byTrav.get(travs[j])) pr.rows.add(id)
        pr.lastMs = Number.isFinite(last) ? (pr.lastMs == null ? last : Math.max(pr.lastMs, last)) : pr.lastMs
      }
    }
  }
  // parent for co-presence = the family's MEAN raw togetherness across all pairs
  const rawJ = []
  for (const pr of pair.values()) {
    const union = (travScenes.get(pr.a)?.size || 0) + (travScenes.get(pr.b)?.size || 0) - pr.inter.size
    rawJ.push(union > 0 ? pr.inter.size / union : 0)
  }
  const parentTogether = rawJ.length ? rawJ.reduce((s, x) => s + x, 0) / rawJ.length : 0
  for (const pr of pair.values()) {
    const union = (travScenes.get(pr.a)?.size || 0) + (travScenes.get(pr.b)?.size || 0) - pr.inter.size
    const share = shrink(pr.inter.size, union, parentTogether, o.shrinkPseudo)
    facts.push(makeFact('copresence', [pr.a, pr.b], { withWhom: [pr.a, pr.b], share }, pr.inter.size, union, pr.lastMs, now, pr.rows, o))
  }
  // parent for splitting = the family's overall solo rate
  const parentSolo = allMemberships ? soloMemberships / allMemberships : 0
  for (const [tr, s] of solo) {
    const active = travScenes.get(tr)?.size || 0
    const share = shrink(s.count, active, parentSolo, o.shrinkPseudo)
    facts.push(makeFact('solo', tr, { dimension: 'splitsOff', share }, s.count, active, s.lastMs, now, s.rows, o))
  }

  // === curation styles : feedback by_traveler × action ======================
  // Of a person's terminal card actions, the SHARE that are confirm / correct / aside,
  // shrunk toward the family's overall action mix. The per-person class-trust half (§16c).
  const cur = new Map() // traveler -> action -> { count, rows:Set, lastMs }
  const curTotal = new Map() // traveler -> total actions
  const familyAction = new Map() // action -> count (parent)
  let familyActionTotal = 0
  // answer-routing voice : per question CLASS, who answered it
  const kindTally = new Map() // kind -> traveler -> { count, rows:Set, lastMs }
  const kindTotal = new Map() // kind -> total answers of that class
  const voiceTravelers = new Set() // distinct answerers (for the uniform parent)
  for (const f of feedback || []) {
    const tr = (typeof f?.by_traveler === 'string' && f.by_traveler) || (typeof f?.byTraveler === 'string' && f.byTraveler) || null
    if (!tr) continue // no actor → abstain
    const at = Number.isFinite(f.at) ? f.at : null
    const action = f.action
    if (KNOWN_ACTIONS.has(action)) {
      if (!cur.has(tr)) cur.set(tr, new Map())
      const byAct = cur.get(tr)
      if (!byAct.has(action)) byAct.set(action, { count: 0, rows: new Set(), lastMs: null })
      const cell = byAct.get(action)
      cell.count++
      if (f.id != null) cell.rows.add(f.id)
      cell.lastMs = at == null ? cell.lastMs : cell.lastMs == null ? at : Math.max(cell.lastMs, at)
      curTotal.set(tr, (curTotal.get(tr) || 0) + 1)
      familyAction.set(action, (familyAction.get(action) || 0) + 1)
      familyActionTotal++
    }
    const kind = f.kind
    if (KNOWN_KINDS.has(kind)) {
      voiceTravelers.add(tr)
      if (!kindTally.has(kind)) kindTally.set(kind, new Map())
      const byTrav = kindTally.get(kind)
      if (!byTrav.has(tr)) byTrav.set(tr, { count: 0, rows: new Set(), lastMs: null })
      const cell = byTrav.get(tr)
      cell.count++
      if (f.id != null) cell.rows.add(f.id)
      cell.lastMs = at == null ? cell.lastMs : cell.lastMs == null ? at : Math.max(cell.lastMs, at)
      kindTotal.set(kind, (kindTotal.get(kind) || 0) + 1)
    }
  }
  for (const [tr, byAct] of cur) {
    const total = curTotal.get(tr) || 0
    for (const [action, cell] of byAct) {
      const parent = familyActionTotal ? (familyAction.get(action) || 0) / familyActionTotal : 0
      const share = shrink(cell.count, total, parent, o.shrinkPseudo)
      facts.push(makeFact('curation', tr, { action, share }, cell.count, total, cell.lastMs, now, cell.rows, o))
    }
  }
  // voice parent = uniform over the answerers (no reason a priori to route a class to
  // one person) — a class answered mostly by one voice pulls above uniform as data earns it.
  const parentVoice = voiceTravelers.size ? 1 / voiceTravelers.size : 0
  for (const [kind, byTrav] of kindTally) {
    const total = kindTotal.get(kind) || 0
    for (const [tr, cell] of byTrav) {
      const share = shrink(cell.count, total, parentVoice, o.shrinkPseudo)
      facts.push(makeFact('voice', tr, { kind, share }, cell.count, total, cell.lastMs, now, cell.rows, o))
    }
  }

  // Deterministic output order (independent of input ordering).
  facts.sort((x, y) =>
    x.type < y.type ? -1 : x.type > y.type ? 1 :
    JSON.stringify(x.subject) < JSON.stringify(y.subject) ? -1 : JSON.stringify(x.subject) > JSON.stringify(y.subject) ? 1 :
    JSON.stringify(x.value) < JSON.stringify(y.value) ? -1 : JSON.stringify(x.value) > JSON.stringify(y.value) ? 1 : 0
  )
  return facts
}

export default buildPeopleFacts
