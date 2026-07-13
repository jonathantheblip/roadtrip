// PARITY + unit tests: worker/src/humanWords.js mirrors app/src/lib/humanWords.js
// (BUILD_PLAN_WITNESS_FLEET_2.md W9, "the human-words pack"). The two files are
// byte-identical (no imports on either side), gated against drift the same way
// every other mirror pair in this codebase is.

import { describe, it, expect } from 'vitest'
import * as workerHW from '../src/humanWords.js'
import * as clientHW from '../../app/src/lib/humanWords.js'

describe('humanWords.js parity (worker mirror ≡ client)', () => {
  it('exports match on both sides', () => {
    expect(Object.keys(workerHW).sort()).toEqual(Object.keys(clientHW).sort())
  })
})

for (const [label, HW] of [['worker', workerHW], ['client', clientHW]]) {
  describe(`humanWords.js (${label})`, () => {
    describe('manualStopEvidence — D16', () => {
      it('a manual filing (worker row shape: stop_id + stop_prov_json string) returns the stop + actor', () => {
        const m = { stop_id: 's-a', stop_prov_json: JSON.stringify({ source: 'manual', by: 'jonathan' }) }
        expect(HW.manualStopEvidence(m)).toEqual({ stopId: 's-a', by: 'jonathan' })
      })

      it('a manual filing (client shape: stopId + parsed stopProv object) returns the same', () => {
        const m = { stopId: 's-a', stopProv: { source: 'manual', by: 'jonathan' } }
        expect(HW.manualStopEvidence(m)).toEqual({ stopId: 's-a', by: 'jonathan' })
      })

      it('a manual filing with no actor (by: null, e.g. rule 3\'s inferred-manual stamp) still returns the stop', () => {
        const m = { stopId: 's-a', stopProv: { source: 'manual', by: null } }
        expect(HW.manualStopEvidence(m)).toEqual({ stopId: 's-a', by: null })
      })

      it('an AUTO filing is never evidence — only a human speech act counts', () => {
        const m = { stopId: 's-a', stopProv: { source: 'auto', by: 'matcher' } }
        expect(HW.manualStopEvidence(m)).toBe(null)
      })

      it('no stop_id at all → null, even with a manual prov present (nothing to anchor)', () => {
        const m = { stopProv: { source: 'manual', by: 'jonathan' } }
        expect(HW.manualStopEvidence(m)).toBe(null)
      })

      it('no prov at all (legacy row) → null, never guessed', () => {
        expect(HW.manualStopEvidence({ stopId: 's-a' })).toBe(null)
      })

      it('a malformed stop_prov_json string never throws — degrades to null', () => {
        expect(HW.manualStopEvidence({ stop_id: 's-a', stop_prov_json: '{not json' })).toBe(null)
      })

      it('bad/missing input never throws', () => {
        expect(HW.manualStopEvidence(null)).toBe(null)
        expect(HW.manualStopEvidence(undefined)).toBe(null)
        expect(HW.manualStopEvidence({})).toBe(null)
      })
    })

    describe('countDismissalEchoes — item 3, report-only', () => {
      const dec = (memoryIds, placeId) => ({ memoryIds, place: placeId ? { id: placeId, name: 'x' } : null, signals: {} })

      it('annotates a decision matching a dismissed (memory,to_stop) pair and counts it', () => {
        const decisions = [dec(['m1'], 's-a'), dec(['m2'], 's-b')]
        const rows = [{ memory_id: 'm1', to_stop: 's-a' }]
        const n = HW.countDismissalEchoes(decisions, rows)
        expect(n).toBe(1)
        expect(decisions[0].signals.dismissedBefore).toBe(true)
        expect(decisions[1].signals.dismissedBefore).toBeUndefined()
      })

      it('a dismissal for a DIFFERENT place does not echo (same memory, different to_stop)', () => {
        const decisions = [dec(['m1'], 's-a')]
        const rows = [{ memory_id: 'm1', to_stop: 's-b' }]
        expect(HW.countDismissalEchoes(decisions, rows)).toBe(0)
        expect(decisions[0].signals.dismissedBefore).toBeUndefined()
      })

      it('a decision with no place (leave tier) never matches', () => {
        const decisions = [dec(['m1'], null)]
        const rows = [{ memory_id: 'm1', to_stop: 's-a' }]
        expect(HW.countDismissalEchoes(decisions, rows)).toBe(0)
      })

      it('a multi-memory decision matches if ANY of its memoryIds was dismissed for that place', () => {
        const decisions = [dec(['m1', 'm2'], 's-a')]
        const rows = [{ memory_id: 'm2', to_stop: 's-a' }]
        expect(HW.countDismissalEchoes(decisions, rows)).toBe(1)
      })

      it('never mutates the decision beyond adding the flag — other signals survive', () => {
        const decisions = [{ memoryIds: ['m1'], place: { id: 's-a' }, signals: { evidence: 'gps' } }]
        HW.countDismissalEchoes(decisions, [{ memory_id: 'm1', to_stop: 's-a' }])
        expect(decisions[0].signals.evidence).toBe('gps')
        expect(decisions[0].signals.dismissedBefore).toBe(true)
      })

      it('empty/missing input never throws, counts 0', () => {
        expect(HW.countDismissalEchoes([], [])).toBe(0)
        expect(HW.countDismissalEchoes(null, null)).toBe(0)
        expect(HW.countDismissalEchoes([dec(['m1'], 's-a')], undefined)).toBe(0)
      })
    })
  })
}
