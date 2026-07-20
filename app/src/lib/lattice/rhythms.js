// lattice/rhythms.js — the RHYTHMS branch of the world-model fact lattice
// (DESIGN_THE_HEALING_MODEL.md §16d), an organ of the Learning Spine (§16c).
//
// The world model is a FACT LATTICE, not a place list (§16d). This branch holds the
// family's TEMPORAL shape — the "when" that the place-branch's "where" can't hold:
//
//   • DAILY SHAPE — the time-of-day each kind of activity tends to happen
//     (first-night dinner in the evening, morning-beach at midday, the quiet hour).
//     A boundary/time prior: it feeds the time witness and helps the settling engine
//     see where one moment ends and the next begins.
//   • TRIP SHAPE — does this family STAY put (a cabin, Grandma's, a beach house) or
//     ROAM (a city-break)? A stay-trip has fewer moment-boundaries per day. (The road
//     trip is the RARE far tail of roaming — never a second mode, never route/ETA
//     logic; nothing here reconstructs a drive. It is just "roaming, a lot.")
//   • SPLITTING — this family sometimes splits (beach & town at once). Learned from
//     structure answers AND from photos that are physically parallel: two places at the
//     SAME minute (one person can't be both) — time AND place dispose together, the
//     §16b multidimensional guard, never proximity alone.
//   • CALENDAR CADENCE — a place returned to in the same calendar window across years
//     (Provincetown each July 4th), so next year's trip starts half-organized.
//
// The lessons live in the SHAPE, so a later reader can't quietly undo them (§16d guards):
//   • A fact NUDGES, never asserts. Every confidence is clamped by `ceiling` — well below
//     certainty AND below the settling engine's file threshold — so the off-rhythm photo
//     the family most wants right always wins on its OWN observed evidence (§13/§16d). A
//     rhythm can heal a photo softly; it can never file one silently.
//   • GRADED, never a cutoff. Strength grows smoothly with the family's own history; one
//     observation already whispers. "Not enough data yet" is a line uncrossed, not a gate.
//   • DECAYING. A habit fades when a family's life changes (moved house, a place sold), so
//     a stale rhythm loses its voice instead of dragging new photos to a vanished pattern.
//   • ABSENCE ABSTAINS. A signal never seen emits NOTHING — never a negative vote. A
//     structure answer of "no, we didn't split" does not suppress observed parallelism; a
//     negation is not a witness against the evidence (§7, possibility not probability).
//   • EVERY FACT CITES ITS SOURCE ROWS. Delete the rows and the fact unlearns itself —
//     the operator gauge can trace exactly what was learned from which ledger rows (§16c).
//   • CONFIDENCE COUNTS TRIPS, NEVER PHOTOS. A burst of photos on one afternoon must not
//     masquerade as a firm rhythm (§7: scattered photos cheat via burst correlation).
//
// PURE REPLAY (§16c keystone): all learned structure is RECOMPUTED each run as a pure fold
// over the ledgers the app already keeps — no stored state, deterministic (the clock comes
// only from opts.now; never Date.now()/Math.random()). Scale honesty (§16d): at ~4 trips
// most of these facts are whispers shrinking to their parents. That is correct, not a defect.
//
// Every number is a DECLARED SEED (§15b) — provisional until FIT from the family's real
// data, never a felt/fitted value, and NONE tuned DOWN by judgment (§13: demotion-by-anxiety
// is the pinned drift). A later measurement re-grades a channel; temperament never does.

const DAY = 86400000
const MINS_PER_DAY = 1440
const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const round3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x)
const normName = (s) => (typeof s === 'string' ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '')
const uniqSorted = (arr) =>
  [...new Set((arr || []).filter((x) => x != null))].sort((a, b) =>
    String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)

