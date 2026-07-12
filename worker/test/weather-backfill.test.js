// backfillWeather + its pure helpers (BUILD_PLAN_WITNESS_FLEET_2.md W1) against
// REAL test D1 with an injected `fetchWeatherDay` (no real network call) — the
// trip.weatherDays cache pass, and the word-boundary claim/conflict math
// offsetInference.js's corroborationTier composes as a veto-only second check.
// Mirrors trip-tz-backfill.test.js's injectable-fetch shape.

import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import {
  backfillWeather,
  tripDateRange,
  archiveWeatherUrl,
  recentWeatherUrl,
  extractDayHours,
  weatherClaimFromVision,
  weatherConflict,
  weatherBackfillLimit,
} from '../src/weatherBackfill.js'

async function seedTrip(id, trip, updated_at = 100) {
  await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?,?,?)')
    .bind(id, JSON.stringify({ id, ...trip }), updated_at)
    .run()
}
async function tripRow(id) {
  const r = await env.DB.prepare('SELECT data_json, updated_at FROM trips WHERE id=?').bind(id).first()
  return { trip: JSON.parse(r.data_json), updated_at: r.updated_at }
}

beforeEach(async () => {
  await applySchema(env.DB)
  await env.DB.prepare('DELETE FROM trips').run()
})

const PTOWN = { lat: 42.0621405, lng: -70.1633884 }

