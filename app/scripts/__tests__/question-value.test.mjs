import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreQuestions } from '../../src/lib/healLoop.js'

// Places whose NAMES imply kinds: a beach, a restaurant, a second beach.
const PLACES = [
  { id: 'cove', name: 'Herring Cove' }, // beach
  { id: 'foods', name: 'Angel Foods' }, // restaurant
  { id: 'race', name: 'Race Point Beach' }, // beach
]
const askR = { destination: 'ask', membership: {} }
const leaveR = { destination: 'leave', membership: {} }
const cluster = (ids, a, b, reach = ids.length) => ({ photoIds: ids, candidates: [{ placeId: a, score: 1 }, { placeId: b, score: 0.9 }], reach })

test('CAPTCHA lookability: different-KIND candidates outrank same-kind at equal reach', () => {
  const pts = [
    { id: 'a1', visionName: 'Lunch counter', placeType: 'restaurant' },
    { id: 'a2', visionName: 'Lunch counter', placeType: 'restaurant' },
    { id: 'b1', visionName: 'On the sand', placeType: 'beach' },
    { id: 'b2', visionName: 'On the sand', placeType: 'beach' },
  ]
  const results = new Map(pts.map((p) => [p.id, askR]))
  const qs = scoreQuestions(
    [cluster(['a1', 'a2'], 'cove', 'foods'), cluster(['b1', 'b2'], 'cove', 'race')],
    results, pts, PLACES,
  )
  assert.equal(qs[0].photoIds[0], 'a1', 'beach-vs-restaurant (tell by LOOKING) is asked before beach-vs-beach')
  assert.ok(qs[0].answerability > qs[1].answerability)
  assert.ok(qs[0].candidates.every((c) => c.name && c.kind !== undefined), 'candidates arrive named, human-shaped')
})

test('teaching value: a question whose answer teaches many similar unresolved photos ranks higher', () => {
  const member = { id: 'm1', visionName: 'Museum hall', placeType: 'museum', labels: ['sculpture'] }
  const lonely = { id: 'l1', visionName: 'Odd frame', placeType: 'street', labels: ['pole'] }
  // six unresolved photos that LOOK like the museum moment — the answer becomes their exemplar
  const lookalikes = Array.from({ length: 6 }, (_, i) => ({ id: `u${i}`, visionName: 'Museum hall', placeType: 'museum', labels: ['sculpture'], }))
  const pts = [member, lonely, ...lookalikes]
  const results = new Map([[member.id, askR], [lonely.id, askR], ...lookalikes.map((p) => [p.id, leaveR])])
  const qs = scoreQuestions(
    [cluster([member.id], 'cove', 'foods'), cluster([lonely.id], 'cove', 'foods')],
    results, pts, PLACES,
  )
  assert.equal(qs[0].photoIds[0], 'm1', 'the teaching question comes first')
  assert.ok(qs[0].taught >= 6, `it knows it teaches (${qs[0].taught} lookalikes)`)
  assert.ok(qs[0].value > qs[1].value)
})

test('a question carries its human-shaped content: the moment name + named candidates', () => {
  const pts = [
    { id: 'p1', visionName: 'July 4th parade', placeType: 'event' },
    { id: 'p2', visionName: 'July 4th parade', placeType: 'event' },
    { id: 'p3', visionName: 'Crowd on the street', placeType: 'street' },
  ]
  const results = new Map(pts.map((p) => [p.id, askR]))
  const [q] = scoreQuestions([cluster(['p1', 'p2', 'p3'], 'cove', 'foods')], results, pts, PLACES)
  assert.equal(q.momentName, 'July 4th parade', 'the dominant vision name names the moment')
  assert.deepEqual(q.candidates.map((c) => c.name), ['Herring Cove', 'Angel Foods'])
})

test('an unanswerable question is flagged NOT worth asking (it would spend delight on a shrug)', () => {
  // same-kind candidates, no signage, no vision name, a lone stray frame
  const pts = [{ id: 's1', placeType: 'beach' }]
  const results = new Map([['s1', askR]])
  const [q] = scoreQuestions([cluster(['s1'], 'cove', 'race')], results, pts, PLACES)
  assert.equal(q.worthAsking, false, 'beach-vs-beach with nothing to recognise stays unasked')
})
