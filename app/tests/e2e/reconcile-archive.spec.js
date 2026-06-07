import { test, expect } from './_fixtures/clockStub.js'
import { openTopMenuItem } from './_fixtures/topNav.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'
import { redPhotoFile } from './_fixtures/photoFixtures.js'
import { resolvePersona } from './_fixtures/persona.js'

// Honors RT_PERSONA (Phase 2 build-list item 1); defaults to 'helen' when
// unset so existing runs stay byte-identical to before.
const PERSONA = resolvePersona('helen')

// Trip reconciliation + archiving — the full motion, end to end, against
// the REAL pipeline (matcher → reconcileDraft → reconcileEdits →
// reconcileApply → upsertTrip → TripIndex grouping). Headless fixtures
// can't carry GPS EXIF, so the one stubbed seam is window.__RT_BACKFILL_EXIF
// (see PhotoBackfillTriage#readExifWithTestOverride) which feeds
// deterministic capturedAt/lat/lng straight into the matcher input. The
// reverse-geocode endpoint is mocked so the auto-added stop earns a real
// name. Everything else is the production code path.

// A McComb → Terrell driving day with, by design: one planned stop that
// gets a matching photo (→ happened), one that gets none (→ no photos),
// an off-route 3-photo cluster (→ auto_added stop), and one lone transit
// shot (→ interstitial). Window straddles the stubbed clock (2026-05-23)
// so the app cold-loads straight into the trip.
const RECON_TRIP = {
  id: 'recon-roadtrip-2026',
  status: 'planning',
  title: 'Reconcile Test Roadtrip',
  subtitle: 'fixture',
  dateRange: 'May 22 – 24, 2026',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-24',
  startCity: 'McComb, MS',
  endCity: 'Terrell, TX',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  homeBase: { lat: 31.0, lng: -90.0, label: 'Home' },
  days: [
    {
      n: 1, date: 'Fri May 22', isoDate: '2026-05-22', title: 'Set off',
      drive: { from: '', to: '', hours: '', miles: 0 }, lodging: '',
      stops: [
        { id: 'home', time: 'Evening', name: 'Home base', kind: 'lodging', for: ['jonathan', 'helen', 'aurelia', 'rafa'], note: '', address: 'Home', lat: 31.0, lng: -90.0 },
      ],
    },
    {
      n: 2, date: 'Sat May 23', isoDate: '2026-05-23', title: 'The long haul',
      drive: { from: 'McComb', to: 'Terrell', hours: '7h', miles: 430 }, lodging: '',
      stops: [
        { id: 'mccomb', time: '9:00 AM', name: 'McComb', kind: 'fuel', for: ['jonathan', 'helen', 'aurelia', 'rafa'], note: 'Fuel + snacks', address: 'McComb, MS', lat: 31.244, lng: -90.454 },
        { id: 'terrell', time: '8:00 PM', name: "Buc-ee's Terrell", kind: 'fuel', for: ['jonathan', 'helen', 'aurelia', 'rafa'], note: '', address: 'Terrell, TX', lat: 32.731, lng: -96.228 },
      ],
    },
    {
      n: 3, date: 'Sun May 24', isoDate: '2026-05-24', title: 'Arrive',
      drive: { from: '', to: '', hours: '', miles: 0 }, lodging: '',
      stops: [
        { id: 'dest', time: 'Noon', name: 'Destination', kind: 'lodging', for: ['jonathan', 'helen', 'aurelia', 'rafa'], note: '', address: 'Dallas, TX', lat: 32.78, lng: -96.80 },
      ],
    },
  ],
}

const BACKFILL_EXIF = {
  'mccomb-1.png': { capturedAt: '2026-05-23T09:15:00Z', lat: 31.244, lng: -90.454 },
  'lone-1.png': { capturedAt: '2026-05-23T11:00:00Z', lat: 31.9, lng: -90.5 },
  'vicksburg-1.png': { capturedAt: '2026-05-23T15:00:00Z', lat: 32.3520, lng: -90.8790 },
  'vicksburg-2.png': { capturedAt: '2026-05-23T15:25:00Z', lat: 32.3522, lng: -90.8788 },
  'vicksburg-3.png': { capturedAt: '2026-05-23T15:50:00Z', lat: 32.3521, lng: -90.8790 },
}

const RECON_FILES = [
  redPhotoFile('mccomb-1.png'),
  redPhotoFile('lone-1.png'),
  redPhotoFile('vicksburg-1.png'),
  redPhotoFile('vicksburg-2.png'),
  redPhotoFile('vicksburg-3.png'),
]

async function mockUploadsAndGeocode(page) {
  // Asset + memory mirrors succeed so the save path resolves cleanly.
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/photo/,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ key: 'helen/recon/photo', url: 'https://example.test/recon/photo', mime: 'image/jpeg' }),
      })
  )
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/memories/,
    (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  )
  // Reverse geocode → a real place name for the off-route cluster.
  await page.route(/nominatim\.openstreetmap\.org\/reverse/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ address: { city: 'Vicksburg', state: 'Mississippi' } }),
    })
  )
}

