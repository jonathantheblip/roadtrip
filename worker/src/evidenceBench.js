// evidenceBench.js — HM-1 of the Healing Model (DESIGN_THE_HEALING_MODEL.md §12.1).
//
// The bench lays every witness's read of a trip's photos out in ONE common shape:
// GRADED evidence carrying a TIER and its SOURCE. It DECIDES NOTHING — there is no
// pick, no argmax, no threshold here; settling is HM-2's job. The lessons are built
// into the shape itself, so a later reader can't quietly undo them:
//
//   • No single element is ever definitive. A witness never returns "the answer"; it
//     returns graded support. The current filing is one witness among peers (§7).
//   • Possibility, not probability. Placement support is MEMBERSHIP in [0,1], NOT a
//     distribution that sums to 1 — so several stacked places (the Provincetown
//     lodging + beach + parade) can ALL be ~1 at once (genuine conflict), which a
//     normalized probability would have forced into a false split.
//   • Ignorance ≠ conflict. A witness with no signal EMITS NOTHING (abstains). Only a
//     witness whose signal is spread over several candidates emits a wide support.
//     Absence-of-evidence and conflicting-evidence are structurally different things.
//   • No hard rules. Every boundary is a SOFT kernel with a scale parameter, never a
//     cutoff. The scales default here and are meant to be FIT from real gap/distance
//     distributions later (HM-5); they are graded knobs, not thresholds.
//   • Derived never poses as observed. Imputed evidence carries tier:'derived'; the
//     accumulator (HM-2) must never count it as an independent observation of what it
//     was derived from.
//
// Pure + node-tested. It consumes NORMALIZED points/places — the same real per-photo
// signals the heal pipeline already extracts (sessionHeal) — so it reuses the witness
// fleet's extraction rather than reinventing it. App-canonical; the worker mirror +
// parity test come when it enters the heal path (nothing ships today — no premature
// duplication).
//
// Expected shapes (the ADAPTER, HM-5, threads these from real memories):
//   point: { id, at:localMs, lat?, lng?, provGps?, timeAnchorSuspect?,
//            currentStopId?, seq?, device?, scene?, faces?:string[], placeType? }
//   place: { id, name?, lat?, lng?, timeMin?, kind? }

import { worldModelWitness } from './worldModel.js'
import { visionWitnesses, inferStopType } from './visionPlacement.js'

// ---- soft kernels (graded — never cutoffs) ---------------------------------
const gaussKernel = (x, scale) => (scale > 0 && Number.isFinite(x) ? Math.exp(-0.5 * (x / scale) ** 2) : 0)
// Heavy-tailed decay for temporal grouping — closer to the ex-Gaussian's exponential
// component than a gaussian, so a genuine long pause inside a moment isn't guillotined.
// (The exact ex-Gaussian / two-component shape is fit from real inter-photo gaps in HM-5.)
const expDecay = (x, tau) => (tau > 0 ? Math.exp(-Math.max(0, x) / tau) : 0)

const R = 6371000
const toRad = (d) => (d * Math.PI) / 180
function haversineMeters(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}
const localMinuteOfDay = (ms) => (Number.isFinite(ms) ? new Date(ms).getUTCHours() * 60 + new Date(ms).getUTCMinutes() : null)
// A GPS coordinate is a real OBSERVATION unless it was explicitly propagated/inferred,
// in which case it is DERIVED and must not pose as an independent read (§3, §5).
const isDerivedCoord = (g) => typeof g === 'string' && (g === 'propagated' || g.startsWith('inferred'))

// SEED values — every number here is provisional until FIT from the family's real
// data (HM-5 ablation + calibration; plan §13). None may be tuned DOWN by judgment:
// demotion-by-anxiety is the pinned likeliest drift — only a measurement re-grades a
// channel, locally, and even then it whispers rather than goes silent.
export const BENCH_DEFAULTS = {
  gpsScaleMeters: 150, // soft spatial kernel — NOT a match radius
  timeScaleMin: 60, // soft time-of-day kernel
  gapTauMin: 25, // soft same-moment decay over the inter-photo gap (heavy tail)
  seqStepTau: 4, // soft same-moment decay over camera-sequence distance
  currentFilingWeight: 0.7, // a filing is STRONG but FALLIBLE evidence — deliberately < 1, never proof
  sceneMatchWeight: 0.8, // exact scene-hash match membership (first-pass; embeddings later)
  minMembership: 0.02, // a witness below this simply doesn't bother emitting the entry (noise floor, not a decision cutoff)
  derivedDamping: 0.6, // a DERIVED coordinate (propagated / imputed) speaks softer than a real read — wider doubt (§12.4)
  humanConfirmWeight: 0.95, // a confirm-tap is a human speech act (observed) — but deliberately < 1: not even a family tap is definitive (§7)
}

