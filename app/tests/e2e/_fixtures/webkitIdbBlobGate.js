// Shared reason for tests that need to skip on Playwright's webkit-mobile
// project because Playwright's bundled WebKit fails IDB.put({...blob}) with
// "Error preparing Blob/File data to be stored in object store". Verified
// 2026-05-25 via Simulator diagnostic (R4): real iOS Safari (iPhone 17 /
// iOS 26.5) round-trips Blobs through IndexedDB cleanly. iOS-real coverage
// of the offline drain path lives at tests/simulator/offline-drain.test.mjs
// (R4b).
//
// Usage:
//   import { WEBKIT_IDB_BLOB_REASON } from './_fixtures/webkitIdbBlobGate.js'
//   test('...', async ({ page, browserName }) => {
//     test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
//     ...
//   })
//
// When Playwright fixes the underlying issue upstream, remove every
// `test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)` call site
// and delete this file.

export const WEBKIT_IDB_BLOB_REASON =
  'Playwright WebKit fails IDB+Blob storage; real iOS Safari works (R4 — see Simulator gate)'
