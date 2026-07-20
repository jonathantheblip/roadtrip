// lattice/devices.js — the DEVICES branch of the world-model FACT LATTICE
// (DESIGN_THE_HEALING_MODEL.md §16d, one branch of six).
//
// Per-SOURCE facts, where a source is a PERSON × DEVICE (falling back to the person
// alone when the device is unknown — the single source-key definition shared by F3, this
// branch, and WHO-routing, BUILD_SPECS_GLANCE_ENGINE.md A13). HM-3's world model learned
// PLACES; §16d's catch was that the machine must also learn its own INSTRUMENTS — each
// camera/uploader has habits, and the habit the healer needs most is *where the holes
// are*. This branch is that home. Three device-shaped families of fact, each grounded in
// a signal the app ALREADY HOLDS on its photo refs + the F3 calibration ledger:
//
//   • clock OFFSET — the source's habitual UTC offset (the mode of the timezone offsets
//     its photos stamp; §16d "per-source clock offset"). Feeds the TIME channel: a source
//     with a stable offset has a recoverable local wall clock. An F3 offset calibration
//     (`offsetInference` converging on a constant shift, §F3) confirms it and lifts it to
//     human-corroborated grade.
//   • upload LAG — does this source habitually land its photos LATE (a backfill import)?
//     Classified by the app's OWN shipped instrument (timeWitness.importLagClass; F3's
//     `importLagClass 'long-demote'`). F3 lag calibrations LIVE here. Feeds the TIME
//     channel: a known-late source's created-at upper bound is loose BY HABIT, not
//     blanket-suspect — an expected pattern, never a surprise.
//   • metadata-SURVIVAL profile — per channel (gps / vision / offset / cameraTime), the
//     fraction of the source's photos that RETAIN that channel (§16d "which source strips
//     GPS/vision"). THE core "expect the right holes per source" fact: the machine expects
//     GPS≈0 from a source that strips it, so an absent GPS is UNSURPRISING (never a
//     demotion), and an UNEXPECTED presence is the notable event.
//
// Shaped like ITSELF, not like a sibling branch (§16b-heterogeneous). people.js pools
// category SHARES toward a family parent; a device's calibration has no "parent" to shrink
// to — its confidence is AGREEMENT (how unanimous the habit is) × EVIDENCE (how many
// photos back it) × DECAY. The guards it shares with every branch (§16d):
//
//   • A fact NUDGES, never asserts. Confidence is CLAMPED ≤ deviceCeiling (measured) or
//     confirmedCeiling (F3-confirmed), both well below 1 and below the bench's observed
//     band — so a real signal a photo actually carries always outweighs the expectation of
//     a hole. A "strips GPS" fact can never suppress a photo that DID keep its GPS.
//   • Absence ABSTAINS; never a negative vote (§13). A source we've never seen yields no
//     fact; a channel with no datable photos yields no fact; a source that never stamps an
//     offset yields no clock-offset fact (its offset is UNKNOWN, not zero) — though the
//     metadata-survival:offset fact still records the hole. A survival RATE of 0 across
//     real photos is a POSITIVE, earned fact ("this source's GPS is habitually empty"),
//     NOT an absence — the distinction the whole branch turns on.
//   • Imperfection is the medium (§13). A survival fact is emitted for every source seen
//     ≥ once; a thin/ambiguous habit (a 50/50 source) speaks at LOW confidence, never
//     silence — confidence carries how thin it is; the channel is never parked.
//   • DECAY. A source gone quiet fades (a swapped phone, a member who stopped shooting) —
//     a SHORTER half-life than places or people, because devices are replaced faster than
//     a beach house is sold or a person changes their rhythm.
//   • Every fact CITES its source rows (photo ref keys / feedback ids) — gauge-auditable;
//     deleting a cited row unlearns exactly the fact it fed (§16d, §7).
//   • Every constant is a DECLARED SEED (§15b), independently reasoned for THIS branch,
//     none shared with a sibling (§13). The lag/cameraTime thresholds are NOT re-invented
//     here — they are the app's own shipped instrument (timeWitness), imported read-only,
//     so this branch and the live heal path can never drift apart on what "late" means.
//
// PURE REPLAY FOLD (§16c keystone): recomputed each run from the ledgers, zero stored
// state, DETERMINISTIC — `now` comes from opts, the clock is never read here. Write-free.

import { importLagClass, isCameraAtSrc } from '../timeWitness.js'

const DAY = 86400000
const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const normStr = (s) => (typeof s === 'string' ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '')

