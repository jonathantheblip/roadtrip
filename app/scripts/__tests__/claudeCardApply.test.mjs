// Unit tests for applyCardToTrip — the pure function that maps a
// confirmation-card payload (post user edits) to a next-trip snapshot.
// Pure: no I/O, no React, no globals beyond a faked crypto.randomUUID
// for stable add-stop IDs. The e2e suite covers the same shapes against
// a live render; this spec pins the data math on its own so a card-shape
// regression surfaces here first, before exercising the full surface.

import test from 'node:test'
import assert from 'node:assert/strict'

import { applyCardToTrip, userFacingApplyError } from '../../src/lib/claudeCardApply.js'
import { humanDateRange } from '../../src/lib/createTripCard.js'

// A fixture trip with the same shape as the production seed: id, days
// array with .n + .stops. Keep it minimal — three days, one stop each —
// so the diff in each test stays readable.
function fixtureTrip() {
  return {
    id: 'volleyball-2026',
    title: 'Fun @ the Sun',
    days: [
      {
        n: 1,
        date: 'Fri May 22',
        stops: [{ id: 'vb1-3', time: 'Evening', name: 'Beach Bungalow', kind: 'lodging' }],
      },
      {
        n: 2,
        date: 'Sat May 23',
        stops: [{ id: 'vb2-3', time: '3:45 PM', name: 'vs BEV 13 Empire', kind: 'tournament', address: 'Court 1, Mohegan Sun' }],
      },
      {
        n: 3,
        date: 'Sun May 24',
        stops: [{ id: 'vb3-4', time: '4:00 PM', name: 'Match 1 vs Northeast 13.2', kind: 'tournament' }],
      },
    ],
  }
}

test('applyCardToTrip — add appends a new stop to the named day', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'add',
    id: 'c-add-sift',
    title: 'Sift Bake Shop',
    fields: [
      { name: 'time', value: '8:00 AM' },
      { name: 'address', value: '5 Water St, Mystic CT' },
      { name: 'kind', value: 'breakfast' },
    ],
    target: { tripId: 'volleyball-2026', dayN: 3, position: 'end' },
  }
  const next = applyCardToTrip(trip, card)
  const day3 = next.days.find((d) => d.n === 3)
  assert.equal(day3.stops.length, 2, 'day 3 gains one stop')
  const added = day3.stops[1]
  assert.equal(added.name, 'Sift Bake Shop')
  assert.equal(added.time, '8:00 AM')
  assert.equal(added.address, '5 Water St, Mystic CT')
  assert.equal(added.kind, 'breakfast', 'kind is lowercased canonical')
  assert.equal(added.source, 'claude', 'claude-authored marker for the album/audit')
  assert.equal(added.claudeMeta.cardId, 'c-add-sift', 'cardId stamp persists for re-load detection')
  // Original trip untouched (purity).
  assert.equal(trip.days.find((d) => d.n === 3).stops.length, 1)
})

test('applyCardToTrip — add tags the stop for the TRIP’s travelers, not a hardcoded family of four', () => {
  // A two-person trip (the kids stayed home). A stop Claude adds must be "for"
  // the two who are actually travelling — not silently include Aurelia + Rafa.
  const trip = { ...fixtureTrip(), travelers: ['jonathan', 'helen'] }
  const card = {
    action: 'add',
    id: 'c-add-2p',
    title: 'Wine bar',
    fields: [{ name: 'time', value: '7:00 PM' }],
    target: { tripId: 'volleyball-2026', dayN: 3, position: 'end' },
  }
  const next = applyCardToTrip(trip, card)
  const added = next.days.find((d) => d.n === 3).stops.at(-1)
  assert.deepEqual(added.for, ['jonathan', 'helen'], 'for = the trip party, not all four')
})

test('applyCardToTrip — add throws when target.dayN is not on the trip', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'add',
    id: 'c-bad-day',
    title: 'Nowhere stop',
    fields: [{ name: 'time', value: '9:00 AM' }],
    target: { tripId: 'volleyball-2026', dayN: 99 },
  }
  assert.throws(() => applyCardToTrip(trip, card), /day 99 not found/)
})

