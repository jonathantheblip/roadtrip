// Stop-filing PROVENANCE resolver — the worker-side lock that makes "a person's
// hand-move beats the machine" real (self-healing-photos SPEC §4). Pure and
// deterministic so the rule matrix is unit-testable without a DB and the logic
// can be mirrored client-side later (Move-to sheet) the way photoMatch is.
//
// It decides, for one incoming memory save, the EFFECTIVE stop_id + stop_prov
// to persist, whether a stop change was REFUSED (manual outranks auto), and
// whether to append a row to the memory_stop_moves ledger. postMemory calls it
// before the bind.

// 'confirmed' (S1, D13) — a family member tapped "yes, here" on the confirm card.
// A human speech act like 'manual', so it locks the same way (Rule 2 below) and
// survives whitelistProv; kept a DISTINCT source so the ledger/audit can tell a
// confirm-tap from a Move-to hand-file.
const SOURCES = new Set(['auto', 'manual', 'confirmed'])
// The human-filed sources — either LOCKS a filing against an incoming auto move
// (authorship outranks the machine). One predicate so every lock site agrees.
const HUMAN_FILED = new Set(['manual', 'confirmed'])
// Stored reason CODES only — prose is rendered per-lens at display time, never
// stored (SPEC §4). Accepts both the §4 vocabulary and the Ch3 display codes so
// a newer client's code is never silently dropped; an unknown code stores null.
const REASON_CODES = new Set([
  'agenda-change', 'stay-located', 'orphan-repair', 'import', 'hand-filed', 'unknown',
  'named', 'plan', 'gps', 'catchup', 'hand',
])

function str(v, max = 200) {
  return typeof v === 'string' && v ? v.slice(0, max) : null
}
function num(v) {
  return Number.isFinite(v) ? v : null
}

// null / undefined / '' all mean "unfiled" — compare as one filing.
export function sameStop(a, b) {
  return (a || null) === (b || null)
}

// Whitelist-reserialize an incoming stopProv into exactly the stored shape.
// Every candidate field is type/enum-checked; anything unrecognized is dropped.
// A prov without a valid `source` is not a lock signal → null (the memory save
// still proceeds; it just carries no provenance). Never rejects the whole write.
export function whitelistProv(p) {
  if (!p || typeof p !== 'object') return null
  if (!SOURCES.has(p.source)) return null
  const out = { source: p.source }
  // `by`: never fabricated. On an AUTO stamp the only non-null actor is the
  // machine — force 'matcher' or null, so a client can't push {source:'auto',
  // by:'helen'} and mis-attribute a machine move to a person (A-3 review #1).
  // A MANUAL stamp carries the acting traveler id. (An inferred manual stamp
  // still stays by:null — rule 3 sets it directly, never through here.)
  if (p.source === 'auto') {
    out.by = p.by === 'matcher' ? 'matcher' : null
  } else {
    out.by = typeof p.by === 'string' && p.by ? p.by.slice(0, 64) : null
  }
  const at = num(p.at)
  if (at != null) out.at = at
  const movedFrom = str(p.movedFrom, 128)
  if (movedFrom) out.movedFrom = movedFrom
  const mfl = str(p.movedFromLabel)
  if (mfl) out.movedFromLabel = mfl
  const tl = str(p.targetLabel)
  if (tl) out.targetLabel = tl
  if (typeof p.reason === 'string' && REASON_CODES.has(p.reason)) out.reason = p.reason
  // auto-only evidence — dropped on a manual prov.
  if (p.source === 'auto') {
    const mt = str(p.matchType, 32)
    if (mt) out.matchType = mt
    const dm = num(p.distanceMeters)
    if (dm != null) out.distanceMeters = dm
    const tr = num(p.tripRev)
    if (tr != null) out.tripRev = tr
    const ba = str(p.baseAnchor, 128)
    if (ba) out.baseAnchor = ba
  }
  return out
}

// One append-only ledger entry describing an accepted stop change.
function ledgerEntry(from, to, fromLabel, toLabel, prov, now) {
  return {
    from: from ?? null,
    to: to ?? null,
    fromLabel: fromLabel ?? null,
    toLabel: toLabel ?? null,
    source: prov.source,
    reason: prov.reason ?? null,
    by: prov.by ?? null,
    at: num(prov.at) ?? now,
    tripRev: num(prov.tripRev),
  }
}

// The rule matrix (SPEC §4). Inputs are already-whitelisted `incomingProv` (or
// null), the stored stop + parsed stored prov, and whether this is an INSERT
// (no stored row). Returns { stopId, prov, refused, move }:
//   stopId  — the effective stop_id to persist
//   prov    — the effective stopProv object (or null) to persist
//   refused — true when a manual lock refused an auto stop change (client adopts)
//   move    — a ledger entry to append, or null (no accepted change to record)
export function resolveStopProvenance({
  storedStopId,
  storedProv,
  isInsert,
  incomingStopId,
  incomingProv,
  now,
}) {
  const inStop = incomingStopId || null

  // Rule 4 — INSERT (new row): provenance is whatever a new-enough client sent
  // EXPLICITLY, else NULL (legacy). A bare-stopId insert must NOT become rule-3
  // manual, or every old-SW import manual-locks forever in the mixed-fleet window.
  if (isInsert) {
    const prov = incomingProv || null
    const move = prov && inStop
      ? ledgerEntry(null, inStop, null, prov.targetLabel ?? null, prov, now)
      : null
    return { stopId: inStop, prov, refused: false, move }
  }

  const storedStop = storedStopId || null

  // Rule 1 — incoming stop == stored: preserve stored provenance, no churn from
  // ordinary re-saves (a caption edit must never restamp the filing).
  if (sameStop(storedStop, inStop)) {
    return { stopId: storedStop, prov: storedProv ?? null, refused: false, move: null }
  }

  // Incoming stop DIFFERS from stored.
  if (incomingProv) {
    // Rule 2 — the lock: a stored HUMAN filing (manual hand-move OR an S1 confirm)
    // refuses an incoming AUTO move. Keep the stored stop + prov; the client adopts
    // the returned row (A-2). A later HUMAN move (manual/confirmed) still overrides
    // — only 'auto' is refused, so latest-human-wins holds.
    if (HUMAN_FILED.has(storedProv?.source) && incomingProv.source === 'auto') {
      return { stopId: storedStop, prov: storedProv, refused: true, move: null }
    }
    // Allowed change (manual→anything, auto→auto onto a non-manual, etc.).
    const fromLabel = incomingProv.movedFromLabel ?? storedProv?.targetLabel ?? null
    const move = ledgerEntry(storedStop, inStop, fromLabel, incomingProv.targetLabel ?? null, incomingProv, now)
    return { stopId: inStop, prov: incomingProv, refused: false, move }
  }

  // Rule 3 — differs, NO prov in the body: stamp manual, by:null. Manual is the
  // safe lock direction, but an inferred stamp is NEVER attributed to a person
  // (a stale drain must not read "Jonathan moved this"). Only the explicit
  // Move-to path earns by:<person>.
  const provRule3 = { source: 'manual', by: null, reason: 'unknown', at: now }
  const move = ledgerEntry(storedStop, inStop, storedProv?.targetLabel ?? null, null, provRule3, now)
  return { stopId: inStop, prov: provRule3, refused: false, move }
}