// SEED values (§15b) — provisional until fit from the family's real data (HM-5-style
// ablation), never tuned by feel, each independently reasoned for THIS branch. None is
// borrowed from worldModel/people/bench — a shared threshold across branches is the §13
// heterogeneity sin. None may be lowered by judgment; only a measurement re-grades.
export const DEVICE_DEFAULTS = {
  // CLAMP (measured): a device HABIT is a firmer nudge than a cross-trip place prior — a
  // camera's metadata behaviour is near-deterministic (a model either stamps GPS or it
  // doesn't) — but it is still an EXPECTATION, never a read, so it is capped below 1 and
  // deliberately below the bench's observed band (currentFilingWeight 0.7). Its own value,
  // not worldModel's priorCeiling (0.5) nor people's confidenceCeiling (0.45).
  deviceCeiling: 0.6,
  // CLAMP (F3-confirmed): a human calibration ("that camera's clock ran an hour off", "my
  // photos upload late") is corroborated evidence — firmer — but still < the bench's
  // humanConfirmWeight (0.95): even a family tap about a pattern stays revisable (§7).
  confirmedCeiling: 0.85,
  // Evidence ramp n/(n+half) — a smooth 0→1 climb, NEVER a cutoff: confidence grows with
  // how many of the source's photos back the habit. Seen once still whispers. A device
  // habit firms up fast (a handful of photos reveal a consistent camera), so a smaller
  // half than people's 6. Its own seed.
  evidenceHalf: 3,
  // An F3 confirmation is worth this many corroborating photos of evidence — so a
  // human-attested calibration for a source with few/no measured photos still stands (the
  // human IS the evidence), bounded (§7). DECLARED SEED.
  confirmEvidenceWeight: 4,
  // DECAY half-life: a source unused this long has its facts halved. SHORTER than places
  // (worldModel 730d) or people (1095d) on purpose — a family swaps phones far faster than
  // it sells a beach house or a member changes their shooting rhythm (§13 heterogeneity).
  decayHalfLifeDays: 540,
}

// The four channels whose per-source survival the machine wants to expect (§16d).
export const SURVIVAL_CHANNELS = ['gps', 'vision', 'offset', 'cameraTime']

// ---- pure helpers -----------------------------------------------------------
// Evidence-weight: how much a fact has EARNED from its own observation count. Smooth ramp,
// never a gate — a single sighting still emits (at low weight).
const evidenceWeight = (n, half) => (half > 0 ? n / (n + half) : n > 0 ? 1 : 0)
// Decay by how long since the source was last active. No usable date ⇒ 1 (we never invent
// staleness we can't measure — that would be a §13 demotion by anxiety).
const decayFactor = (lastMs, nowMs, halfDays) => {
  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs) || !(halfDays > 0)) return 1
  return clamp01(Math.pow(0.5, Math.max(0, nowMs - lastMs) / (halfDays * DAY)))
}
const toMs = (v) =>
  Number.isFinite(v) ? v : typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null
const bump = (map, k, row) => {
  if (!map.has(k)) map.set(k, new Set())
  map.get(k).add(row)
}
const maxLast = (a, b) => (Number.isFinite(b) ? (Number.isFinite(a) ? Math.max(a, b) : b) : a)

// ---- ledger accessors (tolerant of raw-memory and points shapes) ------------
const personOf = (m) =>
  (typeof m?.author_traveler === 'string' && m.author_traveler) ||
  (typeof m?.authorTraveler === 'string' && m.authorTraveler) ||
  (typeof m?.author === 'string' && m.author) ||
  null

