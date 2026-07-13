// healDecisionsView.js — the MASK-GATE RESTORE, against real test D1. Every
// leak vector the projection exists to close gets a test that proves BOTH
// directions: dropped for the hidden viewer, KEPT for the author (a filter
// that hides everything from everyone would trivially "pass" the drop tests —
// the keep side is what proves it's a projection, not a blackout).
import { env } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import { listHealDecisionsForViewer, filterDecisionsForViewer, buildHiddenIndex, projectSignalsForViewer } from '../src/healDecisionsView.js'

const NOW = 1_700_000_000_000

async function seedTrip(id, trip, updated_at = 100) {
  await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?,?,?)')
    .bind(id, JSON.stringify({ id, ...trip }), updated_at)
    .run()
}
async function seedMemory(id, tripId, { visibility = 'shared', author = 'jonathan', hideFrom = null, revealedAt = null } = {}) {
  await env.DB.prepare(
    `INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, hide_from_json, revealed_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  )
    .bind(id, tripId, author, visibility, 'photo', hideFrom ? JSON.stringify(hideFrom) : null, revealedAt, 1, 50)
    .run()
}
async function seedDecision(tripId, { isoDate = '2026-07-01', memoryIds = [], photoCount = 1, placeId = null, placeName = null, tier = 'confirm', signals = {} } = {}) {
  await env.DB.prepare(
    `INSERT INTO memory_heal_decisions
       (trip_id, iso_date, memory_ids, photo_count, place_id, place_name, tier, confidence, evidence, signals_json, reason, mode, run_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(tripId, isoDate, JSON.stringify(memoryIds), photoCount, placeId, placeName, tier, 0.5, 'gps', JSON.stringify(signals), 'r', 'shadow', NOW)
    .run()
}

const envShadow = () => ({ DB: env.DB, PHOTO_HEAL_MODE: 'shadow' })

beforeEach(async () => {
  await applySchema(env.DB)
  for (const t of ['memory_heal_decisions', 'memories', 'trips']) await env.DB.prepare(`DELETE FROM ${t}`).run()
})

describe('listHealDecisionsForViewer', () => {
  it('a plain shared-memory decision on a plain stop is served, signals parsed', async () => {
    await seedTrip('t1', { days: [{ isoDate: '2026-07-01', stops: [{ id: 's1', name: 'The museum' }] }] })
    await seedMemory('m1', 't1')
    await seedDecision('t1', { memoryIds: ['m1'], placeId: 's1', placeName: 'The museum', signals: { evidence: 'gps' } })
    const out = await listHealDecisionsForViewer(envShadow(), 't1', 'helen')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      isoDate: '2026-07-01', memoryIds: ['m1'], photoCount: 1,
      placeId: 's1', placeName: 'The museum', tier: 'confirm', mode: 'shadow', runAt: NOW,
    })
    expect(out[0].signals).toEqual({ evidence: 'gps' })
  })

  it('MODE off → [] (dark), shadow AND on both serve (the pre-promotion learning tool)', async () => {
    await seedTrip('t1', { days: [] })
    await seedMemory('m1', 't1')
    await seedDecision('t1', { memoryIds: ['m1'] })
    expect(await listHealDecisionsForViewer({ DB: env.DB }, 't1', 'jonathan')).toEqual([])
    expect(await listHealDecisionsForViewer({ DB: env.DB, PHOTO_HEAL_MODE: 'off' }, 't1', 'jonathan')).toEqual([])
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')).toHaveLength(1)
    expect(await listHealDecisionsForViewer({ DB: env.DB, PHOTO_HEAL_MODE: 'on' }, 't1', 'jonathan')).toHaveLength(1)
  })

  it('SURPRISE MEMORY: dropped for the hidden viewer, KEPT for the author, KEPT once revealed', async () => {
    await seedTrip('t1', { days: [] })
    await seedMemory('m-surprise', 't1', { author: 'jonathan', hideFrom: ['helen'] })
    await seedDecision('t1', { memoryIds: ['m-surprise'], placeName: 'a place near 42.0000, -70.0000' })
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'helen')).toEqual([])
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')).toHaveLength(1)
    // reveal it → helen sees it now
    await env.DB.prepare('UPDATE memories SET revealed_at = ? WHERE id = ?').bind(NOW, 'm-surprise').run()
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'helen')).toHaveLength(1)
  })

  it('hideFrom "everyone" hides from every non-author', async () => {
    await seedTrip('t1', { days: [] })
    await seedMemory('m1', 't1', { author: 'jonathan', hideFrom: ['everyone'] })
    await seedDecision('t1', { memoryIds: ['m1'] })
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'helen')).toEqual([])
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')).toHaveLength(1)
  })

  it('PRIVATE memory of another traveler: dropped for others, kept for its own author', async () => {
    await seedTrip('t1', { days: [] })
    await seedMemory('m-priv', 't1', { author: 'helen', visibility: 'private' })
    await seedDecision('t1', { memoryIds: ['m-priv'] })
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')).toEqual([])
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'helen')).toHaveLength(1)
  })

  it('a MULTI-memory decision is dropped WHOLE if ANY referenced memory is invisible (no arithmetic leak)', async () => {
    await seedTrip('t1', { days: [] })
    await seedMemory('m-ok', 't1')
    await seedMemory('m-hidden', 't1', { author: 'jonathan', hideFrom: ['helen'] })
    await seedDecision('t1', { memoryIds: ['m-ok', 'm-hidden'], photoCount: 5 })
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'helen')).toEqual([])
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')).toHaveLength(1)
  })

  it('a DELETED/missing referenced memory fails closed (stale ledger row never leaks a ghost)', async () => {
    await seedTrip('t1', { days: [] })
    await seedDecision('t1', { memoryIds: ['m-gone'] })
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')).toEqual([])
  })

  it('SURPRISE STOP as the decision place: dropped for the hidden viewer, kept for the surprise author', async () => {
    await seedTrip('t1', {
      days: [{ isoDate: '2026-07-01', stops: [
        { id: 's-secret', name: 'Whale watch', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
      ] }],
    })
    await seedMemory('m1', 't1')
    await seedDecision('t1', { memoryIds: ['m1'], placeId: 's-secret', placeName: 'Whale watch' })
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'helen')).toEqual([])
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')).toHaveLength(1)
  })

  it('BUILD 4b NAME ECHO: a __discovered__ row named AFTER a hidden stop is dropped even though its id is synthetic', async () => {
    await seedTrip('t1', {
      days: [{ isoDate: '2026-07-01', stops: [
        { id: 's-secret', name: 'Whale watch', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
      ] }],
    })
    await seedMemory('m1', 't1')
    await seedDecision('t1', { memoryIds: ['m1'], placeId: '__discovered__:2026-07-01:0', placeName: 'Whale watch' })
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'helen')).toEqual([])
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')).toHaveLength(1)
  })

  it('PART-HIDDEN DAY: a row dated inside a masked part window is dropped (the day itself is the secret)', async () => {
    await seedTrip('t1', {
      parts: [
        { id: 'p1', type: 'stay', dateStart: '2026-07-01', dateEnd: '2026-07-02' },
        { id: 'p2', type: 'stay', dateStart: '2026-07-03', dateEnd: '2026-07-04', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
      ],
      days: [],
    })
    await seedMemory('m1', 't1')
    await seedDecision('t1', { isoDate: '2026-07-03', memoryIds: ['m1'] })
    await seedDecision('t1', { isoDate: '2026-07-01', memoryIds: ['m1'] })
    const helen = await listHealDecisionsForViewer(envShadow(), 't1', 'helen')
    expect(helen).toHaveLength(1)
    expect(helen[0].isoDate).toBe('2026-07-01')
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')).toHaveLength(2)
  })

  it('WHOLE-TRIP surprise: everything dropped for the hidden viewer, served to the trip author', async () => {
    await seedTrip('t1', { surprise: { author: 'jonathan', hideFrom: ['helen'] }, days: [] })
    await seedMemory('m1', 't1')
    await seedDecision('t1', { memoryIds: ['m1'] })
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'helen')).toEqual([])
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')).toHaveLength(1)
  })

  it('missing trip / missing tripId → [] without throwing', async () => {
    expect(await listHealDecisionsForViewer(envShadow(), 'nope', 'jonathan')).toEqual([])
    expect(await listHealDecisionsForViewer(envShadow(), '', 'jonathan')).toEqual([])
  })
})

