// sessionHeal.js — the v2 ADAPTER: ties the pure engine to real trip data.
//
// Per day: normalize memories → time-bearing points (LOCAL wall-clock via the
// offset, ea2296a) → buildSessions (bursts + GPS inheritance) → resolve each
// LOCATED session's place through v1's tuned matchPhotoToStop (GPS only — reuse,
// never reinvent the geo tolerance) → normalize the day's places from v1's
// buildDayIndex → scoreDay. Output: per-day tiered decisions (auto/confirm/leave)
// with explainable signals — exactly what the shadow LEARNING ledger records.
//
// Metadata-blind photos (no capturedAt) are intentionally excluded — the engine
// is time+evidence; those are the vision/naming track (SPEC_V2 Pillar 1 floor).
//
// Imports v1's client matcher; the worker adapter mirrors this against the worker
// matcher (the photoHealRunner precedent). Deterministic given its inputs.

import { buildMoments } from './sessions.js'
import { scoreDay } from './sessionScorer.js'
import { buildDayIndex, matchPhotoToStop, isImplicitBaseId, isRecordTargetId } from './photoMatch.js'
import { parseStopTime } from './photoBackfill.js'
import { isSuggestionGradeAtSrc, importLagClass, isPassengerRef } from './timeWitness.js'
import { manualStopEvidence } from './humanWords.js'

const numOrU = (x) => (Number.isFinite(x) ? x : undefined)

// W8 (BUILD_PLAN_WITNESS_FLEET_2.md), D14: memory.created_at, dual-naming
// tolerant — worker rows are snake_case epoch-ms; a client-shaped memory object
// (or v1's rowToHealMemory output) may carry camelCase createdAt as either an
// epoch-ms number or an ISO string. Same tolerant-read posture as `author`
// above. undefined when nothing usable is present.
function createdAtMsOf(m) {
  if (Number.isFinite(m?.created_at)) return m.created_at
  if (Number.isFinite(m?.createdAt)) return m.createdAt
  if (typeof m?.createdAt === 'string' && m.createdAt) {
    const t = Date.parse(m.createdAt)
    if (Number.isFinite(t)) return t
  }
  return undefined
}

// W8 item 4 (constitution rule 1's enforcement gap): a REFERENCE-tier GPS
// provenance set — real exif/scan reads only, never a propagated/inferred
// coordinate. (+'confirmed' once S1 lands, D13 — not yet, so not here today.)
const REFERENCE_GPS_PROV = new Set(['exif', 'scan'])

// W8 item 2 (D1 qualifier): the moment's TIME ANCHOR excludes suggestion-grade
// members (file-mtime atSrc), item 1(a)'s synthetic created-at-upper-bound
// members, and any member a LONG import lag (item 1b) marks suspect — from the
// median computation, falling back to the full membership only when EVERY
// member is suspect, and flagging that fallback as `timeAnchorSuspect` so the
// scorer's canAuto (Pass 2) refuses to silently trust it.
function anchoringMedian(photoIds, meta) {
  const withAt = []
  for (const id of photoIds || []) {
    const mm = meta.get(id)
    if (mm && Number.isFinite(mm.at)) withAt.push({ id, at: mm.at, mm })
  }
  const suspectMember = (mm) =>
    !!mm.createdAtUpperBound || isSuggestionGradeAtSrc(mm.atSrc) || mm.lagClass === 'long-demote'
  const trustworthy = withAt.filter((x) => !suspectMember(x.mm))
  const pool = trustworthy.length ? trustworthy : withAt
  const timeAnchorSuspect = trustworthy.length === 0 && withAt.length > 0
  pool.sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id)))
  const medianAt = pool.length ? pool[Math.floor((pool.length - 1) / 2)].at : null
  return { medianAt, timeAnchorSuspect }
}

// Accept a memory in D1-row shape (photo_r2_keys_json string) OR normalized
// (`photos`/`refs` array). Returns the photo refs.
function refsOf(m) {
  if (Array.isArray(m.photos)) return m.photos
  if (Array.isArray(m.refs)) return m.refs
  if (typeof m.photo_r2_keys_json === 'string') {
    try {
      const a = JSON.parse(m.photo_r2_keys_json)
      return Array.isArray(a) ? a : a ? [a] : []
    } catch {
      return []
    }
  }
  return []
}

