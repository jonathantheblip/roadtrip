// Unit tests for the centralized local-calendar date helper
// (src/lib/localDate.js). Lives at the app level so `npm test` runs it.
//
// The point under test is the bug ROOT-4 fixes: "today" must come from the
// LOCAL calendar, not the UTC ISO date. The two disagree for a few hours
// around midnight for Americas users, which opened the wrong day and made
// the live badge disagree with the live dock (liveDock already used local).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { localDateIso, todayLocalIso } from '../../src/lib/localDate.js'

// localDateIso reads getFullYear/getMonth/getDate — i.e. the LOCAL calendar
// fields of the Date. To assert the midnight boundary deterministically on
// any machine (CI runs in UTC), construct the instant relative to the host's
// own timezone offset so the assertion is tz-agnostic.

test('localDateIso: returns the LOCAL calendar date, not the UTC ISO date', () => {
  // 00:30 local on 2026-05-02. In any timezone WEST of UTC (the Americas),
  // this same instant is already 2026-05-02 in UTC too only if offset is 0;
  // to make the divergence explicit we check the local fields directly.
  const d = new Date(2026, 4, 2, 0, 30, 0) // local 2026-05-02 00:30 (month is 0-based)
  assert.equal(localDateIso(d), '2026-05-02')
})

test('localDateIso: late-evening local stays on the local day even when UTC has rolled over', () => {
  // Construct an instant that is 23:30 LOCAL on 2026-05-01. For any host west
  // of UTC, toISOString() has already rolled to 2026-05-02, but the local
  // calendar — what the trip day labels use — is still 2026-05-01.
  const d = new Date(2026, 4, 1, 23, 30, 0) // local 2026-05-01 23:30
  assert.equal(localDateIso(d), '2026-05-01')
  // The UTC ISO date (the OLD, buggy derivation) may differ on western hosts.
  const utcDate = d.toISOString().slice(0, 10)
  if (d.getTimezoneOffset() > 0) {
    // Host is west of UTC → the old UTC derivation drifts a day ahead.
    assert.notEqual(utcDate, localDateIso(d), 'expected UTC date to drift ahead of local on a western host')
  } else {
    // Host at/east of UTC → they happen to agree; helper still returns local.
    assert.equal(localDateIso(d), '2026-05-01')
  }
})

test('localDateIso: zero-pads month and day', () => {
  const d = new Date(2026, 0, 3, 12, 0, 0) // local 2026-01-03
  assert.equal(localDateIso(d), '2026-01-03')
})

test('localDateIso === UTC slice at noon UTC (the e2e clock-stub instant)', () => {
  // The e2e clock stub pins new Date() to 2026-05-23T12:00:00.000Z. On the
  // (UTC) CI runner the local fields and the UTC ISO date are the same day, so
  // this change resolves identically under the stub — no baseline day shift.
  // We assert the equivalence holds whenever the host is at UTC.
  const stub = new Date('2026-05-23T12:00:00.000Z')
  if (stub.getTimezoneOffset() === 0) {
    assert.equal(localDateIso(stub), stub.toISOString().slice(0, 10))
    assert.equal(localDateIso(stub), '2026-05-23')
  } else {
    // Non-UTC dev host: noon UTC is still May 23 locally for any offset within
    // ±12h, which is every real timezone — so the day is stable regardless.
    assert.equal(localDateIso(stub), '2026-05-23')
  }
})

test('todayLocalIso: matches localDateIso(new Date())', () => {
  // Same instant, same answer — todayLocalIso is just the no-arg convenience.
  const expected = localDateIso(new Date())
  assert.equal(todayLocalIso(), expected)
  assert.match(todayLocalIso(), /^\d{4}-\d{2}-\d{2}$/)
})
