// lattice/places.js — the PLACES branch of the world-model FACT LATTICE
// (DESIGN_THE_HEALING_MODEL.md §16d, one branch of six).
//
// HM-3's world model (worldModel.js) held ONE place-fact: name-keyed RECURRENCE (this
// place keeps coming back, decaying, clamped). §16d's catch was that a place is more
// than "how often" — it has a CHARACTER (what the family does there) and RELATIONS
// (which places go together), and the founding case demands a fourth: when places share
// a spot, each one's non-spatial SIGNATURE. This branch learns those, WITHOUT touching
// worldModel's recurrence (they compose in the Integrate phase). Four place-shaped
// families of fact, every one grounded in a signal the app ALREADY HOLDS:
//
//   • character — at a place, the SHARE of its filed photos that are each place-KIND
//     (placeType), shrunk toward the family-wide kind mix. "The cottage is residential;
//     the town beach is beach." Feeds the placeType / lookalike witnesses.
//   • timing — a place's TYPICAL time-of-day, as a circular mean minute + a concentration
//     (how tightly the visits cluster in the day). "The beach is a midday place; the
//     restaurant an evening one." This is what the family DOES there, temporally — a
//     richer signal than a stop's PLANNED time. Feeds the time witness.
//   • signature — THE FOUNDING PAYOFF. When distinct-named places share one footprint
//     (the Provincetown lodging + town beach + parade start, stacked within ~100m),
//     coordinates CANNOT tell them apart — so proximity only PROPOSES, and each place's
//     learned NON-SPATIAL signature (its kind × time-of-day × indoor/outdoor) DISPOSES.
//     A signature is emitted ONLY when it actually separates a place from its stacked
//     siblings; if two stacked places look identical, NO signature is learned and the
//     machine leaves the photo loose — never a silent nearest-name pick. Feeds
//     stacked-place disambiguation.
//   • adjacency — practical RELATIONS: which places co-occur in a day's sequence, and
//     which sit consecutively. "Beach then the lobster shack." A context nudge on
//     grouping / day-scope; it never places a photo on its own.
//
// This is a fact LATTICE branch shaped like ITSELF — not like the recurrence place-list,
// not like a bench witness. The guards it shares with every branch (§16d, §16b lenses):
//
//   • A fact NUDGES, never asserts. Confidence is CLAMPED at a per-family ceiling, all
//     well BELOW the observed-witness band (currentFiling 0.7, humanConfirm 0.95, a GPS
//     lock ~1) — so the off-character photo (a rare indoor shot at the beach) always
//     wins on its own observed evidence; the place-fact can only whisper. No data volume
//     lets a place-fact assert.
//   • Multidimensional-critical (§16b): the SIGNATURE never lets ONE dimension decide.
//     Its distinctiveness is measured across every non-spatial dimension the two stacked
//     places SHARE, and it reports which dimensions actually separate them — so a
//     downstream picker cites agreeing dimensions, and identical-on-all-dimensions
//     places refuse to be split rather than picked by proximity alone (the founding sin,
//     in any clothes).
//   • Absence ABSTAINS; it is NEVER a negative vote (§13, heterogeneous lens). A place
//     with no filed photos yields no character/timing/signature; a place-kind never shot
//     there yields no fact; a diffuse time distribution abstains from the time DIMENSION
//     rather than voting a false "typical time"; a pair that never co-occurs yields no
//     adjacency. Silence, never a zero. And a MINORITY reading is never muted: a kind
//     seen once still speaks, its thinness carried by the confidence (imperfection is the
//     medium — the pinned §13 drift is silencing a thin-but-real channel).
//   • Scale honesty by SHRINKAGE-TO-PARENT (empirical-Bayes partial pooling) for the
//     character shares, and by concentration/distinctiveness multipliers for timing/
//     signature: at ~4 trips most facts are whispers pulled toward the family baseline
//     until a place's own data outweighs the pseudocount. The lattice fills at the
//     family's own rate (§16d).
//   • DECAY. A place unseen for years fades (a sold beach house, a Grandma who's gone) —
//     a stale pattern loses its voice rather than dragging new photos to a dead spot.
//   • Every fact CITES its source rows (photo keys / day rows / feedback ids) —
//     gauge-auditable; deleting a cited row unlearns exactly the fact it fed (§16d, §7).
//   • Every constant is a DECLARED SEED (§15b) — provisional until fit from real data,
//     never a felt value, and NONE shared with a sibling branch (a shared threshold would
//     be the §13 heterogeneity sin; worldModel's ceiling/half-life are deliberately not
//     imported here — this branch reasons its own).
//
// PURE REPLAY FOLD (§16c keystone): recomputed each run from the ledgers, zero stored
// state, DETERMINISTIC — `now` comes from opts, the clock is NEVER read here. Write-free.

