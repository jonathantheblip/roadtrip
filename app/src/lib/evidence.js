// The Record — the evidence engine (R4, 2026-07-02).
//
// The third tense (day.record, "what actually happened") is nearly free on a
// hangout day IF the phone's own photos can draft it. This module is that draft:
// it clusters a day's located photos by GPS + time into PINS — honest machine
// guesses at "you were near the water 11–1" — that the settle card offers back
// and the settle sheet lets a person NAME. Nothing here asserts; a pin is a
// draft until a human keeps it (honesty rule #1: a machine guess never wears a
// human name).
//
// Pure functions only — no I/O, no React (mirrors dayRecord.js). Runs on-device.
//
// REUSE: distance is photoMatch.haversineMeters (the one great-circle formula in
// the app). The per-photo read mirrors refilePlaces.locatedPhotos (photoRefs[] /
// legacy photoRef / pieces[], with the memory-level capturedAt fallback that
// survives the LEG-C sync round-trip) — kept as a sibling reader here so the
// engine stays self-contained and unit-testable without touching the live refiler.
//
// WHO is SUGGESTED, never asserted (honesty rule #2). Presence data is current-
// only (polled, ephemeral — no historical "who was where at 11am" log exists), so
// a pin's who-suggestion is the set of AUTHORS of that pin's photos — real,
// checkable provenance — which a person confirms in the settle sheet.

import { haversineMeters } from './photoMatch.js'
import { localDateIso } from './localDate.js'

// Tuning gates (design 05: "suggest ~200m / ~90min, tune on device"). Exported so
// tests pin the defaults and a caller can tune per-device without editing here.
export const EVIDENCE_DEFAULTS = { radiusMeters: 200, gapMinutes: 90 }

// A day's photos that carry BOTH coordinates and a capture time — the only ones
// that can form a pin. Mirrors refilePlaces.locatedPhotos and adds author (for the
// who-suggestion) and label (the reverse-geocoded guess). `at` is epoch-ms.
//
// A photo belongs to `isoDate` when its capture instant falls on that LEG-LOCAL
// calendar date — attributed through the SAME localDateIso the settle card derives
// `todayIso` from (deriveCurrentLeg → localDateIso(now, legTz)), so evidence and
// "today" agree exactly. This deliberately does NOT use the UTC-calendar window
// photoMatch binds by: an 11pm-local photo (prime settle-card time) is TONIGHT'S
// evidence, not tomorrow's — the whole reason localDate.js exists (it drifts hours
// around midnight for Americas users). No `tz` → device-local (localDateIso's
// default), matching the card's own device-local "today's photos" count.
export function photosForDay(memories, isoDate, { tz } = {}) {
  if (!Array.isArray(memories) || !isoDate) return []
  const out = []
  for (const m of memories) {
    if (!m) continue
    const refs = []
    if (Array.isArray(m.photoRefs) && m.photoRefs.length) refs.push(...m.photoRefs)
    else if (m.photoRef) refs.push(m.photoRef)
    if (Array.isArray(m.pieces)) refs.push(...m.pieces)
    refs.forEach((r, i) => {
      const lat = Number(r?.lat)
      const lng = Number(r?.lng)
      // Per-photo EXIF date wins; the memory-level capturedAt is the fallback that
      // survives the LEG-C sync round-trip. (Limitation: a multi-photo memory with
      // no per-photo EXIF collapses to ONE instant — the pin's span is then a point,
      // not a real range. Honest to the data available; the UI degrades gracefully.)
      const capturedAt = (typeof r?.capturedAt === 'string' && r.capturedAt) || m.capturedAt
      if (!(Number.isFinite(lat) && Number.isFinite(lng)) || !capturedAt) return
      const at = Date.parse(capturedAt)
      if (!Number.isFinite(at) || localDateIso(new Date(at), tz) !== isoDate) return
      out.push({
        id: `${m.id}:${i}`,
        memoryId: m.id,
        lat,
        lng,
        at,
        atIso: new Date(at).toISOString(),
        author: m.authorTraveler || null,
        label: (typeof r?.locationLabel === 'string' && r.locationLabel.trim()) || null,
      })
    })
  }
  // Time order is the day's natural order; the id tie-break makes the order (and
  // thus who/guess below) DETERMINISTIC across devices when two phones snap the
  // same second — sync-arrival order must never change what a pin reads.
  return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
}