// minutes from LOCAL midnight for a local-wall-as-UTC instant (medianMs = the
// real UTC instant already shifted by the offset, so getUTC* reads local components)
const localMin = (ms) => new Date(ms).getUTCHours() * 60 + new Date(ms).getUTCMinutes()

// a place's clock time in minutes-from-midnight, or null if vague ("Afternoon")
function placeTimeMin(timeStr, iso) {
  const { at, loose } = parseStopTime(timeStr, iso)
  if (loose || !Number.isFinite(at)) return null
  const base = Date.parse(`${iso}T00:00:00.000Z`)
  return Math.round((at - base) / 60000)
}

function placeKind(st) {
  if (st.isBase || isImplicitBaseId(st.id)) return 'base'
  if (st._recordEntry || isRecordTargetId(st.id)) return 'record'
  return 'stop'
}

// The moment's VISION name: the most common Claude-vision name across its photos (the
// content dimension). Used to NAME a moment with no located/agenda place — turning an
// unplaced burst ("leave") into a named one to confirm ("At the beach"). null when no
// photo in the moment carries a vision name.
function momentVisionName(photoIds, meta) {
  const counts = new Map()
  for (const pid of photoIds || []) {
    const v = meta.get(pid)?.vision
    const name = v && typeof v.name === 'string' ? v.name.trim() : ''
    if (name) counts.set(name, (counts.get(name) || 0) + 1)
  }
  let best = null
  let bestN = 0
  for (const [name, n] of counts) {
    if (n > bestN) {
      best = name
      bestN = n
    }
  }
  return best
}

// Common activity lead-words that read WARMER lowercased mid-sentence ("look like
// walking around town", not "…Walking around town"). A safelist, never a guess:
// a capitalized word NOT in here — a proper noun like "July" — is left untouched.
const WARM_LEAD = new Set([
  'walking', 'wandering', 'strolling', 'exploring', 'playing', 'hanging', 'relaxing',
  'shopping', 'browsing', 'poking', 'swimming', 'hiking', 'biking', 'riding',
  'visiting', 'watching', 'having', 'eating', 'grabbing', 'getting', 'making',
  'dinner', 'lunch', 'breakfast', 'brunch', 'coffee', 'drinks', 'dessert',
])

// The {moment} DESCRIPTOR for the S1 confirm surface's question ("These {n}
// photos look like {moment} — at {place}. Right?"). The moment's dominant vision
// NAME (visionLabel.js already asks Claude for a 2-5-word album name — "At the
// beach", "Walking around town", "July 4th parade") warmed into a noun-phrase
// slot: (1) a leading "At the "/"At " → "the beach" (not "look like at the
// beach"); (2) a COMMON activity lead is lowercased for a warm mid-sentence read
// ("Walking" → "walking"), while a proper noun ("July 4th parade") keeps its
// caps for Jonathan/Helen. The lens render applies Aurelia's whole-string
// lowercase. Empty in → '' (card falls back). Pure → unit-testable + mirror-parity.
// (Deeper warmth — activity-forward phrasing, the rare embedded-place clash — is
// tuned against the real label distribution in the shadow review.)
export function momentDescriptorForm(visionName) {
  if (typeof visionName !== 'string') return ''
  let s = visionName.trim().replace(/^at\s+the\s+/i, 'the ').replace(/^at\s+/i, '')
  const lead = s.split(/\s+/)[0] || ''
  if (WARM_LEAD.has(lead.toLowerCase())) s = lead.toLowerCase() + s.slice(lead.length)
  return s.trim()
}