test('applyCardToTrip — move updates the targeted stop in place', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'move',
    id: 'c-move-sat',
    title: 'Reschedule Saturday match',
    fields: [
      { name: 'time', value: '11:00 AM', previousValue: '3:45 PM' },
      { name: 'address', value: 'Court 3, Mohegan Sun', previousValue: 'Court 1, Mohegan Sun' },
    ],
    target: { tripId: 'volleyball-2026', stopId: 'vb2-3', dayN: 2 },
  }
  const next = applyCardToTrip(trip, card)
  const day2 = next.days.find((d) => d.n === 2)
  const moved = day2.stops.find((s) => s.id === 'vb2-3')
  assert.equal(moved.time, '11:00 AM')
  assert.equal(moved.address, 'Court 3, Mohegan Sun')
  assert.equal(moved.name, 'vs BEV 13 Empire', 'unmodified fields stay intact')
  assert.equal(moved.claudeMeta.cardId, 'c-move-sat')
  // The match is still on day 2 (no cross-day move requested).
  assert.equal(day2.stops.length, 1)
})

test('applyCardToTrip — move relocates across days when target.dayN differs', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'move',
    id: 'c-relocate',
    title: 'Move Sunday match to Saturday',
    fields: [{ name: 'time', value: '5:00 PM', previousValue: '4:00 PM' }],
    target: { tripId: 'volleyball-2026', stopId: 'vb3-4', dayN: 2 },
  }
  const next = applyCardToTrip(trip, card)
  const day2 = next.days.find((d) => d.n === 2)
  const day3 = next.days.find((d) => d.n === 3)
  assert.equal(day3.stops.length, 0, 'stop removed from old day')
  assert.equal(day2.stops.length, 2, 'stop appended to new day')
  const moved = day2.stops.find((s) => s.id === 'vb3-4')
  assert.equal(moved.time, '5:00 PM')
})

test('applyCardToTrip — move throws when stopId is missing or unknown', () => {
  const trip = fixtureTrip()
  assert.throws(
    () => applyCardToTrip(trip, { action: 'move', target: {} }),
    /target\.stopId required/
  )
  assert.throws(
    () => applyCardToTrip(trip, { action: 'move', target: { stopId: 'ghost' } }),
    /stop ghost not found/
  )
})

test('applyCardToTrip — cancel removes the stop from its day', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'cancel',
    id: 'c-cancel-sun',
    title: 'Remove Sunday match',
    target: { tripId: 'volleyball-2026', stopId: 'vb3-4' },
  }
  const next = applyCardToTrip(trip, card)
  const day3 = next.days.find((d) => d.n === 3)
  assert.equal(day3.stops.length, 0)
  // Other days untouched.
  assert.equal(next.days.find((d) => d.n === 2).stops.length, 1)
})

test('applyCardToTrip — multi applies each non-skipped sub-edit', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'multi',
    id: 'c-multi-weekend',
    edits: [
      {
        action: 'move',
        title: 'Saturday match earlier',
        target: { tripId: 'volleyball-2026', stopId: 'vb2-3' },
        fields: [{ name: 'time', value: '10:00 AM', previousValue: '3:45 PM' }],
      },
      {
        action: 'cancel',
        title: 'Sunday match',
        target: { tripId: 'volleyball-2026', stopId: 'vb3-4' },
      },
    ],
    target: { tripId: 'volleyball-2026' },
  }
  const next = applyCardToTrip(trip, card)
  assert.equal(next.days.find((d) => d.n === 2).stops.find((s) => s.id === 'vb2-3').time, '10:00 AM')
  assert.equal(next.days.find((d) => d.n === 3).stops.length, 0)
})

test('applyCardToTrip — multi honors `skipped: true` on a sub-edit', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'multi',
    id: 'c-multi-skip',
    edits: [
      {
        action: 'move',
        title: 'Saturday earlier',
        target: { tripId: 'volleyball-2026', stopId: 'vb2-3' },
        fields: [{ name: 'time', value: '10:00 AM' }],
      },
      {
        action: 'cancel',
        title: 'Sunday match (skipped)',
        target: { tripId: 'volleyball-2026', stopId: 'vb3-4' },
        skipped: true,
      },
    ],
  }
  const next = applyCardToTrip(trip, card)
  assert.equal(next.days.find((d) => d.n === 2).stops.find((s) => s.id === 'vb2-3').time, '10:00 AM')
  assert.equal(
    next.days.find((d) => d.n === 3).stops.length,
    1,
    'skipped cancel did not run'
  )
})

