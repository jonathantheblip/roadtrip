import { describe, it, expect } from 'vitest'
import {
  answerKey, maskFilings, predictionsFromDecisions, scoreAgainstKey, scoreTrip, scoreCorpus,
} from '../src/healScoreboard.js'
// The placer's ONLY peek path at the filing — masking must blind it.
import { manualStopEvidence } from '../src/humanWords.js'

const mem = (id, stop, source, extra = {}) => ({
  id,
  trip_id: 't',
  stop_id: stop ?? null,
  stop_prov_json: source ? JSON.stringify({ source, by: source === 'manual' ? 'helen' : null }) : null,
  ...extra,
})

describe("answerKey — only the family's deliberate filings are truth", () => {
  it('keeps manual + confirmed; drops auto, unfiled, empty, deleted', () => {
    const key = answerKey([
      mem('a', 's1', 'manual'),
      mem('b', 's2', 'confirmed'),
      mem('c', 's3', 'auto'), // the machine's own guess — not truth
      mem('d', null, null), // unfiled — censored, never a negative
      mem('e', '', 'manual'), // empty stop = unfiled
      mem('f', 's4', 'manual', { deleted_at: 123 }), // deleted
    ])
    expect([...key.entries()]).toEqual([['a', 's1'], ['b', 's2']])
  })
})

describe('maskFilings — grade a BLIND placer, never a cheater', () => {
  it("strips every field the placer's peek path reads", () => {
    const m = mem('a', 's1', 'manual')
    const [masked] = maskFilings([m])
    expect(masked.stop_id).toBeUndefined()
    expect(masked.stop_prov_json).toBeUndefined()
    // the load-bearing guarantee: the placer's D16 peek goes blind on the mask.
    expect(manualStopEvidence(m)).toEqual({ stopId: 's1', by: 'helen' })
    expect(manualStopEvidence(masked)).toBeNull()
  })
  it('does not mutate the originals (answer key still reads them)', () => {
    const mems = [mem('a', 's1', 'manual')]
    maskFilings(mems)
    expect(answerKey(mems).get('a')).toBe('s1')
  })
  it('also blinds camelCase stopId/stopProv shapes', () => {
    const m = { id: 'a', stopId: 's1', stopProv: { source: 'manual', by: 'jon' } }
    const [masked] = maskFilings([m])
    expect(masked.stopId).toBeUndefined()
    expect(masked.stopProv).toBeUndefined()
    expect(manualStopEvidence(masked)).toBeNull()
  })
})

describe('predictionsFromDecisions — a memory takes its strongest decision', () => {
  it('auto beats confirm beats leave across split bursts', () => {
    const pred = predictionsFromDecisions([
      { memoryIds: ['a'], place: { id: 's1' }, tier: 'confirm', confidence: 0.6 },
      { memoryIds: ['a', 'b'], place: { id: 's2' }, tier: 'auto', confidence: 0.9 },
      { memoryIds: ['c'], place: null, tier: 'leave', confidence: 0.2 },
    ])
    expect(pred.get('a')).toEqual({ stopId: 's2', tier: 'auto', confidence: 0.9 })
    expect(pred.get('b')).toEqual({ stopId: 's2', tier: 'auto', confidence: 0.9 })
    expect(pred.get('c')).toEqual({ stopId: null, tier: 'leave', confidence: 0.2 })
  })
})

describe('scoreAgainstKey — separate a silent-correct file from the dangerous silent-wrong one', () => {
  it('counts recovered / misfiled / abstained + Brier', () => {
    const key = new Map([['a', 's1'], ['b', 's1'], ['c', 's1'], ['d', 's1']])
    const pred = new Map([
      ['a', { stopId: 's1', tier: 'auto', confidence: 0.9 }], // recovered
      ['b', { stopId: 's2', tier: 'auto', confidence: 0.9 }], // MISFILED (silent + wrong)
      ['c', { stopId: 's1', tier: 'confirm', confidence: 0.6 }], // abstained, top guess correct
      // d: no prediction → abstained, wrong
    ])
    const s = scoreAgainstKey(key, pred)
    expect(s).toMatchObject({ n: 4, recovered: 1, misfiled: 1, abstained: 2, askedTopCorrect: 1 })
    expect(s.recoveryRate).toBe(0.25)
    expect(s.misfileRate).toBe(0.25)
    // Brier: (0.9-1)²+(0.9-0)²+(0.6-1)²+(0-0)² = 0.01+0.81+0.16+0 = 0.98 /4
    expect(s.brier).toBeCloseTo(0.245, 6)
  })
  it('empty key → n 0, brier null (no division by zero)', () => {
    expect(scoreAgainstKey(new Map(), new Map())).toMatchObject({ n: 0, brier: null })
  })
})

describe('scoreTrip — mask, run a blind placer, compare to held-out truth', () => {
  it('runs an injected placer over masked memories and never leaks the answer', () => {
    const memories = [mem('a', 's1', 'manual'), mem('b', 's2', 'confirmed')]
    const placer = (trip, masked) => {
      // prove blindness end-to-end: the placer cannot recover the filing.
      for (const m of masked) expect(manualStopEvidence(m)).toBeNull()
      return [
        { memoryIds: ['a'], place: { id: 's1' }, tier: 'auto', confidence: 0.8 },
        { memoryIds: ['b'], place: null, tier: 'leave', confidence: 0.2 },
      ]
    }
    const s = scoreTrip({ id: 't' }, memories, { placer })
    expect(s).toMatchObject({ n: 2, recovered: 1, misfiled: 0, abstained: 1 })
  })
  it('requires a placer', () => {
    expect(() => scoreTrip({ id: 't' }, [])).toThrow(/placer/)
  })
})

describe('scoreCorpus — blocked by trip, reported pooled and per-trip-mean', () => {
  it('a photo-heavy trip dominates pooled but not the per-trip mean', () => {
    const t1 = { n: 2, recovered: 2, misfiled: 0, abstained: 0, recoveryRate: 1, misfileRate: 0, abstainRate: 0, brier: 0.1 }
    const t2 = { n: 8, recovered: 4, misfiled: 4, abstained: 0, recoveryRate: 0.5, misfileRate: 0.5, abstainRate: 0, brier: 0.3 }
    const c = scoreCorpus([t1, t2])
    expect(c.trips).toBe(2)
    expect(c.pooledN).toBe(10)
    expect(c.pooled.recoveryRate).toBeCloseTo(6 / 10) // photo-weighted
    expect(c.perTripMean.recoveryRate).toBeCloseTo(0.75) // each trip counts once
  })
})