// ---- O8 INTEGRATE: the world-model FACT-LATTICE seam (INERT) ----------------
// The six §16d lattice branches (lattice/index.js) compose into the bench through
// `opts.lattice`, and ONLY through it: with NO lattice supplied the bench is byte-
// identical to the pre-lattice bench (the live heal path passes none — this is a shadow,
// off scaffold; nothing family-visible). When a lattice IS supplied, each branch nudges
// its named witness at a DECLARED-SEED whisper weight (§15b: a forced new constant is a
// declared seed, reported, never fitted-and-applied). Every seed MULTIPLIES a branch
// fact's OWN already-clamped confidence, so the product is a whisper-of-a-whisper —
// structurally below the observed-witness band (currentFiling 0.7, humanConfirm 0.95), so
// a lattice nudge can only ever heal softly, never file. None of these constants is
// shared with a sibling branch or with BENCH_DEFAULTS (§13 heterogeneity), and NONE
// changes an existing constant — BENCH_DEFAULTS and SETTLE_DEFAULTS are untouched.
export const LATTICE_DEFAULTS = {
  // PEOPLE → the `uploader` witness (A5/A12): a photographer's kind-habit is a soft prior
  // on where THIS author's photo plausibly sits. Below people.confidenceCeiling (0.45).
  uploaderSeed: 0.25,
  // RHYTHMS → the `rhythm` (time-channel) prior: a daily-shape time-of-day habit is the
  // most diffuse nudge of all. Below the rhythm branch's ceiling (0.45). (The BOUNDARY
  // half of "time/boundary priors" is a settling-engine consumption — a moment-boundary
  // prior — deferred to the measured-integrate phase; the bench seam wires the TIME half.)
  rhythmSeed: 0.2,
  // PLACES-signature → the stacked-place disambiguator on the placeType/lookalike path
  // (the founding Provincetown payoff): a learned MULTIDIMENSIONAL discriminator earns a
  // touch more headroom than the diffuse priors, still a whisper. Below places.signatureCeiling (0.5).
  signatureSeed: 0.3,
  // LEXICON → signage/lookalike matching: the family's own name for a stop nudges a photo
  // whose vision echoes that alias toward it. Below the lexicon branch's ceiling (0.55).
  lexiconSeed: 0.3,
}

// The witness names the lattice seam introduces (advertised in bench.witnesses ONLY when a
// lattice is supplied; folding them into the right SETTLE correlation groups is a
// SETTLE_DEFAULTS change owned by the later MEASURED-integrate phase, out of scope here —
// until then they are off on the live path, so their singleton-group status is inert).
// ⚠ PRE-ACTIVATION (deferred, §15b): uploader/rhythm/placeSignature share the placeType
// coincidence and are currently singleton correlation groups → they noisy-OR ~4x. Before the
// lattice is ACTIVATED (PHOTO_DECISION_ENGINE past shadow, Jonathan's gate), co-group them WITH
// placeType in SETTLE_DEFAULTS.placementGroups. Deferred here to keep the F5-frozen defaults untouched.
export const LATTICE_WITNESSES = ['uploader', 'rhythm', 'placeSignature', 'lexicon', 'deviceChannel']

// ---- the common evidence shape ---------------------------------------------
// A placement witness's read for ONE photo: which candidate places it supports, and
// how strongly (membership in [0,1]). Places it says nothing about are simply absent.
const placementEv = (witness, tier, photoId, support) => ({ kind: 'placement', witness, tier, photoId, support })
// An affinity witness's read for ONE ordered pair: how much they belong to the same
// moment (1 = surely together). A pair a witness has no signal about is simply absent.
const affinityEv = (witness, tier, aId, bId, value) => ({ kind: 'affinity', witness, tier, aId, bId, affinity: value })