test('applyCardToTrip — unknown action throws', () => {
  const trip = fixtureTrip()
  assert.throws(
    () => applyCardToTrip(trip, { action: 'mutate-everything', target: {} }),
    /unknown action/
  )
})

test('applyCardToTrip — works against trip.data.days shape (D1 row format)', () => {
  // The Worker returns trips with a nested `data.days` shape;
  // applyCardToTrip must handle both seed-shape (root .days) and
  // D1-shape (.data.days).
  const trip = {
    id: 'volleyball-2026',
    data: fixtureTrip(),
  }
  const card = {
    action: 'cancel',
    id: 'c-cancel-d1',
    target: { tripId: 'volleyball-2026', stopId: 'vb1-3' },
  }
  const next = applyCardToTrip(trip, card)
  assert.ok(next.data, 'data branch preserved')
  assert.equal(next.data.days.find((d) => d.n === 1).stops.length, 0)
})

// ─── Commit 1 — trip-level misroute guard ─────────────────────────────
// A trip-level edit (set destination, rename, change dates) that arrives
// mis-tagged `add` must FAIL LOUD, never silently create a junk stop.
// applyAdd only needs a dayN, so without the dispatcher guard a card
// carrying endCity/dates/etc. would fall through into stop creation.
test('applyCardToTrip — a trip-level-field card tagged "add" throws instead of creating a stop', () => {
  const trip = fixtureTrip()
  const before = JSON.stringify(trip)
  const card = {
    action: 'add',
    id: 'c-set-dest',
    title: 'Set destination to Boston',
    target: { tripId: 'volleyball-2026', dayN: 1 },
    fields: [{ name: 'endCity', value: 'Boston, MA' }],
  }
  assert.throws(() => applyCardToTrip(trip, card), /trip-level field/)
  // No stop was created and the trip is untouched (pure — no mutation
  // even on the throw path).
  assert.equal(trip.days[0].stops.length, 1, 'no junk stop appended to day 1')
  assert.equal(JSON.stringify(trip), before, 'trip object not mutated')
})

test('applyCardToTrip — guard catches date-change tagged "add" yet leaves a real stop-add working', () => {
  const trip = fixtureTrip()
  // A date-change card mis-tagged add.
  assert.throws(
    () =>
      applyCardToTrip(trip, {
        action: 'add',
        id: 'c-dates',
        target: { tripId: 'volleyball-2026', dayN: 2 },
        fields: [
          { name: 'dateRangeStart', value: '2026-05-22' },
          { name: 'dateRangeEnd', value: '2026-05-25' },
        ],
      }),
    /trip-level field/
  )
  // A real stop add (only stop fields) still works — guard is precise.
  const ok = applyCardToTrip(trip, {
    action: 'add',
    id: 'c-real-add',
    title: 'Morning coffee',
    target: { tripId: 'volleyball-2026', dayN: 1 },
    fields: [{ name: 'time', value: '8:00 AM' }],
  })
  assert.equal(ok.days[0].stops.length, 2, 'legitimate stop-add unaffected by guard')
})

// ─── Commit 2 — trip-settings applier ─────────────────────────────────
// applySettings writes ONLY trip-level fields (destination, title,
// dates, …) and leaves days/stops untouched (same reference).
test('applyCardToTrip — trip-settings sets endCity + title without touching stops', () => {
  const trip = fixtureTrip()
  const stopCountsBefore = trip.days.map((d) => d.stops.length)
  const card = {
    action: 'trip-settings',
    id: 'c-settings-1',
    title: 'Trip settings',
    target: { tripId: 'volleyball-2026' },
    fields: [
      { name: 'endCity', value: 'Boston, MA' },
      { name: 'title', value: 'Beach Weekend' },
    ],
  }
  const next = applyCardToTrip(trip, card)
  assert.equal(next.endCity, 'Boston, MA')
  assert.equal(next.title, 'Beach Weekend')
  // Stops are untouched: same days array reference, same stop counts.
  assert.equal(next.days, trip.days, 'days array passed through by reference — stops untouched')
  assert.deepEqual(next.days.map((d) => d.stops.length), stopCountsBefore)
})