describe('filterDecisionsForViewer / buildHiddenIndex (pure edges)', () => {
  it('an unparseable memory_ids row is dropped, never served half-read', () => {
    const out = filterDecisionsForViewer({ days: [] }, [{ memory_ids: '{not json', iso_date: 'x' }], [], 'jonathan')
    expect(out).toEqual([])
  })

  it('unparseable signals_json degrades to signals:null but the row still serves', () => {
    const mem = { id: 'm1', visibility: 'shared', author_traveler: 'jonathan', hide_from_json: null, revealed_at: null }
    const row = { memory_ids: '["m1"]', iso_date: '2026-07-01', photo_count: 1, tier: 'confirm', signals_json: '{broken', mode: 'shadow', run_at: 1 }
    const out = filterDecisionsForViewer({ days: [] }, [row], [mem], 'jonathan')
    expect(out).toHaveLength(1)
    expect(out[0].signals).toBe(null)
  })

  it('buildHiddenIndex: a record-target id on a part-hidden day is hidden; the same id on a visible day is not', () => {
    const trip = {
      parts: [
        { id: 'p1', type: 'stay', dateStart: '2026-07-01', dateEnd: '2026-07-02' },
        { id: 'p2', type: 'stay', dateStart: '2026-07-03', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
      ],
      days: [],
    }
    const { stopHidden } = buildHiddenIndex(trip, 'helen')
    expect(stopHidden('__record__:2026-07-03:e1')).toBe(true)
    expect(stopHidden('__record__:2026-07-01:e1')).toBe(false)
  })

  it('buildHiddenIndex: hiddenNames collects the masked stop name (lowercased) for the hidden viewer only', () => {
    const trip = {
      days: [{ isoDate: '2026-07-01', stops: [
        { id: 's1', name: 'Whale watch', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
        { id: 's2', name: 'Breakfast' },
      ] }],
    }
    expect(buildHiddenIndex(trip, 'helen').hiddenNames.has('whale watch')).toBe(true)
    expect(buildHiddenIndex(trip, 'helen').hiddenNames.has('breakfast')).toBe(false)
    expect(buildHiddenIndex(trip, 'jonathan').hiddenNames.has('whale watch')).toBe(false)
  })
})

// ── THE SIGNALS LEAK (adversarial review 2026-07-12, CONFIRMED blocker):
// signals_json carries name-bearing content — Build 4c's pin {lat,lng,name,
// query} and sessionHeal's visionName — that the row-level gates never see.
// These tests pin the projection both ways: filtered for the hidden viewer,
// intact for the author (a blackout would trivially pass the drop side).
describe('the signals projection (pin / visionName / reason leaks)', () => {
  const SECRET_TRIP = {
    days: [{ isoDate: '2026-07-02', stops: [
      { id: 's-secret', name: 'A-House', lat: 42.0500571, lng: -70.1887899, surprise: { author: 'jonathan', hideFrom: ['helen'] } },
      { id: 's-plain', name: 'Breakfast', lat: 42.06, lng: -70.17 },
    ] }],
  }
  async function seedSecretScenario(signals, { placeName = 'a place near 42.0510, -70.1890', reason = 'r' } = {}) {
    await seedTrip('t1', SECRET_TRIP)
    await seedMemory('m1', 't1') // a plain shared memory — visible to everyone
    await env.DB.prepare(
      `INSERT INTO memory_heal_decisions
         (trip_id, iso_date, memory_ids, photo_count, place_id, place_name, tier, confidence, evidence, signals_json, reason, mode, run_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind('t1', '2026-07-02', JSON.stringify(['m1']), 3, '__discovered__:2026-07-02:0', placeName, 'confirm', 0.5, 'gps', JSON.stringify(signals), reason, 'shadow', NOW).run()
  }

  it('a pin NAMING the hidden venue is stripped for the hidden viewer, kept for the author — row survives both', async () => {
    await seedSecretScenario({ evidence: 'gps', dims: ['time', 'gps'], pin: { lat: 41.9, lng: -70.5, name: 'A-House', query: 'A-HOUSE EST 1798', source: 'landmark' } })
    const helen = await listHealDecisionsForViewer(envShadow(), 't1', 'helen')
    expect(helen).toHaveLength(1)
    expect(helen[0].signals.pin).toBeUndefined()
    expect(helen[0].signals.evidence).toBe('gps') // safe keys survive
    const jon = await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')
    expect(jon[0].signals.pin).toMatchObject({ name: 'A-House' })
  })

  it('a pin whose QUERY (raw signage) contains the hidden name is stripped even when pin.name differs', async () => {
    await seedSecretScenario({ pin: { lat: 41.9, lng: -70.5, name: 'Atlantic House', query: 'ATLANTIC HOUSE BAR — THE A-HOUSE — 1798', source: 'landmark' } })
    const helen = await listHealDecisionsForViewer(envShadow(), 't1', 'helen')
    expect(helen[0].signals.pin).toBeUndefined()
  })

  it('a pin at the hidden venue COORDS is stripped even when its name/query look innocent', async () => {
    await seedSecretScenario({ pin: { lat: 42.05006, lng: -70.18878, name: 'Some Bar', query: 'SOME BAR', source: 'landmark' } })
    const helen = await listHealDecisionsForViewer(envShadow(), 't1', 'helen')
    expect(helen[0].signals.pin).toBeUndefined()
    expect((await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan'))[0].signals.pin).toBeTruthy()
  })

  it('an innocent pin far from every hidden place passes through for everyone', async () => {
    await seedSecretScenario({ pin: { lat: 42.06, lng: -70.17, name: 'Angel Foods', query: 'ANGEL FOODS', source: 'landmark' } })
    expect((await listHealDecisionsForViewer(envShadow(), 't1', 'helen'))[0].signals.pin).toMatchObject({ name: 'Angel Foods' })
  })

  it('visionName echoing the hidden venue is stripped for the hidden viewer only', async () => {
    await seedSecretScenario({ evidence: 'vision', visionName: 'Dinner at A-House' })
    expect((await listHealDecisionsForViewer(envShadow(), 't1', 'helen'))[0].signals.visionName).toBeUndefined()
    expect((await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan'))[0].signals.visionName).toBe('Dinner at A-House')
  })

  it('a reason string containing the hidden name is nulled for the hidden viewer only', async () => {
    await seedSecretScenario({ evidence: 'gps' }, { reason: 'looks like A-House — confirm it' })
    expect((await listHealDecisionsForViewer(envShadow(), 't1', 'helen'))[0].reason).toBe(null)
    expect((await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan'))[0].reason).toBe('looks like A-House — confirm it')
  })

  it('CASE/WHITESPACE variants: a place_name echoing the hidden stop in different case still drops the row', async () => {
    await seedSecretScenario({ evidence: 'gps' }, { placeName: '  a-house  ' })
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'helen')).toEqual([])
    expect(await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')).toHaveLength(1)
  })

  it('FAIL CLOSED: an unknown future signal key is dropped for every viewer until consciously whitelisted', async () => {
    await seedSecretScenario({ evidence: 'gps', someFutureNameField: 'A-House at 42.05,-70.18' })
    const jon = await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')
    expect(jon[0].signals.someFutureNameField).toBeUndefined()
    expect(jon[0].signals.evidence).toBe('gps')
  })

  it('projectSignalsForViewer: null/garbage signals stay null, never throw', () => {
    const idx = { nameHidden: () => false, coordsHidden: () => false }
    expect(projectSignalsForViewer(null, idx)).toBe(null)
    expect(projectSignalsForViewer('garbage', idx)).toBe(null)
  })

  // ── the two REPRODUCED bypasses from the fix re-verification (2026-07-12) ──
  describe('bypass closes: short hidden names + orthographic variants', () => {
    async function seedShortSecret() {
      await seedTrip('t1', {
        days: [{ isoDate: '2026-07-02', stops: [
          { id: 's-zoo', name: 'Zoo', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
        ] }],
      })
      await seedMemory('m1', 't1')
    }

    it('a SHORT hidden name ("Zoo"): an exact place_name echo drops the row; a phrase echo strips visionName/reason', async () => {
      await seedShortSecret()
      // Row A: place_name is EXACTLY the hidden name → whole row drops for helen.
      await seedDecision('t1', { isoDate: '2026-07-02', memoryIds: ['m1'], placeName: 'Zoo' })
      // Row B: place_name innocent — the ONLY echoes are inside visionName/reason,
      // so this row must survive with those fields stripped. This is the assertion
      // that keeps the short-name PHRASE branch load-bearing (deleting it goes red).
      await env.DB.prepare(
        `INSERT INTO memory_heal_decisions
           (trip_id, iso_date, memory_ids, photo_count, place_id, place_name, tier, confidence, evidence, signals_json, reason, mode, run_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind('t1', '2026-07-02', JSON.stringify(['m1']), 1, '__vision__:2026-07-02:0', 'Morning outing', 'confirm', 0.5, 'vision',
        JSON.stringify({ evidence: 'vision', visionName: 'at the Zoo' }), 'looks like Zoo — confirm it', 'shadow', NOW).run()
      const helen = await listHealDecisionsForViewer(envShadow(), 't1', 'helen')
      expect(helen).toHaveLength(1) // row A dropped
      expect(helen[0].placeName).toBe('Morning outing')
      expect(helen[0].signals.visionName).toBeUndefined()
      expect(helen[0].reason).toBe(null)
      const jon = await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')
      expect(jon).toHaveLength(2)
      expect(jon.find((d) => d.placeName === 'Morning outing').signals.visionName).toBe('at the Zoo')
    })

    it('a MULTI-TOKEN short hidden name ("H&M" → "h m") still matches as a phrase', async () => {
      await seedTrip('t1', {
        days: [{ isoDate: '2026-07-02', stops: [
          { id: 's-hm', name: 'H&M', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
        ] }],
      })
      await seedMemory('m1', 't1')
      await seedDecision('t1', { isoDate: '2026-07-02', memoryIds: ['m1'], placeName: 'stopped at the H&M today' })
      expect(await listHealDecisionsForViewer(envShadow(), 't1', 'helen')).toEqual([])
      expect(await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')).toHaveLength(1)
    })

    it('a short hidden name does NOT false-fire on containment ("zoom" ≠ token "zoo")', async () => {
      await seedShortSecret()
      await seedDecision('t1', { isoDate: '2026-07-02', memoryIds: ['m1'], placeName: 'Zoomobile Depot', signals: { evidence: 'gps' } })
      const helen = await listHealDecisionsForViewer(envShadow(), 't1', 'helen')
      expect(helen).toHaveLength(1) // 'zoomobile depot' tokens = [zoomobile, depot] — no 'zoo' token
    })

    it('ORTHOGRAPHIC variants match after normalization: A-House ≡ "the A House", curly vs straight apostrophe, diacritics', async () => {
      await seedTrip('t1', {
        days: [{ isoDate: '2026-07-02', stops: [
          { id: 's1', name: 'A-House', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
          { id: 's2', name: 'Napi’s Restaurant', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
          { id: 's3', name: 'Café Heaven', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
        ] }],
      })
      await seedMemory('m1', 't1')
      await seedDecision('t1', { isoDate: '2026-07-02', memoryIds: ['m1'], placeName: 'x',
        signals: { visionName: 'dinner at the A House' } })
      await seedDecision('t1', { isoDate: '2026-07-02', memoryIds: ['m1'], placeName: "Napi's Restaurant" })
      await seedDecision('t1', { isoDate: '2026-07-02', memoryIds: ['m1'], placeName: 'Cafe Heaven' })
      const helen = await listHealDecisionsForViewer(envShadow(), 't1', 'helen')
      // rows 2+3 drop whole (place_name echo); row 1 survives but visionName is stripped
      expect(helen).toHaveLength(1)
      expect(helen[0].signals.visionName).toBeUndefined()
      const jon = await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')
      expect(jon).toHaveLength(3)
      expect(jon.find((d) => d.signals?.visionName)?.signals.visionName).toBe('dinner at the A House')
    })
  })
})

// ── THE W8/W9 PROVENANCE-KEY LEAK REVIEW (S1, 2026-07-13). sessionHeal folds
// six engine-internal provenance keys into a decision's signals (for the W7
// audit, which reads them RAW). None has a family-facing phrasebook translation,
// and two carry an id / a person — so ALL SIX are consciously excluded from
// SAFE_SIGNAL_KEYS and must drop for EVERY viewer, INCLUDING the author (unlike
// pin/visionName, which are the author's own data and survive for them).
// Whitelisting any of the six turns one of these red.
describe('W8/W9 provenance keys never reach the per-viewer projection', () => {
  const SIX = ['referenceLocatedCount', 'timeAnchorSuspect', 'gpsProv', 'handFiledStop', 'handFiledBy', 'dismissedBefore']
  const W89 = {
    evidence: 'gps',                          // a SAFE key — must survive (proves it's not a blackout)
    referenceLocatedCount: 3,
    timeAnchorSuspect: true,
    gpsProv: ['reference', 'inferred-presence'],
    handFiledStop: 's-secret',                // ⚠ a STOP ID
    handFiledBy: 'helen',                     // ⚠ a TRAVELER
    dismissedBefore: true,
  }

  it('all six are stripped for the AUTHOR too; the safe key survives', async () => {
    await seedTrip('t1', { days: [{ isoDate: '2026-07-01', stops: [{ id: 's1', name: 'The museum' }] }] })
    await seedMemory('m1', 't1')
    await seedDecision('t1', { memoryIds: ['m1'], placeId: 's1', placeName: 'The museum', signals: W89 })
    const jon = await listHealDecisionsForViewer(envShadow(), 't1', 'jonathan')
    expect(jon).toHaveLength(1)
    for (const k of SIX) expect(jon[0].signals[k]).toBeUndefined()
    expect(jon[0].signals.evidence).toBe('gps')
  })

  it('handFiledStop / handFiledBy never ride along even when they name a REAL hidden stop / person', async () => {
    // s-secret is a surprise stop hidden from helen; the decision's OWN place is
    // plain, so the row survives for both viewers — the only place the secret
    // appears is signals.handFiledStop, which the fail-closed whitelist drops.
    await seedTrip('t1', {
      days: [{ isoDate: '2026-07-01', stops: [
        { id: 's-secret', name: 'Whale watch', surprise: { author: 'jonathan', hideFrom: ['helen'] } },
        { id: 's-plain', name: 'Breakfast' },
      ] }],
    })
    await seedMemory('m1', 't1')
    await seedDecision('t1', { memoryIds: ['m1'], placeId: 's-plain', placeName: 'Breakfast',
      signals: { evidence: 'gps', handFiledStop: 's-secret', handFiledBy: 'jonathan' } })
    for (const viewer of ['helen', 'jonathan']) {
      const out = await listHealDecisionsForViewer(envShadow(), 't1', viewer)
      expect(out).toHaveLength(1)
      expect(out[0].signals.handFiledStop).toBeUndefined()
      expect(out[0].signals.handFiledBy).toBeUndefined()
      expect(out[0].signals.evidence).toBe('gps')
    }
  })
})