// ---- placement witnesses ----------------------------------------------------
function gpsPlacement(points, places, o) {
  const geo = places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  const out = []
  for (const pt of points) {
    if (!Number.isFinite(pt.lat) || !Number.isFinite(pt.lng)) continue // abstain: no coordinate
    const tier = isDerivedCoord(pt.provGps) ? 'derived' : 'observed'
    // a derived (propagated / imputed) coordinate points at a real place, but it is an
    // INHERITED read of where this photo was — so it speaks softer (wider doubt, §12.4).
    const damp = tier === 'derived' ? o.derivedDamping : 1
    const support = {}
    for (const pl of geo) {
      const m = damp * gaussKernel(haversineMeters(pt.lat, pt.lng, pl.lat, pl.lng), o.gpsScaleMeters)
      // several nearby places ALL clear the floor → wide support → conflict, by design
      if (m >= o.minMembership) support[pl.id] = m
    }
    if (Object.keys(support).length) out.push(placementEv('gps', tier, pt.id, support))
    // nearby nothing → abstain (emit nothing), never a zero vote
  }
  return out
}

function timePlacement(points, places, o) {
  const timed = places.filter((p) => Number.isFinite(p.timeMin))
  if (!timed.length) return []
  const out = []
  for (const pt of points) {
    if (!Number.isFinite(pt.localMin)) continue // abstain: no usable time
    if (pt.timeAnchorSuspect) continue // the clock itself isn't trustworthy → abstain, don't guess (§ sessionHeal)
    const support = {}
    for (const pl of timed) {
      const m = gaussKernel(Math.abs(pt.localMin - pl.timeMin), o.timeScaleMin)
      if (m >= o.minMembership) support[pl.id] = m
    }
    if (Object.keys(support).length) out.push(placementEv('time', 'observed', pt.id, support))
  }
  return out
}

function currentFilingPlacement(points, o) {
  const out = []
  for (const pt of points) {
    if (!pt.currentStopId) continue // unfiled → abstain (a censored observation, never a negative — §7)
    // ONE witness, deliberately < 1: where a photo currently sits is strong evidence of
    // where it belongs but never proof — it may be an import default nobody blessed (§7).
    out.push(placementEv('currentFiling', 'observed', pt.id, { [pt.currentStopId]: o.currentFilingWeight }))
  }
  return out
}

function humanConfirmPlacement(points, o) {
  // HM-6: a human answer re-enters the machine as evidence (the forward loop). Observed
  // tier — it may file silently — but capped below 1 so even a confirm stays revisable.
  const out = []
  for (const pt of points) {
    if (!pt.confirmedStopId) continue // no answer → abstain
    out.push(placementEv('humanConfirm', 'observed', pt.id, { [pt.confirmedStopId]: o.humanConfirmWeight }))
  }
  return out
}

function worldModelPlacement(points, places, o) {
  // HM-3: the durable cross-trip prior speaks when a world model is supplied, and abstains
  // in the same grammar when one isn't (an emergent channel, §14). It enters CLAMPED (tier
  // 'prior', capped membership) and DECAYING, so a prior alone can never cross the act line
  // and a stale pattern fades rather than misfiling to a place that no longer exists.
  if (!o.worldModel) return []
  return worldModelWitness(points, places, o.worldModel, o, o.now)
}

// ---- affinity (grouping) witnesses -----------------------------------------
function timeGapAffinity(points, o) {
  const timed = points.filter((p) => Number.isFinite(p.at)).sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id)))
  const out = []
  for (let i = 1; i < timed.length; i++) {
    const gapMin = (timed[i].at - timed[i - 1].at) / 60000
    // SOFT and continuous: small gap → high same-moment affinity, decaying with a heavy
    // tail. There is no 40-minute cliff — 39 and 41 minutes are almost the same number.
    out.push(affinityEv('timeGap', 'observed', timed[i - 1].id, timed[i].id, expDecay(gapMin, o.gapTauMin)))
  }
  return out
}