test('applyCardToTrip — trip-settings accepts `destination` alias for endCity', () => {
  const next = applyCardToTrip(fixtureTrip(), {
    action: 'trip-settings',
    id: 'c-settings-dest',
    target: { tripId: 'volleyball-2026' },
    fields: [{ name: 'destination', value: 'Portland, ME' }],
  })
  assert.equal(next.endCity, 'Portland, ME')
})

test('applyCardToTrip — trip-settings sets dates and recomputes the human dateRange', () => {
  const next = applyCardToTrip(fixtureTrip(), {
    action: 'trip-settings',
    id: 'c-settings-dates',
    target: { tripId: 'volleyball-2026' },
    fields: [
      { name: 'dateRangeStart', value: '2026-05-22' },
      { name: 'dateRangeEnd', value: '2026-05-25' },
    ],
  })
  assert.equal(next.dateRangeStart, '2026-05-22')
  assert.equal(next.dateRangeEnd, '2026-05-25')
  // Same formatter cardToTrip uses — reuse, not a reimplementation.
  assert.equal(next.dateRange, humanDateRange('2026-05-22', '2026-05-25'))
})

test('applyCardToTrip — trip-settings is a precise patch: untouched fields survive, one field changes', () => {
  const trip = fixtureTrip()
  trip.endCity = 'Old City'
  trip.startCity = 'Belmont, MA'
  const next = applyCardToTrip(trip, {
    action: 'trip-settings',
    id: 'c-settings-precise',
    target: { tripId: 'volleyball-2026' },
    fields: [{ name: 'subtitle', value: 'A long weekend at the shore' }],
  })
  assert.equal(next.subtitle, 'A long weekend at the shore')
  assert.equal(next.overview, 'A long weekend at the shore', 'subtitle mirrors to overview')
  assert.equal(next.startCity, 'Belmont, MA', 'unrelated field untouched')
  assert.equal(next.endCity, 'Old City', 'unrelated field untouched')
})

// ─── trip-settings can flip the trip KIND (shape) — "ask Claude to change the type" ──
test('applyCardToTrip — trip-settings flips the trip shape (stay/route), stops untouched', () => {
  const trip = fixtureTrip()
  const next = applyCardToTrip(trip, {
    action: 'trip-settings',
    id: 'c-shape-stay',
    target: { tripId: 'volleyball-2026' },
    fields: [{ name: 'shape', value: 'stay' }],
  })
  assert.equal(next.shape, 'stay') // "make this a hangout/chill stay" → the stay home shell
  assert.equal(next.days, trip.days, 'stops untouched — days passed through by reference')
  assert.equal(
    applyCardToTrip(fixtureTrip(), {
      action: 'trip-settings', id: 'c-shape-route', target: { tripId: 'volleyball-2026' },
      fields: [{ name: 'shape', value: 'route' }],
    }).shape,
    'route'
  )
})

test('applyCardToTrip — an unrecognized shape value FAILS LOUD instead of silently saving nothing', () => {
  // Behavior change with the no-op guard (2026-07-02): a shape-only card
  // whose value is a loose word ("lazy") used to save "successfully" while
  // changing nothing — the silent-lie class. The bad value is still never
  // WRITTEN (a real road trip can't be flipped by a leaked word — G5), but
  // now the reader hears "that didn't apply" instead of a false Saved ✓.
  const trip = fixtureTrip()
  trip.shape = 'route'
  assert.throws(
    () =>
      applyCardToTrip(trip, {
        action: 'trip-settings',
        id: 'c-shape-bad',
        target: { tripId: 'volleyball-2026' },
        fields: [{ name: 'shape', value: 'lazy' }],
      }),
    /no-op/
  )
  assert.equal(trip.shape, 'route', 'existing shape stands — bad value never written')
})

test('applyCardToTrip — a shape-only card mis-tagged "add" is caught as a trip-settings edit, not a junk stop', () => {
  assert.throws(
    () =>
      applyCardToTrip(fixtureTrip(), {
        action: 'add',
        id: 'c-shape-stray',
        target: { tripId: 'volleyball-2026', dayN: 1 },
        fields: [{ name: 'shape', value: 'stay' }],
      }),
    /trip-level field/
  )
})

