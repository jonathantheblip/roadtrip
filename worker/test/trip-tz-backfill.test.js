// backfillTripTimezones against REAL test D1 with an injected `fetchTz` (no
// real network call) — the trip-timezone derivation pass (Build 2,
// FAMILY_TRIPS_VISION §14). Verifies it geocodes stayPlaceCoords via the
// injected fetcher, is idempotent, skips a trip with no resolvable stay
// coords (honest abstention, never a guessed default), skips volleyball-2026,
// honors the off/shadow/on `mode` contract + the geocode limit, and NEVER
// bumps updated_at. trip.tz is family-visible (photoEntries.js's album
// day-attribution + time labels) — so, unlike scene/vision, this backfill
// must NEVER write for real except under mode==='on'.

import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import { backfillTripTimezones, timezoneUrl, photoTzMode } from '../src/tripTzBackfill.js'

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

describe('backfillTripTimezones', () => {
  it('mode:"on" geocodes a trip with resolvable stay coords, writes tz + tzSource:"geocoded"', async () => {
    await seedTrip('t1', { lodging: { lat: 42.0621405, lng: -70.1633884, name: 'Provincetown Airbnb' } })
    const fetchTz = async () => 'America/New_York'
    const s = await backfillTripTimezones(env, { fetchTz, mode: 'on' })
    expect(s.geocoded).toBe(1)
    expect(s.wrote).toBe(1)
    const { trip } = await tripRow('t1')
    expect(trip.tz).toBe('America/New_York')
    expect(trip.tzSource).toBe('geocoded')
  })

  it('is idempotent — a trip that already carries tz is skipped, fetchTz never called (mode irrelevant here)', async () => {
    await seedTrip('t1', { tz: 'Europe/Rome', tzSource: 'ai-leg', lodging: { lat: 41.9, lng: 12.5 } })
    let called = false
    const fetchTz = async () => { called = true; return 'America/New_York' }
    const s = await backfillTripTimezones(env, { fetchTz, mode: 'on' })
    expect(s.alreadyHad).toBe(1)
    expect(called).toBe(false)
    const { trip } = await tripRow('t1')
    expect(trip.tz).toBe('Europe/Rome') // untouched — never overwrites an existing tz
  })

  it('skips a trip with NO resolvable stay coords — honest abstention, never a guessed default', async () => {
    await seedTrip('t1', { lodging: { name: 'no coords here' } })
    const fetchTz = async () => 'America/New_York'
    const s = await backfillTripTimezones(env, { fetchTz, mode: 'on' })
    expect(s.noCoords).toBe(1)
    const { trip } = await tripRow('t1')
    expect(trip.tz).toBeUndefined()
  })

  it('skips volleyball-2026 entirely even though it has resolvable homeBase coords', async () => {
    await seedTrip('volleyball-2026', { homeBase: { lat: 41.3225, lng: -72.0943, label: 'New London, CT' } })
    let called = false
    const fetchTz = async () => { called = true; return 'America/New_York' }
    const s = await backfillTripTimezones(env, { fetchTz, mode: 'on' })
    expect(s.skippedFixture).toBe(1)
    expect(called).toBe(false)
    const { trip } = await tripRow('volleyball-2026')
    expect(trip.tz).toBeUndefined()
  })

  it('a failed geocode (fetchTz returns null) leaves the trip untouched, retriable next run', async () => {
    await seedTrip('t1', { lodging: { lat: 42.06, lng: -70.16 } })
    const fetchTz = async () => null
    const s = await backfillTripTimezones(env, { fetchTz, mode: 'on' })
    expect(s.failed).toBe(1)
    expect(s.wrote).toBe(0)
    const { trip } = await tripRow('t1')
    expect(trip.tz).toBeUndefined()
  })

  it('respects the geocode limit and reports hitLimit (bounded, resumable)', async () => {
    await seedTrip('t1', { lodging: { lat: 42.06, lng: -70.16 } })
    await seedTrip('t2', { lodging: { lat: 40.75, lng: -73.98 } })
    let calls = 0
    const fetchTz = async () => { calls++; return 'America/New_York' }
    const s = await backfillTripTimezones(env, { fetchTz, mode: 'on', limit: 1 })
    expect(calls).toBe(1)
    expect(s.geocoded).toBe(1)
    expect(s.hitLimit).toBe(true)
  })

  // THE SHADOW CONTRACT (Build 2 fix — trip.tz is family-visible via
  // photoEntries.js's album day-attribution, so this must be a true DB no-op
  // whenever mode isn't 'on').
  it('mode:"shadow" geocodes (reports real coverage) but writes NOTHING', async () => {
    await seedTrip('t1', { lodging: { lat: 42.06, lng: -70.16 } })
    const fetchTz = async () => 'America/New_York'
    const s = await backfillTripTimezones(env, { fetchTz, mode: 'shadow' })
    expect(s.geocoded).toBe(1)
    expect(s.wrote).toBe(0)
    const { trip } = await tripRow('t1')
    expect(trip.tz).toBeUndefined()
  })

  it('mode omitted entirely (the fail-safe default) also writes NOTHING — never assume "on"', async () => {
    await seedTrip('t1', { lodging: { lat: 42.06, lng: -70.16 } })
    const fetchTz = async () => 'America/New_York'
    const s = await backfillTripTimezones(env, { fetchTz })
    expect(s.geocoded).toBe(1)
    expect(s.wrote).toBe(0)
    const { trip } = await tripRow('t1')
    expect(trip.tz).toBeUndefined()
  })

  it('an unrecognized mode value also writes NOTHING (fail safe, same posture as photoHealMode)', async () => {
    await seedTrip('t1', { lodging: { lat: 42.06, lng: -70.16 } })
    const fetchTz = async () => 'America/New_York'
    const s = await backfillTripTimezones(env, { fetchTz, mode: 'bogus' })
    expect(s.geocoded).toBe(1)
    expect(s.wrote).toBe(0)
    const { trip } = await tripRow('t1')
    expect(trip.tz).toBeUndefined()
  })

  it('never bumps updated_at (a worker enrichment, not a family edit)', async () => {
    await seedTrip('t1', { lodging: { lat: 42.06, lng: -70.16 } }, 777)
    await backfillTripTimezones(env, { fetchTz: async () => 'America/New_York', mode: 'on' })
    expect((await tripRow('t1')).updated_at).toBe(777)
  })

  it('timezoneUrl requests Open-Meteo forecast with timezone=auto (the response.timezone field is what we read)', () => {
    const url = timezoneUrl(42.0621405, -70.1633884)
    expect(url).toContain('api.open-meteo.com/v1/forecast')
    expect(url).toContain('timezone=auto')
    expect(url).toContain('latitude=42.0621405')
    expect(url).toContain('longitude=-70.1633884')
  })
})

describe('photoTzMode — the W0 per-lever knob (defaults to inheriting the caller-resolved global mode)', () => {
  it('its OWN var wins when recognized', () => {
    expect(photoTzMode({ PHOTO_TZ_MODE: 'on' }, 'shadow')).toBe('on')
  })
  it('falls back to the caller-supplied global mode when unset', () => {
    expect(photoTzMode({}, 'shadow')).toBe('shadow')
  })
  it('an unrecognized own-var value falls back to the global mode too', () => {
    expect(photoTzMode({ PHOTO_TZ_MODE: 'bogus' }, 'on')).toBe('on')
  })
  it('an unrecognized fallback defaults all the way to off (fail safe)', () => {
    expect(photoTzMode({}, 'bogus')).toBe('off')
    expect(photoTzMode({}, undefined)).toBe('off')
  })
})
