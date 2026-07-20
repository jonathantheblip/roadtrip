// healLoop.js — HM-6: the forward loop (DESIGN_THE_HEALING_MODEL.md §12.6).
//
// Closes the circuit Jonathan asked for: EVERY human signal propagates to the rest of
// the pile. Two mechanisms:
//
//   • CONSOLIDATED asks. Ask-destination photos are grouped into moments via the
//     affinity graph (connected components over a soft link floor) — the family answers
//     ONE question per moment, never one per photo. Questions are ordered by REACH (how
//     many photos an answer would touch: members + their affine neighbours), so the
//     first answers collapse the most pile.
//   • ANSWERS RE-ENTER as evidence. A confirm becomes a `humanConfirm` witness (tier
//     'observed' — a human speech act — but membership 0.95, deliberately < 1: not even
//     a family tap is ever definitive, §7). Re-settling then CASCADES it: affine mates
//     are lifted through borrowing (they heal softly — borrowed stays derived), and the
//     confirmed photo joins the lookalike EXEMPLARS, so one answer teaches the
//     cross-corpus classifier what that place looks like — reaching OTHER trips too.
//
// The same re-settle path serves a NEW UPLOAD to a completed trip (GPS now unstripped):
// the new photo enters as an observed anchor, imputation lets it donate coordinates to
// its burst, borrowing lifts the rest — whole buckets resolve without a single question.
//
// Pure + node-tested. The production write path stays the S1 confirm surface + gates;
// this module is the ENGINE side: how a signal, once given, spreads.

const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)

export const LOOP_DEFAULTS = {
  linkFloor: 0.25, // affinity at/above this links photos into one question (soft seed)
  maxCandidates: 3,
}

// consolidateAsks — group ask-photos into per-moment QUESTIONS via the affinity graph.
// photoResults: Map(photoId -> readout from settle()); affinityPairs: [{aId,bId,affinity}].
// → [{ photoIds, candidates:[{placeId, score}], reach }] ordered by reach desc.
export function consolidateAsks(photoResults, affinityPairs, opts = {}) {
  const o = { ...LOOP_DEFAULTS, ...opts }
  const askIds = new Set()
  for (const [id, r] of photoResults) if (r.destination === 'ask') askIds.add(id)
  if (!askIds.size) return []

  const adj = new Map() // full graph (for reach); ask-only edges drive the clustering
  const link = (a, b, aff) => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a).push({ id: b, aff })
  }
  for (const { aId, bId, affinity } of affinityPairs || []) {
    if (!(affinity >= o.linkFloor)) continue
    link(aId, bId, affinity); link(bId, aId, affinity)
  }

  // connected components restricted to ask-photos
  const seen = new Set()
  const clusters = []
  for (const start of askIds) {
    if (seen.has(start)) continue
    const members = []
    const queue = [start]
    seen.add(start)
    while (queue.length) {
      const id = queue.pop()
      members.push(id)
      for (const { id: nb } of adj.get(id) || []) {
        if (askIds.has(nb) && !seen.has(nb)) { seen.add(nb); queue.push(nb) }
      }
    }
    // candidates: membership-weighted tally across members' settled top places
    const tally = new Map()
    for (const id of members) {
      const r = photoResults.get(id)
      for (const [place, m] of Object.entries(r?.membership || {})) tally.set(place, (tally.get(place) || 0) + m)
    }
    const candidates = [...tally.entries()]
      .map(([placeId, score]) => ({ placeId, score }))
      .sort((a, b) => b.score - a.score || String(a.placeId).localeCompare(String(b.placeId)))
      .slice(0, o.maxCandidates)
    // reach: members + affine neighbours an answer would touch through borrowing
    const touched = new Set(members)
    for (const id of members) for (const { id: nb } of adj.get(id) || []) touched.add(nb)
    clusters.push({ photoIds: members.sort(), candidates, reach: touched.size })
  }
  return clusters.sort((a, b) => b.reach - a.reach || String(a.photoIds[0]).localeCompare(String(b.photoIds[0])))
}

// applyAnswers — inject human answers into the point set: the answered photos carry
// confirmedStopId, which the bench reads as the humanConfirm witness. Non-destructive.
export function applyAnswers(points, answers) {
  const byId = new Map()
  for (const a of answers || []) for (const id of a.photoIds || []) if (a.placeId) byId.set(id, a.placeId)
  if (!byId.size) return points
  return (points || []).map((p) => (byId.has(p.id) ? { ...p, confirmedStopId: byId.get(p.id) } : p))
}

// confirmedAsExemplars — a confirmed photo teaches the cross-corpus lookalike channel:
// map its confirm into the exemplar shape (stopId = the confirmed place).
export function confirmedAsExemplars(points) {
  return (points || [])
    .filter((p) => p.confirmedStopId)
    .map((p) => ({ ...p, currentStopId: p.confirmedStopId }))
}

