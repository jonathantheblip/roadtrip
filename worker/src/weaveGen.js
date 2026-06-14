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

  const pastDays = (activeTrip.days || [])
    .filter((d) => d.isoDate && d.isoDate <= todayIso)
    .sort((a, b) => b.isoDate.localeCompare(a.isoDate))
  for (const day of pastDays) {
    if (dayHasSharedMemory(activeTrip, day)) return { trip: activeTrip, day }
  }
  return null
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
