// Cross-device "Wave hi!" (016) — the client send + receive. The worker rules
// (sender-from-session, recipient-only reads, purge) are in worker/test/waves.test.js;
// here we prove the UI: the grown-up band's per-person 👋 and Rafa's reveal both
// POST a wave, and an incoming wave pops a friendly cue that marks itself seen.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

const TRIP = FIXTURE_TRIP.id
const STUB = Date.parse('2026-05-23T12:00:00.000Z')

function presenceRows() {
  const r = (t, b, ago) => ({ tripId: TRIP, traveler: t, precise: false, lat: null, lng: null, placeBucket: b, note: null, updatedAt: STUB - ago, createdAt: STUB - 3_600_000 })
  return [r('jonathan', 'out', 60_000), r('helen', 'at_place', 30_000), r('aurelia', 'out', 3 * 3_600_000), r('rafa', 'at_place', 20_000)]
}

// Mock /presence (so the band/diorama renders) + /waves (GET incoming, capture POSTs).
function mockAll(page, { incoming = [] } = {}) {
  const posted = { create: [], seen: [] }
  page.route(/workers\.dev\/presence(\?.*)?$/, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(presenceRows()) })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
  page.route(/workers\.dev\/waves(\/seen)?(\?.*)?$/, async (route) => {
    const req = route.request()
    const u = new URL(req.url())
    const body = () => { try { return JSON.parse(req.postData() || '{}') } catch { return {} } }
    if (u.pathname.endsWith('/waves/seen')) { posted.seen.push(body()); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"seen":1}' }) }
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(incoming) })
    posted.create.push(body())
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  return posted
}

test.describe("Wave hi! — cross-device", () => {
  test('a grown-up waves from the band (bidirectional 👋)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    const posted = mockAll(page)
    await page.goto(`/?person=helen&trip=${TRIP}&nosw=1`)
    await expect(page.getByTestId('whos-around')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: 'Wave at Rafa' }).click()
    await expect.poll(() => posted.create.find((w) => w.to === 'rafa'), { timeout: 8000 }).toBeTruthy()
    // the button acknowledges locally (👋 → 💛)
    await expect(page.getByRole('button', { name: 'Waved at Rafa' })).toBeVisible()
  })

  test('Rafa waves from the reveal', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    const posted = mockAll(page)
    await page.goto(`/?person=rafa&trip=${TRIP}&nosw=1`)
    await expect(page.getByTestId('rafa-whos-around')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /Mama/ }).click()
    await page.getByRole('button', { name: 'Wave hi!' }).click()
    await expect.poll(() => posted.create.find((w) => w.to === 'helen'), { timeout: 8000 }).toBeTruthy()
    await expect(page.getByRole('dialog')).toContainText('Wave sent to Mama')
  })

  test('an incoming wave pops a cue and marks itself seen', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    const posted = mockAll(page, { incoming: [{ id: 'w1', tripId: TRIP, from: 'rafa', to: 'helen', createdAt: STUB - 5_000, seenAt: null }] })
    await page.goto(`/?person=helen&trip=${TRIP}&nosw=1`)
    const cue = page.getByTestId('wave-cue')
    await expect(cue).toBeVisible({ timeout: 10000 })
    await expect(cue).toContainText('Rafa waved')
    await page.screenshot({ path: 'tests/e2e/screenshots/wave-cue.png' })
    await expectNoSeriousA11y(page) // the cue (accent fill + accent-ink) + the band's 👋 buttons
    await cue.click() // dismiss → marks seen
    await expect.poll(() => posted.seen.some((s) => (s.ids || []).includes('w1')), { timeout: 8000 }).toBe(true)
    await expect(cue).toHaveCount(0)
  })
})