function sequenceAffinity(points, o) {
  // Consecutive frames off one device are common-fate — near-certainly the same moment
  // even when the clock is gone (survives stripped EXIF). Abstains without a numeric
  // sequence; a different device is a different seq space, so pairs never cross devices.
  const byDevice = new Map()
  for (const p of points) {
    if (!Number.isFinite(p.seq) || p.device == null) continue
    if (!byDevice.has(p.device)) byDevice.set(p.device, [])
    byDevice.get(p.device).push(p)
  }
  const out = []
  for (const list of byDevice.values()) {
    list.sort((a, b) => a.seq - b.seq)
    for (let i = 1; i < list.length; i++) {
      out.push(affinityEv('sequence', 'observed', list[i - 1].id, list[i].id, expDecay(list[i].seq - list[i - 1].seq - 1, o.seqStepTau)))
    }
  }
  return out
}

function sceneAffinity(points, o) {
  // Same composition/scene signature → evidence of the same moment (similarity gestalt).
  // Abstains for any photo lacking a scene hash. First-pass exact-hash match; a graded
  // similarity replaces the exact test when scene EMBEDDINGS land (kept in the same shape).
  const withScene = points.filter((p) => typeof p.scene === 'string' && p.scene)
  const out = []
  for (let i = 0; i < withScene.length; i++) {
    for (let j = i + 1; j < withScene.length; j++) {
      if (withScene[i].scene === withScene[j].scene) {
        out.push(affinityEv('scene', 'observed', withScene[i].id, withScene[j].id, o.sceneMatchWeight))
      }
    }
  }
  return out
}

function faceAffinity(points) {
  // Shared faces → graded same-moment evidence (Jaccard overlap as membership). NO overlap
  // is treated as ABSTENTION, not evidence-of-different: faces are noisy (not everyone is in
  // every shot), so absence of a shared face is ignorance, not a boundary.
  const withFaces = points.filter((p) => Array.isArray(p.faces) && p.faces.length)
  const out = []
  for (let i = 0; i < withFaces.length; i++) {
    const A = new Set(withFaces[i].faces)
    for (let j = i + 1; j < withFaces.length; j++) {
      let shared = 0
      for (const f of withFaces[j].faces) if (A.has(f)) shared++
      if (shared > 0) {
        const union = A.size + withFaces[j].faces.length - shared
        out.push(affinityEv('faces', 'observed', withFaces[i].id, withFaces[j].id, shared / union))
      }
    }
  }
  return out
}

// ---- O8 INTEGRATE: lattice → witness wiring (runs ONLY when opts.lattice is present) --
// Each function reads ONE §16d branch's facts and emits bench evidence in the common
// graded shape, at DECLARED-SEED whisper weight × the fact's own clamped confidence, tier
// 'prior'/'derived' (never 'observed' → can only heal softly, never file). Every one
// abstains (emits nothing) when its branch is empty or a point lacks the signal — the same
// absence-abstains grammar as the built witnesses (§13). NONE mutates a base entry.

const clamp01L = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const normNameL = (s) => (typeof s === 'string' ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '')
const authorOfPoint = (pt) =>
  (typeof pt?.author === 'string' && pt.author) ||
  (typeof pt?.author_traveler === 'string' && pt.author_traveler) ||
  (typeof pt?.authorTraveler === 'string' && pt.authorTraveler) ||
  null
const LSTOP = new Set(['the', 'a', 'an', 'of', 'and', 'at', 'in', 'on', 'to', 'st', 'ave', 'rd'])
const latTokens = (s) => (typeof s === 'string' ? s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !LSTOP.has(t)) : [])
const latDice = (a, b) => {
  const ta = latTokens(a), tb = new Set(latTokens(b))
  if (!ta.length || !tb.size) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return (2 * shared) / (ta.length + tb.size)
}
const mergeSupport = (support, id, m, floor) => {
  if (id == null || !(m >= floor)) return
  if (!(support[id] > m)) support[id] = m // keep the strongest reading for this place
}
// A stacked signature's coordCell is "lat,lng" (4dp centroid of the cluster, lattice/places.js).
const parseCellL = (s) => {
  if (typeof s !== 'string') return null
  const [a, b] = s.split(',').map((x) => Number.parseFloat(x))
  return Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null
}
// "Proximity PROPOSES": a spatial anchor sits inside a cluster's footprint when it clears the
// SAME soft gps kernel the gps witness proposes candidates with (o.gpsScaleMeters / o.minMembership
// — read, never changed). The signature only DISPOSES among siblings this gate already put on the
// table; it is a stacked-place disambiguator (§16d), never a global standalone placeType prior.
const withinFootprintL = (lat, lng, cell, o) =>
  cell != null && Number.isFinite(lat) && Number.isFinite(lng) &&
  gaussKernel(haversineMeters(lat, lng, cell.lat, cell.lng), o.gpsScaleMeters) >= o.minMembership