const DAY = 86400000
const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const isFin = Number.isFinite
const normName = (s) => (typeof s === 'string' ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '')

// SEED values (§15b) — provisional until fit from the family's real data (HM-5-style
// ablation), never tuned by feel, each independently reasoned for THIS branch.
export const PLACE_DEFAULTS = {
  // CLAMP ceilings, per fact-family — every one BELOW the observed-witness band so a
  // place-fact can never out-vote a real read of where a photo actually is.
  characterCeiling: 0.4, // "what happens here" is a soft nudge on kind
  timingCeiling: 0.4, // a place's typical time-of-day nudges the time witness
  signatureCeiling: 0.5, // the founding disambiguator earns a touch more headroom (a learned MULTIDIMENSIONAL discriminator), still a nudge < certainty and < observed weights
  adjacencyCeiling: 0.3, // practical adjacency is the weakest voice — shapes grouping, never places a photo alone
  // Empirical-Bayes pull of a place's kind-share toward the family-wide kind mix — thin
  // data ⇒ ~the family average (a whisper), thick data ⇒ ~the place's own share. This is
  // "at ~4 trips, whispers shrinking to their parent" made mechanical (§16d).
  shrinkPseudo: 4,
  // Filed-photo / co-day counts at which a family's evidence-weight reaches ~0.5 — a
  // smooth 0→1 ramp, NEVER a cutoff (a place seen once still whispers).
  characterHalf: 3,
  timingHalf: 3,
  signatureHalf: 3,
  adjacencyHalf: 2, // co-occurring days
  // A place's character persists longer than bare recurrence relevance, so this half-life
  // is independently LONGER than worldModel's 730-day place decay — what you DO at a place
  // changes slower than whether you still go. Seed, its own reasoning.
  decayHalfLifeDays: 1095,
  // Distinct-named places whose footprints sit within this are "stacked" (the founding
  // case). A GROUPING scale, INCLUSIVE by design — not a decision cutoff. Over-including a
  // lone place just makes it compare signatures with a neighbour and (finding them
  // distinct) emit a signature nobody needs; it can never cause a wrong merge, because
  // names stay distinct (worldModel's founding lesson) and the signature only DISPOSES.
  stackRadiusMeters: 120,
  // Same-NAME stops within this radius are the SAME recurring place (geocoding jitter, or
  // different pins dropped for one cottage across trips); BEYOND it, two same-name stops are
  // DISTINCT entities that must NEVER pool coordinates or observations (A9 — the founding
  // Provincetown lesson in coordinate clothes: proximity proposes a merge, distance keeps
  // them split). A DECLARED SEED (§15b), independently reasoned for THIS question — NOT the
  // stackRadius above (that groups DISTINCT names sharing a footprint, the opposite job) and
  // NOT shared with any sibling branch (§13). Set above plausible same-place jitter yet far
  // below the inter-locality scale that separates two genuinely different places that merely
  // share a name; fit from real data later, never felt.
  mergeRadiusMeters: 150,
  // Circular concentration below which a place's typical time is too diffuse to
  // DISCRIMINATE with → the time DIMENSION abstains (per-dimension availability, not a
  // global gate). A place with scattered visit-times still gets a timing fact; it just
  // won't be leaned on to tell two stacked places apart.
  timeReliableR: 0.35,
  // Two stacked places closer than this in signature-distance aren't safely
  // distinguishable → NO signature is emitted → the photo is left loose. A noise floor
  // (mirrors the bench's minMembership "don't bother emitting"), NOT a decision cutoff —
  // and the exact mechanism of "never a silent nearest-name pick" for stacked places.
  distinctFloor: 0.12,
  // Consecutive-in-the-day stops are more "adjacent" than merely same-day; this much
  // extra weight per sequential co-occurrence. Seed.
  seqBonus: 0.5,
  // A human confirm counts as ~this many default filings toward a place's evidence (a
  // deliberate act outweighs an import default, §7). Confidence stays CLAMPED, so even
  // many confirms only nudge — never assert.
  confirmWeight: 2,
  // The discriminating weight of each signature dimension — UNIFORM by honesty (§13):
  // which dimension separates stacked places best is fit by ablation later, never felt.
  dimWeights: { placeType: 1, setting: 1, time: 1 },
}