function refsOf(m) {
  if (Array.isArray(m?.photos)) return m.photos
  if (Array.isArray(m?.refs)) return m.refs
  if (Array.isArray(m?.photoRefs)) return m.photoRefs
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
const uploadMsOf = (m) => toMs(m?.createdAt ?? m?.created_at)

// Device identity = Make|Model from the never-discard sidecar (exifRead.js META_KEYS), or
// the flattened points shape. Empty on both ⇒ null ⇒ the person-only fallback source (A13).
const makeOf = (r) => normStr(r?.meta?.make ?? r?.make)
const modelOf = (r) => normStr(r?.meta?.model ?? r?.model)
const deviceKeyOf = (r) => {
  const mk = makeOf(r)
  const md = modelOf(r)
  return mk || md ? `${mk}|${md}` : null
}
const capturedMsOf = (r) => toMs(r?.capturedAt)
const atSrcOf = (r) =>
  (typeof r?.atSrc === 'string' && r.atSrc) || (typeof r?.capturedAtSource === 'string' && r.capturedAtSource) || null
const offsetOf = (r) => (Number.isFinite(r?.offsetMinutes) ? r.offsetMinutes : null)
const provGpsOf = (r) => r?.provGps ?? r?.prov?.gps ?? null
// A propagated / inferred coordinate is NOT the device retaining GPS — the pipeline filled
// a hole. Only an original (exif) fix counts as GPS having survived on this source.
const isDerivedCoord = (g) => typeof g === 'string' && (g === 'propagated' || g.startsWith('inferred'))
const gpsSurvived = (r) => Number.isFinite(r?.lat) && Number.isFinite(r?.lng) && !isDerivedCoord(provGpsOf(r))
const visionSurvived = (r) => {
  const v = r?.vision
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).some((k) => v[k] != null && v[k] !== '')) return true
  return [r?.placeType, r?.signage, r?.scene, r?.visionName, r?.setting, r?.labels].some((x) =>
    Array.isArray(x) ? x.length > 0 : x != null && x !== ''
  )
}
const refKeyOf = (r, i) => (r?.key != null ? String(r.key) : r?.url != null ? String(r.url) : `#${i}`)

const sourceKeyStr = (person, device) => `devices:${person ?? '∅'}::${device ?? '∅'}`

// A calibration's device may arrive as a "make|model" string or a { make, model } object.
const calDeviceKey = (d) => {
  if (d == null) return null
  if (typeof d === 'string') return normStr(d) || null
  if (typeof d === 'object') return deviceKeyOf({ meta: d })
  return null
}

// Deterministic mode of a Map(value -> Set(row)): the value with the most rows, ties broken
// by the numerically smallest value. Returns { value, count, total }.
function modeOf(counts) {
  let best = null
  let bestN = -1
  let total = 0
  for (const [val, rows] of counts) {
    total += rows.size
    if (rows.size > bestN || (rows.size === bestN && val < best)) {
      best = val
      bestN = rows.size
    }
  }
  return { value: best, count: bestN < 0 ? 0 : bestN, total }
}
// Deterministic dominant KEY of a Map(key -> Set(row)) with string keys (ties → alpha).
function dominantKey(counts) {
  let best = null
  let bestN = -1
  let total = 0
  for (const [key, rows] of counts) {
    total += rows.size
    if (rows.size > bestN || (rows.size === bestN && String(key) < String(best))) {
      best = key
      bestN = rows.size
    }
  }
  return { key: best, count: bestN < 0 ? 0 : bestN, total }
}

const unionRows = (...sets) => {
  const out = new Set()
  for (const s of sets) if (s) for (const r of s) out.add(r)
  return [...out].sort()
}

