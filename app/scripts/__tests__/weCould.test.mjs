import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  WE_COULD_CATEGORIES,
  ALL_MEMBERS,
  mapNearbyResult,
  buildTray,
  estimateTravel,
  curationKey,
  normalizeCuration,
  applyCuration,
  togglePinned,
  toggleHidden,
  rankByConditions,
} = await import('../../src/lib/weCould.js')

const MEAL = WE_COULD_CATEGORIES[0]
const ENERGY = WE_COULD_CATEGORIES[1]

function place(over = {}) {
  return {
    placeId: 'p1',
    name: 'Mac\'s Shack',
    address: '91 Commercial St',
    lat: 41.93,
    lng: -70.02,
    distanceMeters: 800,
    openNow: true,
    phone: '+1 508-555-0101',
    ...over,
  }
}

// ── mapNearbyResult ──────────────────────────────────────────────────────
test('mapNearbyResult carries the place fields and the source category', () => {
  const card = mapNearbyResult(place(), MEAL)
  assert.equal(card.id, 'p1')
  assert.equal(card.source, 'nearby')
  assert.equal(card.cat, 'meal')
  assert.equal(card.catLabel, MEAL.label)
  assert.equal(card.name, "Mac's Shack")
  assert.equal(card.distanceMeters, 800)
  assert.equal(card.openNow, true)
  assert.deepEqual(card.suits, ALL_MEMBERS)
})

test('mapNearbyResult returns null for an unusable result (no name / no category)', () => {
  assert.equal(mapNearbyResult(null, MEAL), null)
  assert.equal(mapNearbyResult({ name: '' }, MEAL), null)
  assert.equal(mapNearbyResult(place(), null), null)
})

test('mapNearbyResult falls back to a synthetic id when placeId is missing', () => {
  const card = mapNearbyResult(place({ placeId: null }), MEAL)
  assert.equal(card.id, "Mac's Shack@41.93,-70.02")
})

test('mapNearbyResult tolerates a result with no coordinates', () => {
  const card = mapNearbyResult(place({ placeId: null, lat: null, lng: undefined }), MEAL)
  assert.equal(card.lat, null)
  assert.equal(card.lng, null)
  assert.equal(card.id, "name:Mac's Shack")
})

// ── buildTray ────────────────────────────────────────────────────────────
test('buildTray dedupes a place that appears under two categories; first wins', () => {
  const dup = place({ placeId: 'shared' })
  const tray = buildTray([
    { category: MEAL, results: [dup] },
    { category: ENERGY, results: [dup, place({ placeId: 'p2', name: 'Playground' })] },
  ])
  assert.equal(tray.length, 2)
  assert.equal(tray[0].id, 'shared')
  assert.equal(tray[0].cat, 'meal') // earlier category wins
  assert.equal(tray[1].id, 'p2')
})

test('buildTray interleaves categories round-robin so variety leads', () => {
  const tray = buildTray([
    { category: MEAL, results: [place({ placeId: 'm1' }), place({ placeId: 'm2' })] },
    { category: ENERGY, results: [place({ placeId: 'e1' }), place({ placeId: 'e2' })] },
  ])
  // one of each first, then the second of each — not m1,m2,e1,e2
  assert.deepEqual(tray.map((c) => c.id), ['m1', 'e1', 'm2', 'e2'])
})

test('buildTray skips unusable results and tolerates empty/missing input', () => {
  assert.deepEqual(buildTray(null), [])
  assert.deepEqual(buildTray([]), [])
  const tray = buildTray([{ category: MEAL, results: [{ name: '' }, place()] }])
  assert.equal(tray.length, 1)
})

// ── estimateTravel ───────────────────────────────────────────────────────
test('estimateTravel: short distance is a walk, longer is a drive', () => {
  assert.deepEqual(estimateTravel(400), { mode: 'walk', minutes: 5 })
  assert.deepEqual(estimateTravel(1200), { mode: 'walk', minutes: 15 })
  assert.equal(estimateTravel(6000).mode, 'drive')
  assert.equal(estimateTravel(6000).minutes, 10)
})

test('estimateTravel returns null when distance is unknown, never 0 minutes', () => {
  assert.equal(estimateTravel(null), null)
  assert.equal(estimateTravel(NaN), null)
  assert.equal(estimateTravel(10).minutes, 1) // floors at 1, never 0
})