// PEOPLE → `uploader`: the author's photographer-habit shares nudge candidate stops of the
// kinds that author favours (A5: the uploader heuristic's learned refinement).
function uploaderPlacement(points, places, people, lo, o) {
  if (!Array.isArray(people) || !people.length) return []
  const habitByPerson = new Map() // person -> Map(placeType -> {share, confidence})
  for (const f of people) {
    if (f?.type !== 'photographer' || f.value?.dimension !== 'placeType') continue
    const pk = f.value.placeType
    if (!pk) continue
    if (!habitByPerson.has(f.subject)) habitByPerson.set(f.subject, new Map())
    habitByPerson.get(f.subject).set(pk, { share: clamp01L(f.value.share), confidence: clamp01L(f.confidence) })
  }
  if (!habitByPerson.size) return []
  const typed = places.map((p) => ({ id: p.id, type: inferStopType(p.name) })).filter((p) => p.type)
  if (!typed.length) return []
  const out = []
  for (const pt of points) {
    const habit = habitByPerson.get(authorOfPoint(pt))
    if (!habit) continue // no author / no habit → abstain
    const support = {}
    for (const { id, type } of typed) {
      const h = habit.get(type)
      if (h) mergeSupport(support, id, lo.uploaderSeed * h.confidence * h.share, o.minMembership)
    }
    if (Object.keys(support).length) out.push(placementEv('uploader', 'prior', pt.id, support))
  }
  return out
}

// RHYTHMS → `rhythm` (time channel): a daily-shape fact's typical time-of-day nudges stops
// of that activity kind when the photo's local time lands near it (a soft gaussian, NOT a
// bin). The diffuse temporal prior; the boundary half is the deferred settling-side piece.
function rhythmPlacement(points, places, rhythms, lo, o) {
  if (!Array.isArray(rhythms) || !rhythms.length) return []
  const daily = rhythms.filter((f) => typeof f?.subject === 'string' && f.subject.startsWith('rhythm:daily:') && Number.isFinite(f.value?.typicalMin))
  if (!daily.length) return []
  const typed = places.map((p) => ({ id: p.id, type: inferStopType(p.name) })).filter((p) => p.type)
  if (!typed.length) return []
  const out = []
  for (const pt of points) {
    if (!Number.isFinite(pt.localMin)) continue // no usable time → abstain
    const support = {}
    for (const f of daily) {
      const kind = f.value.activity
      const near = gaussKernel(Math.abs(pt.localMin - f.value.typicalMin), o.timeScaleMin)
      if (!(near > 0)) continue
      const m = lo.rhythmSeed * clamp01L(f.confidence) * near
      for (const { id, type } of typed) if (type === kind) mergeSupport(support, id, m, o.minMembership)
    }
    if (Object.keys(support).length) out.push(placementEv('rhythm', 'prior', pt.id, support))
  }
  return out
}

