// The provenance rule matrix (SPEC §4 rules 1–4) + the stopProv whitelist, as
// pure logic — no DB. This is where the lock's correctness lives; the postMemory
// integration test proves the wiring, this proves the decisions.

import { describe, it, expect } from 'vitest'
import { resolveStopProvenance, whitelistProv, sameStop } from '../src/stopProvenance.js'

const NOW = 1_000_000

describe('whitelistProv — reserialize to exactly the stored shape', () => {
  it('drops a prov with no valid source (not a lock signal)', () => {
    expect(whitelistProv(null)).toBeNull()
    expect(whitelistProv({})).toBeNull()
    expect(whitelistProv({ source: 'guess' })).toBeNull()
    // S1: 'confirmed' (D13) is a valid human source — kept, not dropped (SOURCES).
    expect(whitelistProv({ source: 'confirmed', by: 'jonathan' })).toMatchObject({ source: 'confirmed', by: 'jonathan' })
  })

  it('keeps the whitelisted manual fields; never fabricates a person', () => {
    const out = whitelistProv({
      source: 'manual', by: 'helen', at: 42, movedFrom: 's1',
      movedFromLabel: 'The Airbnb', targetLabel: 'Race Point', reason: 'hand',
      junk: 'nope', matchType: 'gps+time', // matchType is auto-only → dropped here
    })
    expect(out).toEqual({
      source: 'manual', by: 'helen', at: 42, movedFrom: 's1',
      movedFromLabel: 'The Airbnb', targetLabel: 'Race Point', reason: 'hand',
    })
    expect(out).not.toHaveProperty('junk')
    expect(out).not.toHaveProperty('matchType') // auto-only, stripped from a manual prov
  })

  it('by is null unless a real string (an inferred stamp is never a person)', () => {
    expect(whitelistProv({ source: 'auto', by: 123 }).by).toBeNull()
    expect(whitelistProv({ source: 'auto', by: '' }).by).toBeNull()
    expect(whitelistProv({ source: 'auto', by: 'matcher' }).by).toBe('matcher')
  })

  it('an AUTO stamp can never be attributed to a person — by is forced matcher-or-null (spoof guard)', () => {
    expect(whitelistProv({ source: 'auto', by: 'helen' }).by).toBeNull() // a person on an auto move is a spoof → dropped
    expect(whitelistProv({ source: 'auto', by: 'jonathan' }).by).toBeNull()
    // A MANUAL stamp keeps the acting traveler.
    expect(whitelistProv({ source: 'manual', by: 'helen' }).by).toBe('helen')
  })

  it('keeps auto-only evidence on an auto prov', () => {
    const out = whitelistProv({ source: 'auto', by: 'matcher', matchType: 'gps+time', distanceMeters: 40, tripRev: 99, baseAnchor: 'lodge#1' })
    expect(out.matchType).toBe('gps+time')
    expect(out.distanceMeters).toBe(40)
    expect(out.tripRev).toBe(99)
    expect(out.baseAnchor).toBe('lodge#1')
  })

  it('drops an unknown reason code but keeps a known one', () => {
    expect(whitelistProv({ source: 'manual', reason: 'because-i-said' })).not.toHaveProperty('reason')
    expect(whitelistProv({ source: 'manual', reason: 'hand-filed' }).reason).toBe('hand-filed')
  })
})

describe('sameStop — null/undefined/empty all mean unfiled', () => {
  it('treats the unfiled variants as one filing', () => {
    expect(sameStop(null, undefined)).toBe(true)
    expect(sameStop('', null)).toBe(true)
    expect(sameStop('s1', 's1')).toBe(true)
    expect(sameStop('s1', 's2')).toBe(false)
    expect(sameStop('s1', null)).toBe(false)
  })
})

