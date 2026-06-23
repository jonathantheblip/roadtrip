// "Real conditions" (slice 7) — the pure conditions helpers + the /conditions
// proxy's contract. Non-vacuous: each check fails if the rule it guards breaks —
//   - WMO codes map to the right coarse `kind` the re-rank keys off;
//   - tide is derived from the marine series (next high/low + rising/falling),
//     and is NULL inland (all-null sea level) — the "no tide in Chicago" hinge;
//   - the route validates lat/lng and degrades (weather/tide → null), never 500s.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import worker from '../src/index.js'
import { seedSession } from './helpers/auth.js'
import { applySchema } from './helpers/schema.js'
import { describeCode, normalizeForecast, deriveTide, buildConditions } from '../src/conditions.js'

const TOK = 'tok-jonathan'
beforeEach(async () => {
  await applySchema(env.DB)
  await seedSession(env.DB, TOK, 'jonathan')
})

// A trimmed real Open-Meteo forecast payload (Newport RI, overcast/rainy day).
const FORECAST = {
  utc_offset_seconds: -14400,
  current: { temperature_2m: 66.4, weather_code: 3, precipitation: 0, wind_speed_10m: 14.7 },
  daily: {
    time: ['2026-06-22'],
    weather_code: [63],
    temperature_2m_max: [73.5],
    temperature_2m_min: [60.3],
    precipitation_probability_max: [80],
    sunrise: ['2026-06-22T05:12'],
    sunset: ['2026-06-22T20:24'],
  },
}

describe('describeCode — WMO → kind', () => {
  it('maps the codes the re-rank cares about', () => {
    expect(describeCode(0).kind).toBe('clear')
    expect(describeCode(3).kind).toBe('cloud')
    expect(describeCode(63).kind).toBe('rain')
    expect(describeCode(80).kind).toBe('rain')
    expect(describeCode(71).kind).toBe('snow')
    expect(describeCode(95).kind).toBe('storm')
    expect(describeCode(45).kind).toBe('fog')
    expect(describeCode(12345)).toMatchObject({ kind: 'cloud' }) // unknown → safe default
  })
})

describe('normalizeForecast', () => {
  it('pulls current + today from the payload', () => {
    const w = normalizeForecast(FORECAST)
    expect(w).toMatchObject({ tempF: 66, code: 3, kind: 'cloud', hiF: 74, loF: 60, precipProbPct: 80 })
    expect(w.label).toBe('Overcast')
  })
  it('returns null on an unusable payload', () => {
    expect(normalizeForecast({})).toBeNull()
    expect(normalizeForecast({ current: {} })).toBeNull()
  })
})

describe('deriveTide', () => {
  // A full cycle — rise → PEAK at 20:00 → fall → TROUGH at 22:00 → rise. UTC so
  // local == UTC. Both a real high AND a real low turning point sit in the window.
  const marine = {
    utc_offset_seconds: 0,
    current: { sea_level_height_msl: 0.3 },
    hourly: {
      time: ['2026-06-22T18:00', '2026-06-22T19:00', '2026-06-22T20:00', '2026-06-22T21:00', '2026-06-22T22:00', '2026-06-22T23:00'],
      sea_level_height_msl: [0.1, 0.3, 0.5, 0.4, 0.2, 0.4],
    },
  }

  it('finds the next turning point and the rising/falling state', () => {
    const t = deriveTide(marine, Date.parse('2026-06-22T18:30:00Z'))
    expect(t.state).toBe('rising')
    expect(t.next.type).toBe('high')
    expect(t.next.at).toBe('2026-06-22T20:00') // the peak
  })

  it('after the peak it reads falling → next low', () => {
    const t = deriveTide(marine, Date.parse('2026-06-22T20:30:00Z'))
    expect(t.state).toBe('falling')
    expect(t.next.type).toBe('low')
  })

  it('is NULL when now is past the whole window (never reports a PAST tide as next)', () => {
    const t = deriveTide(marine, Date.parse('2026-06-23T06:00:00Z')) // a day after the series ends
    expect(t).toBeNull()
  })

  it('is NULL for a monotonic window with no real turning point (no fabricated extremum)', () => {
    const rising = {
      utc_offset_seconds: 0,
      current: { sea_level_height_msl: 0.2 },
      hourly: {
        time: ['2026-06-22T18:00', '2026-06-22T19:00', '2026-06-22T20:00', '2026-06-22T21:00'],
        sea_level_height_msl: [0.1, 0.2, 0.3, 0.4], // only ever rising → no peak in range
      },
    }
    expect(deriveTide(rising, Date.parse('2026-06-22T18:30:00Z'))).toBeNull()
  })

  it('is NULL inland (all sea-level values null) — the no-tide-in-Chicago hinge', () => {
    const inland = {
      utc_offset_seconds: -18000,
      current: { sea_level_height_msl: null },
      hourly: { time: ['2026-06-22T18:00', '2026-06-22T19:00'], sea_level_height_msl: [null, null] },
    }
    expect(deriveTide(inland, Date.now())).toBeNull()
  })
})

describe('buildConditions — independent degrade', () => {
  it('weather present, tide absent (no marine) → just weather', () => {
    const c = buildConditions(FORECAST, null, Date.now())
    expect(c.weather.kind).toBe('cloud')
    expect(c.tide).toBeNull()
  })
  it('no forecast → weather null (the tray simply won\'t re-rank)', () => {
    const c = buildConditions(null, null, Date.now())
    expect(c.weather).toBeNull()
    expect(c.tide).toBeNull()
  })
})

async function call(body, { token = TOK } = {}) {
  const headers = { Origin: 'http://localhost:5173', 'content-type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const req = new Request('https://worker.test/conditions', { method: 'POST', headers, body: JSON.stringify(body) })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

describe('/conditions route', () => {
  it('rejects a body with no lat/lng (400)', async () => {
    const res = await call({})
    expect(res.status).toBe(400)
  })

  it('is auth-gated (401 without a session)', async () => {
    const res = await call({ lat: 41.49, lng: -71.31 }, { token: null })
    expect(res.status).toBe(401)
  })

  it('degrades to weather:null (200, not 500) when the upstream is unreachable', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    try {
      const res = await call({ lat: 41.49, lng: -71.31 })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.weather).toBeNull()
      expect(data.tide).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })
})
