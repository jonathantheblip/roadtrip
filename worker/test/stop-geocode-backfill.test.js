// backfillStopGeocodes against real test D1 (Build 4a) — the address→
// coordinates backfill for agenda stops. Verifies the mode gate, the
// never-overwrite-existing-coords rule, the geoFor-matches idempotency
// guard, the transit-leg exclusion, the miss sentinel, bounding, and the
// no-updated_at-bump write discipline. `photoStopGeocodeMode`'s per-lever
// fallback behavior is covered separately (pure, no D1 needed).
import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import { backfillStopGeocodes, photoStopGeocodeMode } from '../src/stopGeocodeBackfill.js'

async function seedTrip(id, days, updated_at = 100) {
  await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?,?,?)')
    .bind(id, JSON.stringify({ id, days }), updated_at)
    .run()
}
async function tripRow(id) {
  const r = await env.DB.prepare('SELECT data_json, updated_at FROM trips WHERE id=?').bind(id).first()
  return { trip: JSON.parse(r.data_json), updated_at: r.updated_at }
}

const HIT = async () => ({ lat: 42.85, lng: -72.56, name: 'Snow Republic', address: '100 Main St, Brattleboro, VT' })
const MISS = async () => null

beforeEach(async () => {
  await applySchema(env.DB)
  await env.DB.prepare('DELETE FROM trips').run()
})