async function readTrip(page, id) {
  return page.evaluate((tid) => {
    const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
    return all.find((t) => t.id === tid) || null
  }, id)
}

async function openReconcileTriage(page) {
  await seedTripIntoCache(page, RECON_TRIP)
  await mockUploadsAndGeocode(page)
  await page.addInitScript((map) => {
    window.__RT_BACKFILL_EXIF = map
  }, BACKFILL_EXIF)
  await page.goto(`/?person=${PERSONA}&trip=recon-roadtrip-2026&nosw=1`)

  // Importer moved to PhotosView (Stage 1): open Photos, then the bulk
  // import input. Same `import-file-input` testid — only the nav changed.
  await page.getByTestId(`${PERSONA}-photos-entry`).click()
  await page.getByTestId('import-file-input').setInputFiles(RECON_FILES)

  // Importer Stage 2: the bulk pick now analyzes first and shows the
  // lightweight confirm summary (this batch is "messy" — an interstitial +
  // an off-route cluster). "Review in detail" opens the full reconcile editor.
  await page.getByTestId('import-confirm-review').click()

  // READY when the Save bar is up.
  await expect(page.getByRole('button', { name: /Save · upload|Save changes/i })).toBeVisible({ timeout: 10000 })
}

test.describe('Trip reconciliation + archiving', () => {
  test('draft auto-builds the four stop states + a named auto stop + an interstitial', async ({ page }) => {
    await openReconcileTriage(page)

    // Planned stop with a matching photo → happened.
    await expect(page.getByText('McComb', { exact: true })).toBeVisible()
    await expect(page.getByText('Happened', { exact: true })).toBeVisible()

    // Planned stop with no photo → flagged. (exact: the interstitial
    // title "From McComb to Buc-ee's Terrell" also contains the name, and
    // the empty stop renders "No photos matched this stop.")
    await expect(page.getByText("Buc-ee's Terrell", { exact: true })).toBeVisible()
    await expect(page.getByText('No photos', { exact: true })).toBeVisible()

    // Off-route cluster → an auto_added stop, geocoded to a real name.
    await expect(page.getByText('Added', { exact: true })).toBeVisible()
    await expect(page.getByText('Vicksburg, Mississippi')).toBeVisible({ timeout: 7000 })

    // Lone transit shot → an interstitial bucket the user can promote.
    await expect(page.getByRole('button', { name: /Make a stop/i })).toBeVisible()
  })

  test('full motion: refine → mark didn’t-happen (removed) → save → archive → lands in Archive·year·month → still editable', async ({ page }) => {
    await openReconcileTriage(page)

    // Let the off-route cluster's name resolve before we touch the draft,
    // so the saved record carries the geocoded name deterministically.
    await expect(page.getByText('Vicksburg, Mississippi')).toBeVisible({ timeout: 7000 })

    // ── Refine: rename the matched stop ──────────────────────────────
    await page.getByRole('button', { name: 'Edit McComb' }).click()
    const nameInput = page.getByTestId('stop-name-input')
    await expect(nameInput).toHaveValue('McComb')
    await nameInput.fill('McComb (Shell station)')

    // ── Override: mark the no-photo stop as didn’t-happen ─────────────
    await page.getByRole('button', { name: "Edit Buc-ee's Terrell" }).click()
    await page.getByRole('button', { name: /Didn't happen/i }).click()
    // It now reads as a removal preview with an Undo affordance.
    await expect(page.getByText("Didn't happen")).toBeVisible()
    await expect(page.getByRole('button', { name: /Undo/i })).toBeVisible()

    // ── Save → the reconciled trip persists ──────────────────────────
    await page.getByRole('button', { name: /Save · upload/i }).click()
    await expect(page.getByText('Saved.')).toBeVisible({ timeout: 15000 })

    const reconciled = await readTrip(page, 'recon-roadtrip-2026')
    const day2 = reconciled.days.find((d) => d.n === 2)
    const ids = day2.stops.map((s) => s.id)
    expect(ids).not.toContain('terrell') // didn’t-happen → removed
    expect(ids).toContain('mccomb')
    const mc = day2.stops.find((s) => s.id === 'mccomb')
    expect(mc.name).toBe('McComb (Shell station)') // rename won
    expect(mc.state).toBe('happened')
    expect(mc.address).toBe('McComb, MS') // original fields preserved
    // The off-route cluster materialized as a real, flagged stop.
    const auto = day2.stops.find((s) => s.addedDuringReconciliation)
    expect(auto).toBeTruthy()
    expect(auto.name).toBe('Vicksburg, Mississippi')
    // Original plan is preserved for plan-vs-reality, and a stamp is set.
    expect(reconciled.originalPlan.days.find((d) => d.n === 2).stops.map((s) => s.id)).toContain('terrell')
    expect(reconciled.reconciledAt).toBeTruthy()

    // ── Archive ──────────────────────────────────────────────────────
    // "Back to the trip" lands in PhotosView now (the importer's home).
    // Archiving lives in Trip Settings, so hop there via the top-bar ⋯.
    await page.getByRole('button', { name: /Back to the trip/i }).click()
    await openTopMenuItem(page, /Settings/i)
    const archiveToggle = page.getByTestId('archive-toggle')
    await expect(archiveToggle).toContainText(/Mark as archived/i)
    await archiveToggle.click()
    await expect(archiveToggle).toContainText(/Unarchive this trip/i, { timeout: 5000 })

    const archived = await readTrip(page, 'recon-roadtrip-2026')
    expect(archived.archivedAt).toBeTruthy()

    // ── Lands in Archive → year → month on the index ─────────────────
    // Use the fixed top-bar back (context-aware: "← <trip>" in Settings →
    // trip, then "← Trips" in the trip view → index). The Settings
    // banner's own "Back" sits under that fixed bar and can't be clicked.
    await page.getByRole('button', { name: /←\s*Reconcile Test Roadtrip/ }).click() // Settings → trip
    await page.getByRole('button', { name: /back to trips/i }).click() // trip → index

    await expect(page.getByText('ARCHIVE · 2026')).toBeVisible({ timeout: 7000 })
    await expect(page.getByText('MAY', { exact: true })).toBeVisible()
    await expect(page.getByText('Reconcile Test Roadtrip')).toBeVisible()

    // ── Still editable: re-open the archived trip → Settings works ───
    await page.getByRole('button').filter({ hasText: 'Reconcile Test Roadtrip' }).first().click()
    await openTopMenuItem(page, /Settings/i)
    await expect(page.getByTestId('archive-toggle')).toContainText(/Unarchive this trip/i)
  })
})

// ── Focused coverage of the archive grouping itself (Step 4) ──────────

const MONTH_TRIPS = [
  archivableTrip({ id: 'apr-2026', title: 'April Trip', start: '2026-04-10', end: '2026-04-12', archived: true }),
  archivableTrip({ id: 'feb-2026', title: 'February Trip', start: '2026-02-05', end: '2026-02-07', archived: true }),
  archivableTrip({ id: 'sep-2025', title: 'September Trip', start: '2025-09-01', end: '2025-09-03', archived: false }),
]

function archivableTrip({ id, title, start, end, archived }) {
  return {
    id,
    status: archived ? 'archived' : 'planning',
    ...(archived ? { archivedAt: '2026-05-20T00:00:00.000Z' } : {}),
    title,
    subtitle: '',
    dateRange: `${start} – ${end}`,
    dateRangeStart: start,
    dateRangeEnd: end,
    startCity: 'A',
    endCity: 'B',
    travelers: ['jonathan', 'helen'],
    days: [{ n: 1, date: '', isoDate: start, title: '', stops: [] }],
  }
}

test.describe('TripIndex archive grouping', () => {
  test('archives group by year → month, newest first, with explicit + date archives', async ({ page }) => {
    await seedTripIntoCache(page, MONTH_TRIPS[0])
    // Overwrite the single-trip cache the helper seeded with the full set.
    await page.addInitScript((trips) => {
      localStorage.setItem('rt_trips_cache_v1', JSON.stringify(trips))
    }, MONTH_TRIPS)
    await page.goto(`/?person=${PERSONA}&nosw=1`)

    // No date-current trip → the index renders directly.
    await expect(page.getByText('ARCHIVE · 2026')).toBeVisible({ timeout: 7000 })
    await expect(page.getByText('ARCHIVE · 2025')).toBeVisible()

    // 2026 holds two months (explicit archives), newest first.
    await expect(page.getByText('APRIL', { exact: true })).toBeVisible()
    await expect(page.getByText('FEBRUARY', { exact: true })).toBeVisible()
    // 2025 holds the date-archived prior-year trip.
    await expect(page.getByText('SEPTEMBER', { exact: true })).toBeVisible()

    await expect(page.getByText('April Trip')).toBeVisible()
    await expect(page.getByText('February Trip')).toBeVisible()
    await expect(page.getByText('September Trip')).toBeVisible()

    // Ordering: ARCHIVE · 2026 appears above ARCHIVE · 2025, and within
    // 2026, APRIL above FEBRUARY.
    const order = await page.evaluate(() => {
      const body = document.body.innerText
      return {
        y2026: body.indexOf('ARCHIVE · 2026'),
        y2025: body.indexOf('ARCHIVE · 2025'),
        apr: body.indexOf('APRIL'),
        feb: body.indexOf('FEBRUARY'),
      }
    })
    expect(order.y2026).toBeLessThan(order.y2025)
    expect(order.apr).toBeLessThan(order.feb)
  })
})