// Readable time-of-day band edges (minutes since local midnight). These label the
// circular mean for the gauge ONLY; the SOFT quantity that any witness leans on is the
// circular mean + concentration, never a hard bin. Seed edges.
const BAND_EDGES = [[5 * 60, 'morning'], [11 * 60, 'midday'], [15 * 60, 'afternoon'], [18 * 60, 'evening'], [23 * 60, 'night']]
const bandOf = (min) => {
  if (!isFin(min)) return null
  let label = 'night' // wraps past 23:00 back to before 05:00
  for (const [edge, name] of BAND_EDGES) if (min >= edge) label = name
  return label
}

// ---- pure helpers -----------------------------------------------------------
// `at` is an offset-encoded local-time ms (the heal adapter's convention: capturedAt +
// offsetMinutes), so reading it in UTC yields the local minute-of-day — the same trick
// evidenceBench's localMinuteOfDay uses.
const localMinOfDay = (at) => (isFin(at) ? new Date(at).getUTCHours() * 60 + new Date(at).getUTCMinutes() : null)

const R_EARTH = 6371000
const toRad = (d) => (d * Math.PI) / 180
function haversineMeters(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(isFin)) return null
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)))
}

// Evidence-weight: how much a fact has EARNED from its own count, smoothly (never a gate —
// a single sighting still emits, at low weight).
const evidenceWeight = (n, half) => (half > 0 ? n / (n + half) : n > 0 ? 1 : 0)
// Empirical-Bayes shrink toward a parent share (scale honesty; thin ⇒ ~parent).
const shrink = (count, total, parentShare, pseudo) =>
  total + pseudo > 0 ? (count + pseudo * clamp01(parentShare)) / (total + pseudo) : 0
// Decay by time since last seen. No usable date ⇒ 1 (we never INVENT staleness, §13).
const decayFactor = (lastMs, nowMs, halfDays) => {
  if (!isFin(lastMs) || !isFin(nowMs) || !(halfDays > 0)) return 1
  return clamp01(Math.pow(0.5, Math.max(0, nowMs - lastMs) / (halfDays * DAY)))
}

// Circular statistics over minutes-of-day (wraps at midnight). Returns the mean minute
// and a concentration R in [0,1] (1 = all at one time, 0 = spread evenly round the clock).
function circStats(minutes) {
  let sx = 0, sy = 0, n = 0
  for (const mm of minutes) {
    if (!isFin(mm)) continue
    const a = (mm / 1440) * 2 * Math.PI
    sx += Math.cos(a); sy += Math.sin(a); n++
  }
  if (n === 0) return { mean: null, R: 0, n: 0 }
  const Rlen = Math.hypot(sx, sy) / n
  let ang = Math.atan2(sy, sx); if (ang < 0) ang += 2 * Math.PI
  return { mean: (ang / (2 * Math.PI)) * 1440, R: clamp01(Rlen), n }
}
const circDiffMin = (a, b) => { if (!isFin(a) || !isFin(b)) return null; const d = Math.abs(a - b) % 1440; return Math.min(d, 1440 - d) }

// Normalize a Map<key,count> into { obj:{key:share}, total }.
function normHist(map) {
  let total = 0
  for (const v of map.values()) total += v
  const obj = {}
  if (total > 0) for (const [k, v] of map) obj[k] = v / total
  return { obj, total }
}
const histOverlap = (A, B) => { let s = 0; for (const k of Object.keys(A)) if (B[k] != null) s += Math.min(A[k], B[k]); return s }
const dominant = (obj) => { let best = null, bv = -1; for (const [k, v] of Object.entries(obj)) if (v > bv) { bv = v; best = k }; return best }

