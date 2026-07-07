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
// "what happened"; the gates decide what may be shown/applied. Pure, deterministic,
// self-contained (own haversine) → the worker referee mirrors it, parity-tested.

export const SCORE_DEFAULTS = {
  gpsRadiusMeters: 250, // a located session within this of a place → GPS match
  autoNearMin: 45, // time within this of an evidenced place → auto-eligible
  confirmNearMin: 90, // within this → confirm; beyond → leave (base)
  clearMarginMin: 60, // runner-up must be at least this much farther for auto
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

const isNum = (x) => Number.isFinite(x)
// A place is INTRINSICALLY evidenced (auto-eligible) if it's the base or a named
// record moment — a person affirmed it. Planned stops earn evidence only via GPS.
const intrinsicEvidence = (place) =>
  place.kind === 'base' ? 'base' : place.kind === 'record' ? 'record' : null

// sessions: [{ id, photoIds, memoryIds, count, location:{lat,lng}|null, medianMin }]
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
  const located = P.filter((p) => isNum(p.lat) && isNum(p.lng))

  // deterministic session order (median, then first id)
  const order = [...S].sort(
    (a, b) => a.medianMin - b.medianMin || String(a.photoIds?.[0]).localeCompare(String(b.photoIds?.[0]))
  )

  const decisions = new Map() // session -> decision
  const gpsMatch = new Map() // session -> place

  // ---- Pass 1: GPS (own or inherited) → nearest place within radius ----------
  for (const s of order) {
    if (!s.location) continue
    let best = null
    let bestM = Infinity
    for (const p of located) {
      const m = haversineMeters(s.location.lat, s.location.lng, p.lat, p.lng)
      if (m < bestM) {
        bestM = m
        best = p
      }
    }
    if (best && bestM <= o.gpsRadiusMeters) {
      gpsMatch.set(s, best)
      best.gpsEvidenced = true
      // agenda-time inference: a vague place learns its time from the session on it
      if (!isNum(best.effTimeMin)) {
        best.effTimeMin = s.medianMin
        best.inferred = true
      }
    }
  }

  // Emit GPS decisions (confident). A specific place → auto; the base → "at base".
  for (const s of order) {
    const p = gpsMatch.get(s)
    if (!p) continue
    const meters = Math.round(
      haversineMeters(s.location.lat, s.location.lng, p.lat, p.lng)
    )
    decisions.set(s, {
      photoIds: s.photoIds,
      memoryIds: s.memoryIds,
      count: s.count,
      place: { id: p.id, name: p.name },
      tier: 'auto',
      confidence: 0.9,
      signals: {
        evidence: 'gps',
        gpsMeters: meters,
        inheritedGps: (s.locatedCount ?? 0) < s.count,
        placeKind: p.kind,
      },
      reason:
        p.kind === 'base'
          ? 'located at the base'
          : `located at ${p.name}${(s.locatedCount ?? 0) < s.count ? ' (GPS inherited across the burst)' : ''}`,
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
        signals: { evidence: 'none', nearestMin: best ? best.d : null },
        reason: 'no evidenced moment fits this time',
      })
      continue
    }
    const ev = best.p.gpsEvidenced ? 'gps' : intrinsicEvidence(best.p) // 'gps'|'record'|'base'|null
    const clear = !runnerUp || runnerUp.d - best.d >= o.clearMarginMin
    // AUTO only when the place has positive evidence (gps/record/base) AND the
    // time fit is close AND unambiguous. A time-only planned stop → CONFIRM.
    const canAuto = !!ev && best.d <= o.autoNearMin && clear && !best.p.inferred
    decisions.set(s, {
      photoIds: s.photoIds,
      memoryIds: s.memoryIds,
      count: s.count,
      place: { id: best.p.id, name: best.p.name },
      tier: canAuto ? 'auto' : 'confirm',
      confidence: canAuto ? 0.75 : ev ? 0.55 : 0.4,
      signals: {
        evidence: ev || 'time-only',
        timeFitMin: best.d,
        runnerUpMin: runnerUp ? runnerUp.d : null,
        inferredTime: best.p.inferred,
        placeKind: best.p.kind,
      },
      reason: ev
        ? `${best.d}m from ${best.p.name}${clear ? ', clear' : ', close call'}`
        : `time fits ${best.p.name} — confirm it was here`,
    })
  }

  // stable output order: by session median then first id
  return order.map((s) => decisions.get(s)).filter(Boolean)
}
