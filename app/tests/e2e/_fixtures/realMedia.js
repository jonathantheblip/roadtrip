// Real-media fixture loader. Resolves the corpus described in
// tests/fixtures/media/README.md to Buffers + Playwright-friendly
// shapes for setInputFiles. Single source of truth for filenames —
// rename a file in one place, every test follows.
//
// The bytes live under LFS. If a fixture is missing, the helpers
// return null + log a clear message rather than crashing the test
// run with a cryptic ENOENT — that way a missing fixture surfaces
// as "this journey skipped, real-media fixture not present" rather
// than a confusing red.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// app/tests/e2e/_fixtures/ → app/tests/fixtures/media/
const MEDIA_DIR = resolve(here, '..', '..', 'fixtures', 'media')

// Symbolic name → on-disk filename + mime. Filenames match the
// README table exactly. Renaming a fixture file means changing
// only the right-hand side here.
const FIXTURES = {
  HEIC: {
    file: 'iphone-heic-with-gps.heic',
    mimeType: 'image/heic',
  },
  JPEG_FULLRES: {
    file: 'iphone-jpeg-fullres.jpg',
    mimeType: 'image/jpeg',
  },
  SCREENSHOT_PNG: {
    file: 'iphone-screenshot.png',
    mimeType: 'image/png',
  },
  SCREEN_RECORDING_MOV: {
    file: 'iphone-screen-recording.mov',
    mimeType: 'video/quicktime',
  },
  VIDEO_1080P_5S: {
    file: 'iphone-video-1080p-5s.mov',
    mimeType: 'video/quicktime',
  },
  VIDEO_4K_30S: {
    file: 'iphone-video-4k-30s.mov',
    mimeType: 'video/quicktime',
  },
  VIDEO_PORTRAIT: {
    file: 'iphone-video-portrait.mov',
    mimeType: 'video/quicktime',
  },
  VIDEO_LANDSCAPE: {
    file: 'iphone-video-landscape.mov',
    mimeType: 'video/quicktime',
  },
}

// Returns { name, mimeType, buffer } for setInputFiles, or null if
// the on-disk file is missing. Tests that depend on a missing
// fixture should `test.skip(!fx, '...not provided yet')`.
export function realMedia(symbol) {
  const entry = FIXTURES[symbol]
  if (!entry) throw new Error(`realMedia: unknown symbol ${symbol}`)
  const path = resolve(MEDIA_DIR, entry.file)
  if (!existsSync(path)) {
    // LFS pointer file (text "version https://...") versus actual
    // binary bytes — both manifest as existsSync true; the size
    // tells us. A real fixture is ≥ ~200 KB; an unpulled LFS
    // pointer is well under 1 KB. We can't readFileSync the
    // pointer and return it as a fixture, so treat <1 KB as
    // missing.
    return null
  }
  const buffer = readFileSync(path)
  if (buffer.length < 1024 && buffer.toString('utf8', 0, 200).includes('git-lfs')) {
    // LFS pointer, bytes not pulled. Treat as missing.
    return null
  }
  return { name: entry.file, mimeType: entry.mimeType, buffer }
}

// Convenience: list every symbol that has a real file present.
// Useful for sanity-check output at the top of journey tests.
export function realMediaAvailable() {
  return Object.keys(FIXTURES).filter((sym) => realMedia(sym) !== null)
}

// Convenience: list every symbol whose file is missing.
export function realMediaMissing() {
  return Object.keys(FIXTURES).filter((sym) => realMedia(sym) === null)
}

// Print the corpus status. Called from a dedicated check test so
// missing fixtures don't get silently glossed over.
export function logCorpusStatus() {
  const present = realMediaAvailable()
  const missing = realMediaMissing()
  console.log(
    `[realMedia] ${present.length}/${Object.keys(FIXTURES).length} present` +
      (missing.length
        ? `  · MISSING: ${missing.join(', ')}`
        : '  · complete')
  )
}
