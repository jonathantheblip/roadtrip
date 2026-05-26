import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// Touch-swipe nav in the lightbox. We stay on the Chromium project
// (no WebKit binary needed) but force touch + a phone-sized viewport
// so the gesture handler runs in the same shape as on Helen's
// iPhone. The swipe-classification math is also covered by
// scripts/__tests__/swipeClassify.test.mjs (pure-Node); these tests
// verify the React handler wires those gestures through to the
// actual navigation callbacks.

test.use({
  hasTouch: true,
  viewport: { width: 390, height: 844 }, // iPhone 13 logical px
})

test.describe('Lightbox touch gestures (M2)', () => {
  test('swipe left → next, swipe right → prev, swipe down → close', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      photoMemory('m1', 'one', '2026-05-23T19:50:00Z'),
      photoMemory('m2', 'two', '2026-05-23T20:00:00Z'),
      photoMemory('m3', 'three', '2026-05-23T20:10:00Z'),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('photo-tile').first().click()

    const lightbox = page.getByTestId('photo-lightbox')
    await expect(lightbox).toBeVisible()
    await expect(lightbox).toContainText('1 / 3')

    const box = await lightbox.boundingBox()
    if (!box) throw new Error('lightbox has no bounding box')
    const midY = box.y + box.height / 2

    // Swipe LEFT → next.
    await dispatchSwipe(page, {
      from: { x: box.x + box.width - 30, y: midY },
      to: { x: box.x + 30, y: midY },
    })
    await expect(lightbox).toContainText('2 / 3')

    // Swipe RIGHT → prev.
    await dispatchSwipe(page, {
      from: { x: box.x + 30, y: midY },
      to: { x: box.x + box.width - 30, y: midY },
    })
    await expect(lightbox).toContainText('1 / 3')

    // Swipe DOWN → close.
    await dispatchSwipe(page, {
      from: { x: box.x + box.width / 2, y: box.y + 60 },
      to: { x: box.x + box.width / 2, y: box.y + 260 },
    })
    await expect(lightbox).toHaveCount(0)
  })

  test('a tiny jiggle is not a swipe (no nav, no close)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      photoMemory('m1', 'one', '2026-05-23T19:50:00Z'),
      photoMemory('m2', 'two', '2026-05-23T20:00:00Z'),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('photo-tile').first().click()

    const lightbox = page.getByTestId('photo-lightbox')
    await expect(lightbox).toContainText('1 / 2')
    const box = await lightbox.boundingBox()

    // 15px drift, below the 40px nav threshold.
    await dispatchSwipe(page, {
      from: { x: box.x + 50, y: box.y + box.height / 2 },
      to: { x: box.x + 65, y: box.y + box.height / 2 + 8 },
    })
    await expect(lightbox).toContainText('1 / 2')
    await expect(lightbox).toBeVisible()
  })
})

async function dispatchSwipe(page, { from, to, steps = 6 }) {
  // The React handler in PhotoAlbum.jsx only reads touches[0].clientX/Y
  // (on touchstart) and changedTouches[0].clientX/Y (on touchend) —
  // it doesn't listen for touchmove. We just need a touchstart at
  // `from` and a touchend at `to`.
  //
  // WebKit blocks `new TouchEvent(...)` and `new Touch({...})` with
  // "Illegal constructor". To stay cross-browser we sidestep both:
  // dispatch a base Event with the touch-list properties pinned via
  // Object.defineProperty. React's event delegation listens by event
  // name (touchstart/touchend) and reads touches off the native event,
  // so the plain Event with the right shape is enough.
  const lightboxSel = '[data-testid="photo-lightbox"]'
  await page.evaluate(
    ({ from, to, steps, lightboxSel }) => {
      const target = document.querySelector(lightboxSel)
      if (!target) throw new Error('no lightbox to swipe')
      function touch(x, y) {
        return {
          identifier: 0,
          target,
          clientX: x,
          clientY: y,
          pageX: x,
          pageY: y,
          screenX: x,
          screenY: y,
          radiusX: 1,
          radiusY: 1,
          rotationAngle: 0,
          force: 1,
        }
      }
      function fire(name, touches, changedTouches) {
        const ev = new Event(name, { bubbles: true, cancelable: true })
        Object.defineProperty(ev, 'touches', { value: touches })
        Object.defineProperty(ev, 'targetTouches', { value: touches })
        Object.defineProperty(ev, 'changedTouches', { value: changedTouches })
        target.dispatchEvent(ev)
      }
      const start = [touch(from.x, from.y)]
      fire('touchstart', start, start)
      // touchmove dispatch is faithful to a real swipe but unused by
      // the handler — keep it for any future handler that reads it.
      const dx = (to.x - from.x) / steps
      const dy = (to.y - from.y) / steps
      for (let i = 1; i < steps; i++) {
        const mid = [touch(from.x + dx * i, from.y + dy * i)]
        fire('touchmove', mid, mid)
      }
      const end = [touch(to.x, to.y)]
      // On touchend, `touches` is empty (touch lifted) and the final
      // coords land in `changedTouches`.
      fire('touchend', [], end)
    },
    { from, to, steps, lightboxSel }
  )
}

function photoMemory(id, caption, createdAt) {
  return {
    id,
    tripId: 'volleyball-2026',
    stopId: 'vb2-3',
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'photo',
    caption,
    photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL },
    photoExternalURLs: [],
    reactions: [],
    createdAt,
    updatedAt: createdAt,
  }
}