// SEED values (§15b) — declared, never felt. Each family declares the seed appropriate to
// ITS own evidence unit; no threshold is shared with another branch (that would force one
// shape onto differently-shaped signals — the heterogeneous-data drift, §16b).
export const RHYTHM_DEFAULTS = {
  // CLAMP — a rhythm is a diffuse temporal prior; it nudges, never asserts. Capped well
  // below certainty. Deliberately BELOW worldModel's 0.5 place-recurrence ceiling: a
  // temporal habit is a weaker, more diffuse prior than a NAMED place returning, and it
  // must sit below the settling engine's file/conflict criteria so a real observed reading
  // always outranks it (the §13/§16d off-rhythm guard). Provisional until fit.
  ceiling: 0.45,

  // Saturating evidence curve: strength = 1 − 0.5^(count / half). GRADED, no cutoff — one
  // observation already whispers, more sharpen it smoothly. Each family's half-life is in
  // its OWN unit (trips / years / split-days), never a shared constant.
  dailyEvidenceHalf: 2, // distinct TRIPS showing an activity's time before its prior ≈ 0.5
  tripShapeHalf: 3, // distinct trips before the family's stay-vs-roam base-rate firms
  splitEvidenceHalf: 2, // distinct split-days / confirmations before the split prior firms
  cadenceYearsHalf: 2, // distinct YEARS before an annual-cadence prior ≈ 0.5

  // DECAY — a rhythm fades when a family's life changes. Halved after this long unseen.
  // Daily/trip/split HABITS fade faster than a slow ANNUAL calendar cadence.
  habitDecayHalfDays: 730, // daily-shape / trip-shape / split habits: ~2y half-life
  cadenceDecayHalfDays: 1460, // annual calendar cadence: ~4y half-life (a slower rhythm)

  // Splitting: two photos at DIFFERENT stops whose times fall within this window are
  // physically parallel — one person can't be both, so time + place dispose TOGETHER (the
  // multidimensional disposer that separates a genuine split from one person walking over).
  splitOverlapMin: 20, // soft window, seed

  // Trip-shape: distinct-places-per-day AT OR BELOW this reads as SETTLED (stay-at-base);
  // above it reads as ROAMING (a city-break; the road trip is the far tail, no route logic).
  settledPlacesPerDay: 1.0, // soft boundary, seed

  // Calendar cadence: trip dates within this many days (circular, mod 365) share a calendar
  // window ("each early July"). Soft tolerance, seed — fit from real trip dates later.
  cadenceWindowDays: 21,

  // Emit floor: a fact whose clamped confidence is below this isn't worth emitting (pure
  // noise) — the bench's minMembership discipline, my OWN declared copy. NOT a decision
  // cutoff (settling decides, not this fold): an emit floor only.
  minConfidence: 0.02,
}

// ---- graded shapes (soft, never cutoffs) -----------------------------------
// Smooth saturating growth in the family's own history — seen-once still whispers.
const saturating = (count, half) => 1 - Math.pow(0.5, Math.max(0, count) / (half > 0 ? half : 1))
// A pattern's voice fades with time since it was last lived.
const decayMultiplier = (lastSeenMs, nowMs, halfDays) => {
  if (!Number.isFinite(lastSeenMs) || !Number.isFinite(nowMs) || !(halfDays > 0)) return 1
  return clamp01(Math.pow(0.5, Math.max(0, nowMs - lastSeenMs) / (halfDays * DAY)))
}

// ---- small time helpers (same conventions as evidenceBench / healShadow) -----
// The local instant is offset-applied UPSTREAM (the adapter's pt.at); we then read it in
// UTC, exactly as the bench's localMinuteOfDay / the adapter's localISO do.
const localMinuteOfDay = (ms) => (Number.isFinite(ms) ? new Date(ms).getUTCHours() * 60 + new Date(ms).getUTCMinutes() : null)
const localDayIso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null)
const isoToMs = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN }
const dayOfYear = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(+m[1], 0, 1)) / DAY) + 1 : null }

// Circular mean of minutes-of-day (00:00 and 23:59 are neighbours, not opposites), plus the
// resultant length R ∈ [0,1] as a concentration: R≈1 = a tight window, R≈0 = scattered.
function circularMeanMin(mins) {
  let sx = 0, sy = 0, n = 0
  for (const m of mins || []) {
    if (!Number.isFinite(m)) continue
    const a = (m / MINS_PER_DAY) * 2 * Math.PI
    sx += Math.cos(a); sy += Math.sin(a); n++
  }
  if (!n) return { mean: null, R: 0 }
  let mean = (Math.atan2(sy, sx) / (2 * Math.PI)) * MINS_PER_DAY
  if (mean < 0) mean += MINS_PER_DAY
  return { mean, R: Math.sqrt(sx * sx + sy * sy) / n }
}

