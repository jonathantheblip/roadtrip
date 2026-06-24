// Server-side Weave generation — the nightly auto-weave (WEAVE_SCOPE slice 3).
//
// The on-screen Weave is built on the CLIENT (app/src/lib/weave.js). This is
// the SERVER mirror: a nightly cron pre-assembles the active trip's freshest
// day into a stored narrative so the page is "already woven" when the family
// opens the app — no spinner, no per-open Claude call.
//
// The selection / beat / signature logic is kept PURE (no D1, no Anthropic) so
// it unit-tests in isolation. runNightlyWeave wires it to the real env.DB and
// an injected generateNarrative (index.js owns the Anthropic call + config),
// so the cron and the on-demand POST /weave share one narrative path.
//
// Mirrors the client's selectWeaveDay / buildBeats (app/src/lib/weave.js) —
// keep the two in step. Differences are deliberate and noted inline:
//   - SHARED memories only (the weave is the shared family page).
//   - NO random discovery mode (the cron only pre-makes an ACTIVE trip).
import { partDayOwner } from './surprises.js'

// ── Day selection (server, shared-family) ────────────────────────────────
// Mirrors selectWeaveDay's ACTIVE-TRIP branch: a trip is "active" within its
// date range + a 4-day grace window; the woven day is its most recent past
// day that has at least one shared memory. No active trip → null (skip): the
// client still serves discovery-mode weaves on demand.
export function selectWeaveDayServer(trips, dayHasSharedMemory, todayIso) {
  const candidates = (trips || []).filter((t) => t.days?.length)

  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }

  const activeTrip = candidates.find((t) => {
    const start = t.dateRangeStart
    const end = t.dateRangeEnd
    if (!start || !end) return false
    return start <= todayIso && todayIso <= addDays(end, 4)
  })
  if (!activeTrip) return null

  // Per-PART surprise ("surprises by sentence"): the weave is the SHARED family
  // page, so a day OWNED BY an unrevealed surprise part must not be woven — narrating
  // it would spoil the secret. Ownership comes from the SAME partDayOwner the mask
  // uses (clamped windows, no-dateEnd run, all-undated fallback), so the weave can't
  // under-exclude. (Whole-trip + memory surprises are excluded upstream in
  // runNightlyWeave.) Once the part reveals, its days weave normally.
  const parts = activeTrip.parts || []
  const owner = partDayOwner(parts)
  const unrevealedSurprise = (p) => p?.surprise && Array.isArray(p.surprise.hideFrom) && p.surprise.hideFrom.length && !p.surprise.revealed
  const inHiddenPart = (iso) => {
    const i = owner(iso)
    return i >= 0 && unrevealedSurprise(parts[i])
  }

  const pastDays = (activeTrip.days || [])
    .filter((d) => d.isoDate && d.isoDate <= todayIso && !inHiddenPart(d.isoDate))
    .sort((a, b) => b.isoDate.localeCompare(a.isoDate))
  for (const day of pastDays) {
    if (dayHasSharedMemory(activeTrip, day)) return { trip: activeTrip, day }
  }
  return null
}

// ── Serve-time surprise guard for STORED weaves ──────────────────────────────
// The SERVE-time counterpart to selectWeaveDayServer (which guards GENERATION).
// A `weaves` row is the family's SHARED day narrative. If it was woven/kept BEFORE
// a day's content became a surprise, the stored prose can still name the secret —
// and a generated narrative can't be redacted sentence-by-sentence, nor is any row
// ever deleted. So the safe move is to WITHHOLD a day's stored weave while that day
// is under an unrevealed surprise, then serve it again once revealed (self-healing;
// nothing is destroyed).
//
// GLOBAL, exactly like the generator: a day hidden from ANYONE is withheld from
// EVERYONE (selectWeaveDayServer / runNightlyWeave won't (re)weave a secret day for
// anyone either, so withholding the stored one is consistent, not stricter). Covers
// every surprise type, reusing the SAME predicates the mask + generator use so the
// three can't drift:
//   - whole-trip → allHidden (every day withheld)            [mirrors runNightlyWeave L165]
//   - per-part   → the days the part's DATE window owns       [mirrors selectWeaveDayServer]
//   - per-stop   → the day the hidden stop sits on            [mirrors weaveStatLine's test]
//   - per-memory → the day the hidden memory's stop sits on   [mirrors runNightlyWeave L176;
//                  the generator already drops hidden memories from FRESH beats, so this
//                  only catches a row woven before the memory was hidden]
//
// ⚠ A `weaves` row is keyed by its OWN day_iso and is NEVER deleted, so it can OUTLIVE
// the trip.days that produced it (an edit removes/restructures the day; the row stays).
// Secrecy is therefore decided against the surprise LAYERS DIRECTLY — partDayOwner is a
// pure date→index fn that works for a day_iso absent from trip.days — NOT against
// trip.days membership, or such a row would escape the guard. Returns
// { allHidden:boolean, isSecretDay:(iso)=>boolean }; the CALLER applies isSecretDay to
// each STORED row's day_iso. FAILS CLOSED: a present-but-unparseable trip, or a hidden
// memory whose stop can no longer be located in trip.days, withholds the WHOLE trip.
// Schema-absence (pre-migration table/column) is swallowed narrowly → no masking from
// that source; any OTHER D1 error propagates so the caller fails closed.
const weaveSurpriseHidden = (o) => {
  const s = o?.surprise
  return !!(s && Array.isArray(s.hideFrom) && s.hideFrom.length && !s.revealed)
}

