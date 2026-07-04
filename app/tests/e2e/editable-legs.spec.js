// Editable legs in TripEditor — "The parts" section used to be a read-only
// shape display; a composite trip's legs are now add/remove/reorder/editable,
// mirroring NewTripComposite's own part-row pattern (same aria-label
// convention: "Part N type/title/place/start date/end date"). Editing a part
// NEVER touches trip.days (parts are a high-level view above the day-by-day).
// Also covers the companion fix: a composite trip no longer shows the
// road-trip-only "Start city / End city" fields (it has legs, not one
// drive-home pair) — a legacy route trip is unaffected (regression guard).
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

// Window contains the clock-stub's pinned "today" (2026-05-23) so `?trip=`
// opens directly (App's cold-load override bounces an out-of-window trip to
// the index) — same convention as parts-trip-view.spec.js's COMPOSITE.
const COMPOSITE = {
  id: 'italy-citybreak-edit',
  draft: false,
  status: 'planning',
  title: 'Italy — a city break',
  subtitle: 'Rome, then Florence.',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-26',
  dateRange: 'May 22 – 26, 2026',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  parts: [
    { id: 'p-rome', type: 'city', title: 'Three days in Rome', place: 'Rome', dateStart: '2026-05-22', dateEnd: '2026-05-24' },
    { id: 'p-flor', type: 'city', title: 'Two days in Florence', place: 'Florence', dateStart: '2026-05-25', dateEnd: '2026-05-26' },
  ],
  days: [
    { n: 1, isoDate: '2026-05-22', date: 'Fri, May 22', title: 'Arrive Rome', stops: [] },
  ],
}

// A legacy ROUTE trip (no explicit parts) — the Start/End city fields must
// stay visible here; only a composite trip sheds them.
const ROUTE = {
  id: 'drive-route-edit',
  draft: false,
  status: 'planning',
  title: 'The Jackson Family Drive',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-24',
  dateRange: 'May 22 – 24, 2026',
  shape: 'route',
  startCity: 'Belmont, MA',
  endCity: 'Houston, TX',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  days: [{ n: 1, isoDate: '2026-05-22', date: 'Fri, May 22', title: 'Day 1', stops: [] }],
}

async function openEditor(page, tripId, who = 'jonathan') {
  await seedTripIntoCache(page, tripId === COMPOSITE.id ? COMPOSITE : ROUTE)
  await page.goto(`/?person=${who}&trip=${tripId}&nosw=1`)
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await home.getByRole('button', { name: 'Change the plan' }).click()
  return page
}

function daysOf(page, tripId) {
  return page.evaluate(
    (id) => JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]').find((t) => t.id === id)?.days,
    tripId
  )
}
function partsOf(page, tripId) {
  return page.evaluate(
    (id) => JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]').find((t) => t.id === id)?.parts,
    tripId
  )
}

