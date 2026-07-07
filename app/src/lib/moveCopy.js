// Per-lens copy for Ch3 photo-moves — VERBATIM from
// app/docs/design/album-system/specs/copy_deck.md (§ Move-to / moved-note).
//
// RAFA IS EXCLUDED from Ch3 by rule (README invariant 4): he never meets a move
// control or a moved-note. This module has NO Rafa variant — the CALLER gates
// Rafa out (isAdult) before any of this renders. Aurelia's lens is ALL LOWERCASE,
// including proper names ("jonathan", "saturday"), a settled per-lens rule.

// jonathan | helen | aurelia. Anything else falls to the adult default; Rafa is
// gated out upstream and never reaches here.
export function moveLens(traveler) {
  if (traveler === 'helen') return 'helen'
  if (traveler === 'aurelia') return 'aurelia'
  return 'jonathan'
}

// The lightbox action label ("Move to…").
export function moveActionLabel(traveler) {
  return moveLens(traveler) === 'aurelia' ? 'move to…' : 'Move to…'
}

// The Move-to sheet title.
export function moveSheetTitle(traveler) {
  return { jonathan: 'Move to…', helen: 'Move this photo to…', aurelia: 'move this to…' }[moveLens(traveler)]
}

// The "leave unfiled" row + its sub-label.
export function unfiledRowLabel(traveler) {
  return { jonathan: 'Leave unfiled', helen: 'Leave it unfiled', aurelia: 'leave it unfiled' }[moveLens(traveler)]
}
export const UNFILED_SUB = 'not tied to a moment'
export const HERE_NOW = 'here now' // the current-filing row (all lenses)
export const ROW_PLACE = 'A PLACE'
export const ROW_MOMENT = 'A NAMED MOMENT'

const NAMES = { jonathan: 'Jonathan', helen: 'Helen', aurelia: 'Aurelia', rafa: 'Rafa' }
function nameOf(id, viewer) {
  const cap = NAMES[id] || id || 'someone'
  return moveLens(viewer) === 'aurelia' ? cap.toLowerCase() : cap
}

// The LOCKED line shown under a HAND-moved photo (stopProv.source === 'manual').
// {n} = "you" on the mover's own device, else the mover's name (lowercased for
// Aurelia's lens). Authorship outranks the machine — this photo stays put.
export function lockedLine(prov, viewer) {
  const n = prov?.by && prov.by === viewer ? 'you' : nameOf(prov?.by, viewer)
  const l = moveLens(viewer)
  if (l === 'helen') return `Placed here by ${n} — stays put.`
  if (l === 'aurelia') return `${n} put it here — it stays.`
  return `Placed by ${n}. Locked.`
}