// The smallest circular arc (in days, mod `period`) that covers every date, and its centre.
// range≈0 = all dates on the same day-of-year; a wide range = no shared calendar window.
function circularRangeDays(daysOfYear, period = 365) {
  const xs = uniqSorted((daysOfYear || []).filter(Number.isFinite)).map(Number).sort((a, b) => a - b)
  if (!xs.length) return { range: period, center: null }
  if (xs.length === 1) return { range: 0, center: xs[0] }
  let maxGap = -1, gapAt = 0
  for (let i = 0; i < xs.length; i++) {
    const next = i + 1 < xs.length ? xs[i + 1] : xs[0] + period
    if (next - xs[i] > maxGap) { maxGap = next - xs[i]; gapAt = i }
  }
  const range = period - maxGap
  const startVal = xs[(gapAt + 1) % xs.length] // the covered arc begins just after the largest gap
  return { range, center: Math.round(((startVal - 1 + range / 2) % period) + 1) }
}

// ---- defensive accessors (thread the real trips/memories/feedback shapes) ----
const tripId = (t) => t?.id ?? null
const tripDays = (t) => (Array.isArray(t?.days) ? t.days : [])
const tripStops = (t) => (Array.isArray(t?.stops) && t.stops.length ? t.stops : tripDays(t).flatMap((d) => (Array.isArray(d?.stops) ? d.stops : [])))
const tripLastMs = (t) => {
  if (Number.isFinite(t?.endMs)) return t.endMs
  const ds = tripDays(t).map((d) => isoToMs(d?.isoDate)).filter(Number.isFinite)
  return ds.length ? Math.max(...ds) : NaN
}
const tripStartIso = (t) => {
  const ds = uniqSorted(tripDays(t).map((d) => d?.isoDate).filter(Boolean))
  if (ds.length) return ds[0]
  return Number.isFinite(t?.endMs) ? new Date(t.endMs).toISOString().slice(0, 10) : null
}
// The fold threads RAW memory rows — a memory carrying a NESTED photo array
// (photos[] / photo_r2_keys_json) plus memory-level trip / stop / author — the SAME shape
// people/places/devices flatten. So this branch flattens too (it used to read placeType/time
// at the memory ROW level, which the raw shape never carries → the daily & split facts SILENTLY
// MUTED). photosOf(m) → per-PHOTO points, each inheriting the memory's trip/stop/author and
// reading its OWN placeType/time. An already-FLAT photo-point still passes through unchanged
// (mirrors places.toPoints), so a fixture can feed either shape. Read defensively throughout.
const memTrip = (m) => m?.tripId ?? m?.trip_id ?? null
const memStop = (m) => m?.stopId ?? m?.stop_id ?? null
const memAuthor = (m) =>
  (typeof m?.author_traveler === 'string' && m.author_traveler) ||
  (typeof m?.authorTraveler === 'string' && m.authorTraveler) ||
  (typeof m?.author === 'string' && m.author) ||
  null

// The nested photo array under its several stored names (mirror people/places/devices).
function photosOf(m) {
  if (Array.isArray(m?.photos)) return m.photos
  if (Array.isArray(m?.photo_r2_keys)) return m.photo_r2_keys
  if (typeof m?.photo_r2_keys_json === 'string') {
    try { const a = JSON.parse(m.photo_r2_keys_json); return Array.isArray(a) ? a : [] } catch { return [] }
  }
  return []
}
// Per-PHOTO placeType (vision.placeType on a raw ref, or a flat point's own placeType) and its
// OFFSET-APPLIED local instant (read in UTC downstream) — mirrors places.atOf: a ready local ms
// (atLocalMs/at) wins, else capturedAt + offsetMinutes ENCODES the local wall clock.
const photoPlaceType = (p) =>
  p && typeof p === 'object'
    ? typeof p.vision?.placeType === 'string' && p.vision.placeType
      ? p.vision.placeType
      : typeof p.placeType === 'string' && p.placeType
        ? p.placeType
        : null
    : null
const photoLocalMs = (p) => {
  if (Number.isFinite(p?.atLocalMs)) return p.atLocalMs
  if (Number.isFinite(p?.at)) return p.at
  if (typeof p?.capturedAt === 'string') { const t = Date.parse(p.capturedAt); return Number.isFinite(t) ? t + (Number.isFinite(p.offsetMinutes) ? p.offsetMinutes : 0) * 60000 : NaN }
  return Number.isFinite(p?.capturedAt) ? p.capturedAt : NaN
}

