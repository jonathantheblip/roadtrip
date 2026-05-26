import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// Share-In v2 — C1 acceptance. Exercises every entry point that
// converges on ImportView:
//   - Paste interstitial in Things to do.
//   - Web Share Target landing at /?url=...
// Worker /resolve and /draft are mocked end-to-end; the focus here
// is the client funnel + de-dup + save path.

const SHOT_DIR = 'tests/e2e/screenshots'

// Long-form Google URL with `@<lat>,<lng>` map-center. Used by the
// paste interstitial tests where the URL travels through the form
// field rather than the address bar.
const SIFT_URL =
  'https://www.google.com/maps/place/Sift+Bake+Shop/@41.3722,-71.9667,17z'

// Alternate form without the `@` character — Vite's dev server FS-
// allow check flags `/@…` paths inside query strings as
// suspected-module-traversal, which the production GH Pages host
// doesn't. Tests that put the URL into the address bar use the
// `?q=…&ll=…` form to sidestep that.
const SIFT_URL_QUERY_FORM =
  'https://maps.google.com/?q=Sift+Bake+Shop&ll=41.3722,-71.9667'

test.describe('Share-In v2 — paste interstitial flow', () => {
  test('paste a maps URL → confirm card pre-fills → save lands in activities', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await mockWorker(page, {
      draftResponse: {
        tags: ['helen', 'jonathan'],
        descriptions: {
          helen: 'A tiny corner bakery — light bouncing off the harbor.',
          jonathan: 'In, coffee, out, drive on.',
        },
      },
    })
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')

    // Open Things to do.
    const activitiesEntry = page.getByTestId('helen-photos-entry').first()
    // Helen's themed view routes to Things to do via its own entry,
    // not the photos one. We just navigate via the activities button
    // accessible from the trip card.
    await page.getByRole('button', { name: /Things to do/i }).first().click()

    await page.getByTestId('open-share-in').click()
    await page.getByTestId('share-in-url').fill(SIFT_URL)
    await page.getByTestId('share-in-go').click()

    // ImportView renders, parser pre-fills the name + coords from the
    // URL we pasted. Address is left empty until the user fills it
    // (the Worker /draft enrichment doesn't fabricate addresses).
    await expect(page.getByTestId('import-name')).toHaveValue('Sift Bake Shop')
    await expect(page.getByTestId('import-lat')).toHaveValue('41.3722')

    // Pick a category — required for save + enrichment.
    await page.getByTestId('import-category').selectOption('meal_breakfast')

    // Trigger enrichment manually (the auto-enrich fires only when the
    // name + category are both present at parse time; here the
    // category needs the user's pick first).
    await page.getByTestId('import-enrich').click()

    // The two enriched tags + descriptions land.
    await expect(page.getByTestId('import-tag-helen')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('import-tag-jonathan')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('import-desc-helen')).toHaveValue(/light bouncing/i)

    // Fill the required address by hand.
    await page.getByTestId('import-address').fill('5 Water St, Mystic, CT')

    // Save lands and confirmation renders.
    await page.getByTestId('import-save').click()
    await expect(page.getByTestId('import-saved')).toBeVisible()

    // The trip record in localStorage now carries the share_in
    // entry (sync mock catches the upsert).
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('rt_trips_cache_v1')
      const list = raw ? JSON.parse(raw) : []
      return list.find((t) => t.id === 'volleyball-2026')
    })
    const added = (stored?.sharedActivities || []).find(
      (a) => a.name === 'Sift Bake Shop'
    )
    expect(added).toBeTruthy()
    expect(added.source).toBe('share_in')
    expect(added.importMeta?.rawUrl).toBe(SIFT_URL)
    expect(added.importMeta?.importedBy).toBe('helen')
    expect(added.category).toBe('meal_breakfast')
    expect(added.tags).toEqual(expect.arrayContaining(['helen', 'jonathan']))
  })

  test('de-dup: paste a URL matching a seed entry → "Already in this trip" instead of confirm card', async ({
    page,
  }) => {
    // Seed the trip with an activity that will collide via name+coord
    // canonical key.
    const tripWithSift = {
      ...FIXTURE_TRIP,
      sharedActivities: [
        {
          id: 'pre-existing-sift',
          tripId: 'volleyball-2026',
          name: 'Sift Bake Shop',
          address: '5 Water St, Mystic, CT',
          lat: 41.3722,
          lng: -71.9667,
          category: 'meal_breakfast',
          tags: ['helen'],
          descriptions: { helen: 'A familiar light-soaked corner.' },
          source: 'share_in',
        },
      ],
    }
    await seedTripIntoCache(page, tripWithSift)
    await mockWorker(page, { draftResponse: null })
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')

    await page.getByRole('button', { name: /Things to do/i }).first().click()
    await page.getByTestId('open-share-in').click()
    await page.getByTestId('share-in-url').fill(SIFT_URL)
    await page.getByTestId('share-in-go').click()

    // The exists banner renders; no confirmation form, no save button.
    await expect(page.getByTestId('import-exists')).toBeVisible()
    await expect(page.getByTestId('import-exists')).toContainText('Sift Bake Shop')
    await expect(page.getByTestId('import-save')).toHaveCount(0)
  })

  test('save button disabled until name + address + category + tag + matching descriptions are filled', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await mockWorker(page, { draftResponse: null })
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')

    await page.getByRole('button', { name: /Things to do/i }).first().click()
    await page.getByTestId('open-share-in').click()
    // Paste a totally unhandled URL → user has to fill everything by
    // hand.
    await page.getByTestId('share-in-url').fill('https://www.example.com/somewhere')
    await page.getByTestId('share-in-go').click()

    // Confirm card renders; save is disabled.
    const save = page.getByTestId('import-save')
    await expect(save).toBeDisabled()

    await page.getByTestId('import-name').fill('Some Place')
    await expect(save).toBeDisabled()
    await page.getByTestId('import-address').fill('Some Address')
    await expect(save).toBeDisabled()
    await page.getByTestId('import-category').selectOption('shopping')
    await expect(save).toBeDisabled()
    await page.getByTestId('import-tag-helen').click()
    // Tag is on but description for Helen still empty.
    await expect(save).toBeDisabled()
    await page.getByTestId('import-desc-helen').fill('A place to walk through.')
    await expect(save).toBeEnabled()
  })

  test('Web Share Target landing — boots straight into ImportView when ?url= is on the URL', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await mockWorker(page, { draftResponse: null })
    // Note: we land on the base URL first, then add ?url= via
    // history.replaceState + reload. The Vite dev server's FS-allow
    // check rejects URL-encoded query strings that contain `/@...`
    // patterns (it mistakes them for Vite's special module paths),
    // which doesn't happen in production because the static GH Pages
    // server has no such middleware.
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await landOnImport(page, SIFT_URL_QUERY_FORM)
    await expect(page.getByTestId('import-name')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('import-name')).toHaveValue('Sift Bake Shop')

    await page.screenshot({
      path: `${SHOT_DIR}/c1-import-from-share-target.png`,
      fullPage: true,
    })
  })

  test('short link is resolved through the Worker then re-parsed', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    let resolveCalled = false
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/resolve/,
      async (route) => {
        resolveCalled = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ resolved: SIFT_URL_QUERY_FORM, hops: 2 }),
        })
      }
    )
    await mockWorker(page, { draftResponse: null, skipResolve: true })

    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await landOnImport(page, 'https://maps.app.goo.gl/abc123')
    // The Worker is mocked to resolve `abc123` to the query-form Sift
    // URL — name pre-fills from that.
    await expect(page.getByTestId('import-name')).toHaveValue('Sift Bake Shop', { timeout: 5000 })
    expect(resolveCalled).toBe(true)
  })
})

// Simulate a Web Share Target landing: rewrite the URL to include
// ?url=<encoded> and reload so App.jsx's initialViewFromUrl picks it up.
async function landOnImport(page, sharedUrl) {
  await page.evaluate((url) => {
    const u = new URL(window.location.href)
    u.searchParams.set('url', url)
    window.history.replaceState(null, '', u.toString())
    window.location.reload()
  }, sharedUrl)
}

// Mock the Worker endpoints the import flow hits. `draftResponse` is
// the JSON the /draft endpoint returns; pass null to short-circuit a
// 502 (the form stays editable, no descriptions auto-fill).
async function mockWorker(page, { draftResponse, skipResolve = false } = {}) {
  if (!skipResolve) {
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/resolve/,
      (route) => route.fulfill({ status: 404, body: '{}' })
    )
  }
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/draft/,
    (route) => {
      if (draftResponse) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(draftResponse),
        })
      }
      return route.fulfill({ status: 502, body: '{"error":"mocked off"}' })
    }
  )
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/trips/,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"ok":true}',
      })
  )
}
