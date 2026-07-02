// THE RECORD · mouth three (2026-07-02) — "type it." The editor gained a
// second tense: THE PLAN | THE RECORD. Record mode lets a typer set down what
// actually happened, day by day, and — the load-bearing guarantee — it writes
// day.record ONLY. The plan (day.stops) is byte-identical before and after.
// This spec pins that guard against a live render, plus the honesty rule that
// a half-typed (nameless) row never leaks onto the home.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// Clock is stubbed to 2026-05-23 (clockStub); this stay straddles it, so the
// home renders LIVE and the standing "Change the plan" quiet action is present.
const STAY = {
  id: 'rec-editor-stay', shape: 'stay', status: 'planning', title: 'Provincetown', subtitle: 'fixture',
  dateRange: 'May 22 – 25, 2026', dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-25',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  heroImage: TINY_RED_PNG_DATA_URL,
  lodging: { name: 'Harbor Breeze', address: '690 Commercial St, Provincetown, MA', lat: 42.0584, lng: -70.1787 },
  days: [
    {
      n: 1, isoDate: '2026-05-22', date: 'Fri May 22', title: 'Arrive', lodging: 'Harbor Breeze',
      stops: [{ id: 'rec-arrive', time: '4:00 PM', name: 'Check in', kind: 'logistics', for: ['jonathan', 'helen', 'aurelia', 'rafa'] }],
    },
    {
      n: 2, isoDate: '2026-05-23', date: 'Sat May 23', title: 'Beach', lodging: 'Harbor Breeze',
      stops: [{ id: 'rec-beach', time: '11:00 AM', name: 'Race Point Beach', kind: 'park', for: ['jonathan', 'helen', 'aurelia', 'rafa'] }],
    },
  ],
}

function dayFromCache(page, dayIso) {
  return page.evaluate((iso) => {
    const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
    const t = all.find((x) => x.id === 'rec-editor-stay')
    return t?.days?.find((d) => d.isoDate === iso) || null
  }, dayIso)
}

test('record mode writes day.record, leaves the plan byte-identical, and the home shows it', async ({ page }) => {
  await seedTripIntoCache(page, STAY)
  await page.goto('/?person=helen&trip=rec-editor-stay&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })

  // Into the editor via the standing quiet action, then flip to THE RECORD.
  await home.getByRole('button', { name: 'Change the plan' }).click()
  const recordTab = page.getByTestId('editor-mode-record')
  await expect(recordTab).toBeVisible({ timeout: 5000 })
  await recordTab.click()
  const rec = page.getByTestId('record-mode')
  await expect(rec).toBeVisible()
  await expect(rec).toContainText(/never touch the plan/i)

  // Day 2 (Beach, 05-23) is the second day block — record what happened.
  await rec.getByRole('button', { name: /Add what happened/i }).nth(1).click()
  await rec.getByLabel('What happened', { exact: true }).last().fill('Biked the dunes')
  await rec.getByRole('button', { name: /^Afternoon$/i }).last().click()
  await rec.getByLabel('A line, if you like').last().fill('The whole ride, wind at our backs.')

  // Autosave (debounced) writes the record; the plan is never touched.
  await expect.poll(async () => (await dayFromCache(page, '2026-05-23'))?.record?.map((e) => e.name) || [],
    { timeout: 5000 }).toContain('Biked the dunes')
  const day = await dayFromCache(page, '2026-05-23')
  const entry = day.record.find((e) => e.name === 'Biked the dunes')
  expect(entry.time).toBe('Afternoon')
  expect(entry.note).toBe('The whole ride, wind at our backs.')
  expect(entry.source).toBe('manual')
  // THE guard: day.stops is exactly what it was — the plan is not rewritten.
  expect(day.stops.map((s) => s.name)).toEqual(['Race Point Beach'])
  expect(day.stops.map((s) => s.time)).toEqual(['11:00 AM'])

  await page.screenshot({ path: 'tests/e2e/screenshots/record-editor-mode.png' })

  // Back to the trip, unfold the whole stay — the record reads under "As it happened".
  await page.getByRole('button', { name: /Provincetown/ }).first().click()
  await expect(home).toBeVisible({ timeout: 10000 })
  await home.getByTestId('whole-stay-toggle').click()
  const record = home.getByTestId('day-record').first()
  await expect(record).toBeVisible()
  await expect(record).toContainText(/as it happened/i)
  await expect(record).toContainText('Biked the dunes')
})

test('a nameless record row stays in the working copy but never leaks onto the home', async ({ page }) => {
  await seedTripIntoCache(page, STAY)
  await page.goto('/?person=helen&trip=rec-editor-stay&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await home.getByRole('button', { name: 'Change the plan' }).click()
  await page.getByTestId('editor-mode-record').click()
  const rec = page.getByTestId('record-mode')
  await expect(rec).toBeVisible()

  // Add a row to day 1 but never name it — a half-typed thought.
  await rec.getByRole('button', { name: /Add what happened/i }).first().click()
  // Give autosave a beat, then confirm the raw array kept the nameless row.
  await expect.poll(async () => (await dayFromCache(page, '2026-05-22'))?.record?.length || 0,
    { timeout: 5000 }).toBe(1)
  const day = await dayFromCache(page, '2026-05-22')
  expect(day.record[0].name).toBe('')

  // The home must NOT show an empty record row for that day.
  await page.getByRole('button', { name: /Provincetown/ }).first().click()
  await expect(home).toBeVisible({ timeout: 10000 })
  await home.getByTestId('whole-stay-toggle').click()
  await expect(home.getByTestId('day-record')).toHaveCount(0)
})
