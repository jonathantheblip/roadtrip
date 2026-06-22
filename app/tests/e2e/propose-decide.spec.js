// Propose → decide (slice 6) — the CLIENT loop on the "We could…" tab. The
// worker rules (deciders-only, identity-from-session, atomic decide) are covered
// in worker/test/proposals.test.js; here we mock /proposals and prove the UI:
//   - a card's "Propose" opens the sheet and POSTs the spot;
//   - a pending proposal renders in the banner, with the right action per lens
//     (an adult gets Let's go / Not now; a kid gets I'm in);
//   - accepting POSTs the decision.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'

const STAY = {
  id: 'propose-stay-2026',
  status: 'planning',
  title: 'Cabin Stay',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-24',
  startCity: 'Belmont, MA',
  endCity: 'Peru, VT',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  lodging: { name: 'Our Cabin', address: 'Peru, VT', lat: 43.2398, lng: -72.9051 },
  days: [
    { n: 1, date: 'Fri May 22', isoDate: '2026-05-22', title: 'At the cabin', drive: { from: '', to: '', hours: '', miles: 0 }, lodging: '', stops: [] },
  ],
}

const CABIN_DINER = { placeId: 'r1', name: 'Cabin Diner', address: '1 Main St', lat: 43.24, lng: -72.9, distanceMeters: 800, openNow: true, phone: null, photoUrl: null }

async function mockNearby(page) {
  await page.route(/workers\.dev\/places\/nearby$/, async (route) => {
    let q = ''
    try { q = (JSON.parse(route.request().postData() || '{}').query || '').toLowerCase() } catch { /* */ }
    const results = q.includes('restaurant') ? [CABIN_DINER] : []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results, radiusMeters: 10000 }) })
  })
}

// `pendingProposal` (or null) is what GET /proposals returns; POSTs are captured.
function mockProposals(page, { pending = null } = {}) {
  const posted = { create: [], vote: [], decide: [] }
  page.route(/workers\.dev\/proposals(\/[^?]+)?(\?.*)?$/, async (route) => {
    const req = route.request()
    const u = new URL(req.url())
    const m = u.pathname.match(/\/proposals\/([^/]+)\/(vote|decide)$/)
    if (req.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pending ? [pending] : []) })
      return
    }
    if (m) {
      const body = (() => { try { return JSON.parse(req.postData() || '{}') } catch { return {} } })()
      posted[m[2]].push({ id: m[1], ...body })
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }
    // POST /proposals (create)
    const body = (() => { try { return JSON.parse(req.postData() || '{}') } catch { return {} } })()
    posted.create.push(body)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: body.id }) })
  })
  return posted
}

async function openWeCould(page, who) {
  await page.goto(`/?person=${who}&trip=propose-stay-2026&nosw=1`)
  await expect(page.getByTestId('stay-tabbar')).toBeVisible({ timeout: 10000 })
  await page.locator('.stay-tab', { hasText: 'We could' }).click()
  await expect(page.getByTestId('wecould-nearby')).toBeVisible({ timeout: 10000 })
}

const A_PENDING = {
  id: 'prop-1',
  tripId: 'propose-stay-2026',
  spotId: 'r1',
  spot: { id: 'r1', title: 'Cabin Diner', cat: 'meal', travel: { mode: 'drive', minutes: 5 } },
  proposedBy: 'aurelia',
  recipients: ['jonathan', 'helen', 'rafa'],
  note: 'pleeease',
  status: 'pending',
  votes: [],
  decidedBy: null,
  createdAt: 1,
  updatedAt: 1,
}

test.describe('Propose → decide (slice 6)', () => {
  test('a card Propose opens the sheet and POSTs the spot', async ({ page }) => {
    await seedTripIntoCache(page, STAY)
    await mockNearby(page)
    const posted = mockProposals(page)
    await openWeCould(page, 'aurelia')

    await page.getByTestId('propose-card').first().click()
    await expect(page.getByTestId('propose-sheet')).toBeVisible()
    await page.getByTestId('propose-send').click()

    await expect.poll(() => posted.create.length).toBe(1)
    expect(posted.create[0].spotId).toBe('r1')
    expect(posted.create[0].spot?.title).toBe('Cabin Diner')
    // The sheet closes after sending.
    await expect(page.getByTestId('propose-sheet')).toHaveCount(0)
  })

  test('a decider (Jonathan) sees Let’s go / Not now and accepting POSTs the decision', async ({ page }) => {
    await seedTripIntoCache(page, STAY)
    await mockNearby(page)
    const posted = mockProposals(page, { pending: A_PENDING })
    await openWeCould(page, 'jonathan')

    const banner = page.getByTestId('proposals-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Aurelia suggests')
    await expect(banner).toContainText('Cabin Diner')
    await expect(page.getByTestId('proposal-imin')).toHaveCount(0) // an adult does not get "I'm in"

    await page.getByTestId('proposal-accept').click()
    await expect.poll(() => posted.decide.length).toBe(1)
    expect(posted.decide[0]).toMatchObject({ id: 'prop-1', decision: 'accepted' })
  })

  test('a kid (Rafa) gets "I’m in", not the decision', async ({ page }) => {
    await seedTripIntoCache(page, STAY)
    await mockNearby(page)
    const posted = mockProposals(page, { pending: A_PENDING })
    await openWeCould(page, 'rafa')

    await expect(page.getByTestId('proposals-banner')).toBeVisible()
    await expect(page.getByTestId('proposal-accept')).toHaveCount(0) // no decide power
    await page.getByTestId('proposal-imin').click()
    await expect.poll(() => posted.vote.length).toBe(1)
    expect(posted.vote[0].id).toBe('prop-1')
  })
})
