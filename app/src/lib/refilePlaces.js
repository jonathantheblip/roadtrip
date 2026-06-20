// Re-file already-imported photos to the trip's implicit base ("At the cabin").
//
// The matcher runs at import/triage and stores each memory's stopId. When the
// trip's stay-place becomes a photo base only AFTER photos were imported (the
// P1.5 bridge — the cabin was the lodging, not a planned stop), those photos stay
// filed to the nearest dinner. This re-runs the matcher and MOVES the ones that
// now clearly belong to the base. Deliberate (a one-tap action), idempotent, and
// conservative: a memory moves only when EVERY one of its located photos agrees on
// the same base id and that differs from where it's filed — never split, never
// pulled off a planned stop onto a non-base. Each move rides the memory-sync
// conflict guard (updateMemoryStop), so it can't clobber a concurrent edit.

import { buildDayIndex, matchPhotoToStop, isImplicitBaseId, tripImplicitBase } from './photoMatch.js'
import { listMemoriesForTrip, updateMemoryStop } from './memoryStore.js'

// A memory's located photos as matcher inputs. Reads the per-photo lat/lng/
// capturedAt that survive the sync round-trip (LEG-C), across all photo containers
// (photoRefs[], the legacy single photoRef, and E4 `pieces`). Falls back to the
// memory-level capturedAt when a ref carries coords but no own date.
function locatedPhotos(m) {
  const refs = []
  if (Array.isArray(m.photoRefs) && m.photoRefs.length) refs.push(...m.photoRefs)
  else if (m.photoRef) refs.push(m.photoRef)
  if (Array.isArray(m.pieces)) refs.push(...m.pieces)
  const out = []
  refs.forEach((r, i) => {
    const lat = Number(r?.lat)
    const lng = Number(r?.lng)
    const capturedAt = (typeof r?.capturedAt === 'string' && r.capturedAt) || m.capturedAt
    if (Number.isFinite(lat) && Number.isFinite(lng) && capturedAt) {
      out.push({ id: `${m.id}:${i}`, lat, lng, capturedAt })
    }
  })
  return out
}

// How many photos/videos a memory carries — the WHOLE memory moves, so this is
// the real number that re-files (the confirm/toast must state photos, not memories,
// or a 6-photo album reads as "1 photo" while six move across every device).
function photoCountOf(m) {
  if (Array.isArray(m.photoRefs) && m.photoRefs.length) return m.photoRefs.length
  if (Array.isArray(m.pieces)) {
    const n = m.pieces.filter((p) => p && p.kind !== 'note' && p.kind !== 'voice').length
    if (n) return n
  }
  if (m.photoRef) return 1
  return m.photoExternalURLs?.length || 1
}

// Compute (and optionally apply) the moves. `dryRun: true` counts candidates
// without mutating — used to show the affordance only when there's work to do.
// Returns { movedMemories, movedPhotos, scanned } — UI states movedPhotos.
export function refileTripToPlaces(trip, { traveler, dryRun = false } = {}) {
  if (!trip || !tripImplicitBase(trip)) return { movedMemories: 0, movedPhotos: 0, scanned: 0 }
  const dayIndex = buildDayIndex(trip)
  const memories = listMemoriesForTrip(trip.id, traveler)
  let movedMemories = 0
  let movedPhotos = 0
  let scanned = 0
  for (const m of memories) {
    if (m?.masked) continue
    const photos = locatedPhotos(m)
    if (!photos.length) continue
    scanned += 1
    const stopIds = new Set(
      photos.map((p) => matchPhotoToStop(p, dayIndex).stopId).filter(Boolean)
    )
    if (stopIds.size !== 1) continue // photos disagree → don't split a memory
    const target = [...stopIds][0]
    if (!isImplicitBaseId(target) || target === m.stopId) continue
    movedMemories += 1
    movedPhotos += photoCountOf(m)
    if (!dryRun) updateMemoryStop(m.id, target)
  }
  return { movedMemories, movedPhotos, scanned }
}
