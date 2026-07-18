// confirmFeedback.js — the S1 confirm-surface WRITE path (BUILD_PLAN_WITNESS_
// FLEET_2.md §W3 + Design bundle spec 03 §6). The once-a-day confirm card's
// terminal actions land here as APPEND-ONLY human feedback (migration 021,
// memory_heal_feedback), the durable record behind the family-facing promise
// "that's part of the trip now." This module owns the write + a read helper for
// the consumer (Stage 2b: the D13 lock, the D15 matcher, the normal-weight
// negative dimension). It never moves a photo itself — the route fires
// runHealForTrip after a successful write.
//
// MODE (env.PHOTO_CONFIRM_MODE): 'off' → the route is INERT, issues NO query
// against the table (the load-bearing inertness that lets the worker ship before
// migration 021 is applied — the 020/W5 posture). 'shadow' and 'on' both WRITE
// the feedback and fire the re-heal; the difference is downstream, in
// runHealForTrip's OWN mode gate — shadow re-sorts the shadow ledger without
// moving family photos (the pre-promotion "watch the engine learn from a real
// confirm" tool), 'on' actually moves them. There is no "shadow confirm": a
// human tap is a human tap; the knob only gates whether its consequence is
// family-visible.

// Self-contained tri-state resolver (mirrors photoHealMode/photoPresenceMode;
// no import, so no cycle with the runner/route).
export function photoConfirmMode(env) {
  const m = String(env?.PHOTO_CONFIRM_MODE || 'off').toLowerCase()
  return m === 'on' || m === 'shadow' ? m : 'off'
}

export const HEAL_FEEDBACK_ACTIONS = new Set(['confirmed', 'corrected', 'aside'])
const QUESTION_KINDS = new Set(['A', 'B', 'C', 'D'])

// D1 surfaces a missing table as "no such table: X" — the inertness signal when
// migration 021 has not been applied yet. Treated as a benign no-op everywhere.
const isNoTable = (e) => /no such table/i.test(String(e?.message || e))

const cleanStr = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

// Mirror of the client's isFilablePlace (app/src/lib/confirmSurface.js) — never
// imported across the boundary (separate deployable), same house rule as the
// sidecar whitelist. A REAL stop id only, never a synthetic vision/discovered
// placeholder (`__vision__…`, `__discovered__…`): those are moment/name labels
// that record feedback but move NO photo. The client files nothing for them, and
// the server MUST not either — else a name-confirm (kind B, placeId '__vision__…')
// would UPDATE stop_id to a bogus non-stop and lock the photos there forever.
const isFilableStop = (id) =>
  typeof id === 'string' && !!id && !id.startsWith('__vision__') && !id.startsWith('__discovered__')

// PURE validator (no DB) — the route rejects a bad body with this before any
// write. Identity + action are mandatory; a 'corrected' must actually SAY
// something (a picked place or non-empty words), else it is indistinguishable
// from a confirm and would teach a negative signal against nothing.
export function validateFeedback(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad-body' }
  const action = body.action
  if (!HEAL_FEEDBACK_ACTIONS.has(action)) return { ok: false, error: 'bad-action' }
  const memoryIds = Array.isArray(body.memoryIds) ? body.memoryIds.filter((x) => typeof x === 'string' && x) : []
  if (!memoryIds.length) return { ok: false, error: 'no-memories' }
  if (body.kind != null && !QUESTION_KINDS.has(body.kind)) return { ok: false, error: 'bad-kind' }
  if (action === 'corrected') {
    // A picked alternate carries a name and MAY carry a stop id (the base has a
    // name but no id) — either counts, as do free-text words. Only genuinely
    // empty corrections (nothing to teach) are rejected.
    const hasPlace = !!cleanStr(body.correctedPlaceId) || !!cleanStr(body.correctedPlaceName)
    const hasWords = !!cleanStr(body.words)
    if (!hasPlace && !hasWords) return { ok: false, error: 'empty-correction' }
  }
  return { ok: true, memoryIds }
}

