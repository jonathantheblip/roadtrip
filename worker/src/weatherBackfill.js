// weatherBackfill.js — populate a per-trip WEATHER cache (BUILD_PLAN_WITNESS_FLEET_2.md
// W1) from Open-Meteo's keyless archive/forecast endpoints, and the pure claim/conflict
// math offsetInference.js's corroborationTier composes as a VETO-ONLY second check
// alongside the existing daylight corroboration.
//
// Family terms: a photo the engine wants to trust at 2pm on the beach, on a day the sky
// really was pouring at 2pm, stops being silently trusted — the sky gets a vote. It can
// only ever veto (demote corroborated→conflicting); it never promotes anything on its
// own (no new knob needed for that reason alone — see corroborationTier below).
//
// WHY A CACHE, NOT A LIVE FETCH FROM offsetInference.js: this module's fetch calls run
// ONCE per trip per day in healSweep and cache the result on `trip.weatherDays` (keyed by
// UTC date, cache-forever — past weather never changes); offsetInference.js's
// corroborationTier stays PURE MATH over that already-fetched cache (its own header's
// contract at :36-38), never touching the network itself.
//
// TWO REGIMES, same as tripTzBackfill/conditions.js's existing Open-Meteo usage:
//  • a date more than ARCHIVE_DELAY_DAYS in the past → the ERA5 archive endpoint
//    (`archive-api.open-meteo.com/v1/archive`), which needs a few days to backfill so a
//    just-elapsed date is NOT yet reliably present there;
//  • a date within that window (including "still in progress" or the very recent past)
//    → the ordinary forecast endpoint's `past_days`, which covers recent history live.
// Both endpoints return the SAME `{hourly:{time,precipitation,weather_code}}` shape, so
// one extractor (`extractDayHours`) reads either.
//
// SAFE by construction, same shape as tripTzBackfill.js/sceneBackfill.js:
//  • idempotent — a date already cached on trip.weatherDays is never re-fetched (past
//    weather is immutable, so this is a true cache-forever, not just a rate limiter);
//  • OCC-guarded — the merged UPDATE matches the stored updated_at, so a concurrent trip
//    edit just skips this cache write (fully clobber-recomputable next sweep, same
//    posture as the placeNames/landmarkLookups cache precedent, photoHealRunner.js);
//  • does NOT bump updated_at — a worker-only enrichment cache, not a family edit;
//  • bounded — at most `limit` date-fetches (each an external call) per sweep;
//  • Open-Meteo unreachable / a bad payload for one date → that date is left uncached,
//    retried next sweep (never a permanent sentinel), and the whole pass never throws
//    (healSweep's caller wraps this in its own try/catch as an extra belt).
// `fetchWeatherDay` is injectable so the bounding/caching/OCC logic unit-tests without a
// real network call (the tripTzBackfill.js `fetchTz` precedent).
//
// ⚠ trip.weatherDays is a WORKER-ONLY cache — it MUST be (and, in the same commit that
// introduces it, IS) added to surprises.js's WORKER_ONLY_TRIP_KEYS, or it ships to every
// family member's ordinary GET /trips pull (the exact Build 4b/4c leak this project fixed
// once already, 2026-07-12's mask-gate restore — the ledger-consumer rule this module
// inherits explicitly).

import { describeCode } from './conditions.js'
import { stayPlaceCoords } from './stayPlaceCoords.js'

const DAY_MS = 86400000
const HOUR_MS = 3600000

// Confirmed fixture/test data (CLAUDE.md's explicit TRAP warning) — never derive or
// spend anything (an external Open-Meteo call) on it, matching every sibling backfill.
const SKIP_TRIP_IDS = new Set(['volleyball-2026'])

// A hangout/stay trip is never this long; a defensive cap so a malformed date pair can
// never spam unbounded fetches (the per-sweep `limit` bounds total calls too, but this
// keeps one trip from monopolizing the whole cap on a single bad row).
const MAX_TRIP_DAYS = 31

// Open-Meteo backfills its ERA5 archive with roughly a 5-day lag (grounded 2026-07-12);
// a small safety margin over that keeps a just-elapsed date off the archive endpoint
// until it's reliably there.
const ARCHIVE_DELAY_DAYS = 6

export function weatherBackfillLimit(env) {
  const raw = env?.PHOTO_WEATHER_BACKFILL_LIMIT
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 30
}