test('applyCardToTrip — trip-settings writes to .data level on the D1 row shape, stops untouched', () => {
  const trip = { id: 'volleyball-2026', data: fixtureTrip() }
  const next = applyCardToTrip(trip, {
    action: 'trip-settings',
    id: 'c-settings-d1',
    target: { tripId: 'volleyball-2026' },
    fields: [{ name: 'endCity', value: 'Mystic, CT' }],
  })
  assert.ok(next.data, 'data branch preserved')
  assert.equal(next.data.endCity, 'Mystic, CT', 'field written at .data level')
  assert.equal(next.data.days, trip.data.days, 'days passed through by reference — stops untouched')
})

// ─── Commit 3 — plain-language apply-error mapping ────────────────────
// The reader never sees a raw internal error from the apply path — only
// one of three plain strings. The raw detail goes to the dev log at the
// call site (ConfirmCard.handleSave), not into the UI.
test('userFacingApplyError — not-found errors map to a plain line, no raw internals leak', () => {
  for (const raw of [
    'applyMove: stop vb9-9 not found',
    'applyAdd: day 9 not found in trip',
    'applyMove: target day 5 not found',
    'applyCancel: stop vbX not found',
  ]) {
    const s = userFacingApplyError(new Error(raw))
    assert.match(s, /find that day or stop/i)
    assert.doesNotMatch(s, /apply(Move|Add|Cancel)|vb9|day 9/i, 'no raw internal text leaks')
  }
})

test('userFacingApplyError — the trip-level guard error maps to a plain trip-change line', () => {
  const raw =
    'applyCardToTrip: card tagged "add" carries trip-level field(s) [endCity] — this is a trip-settings edit, not a stop add; refusing to create a stop'
  const s = userFacingApplyError(new Error(raw))
  assert.match(s, /trip change/i)
  assert.doesNotMatch(s, /applyCardToTrip|endCity|refusing/i, 'no raw internal text leaks')
})

test('userFacingApplyError — unknown errors fall back to a generic plain line, never the raw message', () => {
  const s = userFacingApplyError(
    new TypeError("Cannot read properties of undefined (reading 'days')")
  )
  assert.match(s, /something went wrong applying that change/i)
  assert.doesNotMatch(s, /TypeError|undefined|reading/i, 'no raw internal text leaks')
})

test('userFacingApplyError — tolerates a non-Error argument (string / null)', () => {
  assert.match(userFacingApplyError('stop xyz not found'), /find that day or stop/i)
  assert.match(userFacingApplyError(null), /something went wrong/i)
})

// ─── P0 (2026-07-02) — the SILENT NO-OP class ─────────────────────────
// LIVE BUG (Provincetown, 2026-07-01): "swap tonight's dinner + push the
// other to Thursday" → the card said Saved ✓ TWICE and the trip never
// changed. Root cause: the worker prompt's own `edits` example shows
// sub-edits as { action, title, from, to } — no fields[], so fieldMap()
// = {} and applyMove writes nothing (from/to are display prose, not
// canonical fields). An apply that resolves to ZERO canonical changes
// must FAIL LOUD (G6/G7), never report success.

test('applyCardToTrip — a multi card shaped like the REAL captured model reply (per-edit target, NO fields) fails loud', () => {
  // Shape lifted from _fixtures/claude-cards/multi-change.sse — what
  // claude-sonnet-4-6 actually emitted under the pre-fix prompt.
  const trip = fixtureTrip()
  const before = JSON.stringify(trip)
  const card = {
    action: 'multi',
    id: 'c-dinner-swap',
    eyebrow: 'DAY 2 · SAT MAY 23',
    title: 'Swap dinner + push the match',
    edits: [
      {
        action: 'move',
        title: 'vs BEV 13 Empire',
        from: '3:45 PM',
        to: '11:00 AM',
        target: { tripId: 'volleyball-2026', stopId: 'vb2-3' },
      },
    ],
    target: { tripId: 'volleyball-2026' },
  }
  assert.throws(() => applyCardToTrip(trip, card), /no-op/)
  assert.equal(JSON.stringify(trip), before, 'trip untouched on the throw path')
})