describe('backfillStopGeocodes', () => {
  it('mode:"on" + a hit: writes lat/lng + geoFor onto the stop', async () => {
    await seedTrip('t1', [{ stops: [{ id: 's1', address: '100 Main St, Brattleboro, VT' }] }])
    const s = await backfillStopGeocodes(env, { mode: 'on', geocode: HIT })
    expect(s.geocoded).toBe(1)
    expect(s.tripsWritten).toBe(1)
    const { trip } = await tripRow('t1')
    expect(trip.days[0].stops[0].lat).toBe(42.85)
    expect(trip.days[0].stops[0].lng).toBe(-72.56)
    expect(trip.days[0].stops[0].geoFor).toBe('100 Main St, Brattleboro, VT')
  })

  it('mode:"shadow" computes the would-write list but writes nothing', async () => {
    await seedTrip('t1', [{ stops: [{ id: 's1', address: '100 Main St' }] }])
    const s = await backfillStopGeocodes(env, { mode: 'shadow', geocode: HIT })
    expect(s.geocoded).toBe(1)
    expect(s.wouldWrite).toHaveLength(1)
    expect(s.wouldWrite[0]).toMatchObject({ tripId: 't1', stopId: 's1', lat: 42.85, lng: -72.56 })
    expect(s.tripsWritten).toBe(0)
    const { trip } = await tripRow('t1')
    expect(trip.days[0].stops[0].lat).toBeUndefined()
    expect(trip.days[0].stops[0].geoFor).toBeUndefined()
  })

  it('mode omitted / unrecognized also writes nothing (fail safe)', async () => {
    await seedTrip('t1', [{ stops: [{ id: 's1', address: '100 Main St' }] }])
    await backfillStopGeocodes(env, { geocode: HIT })
    expect((await tripRow('t1')).trip.days[0].stops[0].lat).toBeUndefined()
  })

  it('NEVER overwrites a stop that already has coords, regardless of source (manual-presumed, reference tier)', async () => {
    await seedTrip('t1', [{ stops: [{ id: 's1', address: '100 Main St', lat: 1, lng: 2 }] }])
    const s = await backfillStopGeocodes(env, { mode: 'on', geocode: HIT })
    expect(s.stopsScanned).toBe(0)
    const { trip } = await tripRow('t1')
    expect(trip.days[0].stops[0].lat).toBe(1)
    expect(trip.days[0].stops[0].lng).toBe(2)
  })

  it('a geocode MISS stamps geoFor only (never coords) — a negative/attempted marker', async () => {
    await seedTrip('t1', [{ stops: [{ id: 's1', address: 'nowhere, nowhere' }] }])
    const s = await backfillStopGeocodes(env, { mode: 'on', geocode: MISS })
    expect(s.noMatch).toBe(1)
    const { trip } = await tripRow('t1')
    expect(trip.days[0].stops[0].lat).toBeUndefined()
    expect(trip.days[0].stops[0].geoFor).toBe('nowhere, nowhere')
  })

  it('idempotent: a stop whose geoFor already matches its current address is skipped (no re-billing a stale miss)', async () => {
    await seedTrip('t1', [{ stops: [{ id: 's1', address: 'nowhere, nowhere', geoFor: 'nowhere, nowhere' }] }])
    const s = await backfillStopGeocodes(env, { mode: 'on', geocode: HIT })
    expect(s.stopsScanned).toBe(0)
  })

  it('an EDITED address (geoFor stale) is retried even though geoFor is set', async () => {
    await seedTrip('t1', [{ stops: [{ id: 's1', address: '100 Main St, Brattleboro, VT', geoFor: 'old address' }] }])
    const s = await backfillStopGeocodes(env, { mode: 'on', geocode: HIT })
    expect(s.geocoded).toBe(1)
    expect((await tripRow('t1')).trip.days[0].stops[0].geoFor).toBe('100 Main St, Brattleboro, VT')
  })

  it('a transit/drive leg is excluded — never geocoded, never pinned', async () => {
    await seedTrip('t1', [{ stops: [{ id: 's1', kind: 'drive', address: 'Drive Home to Belmont' }] }])
    const s = await backfillStopGeocodes(env, { mode: 'on', geocode: HIT })
    expect(s.stopsScanned).toBe(0)
    expect((await tripRow('t1')).trip.days[0].stops[0].lat).toBeUndefined()
  })

  it('kind:"transit" is excluded too — the REAL live kind value for "Drive Home to Belmont" (not "drive")', async () => {
    await seedTrip('t1', [{ stops: [{ id: 's1', kind: 'transit', address: 'Belmont, MA' }] }])
    const s = await backfillStopGeocodes(env, { mode: 'on', geocode: HIT })
    expect(s.stopsScanned).toBe(0)
    expect((await tripRow('t1')).trip.days[0].stops[0].lat).toBeUndefined()
  })

  it('kind:"logistics" is NOT excluded — may carry the only address a stay has (e.g. an Airbnb checkout)', async () => {
    await seedTrip('t1', [{ stops: [{ id: 's1', kind: 'logistics', address: '100 Main St, Brattleboro, VT' }] }])
    const s = await backfillStopGeocodes(env, { mode: 'on', geocode: HIT })
    expect(s.geocoded).toBe(1)
  })

  it('a stop with no address is skipped', async () => {
    await seedTrip('t1', [{ stops: [{ id: 's1' }] }])
    const s = await backfillStopGeocodes(env, { mode: 'on', geocode: HIT })
    expect(s.stopsScanned).toBe(0)
  })

  it('respects the limit and reports hitLimit (bounded, resumable)', async () => {
    await seedTrip('t1', [{ stops: [
      { id: 's1', address: 'addr 1' },
      { id: 's2', address: 'addr 2' },
      { id: 's3', address: 'addr 3' },
    ] }])
    const s = await backfillStopGeocodes(env, { mode: 'on', limit: 2, geocode: HIT })
    expect(s.geocoded).toBe(2)
    expect(s.hitLimit).toBe(true)
  })

  it('never bumps updated_at (a computed enrichment, not a family edit)', async () => {
    await seedTrip('t1', [{ stops: [{ id: 's1', address: '100 Main St' }] }], 555)
    await backfillStopGeocodes(env, { mode: 'on', geocode: HIT })
    expect((await tripRow('t1')).updated_at).toBe(555)
  })

  it('skips volleyball-2026 entirely (confirmed fixture data)', async () => {
    await seedTrip('volleyball-2026', [{ stops: [{ id: 's1', address: '100 Main St' }] }])
    const s = await backfillStopGeocodes(env, { mode: 'on', geocode: HIT })
    expect(s.tripsConsidered).toBe(0)
    expect((await tripRow('volleyball-2026')).trip.days[0].stops[0].lat).toBeUndefined()
  })

  it('a geocode() throw is caught and treated as a miss, never crashes the sweep', async () => {
    await seedTrip('t1', [{ stops: [{ id: 's1', address: '100 Main St' }] }])
    const s = await backfillStopGeocodes(env, { mode: 'on', geocode: async () => { throw new Error('places 500') } })
    expect(s.noMatch).toBe(1)
    expect((await tripRow('t1')).trip.days[0].stops[0].lat).toBeUndefined()
  })
})

describe('photoStopGeocodeMode — the per-lever knob (defaults to inheriting the caller-resolved global mode)', () => {
  it('its OWN var wins when recognized', () => {
    expect(photoStopGeocodeMode({ PHOTO_STOP_GEOCODE_MODE: 'on' }, 'shadow')).toBe('on')
  })
  it('falls back to the caller-supplied global mode when unset', () => {
    expect(photoStopGeocodeMode({}, 'shadow')).toBe('shadow')
  })
  it('an unrecognized own-var value falls back to the global mode too', () => {
    expect(photoStopGeocodeMode({ PHOTO_STOP_GEOCODE_MODE: 'bogus' }, 'on')).toBe('on')
  })
  it('an unrecognized fallback defaults all the way to off (fail safe)', () => {
    expect(photoStopGeocodeMode({}, 'bogus')).toBe('off')
    expect(photoStopGeocodeMode({}, undefined)).toBe('off')
  })
})