const ALL_SECRET = { allHidden: true, isSecretDay: () => true }

export async function secretWeaveDaySet(env, tripId) {
  const day10 = (iso) => (typeof iso === 'string' ? iso.slice(0, 10) : null)

  // Load the trip (carries the trip/part/stop surprise layers, inside data_json).
  let trip = null
  let tripPresentButBroken = false
  try {
    const { results } = await env.DB.prepare(
      `SELECT data_json FROM trips WHERE id = ? AND deleted_at IS NULL`
    ).bind(tripId).all()
    if (results?.[0]?.data_json) {
      try { trip = JSON.parse(results[0].data_json) }
      catch { tripPresentButBroken = true } // present but unreadable → fail closed
    }
  } catch (e) {
    if (!/no such (table|column)/i.test(String(e?.message || e))) throw e
  }

  // Whole-trip surprise, OR a present trip we can't read (it may hide a live surprise we
  // can't see) → withhold everything. A genuinely-absent trip is a legit orphan weave →
  // no structural masking (the memory pass below still runs).
  if (tripPresentButBroken || (trip && weaveSurpriseHidden(trip))) return ALL_SECRET

  const parts = trip && Array.isArray(trip.parts) ? trip.parts : []
  const partOwner = parts.length ? partDayOwner(parts) : null
  const hiddenPart = new Set() // indices of hidden parts (windows are date ranges)
  parts.forEach((p, i) => { if (weaveSurpriseHidden(p)) hiddenPart.add(i) })

  // per-stop lives IN trip.days (a stop surprise can't exist for a day not in trip.days),
  // so iterating trip.days is the correct domain. Also build stop → day for the memory pass.
  const hiddenStopDays = new Set()
  const stopDay = new Map()
  if (trip) {
    for (const d of trip.days || []) {
      const iso = day10(d?.isoDate)
      for (const s of d?.stops || []) {
        if (s?.id && iso) stopDay.set(s.id, iso)
        if (iso && weaveSurpriseHidden(s)) hiddenStopDays.add(iso)
      }
    }
  }

  // Hidden unrevealed SHARED memories. A memory carries a stop_id but no day of its own
  // → map it via trip.days. If its stop is GONE from trip.days (restructured after the
  // row was woven) we can't locate the day → withhold the WHOLE trip's weaves (rare,
  // conservative, safe). A NULL stop_id never enters a day's beats → never leaks → skip.
  const hiddenMemoryDays = new Set()
  let unmappableHiddenMemory = false
  try {
    const { results } = await env.DB.prepare(
      `SELECT stop_id FROM memories
        WHERE trip_id = ? AND deleted_at IS NULL AND visibility = 'shared'
          AND hide_from_json IS NOT NULL AND revealed_at IS NULL`
    ).bind(tripId).all()
    for (const r of results || []) {
      if (!r?.stop_id) continue
      const iso = stopDay.get(r.stop_id)
      if (iso) hiddenMemoryDays.add(iso)
      else unmappableHiddenMemory = true
    }
  } catch (e) {
    if (!/no such (table|column)/i.test(String(e?.message || e))) throw e
  }
  if (unmappableHiddenMemory) return ALL_SECRET

  const isSecretDay = (iso) => {
    const d = day10(iso)
    if (!d) return false
    if (partOwner) { const i = partOwner(d); if (i >= 0 && hiddenPart.has(i)) return true }
    return hiddenStopDays.has(d) || hiddenMemoryDays.has(d)
  }
  return { allHidden: false, isSecretDay }
}

// ── Beat building (server) ───────────────────────────────────────────────
// Port of buildBeats: group a day's shared memories by author, keep one beat
// per person (preference voice > photo > text — most distinctive first).
// Returns [{ who, kind, snippet }] — the short summaries Claude frames around.
const KIND_RANK = { voice: 0, photo: 1, text: 2 }