// Flatten memories into photo-POINTS — one per photo — each carrying the memory-level
// trip/stop/author (a photo inherits its memory's filing) and its own placeType/time. A raw
// memory expands to N points; an already-flat point passes through as one (places.toPoints
// parity). THE co-coherence fix (§16d): the branch now accepts the SAME raw-memory shape
// buildLattice feeds all six branches, instead of silently reading nothing off the row level.
function toPoints(memories) {
  const out = []
  for (const m of memories || []) {
    if (!m || typeof m !== 'object') continue
    const tid = memTrip(m)
    const author = memAuthor(m) // carried for sibling-parity; no rhythm fact reads it today
    const memStopId = memStop(m)
    const arr = photosOf(m)
    if (arr.length) {
      for (const e of arr) {
        if (!e || (e.id == null && e.key == null)) continue
        out.push({ id: e.id ?? e.key, tripId: tid, stopId: e.stopId ?? e.currentStopId ?? e.stop_id ?? memStopId, author, placeType: photoPlaceType(e), at: photoLocalMs(e) })
      }
    } else if (m.id != null || m.key != null) { // already a flat photo-point
      out.push({ id: m.id ?? m.key, tripId: tid, stopId: memStopId, author, placeType: photoPlaceType(m), at: photoLocalMs(m) })
    }
  }
  return out
}

// ---- DAILY SHAPE — time-of-day prior per activity kind ----------------------
// Joins the two abundant real channels (vision.placeType × the photo's local time) into a
// soft time-of-day prior for each activity. Confidence counts DISTINCT TRIPS, never photos
// (§7 burst guard); the concentration R sharpens it — an activity at scattered times is a
// weaker time-prior even when frequent (a low-R fact whispers where a high-R one nudges).
function dailyShapeFacts(trips, points, now, o) {
  const tripLast = new Map((trips || []).map((t) => [tripId(t), tripLastMs(t)]))
  const byType = new Map()
  for (const p of points || []) {
    const pt = p.placeType; const ms = p.at
    if (!pt || !Number.isFinite(ms) || p.id == null) continue
    const min = localMinuteOfDay(ms); if (min == null) continue
    const key = normName(pt)
    if (!byType.has(key)) byType.set(key, { label: pt, mins: [], trips: new Set(), rows: [], lastSeen: -Infinity })
    const rec = byType.get(key)
    rec.mins.push(min); rec.rows.push(p.id)
    const tid = p.tripId; if (tid != null) rec.trips.add(tid)
    const tl = tripLast.get(tid)
    rec.lastSeen = Math.max(rec.lastSeen, Number.isFinite(tl) ? tl : ms) // trip end, else the photo's own instant
  }
  const facts = []
  for (const [key, rec] of byType) {
    const { mean, R } = circularMeanMin(rec.mins)
    const nTrips = rec.trips.size || 1
    const strength = saturating(nTrips, o.dailyEvidenceHalf) * R
    const recencyDecay = decayMultiplier(rec.lastSeen, now, o.habitDecayHalfDays)
    const confidence = clamp01(o.ceiling * strength * recencyDecay)
    if (confidence < o.minConfidence) continue
    facts.push({
      subject: `rhythm:daily:${key}`,
      value: { activity: rec.label, typicalMin: mean == null ? null : Math.round(mean), concentration: round3(R), photos: rec.mins.length, trips: rec.trips.size },
      confidence, recencyDecay, sourceRows: uniqSorted(rec.rows),
    })
  }
  return facts
}

// ---- TRIP SHAPE — does the family STAY put, or ROAM? ------------------------
// distinct places per day: a stay-at-base trip revisits few places over many days
// (≈1/day → settled); a city-break touches many (→ roaming). The road trip is the far
// tail of roaming — never its own mode, and NO route/order/ETA is computed here. Emits a
// family base-rate per shape (a top-down prior: a family that usually stays is a-priori
// more likely to stay next time → fewer moment-boundaries expected).
function tripShapeFacts(trips, now, o) {
  const byShape = new Map()
  let total = 0
  for (const t of trips || []) {
    const names = uniqSorted(tripStops(t).map((s) => normName(s?.name)).filter(Boolean))
    const days = uniqSorted(tripDays(t).map((d) => d?.isoDate).filter(Boolean))
    const spanDays = days.length || (tripStops(t).length ? 1 : 0)
    if (!names.length || !spanDays) continue // unclassifiable → abstain, never a guess
    const shape = names.length / spanDays <= o.settledPlacesPerDay ? 'settled' : 'roaming'
    total++
    if (!byShape.has(shape)) byShape.set(shape, { trips: new Set(), rows: [], lastSeen: -Infinity })
    const rec = byShape.get(shape)
    rec.trips.add(tripId(t)); rec.rows.push(tripId(t))
    const ms = tripLastMs(t); if (Number.isFinite(ms)) rec.lastSeen = Math.max(rec.lastSeen, ms)
  }
  if (!total) return []
  const facts = []
  for (const [shape, rec] of byShape) {
    const baseRate = rec.trips.size / total
    const strength = saturating(total, o.tripShapeHalf) * baseRate // enough trips to trust it × how dominant this shape is
    const recencyDecay = decayMultiplier(rec.lastSeen, now, o.habitDecayHalfDays)
    const confidence = clamp01(o.ceiling * strength * recencyDecay)
    if (confidence < o.minConfidence) continue
    facts.push({ subject: `rhythm:tripShape:${shape}`, value: { shape, trips: rec.trips.size, ofTrips: total, baseRate: round3(baseRate) }, confidence, recencyDecay, sourceRows: uniqSorted(rec.rows) })
  }
  return facts
}