// ---- input normalization ----------------------------------------------------
const placeTypeOf = (p) => (p && typeof p === 'object' ? p.vision?.placeType ?? p.placeType ?? null : null)
const settingOf = (p) => (p && typeof p === 'object' ? p.vision?.setting ?? p.setting ?? null : null)
const atOf = (p) => {
  if (isFin(p?.at)) return p.at
  if (typeof p?.capturedAt === 'string') { const t = Date.parse(p.capturedAt); if (isFin(t)) return t + (isFin(p.offsetMinutes) ? p.offsetMinutes : 0) * 60000 }
  return null
}
function photosOf(m) {
  if (Array.isArray(m?.photos)) return m.photos
  if (Array.isArray(m?.photo_r2_keys)) return m.photo_r2_keys
  if (typeof m?.photo_r2_keys_json === 'string') { try { const a = JSON.parse(m.photo_r2_keys_json); return Array.isArray(a) ? a : [] } catch { return [] } }
  return []
}
// Flatten memories into filed photo-points, tolerating BOTH the raw-memory shape (a
// memory row with a photos array + memory-level stop_id) and an already-flat point shape.
function toPoints(memories) {
  const out = []
  for (const m of memories || []) {
    if (!m || typeof m !== 'object') continue
    const arr = photosOf(m)
    if (arr.length) {
      const memStop = m.stop_id ?? m.stopId ?? null
      for (const e of arr) {
        if (!e || (e.id == null && e.key == null)) continue
        out.push({ id: e.id ?? e.key, stopId: e.stopId ?? e.currentStopId ?? memStop, at: atOf(e), placeType: placeTypeOf(e), setting: settingOf(e) })
      }
    } else if (m.id != null || m.key != null) { // already a flat point
      out.push({ id: m.id ?? m.key, stopId: m.stopId ?? m.currentStopId ?? m.stop_id ?? null, at: atOf(m), placeType: placeTypeOf(m), setting: settingOf(m) })
    }
  }
  return out
}
// Positive place-confirms from the feedback ledger, keyed by the photo they confirm.
// Absent/empty feedback ⇒ this map is empty and the fold runs on filings alone (§13
// absence-abstains; a confirm STRENGTHENS, it is never required).
function confirmsByPhoto(feedback) {
  const m = new Map()
  for (const f of feedback || []) {
    if (!f || typeof f !== 'object') continue
    // f.kind is the question CLASS (A/B/C/D) — an orthogonal axis, never a terminal verb; using
    // it as the action would count a non-confirm as a positive place-confirm. Require a real verb.
    const action = f.action ?? f.source
    if (!action || action === 'corrected' || action === 'rejected' || action === 'aside') continue // not a positive place-confirm
    const pid = f.photoId ?? f.photo_key ?? f.key ?? null
    if (pid == null) continue
    if (!m.has(pid)) m.set(pid, [])
    m.get(pid).push(f.id != null ? String(f.id) : `confirm:${pid}`)
  }
  return m
}

