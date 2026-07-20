// imputation.js — HM-4 of the Healing Model (DESIGN_THE_HEALING_MODEL.md §12.4).
//
// The rung-lifter. It generalises the app's moment-scoped GPS propagation: a photo
// MISSING a signal borrows a reconstructed one from the moment-mates it is strongly
// affine to, so a thin cluster climbs a rung — the whole federation gets to speak for a
// photo that would otherwise abstain everywhere. Its discipline is the point (the
// correlation trap):
//
//   • DERIVED, never observed. An imputed coordinate is tagged provGps:'propagated' (the
//     bench reads that as tier 'derived') and carries WIDER doubt (imputeDamping, and the
//     bench's derivedDamping softens it again). It can lift a photo to "heal softly",
//     never to "file silently".
//   • NEVER clobbers a real reading. A photo that already has any coordinate is returned
//     untouched — imputation only fills a genuine hole.
//   • NEVER fabricates from nothing. With no affine donor that HAS the signal, the photo
//     stays abstaining. Imputation reconstructs; it does not invent.
//   • Carries its provenance (derivedFrom), so a later rigorous pass can keep an imputed
//     value from VOUCHING for the very neighbours it was borrowed from. Whether it earns
//     its keep at all is decided by ablation (HM-5, §13) — never by my say-so.
//
// Pure + node-tested. Runs BEFORE the placement bench (it needs only the affinity
// witnesses, which don't require coordinates), so the reconstructed signals flow into
// every downstream witness.

const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const isDerivedCoord = (g) => typeof g === 'string' && (g === 'propagated' || g.startsWith('inferred'))

export const IMPUTE_DEFAULTS = {
  minAffinity: 0.15, // a donor must be at least this affine to lend a signal (soft floor, seed)
  imputeDamping: 0.6, // an imputed signal carries wider doubt than a real one
}

// imputeSignals — reconstruct a missing coordinate for each coord-less photo from the
// affine moment-mates that HAVE a real one. affinityPairs: [{ aId, bId, affinity }].
export function imputeSignals(points, affinityPairs, opts = {}) {
  const o = { ...IMPUTE_DEFAULTS, ...opts }
  const nbr = new Map()
  for (const { aId, bId, affinity } of affinityPairs || []) {
    if (!(affinity >= o.minAffinity)) continue
    if (!nbr.has(aId)) nbr.set(aId, [])
    if (!nbr.has(bId)) nbr.set(bId, [])
    nbr.get(aId).push({ id: bId, affinity })
    nbr.get(bId).push({ id: aId, affinity })
  }
  const byId = new Map((points || []).map((p) => [p.id, p]))
  const hasRealCoord = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !isDerivedCoord(p.provGps)

  return (points || []).map((pt) => {
    if (Number.isFinite(pt.lat) && Number.isFinite(pt.lng)) return pt // never clobber an existing coordinate
    const donors = (nbr.get(pt.id) || [])
      .map(({ id, affinity }) => ({ p: byId.get(id), affinity }))
      .filter(({ p }) => hasRealCoord(p))
    if (!donors.length) return pt // nothing to reconstruct FROM → stay abstaining, never fabricate
    let wSum = 0, latSum = 0, lngSum = 0, best = 0
    for (const { p, affinity } of donors) {
      wSum += affinity; latSum += affinity * p.lat; lngSum += affinity * p.lng
      best = Math.max(best, affinity)
    }
    return {
      ...pt,
      lat: latSum / wSum,
      lng: lngSum / wSum,
      provGps: 'propagated', // → the bench reads this as tier 'derived'
      imputed: true,
      imputeConfidence: clamp01(best * o.imputeDamping),
      derivedFrom: donors.map((d) => d.p.id),
    }
  })
}