test('applyCardToTrip — a multi card shaped VERBATIM like the worker prompt example (no per-edit target either) fails loud', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'multi',
    id: 'c-prompt-example',
    edits: [
      { action: 'move', title: 'Sift Bake Shop', from: '8:00 AM', to: '9:00 AM' },
      { action: 'cancel', title: 'Lobster Roll Co.', note: 'Most skippable.' },
    ],
    // The parent target carries a stopId — pre-fix, BOTH sub-edits
    // silently inherited it: the move no-oped on it and the cancel would
    // have deleted the WRONG stop (the parent's, not "Lobster Roll Co.").
    target: { tripId: 'volleyball-2026', stopId: 'vb2-3' },
  }
  assert.throws(() => applyCardToTrip(trip, card), /own target\.stopId|no-op/)
  // vb2-3 survives — the inherited-target cancel never ran.
  assert.ok(
    trip.days.find((d) => d.n === 2).stops.find((s) => s.id === 'vb2-3'),
    'parent-target stop NOT deleted by an inherited-target cancel'
  )
})

test('applyCardToTrip — a single move card with zero canonical fields and no day change fails loud', () => {
  const trip = fixtureTrip()
  assert.throws(
    () =>
      applyCardToTrip(trip, {
        action: 'move',
        id: 'c-empty-move',
        title: 'Reschedule',
        from: '3:45 PM',
        to: '11:00 AM',
        target: { tripId: 'volleyball-2026', stopId: 'vb2-3' },
      }),
    /no-op/
  )
})

test('applyCardToTrip — a move with ONLY a cross-day relocation (no fields) still works', () => {
  // Moving a stop to another day without editing its fields is a real,
  // legitimate change — the guard must not catch it.
  const trip = fixtureTrip()
  const next = applyCardToTrip(trip, {
    action: 'move',
    id: 'c-day-only',
    title: 'Push Sunday match to Saturday',
    target: { tripId: 'volleyball-2026', stopId: 'vb3-4', dayN: 2 },
  })
  assert.equal(next.days.find((d) => d.n === 3).stops.length, 0, 'left the old day')
  assert.equal(next.days.find((d) => d.n === 2).stops.length, 2, 'landed on the new day')
})

test('applyCardToTrip — a trip-settings card with no recognized fields fails loud', () => {
  const trip = fixtureTrip()
  assert.throws(
    () =>
      applyCardToTrip(trip, {
        action: 'trip-settings',
        id: 'c-empty-settings',
        target: { tripId: 'volleyball-2026' },
        fields: [{ name: 'vibe', value: 'cozier' }],
      }),
    /no-op/
  )
})

test('applyCardToTrip — a multi card with empty or all-skipped edits fails loud', () => {
  const trip = fixtureTrip()
  assert.throws(
    () => applyCardToTrip(trip, { action: 'multi', id: 'c-empty', edits: [], target: {} }),
    /no-op|no live edits/
  )
  assert.throws(
    () =>
      applyCardToTrip(trip, {
        action: 'multi',
        id: 'c-all-skipped',
        edits: [
          {
            action: 'cancel',
            title: 'Sunday match',
            target: { tripId: 'volleyball-2026', stopId: 'vb3-4' },
            skipped: true,
          },
        ],
      }),
    /no-op|no live edits/
  )
})

test('applyCardToTrip — a multi still works when every sub-edit carries its own target + fields (the good shape)', () => {
  // The shape the fixed prompt now demands — and what the e2e fixtures
  // already used. Pins that the guard doesn't over-reach.
  const trip = fixtureTrip()
  const next = applyCardToTrip(trip, {
    action: 'multi',
    id: 'c-good-multi',
    edits: [
      {
        action: 'move',
        title: 'Saturday match',
        from: '3:45 PM',
        to: '11:00 AM',
        target: { tripId: 'volleyball-2026', stopId: 'vb2-3' },
        fields: [{ name: 'time', value: '11:00 AM', previousValue: '3:45 PM' }],
      },
      {
        action: 'cancel',
        title: 'Sunday match',
        target: { tripId: 'volleyball-2026', stopId: 'vb3-4' },
      },
    ],
    target: { tripId: 'volleyball-2026' },
  })
  assert.equal(next.days.find((d) => d.n === 2).stops.find((s) => s.id === 'vb2-3').time, '11:00 AM')
  assert.equal(next.days.find((d) => d.n === 3).stops.length, 0)
})

test('userFacingApplyError — the no-op guard maps to a plain "nothing to save" line, no internals leak', () => {
  for (const raw of [
    'applyMove: card carried no editable stop fields and no day change — refusing a no-op save',
    'applySettings: card carried no recognized trip-level changes — refusing a no-op save',
    'applyMulti: no live edits on the card — refusing a no-op save',
    'applyMulti: sub-edit "Lobster Roll Co." (cancel) needs its own target.stopId — refusing to guess the stop',
  ]) {
    const s = userFacingApplyError(new Error(raw))
    assert.match(s, /didn.t actually carry a change|didn.t include an actual change/i)
    assert.doesNotMatch(s, /applyMove|applyMulti|applySettings|stopId|no-op/i, 'no raw internals leak')
  }
})