// A structure answer that AFFIRMS a split. Defensive over the answer-ledger shape. A "no"
// answer is NOT collected — a negation abstains, it never votes against observed evidence.
function splitConfirmations(feedback) {
  const out = []
  for (const f of feedback || []) {
    if (!f) continue
    const kind = f.kind ?? f.type
    if (kind !== 'structure' && kind !== 'split') continue
    const ans = f.answer ?? f.value ?? f.response
    if (!(f.split === true || ans === true || ans === 'yes' || ans === 'split' || ans === 'split-up')) continue
    out.push({ id: f.id ?? null, at: Number.isFinite(f.atLocalMs) ? f.atLocalMs : Number.isFinite(f.at) ? f.at : f.answeredAt ? Date.parse(f.answeredAt) : NaN })
  }
  return out
}

// ---- SPLITTING — the family sometimes splits (beach & town at once) ---------
// Observed: same day, two DISTINCT stops, photo-times overlapping within splitOverlapMin —
// physically parallel, one person can't be both, so TIME and PLACE dispose together (§16b).
// Plus any structure-answer confirmations (human, so still clamped). Emits ONE presence
// fact: "this family DOES split" is a boundary prior (allow parallel moments) — a rate, not
// a base-rate divided down to nothing, because even occasional splitting must be allowed for.
function splitFacts(trips, points, feedback, now, o) {
  const byTripDay = new Map() // tripId␀day -> Map(stopId -> [{min, id, ms}])
  for (const p of points || []) {
    const tid = p.tripId; const sid = p.stopId; const ms = p.at
    if (tid == null || sid == null || !Number.isFinite(ms) || p.id == null) continue
    const min = localMinuteOfDay(ms); const day = localDayIso(ms)
    if (min == null || !day) continue
    const k = `${tid} ${day}`
    if (!byTripDay.has(k)) byTripDay.set(k, new Map())
    const sm = byTripDay.get(k)
    if (!sm.has(sid)) sm.set(sid, [])
    sm.get(sid).push({ min, id: p.id, ms })
  }
  const splitDays = []
  for (const sm of byTripDay.values()) {
    const stops = [...sm.entries()]
    let found = null
    for (let i = 0; i < stops.length && !found; i++) {
      for (let j = i + 1; j < stops.length && !found; j++) {
        for (const a of stops[i][1]) {
          const b = stops[j][1].find((x) => Math.abs(a.min - x.min) <= o.splitOverlapMin)
          if (b) { found = { rows: [a.id, b.id], ms: Math.max(a.ms, b.ms) }; break }
        }
      }
    }
    if (found) splitDays.push(found)
  }
  const confs = splitConfirmations(feedback)
  const evidenceCount = splitDays.length + confs.length
  if (evidenceCount < 1) return [] // never seen them split, nobody said so → ABSTAIN
  const strength = saturating(evidenceCount, o.splitEvidenceHalf)
  const lastSeen = Math.max(-Infinity, ...splitDays.map((r) => r.ms).filter(Number.isFinite), ...confs.map((c) => c.at).filter(Number.isFinite))
  const recencyDecay = decayMultiplier(Number.isFinite(lastSeen) ? lastSeen : NaN, now, o.habitDecayHalfDays)
  const confidence = clamp01(o.ceiling * strength * recencyDecay)
  if (confidence < o.minConfidence) return []
  return [{
    subject: 'rhythm:splits',
    value: { observedSplitDays: splitDays.length, confirmedSplits: confs.length },
    confidence, recencyDecay,
    sourceRows: uniqSorted([...splitDays.flatMap((r) => r.rows), ...confs.map((c) => c.id)]),
  }]
}