// ---- the fold ---------------------------------------------------------------
// buildPlacesFacts(trips, memories, feedback, opts) => facts[]
//   trips:    [{ id, endMs?, days?:[{ isoDate, stops:[{ id, name, lat?, lng? }] }], stops?:[...] }]
//   memories: [{ id, stop_id?, photo_r2_keys_json|photos[] }]  OR flat points [{ id, stopId, at, placeType, setting }]
//   feedback: [{ id, photoId, action }]                        (positive confirms strengthen; empty is fine)
//   opts:     { now?, ...PLACE_DEFAULTS overrides }            (now REQUIRED for decay; the clock is never read)
export function buildPlacesFacts(trips, memories, feedback, opts = {}) {
  const o = { ...PLACE_DEFAULTS, ...opts, dimWeights: { ...PLACE_DEFAULTS.dimWeights, ...(opts.dimWeights || {}) } }
  const now = isFin(opts.now) ? opts.now : null // deterministic: NO Date.now fallback

  // --- place IDENTITY is MULTIDIMENSIONAL (A9 / §16b) — never the name alone ---------
  // The founding Provincetown lesson in coordinate clothes: two stops that share a name are
  // the SAME recurring place only when a SECOND dimension AGREES. Here that dimension is
  // coordinate proximity. So we do NOT key a place by its name and average every same-name
  // stop's coordinates into one centroid — that silently fuses two genuinely different places
  // that merely share a name, and invents a phantom midpoint spot that sits at neither.
  // Instead we PARTITION each name's stops into coordinate-coherent sub-entities and key
  // identity by name + coordCell; coordinates (and downstream observations) combine ONLY
  // within a proven-near cluster, NEVER across an unmerged pair. Proximity proposes the merge;
  // distance keeps them split — so the picker downstream sees TWO places, not an averaged ghost.
  //
  // Pass 1 — gather every stop under its nameKey, coordinates un-averaged.
  const stopsByName = new Map() // nameKey → { name, stops:[{ id, lat, lng, endMs }] }
  const nameByKey = new Map() // nameKey → a display name (name-level adjacency reads this)
  for (const t of trips || []) {
    const endMs = isFin(t?.endMs) ? t.endMs : null
    const allStops = [...((t?.days || []).flatMap((d) => (d.stops || []).map((s) => ({ ...s, isoDate: d.isoDate })))), ...(Array.isArray(t?.stops) && !(t?.days || []).length ? t.stops : [])]
    for (const s of allStops) {
      const nameKey = normName(s?.name)
      if (!nameKey || s?.id == null) continue
      if (!stopsByName.has(nameKey)) stopsByName.set(nameKey, { name: s.name, stops: [] })
      stopsByName.get(nameKey).stops.push({ id: s.id, lat: s.lat, lng: s.lng, endMs })
      if (!nameByKey.has(nameKey)) nameByKey.set(nameKey, s.name)
    }
  }

  // Pass 2 — within each name, single-linkage-cluster the coord-bearing stops by the DECLARED
  // merge radius (union-find on haversine — the same clusterer the stack detector uses, a
  // deliberately DIFFERENT radius for a different question). Each cluster is ONE entity whose
  // coordCell labels its OWN members' centroid. A coordless stop offers no coordinate to agree
  // OR contradict, so it cannot be split on coordinates: same-name coordless stops share a
  // name-scoped nullCell — the plain name-recurrence identity the recurrence branch already
  // uses (absence abstains, §13; the coordinate fix bites only where coordinates EXIST and
  // disagree, which is exactly what A9 names).
  const stopIndex = new Map() // stopId → { nameKey, placeKey, name, lat, lng, lastMs }
  const placeGeo = new Map() // placeKey → { name, nameKey, coordCell, latSum, lngSum, coordN, lat, lng, lastMs }
  const registerStop = (placeKey, nameKey, name, s, cell) => {
    if (!placeGeo.has(placeKey)) placeGeo.set(placeKey, { name, nameKey, coordCell: cell, latSum: 0, lngSum: 0, coordN: 0, lat: null, lng: null, lastMs: null })
    const gp = placeGeo.get(placeKey)
    if (isFin(s.lat) && isFin(s.lng)) { gp.latSum += s.lat; gp.lngSum += s.lng; gp.coordN++ } // pooled ONLY within this proven-near cell
    if (isFin(s.endMs)) gp.lastMs = gp.lastMs == null ? s.endMs : Math.max(gp.lastMs, s.endMs)
    stopIndex.set(String(s.id), { nameKey, placeKey, name, lat: s.lat, lng: s.lng, lastMs: s.endMs })
  }
  for (const [nameKey, grp] of stopsByName) {
    const coordStops = grp.stops.filter((s) => isFin(s.lat) && isFin(s.lng))
    const uf = coordStops.map((_, i) => i)
    const find = (x) => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x] } return x }
    for (let i = 0; i < coordStops.length; i++) {
      for (let j = i + 1; j < coordStops.length; j++) {
        const d = haversineMeters(coordStops[i].lat, coordStops[i].lng, coordStops[j].lat, coordStops[j].lng)
        if (d != null && d <= o.mergeRadiusMeters) uf[find(i)] = find(j) // proximity PROPOSES the merge
      }
    }
    const cellMembers = new Map() // root → [indices]
    for (let i = 0; i < coordStops.length; i++) { const r = find(i); if (!cellMembers.has(r)) cellMembers.set(r, []); cellMembers.get(r).push(i) }
    const cellLabelOf = new Map() // root → 'lat,lng' — this cell's OWN centroid, never cross-cell
    for (const [root, idxs] of cellMembers) {
      let la = 0, lo = 0
      for (const i of idxs) { la += coordStops[i].lat; lo += coordStops[i].lng }
      cellLabelOf.set(root, `${(la / idxs.length).toFixed(4)},${(lo / idxs.length).toFixed(4)}`)
    }
    for (let i = 0; i < coordStops.length; i++) {
      const cell = cellLabelOf.get(find(i))
      registerStop(`${nameKey}@${cell}`, nameKey, grp.name, coordStops[i], cell)
    }
    for (const s of grp.stops) {
      if (isFin(s.lat) && isFin(s.lng)) continue // coord-bearing → already placed in its cell above
      registerStop(`${nameKey}@∅`, nameKey, grp.name, s, null) // coordless → name-recurrence identity
    }
  }
  for (const gp of placeGeo.values()) { if (gp.coordN) { gp.lat = gp.latSum / gp.coordN; gp.lng = gp.lngSum / gp.coordN } } // centroid WITHIN a cell only

  // --- per-place OBSERVATIONS from filed photos (the character/timing/signature base) -
  const confirmed = confirmsByPhoto(feedback)
  const placeObs = new Map() // nameKey → { name, type:Map, setting:Map, minutes:[], n, rows:Set, lastMs }
  for (const pt of toPoints(memories)) {
    if (pt.stopId == null) continue // unfiled → abstain (a censored observation, never a negative, §7)
    const stop = stopIndex.get(String(pt.stopId))
    if (!stop || !stop.placeKey) continue // filed to a stop we don't know (base/synthetic) → abstain
    const key = stop.placeKey // the MULTIDIMENSIONAL identity (name + coordCell), never name alone
    if (!placeObs.has(key)) placeObs.set(key, { name: stop.name, type: new Map(), setting: new Map(), minutes: [], n: 0, rows: new Set(), lastMs: null })
    const po = placeObs.get(key)
    const confirmRows = confirmed.get(pt.id) || []
    const w = confirmRows.length ? o.confirmWeight : 1 // a confirmed filing counts for more (§7), still clamped downstream
    po.n += w
    po.rows.add(String(pt.id))
    for (const r of confirmRows) po.rows.add(r)
    if (pt.placeType) po.type.set(pt.placeType, (po.type.get(pt.placeType) || 0) + w)
    if (pt.setting) po.setting.set(pt.setting, (po.setting.get(pt.setting) || 0) + w)
    const min = localMinOfDay(pt.at)
    if (min != null) po.minutes.push(min)
    const photoMs = isFin(pt.at) ? pt.at : stop.lastMs
    if (isFin(photoMs)) po.lastMs = po.lastMs == null ? photoMs : Math.max(po.lastMs, photoMs)
    if (po.lastMs == null && isFin(stop.lastMs)) po.lastMs = stop.lastMs
  }

  // family-wide placeType mix = the PARENT the character shares shrink toward.
  const familyType = new Map(); let familyTypeTotal = 0
  for (const po of placeObs.values()) for (const [t, c] of po.type) { familyType.set(t, (familyType.get(t) || 0) + c); familyTypeTotal += c }

  // Precompute each place's signature summary once (reused for signature distances).
  const sigOf = new Map() // nameKey → { typeHist, settingHist, timing, n }
  for (const [key, po] of placeObs) sigOf.set(key, { typeHist: normHist(po.type), settingHist: normHist(po.setting), timing: circStats(po.minutes), n: po.n })

  const facts = []
  const fact = (type, subject, value, confidence, recencyDecay, rows) => facts.push({ type, subject, value, confidence: clamp01(confidence), recencyDecay, sourceRows: [...rows].map(String).sort() })

  // === character : place × placeType SHARE (shrunk to the family kind mix) ==========
  for (const po of placeObs.values()) {
    if (!po.type.size) continue // no vision kind on any filed photo here → abstain
    const recencyDecay = decayFactor(po.lastMs, now, o.decayHalfLifeDays)
    const total = [...po.type.values()].reduce((s, c) => s + c, 0)
    for (const [t, c] of po.type) {
      const parent = familyTypeTotal ? (familyType.get(t) || 0) / familyTypeTotal : 0
      const share = shrink(c, total, parent, o.shrinkPseudo)
      const confidence = o.characterCeiling * evidenceWeight(c, o.characterHalf) * recencyDecay
      fact('character', po.name, { dimension: 'placeType', placeType: t, share, observations: c, of: total }, confidence, recencyDecay, po.rows)
    }
  }

  // === timing : a place's TYPICAL time-of-day (circular mean + concentration) =========
  // Confidence carries the concentration, so a place whose visits scatter across the day
  // yields a WEAK timing fact rather than a false-crisp "typical time" (heterogeneous:
  // the fact shows its own reliability instead of pretending).
  for (const [key, po] of placeObs) {
    const st = sigOf.get(key)
    if (!st.timing.n) continue // no usable time on any filed photo → abstain
    const recencyDecay = decayFactor(po.lastMs, now, o.decayHalfLifeDays)
    const confidence = o.timingCeiling * evidenceWeight(st.timing.n, o.timingHalf) * st.timing.R * recencyDecay
    fact('timing', po.name, { meanMinute: Math.round(st.timing.mean), band: bandOf(st.timing.mean), concentration: st.timing.R, observations: st.timing.n }, confidence, recencyDecay, po.rows)
  }

  // === signature : the STACKED-place disambiguator (the founding payoff) ==============
  // Cluster distinct-named places whose footprints overlap (proximity PROPOSES). For each
  // stacked place, measure how far its non-spatial signature sits from its NEAREST sibling
  // across every dimension they SHARE (multidimensional — no single channel disposes). A
  // signature is emitted ONLY when that nearest-sibling distance clears the noise floor;
  // identical-looking stacked places emit NOTHING → the photo is left loose, never picked
  // by proximity (the founding sin refused, structurally).
  const geoKeys = [...placeGeo.keys()].filter((k) => isFin(placeGeo.get(k).lat) && isFin(placeGeo.get(k).lng)).sort()
  const parent = new Map(geoKeys.map((k) => [k, k]))
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
  for (let i = 0; i < geoKeys.length; i++) {
    for (let j = i + 1; j < geoKeys.length; j++) {
      const a = placeGeo.get(geoKeys[i]), b = placeGeo.get(geoKeys[j])
      const d = haversineMeters(a.lat, a.lng, b.lat, b.lng)
      if (d != null && d <= o.stackRadiusMeters) parent.set(find(geoKeys[i]), find(geoKeys[j]))
    }
  }
  const clusters = new Map()
  for (const k of geoKeys) { const root = find(k); if (!clusters.has(root)) clusters.set(root, []); clusters.get(root).push(k) }
  for (const members of clusters.values()) {
    if (members.length < 2) continue // not stacked → coordinates alone identify it → no discriminator needed
    // cluster centroid label (stable subject/value handle for the shared spot)
    let clat = 0, clng = 0
    for (const k of members) { clat += placeGeo.get(k).lat; clng += placeGeo.get(k).lng }
    const coordCell = `${(clat / members.length).toFixed(4)},${(clng / members.length).toFixed(4)}`
    for (const key of members) {
      const po = placeObs.get(key); const sp = sigOf.get(key)
      if (!po || !sp || sp.n <= 0) continue // no filed photos here → can't learn this place's look → abstain
      // distance to the NEAREST (hardest-to-tell-apart) sibling that HAS data
      let nearest = null
      for (const sib of members) {
        if (sib === key) continue
        const sq = sigOf.get(sib)
        if (!sq || sq.n <= 0) continue // sibling uncharacterized → can't prove distinctness from it
        const dd = signatureDistance(sp, sq, o)
        // BROAD agreement, not one channel (§16b multidimensional / the founding sin): a stacked
        // signature may rest ONLY on ≥2 shared, present dimensions. One shared dimension is not
        // enough to claim two stacked places are distinct — a single channel must never dispose.
        if (Object.keys(dd.dims).length < 2) continue // <2 shared dimensions → not comparable → skip this sibling
        if (nearest == null || dd.dist < nearest.dist) nearest = { sib, ...dd }
      }
      if (!nearest) continue // no comparable sibling → cannot claim a disambiguating signature → abstain (leave loose)
      const distinctiveness = nearest.dist
      if (distinctiveness < o.distinctFloor) continue // looks like its sibling → NO silent pick; emit nothing → leave loose
      const recencyDecay = decayFactor(po.lastMs, now, o.decayHalfLifeDays)
      const confidence = o.signatureCeiling * evidenceWeight(sp.n, o.signatureHalf) * distinctiveness * recencyDecay
      fact('signature', po.name, {
        coordCell,
        dominantType: dominant(sp.typeHist.obj),
        dominantSetting: dominant(sp.settingHist.obj),
        typicalMinute: sp.timing.mean != null ? Math.round(sp.timing.mean) : null,
        band: bandOf(sp.timing.mean),
        distinctiveness,
        sharedDimensions: Object.keys(nearest.dims).length, // ≥2 by the emit gate — the broad agreement this signature rests on (gauge-auditable)
        distinguishingDims: Object.entries(nearest.dims).sort((x, y) => y[1] - x[1]).map(([dim, dist]) => ({ dim, dist })), // §16b: which dimensions separate it — cite them
        nearestSibling: { name: placeObs.get(nearest.sib)?.name ?? nearest.sib, distance: distinctiveness },
        observations: sp.n,
      }, confidence, recencyDecay, po.rows)
    }
  }

  // === adjacency : practical RELATIONS (which places co-occur in a day's sequence) =====
  // Grounded in the itinerary the family actually arranged. Same-day co-occurrence with a
  // bonus for consecutive stops; recency-decayed; confidence grows with co-occurring days.
  const pair = new Map() // 'a|b' → { a, b, nameA, nameB, coDays, seqDays, rows:Set, lastMs }
  for (const t of trips || []) {
    const endMs = isFin(t?.endMs) ? t.endMs : null
    for (const d of t?.days || []) {
      const seq = (d.stops || []).map((s) => normName(s?.name)).filter(Boolean)
      const present = [...new Set(seq)].sort()
      const dayRow = `${t.id}::${d.isoDate}`
      const consecutive = new Set()
      for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) consecutive.add([seq[i - 1], seq[i]].sort().join('|'))
      for (let i = 0; i < present.length; i++) {
        for (let j = i + 1; j < present.length; j++) {
          const a = present[i], b = present[j], pk = `${a}|${b}`
          if (!pair.has(pk)) pair.set(pk, { a, b, nameA: nameByKey.get(a) ?? a, nameB: nameByKey.get(b) ?? b, coDays: 0, seqDays: 0, rows: new Set(), lastMs: null })
          const pr = pair.get(pk)
          pr.coDays += 1
          if (consecutive.has(pk)) pr.seqDays += 1
          pr.rows.add(dayRow)
          if (isFin(endMs)) pr.lastMs = pr.lastMs == null ? endMs : Math.max(pr.lastMs, endMs)
        }
      }
    }
  }
  for (const pr of pair.values()) {
    const recencyDecay = decayFactor(pr.lastMs, now, o.decayHalfLifeDays)
    const weighted = pr.coDays + o.seqBonus * pr.seqDays
    const confidence = o.adjacencyCeiling * evidenceWeight(weighted, o.adjacencyHalf) * recencyDecay
    fact('adjacency', [pr.nameA, pr.nameB], { withPlace: [pr.nameA, pr.nameB], coDays: pr.coDays, sequentialDays: pr.seqDays, observations: pr.coDays }, confidence, recencyDecay, pr.rows)
  }

  // Deterministic output order (independent of input ordering).
  const S = (v) => JSON.stringify(v)
  facts.sort((x, y) =>
    x.type < y.type ? -1 : x.type > y.type ? 1 :
      S(x.subject) < S(y.subject) ? -1 : S(x.subject) > S(y.subject) ? 1 :
        S(x.value) < S(y.value) ? -1 : S(x.value) > S(y.value) ? 1 : 0)
  return facts
}

