import { test, expect } from '@playwright/test'
import {
  realMediaAvailable,
  realMediaMissing,
  logCorpusStatus,
} from './_fixtures/realMedia.js'

// The bug-trap (BUG_TRAP_PUNCHLIST.md Item A.2) requires real
// camera-roll media. This test is the canary: when Jonathan
// hasn't dropped the fixtures yet, this prints the missing list
// and SKIPS the upload-touching journeys gracefully — instead of
// each one independently producing a confusing skip with no
// shared explanation.
//
// Once the corpus is complete, this test prints a one-line
// "complete" and continues green.

test('real-media corpus is present (or surfaces what is missing)', () => {
  logCorpusStatus()
  const missing = realMediaMissing()
  if (missing.length > 0) {
    // SOFT signal — not a failure. The corpus exists across the
    // LFS boundary; CI without LFS pulled gets a clear note here
    // and proceeds with the WebKit/Chromium tests that don't
    // need real media. Tests that DO need a fixture skip
    // themselves with a specific message.
    test.info().annotations.push({
      type: 'corpus-incomplete',
      description: `Missing: ${missing.join(', ')}`,
    })
  }
  expect(realMediaAvailable().length + missing.length).toBeGreaterThan(0)
})
