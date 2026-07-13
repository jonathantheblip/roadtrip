// sessionScorer.js — the v2 decision heart. Matches SESSIONS (sessions.js) to a
// day's PLACES and emits ONE explainable, tiered decision per session.
//
// Two passes, deterministic:
//   1. GPS pass — a LOCATED session (its own GPS, or inherited across the burst)
//      snaps to the nearest place within radius. This is the confident, no-confirm
//      path, and it INFERS a real time for a vague place from the session that
//      landed on it (the "Afternoon" fix — photos teach the agenda its times).
//   2. TIME pass — a session with no GPS match falls to the nearest place by time
//      on the (now inference-completed) spine.
//
// The corrected Pillar 1 lives here: a place auto-files ONLY with positive
// evidence it was visited — GPS on it, a named record moment, or the base. A
// PLANNED stop that only *time-fits* (no GPS/record) is a CONFIRM, never a silent
// auto (that's the museum-you-skipped guard, and it's the one-tap "not manual").
// Conservative by construction (Jonathan decision #1): when unsure, confirm.
//
// This scorer does NOT enforce manual-lock / masking / surprise / kid-lens — those
// are the existing safety gates that WRAP a decision (a manual-locked memory is
// never a candidate; a masked target is dropped). The scorer only reconstructs
// "what happened"; the gates decide what may be shown/applied.
//
// GPS resolution is NOT done here: the adapter runs a located session's centroid
// through v1's tuned `matchPhotoToStop` (radius/margin/base-yield, already
// parity-tested — never reinvented) and hands the scorer the resolved
// `gpsPlaceId`. So this module carries no haversine and needs no geo-tuning; it's
// pure decision-logic → the worker referee mirrors it exactly.

export const SCORE_DEFAULTS = {
  autoNearMin: 45, // time within this of an evidenced place → auto-eligible
  confirmNearMin: 90, // within this → confirm; beyond → leave (base)
  clearMarginMin: 60, // runner-up must be at least this much farther for auto
}

const isNum = (x) => Number.isFinite(x)
// A place is INTRINSICALLY evidenced (auto-eligible) if it's the base, a named
// record moment (a person affirmed it), or a DISCOVERED spot — a place GPS proved
// the family visited, with no stop ever entered (the agenda-free spine). Planned
// stops earn evidence only via GPS.
const intrinsicEvidence = (place) =>
  place.kind === 'base'
    ? 'base'
    : place.kind === 'record'
      ? 'record'
      : place.kind === 'discovered'
        ? 'discovered'
        : null

// The NAMING state of a decision's target, for the "give this moment a name" surface:
// a DISCOVERED spot has only coordinates → 'needs-name' (a human — probably Jonathan —
// names it, and that name then behaves like a record moment for future filings); any
// real place → 'named'; an unfiled leave → null. Overlapping dimensions decide WHERE
// a moment happened; naming is the one thing the family still supplies when the
// machine has a coherent group but no words for it.
const namingOf = (place) => (!place ? null : place.kind === 'discovered' ? 'needs-name' : 'named')