// PLACES-signature → the stacked-place disambiguator (placeType/lookalike path). A learned
// signature separates distinct-named places on one footprint; a photo whose vision agrees
// with a signature across the dimensions they share is nudged toward that place. §16b
// multidimensional: the match is the MEAN agreement over available dims, never one channel.
function placeSignaturePlacement(points, places, placeFacts, lo, o) {
  if (!Array.isArray(placeFacts) || !placeFacts.length) return []
  // A9 AT THE SEAM: resolve a signature to its candidate stop by NAME + COORDCELL, never name
  // alone. Two same-name stops on different footprints (the founding Provincetown case the places
  // branch keeps distinct) must NOT collapse to whichever appears last — a name-keyed last-wins
  // map would silently re-open the founding sin one layer above the branch fix.
  const candByName = new Map() // normName → [{ id, lat, lng }] (ALL same-name candidates, un-collapsed)
  const coordById = new Map() // candidate stop id → its footprint coordinate (for anchor resolution)
  for (const p of places) {
    const k = normNameL(p.name)
    if (k) { if (!candByName.has(k)) candByName.set(k, []); candByName.get(k).push({ id: p.id, lat: p.lat, lng: p.lng }) }
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) coordById.set(p.id, { lat: p.lat, lng: p.lng })
  }
  const sigs = []
  for (const f of placeFacts) {
    if (f?.type !== 'signature') continue
    const cands = candByName.get(normNameL(f.subject))
    if (!cands || !cands.length) continue // signature for a place not among the candidates → skip
    const cell = parseCellL(f.value?.coordCell)
    let id = null
    if (cell) {
      // resolve to the same-name candidate inside THIS signature's cell footprint — the A9 split.
      // None there ⇒ abstain (never bind to a wrong-location same-name twin).
      const hit = cands.find((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && withinFootprintL(c.lat, c.lng, cell, o))
      if (hit) id = hit.id
    } else if (cands.length === 1) {
      // a coordless (name-recurrence) signature is A9-safe to resolve ONLY when the name is unambiguous.
      id = cands[0].id
    }
    if (id == null) continue // no A9-safe resolution (ambiguous same-name / no matching footprint) → abstain
    sigs.push({ id, v: f.value, confidence: clamp01L(f.confidence), cell: cell || coordById.get(id) || null })
  }
  if (!sigs.length) return []
  const out = []
  for (const pt of points) {
    // the photo's spatial ANCHORS: its own/derived coordinate, plus any candidate it is already
    // proposed-for (its current filing / a human confirm — an already-placed sibling in the stack).
    const anchors = []
    if (Number.isFinite(pt.lat) && Number.isFinite(pt.lng)) anchors.push({ lat: pt.lat, lng: pt.lng })
    const filedCoord = coordById.get(pt.currentStopId); if (filedCoord) anchors.push(filedCoord)
    const confirmedCoord = coordById.get(pt.confirmedStopId); if (confirmedCoord) anchors.push(confirmedCoord)
    const support = {}
    for (const s of sigs) {
      // SPATIAL GATE (§16d — proximity proposes, signature disposes): no anchor inside THIS
      // cluster's footprint ⇒ proximity never put this place on the table for this photo ⇒ the
      // signature has no siblings to disambiguate among ⇒ abstain (never a global standalone prior).
      if (!s.cell || !anchors.some((a) => withinFootprintL(a.lat, a.lng, s.cell, o))) continue
      const dims = []
      if (pt.placeType && s.v.dominantType) dims.push(pt.placeType === s.v.dominantType ? 1 : 0)
      if (pt.setting && s.v.dominantSetting) dims.push(pt.setting === s.v.dominantSetting ? 1 : 0)
      if (Number.isFinite(pt.localMin) && Number.isFinite(s.v.typicalMinute)) dims.push(gaussKernel(Math.abs(pt.localMin - s.v.typicalMinute), o.timeScaleMin))
      if (!dims.length) continue // no shared dimension → can't compare → abstain
      const agreement = dims.reduce((a, b) => a + b, 0) / dims.length
      mergeSupport(support, s.id, lo.signatureSeed * s.confidence * agreement, o.minMembership)
    }
    if (Object.keys(support).length) out.push(placementEv('placeSignature', 'derived', pt.id, support))
  }
  return out
}

// LEXICON → signage/lookalike: the family's own name for a stop nudges a photo whose sign
// / vision-name / caption echoes that alias toward that stop (keyed by STOP ID — A9: the
// alias never leaks across stops that merely share a word).
function lexiconPlacement(points, places, lexicon, lo, o) {
  const facts = lexicon?.facts
  if (!Array.isArray(facts) || !facts.length) return []
  const candidateIds = new Set(places.map((p) => p.id))
  const aliases = facts.filter((f) => candidateIds.has(f.subject) && typeof f.normalized === 'string' && f.normalized)
  if (!aliases.length) return []
  const out = []
  for (const pt of points) {
    const echo = pt.signage || pt.visionName || pt.caption
    if (!echo) continue // no text to echo an alias → abstain
    const support = {}
    for (const f of aliases) {
      const match = latDice(echo, f.normalized)
      if (match > 0) mergeSupport(support, f.subject, lo.lexiconSeed * clamp01L(f.confidence) * match, o.minMembership)
    }
    if (Object.keys(support).length) out.push(placementEv('lexicon', 'prior', pt.id, support))
  }
  return out
}