describe('resolveStopProvenance — the rule matrix', () => {
  it('Rule 4 (insert, bare stopId): provenance stays NULL (legacy), no ledger', () => {
    const r = resolveStopProvenance({ isInsert: true, incomingStopId: 's1', incomingProv: null, now: NOW })
    expect(r.stopId).toBe('s1')
    expect(r.prov).toBeNull()
    expect(r.refused).toBe(false)
    expect(r.move).toBeNull() // a bare legacy insert logs nothing to attribute
  })

  it('Rule 4 (insert, explicit prov): stamps it + logs the initial filing from null', () => {
    const prov = whitelistProv({ source: 'auto', by: 'matcher', reason: 'import', targetLabel: 'Beach' })
    const r = resolveStopProvenance({ isInsert: true, incomingStopId: 's1', incomingProv: prov, now: NOW })
    expect(r.prov.source).toBe('auto')
    expect(r.move).toMatchObject({ from: null, to: 's1', toLabel: 'Beach', source: 'auto', reason: 'import' })
  })

  it('Rule 1 (same stop): preserve stored prov, no churn, no ledger', () => {
    const stored = { source: 'manual', by: 'helen', reason: 'hand' }
    const r = resolveStopProvenance({
      storedStopId: 's1', storedProv: stored, isInsert: false,
      incomingStopId: 's1', incomingProv: whitelistProv({ source: 'auto' }), now: NOW,
    })
    expect(r.stopId).toBe('s1')
    expect(r.prov).toBe(stored) // untouched
    expect(r.move).toBeNull()
    expect(r.refused).toBe(false)
  })

  it('Rule 2 (manual lock beats auto): REFUSE, keep stored, no ledger', () => {
    const stored = { source: 'manual', by: 'helen', reason: 'hand', targetLabel: 'Race Point' }
    const r = resolveStopProvenance({
      storedStopId: 's1', storedProv: stored, isInsert: false,
      incomingStopId: 's2', incomingProv: whitelistProv({ source: 'auto', by: 'matcher' }), now: NOW,
    })
    expect(r.refused).toBe(true)
    expect(r.stopId).toBe('s1') // stayed put
    expect(r.prov).toBe(stored)
    expect(r.move).toBeNull()
  })

  it('Rule 2 does NOT fire for manual→manual (a person re-moving a locked photo is allowed)', () => {
    const stored = { source: 'manual', by: 'helen' }
    const incoming = whitelistProv({ source: 'manual', by: 'jonathan', reason: 'hand', targetLabel: 'Pier' })
    const r = resolveStopProvenance({
      storedStopId: 's1', storedProv: stored, isInsert: false,
      incomingStopId: 's2', incomingProv: incoming, now: NOW,
    })
    expect(r.refused).toBe(false)
    expect(r.stopId).toBe('s2')
    expect(r.prov.by).toBe('jonathan')
    expect(r.move).toMatchObject({ from: 's1', to: 's2', toLabel: 'Pier', source: 'manual', by: 'jonathan' })
  })

  it('Rule 2 (S1 CONFIRM lock, D13): a stored confirmed filing REFUSES an incoming auto move', () => {
    const stored = { source: 'confirmed', by: 'jonathan', targetLabel: 'Angel Foods' }
    const r = resolveStopProvenance({
      storedStopId: 's1', storedProv: stored, isInsert: false,
      incomingStopId: 's2', incomingProv: whitelistProv({ source: 'auto', by: 'matcher' }), now: NOW,
    })
    expect(r.refused).toBe(true) // the family's confirm stands; the sweep can't move it
    expect(r.stopId).toBe('s1')
    expect(r.prov).toBe(stored)
    expect(r.move).toBeNull()
  })

  it('a later HUMAN move still overrides a confirm (latest-human-wins): confirmed→manual is allowed', () => {
    const stored = { source: 'confirmed', by: 'jonathan' }
    const r = resolveStopProvenance({
      storedStopId: 's1', storedProv: stored, isInsert: false,
      incomingStopId: 's2', incomingProv: whitelistProv({ source: 'manual', by: 'helen', targetLabel: 'Pier' }), now: NOW,
    })
    expect(r.refused).toBe(false)
    expect(r.stopId).toBe('s2')
  })

  it('allowed auto move onto a non-manual photo: takes incoming, logs from→to with snapshotted labels', () => {
    const stored = { source: 'auto', by: 'matcher', targetLabel: 'The Airbnb' }
    const incoming = whitelistProv({ source: 'auto', by: 'matcher', reason: 'plan', movedFromLabel: 'The Airbnb', targetLabel: 'Grand Central', tripRev: 500 })
    const r = resolveStopProvenance({
      storedStopId: 's1', storedProv: stored, isInsert: false,
      incomingStopId: 's2', incomingProv: incoming, now: NOW,
    })
    expect(r.stopId).toBe('s2')
    expect(r.move).toMatchObject({ from: 's1', to: 's2', fromLabel: 'The Airbnb', toLabel: 'Grand Central', reason: 'plan', tripRev: 500 })
  })

  it('Rule 3 (differs, no prov): stamp manual/by:null (safe lock, never attributed) + log', () => {
    const r = resolveStopProvenance({
      storedStopId: 's1', storedProv: null, isInsert: false,
      incomingStopId: 's2', incomingProv: null, now: NOW,
    })
    expect(r.prov).toEqual({ source: 'manual', by: null, reason: 'unknown', at: NOW })
    expect(r.stopId).toBe('s2')
    expect(r.refused).toBe(false)
    expect(r.move).toMatchObject({ from: 's1', to: 's2', source: 'manual', by: null, reason: 'unknown' })
  })

  it('Rule 3 to unfiled: a differing null incoming still stamps manual + logs to:null', () => {
    const r = resolveStopProvenance({
      storedStopId: 's1', storedProv: { source: 'auto' }, isInsert: false,
      incomingStopId: null, incomingProv: null, now: NOW,
    })
    expect(r.stopId).toBeNull()
    expect(r.prov.source).toBe('manual')
    expect(r.move).toMatchObject({ from: 's1', to: null })
  })
})