// ---- the fold ---------------------------------------------------------------
// buildDeviceFacts(trips, memories, feedback, opts) => facts[]
//   trips:    accepted for lattice-fold signature parity (§16d); this branch reads
//             memories + feedback only — device recency is the photos' own capture/upload
//             times, never a trip boundary, so trips is intentionally unused here.
//   memories: [{ id, author_traveler, createdAt, photo_r2_keys_json|photos[] }] — each
//             photo ref carrying (per exifRead.js / the heal point shape): key, capturedAt,
//             offsetMinutes, atSrc, meta:{make,model}, prov:{gps} | provGps, lat, lng,
//             vision:{…} (or flattened placeType/signage/scene/…).
//   feedback: the F3 device-calibration subset (UNBUILT today → the real corpus has none;
//             this shape is forward-compatible): { id, at?, calibration:'offset'|'lag',
//             person, device?, answer:'yes'|'no', offsetMinutes? }. Non-calibration rows
//             (placement answers) are ignored by THIS branch. `person` must match a
//             memory's author id; `device` is a make|model string or {make,model}, or
//             absent for the person-only fallback source (A13).
//   opts:     { now?, ...DEVICE_DEFAULTS overrides } — now is REQUIRED for decay; the
//             clock is NEVER read here (determinism, §16c).
export function buildDeviceFacts(trips, memories, feedback, opts = {}) {
  const o = { ...DEVICE_DEFAULTS, ...opts }
  const now = Number.isFinite(opts.now) ? opts.now : null // deterministic: no Date.now fallback

  // sourceKey -> accumulator. Each source is a person × device (device null = person-only).
  const sources = new Map()
  const getSource = (person, device) => {
    const key = sourceKeyStr(person, device)
    let s = sources.get(key)
    if (!s) {
      s = {
        person: person ?? null,
        device: device ?? null,
        key,
        lastMs: null,
        offsetCounts: new Map(), // offsetMinutes -> Set(rowKey) that stamped it
        lagCounts: new Map(), // informative importLagClass -> Set(rowKey)
        ch: {
          gps: { det: new Set(), pres: new Set() },
          vision: { det: new Set(), pres: new Set() },
          offset: { det: new Set(), pres: new Set() },
          cameraTime: { det: new Set(), pres: new Set() },
        },
        cal: { offset: null, lag: null }, // latest F3 calibration answer per kind
      }
      sources.set(key, s)
    }
    return s
  }

  // ---- fold the photo ledger --------------------------------------------------
  for (const m of memories || []) {
    const person = personOf(m)
    const uploadMs = uploadMsOf(m)
    const refs = refsOf(m)
    for (let i = 0; i < refs.length; i++) {
      const r = refs[i]
      if (!r || typeof r !== 'object') continue
      const device = deviceKeyOf(r)
      const src = getSource(person, device)
      const rk = `${m?.id ?? '?'}:${refKeyOf(r, i)}` // cites the memory + the ref
      const capMs = capturedMsOf(r)
      src.lastMs = maxLast(src.lastMs, Number.isFinite(capMs) ? capMs : uploadMs)

      // clock offset — only refs that actually stamped a tz offset speak (else the offset
      // is UNKNOWN, not zero → abstain from the clock-offset fact; the survival fact records
      // the hole below).
      const off = offsetOf(r)
      if (off != null) bump(src.offsetCounts, off, rk)

      // upload lag — the app's own instrument; 'no-signal' abstains (uninformative gap).
      const lc = importLagClass({ capturedAtMs: capMs, createdAtMs: uploadMs, atSrc: atSrcOf(r) })
      if (lc !== 'no-signal') bump(src.lagCounts, lc, rk)

      // metadata survival — every ref is determinable for gps/vision/offset; cameraTime is
      // determinable ONLY when atSrc is known (absent atSrc is UNKNOWN, not a stripped
      // camera time — timeWitness header) so it abstains from that channel's denominator.
      src.ch.gps.det.add(rk)
      if (gpsSurvived(r)) src.ch.gps.pres.add(rk)
      src.ch.vision.det.add(rk)
      if (visionSurvived(r)) src.ch.vision.pres.add(rk)
      src.ch.offset.det.add(rk)
      if (off != null) src.ch.offset.pres.add(rk)
      const atSrc = atSrcOf(r)
      if (atSrc != null) {
        src.ch.cameraTime.det.add(rk)
        if (isCameraAtSrc(atSrc)) src.ch.cameraTime.pres.add(rk)
      }
    }
  }

  // ---- fold the F3 calibration ledger (latest answer per source × kind wins) --
  for (const f of feedback || []) {
    const kind = f?.calibration
    if (kind !== 'offset' && kind !== 'lag') continue // not a device calibration → ignore
    const person =
      (typeof f.person === 'string' && f.person) ||
      (typeof f.by_traveler === 'string' && f.by_traveler) ||
      (typeof f.byTraveler === 'string' && f.byTraveler) ||
      null
    const device = calDeviceKey(f.device)
    const at = toMs(f.at)
    const src = getSource(person, device) // create the source even if it has no photos
    src.lastMs = maxLast(src.lastMs, at)
    const prev = src.cal[kind]
    // latest answer governs (§7: a later contrary answer re-grades again). Undated rows
    // never displace a dated one.
    const isNewer = !prev || (Number.isFinite(at) ? !Number.isFinite(prev.at) || at >= prev.at : false)
    if (isNewer) {
      src.cal[kind] = {
        answer: f.answer === 'yes' ? 'yes' : f.answer === 'no' ? 'no' : null,
        offsetMinutes: Number.isFinite(f.offsetMinutes) ? f.offsetMinutes : null,
        at,
        id: f.id != null ? String(f.id) : null,
      }
    }
  }

  // ---- emit facts -------------------------------------------------------------
  const facts = []
  const push = (type, src, value, { count, agreement, ceiling, rows, lastMs }) => {
    const recencyDecay = decayFactor(lastMs, now, o.decayHalfLifeDays)
    const confidence = clamp01(ceiling * evidenceWeight(count, o.evidenceHalf) * clamp01(agreement) * recencyDecay)
    facts.push({
      type,
      subject: { branch: 'devices', person: src.person, device: src.device },
      value,
      confidence, // CLAMPED ≤ ceiling (< 1) — a nudge, never an assertion
      recencyDecay,
      tier: 'prior', // a clamped, non-observed expectation (like worldModel/lexicon) — grades a channel, never files a photo
      sourceRows: rows,
    })
  }

  for (const src of sources.values()) {
    // === clock OFFSET =========================================================
    const offMode = modeOf(src.offsetCounts)
    const offCal = src.cal.offset
    const confirmedOff = offCal && offCal.answer === 'yes'
    // F3: "magnitude comes from the MEASUREMENT, never the human" — the human confirms THAT
    // the pattern is real, they do not supply its size. So the value is the measured mode
    // whenever one exists; a confirmation only corroborates it (raising confidence). The
    // human's own offsetMinutes is used ONLY as a last resort when there is no measured
    // stamp at all (a forward-compat edge — F3's no-fishing rule means this rarely arises).
    const offValue = offMode.value != null ? offMode.value : confirmedOff ? offCal.offsetMinutes : null
    if (offValue != null) {
      const rows = unionRows(
        src.offsetCounts.get(offMode.value), // the stamps backing the value (empty when confirmed-only)
        confirmedOff && offCal.id ? new Set([offCal.id]) : null
      )
      push(
        'clockOffset',
        src,
        {
          offsetMinutes: offValue,
          source: confirmedOff ? 'confirmed' : 'measured',
          of: offMode.total,
        },
        {
          count: offMode.total + (confirmedOff ? o.confirmEvidenceWeight : 0),
          agreement: confirmedOff ? 1 : offMode.total ? offMode.count / offMode.total : 0,
          ceiling: confirmedOff ? o.confirmedCeiling : o.deviceCeiling,
          rows,
          lastMs: src.lastMs,
        }
      )
    }

    // === upload LAG ===========================================================
    const lagDom = dominantKey(src.lagCounts)
    const lagCal = src.cal.lag
    const confirmedLag = lagCal && lagCal.answer === 'yes' // F3 only asks when measured ⇒ long-demote
    if (lagDom.total > 0 || confirmedLag) {
      const longRows = src.lagCounts.get('long-demote')
      const longCount = longRows ? longRows.size : 0
      const lagClass = confirmedLag ? 'long-demote' : lagDom.key
      const rows = unionRows(
        confirmedLag ? longRows || null : src.lagCounts.get(lagDom.key),
        confirmedLag && lagCal.id ? new Set([lagCal.id]) : null
      )
      push(
        'uploadLag',
        src,
        {
          lagClass,
          longFraction: lagDom.total ? longCount / lagDom.total : 0,
          source: confirmedLag ? 'confirmed' : 'measured',
          of: lagDom.total,
        },
        {
          count: lagDom.total + (confirmedLag ? o.confirmEvidenceWeight : 0),
          agreement: confirmedLag ? 1 : lagDom.total ? lagDom.count / lagDom.total : 0,
          ceiling: confirmedLag ? o.confirmedCeiling : o.deviceCeiling,
          rows,
          lastMs: src.lastMs,
        }
      )
    }

    // === metadata SURVIVAL (per channel) ======================================
    // Purely measured — no F3 calibration re-grades a survival profile. A channel with no
    // datable photo abstains (n === 0). A rate near 0 or 1 is a CONSISTENT habit (high
    // confidence); a 50/50 rate is a genuine coin-flip (low confidence, still speaks — §13).
    for (const channel of SURVIVAL_CHANNELS) {
      const c = src.ch[channel]
      const n = c.det.size
      if (n === 0) continue // absence → abstain, never a zero-survival guess from no data
      const present = c.pres.size
      const survival = present / n
      const consistency = Math.abs(survival - 0.5) * 2 // 1 = unanimous habit, 0 = 50/50
      push(
        'metadataSurvival',
        src,
        { channel, survival, present, of: n },
        {
          count: n,
          agreement: consistency,
          ceiling: o.deviceCeiling,
          rows: [...c.det].sort(),
          lastMs: src.lastMs,
        }
      )
    }
  }

  // Deterministic output order, independent of input ordering (§16c keystone).
  const subjKey = (s) => sourceKeyStr(s.subject.person, s.subject.device)
  facts.sort((x, y) =>
    x.type < y.type
      ? -1
      : x.type > y.type
        ? 1
        : subjKey(x) < subjKey(y)
          ? -1
          : subjKey(x) > subjKey(y)
            ? 1
            : JSON.stringify(x.value) < JSON.stringify(y.value)
              ? -1
              : JSON.stringify(x.value) > JSON.stringify(y.value)
                ? 1
                : 0
  )
  return facts
}

export default buildDeviceFacts