export function buildBeatsServer(day, sharedMemories) {
  const stopIds = new Set((day.stops || []).map((s) => s.id))
  const dayMems = (sharedMemories || []).filter((m) => stopIds.has(m.stopId))

  const byAuthor = {}
  for (const m of dayMems) {
    if (!m.authorTraveler) continue
    if (!byAuthor[m.authorTraveler]) byAuthor[m.authorTraveler] = []
    byAuthor[m.authorTraveler].push(m)
  }

  const beats = []
  for (const who of Object.keys(byAuthor)) {
    const best = byAuthor[who]
      .slice()
      .sort((a, b) => (KIND_RANK[a.kind] ?? 3) - (KIND_RANK[b.kind] ?? 3))[0]
    if (!best) continue

    let snippet = ''
    if (best.kind === 'voice') {
      snippet = best.transcript ? best.transcript.slice(0, 120) : 'recorded a voice clip'
    } else if (best.kind === 'photo') {
      snippet = best.caption ? best.caption.slice(0, 120) : 'took a photo'
    } else {
      snippet = best.text ? best.text.slice(0, 120) : 'left a note'
    }

    beats.push({ who, kind: best.kind || 'text', snippet })
  }
  return beats
}

// ── Framing stat (server) ────────────────────────────────────────────────
// "Day N · K stops" from the trip's day list. The CLIENT renders precise road
// miles at view time (fetchRoadRoute); the cron only needs a light stat for
// Claude's framing context — deliberately NO Google dependency in the cron.
export function weaveStatLine(trip, day) {
  const idx = (trip.days || []).findIndex((d) => d.isoDate === day.isoDate)
  const dayNum = idx >= 0 ? idx + 1 : null
  // Per-stop masking (Slice 2): the weave is the SHARED family page, so its stop
  // count must not betray a still-hidden surprise stop — exclude unrevealed
  // stop-surprises so a recipient never sees "5 stops" when only 4 are theirs.
  const stops = (day.stops || []).filter(
    (s) => !(s?.surprise && Array.isArray(s.surprise.hideFrom) && s.surprise.hideFrom.length && !s.surprise.revealed)
  ).length
  const parts = []
  if (dayNum) parts.push(`Day ${dayNum}`)
  if (stops) parts.push(`${stops} stop${stops === 1 ? '' : 's'}`)
  return parts.join(' · ') || null
}

// ── Content fingerprint ──────────────────────────────────────────────────
// A cheap signature of the day's beats. A nightly re-run that finds the same
// signature skips the Claude call AND leaves generated_at untouched — so the
// client's "ready" cue only fires when the day's content actually moved.
export function beatSignature(beats) {
  return (beats || [])
    .map((b) => `${b.who}:${b.kind}:${b.snippet}`)
    .sort()
    .join('|')
}