// A tiny deterministic string hash (djb2) → stable pin ids without crypto. Two
// devices deriving the SAME photo membership derive the SAME pin id, so an unnamed
// draft dedups across phones. (Once a person NAMES a pin it persists as a record
// entry via recordEntryId — decoupled from live recomputation — so accreting a new
// photo to a place never un-names a kept entry.)
function hashIds(ids) {
  let h = 5381
  const s = ids.join('|')
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// Cluster located photos into pins by SINGLE-LINKAGE over BOTH gates: two photos
// join the same pin when they are within radiusMeters AND within gapMinutes of each
// other. Single-linkage on the time GAP is deliberate — a continuous presence at a
// place ("the beach till one") stays ONE pin even across hours, because each photo
// bridges to the next; while a hop to somewhere >radius away splits, even at the
// same minute. O(n²) union-find — a day's photos are tens, not thousands.
export function clusterPhotos(located, opts = {}) {
  const radiusMeters = opts.radiusMeters ?? EVIDENCE_DEFAULTS.radiusMeters
  const gapMs = (opts.gapMinutes ?? EVIDENCE_DEFAULTS.gapMinutes) * 60_000
  const pts = Array.isArray(located) ? located : []
  const n = pts.length
  if (!n) return []

  // Union-find.
  const parent = pts.map((_, i) => i)
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(pts[i].at - pts[j].at) > gapMs) continue
      if (haversineMeters(pts[i].lat, pts[i].lng, pts[j].lat, pts[j].lng) > radiusMeters) continue
      union(i, j)
    }
  }

  // Bucket members by component root.
  const buckets = new Map()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    if (!buckets.has(root)) buckets.set(root, [])
    buckets.get(root).push(pts[i])
  }

  const pins = []
  for (const members of buckets.values()) {
    // Deterministic order (id tie-break on equal timestamps) so who, guess, and
    // span read identically on every device — see photosForDay.
    members.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    const count = members.length
    const centroid = {
      lat: members.reduce((s, p) => s + p.lat, 0) / count,
      lng: members.reduce((s, p) => s + p.lng, 0) / count,
    }
    const startMs = members[0].at
    const endMs = members[count - 1].at
    // WHO: distinct authors of this pin's photos — a suggestion with real
    // provenance, confirmed by a person in the settle sheet. Order = first seen.
    const who = []
    for (const p of members) if (p.author && !who.includes(p.author)) who.push(p.author)
    // GUESS: the machine's reverse-geocode — the most common non-empty label among
    // the pin's photos. Null → the UI shows a generic "a spot" (never a fake name).
    const guess = commonestLabel(members)
    const memberIds = members.map((p) => p.id)
    pins.push({
      id: `pin-${(members[0].atIso || '').slice(0, 10) || 'x'}-${hashIds([...memberIds].sort())}`,
      count,
      centroid,
      span: { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), startMs, endMs },
      who,
      guess,
      photoIds: memberIds,
      memoryIds: Array.from(new Set(members.map((p) => p.memoryId))),
    })
  }
  // Pins in the order the day happened (id tie-break keeps ties deterministic).
  return pins.sort((a, b) => a.span.startMs - b.span.startMs || a.id.localeCompare(b.id))
}

function commonestLabel(members) {
  const tally = new Map()
  for (const p of members) {
    if (!p.label) continue
    tally.set(p.label, (tally.get(p.label) || 0) + 1)
  }
  let best = null, bestN = 0
  for (const [label, nCount] of tally) if (nCount > bestN) { best = label; bestN = nCount }
  return best
}

// The whole evidence read for a day: the pins + how many photos were located.
// The settle card decides its state from this plus its own total photo count.
export function buildDayEvidence(memories, isoDate, opts = {}) {
  const located = photosForDay(memories, isoDate, opts)
  const pins = clusterPhotos(located, opts)
  return { isoDate, pins, locatedCount: located.length }
}

// The settle card's evidence gate (design 02): RICH when there are ≥2 pins OR the
// day carries ≥6 photos at all (a substantive day, even if the photos didn't cluster
// into places). Everything else is THIN — the card flips to the nothing-day tap.
// photoCount is the day's TOTAL photos (located or not) — the caller knows it
// (LivingHeartHome's todayCount); locatedCount alone would undercount a day of
// GPS-less shots. No photos and no pins → still 'thin' (an honest quiet day).
export function evidenceLevel({ pinCount = 0, photoCount = 0 } = {}) {
  return pinCount >= 2 || photoCount >= 6 ? 'rich' : 'thin'
}
