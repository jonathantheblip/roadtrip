// confirmSurface.js — the S1 confirm card's two pure client-local seams, shared
// by BOTH doors (the home-index card + the evening-settle rider) so each
// independently computes the SAME question for the same viewer on the same day,
// with no coordination code and no server round-trip for the daily gate.
//
//   • pickConfirmOfDay(decisions, localDateIso) → decision | null
//       deterministic day-of-year rotation over the ASKABLE (confirm-tier) rows
//       the projection returned. Answered moments are already excluded upstream
//       by /heal-decisions (the projection's undecided-only filter), and the
//       rows are already per-viewer masked — this adds ZERO masking.
//   • confirmBudgetSpentToday / spendConfirmBudget
//       one localStorage date key ('heal.confirm.lastHandled'), written the
//       instant either door takes a terminal action; both doors gate render on
//       !confirmBudgetSpentToday(today). One question a day, across both doors.
//
// Pure: no fetch, no React — node-testable. Storage is injectable (defaults to
// globalThis.localStorage) so it degrades to a no-op off-browser.

export const CONFIRM_BUDGET_KEY = 'heal.confirm.lastHandled'

// Same deterministic rotation resurface.js uses ("Looking back"), so the confirm
// card and the resurface card rotate on the same clock — 1..366 within a year.
function dayOfYear(iso) {
  const d = new Date(iso + 'T00:00:00')
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d - start) / 86400000)
}

const todayIso = () => new Date().toISOString().slice(0, 10)

// Which question variant a decision asks. The engine currently emits PLACE
// confirms and, via the vision-naming path, NAME confirms; time (C) and grouping
// (D) are written to full fidelity in the card but not yet produced as distinct
// confirm rows by the engine, so they are never derived here (honest: the card
// supports four, the engine feeds two today).
export function confirmKindOf(decision) {
  const pid = String(decision?.placeId || '')
  if (pid.startsWith('__vision__')) return 'B' // a vision-read name to confirm ("we're calling this …")
  return 'A' // a place to confirm
}

// Deterministic within the local day, stable regardless of the server's row
// order (so both doors agree). Askable = tier 'confirm' with a real moment
// (auto files silently; leave isn't a question). null when nothing is askable.
export function pickConfirmOfDay(decisions, localDateIso) {
  const today = localDateIso || todayIso()
  const candidates = (decisions || []).filter(
    (d) => d && d.tier === 'confirm' && Array.isArray(d.memoryIds) && d.memoryIds.length
  )
  if (!candidates.length) return null
  candidates.sort(
    (a, b) =>
      String(a.isoDate).localeCompare(String(b.isoDate)) ||
      String(a.memoryIds[0]).localeCompare(String(b.memoryIds[0]))
  )
  return candidates[dayOfYear(today) % candidates.length]
}

function resolveStorage(storage) {
  if (storage) return storage
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null
  } catch {
    return null
  }
}

// True once EITHER door has taken a terminal action today (confirm / correct /
// skip / set-aside). Off-browser or on a storage error → false (never blocks).
export function confirmBudgetSpentToday(localDateIso, storage) {
  const s = resolveStorage(storage)
  if (!s) return false
  try {
    return s.getItem(CONFIRM_BUDGET_KEY) === (localDateIso || todayIso())
  } catch {
    return false
  }
}

// Marks today's budget spent. Called on any terminal action in either door.
export function spendConfirmBudget(localDateIso, storage) {
  const s = resolveStorage(storage)
  if (!s) return
  try {
    s.setItem(CONFIRM_BUDGET_KEY, localDateIso || todayIso())
  } catch {
    /* private-mode / quota — the gate just doesn't persist; harmless */
  }
}