// ---- CALENDAR CADENCE — the same place in the same window across years ------
// A place seen across DISTINCT years whose trip-dates cluster in one calendar window
// (Provincetown each July 4th). Grounded in stop names × trip dates — NO coordinate merge
// (name-keyed, the founding stacked-places lesson). Plus a family "season" fact from the
// trips' own dates. So next year, in this window, the machine starts half-organized.
function cadenceFacts(trips, now, o) {
  const facts = []
  const byName = new Map()
  const starts = []
  for (const t of trips || []) {
    const startIso = tripStartIso(t); const doy = dayOfYear(startIso)
    const year = startIso ? +startIso.slice(0, 4) : null
    const ms = tripLastMs(t)
    if (doy == null || year == null) continue
    starts.push({ doy, year, ms, row: tripId(t) })
    for (const s of tripStops(t)) {
      const nm = normName(s?.name); if (!nm) continue
      if (!byName.has(nm)) byName.set(nm, [])
      byName.get(nm).push({ year, doy, ms, row: s?.id ?? tripId(t), label: s?.name })
    }
  }
  const emitCadence = (subject, occ, value) => {
    const years = uniqSorted(occ.map((x) => x.year))
    if (years.length < 2) return // annual cadence needs DISTINCT years — one year is not a rhythm
    const clus = circularRangeDays(occ.map((x) => x.doy))
    if (clus.range > o.cadenceWindowDays) return // dates don't cluster → no shared window → abstain
    const tightness = clamp01(1 - clus.range / o.cadenceWindowDays)
    const strength = saturating(years.length, o.cadenceYearsHalf) * (0.5 + 0.5 * tightness) // years drive it; tightness sharpens
    const lastSeen = Math.max(-Infinity, ...occ.map((x) => x.ms).filter(Number.isFinite))
    const recencyDecay = decayMultiplier(Number.isFinite(lastSeen) ? lastSeen : NaN, now, o.cadenceDecayHalfDays)
    const confidence = clamp01(o.ceiling * strength * recencyDecay)
    if (confidence < o.minConfidence) return
    facts.push({ subject, value: { ...value, centerDayOfYear: clus.center, windowDays: clus.range, years }, confidence, recencyDecay, sourceRows: uniqSorted(occ.map((x) => x.row)) })
  }
  for (const [nm, occ] of byName) emitCadence(`rhythm:annual:${nm}`, occ, { name: occ[0].label })
  emitCadence('rhythm:season', starts, {})
  return facts
}

// foldRhythms — the PURE REPLAY fold (§16c). Recomputed each run over the ledgers the app
// already keeps; deterministic (clock ONLY from opts.now — never the real clock). Returns
// graded, decaying, clamped, source-cited temporal facts, sorted by subject for determinism.
//   trips:    [{ id, endMs?, days:[{ isoDate, stops:[{ id, name, lat?, lng?, timeMin?, kind? }] }], stops? }]
//   memories: RAW rows [{ id, trip_id|tripId, stop_id?, author?, photo_r2_keys_json|photos[] }],
//             each photo ref { key|id, capturedAt+offsetMinutes|at|atLocalMs, vision.placeType|placeType, stopId? }
//             — OR already-FLAT photo-points [{ id, tripId, stopId?, atLocalMs|at, placeType? }].
//             Flattened via toPoints so the branch accepts the SAME shape buildLattice feeds all six.
//   feedback: [{ id, kind:'structure'|'split', answer|split?, tripId?, at? }]  (the answer ledger; may be empty)
//   opts:     { now?, ...seed overrides }
export function foldRhythms(trips, memories, feedback, opts = {}) {
  const o = { ...RHYTHM_DEFAULTS, ...opts }
  const now = Number.isFinite(opts.now) ? opts.now : NaN // deterministic: no clock ⇒ no decay (facts stand, never silently zeroed)
  // Flatten the raw memory rows into photo-points ONCE (mirror people/places/devices), so the
  // daily & split folds read per-PHOTO placeType/time — the shape buildLattice actually threads.
  const points = toPoints(memories)
  return [
    ...dailyShapeFacts(trips, points, now, o),
    ...tripShapeFacts(trips, now, o),
    ...splitFacts(trips, points, feedback, now, o),
    ...cadenceFacts(trips, now, o),
  ].sort((a, b) => (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0))
}
