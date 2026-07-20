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
import { visionWitnesses } from './visionPlacement.js'

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

export const WITNESSES = ['gps', 'time', 'currentFiling', 'humanConfirm', 'worldModel', 'signage', 'placeType', 'lookalike', 'timeGap', 'sequence', 'scene', 'faces']

// buildEvidenceBench — lay every witness out in the common graded shape. Returns only
// EVIDENCE; it never decides. { placement:[...], affinity:[...] }.
export function buildEvidenceBench(points, places, opts = {}) {
  const o = { ...BENCH_DEFAULTS, ...opts }
  const pts = (points || []).map((p) => ({ ...p, localMin: localMinuteOfDay(p.at) }))
  const pl = places || []
  return {
    placement: [
      ...gpsPlacement(pts, pl, o),
      ...timePlacement(pts, pl, o),
      ...currentFilingPlacement(pts, o),
      ...humanConfirmPlacement(pts, o), // HM-6: answers re-enter and cascade
      ...worldModelPlacement(pts, pl, o),
      ...visionWitnesses(pts, pl, o), // §16: the primary place-sense for a GPS-less library (signage / placeType / lookalike)
    ],
    affinity: [
      ...timeGapAffinity(pts, o),
      ...sequenceAffinity(pts, o),
      ...sceneAffinity(pts, o),
      ...faceAffinity(pts),
    ],
    witnesses: WITNESSES,
  }
}