// DEVICES → per-source channel GRADING. Device facts (metadata-survival / clock-offset /
// upload-lag) grade what to EXPECT of a source's channels (a source that strips GPS makes
// an absent GPS unsurprising). They are NOT a placement/affinity witness — they carry no
// per-photo membership — so the seam surfaces them as a separate, settling-INERT `grading`
// product (settle() reads only placement/affinity, so this never moves a photo). The
// measured-integrate phase consumes it to re-grade the gps/time channels' damping.
function deviceGrading(devices) {
  if (!Array.isArray(devices) || !devices.length) return []
  return devices.map((f) => ({ witness: 'deviceChannel', tier: f.tier || 'prior', type: f.type, subject: f.subject, value: f.value, confidence: clamp01L(f.confidence) }))
}

// Compose every branch's contribution. Returns extra placement entries, extra affinity
// entries (none in v1 — the rhythm boundary-affinity is the deferred half), and the
// settling-inert device grading product. Pure; abstains branch-by-branch.
function latticeEnrich(points, places, lattice, o) {
  const lo = { ...LATTICE_DEFAULTS, ...(o.latticeSeeds || {}) }
  return {
    placement: [
      ...uploaderPlacement(points, places, lattice.people, lo, o),
      ...rhythmPlacement(points, places, lattice.rhythms, lo, o),
      ...placeSignaturePlacement(points, places, lattice.places, lo, o),
      ...lexiconPlacement(points, places, lattice.lexicon, lo, o),
    ],
    affinity: [], // the rhythm BOUNDARY prior (an affinity nudge) is the deferred measured-integrate half; the bench seam wires the time/placement half
    grading: deviceGrading(lattice.devices), // META (class-trust) is intentionally NOT a bench witness — it grades question CLASSES for O7, not photos
  }
}

export const WITNESSES = ['gps', 'time', 'currentFiling', 'humanConfirm', 'worldModel', 'signage', 'placeType', 'lookalike', 'timeGap', 'sequence', 'scene', 'faces']

// buildEvidenceBench — lay every witness out in the common graded shape. Returns only
// EVIDENCE; it never decides. { placement:[...], affinity:[...] }.
export function buildEvidenceBench(points, places, opts = {}) {
  const o = { ...BENCH_DEFAULTS, ...opts }
  const pts = (points || []).map((p) => ({ ...p, localMin: localMinuteOfDay(p.at) }))
  const pl = places || []
  const placement = [
    ...gpsPlacement(pts, pl, o),
    ...timePlacement(pts, pl, o),
    ...currentFilingPlacement(pts, o),
    ...humanConfirmPlacement(pts, o), // HM-6: answers re-enter and cascade
    ...worldModelPlacement(pts, pl, o),
    ...visionWitnesses(pts, pl, o), // §16: the primary place-sense for a GPS-less library (signage / placeType / lookalike)
  ]
  const affinity = [
    ...timeGapAffinity(pts, o),
    ...sequenceAffinity(pts, o),
    ...sceneAffinity(pts, o),
    ...faceAffinity(pts),
  ]
  // O8 INTEGRATE (INERT): the lattice enriches the bench ONLY when one is explicitly
  // supplied. With NO lattice (the live heal path, and every test that doesn't pass one)
  // this branch is never taken → the returned object is byte-identical to the pre-lattice
  // bench: same three keys, same WITNESSES, no lattice witness in any entry. Nothing here
  // changes BENCH_DEFAULTS or SETTLE_DEFAULTS (§15b). Behind the shadow (off) knob.
  if (o.lattice) {
    const extra = latticeEnrich(pts, pl, o.lattice, o)
    return {
      placement: [...placement, ...extra.placement],
      affinity: [...affinity, ...extra.affinity],
      grading: extra.grading, // settling-inert channel grades (devices); settle() ignores it
      witnesses: [...WITNESSES, ...LATTICE_WITNESSES],
    }
  }
  return {
    placement,
    affinity,
    witnesses: WITNESSES,
  }
}