// ── Nightly orchestrator ─────────────────────────────────────────────────
// Reads trips + shared memories from D1, selects the active trip's freshest
// day, builds beats, and — only when the content changed since the stored row
// — calls Claude and upserts the weave. Returns a small summary for logging.
//
//   generateNarrative({ beatLines, stat }) -> { title, opening, closing }
// is INJECTED by index.js (owns the Anthropic config); tests pass a fake.
// nowMs / todayIso are passed in (no Date.now() buried here) so runs are
// deterministic under test.
export async function runNightlyWeave(env, { nowMs, generateNarrative, todayIso } = {}) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now()
  const today = todayIso || new Date(now).toISOString().slice(0, 10)

  // Load non-deleted trips (parse data_json like getTrips does).
  const tripRows = await env.DB.prepare(
    `SELECT data_json, date_range_start, date_range_end
       FROM trips WHERE deleted_at IS NULL`
  ).all()
  const trips = (tripRows.results || [])
    .map((r) => {
      try {
        const t = JSON.parse(r.data_json)
        if (r.date_range_start) t.dateRangeStart = r.date_range_start
        if (r.date_range_end) t.dateRangeEnd = r.date_range_end
        return t
      } catch {
        return null
      }
    })
    .filter(Boolean)
    // Whole-trip masking (3b): never weave an UNREVEALED secret trip — the weave
    // is a Claude surface, and the woven page (fetched via /weave/latest) would
    // spoil it for the hidden-from people. Once revealed it weaves normally.
    .filter((t) => !(t.surprise && Array.isArray(t.surprise.hideFrom) && t.surprise.hideFrom.length && !t.surprise.revealed))

  // Load all non-deleted SHARED memories once (private never enters the weave).
  // Exclude unrevealed surprises (Surprises masking, 010): the weave is the
  // family's SHARED day page, so a not-yet-revealed surprise (hidden from
  // anyone) must not enter it — it would spoil for the hidden-from people. Once
  // revealed (revealed_at set) it re-joins normally.
  const memRows = await env.DB.prepare(
    `SELECT id, trip_id, stop_id, author_traveler, kind, text, caption, transcript, updated_at
       FROM memories
      WHERE deleted_at IS NULL AND visibility = 'shared'
        AND (hide_from_json IS NULL OR revealed_at IS NOT NULL)`
  ).all()
  const memByTrip = new Map()
  for (const r of memRows.results || []) {
    if (!r.trip_id) continue
    if (!memByTrip.has(r.trip_id)) memByTrip.set(r.trip_id, [])
    memByTrip.get(r.trip_id).push({
      id: r.id,
      stopId: r.stop_id,
      authorTraveler: r.author_traveler,
      kind: r.kind,
      text: r.text,
      caption: r.caption,
      transcript: r.transcript,
      updatedAt: r.updated_at,
    })
  }

  const dayHasSharedMemory = (trip, day) => {
    const stopIds = new Set((day.stops || []).map((s) => s.id))
    return (memByTrip.get(trip.id) || []).some((m) => stopIds.has(m.stopId))
  }

  const picked = selectWeaveDayServer(trips, dayHasSharedMemory, today)
  if (!picked) return { skipped: 'no-active-day' }

  const { trip, day } = picked
  const beats = buildBeatsServer(day, memByTrip.get(trip.id) || [])
  if (!beats.length) return { skipped: 'no-beats', tripId: trip.id, dayIso: day.isoDate }

  const sig = beatSignature(beats)
  const id = `${trip.id}::${day.isoDate}`

  // Skip Claude + the write when nothing changed since the stored weave.
  const existing = await env.DB.prepare(
    `SELECT beat_signature FROM weaves WHERE id = ?`
  ).bind(id).all()
  if (existing.results?.[0]?.beat_signature === sig) {
    return { skipped: 'unchanged', tripId: trip.id, dayIso: day.isoDate }
  }

  const stat = weaveStatLine(trip, day)
  const beatLines = beats
    .map((b) => `- ${b.who} (${b.kind}): ${String(b.snippet).slice(0, 200)}`)
    .join('\n')

  let narrative
  try {
    narrative = await generateNarrative({ beatLines, stat })
  } catch (e) {
    return { error: `narrative: ${e?.message || String(e)}`, tripId: trip.id, dayIso: day.isoDate }
  }
  if (!narrative?.title || !narrative?.opening || !narrative?.closing) {
    return { error: 'narrative-incomplete', tripId: trip.id, dayIso: day.isoDate }
  }

  await env.DB.prepare(
    `INSERT INTO weaves (
       id, trip_id, day_iso, title, opening, closing,
       stat, beats_json, beat_signature, generated_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       opening = excluded.opening,
       closing = excluded.closing,
       stat = excluded.stat,
       beats_json = excluded.beats_json,
       beat_signature = excluded.beat_signature,
       generated_at = excluded.generated_at,
       updated_at = excluded.updated_at`
  ).bind(
    id, trip.id, day.isoDate,
    narrative.title, narrative.opening, narrative.closing,
    stat, JSON.stringify(beats), sig, now, now
  ).run()

  return { woven: true, tripId: trip.id, dayIso: day.isoDate, beats: beats.length }
}

// ── Maintenance: rewrite stored weave NARRATIVES in place ─────────────────────
// When the narrative PROMPT changes (the title / closing / no-quoted-placeholder
// fixes), every stored page keeps its OLD wording — the nightly cron only touches
// the active trip's freshest day and skips unchanged beats, so a family member
// opening a past page still sees the old garbled title. This re-runs the
// narrative on each stored weave's OWN beats (beats_json) so the saved pages read
// right too. Beats are unchanged → beat_signature is left intact; only
// title/opening/closing + updated_at move. generateNarrative is injected
// (index.js owns the Anthropic config); tests pass a fake.
export async function regenerateStoredWeaves(env, { generateNarrative, nowMs } = {}) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now()
  const rows = await env.DB.prepare(`SELECT id, beats_json, stat FROM weaves`).all()
  const all = rows.results || []
  let updated = 0
  let failed = 0
  let skipped = 0
  for (const r of all) {
    let beats
    try {
      beats = JSON.parse(r.beats_json)
    } catch {
      skipped += 1
      continue
    }
    if (!Array.isArray(beats) || !beats.length) {
      skipped += 1
      continue
    }
    const beatLines = beats
      .map((b) => `- ${b.who} (${b.kind}): ${String(b.snippet).slice(0, 200)}`)
      .join('\n')
    let narrative
    try {
      narrative = await generateNarrative({ beatLines, stat: r.stat })
    } catch {
      failed += 1
      continue
    }
    if (!narrative?.title || !narrative?.opening || !narrative?.closing) {
      failed += 1
      continue
    }
    await env.DB.prepare(
      `UPDATE weaves SET title = ?, opening = ?, closing = ?, updated_at = ? WHERE id = ?`
    ).bind(narrative.title, narrative.opening, narrative.closing, now, r.id).run()
    updated += 1
  }
  return { total: all.length, updated, failed, skipped }
}
