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

// ── Phase 2: the auto-balancing scrapbook WALL (collage) layout ──────────────
// Pure layout math, ported from the design's share-collage.jsx `buildWall` /
// `WallHero`. It takes the REAL pieces of a multi-photo share (the view-model's
// allowlisted photos + an attached voice) and decorates each with the masonry
// recipe — it does NOT synthesize fake media (the prototype's count→mix is a
// specimen tool; production has real pieces). sharePage.js renders the result.
//
// Recipe (authoritative = the runnable prototype): photo heights cycle
// [150,124,168,134,156,120,162,140]; tape on every 5th tile; rotation
// (i%3-1)*1.2°; columns = count>16 ? 3 : 2; the 3-col "compact" mode scales photo
// heights ×0.74 / video ×0.78 and drops tape. A single attached voice note is
// placed at an evenly-spread slot (spreadSlots(1,count,5)) so it doesn't clump.
const WALL_HEIGHTS = [150, 124, 168, 134, 156, 120, 162, 140]

// Evenly-spread indices for `n` specials across `count` slots (design parity).
export function spreadSlots(n, count, offset) {
  const out = new Set()
  if (n <= 0 || count <= 0) return out
  const step = count / n
  for (let k = 0; k < n; k++) out.add(Math.min(count - 1, Math.floor(offset + k * step) % count))
  return out
}

// Is a share-view photo a video? (mime starts with video, or it has a poster.)
function isVideoRef(p) {
  return !!(p && ((p.mime || '').startsWith('video') || p.posterUrl))
}

// Build the decorated wall tiles for a multi-piece share view. Returns
// { cols, compact, summary, tiles:[{kind, url?, posterUrl?, h, tape, rot, dur?}] }.
// `tiles` order = the album's photo order, with one voice tile spread in.
export function buildWallTiles(view) {
  const photos = (view?.photos || []).filter((p) => p && (p.url || p.posterUrl))
  const hasVoice = !!(view?.audio && view.audio.url)
  const count = photos.length + (hasVoice ? 1 : 0)
  const cols = count > 16 ? 3 : 2
  const compact = cols === 3
  const voiceAt = hasVoice ? spreadSlots(1, count, 5) : new Set()

  const tiles = []
  let pi = 0
  for (let i = 0; i < count; i++) {
    if (hasVoice && voiceAt.has(i)) {
      tiles.push({ kind: 'voice', dur: view.audio.durationSeconds, rot: 0, tape: false })
      continue
    }
    const p = photos[pi++]
    if (!p) continue
    const baseH = WALL_HEIGHTS[i % WALL_HEIGHTS.length]
    const video = isVideoRef(p)
    tiles.push({
      kind: video ? 'video' : 'photo',
      url: video ? p.posterUrl || p.url : p.url,
      h: compact ? Math.round(baseH * (video ? 0.78 : 0.74)) : baseH,
      tape: !compact && i % 5 === 0,
      rot: (i % 3 - 1) * 1.2,
    })
  }

  const nPhoto = tiles.filter((t) => t.kind === 'photo').length
  const nVideo = tiles.filter((t) => t.kind === 'video').length
  const nVoice = tiles.filter((t) => t.kind === 'voice').length
  const summary = [
    nPhoto && `${nPhoto} photo${nPhoto === 1 ? '' : 's'}`,
    nVideo && `${nVideo} clip${nVideo === 1 ? '' : 's'}`,
    nVoice && `${nVoice} voice`,
  ].filter(Boolean).join(' · ')

  return { cols, compact, summary, tiles }
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