// Write one terminal feedback row. `traveler` is the SESSION identity (the route
// has already checked isAdult) — never the body. Returns {ok,id} on write,
// {ok:false,error:'no-table'} when 021 is unapplied (inert), {ok:false,error}
// on a bad body. Does NOT fire the re-heal (the route owns that, via waitUntil).
export async function writeHealFeedback(env, tripId, traveler, body, { now = Date.now() } = {}) {
  const tid = cleanStr(tripId)
  if (!tid) return { ok: false, error: 'no-trip' }
  const v = validateFeedback(body)
  if (!v.ok) return v
  try {
    const res = await env.DB.prepare(
      `INSERT INTO memory_heal_feedback
         (trip_id, iso_date, memory_ids, action, kind, guessed_place_id, guessed_place_name,
          corrected_place_id, corrected_place_name, words, by_traveler, at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      tid,
      cleanStr(body.isoDate),
      JSON.stringify(v.memoryIds),
      body.action,
      QUESTION_KINDS.has(body.kind) ? body.kind : null,
      cleanStr(body.guessedPlaceId),
      cleanStr(body.guessedPlaceName),
      cleanStr(body.correctedPlaceId),
      cleanStr(body.correctedPlaceName),
      cleanStr(body.words),
      cleanStr(traveler),
      now
    ).run()
    return { ok: true, id: res?.meta?.last_row_id ?? null, action: body.action }
  } catch (e) {
    if (isNoTable(e)) return { ok: false, error: 'no-table' }
    throw e
  }
}

// SERVER-AUTHORITATIVE 'confirmed' stamp (D13 lock — S1 flip-blocker #1). A
// confirm is the strongest evidence, but the client's own updateMemoryStop
// mirror RACES the re-heal: when PHOTO_HEAL_MODE is on, runHealForTrip auto-
// files the same photo to the same stop first, and resolveStopProvenance Rule 1
// (sameStop) then preserves the stored 'auto' — silently discarding 'confirmed',
// so "on the record" becomes a lie. Fix: stamp source:'confirmed' onto the
// confirmed memories at the guessed stop HERE, server-side, in D1, BEFORE the
// re-heal fires. Then runHealForTrip's Gate 2 manual-lock arm (photoHeal.js)
// sees the human filing and never auto-moves it. guessedPlaceId IS the stop id
// (confirmSurface.js: stopId = moment.placeId = guessedPlaceId). Never clobbers
// an existing HUMAN file (manual/confirmed) to a DIFFERENT stop — another
// member's hand-move stands on the SERVER side (defense-in-depth). NOTE: this is
// NOT the full flip-blocker #2 fix — the client's own updateMemoryStop mirror can
// still clobber a different-stop hand-file (resolveStopProvenance Rule 2 refuses
// only incoming 'auto', not 'confirmed'), so the real fix is the deferred
// projection-side filter (don't even OFFER a confirm for a moment already
// human-filed elsewhere). Only files a REAL stop (isFilableStop) — a synthetic
// vision/discovered id records feedback but moves no photo, exactly as the client.
// Returns {stamped, skipped}. Fired only for a 'confirmed' action in 'on' mode.
export async function stampConfirmedStops(env, tripId, body, traveler, { now = Date.now() } = {}) {
  const tid = cleanStr(tripId)
  const sid = cleanStr(body?.guessedPlaceId) // the stop the human said "yes, here" to
  const memoryIds = Array.isArray(body?.memoryIds)
    ? body.memoryIds.filter((x) => typeof x === 'string' && x)
    : []
  if (!tid || !isFilableStop(sid) || !memoryIds.length) return { stamped: 0, skipped: 0 }
  const prov = JSON.stringify({ source: 'confirmed', by: cleanStr(traveler), at: now, reason: 'confirm' })
  let stamped = 0
  let skipped = 0
  for (const mid of memoryIds) {
    const row = await env.DB.prepare(
      'SELECT stop_id, stop_prov_json FROM memories WHERE id = ? AND trip_id = ? AND deleted_at IS NULL'
    ).bind(mid, tid).first()
    if (!row) { skipped++; continue }
    let sp = null
    try { sp = row.stop_prov_json ? JSON.parse(row.stop_prov_json) : null } catch { sp = null }
    const humanElsewhere =
      sp && (sp.source === 'manual' || sp.source === 'confirmed') && row.stop_id && row.stop_id !== sid
    if (humanElsewhere) { skipped++; continue } // don't clobber a hand-file to a different stop
    await env.DB.prepare(
      'UPDATE memories SET stop_id = ?, stop_prov_json = ?, updated_at = MAX(?, updated_at + 1) WHERE id = ? AND trip_id = ?'
    ).bind(sid, prov, now, mid, tid).run()
    stamped++
  }
  return { stamped, skipped }
}

// Read helper for Stage 2b (the scorer consumption) and the projection's
// undecided-only filter: every feedback row for a trip, newest first, memory_ids
// parsed. Missing table → [] (inert). A row whose memory_ids won't parse is
// dropped (never half-read), mirroring the ledger reader's posture.
export async function listHealFeedbackForTrip(env, tripId) {
  const tid = cleanStr(tripId)
  if (!tid) return []
  let rows
  try {
    const r = await env.DB.prepare(
      `SELECT id, trip_id, iso_date, memory_ids, action, kind, guessed_place_id, guessed_place_name,
              corrected_place_id, corrected_place_name, words, by_traveler, at
         FROM memory_heal_feedback WHERE trip_id = ? ORDER BY at DESC, id DESC`
    ).bind(tid).all()
    rows = r?.results
  } catch (e) {
    if (isNoTable(e)) return []
    throw e
  }
  const out = []
  for (const row of rows || []) {
    let memoryIds
    try {
      memoryIds = JSON.parse(row.memory_ids || '[]')
    } catch {
      continue
    }
    if (!Array.isArray(memoryIds) || !memoryIds.length) continue
    out.push({ ...row, memoryIds })
  }
  return out
}