// Every YYYY-MM-DD (UTC) from dateRangeStart..dateRangeEnd inclusive. A trip missing
// either bound, or with an inverted/unparseable pair, yields no dates — an honest
// abstention, never a guess.
export function tripDateRange(trip) {
  const start = typeof trip?.dateRangeStart === 'string' ? trip.dateRangeStart : null
  const end = typeof trip?.dateRangeEnd === 'string' ? trip.dateRangeEnd : null
  if (!start || !end) return []
  const startMs = Date.parse(start + 'T00:00:00Z')
  const endMs = Date.parse(end + 'T00:00:00Z')
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return []
  const out = []
  for (let t = startMs; t <= endMs && out.length < MAX_TRIP_DAYS; t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

export function archiveWeatherUrl(lat, lng, dateStr) {
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: dateStr,
    end_date: dateStr,
    hourly: 'precipitation,cloud_cover,temperature_2m,weather_code',
    timezone: 'UTC',
  })
  return `https://archive-api.open-meteo.com/v1/archive?${p.toString()}`
}

// `pastDays` (clamped to the API's own [0,92] range) is how many days back from "today"
// the request should reach — the caller works out that count from the target date.
export function recentWeatherUrl(lat, lng, pastDays) {
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    past_days: String(Math.max(0, Math.min(92, pastDays))),
    forecast_days: '1',
    hourly: 'precipitation,cloud_cover,temperature_2m,weather_code',
    timezone: 'UTC',
  })
  return `https://api.open-meteo.com/v1/forecast?${p.toString()}`
}

// Pull just `dateStr`'s hourly entries out of an Open-Meteo hourly response (the archive
// and forecast endpoints share this exact `{hourly:{time,precipitation,weather_code}}`
// shape, requested with `timezone=UTC` so `time` entries are plain UTC wall-clock
// strings, e.g. "2026-07-04T14:00", directly prefix-matched against dateStr). Returns
// `{ "00": {precip, code}, … "23": {…} }` or null when the payload carries nothing for
// that date (an empty/failed fetch, or a date outside the response window).
export function extractDayHours(json, dateStr) {
  const time = json?.hourly?.time
  const precip = json?.hourly?.precipitation
  const code = json?.hourly?.weather_code
  if (!Array.isArray(time)) return null
  const out = {}
  let any = false
  for (let i = 0; i < time.length; i++) {
    const t = time[i]
    if (typeof t !== 'string' || !t.startsWith(dateStr)) continue
    const hh = t.slice(11, 13)
    if (hh.length !== 2) continue
    const p = typeof precip?.[i] === 'number' ? precip[i] : null
    const c = typeof code?.[i] === 'number' ? code[i] : null
    if (p === null && c === null) continue
    out[hh] = { precip: p ?? 0, code: c }
    any = true
  }
  return any ? out : null
}

function daysAgo(dateStr, nowMs) {
  const dateMs = Date.parse(dateStr + 'T00:00:00Z')
  if (!Number.isFinite(dateMs)) return null
  return Math.floor((nowMs - dateMs) / DAY_MS)
}

async function defaultFetchWeatherDay(lat, lng, dateStr, nowMs) {
  const age = daysAgo(dateStr, nowMs)
  const url = age !== null && age < ARCHIVE_DELAY_DAYS ? recentWeatherUrl(lat, lng, Math.max(age, 0)) : archiveWeatherUrl(lat, lng, dateStr)
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    return extractDayHours(data, dateStr)
  } catch {
    return null
  }
}

// The bounded, resumable sweep pass: for every trip with resolvable stay coords, fetch +
// cache any not-yet-cached date in its range (up to `limit` date-fetches total this
// call), merged into trip.weatherDays with a single guarded, no-bump UPDATE per trip.
export async function backfillWeather(env, { limit, fetchWeatherDay, now = Date.now() } = {}) {
  const cap = Number.isFinite(limit) ? limit : weatherBackfillLimit(env)
  const fetchDay = fetchWeatherDay || ((lat, lng, dateStr) => defaultFetchWeatherDay(lat, lng, dateStr, now))
  const { results: rows } = await env.DB.prepare('SELECT id, data_json, updated_at FROM trips WHERE deleted_at IS NULL').all()
  const stats = {
    trips: rows?.length || 0,
    skippedFixture: 0,
    noCoords: 0,
    datesCached: 0,
    datesFetched: 0,
    datesFailed: 0,
    tripsWritten: 0,
    hitLimit: false,
  }
  let attempted = 0
  for (const r of rows || []) {
    if (stats.hitLimit) break
    if (SKIP_TRIP_IDS.has(r.id)) {
      stats.skippedFixture++
      continue
    }
    let trip
    try {
      trip = JSON.parse(r.data_json)
    } catch {
      continue
    }
    const coords = stayPlaceCoords(trip)
    if (!coords) {
      stats.noCoords++
      continue
    }
    const dates = tripDateRange(trip)
    if (!dates.length) continue
    const existing = trip.weatherDays && typeof trip.weatherDays === 'object' ? trip.weatherDays : {}
    const patch = {}
    for (const d of dates) {
      if (existing[d]) {
        stats.datesCached++
        continue
      }
      if (attempted >= cap) {
        stats.hitLimit = true
        break
      }
      attempted++
      const hours = await fetchDay(coords.lat, coords.lng, d)
      if (hours) {
        patch[d] = hours
        stats.datesFetched++
      } else {
        stats.datesFailed++
      }
    }
    if (Object.keys(patch).length) {
      const updatedTrip = { ...trip, weatherDays: { ...existing, ...patch } }
      try {
        const upd = await env.DB.prepare('UPDATE trips SET data_json = ? WHERE id = ? AND updated_at = ? AND deleted_at IS NULL')
          .bind(JSON.stringify(updatedTrip), r.id, r.updated_at)
          .run()
        if ((upd?.meta?.changes ?? 0) > 0) stats.tripsWritten++
      } catch (e) {
        console.error('[weather-backfill] cache write failed', r.id, e?.stack || e)
      }
    }
  }
  return stats
}

