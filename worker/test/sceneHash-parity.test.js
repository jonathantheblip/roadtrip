// PARITY: worker/src/sceneHash.js mirrors app/src/lib/sceneHash.js. The scene
// signature is computed at import (client) AND recomputed for the archive backfill
// (worker), and the engine compares signatures on both sides — if the two hashers
// disagreed, the worker referee could call two photos the same scene the client
// would not. Both copies run one shared corpus; their hashes + distances must match.

import { describe, it, expect } from 'vitest'
import {
  sceneHashFromGray as cHash,
  sceneDistance as cDist,
  SCENE_DEFAULTS as cDefaults,
} from '../../app/src/lib/sceneHash.js'
import {
  sceneHashFromGray as wHash,
  sceneDistance as wDist,
  SCENE_DEFAULTS as wDefaults,
} from '../src/sceneHash.js'

const grid = (fn) => {
  const g = []
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) g.push(fn(x, y))
  return g
}
const CORPUS = [
  grid((x) => x * 10),
  grid((x) => (8 - x) * 10),
  grid((x, y) => ((x * 13 + y * 7) % 9) * 28),
  grid((x, y) => (x ^ y) * 20),
]

describe('sceneHash parity (worker mirror ≡ client)', () => {
  it('SCENE_DEFAULTS match', () => {
    expect(wDefaults).toEqual(cDefaults)
  })

  it('hashes + all pairwise distances deep-equal across the corpus', () => {
    const ch = CORPUS.map((g) => cHash(g))
    const wh = CORPUS.map((g) => wHash(g))
    expect(wh).toEqual(ch)
    for (let i = 0; i < CORPUS.length; i++) {
      for (let j = 0; j < CORPUS.length; j++) {
        expect(wDist(wh[i], wh[j])).toBe(cDist(ch[i], ch[j]))
      }
    }
  })
})
