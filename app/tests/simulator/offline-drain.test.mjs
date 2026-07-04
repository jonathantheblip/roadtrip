// iOS Simulator offline-drain journey — the iOS-real coverage that
// R4a's Playwright skip delegates to.
//
// R4a gated photos-offline + photos-dispatch sync-pill tests + the two
// sync-pill screenshot captures on `browserName === 'webkit'` because
// Playwright's bundled WebKit fails `IDBObjectStore.put({...blob})`
// with "Error preparing Blob/File data to be stored in object store".
// Real iOS Safari (iPhone 17 / iOS 26.5) round-trips Blobs through IDB
// cleanly (verified during R4 investigation; see commit beab2b5).
//
// This test answers the actual question R4a's skip delegates: does
// the sync-pill render when the IDB queue has items on real iOS
// Safari? We inject directly via the app's IDB schema (no fetch
// interception, no offline simulation) so the test stays focused on
// the iOS-real surface that Playwright can't exercise: IDB+Blob
// storage and the React subscription that drives the pill.
//
// What this test proves:
//   1. IndexedDB.put({...blob}) succeeds against the queue's schema
//      on real iOS Safari (the surface Playwright WebKit fails).
//   2. PhotosView's mount-time queueCount() read pulls the queued
//      item back and React renders the sync-pill with the count.
//
// Drain coverage (queue → empty after triggerDrain) is a separate
// concern best exercised by the in-app drain UI, not synthesized in
// this Simulator gate.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  startDriver,
  waitForDriverReady,
  newSimulatorSession,
  assertSimulatorBooted,
} from './_driver.mjs'
import { dateStableTripSeed } from './_seed.mjs'
import { resolvePersona } from '../e2e/_fixtures/persona.js'

const BASE_URL = process.env.SIMULATOR_BASE_URL || 'http://localhost:5181'
// Date-stable seed (see _seed.mjs) — the sim tier has no clockStub.js, so
// the raw May-2026 fixture would bounce to the trips index on today's clock.
const SEED_TRIP = dateStableTripSeed()

// Persona for this sim run: RT_PERSONA env override, default 'helen' so
// existing sim behavior is unchanged. See app/tests/e2e/_fixtures/persona.js.
const PERSONA = resolvePersona('helen')

test('sync-pill renders when IDB queue is populated on iOS Simulator Safari', async (t) => {
  await assertSimulatorBooted()
  const driver = startDriver()
  let browser
  t.after(async () => {
    if (browser) {
      try { await browser.deleteSession() } catch { /* ignore */ }
    }
    driver.kill()
  })
  await waitForDriverReady(driver.url)
  browser = await newSimulatorSession({ port: driver.port })

  // Seed trip cache + start from a known queue state. Delete the
  // upload queue DB explicitly and wait for completion — otherwise
  // a leftover state from a prior simulator run makes the subsequent
  // indexedDB.open hang waiting for a blocked transaction.
  await browser.url(BASE_URL + '/?nosw=1')
  await browser.execute(
    async (trip, persona) =>
      new Promise((resolve, reject) => {
        const KEYS_TO_CLEAR = [
          'rt_trips_cache_v1',
          'rt_memories_shared_v1',
          'rt_memories_private_jonathan_v1',
          'rt_memories_private_helen_v1',
          'rt_memories_private_aurelia_v1',
          'rt_memories_private_rafa_v1',
          'rt_upload_log_v1',
        ]
        for (const k of KEYS_TO_CLEAR) localStorage.removeItem(k)
        localStorage.setItem('rt_trips_cache_v1', JSON.stringify([trip]))
        localStorage.setItem('rt_person_v2', persona)
        const req = indexedDB.deleteDatabase('roadtrip-upload-queue')
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error || new Error('IDB delete failed'))
        req.onblocked = () => resolve() // accept blocked; we'll proceed
      }),
    SEED_TRIP,
    PERSONA
  )

  await browser.url(BASE_URL + `/?person=${PERSONA}&trip=volleyball-2026&nosw=1`)

  // Wait for React hydration before we touch IDB.
  await browser.$('[data-testid="helen-photos-entry"]').then((el) =>
    el.waitForExist({ timeout: 15_000 })
  )

  // Inject a queued upload item BEFORE PhotosView mounts. PhotosView's
  // useEffect reads queueCount() on mount and re-reads on
  // notifyListeners. Since we bypass the app's enqueue() to keep this
  // test focused on "can IDB hold a Blob on iOS, and does PhotosView
  // render the pill from a non-zero count", we rely on the mount-time
  // read rather than the subscription.
  const writeResult = await browser.execute(async () => {
    try {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('roadtrip-upload-queue', 1)
        req.onupgradeneeded = () => {
          const d = req.result
          if (!d.objectStoreNames.contains('pending')) {
            const store = d.createObjectStore('pending', { keyPath: 'id' })
            store.createIndex('queuedAt', 'queuedAt')
          }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      // Tiny synthetic Blob — the pill renders on queue COUNT, not
      // blob size or validity. iOS Safari accepts Blob storage cleanly.
      const blob = new Blob([new Uint8Array([255, 216, 255, 224])], {
        type: 'image/jpeg',
      })
      const record = {
        id: 'sim-r4b-1',
        queuedAt: Date.now(),
        attempts: 0,
        kind: 'photo',
        tripId: 'volleyball-2026',
        stopId: 'vb1-3',
        authorTraveler: 'helen',
        caption: 'R4b simulator',
        blob,
        ref: { storage: 'pending', kind: 'photo' },
      }
      await new Promise((resolve, reject) => {
        const tx = db.transaction('pending', 'readwrite').objectStore('pending')
        const req = tx.put(record)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
      db.close()
      return { ok: true, id: record.id }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })
  assert.ok(writeResult.ok, `IDB write failed: ${JSON.stringify(writeResult)}`)

  // Now navigate into PhotosView. Its useEffect's initial refresh()
  // reads queueCount() = 1 from the just-written record and the
  // sync pill renders.
  await browser.execute(() => {
    document.querySelector('[data-testid="helen-photos-entry"]')?.click()
  })
  await browser.$('[data-testid="import-photos"]').then((el) =>
    el.waitForExist({ timeout: 10_000 })
  )

  // Pill should now be visible with the pending count.
  const syncPill = await browser.$('[data-testid="sync-pill"]')
  try {
    await syncPill.waitForDisplayed({ timeout: 15_000 })
  } catch (err) {
    const probe = await browser.execute(() => ({
      pillCount: document.querySelectorAll('[data-testid="sync-pill"]').length,
      pageTestids: Array.from(
        document.querySelectorAll('[data-testid]')
      ).map((el) => el.getAttribute('data-testid')),
    }))
    throw new Error(
      `sync-pill not displayed after 15s\n  probe: ${JSON.stringify(probe, null, 2)}\n  origin: ${err?.message}`
    )
  }

  const pillText = await syncPill.getText()
  // Per-person pill copy (foolproof-video L5): "1 uploading" (helen default),
  // "1 queued" (jonathan), Rafa's "saving…" — tolerant across the sim persona.
  assert.match(pillText, /(?:1\s+(?:uploading|queued))|saving/i, `unexpected sync-pill text: ${pillText}`)
})