// sessions: [{ photoIds, memoryIds, count, medianMin, gpsPlaceId?:string|null,
//             locatedCount? }]  — gpsPlaceId is v1's resolved GPS match (adapter),
//             null when the burst had no GPS or v1 found no confident stop.
// places:   [{ id, name, lat|null, lng|null, timeMin|null, kind:'stop'|'base'|'record' }]
// → decisions: [{ photoIds, memoryIds, count, place:{id,name}|null, tier, confidence, signals, reason }]
export function scoreDay(sessions, places, opts = {}) {
  const o = { ...SCORE_DEFAULTS, ...opts }
  const S = (Array.isArray(sessions) ? sessions : []).filter((s) => s && isNum(s.medianMin))
  const P = (Array.isArray(places) ? places : []).map((p) => ({
    ...p,
    effTimeMin: isNum(p.timeMin) ? p.timeMin : null,
    inferred: false,
    gpsEvidenced: false,
  }))
  const placeById = new Map(P.map((p) => [p.id, p]))

  // deterministic session order (median, then first id)
  const order = [...S].sort(
    (a, b) => a.medianMin - b.medianMin || String(a.photoIds?.[0]).localeCompare(String(b.photoIds?.[0]))
  )

  const decisions = new Map() // session -> decision
  const gpsMatch = new Map() // session -> place

  // ---- Pass 1: pre-resolved GPS (v1's matcher, via the adapter) --------------
  for (const s of order) {
    const p = s.gpsPlaceId ? placeById.get(s.gpsPlaceId) : null
    if (!p) continue
    gpsMatch.set(s, p)
    // W8 item 4 (constitution rule 1's enforcement gap): only a REFERENCE-tier
    // anchor (real exif/scan GPS on at least one member of THIS session — never
    // a propagated/inferred coordinate) may mark the PLACE itself evidenced. An
    // inferred-only anchor must not silently evidence the place for a LATER
    // (pass 2, time-only) session either — that was the leak: `gpsEvidenced`
    // used to flip true here unconditionally, for any gpsPlaceId match at all.
    if ((s.referenceLocatedCount ?? 0) > 0) p.gpsEvidenced = true
    // agenda-time inference: a vague STOP learns its time from the session on it
    // (the "Afternoon" fix). NEVER the base — it's all-day, not a moment, so
    // inferring a base time would make other sessions spuriously "time-fit" it.
    if (p.kind === 'stop' && !isNum(p.effTimeMin)) {
      p.effTimeMin = s.medianMin
      p.inferred = true
    }
  }

  // Emit GPS decisions. A specific place with a reference-tier anchor → auto;
  // the base → "at base" (base is itself intrinsic evidence, W8 doesn't touch
  // that). A located moment with ZERO reference-tier coordinates on it still
  // resolves to the place (the centroid IS where the burst was) but never
  // silently auto-files — one-tap confirm instead (W8 item 4).
  for (const s of order) {
    const p = gpsMatch.get(s)
    if (!p) continue
    const inherited = (s.locatedCount ?? 0) < s.count
    const naming = namingOf(p)
    const referenceAnchored = (s.referenceLocatedCount ?? 0) > 0
    decisions.set(s, {
      photoIds: s.photoIds,
      memoryIds: s.memoryIds,
      count: s.count,
      place: { id: p.id, name: p.name },
      tier: referenceAnchored ? 'auto' : 'confirm',
      confidence: referenceAnchored ? 0.9 : 0.6,
      naming,
      signals: {
        evidence: 'gps',
        inheritedGps: inherited,
        placeKind: p.kind,
        naming,
        referenceLocatedCount: s.referenceLocatedCount ?? 0,
      },
      reason: referenceAnchored
        ? p.kind === 'base'
          ? 'located at the base'
          : `located at ${p.name}${inherited ? ' (GPS inherited across the burst)' : ''}`
        : `located at ${p.name} — no reference-tier GPS on this burst yet, confirm it`,
    })
  }

  // ---- Pass 2: TIME → nearest place on the spine (planned + inferred times) ---
  const spine = P.filter((p) => isNum(p.effTimeMin)).sort((a, b) => a.effTimeMin - b.effTimeMin)
  for (const s of order) {
    if (decisions.has(s)) continue // already GPS-decided
    const ranked = spine
      .map((p) => ({ p, d: Math.abs(s.medianMin - p.effTimeMin) }))
      .sort((a, b) => a.d - b.d)
    const best = ranked[0]
    const runnerUp = ranked[1]
    if (!best || best.d > o.confirmNearMin) {
      decisions.set(s, {
        photoIds: s.photoIds,
        memoryIds: s.memoryIds,
        count: s.count,
        place: null, // leave at base / unfiled
        tier: 'leave',
        confidence: 0.2,
        naming: null,
        signals: { evidence: 'none', nearestMin: best ? best.d : null, naming: null },
        reason: 'no evidenced moment fits this time',
      })
      continue
    }
    const ev = best.p.gpsEvidenced ? 'gps' : intrinsicEvidence(best.p) // 'gps'|'record'|'base'|'discovered'|null
    const clear = !runnerUp || runnerUp.d - best.d >= o.clearMarginMin
    // AUTO only when the place has positive evidence (gps/record/base) AND the
    // time fit is close AND unambiguous. A time-only planned stop → CONFIRM. A
    // DISCOVERED spot is GPS-proven, but a burst reaching it by TIME ONLY (its own
    // GPS absent) still gets a one-tap — evidence-over-plan holds for the agenda-
    // free spine too, so only the GPS-anchoring burst auto-files a discovered spot.
    // W8 item 2 (D1 qualifier): a moment whose time anchor is itself suspect
    // (every member suggestion-grade/file-mtime, a synthetic created-at-upper-
    // bound point, or a long import lag) never silently auto-files on a TIME
    // match — the clock it would be matched against isn't trustworthy enough.
    const canAuto =
      !!ev && best.d <= o.autoNearMin && clear && !best.p.inferred && best.p.kind !== 'discovered' &&
      !s.timeAnchorSuspect
    const naming = namingOf(best.p)
    decisions.set(s, {
      photoIds: s.photoIds,
      memoryIds: s.memoryIds,
      count: s.count,
      place: { id: best.p.id, name: best.p.name },
      tier: canAuto ? 'auto' : 'confirm',
      confidence: canAuto ? 0.75 : ev ? 0.55 : 0.4,
      naming,
      signals: {
        evidence: ev || 'time-only',
        timeFitMin: best.d,
        runnerUpMin: runnerUp ? runnerUp.d : null,
        inferredTime: best.p.inferred,
        placeKind: best.p.kind,
        naming,
        ...(s.timeAnchorSuspect ? { timeAnchorSuspect: true } : {}),
      },
      reason: ev
        ? `${best.d}m from ${best.p.name}${clear ? ', clear' : ', close call'}`
        : `time fits ${best.p.name} — confirm it was here`,
    })
  }

  // stable output order: by session median then first id
  return order.map((s) => decisions.get(s)).filter(Boolean)
}
