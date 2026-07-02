// LivingHeartHome — the redesigned "Now" home for a STAY (Jonathan's lens, slice 1).
// It must feel alive at every stage: empty/upcoming leads with the place + gentle
// "fills in as you go" prompts (no sad blanks); with content, the Lately carousel
// appears. The weave entry is ALWAYS reachable (populated or a promise).
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

// Clock is stubbed to 2026-05-23 (see clockStub). An UPCOMING stay sits after it.
const UPCOMING_STAY = {
  id: 'lhh-upcoming', shape: 'stay', status: 'planning', title: 'Provincetown', subtitle: 'fixture',
  dateRange: 'Jun 10 – 14, 2026', dateRangeStart: '2026-06-10', dateRangeEnd: '2026-06-14',
  startCity: 'Belmont, MA', endCity: 'Provincetown, MA',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  heroImage: TINY_RED_PNG_DATA_URL,
  lodging: { name: 'Harbor Breeze', address: '690 Commercial St, Provincetown, MA', lat: 42.0584, lng: -70.1787 },
  days: [{ n: 1, isoDate: '2026-06-10', date: 'Wed Jun 10', title: 'Arrive', lodging: 'Harbor Breeze', stops: [] }],
}

// A stay straddling the stubbed clock → "during"; we seed photos for the carousel.
const DURING_STAY = {
  ...UPCOMING_STAY,
  id: 'lhh-during',
  dateRange: 'May 22 – 25, 2026', dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-25',
  days: [
    { n: 1, isoDate: '2026-05-22', date: 'Fri May 22', title: 'Arrive', lodging: 'Harbor Breeze', stops: [] },
    { n: 2, isoDate: '2026-05-23', date: 'Sat May 23', title: 'Beach', lodging: 'Harbor Breeze', stops: [] },
  ],
}
const PHOTOS = [
  { id: 'lhh-p1', tripId: 'lhh-during', stopId: null, authorTraveler: 'helen', visibility: 'shared', kind: 'photo', caption: '', photoRef: { url: TINY_RED_PNG_DATA_URL, w: 1, h: 1 }, createdAt: '2026-05-23T15:00:00.000Z' },
  { id: 'lhh-p2', tripId: 'lhh-during', stopId: null, authorTraveler: 'jonathan', visibility: 'shared', kind: 'photo', caption: '', photoRef: { url: TINY_RED_PNG_DATA_URL, w: 1, h: 1 }, createdAt: '2026-05-23T14:00:00.000Z' },
]

test('an upcoming stay leads with the place + gentle fills, never a sad blank', async ({ page }) => {
  await seedTripIntoCache(page, UPCOMING_STAY)
  // An UPCOMING trip isn't "active today", so a ?trip= deep-link is dropped on
  // cold load (a future trip must not hijack launch). Open it from the index,
  // the way a person would.
  await page.goto('/?person=jonathan&nosw=1')
  await page.getByRole('button').filter({ hasText: 'Provincetown' }).first().click()
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  // The place leads, with a real countdown (no faked "night 2 of 4").
  await expect(home.getByText('At Harbor Breeze')).toBeVisible()
  await expect(home.getByText(/In \d+ days|Tomorrow|Today/)).toBeVisible()
  // Gentle empty prompts, not blanks: the weave is always reachable, photos
  // "will gather", and a nudge to what you could do.
  await expect(home.getByTestId('open-weave')).toBeVisible()
  await expect(home.getByText(/Photos will gather here/i)).toBeVisible()
  await expect(home.getByRole('button', { name: /see what you could do/i })).toBeVisible()
})

