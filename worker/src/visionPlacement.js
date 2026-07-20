// visionPlacement.js — the vision place-witness (DESIGN_THE_HEALING_MODEL.md §16).
//
// The primary place-sense for a GPS-less library. Ground truth (§16): vision is on 97%
// of real photos while GPS/faces/sequence are absent — so this is where the machine
// actually SEES. Three graded placement witnesses over the vision the app already
// computes (name / labels / setting / placeType / signage):
//
//   • signage → the place it NAMES. The OCR'd sign matched to a candidate stop's name —
//     the most direct vision→place link. Tier 'observed' (a legible sign naming a place
//     is a real observation), membership graded by match strength (Dice).
//   • placeType → stops of that KIND. A 'beach' photo supports the beach-like stops.
//     Broad and categorical, so it produces genuine CONFLICT across same-type stops
//     (possibility, not a pick). Tier 'derived', soft.
//   • lookalike → "looks like the photos I already filed HERE." A cross-corpus
//     nearest-exemplar classifier (Nosofsky-style) over the family's existing filings:
//     a photo semantically similar to ones filed at stop X lends X a prior. Learned from
//     their own filings, irrespective of trip. Tier 'derived'. It EXCLUDES the photo's
//     own filing AND its memory-siblings, so it can never cheat by recognising itself.
//
// All three abstain in the same grammar when their signal is absent; none is normalised
// (conflict survives); membership is possibility in [0,1]; every weight is a SEED fit by
// ablation (§13). Pure + node-tested.
//
// Expected point vision fields (threaded by the HM-5 adapter): signage, placeType,
// setting, visionName, labels[], plus currentStopId + memoryId for the exemplar corpus.

const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'at', 'in', 'on', 'to', 'st', 'ave', 'rd'])
const tokens = (s) => (typeof s === 'string' ? s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)) : [])
const dice = (a, b) => {
  const ta = tokens(a), tb = new Set(tokens(b))
  if (!ta.length || !tb.size) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return (2 * shared) / (ta.length + tb.size)
}

// stop-type inferred from a stop's NAME (a small lexicon; abstains when nothing matches —
// most stops won't name their type, and that honest gap is why placeType is only a soft voice).
const TYPE_KEYWORDS = {
  beach: ['beach', 'cove', 'shore', 'sand', 'dunes'],
  restaurant: ['restaurant', 'cafe', 'coffee', 'diner', 'grill', 'kitchen', 'foods', 'bakery', 'pizzeria', 'tavern', 'eatery', 'lobster', 'oyster', 'doughnut'],
  museum: ['museum', 'gallery', 'exhibit'],
  park: ['park', 'garden', 'green', 'commons', 'trail', 'woods', 'preserve'],
  shop: ['shop', 'store', 'market', 'boutique', 'books', 'gifts'],
  waterfront: ['harbor', 'harbour', 'pier', 'wharf', 'marina', 'dock', 'waterfront', 'bay'],
  event: ['parade', 'festival', 'fair', 'concert', 'fireworks'],
  residential: ['house', 'home', 'cottage', 'cabin', 'rental', 'grandma', 'grandpa'],
}
export function inferStopType(name) {
  const toks = new Set(tokens(name))
  for (const [type, kws] of Object.entries(TYPE_KEYWORDS)) if (kws.some((k) => toks.has(k))) return type
  return null
}

export const VISION_DEFAULTS = {
  signageFloor: 0.34, // below this a signage match is too weak to emit (soft floor, not a decision cutoff)
  placeTypeMembership: 0.4, // a category match is a soft, broad voice — seed
  lookalikeWeight: 0.6, // learned-similarity is a derived prior — damped; seed
  lookalikeFloor: 0.1,
}

export const fingerprint = (pt) => ({
  placeType: pt.placeType || null,
  setting: pt.setting || null,
  tokens: new Set([...tokens(pt.visionName), ...(Array.isArray(pt.labels) ? pt.labels.flatMap(tokens) : [])]),
})
export const sim = (a, b) => {
  let s = 0
  if (a.placeType && a.placeType === b.placeType) s += 0.5
  if (a.setting && a.setting === b.setting) s += 0.2
  const uni = new Set([...a.tokens, ...b.tokens]).size
  let inter = 0
  for (const t of a.tokens) if (b.tokens.has(t)) inter++
  s += 0.3 * (uni ? inter / uni : 0)
  return clamp01(s)
}

const placementEv = (witness, tier, photoId, support) => ({ kind: 'placement', witness, tier, photoId, support })

function signageWitness(points, places, o) {
  const named = places.filter((p) => p.name)
  const out = []
  for (const pt of points) {
    if (!pt.signage) continue // abstain: no sign read
    const support = {}
    for (const pl of named) {
      const m = dice(pt.signage, pl.name)
      if (m >= o.signageFloor) support[pl.id] = m
    }
    if (Object.keys(support).length) out.push(placementEv('signage', 'observed', pt.id, support))
  }
  return out
}

function placeTypeWitness(points, places, o) {
  const typed = places.map((p) => ({ id: p.id, type: inferStopType(p.name) })).filter((p) => p.type)
  if (!typed.length) return []
  const out = []
  for (const pt of points) {
    if (!pt.placeType) continue // abstain
    const support = {}
    for (const { id, type } of typed) if (type === pt.placeType) support[id] = o.placeTypeMembership
    // broad by design: every same-type stop clears together → conflict, not a pick
    if (Object.keys(support).length) out.push(placementEv('placeType', 'derived', pt.id, support))
  }
  return out
}

function lookalikeWitness(points, places, exemplars, o) {
  if (!exemplars || !exemplars.length) return [] // emergent: no reference corpus → abstain
  const candidateIds = new Set(places.map((p) => p.id))
  const out = []
  for (const pt of points) {
    const fq = fingerprint(pt)
    if (!fq.placeType && !fq.setting && !fq.tokens.size) continue // no vision → abstain
    const bestByStop = {}
    for (const e of exemplars) {
      if (e.id === pt.id || (e.memoryId != null && e.memoryId === pt.memoryId)) continue // holdout: never recognise itself / its siblings
      if (!candidateIds.has(e.stopId)) continue
      const s = sim(fq, e.fp)
      if (s > (bestByStop[e.stopId] || 0)) bestByStop[e.stopId] = s
    }
    const support = {}
    for (const [stop, s] of Object.entries(bestByStop)) {
      const m = o.lookalikeWeight * s
      if (m >= o.lookalikeFloor) support[stop] = m
    }
    if (Object.keys(support).length) out.push(placementEv('lookalike', 'derived', pt.id, support))
  }
  return out
}

// Reference corpus for `lookalike`: fingerprints of every FILED photo that carries vision.
// The HM-5 adapter builds this across the whole library (irrespective of trip).
export function buildVisionExemplars(filedPoints) {
  return (filedPoints || [])
    .filter((p) => p.currentStopId && (p.placeType || p.visionName || (Array.isArray(p.labels) && p.labels.length)))
    .map((p) => ({ id: p.id, memoryId: p.memoryId, stopId: p.currentStopId, fp: fingerprint(p) }))
}

// The three vision witnesses in the bench's common shape. `opts.exemplars` enables
// lookalike; absent, it abstains like any missing channel (§14).
export function visionWitnesses(points, places, opts = {}) {
  const o = { ...VISION_DEFAULTS, ...opts }
  return [
    ...signageWitness(points || [], places || [], o),
    ...placeTypeWitness(points || [], places || [], o),
    ...lookalikeWitness(points || [], places || [], opts.exemplars, o),
  ]
}