// ── curation ─────────────────────────────────────────────────────────────
test('curationKey is namespaced + versioned and tolerates a missing trip id', () => {
  assert.equal(curationKey('volleyball-2026'), 'rt_wecould_v1:volleyball-2026')
  assert.equal(curationKey(undefined), 'rt_wecould_v1:unknown')
})

test('normalizeCuration coerces junk into clean string arrays', () => {
  assert.deepEqual(normalizeCuration(null), { pinned: [], hidden: [] })
  assert.deepEqual(
    normalizeCuration({ pinned: ['a', 2, null], hidden: 'nope' }),
    { pinned: ['a'], hidden: [] },
  )
})

test('applyCuration drops hidden and floats pinned to the top, stably', () => {
  const tray = [
    { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' },
  ]
  const view = applyCuration(tray, { pinned: ['c'], hidden: ['b'] })
  assert.deepEqual(view.map((x) => x.id), ['c', 'a', 'd'])
  assert.equal(view[0].pinned, true)
  assert.equal(view[1].pinned, false)
})

test('togglePinned adds then removes an id', () => {
  let c = togglePinned({ pinned: [], hidden: [] }, 'x')
  assert.deepEqual(c.pinned, ['x'])
  c = togglePinned(c, 'x')
  assert.deepEqual(c.pinned, [])
})

test('toggleHidden hides a card and un-pins it at the same time', () => {
  const c = toggleHidden({ pinned: ['x'], hidden: [] }, 'x')
  assert.deepEqual(c.hidden, ['x'])
  assert.deepEqual(c.pinned, []) // hiding a pinned card unpins it
})

test('togglePinned un-hides a card when pinning it (symmetric invariant)', () => {
  const c = togglePinned({ pinned: [], hidden: ['x'] }, 'x')
  assert.deepEqual(c.pinned, ['x'])
  assert.deepEqual(c.hidden, []) // pinning a hidden card un-hides it — never both
})

test('toggleHidden un-hides on a second toggle', () => {
  let c = toggleHidden({ pinned: [], hidden: [] }, 'x')
  assert.deepEqual(c.hidden, ['x'])
  c = toggleHidden(c, 'x')
  assert.deepEqual(c.hidden, [])
})

// ── rankByConditions (slice 7) ──────────────────────────────────────────
const TRAY = [
  { id: 'e1', cat: 'energy' },
  { id: 'm1', cat: 'meal' },
  { id: 'l1', cat: 'look' },
  { id: 't1', cat: 'treat' },
]

test('rankByConditions: rain floats sheltered up, outdoor down, with a reason', () => {
  const { tray, reason } = rankByConditions(TRAY, { weather: { kind: 'rain', tempF: 55, precipProbPct: 80 } })
  const order = tray.map((c) => c.cat)
  // sheltered (meal/treat) before exposed (energy/look)
  assert.ok(order.indexOf('treat') < order.indexOf('energy'))
  assert.ok(order.indexOf('meal') < order.indexOf('look'))
  assert.match(reason, /rain/i)
})

test('rankByConditions: a mild clear day does NOT reorder and shows no banner', () => {
  const { tray, reason } = rankByConditions(TRAY, { weather: { kind: 'clear', tempF: 70, precipProbPct: 10 } })
  assert.deepEqual(tray.map((c) => c.id), ['e1', 'm1', 'l1', 't1'])
  assert.equal(reason, null)
})

test('rankByConditions: heat floats the cool treat to the top', () => {
  const { tray, reason } = rankByConditions(TRAY, { weather: { kind: 'clear', tempF: 92 } })
  assert.equal(tray[0].cat, 'treat')
  assert.match(reason, /hot/i)
})

test('rankByConditions: snow reads as cozy-indoor', () => {
  const { reason } = rankByConditions(TRAY, { weather: { kind: 'snow', tempF: 28 } })
  assert.match(reason, /snow|cozy|indoor/i)
})

test('rankByConditions: no weather (null) leaves the tray + no banner', () => {
  const a = rankByConditions(TRAY, null)
  assert.deepEqual(a.tray.map((c) => c.id), ['e1', 'm1', 'l1', 't1'])
  assert.equal(a.reason, null)
  const b = rankByConditions(TRAY, { weather: null, tide: { state: 'rising' } })
  assert.equal(b.reason, null)
})