// ─── P0 follow-ups from the adversarial review (2026-07-02) ───────────

test('applyCardToTrip — a move that merely ECHOES the stop’s current values fails loud (value-based guard)', () => {
  // Same lived experience as the dinner bug, different card shape: the
  // model emits real canonical fields whose values equal what the stop
  // already holds. Nothing would change; "Saved ✓" would be a lie.
  const trip = fixtureTrip()
  assert.throws(
    () =>
      applyCardToTrip(trip, {
        action: 'move',
        id: 'c-echo',
        title: 'Reschedule Saturday match',
        fields: [
          { name: 'time', value: '3:45 PM', previousValue: '3:45 PM' },
          { name: 'address', value: 'Court 1, Mohegan Sun' },
        ],
        target: { tripId: 'volleyball-2026', stopId: 'vb2-3' },
      }),
    /no-op/
  )
})

test('applyCardToTrip — a move card using the prompt-blessed `description` alias SAVES the note', () => {
  // worker prompt Rules: "the applier also accepts `notes` / `description`"
  // — that must be true for move (editing an existing stop), not just add.
  const trip = fixtureTrip()
  const next = applyCardToTrip(trip, {
    action: 'move',
    id: 'c-desc-alias',
    title: 'Note on the match',
    fields: [{ name: 'description', value: 'Bring the cooler.' }],
    target: { tripId: 'volleyball-2026', stopId: 'vb2-3' },
  })
  assert.equal(
    next.days.find((d) => d.n === 2).stops.find((s) => s.id === 'vb2-3').note,
    'Bring the cooler.'
  )
  // And `location` maps to address, mirroring applyAdd.
  const next2 = applyCardToTrip(trip, {
    action: 'move',
    id: 'c-loc-alias',
    fields: [{ name: 'location', value: 'Court 9, Mohegan Sun' }],
    target: { tripId: 'volleyball-2026', stopId: 'vb2-3' },
  })
  assert.equal(
    next2.days.find((d) => d.n === 2).stops.find((s) => s.id === 'vb2-3').address,
    'Court 9, Mohegan Sun'
  )
})

test('applyCardToTrip — a mixed multi (one real row + one empty row) fails naming the EMPTY row, trip untouched', () => {
  const trip = fixtureTrip()
  const before = JSON.stringify(trip)
  const card = {
    action: 'multi',
    id: 'c-mixed',
    edits: [
      {
        action: 'move',
        title: 'Saturday match',
        target: { tripId: 'volleyball-2026', stopId: 'vb2-3' },
        fields: [{ name: 'time', value: '10:00 AM', previousValue: '3:45 PM' }],
      },
      {
        action: 'move',
        title: 'Beach Bungalow',
        from: 'Evening',
        to: 'Late',
        target: { tripId: 'volleyball-2026', stopId: 'vb1-3' },
        // no fields — the empty-row shape
      },
    ],
    target: { tripId: 'volleyball-2026' },
  }
  assert.throws(() => applyCardToTrip(trip, card), /sub-edit "Beach Bungalow" carried no actual change/)
  assert.equal(JSON.stringify(trip), before, 'atomic — the good row did not half-apply')
})

test('userFacingApplyError — a no-op ROW in a batch is named, so the reader knows what to Skip', () => {
  const s = userFacingApplyError(
    new Error(
      'applyMulti: sub-edit "Beach Bungalow" carried no actual change — skip that row to save the rest (refusing a no-op save)'
    )
  )
  assert.match(s, /Beach Bungalow/)
  assert.match(s, /skip that row/i)
  assert.doesNotMatch(s, /applyMulti|no-op/i, 'no raw internals leak')
})

test('userFacingApplyError — a stop TITLE containing "not found" cannot steer the mapping to the wrong branch', () => {
  const s = userFacingApplyError(
    new Error(
      'applyMulti: sub-edit "Lost & Not Found Museum" (cancel) needs its own target.stopId — refusing to guess the stop'
    )
  )
  assert.match(s, /didn.t actually carry a change/i, 'maps to the no-op line, not the not-found line')
})