// ---- question VALUE (which asks deserve to exist, and in what order) ---------
// Jonathan's three dimensions, made computable. value = reach × answerability ×
// teaching. All weights are SEEDS (§13). A question below askWorthFloor is not worth
// a glance — it stays unasked (heal/leave), because an unanswerable question spends
// the family's delight to buy a shrug.
//
//   • answerability — could a person ANSWER from the photo itself (the CAPTCHA
//     insight: recognition, not recall)? High when the candidate places are DIFFERENT
//     KINDS (beach vs restaurant = a glance; beach vs beach = homework), when the
//     moment has distinctive content (a sign, a vision name), and when it's a real
//     moment, not a stray frame.
//   • teaching — what does the answer TEACH? Proportional to how many OTHER
//     unresolved photos in the corpus LOOK LIKE this moment (fingerprint similarity):
//     one answer here becomes a lookalike exemplar for all of them.
import { fingerprint, sim, inferStopType } from './visionPlacement.js'

export const QUESTION_DEFAULTS = {
  typeDistinctWeight: 0.5, // candidates of different kinds → answer by looking
  contentWeight: 0.3, // signage / a vision name → something to recognise
  momentSizeWeight: 0.2, // a real moment is more memorable than a stray frame
  teachSimFloor: 0.45, // an unresolved photo at least this similar counts as taught
  teachCap: 10, // teaching saturates — seed
  askWorthFloor: 0.25, // below this the question is not worth a glance
}

export function scoreQuestions(clusters, photoResults, allPoints, places, opts = {}) {
  const o = { ...QUESTION_DEFAULTS, ...opts }
  const placeById = new Map((places || []).map((p) => [p.id, p]))
  const byId = new Map((allPoints || []).map((p) => [p.id, p]))
  const unresolved = (allPoints || []).filter((p) => {
    const r = photoResults.get(p.id)
    return r && (r.destination === 'ask' || r.destination === 'leave')
  })
  return (clusters || []).map((c) => {
    const members = c.photoIds.map((id) => byId.get(id)).filter(Boolean)
    // human-shaped content: the moment's dominant vision name + named candidates
    const nameTally = new Map()
    for (const m of members) if (m.visionName) nameTally.set(m.visionName, (nameTally.get(m.visionName) || 0) + 1)
    const momentName = [...nameTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null
    const candidates = c.candidates.map(({ placeId, score }) => {
      const pl = placeById.get(placeId)
      return { placeId, score, name: pl?.name || placeId, kind: pl ? inferStopType(pl.name) : null }
    })
    // answerability
    const kinds = new Set(candidates.map((x) => x.kind).filter(Boolean))
    const typeDistinct = kinds.size > 1 ? 1 : 0 // different kinds → tell them apart by LOOKING
    const hasContent = members.some((m) => m.signage || m.visionName) ? 1 : 0
    const sizeBoost = Math.min(1, members.length / 6)
    const answerability = clamp01(o.typeDistinctWeight * typeDistinct + o.contentWeight * hasContent + o.momentSizeWeight * sizeBoost)
    // teaching: how many other unresolved photos LOOK like this moment
    const fps = members.map(fingerprint)
    let taught = 0
    for (const u of unresolved) {
      if (c.photoIds.includes(u.id)) continue
      const fu = fingerprint(u)
      if (fps.some((f) => sim(f, fu) >= o.teachSimFloor)) taught++
    }
    const teaching = 1 + Math.min(taught, o.teachCap) / o.teachCap // 1..2
    const value = c.reach * (0.35 + 0.65 * answerability) * teaching
    return { ...c, momentName, candidates, answerability, taught, value, worthAsking: answerability >= o.askWorthFloor }
  }).sort((a, b) => b.value - a.value || String(a.photoIds[0]).localeCompare(String(b.photoIds[0])))
}

// summarizeCascade — before/after destination comparison: what one signal resolved.
export function summarizeCascade(before, after) {
  let askResolved = 0, leaveResolved = 0, upgraded = 0
  for (const [id, b] of before) {
    const a = after.get(id)
    if (!a) continue
    if (b.destination === 'ask' && a.destination !== 'ask') askResolved++
    if (b.destination === 'leave' && (a.destination === 'heal' || a.destination === 'file')) leaveResolved++
    if ((b.destination === 'leave' || b.destination === 'ask' || b.destination === 'heal') && a.destination === 'file') upgraded++
  }
  const asks = (m) => [...m.values()].filter((r) => r.destination === 'ask').length
  return { askResolved, leaveResolved, upgraded, asksBefore: asks(before), asksAfter: asks(after), confidence: clamp01 }
}