test.describe('Editable legs — TripEditor "The parts"', () => {
  test('a composite trip sheds Start/End city; a legacy route trip keeps them', async ({ page }) => {
    await openEditor(page, COMPOSITE.id)
    await expect(page.getByLabel('Start city')).toHaveCount(0)
    await expect(page.getByLabel('End city')).toHaveCount(0)
    // The parts ARE there, editable.
    await expect(page.getByText('The parts · 2')).toBeVisible()
    await expect(page.getByLabel('Part 1 title')).toHaveValue('Three days in Rome')

    await openEditor(page, ROUTE.id)
    await expect(page.getByLabel('Start city')).toHaveValue('Belmont, MA')
    await expect(page.getByLabel('End city')).toHaveValue('Houston, TX')
    await expect(page.getByText(/The parts ·/)).toHaveCount(0) // no explicit parts → section absent
  })

  test('editing a part\'s type/title/dates persists, and NEVER touches trip.days', async ({ page }) => {
    await openEditor(page, COMPOSITE.id)
    const daysBefore = await daysOf(page, COMPOSITE.id)

    await page.getByLabel('Part 1 type').selectOption('stay')
    await page.getByLabel('Part 1 title').fill('Four days in Rome')
    await page.getByLabel('Part 1 start date').fill('2026-05-21')

    await expect
      .poll(async () => (await partsOf(page, COMPOSITE.id))?.[0])
      .toMatchObject({ type: 'stay', title: 'Four days in Rome', dateStart: '2026-05-21' })

    const daysAfter = await daysOf(page, COMPOSITE.id)
    expect(daysAfter).toEqual(daysBefore)
  })

  test('add / reorder / remove a part; the last remaining part cannot be removed', async ({ page }) => {
    await openEditor(page, COMPOSITE.id)

    await page.getByRole('button', { name: 'Add a part' }).click()
    await expect(page.getByText('The parts · 3')).toBeVisible()
    await expect(page.getByLabel('Part 3 title')).toHaveValue('')

    // Reorder: move the new (empty) part up to position 1. Each move re-renders
    // the row at its NEW index, so the aria-label to click shifts too — after
    // the first "up", the empty part is now Part 2, not Part 3 anymore.
    await page.getByLabel('Move part 3 up').click()
    await expect
      .poll(async () => (await partsOf(page, COMPOSITE.id))?.map((p) => p.title))
      .toEqual(['Three days in Rome', '', 'Two days in Florence'])
    await page.getByLabel('Move part 2 up').click()
    await expect
      .poll(async () => (await partsOf(page, COMPOSITE.id))?.map((p) => p.title))
      .toEqual(['', 'Three days in Rome', 'Two days in Florence'])

    // Remove it back out.
    await page.getByLabel('Remove part 1').click()
    await expect(page.getByText('The parts · 2')).toBeVisible()
    await expect
      .poll(async () => (await partsOf(page, COMPOSITE.id))?.map((p) => p.title))
      .toEqual(['Three days in Rome', 'Two days in Florence'])

    // Down to the last part — removal is refused (button disabled), never zero.
    await page.getByLabel('Remove part 2').click()
    await expect(page.getByText('The parts · 1')).toBeVisible()
    await expect(page.getByLabel('Remove part 1')).toBeDisabled()
    await page.getByLabel('Remove part 1').click({ force: true })
    await expect(page.getByText('The parts · 1')).toBeVisible() // still 1 — refused
  })

  test('editing a part\'s place re-geocodes it on blur (part.coords)', async ({ page }) => {
    await openEditor(page, COMPOSITE.id)
    await page.route(/nominatim\.openstreetmap\.org\/search/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ lat: '43.7696', lon: '11.2558' }]) })
    )

    const place = page.getByLabel('Part 2 place')
    await expect(place).toHaveValue('Florence')
    await place.fill('Firenze')
    await place.blur()

    await expect
      .poll(async () => (await partsOf(page, COMPOSITE.id))?.[1])
      .toMatchObject({ place: 'Firenze', coords: { lat: 43.7696, lng: 11.2558 } })
  })

  test('a leg carrying .locale re-geocodes with the country hint (Florence → "Florence, Italy")', async ({ page }) => {
    await seedTripIntoCache(page, {
      ...COMPOSITE,
      parts: [COMPOSITE.parts[0], { ...COMPOSITE.parts[1], locale: 'it-IT' }],
    })
    await page.goto(`/?person=jonathan&trip=${COMPOSITE.id}&nosw=1`)
    await page.getByTestId('living-heart-home').getByRole('button', { name: 'Change the plan' }).click()

    let seenQuery = ''
    await page.route(/nominatim\.openstreetmap\.org\/search/, (route) => {
      seenQuery = decodeURIComponent(new URL(route.request().url()).searchParams.get('q') || '')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ lat: '43.77', lon: '11.25' }]) })
    })

    const place = page.getByLabel('Part 2 place')
    await place.fill('Florence')
    await place.blur()

    await expect.poll(() => seenQuery).toBe('Florence, Italy')
  })

  test('reordering a part WHILE its place field is still focused (blur races the geocode) lands on the right part', async ({ page }) => {
    await openEditor(page, COMPOSITE.id)
    // Delay the geocode response so there's a real window to reorder before
    // it resolves — proves updatePartPlace resolves by the part's OWN id,
    // not the index captured when the field was focused.
    await page.route(/nominatim\.openstreetmap\.org\/search/, async (route) => {
      await new Promise((r) => setTimeout(r, 400))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ lat: '43.7696', lon: '11.2558' }]) })
    })

    const place = page.getByLabel('Part 2 place') // Florence
    await place.fill('Firenze')
    // Clicking "Move part 2 up" blurs the place field first (default browser
    // behavior), THEN reorders — Florence (was part 2) is now part 1.
    await page.getByLabel('Move part 2 up').click()
    await expect
      .poll(async () => (await partsOf(page, COMPOSITE.id))?.map((p) => p.title))
      .toEqual(['Two days in Florence', 'Three days in Rome'])

    // The delayed geocode result must land on FLORENCE (now at index 0, id
    // p-flor) — not on whatever is at the OLD index 1 (Rome, now at index 1).
    await expect
      .poll(async () => (await partsOf(page, COMPOSITE.id))?.find((p) => p.id === 'p-flor'))
      .toMatchObject({ place: 'Firenze', coords: { lat: 43.7696, lng: 11.2558 } })
    const rome = (await partsOf(page, COMPOSITE.id))?.find((p) => p.id === 'p-rome')
    expect(rome.coords).toBeUndefined()
  })

  test('the parts section clears axe with a fresh part added', async ({ page }) => {
    await openEditor(page, COMPOSITE.id)
    await page.getByRole('button', { name: 'Add a part' }).click()
    await expectNoSeriousA11y(page)
  })
})
