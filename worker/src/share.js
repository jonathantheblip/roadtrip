// worker/src/share.js — the SHARE-OUT logic (pure: DB-free, DOM-free).
// ----------------------------------------------------------------------------
// Mirrors the posture of surprises.js: the testable rules live here; index.js
// does the DB plumbing and HTTP. The two load-bearing rules:
//
//   isShareable(memory)  — the security gate, applied at BOTH mint and resolve.
//     A memory is shareable only if it is not deleted AND not a surprise that's
//     hidden from someone (a revealed surprise is fine — it's no longer secret).
//     Re-deriving this from the LIVE row at resolve time is what stops a moment
//     that BECAME a secret after a link was made from leaking publicly.
//
//   shareViewFromMemory(memory, trip) — the allowlist. Builds the ONLY fields
//     the public page ever sees (photos, caption/note, place, date, author name,
//     trip name). Reactions, hideFrom/cover, other memories, and every internal
//     field are simply never read here.

import { isSurprise } from './surprises.js'

// The gate. memory is the rowToMemory shape (so `revealed` / `deletedAt` /
// `hideFrom` are already surfaced). Conservative on purpose: an UNREVEALED
// surprise is never shareable, full stop.
export function isShareable(memory) {
  if (!memory || memory.deletedAt) return false
  if (isSurprise(memory) && !memory.revealed) return false
  return true
}

// A url-safe, friendly token: 64 bits of randomness (the unguessable part) plus
// an optional human slug of the place (purely cosmetic — the random head is the
// security). crypto.getRandomValues is available in the Workers runtime.
export function slugify(s) {
  if (!s || typeof s !== 'string') return ''
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28)
}

export function newShareToken(place) {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const slug = slugify(place)
  return slug ? `${rand}-${slug}` : rand
}

// Resolve a memory's stop to its human place name from the trip's stored shape.
export function findStopName(trip, stopId) {
  if (!trip || !stopId || !Array.isArray(trip.days)) return undefined
  for (const d of trip.days) {
    for (const s of d?.stops || []) {
      if (s && s.id === stopId) return s.name || undefined
    }
  }
  return undefined
}

// Capitalize a traveler id for "from <Name>" (the worker has no display-name
// map; these four ids capitalize cleanly).
export function travelerName(id) {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : undefined
}

// The allowlist projection — the ONLY shape that reaches a public viewer.
// `memory` is the rowToMemory shape (absolute asset URLs already baked in).
export function shareViewFromMemory(memory, trip) {
  if (!memory) return null
  const refs =
    memory.photoRefs && memory.photoRefs.length
      ? memory.photoRefs
      : memory.photoRef
        ? [memory.photoRef]
        : []
  const photos = refs
    .filter((r) => r && r.url)
    .map((r) => ({
      url: r.url,
      ...(r.mime ? { mime: r.mime } : {}),
      ...(r.posterUrl ? { posterUrl: r.posterUrl } : {}),
    }))
  const audio =
    memory.audioRef && memory.audioRef.url
      ? {
          url: memory.audioRef.url,
          ...(memory.audioRef.mime ? { mime: memory.audioRef.mime } : {}),
          ...(memory.durationSeconds != null ? { durationSeconds: memory.durationSeconds } : {}),
        }
      : undefined
  const captured = refs.find((r) => r && r.capturedAt)?.capturedAt
  const id = memory.authorTraveler
  return {
    kind: memory.kind || (photos.length ? 'photo' : audio ? 'audio' : 'text'),
    caption: memory.caption || undefined,
    // A text-only memory carries its body in `text`; that's the note hero.
    note: memory.kind === 'text' ? memory.text || undefined : undefined,
    photos,
    ...(audio ? { audio } : {}),
    place: findStopName(trip, memory.stopId),
    date: captured || memory.createdAt || undefined,
    author: id,
    authorName: travelerName(id),
    tripId: memory.tripId || undefined,
    tripName: trip?.title || undefined,
    tripDateRange: trip?.dateRange || undefined,
  }
}
