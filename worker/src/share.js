// worker/src/share.js — the SHARE-OUT logic (pure: DB-free, DOM-free).
// ----------------------------------------------------------------------------
// Mirrors the posture of surprises.js: the testable rules live here; index.js
// does the DB plumbing and HTTP. The two load-bearing rules:
//
//   isShareable(memory, trip)  — the security gate, applied at BOTH mint and
//     resolve. A memory is shareable only if it is not deleted, not a surprise
//     that's hidden from someone, AND its parent trip/stop is not an unrevealed
//     surprise (a revealed surprise is fine — it's no longer secret). Re-deriving
//     this from the LIVE row + trip at resolve time is what stops a moment that
//     BECAME a secret after a link was made from leaking publicly.
//
//   shareViewFromMemory(memory, trip) — the allowlist. Builds the ONLY fields
//     the public page ever sees (photos, caption/note, place, date, author name,
//     trip name). Reactions, hideFrom/cover, other memories, and every internal
//     field are simply never read here.

import { isSurprise, isTripSurprise, isStopSurprise } from './surprises.js'

// The gate. memory is the rowToMemory shape (so `revealed` / `deletedAt` /
// `hideFrom` are already surfaced). Conservative on purpose: an UNREVEALED
// surprise is never shareable, full stop.
//
// PUBLIC-VIEWER EXTENSION (audit): a public share link has NO identity — the
// viewer is effectively "everyone". So it must also refuse when the parent TRIP
// or the specific STOP this memory belongs to is itself an unrevealed surprise:
// otherwise the page (and the link-card) would leak the secret trip's real
// title/dates or the secret stop's name — the very things whole-trip / per-stop
// masking hide from family members in-app. We pass the loaded `trip` so the gate
// can see both layers; absent a trip we fall back to the memory-only check (every
// existing single-memory share is unaffected). A REVEALED trip/stop surprise is
// fine (no longer secret), mirroring the per-memory rule.
export function isShareable(memory, trip) {
  if (!memory || memory.deletedAt) return false
  if (isSurprise(memory) && !memory.revealed) return false
  if (trip) {
    // Parent trip is a still-hidden surprise → never shareable publicly.
    if (isTripSurprise(trip) && !trip.surprise?.revealed) return false
    // The memory's own stop is a still-hidden surprise → never shareable.
    if (memory.stopId && Array.isArray(trip.days)) {
      for (const d of trip.days) {
        for (const s of d?.stops || []) {
          if (s && s.id === memory.stopId && isStopSurprise(s) && !s.surprise?.revealed) {
            return false
          }
        }
      }
    }
  }
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
  // E4 — an ordered heterogeneous moment (photos + voice + note slips). Honor the
  // author's order (the masonry just flows it; heights auto-balance = the
  // pragmatic auto-arrange). Falls through to the photos+one-voice path below for
  // every pre-E4 share, byte-identical.
  if (view?.pieces && view.pieces.length) return buildPieceTiles(view.pieces)
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
      tiles.push({ kind: 'voice', dur: view.audio.durationSeconds, url: view.audio.url, rot: 0, tape: false })
      continue
    }
    const p = photos[pi++]
    if (!p) continue
    const baseH = WALL_HEIGHTS[i % WALL_HEIGHTS.length]
    const video = isVideoRef(p)
    tiles.push({
      kind: video ? 'video' : 'photo',
      url: video ? p.posterUrl || undefined : p.url, // posterless video → placeholder, never <img src=.mp4>

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

// E4 — build the decorated tiles for an ordered heterogeneous moment. One tile
// per piece in AUTHOR ORDER (photo/video/voice/note); the wall masonry balances
// heights. Returns the same { cols, compact, summary, tiles } shape as the
// pre-E4 path so every collage layout renders it unchanged (+ a note tile).
function buildPieceTiles(pieces) {
  const count = pieces.length
  const cols = count > 16 ? 3 : 2
  const compact = cols === 3
  const tiles = pieces.map((p, i) => {
    if (p.kind === 'note') return { kind: 'note', text: p.text || '', rot: (i % 3 - 1) * 1.2, tape: false }
    if (p.kind === 'voice') return { kind: 'voice', dur: p.durationSeconds, url: p.url, rot: 0, tape: false }
    const baseH = WALL_HEIGHTS[i % WALL_HEIGHTS.length]
    const video = isVideoRef(p)
    return {
      kind: video ? 'video' : 'photo',
      url: video ? p.posterUrl || undefined : p.url, // posterless video → placeholder, never <img src=.mp4>

      h: compact ? Math.round(baseH * (video ? 0.78 : 0.74)) : baseH,
      tape: !compact && i % 5 === 0,
      rot: (i % 3 - 1) * 1.2,
    }
  })
  const n = (k) => tiles.filter((t) => t.kind === k).length
  const summary = [
    n('photo') && `${n('photo')} photo${n('photo') === 1 ? '' : 's'}`,
    n('video') && `${n('video')} clip${n('video') === 1 ? '' : 's'}`,
    n('voice') && `${n('voice')} voice`,
    n('note') && `${n('note')} note${n('note') === 1 ? '' : 's'}`,
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
  // E4 — the ORDERED heterogeneous pieces (photos + voice + note slips). Allowlist
  // each: a note is pure text, a voice is its r2 url + duration, a photo/video its
  // url(+poster). `photos`/`audio` above remain for the card + single-piece heroes.
  const pieces =
    memory.pieces && memory.pieces.length
      ? memory.pieces
          .map((p) => {
            if (p.kind === 'note') return { kind: 'note', text: p.text || '' }
            if (p.kind === 'voice')
              return {
                kind: 'voice',
                ...(p.url ? { url: p.url } : {}),
                ...(p.mime ? { mime: p.mime } : {}),
                ...(p.durationSeconds != null ? { durationSeconds: p.durationSeconds } : {}),
              }
            const video = !!(p.posterUrl || (p.mime || '').startsWith('video'))
            return {
              kind: video ? 'video' : 'photo',
              url: p.url,
              ...(p.mime ? { mime: p.mime } : {}),
              ...(p.posterUrl ? { posterUrl: p.posterUrl } : {}),
            }
          })
          .filter((p) => (p.kind === 'note' ? typeof p.text === 'string' : !!(p.url || p.posterUrl)))
      : undefined
  return {
    kind: memory.kind || (photos.length ? 'photo' : audio ? 'audio' : 'text'),
    caption: memory.caption || undefined,
    // A text-only memory carries its body in `text`; that's the note hero.
    note: memory.kind === 'text' ? memory.text || undefined : undefined,
    photos,
    ...(pieces ? { pieces } : {}),
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
