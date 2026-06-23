import { test } from 'node:test'
import assert from 'node:assert/strict'

const { tripCompleteness, isTripPublishable } = await import('../../src/lib/tripComplete.js')

// A minimal trip that PASSES the publish gate: title, both dates, a summary, one
// day with a date + label, and no sparse stops. This is the "renders at parity"
// bar — NOT a road trip (no end city, no stops required).
function completeStayTrip() {
  return {
    title: 'A weekend at the cabin',
    dateRangeStart: '2026-07-03',
    dateRangeEnd: '2026-07-06',
    overview: 'Three quiet nights at the cabin.',
    days: [
      { isoDate: '2026-07-03', title: 'Arrive', stops: [] },
    ],
  }
}

test('a complete stay (no end city, no stops) is publishable', () => {
  const r = tripCompleteness(completeStayTrip())
  assert.equal(r.ok, true, r.missing.join(', '))
  assert.equal(isTripPublishable(completeStayTrip()), true)
})

test('end city is NOT required — a stay with none still publishes', () => {
  const t = completeStayTrip()
  delete t.endCity
  assert.equal(isTripPublishable(t), true)
})

test('stop TIME and ADDRESS are NOT required — only name/pitch/for gate a stop', () => {
  const t = completeStayTrip()
  t.days[0].stops = [
    // No time, no address — but named, with a pitch and a person tag.
    { name: 'Lunch in town', note: 'A nice break.', for: ['jonathan'] },
  ]
  assert.equal(isTripPublishable(t), true, tripCompleteness(t).missing.join(', '))
})

test('a sparse stop (missing pitch / who-for) blocks publish', () => {
  const t = completeStayTrip()
  t.days[0].stops = [{ name: 'Mystery stop' }] // no note, no for
  const r = tripCompleteness(t)
  assert.equal(r.ok, false)
  assert.ok(r.missing.some((m) => /the pitch/.test(m)))
  assert.ok(r.missing.some((m) => /who it's for/.test(m)))
})

test('the genuinely-required fields each block publish when missing', () => {
  for (const drop of ['title', 'overview']) {
    const t = completeStayTrip()
    delete t[drop]
    assert.equal(isTripPublishable(t), false, `missing ${drop} should block`)
  }
  const noDates = completeStayTrip()
  noDates.dateRangeStart = null
  assert.equal(isTripPublishable(noDates), false, 'missing start date should block')

  const noDays = completeStayTrip()
  noDays.days = []
  assert.equal(isTripPublishable(noDays), false, 'no days should block')
})

test('never throws on a null/garbage trip', () => {
  assert.equal(tripCompleteness(null).ok, false)
  assert.equal(tripCompleteness(undefined).ok, false)
  assert.equal(isTripPublishable({}), false)
})
