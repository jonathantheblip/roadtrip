// "Who's around" (slice 8) — the PURE presence rules, split out so they unit-test
// under `node --test` (no React / no workerSync in the import graph). lib/presence.js
// (the hook + worker calls) and views/WhoAround.jsx both build on these.
//
// ★ PRIVACY (settled): adults (jonathan/helen) share PRECISE lat/lng; kids share
//   ONLY the coarse "at the cabin / out" bucket. buildPresenceBody is the client
//   half of that gate — it never puts a non-adult's coordinates on the wire.

import { atPlace } from './tripShape.js'

// The adults — the only travelers whose precise location is ever stored/sent.
// Mirrors the worker's ADULTS (auth.js); the server is the real gate, this keeps
// a kid's coordinates from leaving the device at all.
export const ADULTS = ['jonathan', 'helen']
export function isAdultTraveler(t) {
  return ADULTS.includes(t)
}

// A position refreshed within this window reads as "now" (a live dot); older reads
// as idle ("last seen…"). Foreground-only sharing re-posts a live row on a heartbeat,
// so a stale row genuinely means "not here / app closed".
export const LIVE_MS = 5 * 60 * 1000 // 5 min

// Coarse "where are you" from the stay place + a device fix. Computed on-device so
// a kid's exact coordinates never need to leave the phone. 'unknown' until there's
// both a place and a fix.
export function coarseBucket(place, position) {
  if (!place || !position) return 'unknown'
  return atPlace(place, position) ? 'at_place' : 'out'
}

// "just now" / "12m ago" / "3h ago" — the idle second line + the live/idle dot.
export function freshness(updatedAt, nowMs) {
  const age = Math.max(0, nowMs - (updatedAt || 0))
  return { live: age <= LIVE_MS, ago: agoLabel(age) }
}
function agoLabel(ms) {
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

// Build the POST body. ★ The client half of the privacy gate: an adult's precise
// fix is attached; for EVERYONE ELSE lat/lng/accuracy are omitted entirely — a
// kid's coordinates are never even put on the wire (the worker drops them too).
export function buildPresenceBody({ tripId, traveler, placeBucket, position, note }) {
  const body = { tripId, placeBucket: placeBucket || 'unknown' }
  if (typeof note === 'string' && note.trim()) body.note = note.trim()
  if (
    isAdultTraveler(traveler) &&
    position &&
    Number.isFinite(position.lat) &&
    Number.isFinite(position.lng)
  ) {
    body.lat = position.lat
    body.lng = position.lng
    if (Number.isFinite(position.accuracy)) body.accuracy = position.accuracy
  }
  return body
}
