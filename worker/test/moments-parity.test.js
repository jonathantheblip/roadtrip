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
})
