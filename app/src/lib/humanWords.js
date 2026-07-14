// humanWords.js — the human-words pack (BUILD_PLAN_WITNESS_FLEET_2.md W9):
// what the family already SAID or DID, finally consumed as evidence.
// Byte-identical to worker/src/humanWords.js (no imports on either side) — a
// parity test gates the two against drift.
//
// Item 1 (captions/text/notes matching, D15) is PARKED per the plan's own
// pre-authorized contingency: the pre-verified grounding count is 9 caption-
// bearing memories archive-wide (excluding the volleyball-2026 fixture), UNDER
// the plan's stated <10 demotion threshold. Not built here; the measured
// number is the reason, stated plainly in the build report.
//
// Two witnesses shipped:
//   D16 — hand-filed moves as evidence. A memory's CURRENT stop filing, when a
//     HUMAN put it there (stopProv.source==='manual'), is a positive anchor —
//     the same speech act D13's future confirm-tap will be, already on record
//     since Stage E (stopProvenance.js consumes this today only DEFENSIVELY,
//     as a lock refusing an incoming auto move). Here it becomes SIGNAL —
//     folded into a decision's signals for W7's future evidence audit, never a
//     tier/canAuto change in this build (the constitution's rule 1(A) closed
//     enumeration of what counts as location-reference for AUTO doesn't name
//     D16 — that promotion call belongs to W7/S1, not silently made here).
//   Dismissals as negative labels (item 3) — mig-018 "Not now" rows, matched
//     against decisions worker-side (needs a live D1 query; see
//     countDismissalEchoes below) and folded into a decision's signals as
//     `dismissedBefore`. REPORT-ONLY: no behavior/tier change — the matcher's
//     own suggestion-serve path already excludes these; this is purely the
//     shadow-report's visibility Jonathan asked the ledger to carry.

// D16: the memory's CURRENT stop filing, IF AND ONLY IF a human put it there.
// Dual-naming tolerant — worker rows carry stop_id/stop_prov_json (snake_case,
// the latter a JSON string); a normalized/client-shaped memory object may
// carry stopId/stopProv (camelCase, already parsed) — same tolerant-read
// posture as this adapter's other dual-naming helpers (author, created_at).
export function manualStopEvidence(m) {
  const stopId = m?.stopId ?? m?.stop_id ?? null
  let prov = m?.stopProv
  if (prov === undefined) {
    const raw = m?.stop_prov_json
    if (typeof raw === 'string' && raw) {
      try {
        prov = JSON.parse(raw)
      } catch {
        prov = null
      }
    }
  }
  // A human put it there — a hand move ('manual') OR a confirm-card "yes, here"
  // ('confirmed', S1/D13). Both are positive human anchors (D16 evidence).
  if (!stopId || !prov || (prov.source !== 'manual' && prov.source !== 'confirmed')) return null
  return { stopId, by: typeof prov.by === 'string' ? prov.by : null }
}

// item 3 — dismissals as NEGATIVE labels (mig 018). `dismissalRows`:
// [{memory_id, to_stop}] from a live memory_suggestion_dismissals query
// (worker-only — the client never makes this query). Annotates each decision
// whose (memoryId, place.id) matches a row a human already dismissed with
// `signals.dismissedBefore = true`; mutates `decisions` in place (matching the
// adapter's own existing post-hoc signals-folding pattern) and returns the
// count of decisions touched. Pure aside from that in-place annotation; never
// throws on bad input.
export function countDismissalEchoes(decisions, dismissalRows) {
  const dismissed = new Set()
  for (const r of Array.isArray(dismissalRows) ? dismissalRows : []) {
    if (r && r.memory_id && r.to_stop) dismissed.add(`${r.memory_id}\u0000${r.to_stop}`)
  }
  if (!dismissed.size) return 0
  let echoes = 0
  for (const dec of Array.isArray(decisions) ? decisions : []) {
    const placeId = dec?.place?.id
    if (!placeId) continue
    const hit = (dec.memoryIds || []).some((mid) => dismissed.has(`${mid}\u0000${placeId}`))
    if (hit) {
      dec.signals = { ...dec.signals, dismissedBefore: true }
      echoes++
    }
  }
  return echoes
}