// ── The claim/conflict math offsetInference.js's corroborationTier composes ─────────

// WORD-BOUNDARY only (the lesson this build is named for: a naive substring match on
// "train" would false-positive on "rain"). `rainbow` and `umbrella` are explicitly
// excluded even though neither is a reliable direct claim about CURRENT weather (a
// rainbow is commonly photographed well after rain has stopped; an umbrella may be
// closed, decorative, or sun-shade) — never treated as a rain claim.
const EXCLUDE_RE = /\b(rainbow|umbrella)\b/i
const RAIN_RE = /\b(rain|rainy|raining|drizzle|drizzling|downpour|showers?)\b/i
const SNOW_RE = /\b(snow|snowy|snowing|blizzard)\b/i
const FOG_RE = /\b(fog|foggy|mist|misty)\b/i
const SUNNY_RE = /\b(sunny|sunshine|clear sky|clear skies)\b/i

// A photo's OWN implied weather claim, read from its vision labels — 'rain' | 'snow' |
// 'fog' | 'clear' | null (no claim). Gated to outdoor refs only (mirrors
// corroborationTier's own outdoor gate — an indoor photo makes no claim about the sky).
export function weatherClaimFromVision(ref) {
  if (!ref || ref.vision?.setting !== 'outdoor') return null
  const parts = [ref.vision?.name, ...(Array.isArray(ref.vision?.labels) ? ref.vision.labels : [])]
  const text = parts.filter((s) => typeof s === 'string' && s).join(' ').toLowerCase()
  if (!text) return null
  const stripped = text.replace(EXCLUDE_RE, ' ')
  if (RAIN_RE.test(stripped)) return 'rain'
  if (SNOW_RE.test(stripped)) return 'snow'
  if (FOG_RE.test(stripped)) return 'fog'
  if (SUNNY_RE.test(stripped)) return 'clear'
  return null
}

// The cached hour entry ({precip, code}) at a given UTC instant, or undefined when that
// hour isn't in the cache (no data yet, or the ref falls outside the trip's date range).
function weatherHourAt(weatherDays, ms) {
  if (!weatherDays || typeof weatherDays !== 'object' || !Number.isFinite(ms)) return undefined
  const d = new Date(ms)
  const date = d.toISOString().slice(0, 10)
  const hour = String(d.getUTCHours()).padStart(2, '0')
  const day = weatherDays[date]
  return day && typeof day === 'object' ? day[hour] : undefined
}

// True when the ref's OWN claimed weather (from its vision labels) is CONTRADICTED by
// the cached observed weather at its capture instant — false for "no claim", "no cached
// data to check against" (abstain, never fabricate a conflict from silence), and "claim
// matches". Rain uses an hour±1 window (a shower can start/stop within the hour and
// still genuinely be "the rain in this photo"); sunny/snow/fog check the exact hour.
export function weatherConflict(ref, weatherDays) {
  const claim = weatherClaimFromVision(ref)
  if (!claim) return false
  const capturedAtMs = Date.parse(ref?.capturedAt)
  if (!Number.isFinite(capturedAtMs)) return false
  if (claim === 'rain') {
    const window = [capturedAtMs - HOUR_MS, capturedAtMs, capturedAtMs + HOUR_MS].map((ms) => weatherHourAt(weatherDays, ms))
    const known = window.filter((h) => h && typeof h.precip === 'number')
    if (!known.length) return false // no data in the window → abstain, never fabricate
    return !known.some((h) => h.precip > 0)
  }
  const h = weatherHourAt(weatherDays, capturedAtMs)
  if (!h || typeof h.code !== 'number') return false // no data for this hour → abstain
  const { kind } = describeCode(h.code)
  if (claim === 'clear') return !(kind === 'clear' || h.code === 2) // partly-cloudy(2) still satisfies "sunny"
  if (claim === 'snow') return kind !== 'snow'
  if (claim === 'fog') return kind !== 'fog'
  return false
}