// trip + its memories → [{ isoDate, decisions: [...] }]. `defaultOffset` (min)
// is used only when a ref carries no offsetMinutes (legacy) — 0 = prior UTC behavior.
export function buildTripDecisions(trip, memories, opts = {}) {
  const dayIndex = buildDayIndex(trip)
  const defaultOffset = Number.isFinite(opts.defaultOffset) ? opts.defaultOffset : 0

  // 1. extract time-bearing points, grouped by LOCAL day
  const pointsByDay = new Map()
  const meta = new Map() // pointId -> { capturedAt, offsetMinutes }  (for the GPS synthetic)
  for (const m of memories || []) {
    const memCreatedAtMs = createdAtMsOf(m)
    // W9 item 2 (D16): the memory's CURRENT stop filing, only when a HUMAN put
    // it there — a memory-level fact, attached to every ref/point it owns
    // below (same "memory-level, point-repeated" shape as `author`).
    const manualEv = manualStopEvidence(m)
    for (const ref of refsOf(m)) {
      if (!ref) continue
      let capturedAtIso = ref.capturedAt
      // W8 item 1(a), D14: a ref with NO capturedAt at all used to be silently
      // dropped here — invisible to healing. memory.created_at (the upload/save
      // time) is an UPPER BOUND on when the photo was actually taken: never a
      // real capture time, so a point built from it is tagged
      // `createdAtUpperBound` (folded into `timeAnchorSuspect` below, which
      // keeps every such moment at leave/confirm-grade, never auto), and ONLY
      // used when it falls inside the trip's own day window — outside that
      // window there is nothing trustworthy to place it by, so this abstains
      // exactly as the old skip did.
      let createdAtUpperBound = false
      if (!capturedAtIso) {
        if (!Number.isFinite(memCreatedAtMs)) continue
        capturedAtIso = new Date(memCreatedAtMs).toISOString()
        createdAtUpperBound = true
      }
      const off = Number.isFinite(ref.offsetMinutes) ? ref.offsetMinutes : defaultOffset
      const localMs = Date.parse(capturedAtIso) + off * 60000
      if (!Number.isFinite(localMs)) continue
      const iso = new Date(localMs).toISOString().slice(0, 10)
      if (createdAtUpperBound && !dayIndex.has(iso)) continue
      const id = ref.key || ref.id
      if (!id) continue
      // W8 item 3, D1 hygiene: a PASSENGER ref (screenshot/graphic, not a
      // camera photo) has its lat/lng and faces WITHHELD from the point — it
      // can't anchor GPS inheritance or vote faces — while it still rides the
      // moment (via photoIds/memoryIds, untouched below) and inherits the
      // moment's eventual filing like any other member. Forward-only (see
      // timeWitness.js's header).
      const passenger = isPassengerRef(ref)
      const lat = passenger ? undefined : numOrU(ref.lat)
      const lng = passenger ? undefined : numOrU(ref.lng)
      if (!pointsByDay.has(iso)) pointsByDay.set(iso, [])
      pointsByDay.get(iso).push({
        id,
        memoryId: m.id,
        at: localMs,
        lat,
        lng,
        author: m.author || m.authorTraveler || m.author_traveler,
        // the COMPOSITION dimension (sceneHash.js) — a sidecar like lat/lng, absent
        // until the import/backfill computes it from the surviving pixels.
        scene: typeof ref.scene === 'string' && ref.scene ? ref.scene : undefined,
        // the PEOPLE dimension — face ids on the ref (wired from the face model in a
        // later brick); absent → the dimension simply abstains from the clustering.
        faces: passenger ? undefined : (Array.isArray(ref.faces) && ref.faces.length ? ref.faces : undefined),
        // the PLACE-TYPE dimension (BUILD 3, §16) — a constrained vision enum, absent
        // until the vision backfill computes it. Consumed ONLY by the bridge-only path
        // in sessions.js (never nonTimeAffinity's blend); a missing/catch-all value
        // simply abstains, same as every other dimension here.
        placeType: typeof ref.vision?.placeType === 'string' && ref.vision.placeType
          ? ref.vision.placeType
          : undefined,
      })
      meta.set(id, {
        capturedAt: capturedAtIso,
        offsetMinutes: off,
        vision: ref.vision,
        at: localMs,
        lat,
        lng,
        // W8 signals — reference-tier GPS provenance (item 4), atSrc + import-lag
        // tiering (items 1b/2), and the time-anchor-suspect member markers
        // (item 1(a)'s synthetic point, item 2's suggestion-grade atSrc, item
        // 1(b)'s long-lag demotion) that fold into `timeAnchorSuspect` above.
        provGps: typeof ref.prov?.gps === 'string' ? ref.prov.gps : undefined,
        atSrc: typeof ref.atSrc === 'string' ? ref.atSrc : undefined,
        createdAtUpperBound,
        lagClass: createdAtUpperBound
          ? undefined
          : importLagClass({
              capturedAtMs: Date.parse(capturedAtIso),
              createdAtMs: memCreatedAtMs,
              atSrc: ref.atSrc,
            }),
        passenger,
        // W9 item 2 (D16) — carried per-point so the moment-aggregation step
        // below can look it up the same way as every other per-ref signal.
        manualStopId: manualEv?.stopId,
        manualStopBy: manualEv?.by,
      })
    }
  }

  const out = []
  for (const [iso, pts] of pointsByDay) {
    const entry = dayIndex.get(iso)
    const moments = buildMoments(pts, opts)

    // 2. the day's AGENDA places (v1's allStops: planned + base + record). Built
    //    BEFORE resolving sessions so a located burst can prefer a real NAMED stop,
    //    and so we can tell a base match (the ~1km all-day catch-all) from a
    //    specific one.
    const places = (entry?.allStops || []).map((st) => ({
      id: st.id,
      name: st.name || st.title || '',
      lat: numOrU(st.lat),
      lng: numOrU(st.lng),
      timeMin: placeTimeMin(st.time, iso),
      kind: placeKind(st),
    }))
    const kindById = new Map(places.map((p) => [p.id, p.kind]))

    // 3. resolve GPS for located sessions. A burst prefers a real NAMED agenda stop
    //    (v1's confident, parity-tested match). When none matches — only the all-day
    //    base, or nothing at all (the hangout case: the family entered no plan) —
    //    the burst files to a DISCOVERED place at its OWN coordinates, so the photo
    //    lands where it ACTUALLY was instead of dissolving into the base's ~1km
    //    catch-all. This is the agenda-free spine: the trip documents itself from
    //    where the photos were, with no stop ever entered. A discovered spot is
    //    unnamed (coords only) pending naming (geocode/vision — a later phase).
    let discSeq = 0
    const scored = moments.map((s) => {
      let gpsPlaceId = null
      if (s.located) {
        const medId = s.photoIds[Math.floor((s.count - 1) / 2)]
        const mm = meta.get(medId) || {}
        const synthetic = {
          lat: s.location.lat,
          lng: s.location.lng,
          capturedAt: mm.capturedAt,
          offsetMinutes: mm.offsetMinutes,
        }
        const match = matchPhotoToStop(synthetic, dayIndex)
        const agendaId = match && match.matchType === 'gps+time' ? match.stopId : null
        const agendaKind = agendaId ? kindById.get(agendaId) : undefined
        if (agendaId && agendaKind && agendaKind !== 'base') {
          gpsPlaceId = agendaId // a real named place — keep v1's confident match
        } else {
          const { lat, lng } = s.location
          const id = `__discovered__:${iso}:${discSeq++}`
          places.push({
            id,
            name: `a place near ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
            lat,
            lng,
            timeMin: localMin(s.medianMs),
            kind: 'discovered',
          })
          gpsPlaceId = id
        }
      }
      // W8 item 4 (constitution rule 1's enforcement gap): reference-tier GPS
      // provenance among the moment's OWN members — exif/scan reads only
      // (never a propagated/inferred coordinate; item 3's withheld passenger
      // points never contribute here either, since they carry no lat/lng on
      // the point/meta in the first place).
      let referenceLocatedCount = 0
      const gpsProvSet = new Set()
      for (const pid of s.photoIds) {
        const mm = meta.get(pid)
        if (!mm || !Number.isFinite(mm.lat) || !Number.isFinite(mm.lng) || !mm.provGps) continue
        gpsProvSet.add(mm.provGps)
        if (REFERENCE_GPS_PROV.has(mm.provGps)) referenceLocatedCount++
      }
      const { medianAt, timeAnchorSuspect } = anchoringMedian(s.photoIds, meta)
      // W9 item 2 (D16): a moment "gains reference-tier place evidence for
      // that stop" — recorded here as a SIGNAL for W7's future evidence audit
      // (never a tier/canAuto change in this build; the constitution's rule
      // 1(A) doesn't name D16 in its closed reference-tier enumeration, so
      // whether/how it raises the AUTO bar is W7/S1's call, not silently made
      // here). Only when every hand-filed member among this moment's photos
      // agrees on ONE stop — a conflicting pair (two different memories,
      // different manual filings, sharing a moment) abstains, per the
      // project's standing "ambiguity refuses" rule.
      const manualStopIds = new Set()
      let handFiledBy = null
      for (const pid of s.photoIds) {
        const mm = meta.get(pid)
        if (!mm?.manualStopId) continue
        manualStopIds.add(mm.manualStopId)
        if (mm.manualStopBy) handFiledBy = mm.manualStopBy
      }
      const handFiledStop = manualStopIds.size === 1 ? [...manualStopIds][0] : null
      return {
        ...s,
        medianMin: medianAt != null ? localMin(medianAt) : localMin(s.medianMs),
        gpsPlaceId,
        referenceLocatedCount,
        gpsProv: [...gpsProvSet],
        timeAnchorSuspect,
        handFiledStop,
        handFiledBy,
      }
    })

    const decisions = scoreDay(scored, places, opts)
    // Fold the moment's multi-dimensional provenance — WHICH signals were present and
    // how strongly they cohere — into each decision's signals, so the ledger records
    // why a group formed (which dimensions agreed), not just where it filed.
    const byFirst = new Map(scored.map((m) => [m.photoIds[0], m]))
    let visSeq = 0
    for (const d of decisions) {
      const m = byFirst.get(d.photoIds[0])
      if (m) {
        d.signals = {
          ...d.signals,
          dims: m.dims,
          cohesion: m.cohesion == null ? null : Math.round(m.cohesion * 100) / 100,
          // BUILD 3 (§16): surfaced ONLY when true, so every pre-Build-3 ledger row
          // (and every moment the vision bridge never touched) stays byte-identical.
          ...(m.visionBridged ? { visionBridged: true } : {}),
          // W8 — reference-tier GPS provenance + time-anchor trust (W7's future
          // evidence audit reads this; never surface-projected by this build —
          // S1 owns SAFE_SIGNAL_KEYS's per-key leak review).
          referenceLocatedCount: m.referenceLocatedCount ?? 0,
          ...(m.gpsProv && m.gpsProv.length ? { gpsProv: m.gpsProv } : {}),
          ...(m.timeAnchorSuspect ? { timeAnchorSuspect: true } : {}),
          // W9 item 2 (D16) — a hand-filed stop found on a member memory of
          // this moment (signals-only; see the note where this is computed).
          ...(m.handFiledStop ? { handFiledStop: m.handFiledStop, handFiledBy: m.handFiledBy || null } : {}),
        }
      }
      // S1 — the {moment} DESCRIPTOR: the moment's dominant vision name,
      // normalized to the confirm question's noun-phrase slot ("look like {moment}
      // — at {place}"). Computed for EVERY moment (not just the unplaced ones the
      // leave→name path below promotes), since a GPS/time PLACE confirm still wants
      // a human label. Name-bearing (a vision name can echo a hidden place), so it
      // is projected ONLY through healDecisionsView's nameHidden gate, like
      // visionName — never a plain whitelisted scalar.
      const vn = momentVisionName(d.photoIds, meta)
      const descriptor = momentDescriptorForm(vn)
      if (descriptor) d.signals = { ...d.signals, momentDescriptor: descriptor }
      // A moment with no located/agenda place would LEAVE — but if vision can NAME it,
      // surface it as a named moment to CONFIRM (content-inferred, never a silent auto).
      // This is what turns the no-GPS beach afternoons into "At the beach".
      if (d.tier === 'leave') {
        if (vn) {
          d.place = { id: `__vision__:${iso}:${visSeq++}`, name: vn }
          d.tier = 'confirm'
          d.naming = 'named'
          d.confidence = 0.5
          d.signals = { ...d.signals, evidence: 'vision', visionName: vn }
          d.reason = `looks like ${vn} — confirm it`
        }
      }
    }
    out.push({ isoDate: iso, decisions })
  }
  out.sort((a, b) => a.isoDate.localeCompare(b.isoDate))
  return out
}
