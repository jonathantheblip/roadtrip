// Per-lens copy for the Stage 0c SUGGESTION banner — VERBATIM from
// app/docs/design/album-system/specs/copy_deck.md (§ "The suggestion (machine
// unsure)").
//
// Suggestions are ADULTS-ONLY (isAdult = jonathan/helen); the caller gates on
// isAdult before rendering, so Rafa + Aurelia never reach this — exactly like the
// shipped Move-to (moveCopy.js). The Aurelia variant is kept for parity +
// verbatim fidelity to the deck, but is unreached while the adult gate holds.

export function suggestLens(traveler) {
  if (traveler === 'helen') return 'helen'
  if (traveler === 'aurelia') return 'aurelia'
  return 'jonathan'
}

// The unsure banner line. `{n}` photos may belong at `{place}` (the target's
// snapshotted label). Verbatim deck forms; only the count + place vary. `photo`
// singularizes for the Jonathan lens; the deck's Helen/Aurelia forms are plural
// as written (a lone suggestion is the rare edge — grouping usually gives n≥2).
export function suggestLine(n, place, traveler) {
  const l = suggestLens(traveler)
  if (l === 'helen') return `These ${n} might belong at ${place}.`
  if (l === 'aurelia') return `these ${n} might be from ${place}.`
  return `${n} ${n === 1 ? 'photo' : 'photos'} may belong at ${place}.`
}

// The accept button.
export function suggestMoveLabel(traveler) {
  return { jonathan: 'Move', helen: 'Move them', aurelia: 'move them' }[suggestLens(traveler)]
}

// The decline button (synced, family-wide "Not now").
export function suggestDismissLabel(traveler) {
  return suggestLens(traveler) === 'aurelia' ? 'not now' : 'Not now'
}
