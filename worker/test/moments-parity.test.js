// PARITY: worker/src/sessions.js buildMoments mirrors app/src/lib/sessions.js. The
// multi-dimensional grouping runs in BOTH the worker referee and the client; if they
// disagreed, the worker could form a moment the client wouldn't. One shared multi-dim
// corpus; the FULL moment output must be deep-equal.

import { describe, it, expect } from 'vitest'
import { buildMoments as clientBuild, MOMENT_DEFAULTS as clientDefaults } from '../../app/src/lib/sessions.js'
import { buildMoments as workerBuild, MOMENT_DEFAULTS as workerDefaults } from '../src/sessions.js'

const M = 60_000
const p = (id, min, extra = {}) => ({ id, memoryId: id, at: min * M, ...extra })

const CORPUS = [
  {
    name: 'time-only burst + split',
    points: [p('a', 0), p('b', 20), p('c', 70)],
    expect: [2, 1],
  },
  {
    name: 'scene bridges a gap',
    points: [p('a', 0, { scene: 'ffffffffffffffff' }), p('b', 60, { scene: 'ffffffffffffffef' })],
    expect: [2],
  },
  {
    name: 'scene+faces split within the time bond',
    points: [p('a', 0, { scene: '0000000000000000', faces: ['mom'] }), p('b', 5, { scene: 'ffffffffffffffff', faces: ['dog'] })],
    expect: [1, 1],
  },
  {
    name: 'gps split within the time bond',
    points: [p('a', 0, { lat: 42.0, lng: -71.0 }), p('b', 5, { lat: 42.02, lng: -71.0 })],
    expect: [1, 1],
  },
  {
    name: 'mixed multi-dimensional day',
    points: [
      p('a', 0, { lat: 42.0621, lng: -70.1633, scene: 'ffffffffffffffff', faces: ['mom', 'kid'] }),
      p('b', 4, { lat: 42.0622, lng: -70.1634, scene: 'ffffffffffffffef', faces: ['mom', 'kid'] }),
      p('c', 65, { faces: ['mom', 'kid'] }),
      p('d', 200, { scene: '0000000000000000' }),
    ],
    expect: null, // shape not pinned here; parity is the point
  },
  // ── coverage gap closed alongside BUILD 3 (§16): no existing fixture tested a pure
  // GPS-only bridge across a time gap (only GPS-triggered SPLITS and post-hoc GPS
  // inheritance were tested). ~44m apart, 70m > gapMinutes(40) but within
  // bridgeGapMinutes(90) — matches the plan's own "≈140m + ≤90min" GPS-bridge precedent.
  {
    name: 'GPS alone bridges a time gap (the missing pure-GPS-bridge coverage gap)',
    points: [p('a', 0, { lat: 42.0, lng: -71.0 }), p('b', 70, { lat: 42.0004, lng: -71.0 })],
    expect: [2],
  },
  // ── BUILD 3 (§16) vision place-type bridging — bridge-branch-ONLY, GPS-absence-gated,
  // catch-all-excluded, never able to trigger a split.
  {
    name: 'vision bridges a gap when GPS is absent and placeType matches',
    points: [p('a', 0, { placeType: 'beach' }), p('b', 60, { placeType: 'beach' })],
    expect: [2],
  },
  {
    name: 'vision does NOT bridge when GPS is present on BOTH sides — GPS decides, full stop',
    points: [
      p('a', 0, { lat: 42.0, lng: -71.0, placeType: 'shop' }),
      p('b', 60, { lat: 42.02, lng: -71.0, placeType: 'shop' }), // ~2.2km — GPS itself refuses to bridge
    ],
    expect: [1, 1],
  },
  {
    name: 'vision does NOT bridge on catch-all placeType values (indoor-other/outdoor-other never match)',
    points: [p('a', 0, { placeType: 'outdoor-other' }), p('b', 60, { placeType: 'outdoor-other' })],
    expect: [1, 1],
  },
  {
    name: 'vision does NOT bridge on a placeType MISMATCH',
    points: [p('a', 0, { placeType: 'beach' }), p('b', 60, { placeType: 'street' })],
    expect: [1, 1],
  },
  {
    name: 'vision can never SPLIT a time-bonded pair, even on a confident placeType mismatch',
    points: [p('a', 0, { placeType: 'beach' }), p('b', 5, { placeType: 'street' })], // 5m: well within gapMinutes(40)
    expect: [2], // time bonds them; vision is structurally absent from the split branch
  },
]

describe('buildMoments parity (worker mirror ≡ client)', () => {
  it('MOMENT_DEFAULTS match', () => {
    expect(workerDefaults).toEqual(clientDefaults)
  })

  for (const c of CORPUS) {
    it(`deep-equal: ${c.name}`, () => {
      const a = clientBuild(c.points)
      const b = workerBuild(c.points)
      expect(b).toEqual(a)
      if (c.expect) expect(a.map((m) => m.count)).toEqual(c.expect)
    })
  }

  // BUILD 3 (§16) — the vision bridge's own signals, checked precisely (not just count),
  // in BOTH mirrors, so the tier-discipline / provenance contract is parity-gated too.
  describe('vision bridge signals (visionBridged flag + dims)', () => {
    for (const [label, build] of [['client', clientBuild], ['worker', workerBuild]]) {
      it(`${label}: visionBridged is true ONLY on the moment the bridge actually formed`, () => {
        const [m] = build([p('a', 0, { placeType: 'beach' }), p('b', 60, { placeType: 'beach' })])
        expect(m.count).toBe(2)
        expect(m.visionBridged).toBe(true)
        expect(m.dims).toContain('placeType')
      })

      it(`${label}: visionBridged is false when the pair joins WITHOUT vision (plain time bond)`, () => {
        const [m] = build([p('a', 0), p('b', 5)])
        expect(m.visionBridged).toBe(false)
      })

      it(`${label}: visionBridged is false when GPS alone already bridges (vision wasn't the deciding factor)`, () => {
        const [m] = build([p('a', 0, { lat: 42.0, lng: -71.0 }), p('b', 70, { lat: 42.0004, lng: -71.0 })])
        expect(m.count).toBe(2)
        expect(m.visionBridged).toBe(false)
      })

      it(`${label}: a catch-all placeType is excluded from dims (not a meaningful signal)`, () => {
        const [m] = build([p('a', 0, { placeType: 'outdoor-other' })])
        expect(m.dims).not.toContain('placeType')
      })
    }
  })
})
