#!/usr/bin/env node
// Hero image fetcher for side activities (Side Activities v1.5).
//
// Walks every seed JSON under app/src/data/sideActivities/. For each
// activity with `officialUrl` set and `heroImage === null`:
//   1. Fetches the official page (2s timeout)
//   2. Extracts og:image (fallback twitter:image) via src/lib/ogImage.js
//   3. Downloads the image (2s timeout)
//   4. Resizes to max 1200px wide, encodes as WebP (quality 80)
//   5. Writes app/public/activities/{id}.webp
//   6. Updates the seed JSON's heroImage field to "./activities/{id}.webp"
//
// Failures are non-fatal per-activity: log + continue, the activity
// renders the existing TypographicHeader fallback.
//
// Usage (from the repo root):
//   node app/scripts/fetchHeroImages.mjs                # all trips
//   node app/scripts/fetchHeroImages.mjs --tripId=X     # one trip
//   node app/scripts/fetchHeroImages.mjs --force        # re-fetch even if heroImage set
//   node app/scripts/fetchHeroImages.mjs --dry-run      # don't write files or mutate JSON
//
// Lives under app/scripts/ (not repo-root scripts/) so Node resolves
// `sharp` from app/node_modules.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { extractOgImage } from '../src/lib/ogImage.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(__dirname, '..')
const SEED_DIR = join(APP_ROOT, 'src', 'data', 'sideActivities')
const OUT_DIR = join(APP_ROOT, 'public', 'activities')

// --- args -----------------------------------------------------------
const args = process.argv.slice(2)
const onlyTripId = (args.find((a) => a.startsWith('--tripId=')) || '').split('=')[1] || null
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')

// --- fetch helpers --------------------------------------------------
const TIMEOUT_MS = 2000
const UA =
  'Mozilla/5.0 (compatible; RoadtripHeroFetch/1.0; +https://jonathantheblip.github.io/roadtrip/)'

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, ...(opts.headers || {}) },
    })
  } finally {
    clearTimeout(t)
  }
}

async function fetchHtml(url) {
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function fetchBytes(url) {
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// --- main -----------------------------------------------------------
async function processActivity(activity, mutationsForFile) {
  const id = activity.id
  if (!activity.officialUrl) {
    return { skip: 'no officialUrl' }
  }
  if (activity.heroImage && !force) {
    return { skip: 'already has heroImage' }
  }

  // 1. Fetch official page
  let html
  try {
    html = await fetchHtml(activity.officialUrl)
  } catch (e) {
    return { error: `fetch page: ${e.message}` }
  }

  // 2. Parse og:image
  const imageUrl = extractOgImage(html, activity.officialUrl)
  if (!imageUrl) {
    return { error: 'no og:image / twitter:image found' }
  }
  // Filter obvious logo/favicon URLs — some sites set og:image to their
  // brand mark, which makes a poor hero. The TypographicHeader fallback
  // is better than a stretched logo.
  if (/logo|favicon|icon-\d|apple-touch/i.test(imageUrl)) {
    return { error: `image URL looks like a logo/icon: ${imageUrl}` }
  }

  // 3. Download image
  let imageBytes
  try {
    imageBytes = await fetchBytes(imageUrl)
  } catch (e) {
    return { error: `fetch image: ${e.message}` }
  }

  // 4. sharp → webp (max 1200w, never upscale).
  // Reject sources < 600px wide — almost certainly a logo or favicon
  // dressed up as og:image. The TypographicHeader fallback looks better
  // than a tiny stretched logo.
  let webp, sourceWidth
  try {
    const input = sharp(imageBytes)
    const meta = await input.metadata()
    sourceWidth = meta.width || 0
    if (sourceWidth < 600) {
      return { error: `source too small (${sourceWidth}px wide; likely a logo)` }
    }
    webp = await input
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
  } catch (e) {
    return { error: `sharp: ${e.message}` }
  }

  // 5. Write file
  const outPath = join(OUT_DIR, `${id}.webp`)
  if (!dryRun) {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(outPath, webp)
  }

  // 6. Queue JSON mutation
  const heroPath = `./activities/${id}.webp`
  mutationsForFile.set(id, heroPath)

  return { ok: { imageUrl, bytes: webp.length, heroPath } }
}

async function processFile(filePath) {
  const raw = readFileSync(filePath, 'utf8')
  const activities = JSON.parse(raw)
  if (!Array.isArray(activities)) {
    console.warn(`  skip: ${filePath} not an array`)
    return
  }

  // Map of id → new heroPath. We collect all mutations then write the
  // file once at the end so a mid-loop abort doesn't leave the JSON
  // half-updated.
  const mutations = new Map()

  for (const a of activities) {
    if (onlyTripId && a.tripId !== onlyTripId) continue
    const result = await processActivity(a, mutations)
    if (result.skip) {
      console.log(`  - ${a.id}: skip (${result.skip})`)
    } else if (result.error) {
      console.log(`  ! ${a.id}: ${result.error}`)
    } else if (result.ok) {
      console.log(
        `  ✓ ${a.id}: ${result.ok.bytes} bytes  ←  ${result.ok.imageUrl}`
      )
    }
  }

  if (mutations.size === 0) {
    console.log(`  (no JSON changes for ${filePath})`)
    return
  }

  // Surgical string-replace on the raw file content so we don't disturb
  // the author's formatting (inline arrays, number precision like
  // -71.9650 with trailing zero, etc.). JSON.stringify on the parsed
  // object reformats every array and drops trailing zeros, which churns
  // hundreds of lines for what should be 2 small edits.
  let nextRaw = raw
  let appliedCount = 0
  for (const [id, heroPath] of mutations) {
    // Match the activity block by its "id": "<id>" anchor, then find
    // the *next* "heroImage": null and replace just that occurrence.
    // The JSON is array-of-objects; heroImage is always the last field
    // in each activity, so the next null after the id anchor belongs to
    // that activity.
    const idAnchor = nextRaw.indexOf(`"id": ${JSON.stringify(id)}`)
    if (idAnchor === -1) {
      console.warn(`  ! ${id}: could not locate id anchor in source`)
      continue
    }
    const nullMatch = nextRaw.indexOf('"heroImage": null', idAnchor)
    if (nullMatch === -1) {
      console.warn(`  ! ${id}: id anchor found but heroImage: null not after it`)
      continue
    }
    nextRaw =
      nextRaw.slice(0, nullMatch) +
      `"heroImage": ${JSON.stringify(heroPath)}` +
      nextRaw.slice(nullMatch + '"heroImage": null'.length)
    appliedCount += 1
  }

  if (!dryRun) {
    writeFileSync(filePath, nextRaw)
    console.log(`  wrote ${appliedCount} heroImage updates to ${filePath}`)
  } else {
    console.log(`  [dry-run] would write ${appliedCount} updates to ${filePath}`)
  }
}

async function main() {
  const files = readdirSync(SEED_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(SEED_DIR, f))

  for (const file of files) {
    console.log(`\n${file}`)
    await processFile(file)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