describe('tripDateRange (pure)', () => {
  it('enumerates every YYYY-MM-DD from start..end inclusive', () => {
    expect(tripDateRange({ dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-03' })).toEqual([
      '2026-07-01', '2026-07-02', '2026-07-03',
    ])
  })
  it('a single-day trip yields one date', () => {
    expect(tripDateRange({ dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-01' })).toEqual(['2026-07-01'])
  })
  it('missing either bound → no dates (honest abstention)', () => {
    expect(tripDateRange({ dateRangeStart: '2026-07-01' })).toEqual([])
    expect(tripDateRange({ dateRangeEnd: '2026-07-01' })).toEqual([])
    expect(tripDateRange({})).toEqual([])
  })
  it('an inverted range (end before start) → no dates, never throws', () => {
    expect(tripDateRange({ dateRangeStart: '2026-07-05', dateRangeEnd: '2026-07-01' })).toEqual([])
  })
  it('an unparseable date → no dates, never throws', () => {
    expect(tripDateRange({ dateRangeStart: 'garbage', dateRangeEnd: '2026-07-01' })).toEqual([])
  })
  it('caps at MAX_TRIP_DAYS (31) so a malformed huge range never spams unbounded fetches', () => {
    const dates = tripDateRange({ dateRangeStart: '2026-01-01', dateRangeEnd: '2026-12-31' })
    expect(dates.length).toBe(31)
  })
})

describe('archiveWeatherUrl / recentWeatherUrl (pure)', () => {
  it('archiveWeatherUrl requests the archive endpoint for a single date, timezone=UTC', () => {
    const url = archiveWeatherUrl(PTOWN.lat, PTOWN.lng, '2026-07-04')
    expect(url).toContain('archive-api.open-meteo.com/v1/archive')
    expect(url).toContain('start_date=2026-07-04')
    expect(url).toContain('end_date=2026-07-04')
    expect(url).toContain('timezone=UTC')
    expect(url).toContain('latitude=42.0621405')
  })
  it('recentWeatherUrl requests the forecast endpoint with past_days, timezone=UTC', () => {
    const url = recentWeatherUrl(PTOWN.lat, PTOWN.lng, 3)
    expect(url).toContain('api.open-meteo.com/v1/forecast')
    expect(url).toContain('past_days=3')
    expect(url).toContain('timezone=UTC')
  })
  it('recentWeatherUrl clamps past_days into [0,92]', () => {
    expect(recentWeatherUrl(PTOWN.lat, PTOWN.lng, -5)).toContain('past_days=0')
    expect(recentWeatherUrl(PTOWN.lat, PTOWN.lng, 999)).toContain('past_days=92')
  })
})

describe('extractDayHours (pure)', () => {
  it('pulls just the matching date\'s hourly entries, keyed by zero-padded UTC hour', () => {
    const json = {
      hourly: {
        time: ['2026-07-03T23:00', '2026-07-04T00:00', '2026-07-04T14:00', '2026-07-05T00:00'],
        precipitation: [0, 0.1, 0.5, 0],
        weather_code: [3, 61, 63, 0],
      },
    }
    expect(extractDayHours(json, '2026-07-04')).toEqual({
      '00': { precip: 0.1, code: 61 },
      '14': { precip: 0.5, code: 63 },
    })
  })
  it('a payload with nothing for that date → null', () => {
    const json = { hourly: { time: ['2026-07-05T00:00'], precipitation: [0], weather_code: [0] } }
    expect(extractDayHours(json, '2026-07-04')).toBeNull()
  })
  it('a malformed/missing hourly shape → null, never throws', () => {
    expect(extractDayHours(null, '2026-07-04')).toBeNull()
    expect(extractDayHours({}, '2026-07-04')).toBeNull()
    expect(extractDayHours({ hourly: {} }, '2026-07-04')).toBeNull()
  })
})

describe('backfillWeather', () => {
  it('caches a trip\'s full date range via the injected fetcher, merged into trip.weatherDays', async () => {
    await seedTrip('t1', { dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-02', lodging: { lat: PTOWN.lat, lng: PTOWN.lng, name: 'Stay' } })
    const calls = []
    const fetchWeatherDay = async (lat, lng, dateStr) => {
      calls.push(dateStr)
      return { '14': { precip: 0, code: 0 } }
    }
    const s = await backfillWeather(env, { fetchWeatherDay })
    expect(calls).toEqual(['2026-07-01', '2026-07-02'])
    expect(s.datesFetched).toBe(2)
    expect(s.tripsWritten).toBe(1)
    const { trip } = await tripRow('t1')
    expect(trip.weatherDays).toEqual({
      '2026-07-01': { '14': { precip: 0, code: 0 } },
      '2026-07-02': { '14': { precip: 0, code: 0 } },
    })
  })

  it('is idempotent — an already-cached date is never re-fetched (cache-forever, past weather is immutable)', async () => {
    await seedTrip('t1', {
      dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-02',
      lodging: { lat: PTOWN.lat, lng: PTOWN.lng },
      weatherDays: { '2026-07-01': { '14': { precip: 0, code: 0 } } },
    })
    const calls = []
    const fetchWeatherDay = async (lat, lng, dateStr) => { calls.push(dateStr); return { '14': { precip: 0, code: 0 } } }
    const s = await backfillWeather(env, { fetchWeatherDay })
    expect(calls).toEqual(['2026-07-02']) // only the missing date
    expect(s.datesCached).toBe(1)
    expect(s.datesFetched).toBe(1)
    const { trip } = await tripRow('t1')
    expect(Object.keys(trip.weatherDays)).toEqual(['2026-07-01', '2026-07-02'])
  })

  it('skips a trip with no resolvable stay coords', async () => {
    await seedTrip('t1', { dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-01', lodging: { name: 'no coords' } })
    const s = await backfillWeather(env, { fetchWeatherDay: async () => ({ '00': { precip: 0, code: 0 } }) })
    expect(s.noCoords).toBe(1)
  })

  it('skips volleyball-2026 entirely even with resolvable coords', async () => {
    await seedTrip('volleyball-2026', { dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-01', homeBase: { lat: 41.3225, lng: -72.0943, label: 'New London, CT' } })
    let called = false
    const s = await backfillWeather(env, { fetchWeatherDay: async () => { called = true; return null } })
    expect(s.skippedFixture).toBe(1)
    expect(called).toBe(false)
  })

  it('a failed fetch for one date leaves it uncached, retriable next sweep', async () => {
    await seedTrip('t1', { dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-01', lodging: { lat: PTOWN.lat, lng: PTOWN.lng } })
    const s = await backfillWeather(env, { fetchWeatherDay: async () => null })
    expect(s.datesFailed).toBe(1)
    expect(s.tripsWritten).toBe(0)
    const { trip } = await tripRow('t1')
    expect(trip.weatherDays).toBeUndefined()
  })

  it('respects the limit and reports hitLimit (bounded, resumable)', async () => {
    await seedTrip('t1', { dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-03', lodging: { lat: PTOWN.lat, lng: PTOWN.lng } })
    let calls = 0
    const s = await backfillWeather(env, { limit: 2, fetchWeatherDay: async () => { calls++; return { '00': { precip: 0, code: 0 } } } })
    expect(calls).toBe(2)
    expect(s.hitLimit).toBe(true)
    const { trip } = await tripRow('t1')
    expect(Object.keys(trip.weatherDays).length).toBe(2)
  })

  it('never bumps updated_at (a worker-only enrichment cache, not a family edit)', async () => {
    await seedTrip('t1', { dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-01', lodging: { lat: PTOWN.lat, lng: PTOWN.lng } }, 999)
    await backfillWeather(env, { fetchWeatherDay: async () => ({ '00': { precip: 0, code: 0 } }) })
    expect((await tripRow('t1')).updated_at).toBe(999)
  })

  it('an OCC mismatch (a concurrent trip edit landing mid-fetch) skips the cache write, never throws', async () => {
    await seedTrip('t1', { dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-01', lodging: { lat: PTOWN.lat, lng: PTOWN.lng } }, 100)
    // The injected fetch is awaited (yields control) before the guarded UPDATE runs —
    // land a real concurrent edit on the SAME row during that gap, exactly like another
    // device's save racing this sweep pass.
    const fetchWeatherDay = async () => {
      await env.DB.prepare('UPDATE trips SET data_json = ?, updated_at = 101 WHERE id = ?')
        .bind(JSON.stringify({ id: 't1', dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-01', lodging: { lat: PTOWN.lat, lng: PTOWN.lng }, title: 'edited mid-race' }), 't1')
        .run()
      return { '00': { precip: 0, code: 0 } }
    }
    const s = await backfillWeather(env, { fetchWeatherDay })
    expect(s.tripsWritten).toBe(0) // the guarded UPDATE's stale updated_at=100 never matched
    const { trip, updated_at } = await tripRow('t1')
    expect(trip.weatherDays).toBeUndefined() // cache write lost the race, cleanly — never clobbered the concurrent edit
    expect(trip.title).toBe('edited mid-race') // the concurrent edit survived intact
    expect(updated_at).toBe(101)
  })

  it('weatherBackfillLimit defaults to 30, honors PHOTO_WEATHER_BACKFILL_LIMIT', () => {
    expect(weatherBackfillLimit({})).toBe(30)
    expect(weatherBackfillLimit({ PHOTO_WEATHER_BACKFILL_LIMIT: '5' })).toBe(5)
    expect(weatherBackfillLimit({ PHOTO_WEATHER_BACKFILL_LIMIT: 7 })).toBe(7)
  })
})

// ── The claim/conflict math corroborationTier composes ─────────────────────────

describe('weatherClaimFromVision (pure) — WORD-BOUNDARY only', () => {
  it('an outdoor "sunny day" label → clear claim', () => {
    expect(weatherClaimFromVision({ vision: { setting: 'outdoor', labels: ['sunny day', 'beach'] } })).toBe('clear')
  })
  it('an outdoor rain label → rain claim', () => {
    expect(weatherClaimFromVision({ vision: { setting: 'outdoor', labels: ['rain', 'street'] } })).toBe('rain')
  })
  it('an outdoor snow/fog label → the matching claim', () => {
    expect(weatherClaimFromVision({ vision: { setting: 'outdoor', labels: ['snow'] } })).toBe('snow')
    expect(weatherClaimFromVision({ vision: { setting: 'outdoor', labels: ['foggy morning'] } })).toBe('fog')
  })
  it('"train" does NOT false-positive as "rain" (the word-boundary lesson this build is named for)', () => {
    expect(weatherClaimFromVision({ vision: { setting: 'outdoor', labels: ['train', 'station'] } })).toBeNull()
  })
  it('"rainbow" and "umbrella" are explicitly excluded as non-claims', () => {
    expect(weatherClaimFromVision({ vision: { setting: 'outdoor', labels: ['rainbow'] } })).toBeNull()
    expect(weatherClaimFromVision({ vision: { setting: 'outdoor', name: 'kids with umbrellas' } })).toBeNull()
  })
  it('indoor → no claim regardless of labels (mirrors corroborationTier\'s own outdoor gate)', () => {
    expect(weatherClaimFromVision({ vision: { setting: 'indoor', labels: ['rain'] } })).toBeNull()
  })
  it('no vision at all, or no matching label → no claim', () => {
    expect(weatherClaimFromVision({})).toBeNull()
    expect(weatherClaimFromVision({ vision: { setting: 'outdoor', labels: ['beach', 'dog'] } })).toBeNull()
  })
})

describe('weatherConflict (pure)', () => {
  const HOUR = (h) => `2026-07-04T${String(h).padStart(2, '0')}:00:00.000Z`
  it('claimed rain, no precipitation anywhere in the hour±1 window → conflict', () => {
    const weatherDays = { '2026-07-04': { '13': { precip: 0, code: 3 }, '14': { precip: 0, code: 3 }, '15': { precip: 0, code: 3 } } }
    const ref = { vision: { setting: 'outdoor', labels: ['rain'] }, capturedAt: HOUR(14) }
    expect(weatherConflict(ref, weatherDays)).toBe(true)
  })
  it('claimed rain, precipitation present ANYWHERE in the hour±1 window → no conflict', () => {
    const weatherDays = { '2026-07-04': { '13': { precip: 0.4, code: 61 }, '14': { precip: 0, code: 3 }, '15': { precip: 0, code: 3 } } }
    const ref = { vision: { setting: 'outdoor', labels: ['rain'] }, capturedAt: HOUR(14) }
    expect(weatherConflict(ref, weatherDays)).toBe(false)
  })
  it('claimed sunny, observed rain code at that hour → conflict', () => {
    const weatherDays = { '2026-07-04': { '14': { precip: 0.5, code: 63 } } }
    const ref = { vision: { setting: 'outdoor', labels: ['sunny day'] }, capturedAt: HOUR(14) }
    expect(weatherConflict(ref, weatherDays)).toBe(true)
  })
  it('claimed sunny, observed clear (0) or partly-cloudy (2) → no conflict', () => {
    const ref = { vision: { setting: 'outdoor', labels: ['sunny day'] }, capturedAt: HOUR(14) }
    expect(weatherConflict(ref, { '2026-07-04': { '14': { precip: 0, code: 0 } } })).toBe(false)
    expect(weatherConflict(ref, { '2026-07-04': { '14': { precip: 0, code: 2 } } })).toBe(false)
  })
  it('claimed snow, observed non-snow code → conflict; matching snow code → no conflict', () => {
    const ref = { vision: { setting: 'outdoor', labels: ['snow'] }, capturedAt: HOUR(14) }
    expect(weatherConflict(ref, { '2026-07-04': { '14': { precip: 0, code: 0 } } })).toBe(true)
    expect(weatherConflict(ref, { '2026-07-04': { '14': { precip: 0, code: 71 } } })).toBe(false)
  })
  it('no claim (e.g. indoor, or no matching label) → never a conflict, even with contradicting data', () => {
    const weatherDays = { '2026-07-04': { '14': { precip: 5, code: 65 } } }
    expect(weatherConflict({ vision: { setting: 'outdoor', labels: ['beach'] }, capturedAt: HOUR(14) }, weatherDays)).toBe(false)
    expect(weatherConflict({ vision: { setting: 'indoor', labels: ['rain'] }, capturedAt: HOUR(14) }, weatherDays)).toBe(false)
  })
  it('a claim but NO cached data for that hour → abstain (never fabricate a conflict from silence)', () => {
    const ref = { vision: { setting: 'outdoor', labels: ['sunny day'] }, capturedAt: HOUR(14) }
    expect(weatherConflict(ref, {})).toBe(false)
    expect(weatherConflict(ref, undefined)).toBe(false)
    expect(weatherConflict(ref, { '2026-07-04': {} })).toBe(false)
  })
  it('a rain claim crossing a UTC date boundary still checks the true adjacent hour (23:00 → next day 00:00)', () => {
    const weatherDays = { '2026-07-04': { '23': { precip: 0, code: 3 } }, '2026-07-05': { '00': { precip: 0.3, code: 61 } } }
    const ref = { vision: { setting: 'outdoor', labels: ['rain'] }, capturedAt: '2026-07-04T23:00:00.000Z' }
    expect(weatherConflict(ref, weatherDays)).toBe(false) // the 00:00-next-day entry in the window has precip
  })
  it('a bad capturedAt → abstain, never throws', () => {
    expect(weatherConflict({ vision: { setting: 'outdoor', labels: ['rain'] }, capturedAt: 'garbage' }, {})).toBe(false)
  })
})