// Signature distance between two stacked places, over the non-spatial dimensions they
// SHARE (a dimension either lacks data for abstains — heterogeneous honesty, never a
// zero). Returns the weighted-mean distance AND the per-dimension breakdown so a picker
// can cite the dimensions that agree (§16b multidimensional lens). Weighted MEAN (not max)
// is the conservative combiner: broad agreement is required to call two places distinct,
// so the machine errs toward leaving a photo loose rather than a thin one-dimension pick.
export function signatureDistance(P, Q, opts = {}) {
  const w = { ...PLACE_DEFAULTS.dimWeights, ...(opts.dimWeights || {}) }
  const reliableR = isFin(opts.timeReliableR) ? opts.timeReliableR : PLACE_DEFAULTS.timeReliableR
  const dims = {}
  if (P.typeHist.total > 0 && Q.typeHist.total > 0) dims.placeType = 1 - histOverlap(P.typeHist.obj, Q.typeHist.obj)
  if (P.settingHist.total > 0 && Q.settingHist.total > 0) dims.setting = 1 - histOverlap(P.settingHist.obj, Q.settingHist.obj)
  if (P.timing.R >= reliableR && Q.timing.R >= reliableR) { const d = circDiffMin(P.timing.mean, Q.timing.mean); if (d != null) dims.time = d / 720 }
  const keys = Object.keys(dims)
  if (!keys.length) return { dist: 0, dims: {} }
  let acc = 0, wsum = 0
  for (const k of keys) { const wk = w[k] ?? 1; acc += wk * dims[k]; wsum += wk }
  return { dist: wsum > 0 ? acc / wsum : 0, dims }
}

export default buildPlacesFacts