test('a stay with photos shows the Lately carousel (no ghost)', async ({ page }) => {
  await seedTripIntoCache(page, DURING_STAY)
  await seedMemoriesIntoCache(page, PHOTOS)
  await page.goto('/?person=jonathan&trip=lhh-during&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await expect(home.getByText('Lately')).toBeVisible()
  // The ghost is gone, and real photo thumbnails are present.
  await expect(home.getByText(/Photos will gather here/i)).toHaveCount(0)
  await expect(home.getByRole('button', { name: 'Open photos' }).first()).toBeVisible()
  // Live bug (2026-07-01): PHOTOS' createdAt is an ISO STRING (the real shape a
  // memory can carry, e.g. straight from a worker pull) — relTime must format
  // it honestly ("just now" / "3h ago"), never the literal string "NaNd ago".
  await expect(home.getByText(/added ·/)).toBeVisible()
  await expect(home.getByText(/NaN/)).toHaveCount(0)
})

// Design 01#4b — "alive at empty": a nothing day is permission, not a hidden
// section. DURING_STAY's today (2026-05-23, per clockStub) has no stops and
// no flight, so the agenda is genuinely empty.
test('an empty agenda is "alive at empty" — a nothing-day line + "Add something" opens the editor for THIS trip', async ({ page }) => {
  await seedTripIntoCache(page, DURING_STAY)
  await page.goto('/?person=jonathan&trip=lhh-during&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })

  // Not hidden — an honest empty state, not a missing section.
  await expect(home.getByText("On the agenda")).toBeVisible()
  // Jonathan's voice (the per-lens facelift): warm + direct, not the warm base.
  await expect(home.getByText("Nothing planned today — take it easy")).toBeVisible()
  const addSomething = home.getByRole('button', { name: /add something/i })
  await expect(addSomething).toBeVisible()

  await addSomething.click()
  // Lands in the editor for THIS trip (not some other one, not a blank screen).
  await expect(page.getByRole('heading', { name: 'Provincetown' })).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(/^PUBLISHED$/)).toBeVisible()
})

// Design decision 4c: the SHAPE OF THE CONTENT decides simple-vs-complex, not a
// lone internal part. A manually-created trip carries ONE synthetic part; that must
// NOT force the complex "In [place]" + "The plan" frame. One place → simple "At".
const ONE_PART_STAY = {
  ...DURING_STAY,
  id: 'lhh-onepart',
  // Mirrors NewTrip output: exactly one part wrapping the whole stay. `place` is a
  // STRING (the convention the composite renderer + AI use).
  parts: [{ id: 'lhh-onepart__p1', type: 'stay', title: 'Harbor Breeze', place: 'Harbor Breeze', dateStart: '2026-05-22', dateEnd: '2026-05-25' }],
}
const TWO_PART_TRIP = {
  ...DURING_STAY,
  id: 'lhh-twopart',
  parts: [
    { id: 'p-a', type: 'city', title: 'Rome', place: 'Rome', dateStart: '2026-05-22', dateEnd: '2026-05-23' },
    { id: 'p-b', type: 'city', title: 'Florence', place: 'Florence', dateStart: '2026-05-24', dateEnd: '2026-05-25' },
  ],
}
// The forward case the leg data-model unlocks: a composite leg carrying an OBJECT
// place { name, lat, lng } (coords, so the hero/We-could/Map can anchor per leg).
// A bare `${part.place}` would render "In [object Object]"; the object-safe reader
// (partPlaceLabel) must name it "In Rome". Titles are OMITTED so the hero must
// fall through to the place object — the exact path that would break.
const TWO_PART_OBJECT_TRIP = {
  ...DURING_STAY,
  id: 'lhh-twopart-obj',
  parts: [
    { id: 'p-a', type: 'city', place: { name: 'Rome', lat: 41.9028, lng: 12.4964 }, dateStart: '2026-05-22', dateEnd: '2026-05-23' },
    { id: 'p-b', type: 'city', place: { name: 'Florence', lat: 43.7696, lng: 11.2558 }, dateStart: '2026-05-24', dateEnd: '2026-05-25' },
  ],
}
// A leg carrying an IANA timezone — the signal that engages leg-local time + the
// honest dual clock. The current leg on 2026-05-23 is Rome (Europe/Rome). Under
// the UTC clock stub the viewer zone (UTC) differs from Rome, so the clock shows.
const TZ_LEG_TRIP = {
  ...DURING_STAY,
  id: 'lhh-tz',
  parts: [
    { id: 'p-a', type: 'city', place: { name: 'Rome', lat: 41.9028, lng: 12.4964 }, tz: 'Europe/Rome', currency: 'EUR', locale: 'it-IT', dateStart: '2026-05-22', dateEnd: '2026-05-23' },
    { id: 'p-b', type: 'city', place: { name: 'Florence', lat: 43.7696, lng: 11.2558 }, tz: 'Europe/Rome', dateStart: '2026-05-24', dateEnd: '2026-05-25' },
  ],
}

test('a ONE-part stay renders the simple "At [place]" home — not the complex frame (4c)', async ({ page }) => {
  await seedTripIntoCache(page, ONE_PART_STAY)
  await page.goto('/?person=jonathan&trip=lhh-onepart&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await expect(home.getByText('At Harbor Breeze')).toBeVisible()
  // The complex frame stays OFF: no "The plan" section, no "In …" hero, no rail.
  // (exact — the "Change the plan" quiet action legitimately contains the
  // substring; the assertion is about the composite SECTION header.)
  await expect(home.getByText('The plan', { exact: true })).toHaveCount(0)
  await expect(home.getByText(/^In /)).toHaveCount(0)
  await expect(home.getByTestId('journey-rail')).toHaveCount(0)
})

test('a TWO-part trip still renders the composite frame ("In [city]" + The plan)', async ({ page }) => {
  await seedTripIntoCache(page, TWO_PART_TRIP)
  await page.goto('/?person=jonathan&trip=lhh-twopart&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  // exact — "Change the plan" (the quiet edit door, present here too) would
  // otherwise make this a two-element strict-mode match.
  await expect(home.getByText('The plan', { exact: true })).toBeVisible()
  await expect(home.getByText(/^In (Rome|Florence)/)).toBeVisible()
  // No leg timezone/currency/locale → no dual clock, no context card
  // (the gate: "no delta → no module").
  await expect(home.getByTestId('dual-clock')).toHaveCount(0)
  await expect(home.getByTestId('leg-context')).toHaveCount(0)
})

// A new place greets ONCE with the arrival moment; the quiet dual clock + context
// card take over after "Got it". Dismiss it to reach them.
async function dismissArrival(home) {
  await home.getByTestId('arrival-moment').getByRole('button', { name: 'Got it' }).click()
}

test('a leg with a timezone shows the honest dual clock — leg time leads, yours faint', async ({ page }) => {
  await seedTripIntoCache(page, TZ_LEG_TRIP)
  await page.goto('/?person=jonathan&trip=lhh-tz&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await dismissArrival(home) // the arrival moment hands off to the quiet clock
  const clock = home.getByTestId('dual-clock')
  await expect(clock).toBeVisible()
  // The current leg (Rome) leads; the viewer's own time is named faintly. (Exact
  // times are unit-tested against fixed instants; here we prove the surface +
  // the leg naming, which is locale-robust.)
  await expect(clock).toContainText('in Rome')
  await expect(clock).toContainText('where you are')
})

test('a leg abroad shows the per-leg context card — money + language, honest ≈ rate', async ({ page }) => {
  await seedTripIntoCache(page, TZ_LEG_TRIP) // Rome leg carries currency EUR + locale it-IT
  await page.goto('/?person=jonathan&trip=lhh-tz&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await dismissArrival(home) // the arrival moment hands off to the quiet card
  const ctx = home.getByTestId('leg-context')
  await expect(ctx).toBeVisible()
  await expect(ctx).toContainText('Euro') // the money the leg uses
  await expect(ctx).toContainText('Italian') // the language
  await expect(ctx).toContainText('Buongiorno') // a greeting
  await expect(ctx).toContainText('≈') // the $ hint is APPROXIMATE, never live/precise (G6)
})

test('arrival moment (watching from home): "The family\'s arrived", then it hands off on Got it', async ({ page }) => {
  await seedTripIntoCache(page, TZ_LEG_TRIP) // Rome; viewer is UTC (≠ Europe/Rome) → remote voice
  await page.goto('/?person=jonathan&trip=lhh-tz&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  const arrival = home.getByTestId('arrival-moment')
  await expect(arrival).toBeVisible()
  await expect(arrival).toContainText('The family’s arrived') // the remote-viewer voice
  await expect(arrival).toContainText('Italy')
  await expect(arrival).toContainText('Euro') // it carries the local rundown
  await expect(arrival).toContainText('Italian')
  // While it's up, the quiet surfaces defer to it (no double clock/card).
  await expect(home.getByTestId('dual-clock')).toHaveCount(0)
  // "Got it" hands off to the quiet dual clock and doesn't come back.
  await arrival.getByRole('button', { name: 'Got it' }).click()
  await expect(arrival).toHaveCount(0)
  await expect(home.getByTestId('dual-clock')).toBeVisible()
})

test.describe('arrival moment (a traveler, phone on local time)', () => {
  test.use({ timezoneId: 'Europe/Rome' }) // emulate the family's phone in Rome
  test('gets the personal "You\'ve arrived · Welcome to Italy"', async ({ page }) => {
    await seedTripIntoCache(page, TZ_LEG_TRIP)
    await page.goto('/?person=jonathan&trip=lhh-tz&nosw=1')
    const home = page.getByTestId('living-heart-home')
    await expect(home).toBeVisible({ timeout: 10000 })
    const arrival = home.getByTestId('arrival-moment')
    await expect(arrival).toBeVisible()
    await expect(arrival).toContainText('You’ve arrived') // the traveler voice (phone tz == leg tz)
    await expect(arrival).toContainText('Welcome to Italy')
  })
})

test('a composite leg with an OBJECT place names the hero "In Rome" — never "[object Object]" (leg-model object-safe)', async ({ page }) => {
  await seedTripIntoCache(page, TWO_PART_OBJECT_TRIP)
  await page.goto('/?person=jonathan&trip=lhh-twopart-obj&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  // The current leg (Rome, on May 23) names the hero via the object-safe reader.
  await expect(home.getByText(/^In Rome/)).toBeVisible()
  // The raw-object regression must never appear — not in the hero, not anywhere.
  await expect(home.getByText('[object Object]')).toHaveCount(0)
})

// Design 01#3 — honest "On the agenda" overflow. A busy day (5+ events) shows four,
// then a row NAMING the count + the hidden times, expanding IN PLACE — never a
// silent truncation. Clock is 2026-05-23, so the busy day is that date.
const BUSY_DAY = {
  ...DURING_STAY,
  id: 'lhh-busy',
  days: [
    { n: 1, isoDate: '2026-05-22', date: 'Fri May 22', title: 'Arrive', lodging: 'Harbor Breeze', stops: [] },
    { n: 2, isoDate: '2026-05-23', date: 'Sat May 23', title: 'Packed', lodging: 'Harbor Breeze', stops: [
      { id: 'b1', time: '9:00 AM', name: 'Breakfast spot', kind: 'food' },
      { id: 'b2', time: '10:30 AM', name: 'The Museum', kind: 'sight' },
      { id: 'b3', time: '1:00 PM', name: 'Lunch out', kind: 'food' },
      { id: 'b4', time: '2:30 PM', name: 'Long walk', kind: 'sight' },
      { id: 'b5', time: '3:30 PM', name: 'Coffee stop', kind: 'food' },
      { id: 'b6', time: '6:30 PM', name: 'Dinner reservation', kind: 'food' },
    ]},
  ],
}

// THE JOURNEY RAIL (hangout-first 02#1/03/05) — a composite trip's orientation
// strip: "Part 2 of 3" + Rome/Florence/Venice as done/now/upcoming, the current
// leg's local time, and a tap that scrolls to that leg in The Plan. Clock is
// pinned to 2026-05-23 (clockStub): Rome's window is over (done), Florence
// contains today (now, and carries a tz so the rail's time line engages),
// Venice hasn't started (upcoming).
const JOURNEY_RAIL_TRIP = {
  ...DURING_STAY,
  id: 'lhh-rail',
  title: 'Italy — three cities',
  dateRange: 'May 20 – 26, 2026', dateRangeStart: '2026-05-20', dateRangeEnd: '2026-05-26',
  parts: [
    { id: 'p-rome', type: 'city', title: 'Three days in Rome', place: 'Rome', dateStart: '2026-05-20', dateEnd: '2026-05-22' },
    { id: 'p-flor', type: 'city', title: 'A day in Florence', place: 'Florence', tz: 'Europe/Rome', dateStart: '2026-05-23', dateEnd: '2026-05-24' },
    { id: 'p-ven', type: 'city', title: 'Venice to finish', place: 'Venice', dateStart: '2026-05-25', dateEnd: '2026-05-26' },
  ],
}

test('the journey rail shows Part 2 of 3, done/now/upcoming legs, and the current leg\'s local time', async ({ page }) => {
  await seedTripIntoCache(page, JOURNEY_RAIL_TRIP)
  await page.goto('/?person=jonathan&trip=lhh-rail&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await dismissArrival(home) // hands off to the quiet surfaces (rail's time line included)

  const rail = home.getByTestId('journey-rail')
  await expect(rail).toBeVisible()
  await expect(rail).toContainText('Part 2 of 3')

  const rome = rail.getByRole('button', { name: /Rome — done/ })
  const florence = rail.getByRole('button', { name: /Florence — current leg/ })
  const venice = rail.getByRole('button', { name: 'Venice' })
  await expect(rome).toBeVisible()
  await expect(florence).toBeVisible()
  await expect(venice).toBeVisible()

  // The current leg's local time — a real zone delta (Rome/CEST vs the UTC
  // clock stub), so it engages; no exact digits pinned (locale-robust, same
  // caution as the dual-clock test below).
  await expect(rail).toContainText('in Florence')
})

test('tapping a leg in the journey rail scrolls to that leg in The Plan (no new screen)', async ({ page }) => {
  await seedTripIntoCache(page, JOURNEY_RAIL_TRIP)
  await page.goto('/?person=jonathan&trip=lhh-rail&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await dismissArrival(home)

  await home.getByTestId('journey-rail').getByRole('button', { name: 'Venice' }).click()
  const veniceCard = home.getByTestId('parts-trip-part').filter({ hasText: 'Venice to finish' })
  await expect(veniceCard).toBeInViewport()
})

test('a FINISHED composite trip sheds the journey rail — the keepsake takes over, not the live orientation strip', async ({ page }) => {
  const finished = {
    ...JOURNEY_RAIL_TRIP, id: 'lhh-rail-after',
    dateRange: 'May 1 – 7, 2026', dateRangeStart: '2026-05-01', dateRangeEnd: '2026-05-07',
    parts: JOURNEY_RAIL_TRIP.parts.map((p) => ({ ...p, dateStart: '2026-05-01', dateEnd: '2026-05-07' })),
  }
  await seedTripIntoCache(page, finished)
  // No ?trip= — a finished trip isn't "active today", so a cold deep-link bounces
  // to the index; open it the way a person would, by tapping its card.
  await page.goto('/?person=jonathan&nosw=1')
  // A short, single-word match — the full title's em-dash can split across
  // DOM nodes in the card's heading, which breaks a literal multi-word filter.
  await page.getByRole('button').filter({ hasText: 'Italy' }).first().click()
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await expect(home.getByTestId('journey-rail')).toHaveCount(0)
  await expect(home.getByText('The plan')).toHaveCount(0)
})

test('the journey rail renders for Helen and Aurelia too, AA-clean', async ({ page }) => {
  await seedTripIntoCache(page, JOURNEY_RAIL_TRIP)
  for (const who of ['helen', 'aurelia']) {
    await page.goto(`/?person=${who}&trip=lhh-rail&nosw=1`)
    const home = page.getByTestId('living-heart-home')
    await expect(home).toBeVisible({ timeout: 10000 })
    await expect(home.getByTestId('journey-rail')).toBeVisible()
    await expectNoSeriousA11y(page)
  }
})

test('a 5+-event day shows an honest overflow that expands in place (01#3)', async ({ page }) => {
  await seedTripIntoCache(page, BUSY_DAY)
  await page.goto('/?person=jonathan&trip=lhh-busy&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  // Four shown; the 5th/6th are disclosed but not listed yet. (Match the agenda
  // ROW buttons by role — the 9am stop also appears in the honest "Next ·" line.)
  await expect(home.getByRole('button', { name: 'Breakfast spot' })).toBeVisible()
  await expect(home.getByRole('button', { name: 'Long walk' })).toBeVisible()
  await expect(home.getByText(/\+2 more today/i)).toBeVisible()
  await expect(home.getByText(/3:30 PM, 6:30 PM/)).toBeVisible()
  await expect(home.getByRole('button', { name: 'Coffee stop' })).toHaveCount(0)
  await expect(home.getByRole('button', { name: 'Dinner reservation' })).toHaveCount(0)
  // Expand in place → all six + a "Show less" (no navigation).
  await home.getByRole('button', { name: /show 2 more today/i }).click()
  await expect(home.getByRole('button', { name: 'Coffee stop' })).toBeVisible()
  await expect(home.getByRole('button', { name: 'Dinner reservation' })).toBeVisible()
  await expect(home.getByText(/show less/i)).toBeVisible()
  await expect(home.getByText(/\+2 more today/i)).toHaveCount(0)
})

test('a calm day (≤4 events) shows all, with NO overflow row', async ({ page }) => {
  const calm = { ...BUSY_DAY, id: 'lhh-calm', days: [
    { ...BUSY_DAY.days[0] },
    { ...BUSY_DAY.days[1], stops: BUSY_DAY.days[1].stops.slice(0, 3) },
  ] }
  await seedTripIntoCache(page, calm)
  await page.goto('/?person=jonathan&trip=lhh-calm&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  // Scope to the agenda ROW (its aria-label is exactly the stop name). Plain
  // getByText was TZ-fragile: when the stubbed "now" makes this the NEXT stop
  // (noon-UTC on CI), the name also appears in the "Next ·" line → a strict-mode
  // double match. The row button is unambiguous in every timezone.
  await expect(home.getByRole('button', { name: 'Lunch out', exact: true })).toBeVisible()
  await expect(home.getByText(/more today/i)).toHaveCount(0) // the calm case looks calm
})
