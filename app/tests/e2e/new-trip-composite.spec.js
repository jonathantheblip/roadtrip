import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

// Manual "bigger trip" builder (new-trip redesign — the composite escape).
// Front door → "A bigger trip" now opens NewTripComposite (was: routed to Claude).
// You add a flat list of PARTS by hand; Create writes a real draft carrying parts[]
// and opens the editor. Trip dates auto-derive from the parts (no double-entry).

async function gotoIndex(page) {
  const newTrip = page.getByRole('button', { name: /New trip/i })
  const back = page.getByRole('button', { name: /back to trips/i })
  await expect(newTrip.or(back).first()).toBeVisible({ timeout: 7000 })
  if (await newTrip.isVisible().catch(() => false)) return
  await back.first().click()
  await expect(newTrip).toBeVisible({ timeout: 5000 })
}

test.describe('NewTripComposite — the manual bigger-trip builder', () => {
  test('"A bigger trip" builds a composite by hand → editor shows the parts; dates auto-derive', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=jonathan&nosw=1')
    await gotoIndex(page)

    await page.getByRole('button', { name: /New trip/i }).click()
    await expect(page.getByRole('heading', { name: /What kind of trip/i })).toBeVisible({ timeout: 7000 })
    await page.getByRole('button', { name: /A bigger trip/i }).click()

    // The manual parts-builder opens (NOT the Claude planner).
    await expect(page.getByRole('heading', { name: /A bigger trip/i })).toBeVisible()
    await expect(page.getByTestId('composite-part-row')).toHaveCount(2)
    await expectNoSeriousA11y(page) // the new form must clear contrast/labels

    // "+ Add a part" grows the list; remove shrinks it.
    await page.getByRole('button', { name: /Add a part/i }).click()
    await expect(page.getByTestId('composite-part-row')).toHaveCount(3)
    await page.getByRole('button', { name: /Remove part 3/i }).click()
    await expect(page.getByTestId('composite-part-row')).toHaveCount(2)

    // Lay out two parts with dates.
    await page.getByPlaceholder('Italy — summer').fill('Italy — e2e')
    await page.getByLabel('Part 1 title').fill('Three nights in Rome')
    await page.getByLabel('Part 1 place').fill('Rome')
    await page.getByLabel('Part 1 start date').fill('2026-08-01')
    await page.getByLabel('Part 1 end date').fill('2026-08-03')
    await page.getByLabel('Part 2 type').selectOption('stay')
    await page.getByLabel('Part 2 title').fill('A Tuscan villa')
    await page.getByLabel('Part 2 start date').fill('2026-08-03')
    await page.getByLabel('Part 2 end date').fill('2026-08-07')

    await page.getByRole('button', { name: /^Create trip$/i }).click()

    // Lands in the editor, which reflects the composite shape (read-only).
    await expect(page.getByText(/The parts · 2/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Three nights in Rome')).toBeVisible()
    await expect(page.getByText('A Tuscan villa')).toBeVisible()

    // The saved draft carries 2 parts and a trip window auto-derived from them.
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]').find((t) => t.title === 'Italy — e2e')
    )
    expect(saved).toBeTruthy()
    expect(saved.draft).toBe(true)
    expect(saved.parts).toHaveLength(2)
    expect(saved.parts[0].type).toBe('city')
    expect(saved.parts[1].type).toBe('stay')
    expect(saved.dateRangeStart).toBe('2026-08-01')
    expect(saved.dateRangeEnd).toBe('2026-08-07')
  })

  // Auto-locate on create, the manual-builder path: NewTripComposite has no
  // geocode step of its own (unlike NewTrip, which geocodes a stay's lodging
  // address inline) — the shared handleCreateTrip now best-effort geocodes
  // every composite leg missing coords, the same as the Claude-authored path,
  // so a hand-built "bigger trip" isn't stuck needing a manual "Locate this
  // leg" tap for every leg on first view.
  test('a hand-built composite trip auto-locates its legs too (geocode → part.coords)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=jonathan&nosw=1')
    await gotoIndex(page)
    await page.getByRole('button', { name: /New trip/i }).click()
    await page.getByRole('button', { name: /A bigger trip/i }).click()
    await expect(page.getByRole('heading', { name: /A bigger trip/i })).toBeVisible()

    await page.route(/nominatim\.openstreetmap\.org\/search/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ lat: '41.9028', lon: '12.4964' }]) }),
    )

    await page.getByPlaceholder('Italy — summer').fill('Italy — manual geocode')
    await page.getByLabel('Part 1 title').fill('Three nights in Rome')
    await page.getByLabel('Part 1 place').fill('Rome')
    await page.getByLabel('Part 1 start date').fill('2026-08-01')
    await page.getByLabel('Part 1 end date').fill('2026-08-03')
    await page.getByLabel('Part 2 type').selectOption('stay')
    await page.getByLabel('Part 2 title').fill('A Tuscan villa')
    await page.getByLabel('Part 2 start date').fill('2026-08-03')
    await page.getByLabel('Part 2 end date').fill('2026-08-07')
    await page.getByRole('button', { name: /^Create trip$/i }).click()

    await expect(page.getByText(/The parts · 2/i)).toBeVisible({ timeout: 10_000 })
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]').find((t) => t.title === 'Italy — manual geocode')
    )
    // Part 1 has a place ("Rome") → geocoded. Part 2 ("A Tuscan villa") has no
    // place field in this form, so legGeocodeQuery correctly has nothing to
    // search — never force-fit a query onto a title.
    expect(saved.parts[0].coords).toEqual({ lat: 41.9028, lng: 12.4964 })
    expect(saved.parts[1].coords).toBeUndefined()
  })

  test('empty scaffolding rows are dropped — only filled parts persist', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=jonathan&nosw=1')
    await gotoIndex(page)
    await page.getByRole('button', { name: /New trip/i }).click()
    await page.getByRole('button', { name: /A bigger trip/i }).click()
    await expect(page.getByRole('heading', { name: /A bigger trip/i })).toBeVisible()

    // Fill only ONE of the two rows; the empty one must not survive.
    await page.getByPlaceholder('Italy — summer').fill('One real part')
    await page.getByLabel('Part 1 title').fill('A week at the lake')
    await page.getByRole('button', { name: /^Create trip$/i }).click()

    await expect(page.getByText(/The parts · 1/i)).toBeVisible({ timeout: 10_000 })
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]').find((t) => t.title === 'One real part')
    )
    expect(saved.parts).toHaveLength(1)
  })
})
