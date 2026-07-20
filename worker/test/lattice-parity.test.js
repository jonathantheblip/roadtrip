// PARITY: the world-model FACT-LATTICE (§16d) — the six branch folds + the one
// composer (lattice/index.js) + the bench's INTEGRATE seam — are byte-identical mirrors:
// worker/src/lattice/*.js ≡ app/src/lib/lattice/*.js, and worker/src/evidenceBench.js ≡
// app/src/lib/evidenceBench.js (O1). The lattice fold is WORKER-AUTHORITATIVE (A3: it
// needs the answer ledgers); the client uses FIXTURE lattices only. This test runs ONE
// shared corpus through buildLattice via BOTH copies and asserts the whole lattice is
// deep-equal, then feeds that lattice into buildEvidenceBench (both copies) and asserts
// the ENRICHED bench matches too — so a future edit to one copy that isn't mirrored fails
// here, exactly like the established HM-engine parity gate.
//
// It also asserts NON-TRIVIAL output (every branch learned something; the seam fired), so
// parity can never pass vacuously on empty output.

import { describe, it, expect } from 'vitest'

import { buildLattice as wBuildLattice, LATTICE_BRANCHES as wBranches } from '../src/lattice/index.js'
import { buildEvidenceBench as wBuildEvidenceBench, LATTICE_WITNESSES as wLatW } from '../src/evidenceBench.js'

import { buildLattice as cBuildLattice, LATTICE_BRANCHES as cBranches } from '../../app/src/lib/lattice/index.js'
import { buildEvidenceBench as cBuildEvidenceBench } from '../../app/src/lib/evidenceBench.js'

const at = (h, m = 0) => Date.UTC(2026, 6, 4, h, m)
const at25 = (h, m = 0) => Date.UTC(2025, 6, 4, h, m)
const NOW = Date.UTC(2026, 6, 10)

// A corpus shaped to make every branch learn: recurring named stop across two July-4
// years (places recurrence + rhythms cadence/season/tripShape), photos with author +
// vision + camera meta (people photographer + places character + rhythms daily + devices
// survival), a christened stop + a name-shaped caption (lexicon), and class-tagged
// feedback (people curation/voice + meta class-trust).
const TRIPS = [
  {
    id: 't1', endMs: at(23),
    days: [{ isoDate: '2026-07-04', stops: [
      { id: 's1', name: 'Town beach', lat: 42.05, lng: -70.18 },
      { id: 's2', name: 'Harbor grill', lat: 42.06, lng: -70.24, origin: { christened: { at: at(19) } } },
    ] }],
  },
  {
    id: 't2', endMs: at25(23),
    days: [{ isoDate: '2025-07-04', stops: [{ id: 's3', name: 'Town beach', lat: 42.05, lng: -70.18 }] }],
  },
]
const photo = (key, placeType, hhmm, extra = {}) => ({ key, capturedAt: new Date(at(hhmm)).toISOString(), offsetMinutes: 0, vision: { placeType, setting: 'outdoor' }, meta: { make: 'Apple', model: 'iPhone' }, ...extra })
const MEMORIES = [
  { id: 'm1', trip_id: 't1', stop_id: 's1', author_traveler: 'rafa', created_at: at(20), caption: 'the town beach', photo_r2_keys_json: JSON.stringify([photo('k1', 'beach', 14), photo('k2', 'beach', 15)]) },
  { id: 'm2', trip_id: 't1', stop_id: 's2', author_traveler: 'dad', created_at: at(20), caption: 'dinner out', photo_r2_keys_json: JSON.stringify([photo('k3', 'restaurant', 19)]) },
  { id: 'm3', trip_id: 't2', stop_id: 's3', author_traveler: 'rafa', created_at: at25(20), photo_r2_keys_json: JSON.stringify([photo('k4', 'beach', 14)]) },
]
const FEEDBACK = [
  { id: 1, trip_id: 't1', by_traveler: 'mom', action: 'confirmed', kind: 'A', at: at(21) },
  { id: 2, trip_id: 't1', by_traveler: 'mom', action: 'confirmed', kind: 'A', at: at(21, 5) },
  { id: 3, trip_id: 't1', by_traveler: 'dad', action: 'corrected', kind: 'B', at: at(21, 10) },
]

// Points + places to drive the bench INTEGRATE seam across both mirrors.
const PLACES = [
  { id: 's1', name: 'Town beach', lat: 42.05, lng: -70.18, timeMin: 14 * 60 },
  { id: 's2', name: 'Harbor grill', lat: 42.06, lng: -70.24, timeMin: 19 * 60 },
]
const POINTS = [
  { id: 'p1', at: at(14), lat: 42.05, lng: -70.18, provGps: 'exif', author: 'rafa', placeType: 'beach', setting: 'outdoor', signage: 'Town Beach' },
]

const wLat = wBuildLattice(TRIPS, MEMORIES, FEEDBACK, { now: NOW })
const cLat = cBuildLattice(TRIPS, MEMORIES, FEEDBACK, { now: NOW })
const wBench = wBuildEvidenceBench(POINTS, PLACES, { lattice: wLat })
const cBench = cBuildEvidenceBench(POINTS, PLACES, { lattice: cLat })

describe('world-model lattice worker↔client parity (byte-identical mirrors, behaviour-identical)', () => {
  it('the branch roster is identical', () => {
    expect(cBranches).toEqual(wBranches)
    expect(wBranches).toEqual(['people', 'places', 'rhythms', 'devices', 'lexicon', 'meta'])
  })
  it('buildLattice output is identical and non-empty in every branch', () => {
    expect(cLat).toEqual(wLat)
    expect(wLat.people.length).toBeGreaterThan(0)
    expect(wLat.places.length).toBeGreaterThan(0)
    expect(wLat.rhythms.length).toBeGreaterThan(0)
    expect(wLat.devices.length).toBeGreaterThan(0)
    expect(wLat.lexicon.facts.length).toBeGreaterThan(0)
    expect(wLat.meta.length).toBeGreaterThan(0)
  })
  it('the INTEGRATE-enriched bench is identical across mirrors and the seam fired', () => {
    expect(cBench).toEqual(wBench)
    // the enriched bench advertises the lattice witnesses and carries the device grading
    expect(wBench.witnesses).toEqual(cBench.witnesses)
    expect(wBench.witnesses.slice(-wLatW.length)).toEqual(wLatW)
    expect(Array.isArray(wBench.grading)).toBe(true)
    // at least one lattice placement witness fired on the corpus
    const latWitnesses = new Set(wLatW)
    expect(wBench.placement.some((e) => latWitnesses.has(e.witness))).toBe(true)
  })
  it('with NO lattice the enriched-path code stays a perfect no-op (both mirrors)', () => {
    const wPlain = wBuildEvidenceBench(POINTS, PLACES)
    const cPlain = cBuildEvidenceBench(POINTS, PLACES)
    expect(cPlain).toEqual(wPlain)
    expect(Object.keys(wPlain).sort()).toEqual(['affinity', 'placement', 'witnesses'])
  })
})
