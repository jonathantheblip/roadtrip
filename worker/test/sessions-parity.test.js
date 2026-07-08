// PARITY: worker/src/sessions.js mirrors app/src/lib/sessions.js. The v2 engine
// runs in the worker (the single referee) AND the client; if the two session
// builders ever disagree, the worker could locate/inherit a burst the client
// wouldn't — the same drift risk the photoMatch parity test guards. Both copies
// run one shared corpus; their FULL session output must be deep-equal.
//
// NON-VACUOUS: the corpus exercises every branch — a single burst, a gap-split,
// a no-GPS (time-only) session, single-photo GPS inheritance, a tight multi-GPS
// centroid, and a far-apart burst that SPLITS (never fabricates a centroid).
// The expectations pin the located/split outcome so both can't be identically
// wrong about which branch ran.

import { describe, it, expect } from 'vitest'
import { buildSessions as clientBuild, SESSION_DEFAULTS as clientDefaults } from '../../app/src/lib/sessions.js'
import { buildSessions as workerBuild, SESSION_DEFAULTS as workerDefaults } from '../src/sessions.js'

const M = 60_000
const p = (id, min, extra = {}) => ({ id, memoryId: id, at: min * M, ...extra })

const CORPUS = [
  {
    name: 'one burst, no gps',
    points: [p('a', 0), p('b', 5), p('c', 12)],
    expect: [{ count: 3, located: false, split: false }],
  },
  {
    name: 'gap split at 40m',
    points: [p('a', 0), p('b', 10), p('c', 60), p('d', 65)],
    expect: [
      { count: 2, located: false, split: false },
      { count: 2, located: false, split: false },
    ],
  },
  {
    name: 'single-photo gps inheritance anchors the moment',
    points: [p('a', 0), p('b', 5, { lat: 41.1772, lng: -73.1859 }), p('c', 8), p('d', 12)],
    expect: [{ count: 4, located: true, split: false, locatedCount: 1 }],
  },
  {
    name: 'tight multi-gps centroid',
    points: [p('a', 0, { lat: 42.0621, lng: -70.1633 }), p('b', 3, { lat: 42.0623, lng: -70.1635 })],
    expect: [{ count: 2, located: true, split: false }],
  },
  {
    name: 'far-apart burst splits, no fabricated centroid',
    points: [p('a', 0, { lat: 42.0621, lng: -70.1633 }), p('b', 20, { lat: 42.3554, lng: -71.0656 })],
    expect: [{ count: 2, located: false, split: true }],
  },
  {
    name: 'scene-consistent burst (composition dimension agrees)',
    points: [p('a', 0, { scene: 'ffffffffffffffff' }), p('b', 3, { scene: 'ffffffffffffffef' })],
    expect: [{ count: 2, located: false, sceneConsistent: true }],
  },
  {
    name: 'scene-divergent burst flagged (two backgrounds in one time-window)',
    points: [p('a', 0, { scene: '0000000000000000' }), p('b', 3, { scene: 'ffffffffffffffff' })],
    expect: [{ count: 2, located: false, sceneConsistent: false }],
  },
]

describe('sessions parity (worker mirror ≡ client)', () => {
  it('SESSION_DEFAULTS match', () => {
    expect(workerDefaults).toEqual(clientDefaults)
  })

  for (const c of CORPUS) {
    it(`deep-equal + expected branch: ${c.name}`, () => {
      const a = clientBuild(c.points)
      const b = workerBuild(c.points)
      expect(b).toEqual(a) // the parity assertion
      // non-vacuous anchor: the outcome each branch should produce
      expect(a.length).toBe(c.expect.length)
      a.forEach((s, i) => {
        for (const [k, v] of Object.entries(c.expect[i])) expect(s[k]).toBe(v)
      })
    })
  }
})