test('applyCardToTrip — cross-day move via target.dayN plus a retime field still lands on the new day', () => {
  // The "push dinner to Thursday at 7" shape the prompt now teaches:
  // stopId + destination dayN + a time field.
  const trip = fixtureTrip()
  const next = applyCardToTrip(trip, {
    action: 'move',
    id: 'c-cross-retime',
    title: 'Push the match to Sunday at 1',
    fields: [{ name: 'time', value: '1:00 PM', previousValue: '3:45 PM' }],
    target: { tripId: 'volleyball-2026', stopId: 'vb2-3', dayN: 3 },
  })
  const day3 = next.days.find((d) => d.n === 3)
  const moved = day3.stops.find((s) => s.id === 'vb2-3')
  assert.ok(moved, 'landed on the destination day')
  assert.equal(moved.time, '1:00 PM')
  assert.equal(next.days.find((d) => d.n === 2).stops.length, 0, 'left the old day')
})

// ─── The Record — the record-day card (2026-07-02) ────────────────────

test('applyCardToTrip — record-day writes the day\'s RECORD, never its plan', () => {
  const trip = fixtureTrip()
  const next = applyCardToTrip(trip, {
    action: 'record-day',
    id: 'c-rec-1',
    title: 'Saturday, as it happened',
    target: { tripId: 'volleyball-2026', dayIso: undefined, dayN: 2 },
    entries: [
      { name: 'Warmup drills', time: 'Morning' },
      { name: 'Team lunch', time: '12:30 PM', kind: 'food', note: 'The diner by the arena.' },
      { name: 'Skipped row', skipped: true },
    ],
  })
  const day2 = next.days.find((d) => d.n === 2)
  assert.equal(day2.record.entries.length, 2, 'live entries recorded, skipped row honored')
  assert.equal(day2.record.entries[0].name, 'Warmup drills')
  assert.equal(day2.record.entries[1].note, 'The diner by the arena.')
  assert.equal(day2.record.entries[0].id, 'rec-c-rec-1-0', 'entry id derives from the card (idempotent retries)')
  // The PLAN is untouched — the match is still on the schedule.
  assert.equal(day2.stops.length, 1)
  assert.equal(day2.stops[0].id, 'vb2-3')
})

test('applyCardToTrip — record-day with zero named live entries fails loud (the no-op class)', () => {
  const trip = fixtureTrip()
  assert.throws(
    () =>
      applyCardToTrip(trip, {
        action: 'record-day',
        id: 'c-rec-empty',
        target: { tripId: 'volleyball-2026', dayN: 2 },
        entries: [{ time: '3 PM' }, { name: 'Real thing', skipped: true }],
      }),
    /no-op/
  )
  const s = userFacingApplyError(
    new Error('applyRecordDay: no named entries to record — refusing a no-op save')
  )
  assert.match(s, /didn.t actually carry a change/i)
})

test('applyCardToTrip — record-day re-save (retry) upserts, never duplicates', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'record-day',
    id: 'c-rec-retry',
    target: { tripId: 'volleyball-2026', dayN: 3 },
    entries: [{ name: 'Long beach walk' }],
  }
  const once = applyCardToTrip(trip, card)
  const twice = applyCardToTrip(once, card)
  assert.equal(twice.days.find((d) => d.n === 3).record.entries.length, 1)
})

test('applyCardToTrip — a SECOND recount (new card, new id) APPENDS to the day, never overwrites the first', () => {
  const trip = fixtureTrip()
  const morning = applyCardToTrip(trip, {
    action: 'record-day',
    id: 'c-rec-am',
    target: { tripId: 'volleyball-2026', dayN: 2 },
    entries: [{ name: 'Slow breakfast', time: 'morning' }],
  })
  const evening = applyCardToTrip(morning, {
    action: 'record-day',
    id: 'c-rec-pm',
    target: { tripId: 'volleyball-2026', dayN: 2 },
    entries: [{ name: 'Sunset walk', time: 'evening' }],
  })
  const day2 = evening.days.find((d) => d.n === 2)
  assert.deepEqual(
    day2.record.entries.map((e) => e.name),
    ['Slow breakfast', 'Sunset walk'],
    'both recounts survive, in order'
  )
})
