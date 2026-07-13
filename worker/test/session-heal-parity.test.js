// PARITY: worker/src/sessionHeal.js (buildTripDecisions) mirrors
// app/src/lib/sessionHeal.js — BUILD_PLAN_WITNESS_FLEET_2.md calls this "the
// most mirror-touching build in this plan." One shared corpus, run through
// BOTH copies; full decision output must be deep-equal. Also proves the D14
// dual-naming normalizer (worker snake_case epoch-ms vs. client camelCase
// ISO-string createdAt) produces IDENTICAL behavior on both shapes — the
// plumbing-fix requirement stated explicitly in the plan.

import { describe, it, expect } from 'vitest'
import { buildTripDecisions as workerBuild } from '../src/sessionHeal.js'
import { buildTripDecisions as clientBuild } from '../../app/src/lib/sessionHeal.js'

const trip = () => ({
  id: 't1',
  shape: 'route',
  days: [
    {
      n: 1,
      isoDate: '2026-07-01',
      stops: [{ id: 's-a', title: 'The museum', time: '10:00 AM', lat: 30.0, lng: -90.0 }],
    },
  ],
})

describe('buildTripDecisions parity (worker mirror ≡ client)', () => {
  it('a reference-tier GPS burst: identical AUTO decision on both sides', () => {
    const memories = [
      {
        id: 'm1',
        author: 'jonathan',
        created_at: 1,
        photos: [
          { key: 'k1', capturedAt: '2026-07-01T10:05:00.000Z', offsetMinutes: 0, lat: 30.0, lng: -90.0, prov: { gps: 'exif' } },
        ],
      },
    ]
    const a = workerBuild(trip(), memories)
    const b = clientBuild(trip(), memories)
    expect(b).toEqual(a)
    expect(a[0].decisions[0].tier).toBe('auto')
  })

  it('a non-reference GPS burst: identical CONFIRM demotion on both sides (item 4)', () => {
    const memories = [
      {
        id: 'm1',
        author: 'jonathan',
        created_at: 1,
        photos: [{ key: 'k1', capturedAt: '2026-07-01T10:05:00.000Z', offsetMinutes: 0, lat: 30.0, lng: -90.0 }],
      },
    ]
    const a = workerBuild(trip(), memories)
    const b = clientBuild(trip(), memories)
    expect(b).toEqual(a)
    expect(a[0].decisions[0].tier).toBe('confirm')
  })

  it('D14 dual-naming: a WORKER-shaped row (snake_case epoch-ms created_at) and a CLIENT-shaped memory (camelCase ISO createdAt) behave identically for a dateless ref', () => {
    const workerRow = {
      id: 'm1',
      author_traveler: 'jonathan',
      created_at: Date.parse('2026-07-01T12:00:00.000Z'),
      photo_r2_keys_json: JSON.stringify([{ key: 'k1' }]),
    }
    const clientMemory = {
      id: 'm1',
      author: 'jonathan',
      createdAt: '2026-07-01T12:00:00.000Z',
      photos: [{ key: 'k1' }],
    }
    const fromWorkerShape = workerBuild(trip(), [workerRow])
    const fromClientShape = workerBuild(trip(), [clientMemory])
    expect(fromWorkerShape).toEqual(fromClientShape)
    expect(fromWorkerShape[0].decisions.length).toBe(1)
    expect(fromWorkerShape[0].decisions[0].tier).not.toBe('auto')
    expect(fromWorkerShape[0].decisions[0].signals.timeAnchorSuspect).toBe(true)

    // and the CLIENT copy agrees with the WORKER copy on the same client-shaped input
    const clientSide = clientBuild(trip(), [clientMemory])
    expect(clientSide).toEqual(fromClientShape)
  })

  it('a dateless ref OUTSIDE the trip window abstains identically on both sides', () => {
    const memories = [
      { id: 'm1', author: 'jonathan', created_at: Date.parse('2026-09-15T12:00:00.000Z'), photos: [{ key: 'k1' }] },
    ]
    const a = workerBuild(trip(), memories)
    const b = clientBuild(trip(), memories)
    expect(b).toEqual(a)
    expect(a.length).toBe(0)
  })

  it('a passenger (screenshot-like) ref: identical GPS-withholding on both sides (item 3)', () => {
    const memories = [
      {
        id: 'm1',
        author: 'jonathan',
        created_at: 1,
        photos: [
          { key: 'k1', capturedAt: '2026-07-01T10:05:00.000Z', offsetMinutes: 0, lat: 30.0, lng: -90.0, prov: { gps: 'exif' }, srcName: 'IMG_0001.HEIC', meta: { make: 'Apple' } },
          { key: 'k2', capturedAt: '2026-07-01T10:09:00.000Z', offsetMinutes: 0, lat: 41.0, lng: -71.0, prov: { gps: 'exif' }, srcName: 'IMG_0002.PNG' },
        ],
      },
    ]
    const a = workerBuild(trip(), memories)
    const b = clientBuild(trip(), memories)
    expect(b).toEqual(a)
    expect(a[0].decisions.length).toBe(1)
    expect(a[0].decisions[0].place.id).toBe('s-a')
    expect(a[0].decisions[0].signals.referenceLocatedCount).toBe(1)
  })
})
