// One-shot backfill for oversized R2 photos.
//
// Background — see docs at app/docs/photo-server-resize-spec.md.
// Prior to commit 21fc084, the ThreadedMemories / TripEditor /
// PostcardComposer surfaces wrote raw camera-roll bytes to R2
// without running them through preparePhotoForUpload, leaving 63 of
// 68 photos at 2.5–7.4 MB and 4032×3024 to 5712×4284. Those tile
// black on iOS Safari (decoded RGBA exceeds the per-tab graphics
// budget). The structural fix in 21fc084 protects new uploads. This
// script handles the existing R2 objects in-place: same key, same
// memory references, just smaller bytes.
//
// Flow:
//   1. Pull memories via the Worker (auth'd) to enumerate photo URLs.
//   2. For each, peek the Content-Length via a range request.
//   3. If over the threshold, GET, downscale via sharp, and write
//      back to R2 at the SAME KEY via `wrangler r2 object put`.
//
// Run from anywhere — the .env loader walks up to find the repo
// root. From repo root:
//   node app/scripts/backfill-photos.mjs            # process everything > threshold
//   node app/scripts/backfill-photos.mjs --dry-run  # report only, no writes
//   node app/scripts/backfill-photos.mjs --limit=3  # process at most N photos
//
// Lives in app/scripts/ rather than worker/scripts/ because sharp is
// the only image-processing dep the repo has and it sits in app/
// devDeps. The `wrangler r2` invocation cd's into worker/ so the
// binding context resolves cleanly.
//
// Requirements: sharp (app devDep, ^0.34.5), wrangler (npx-resolved
// from worker/), .env at repo root with VITE_WORKER_URL +
// VITE_FAMILY_TOKEN_JONATHAN.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))

// ─── env loader (mirrors backfill_vermont_2026-05-17.mjs) ───────────
// Walk up looking for an .env that contains VITE_WORKER_URL. The
// repo has TWO .env files: a per-package one at app/.env for the
// Places API key, and a root .env carrying everything else. Naive
// "first .env we find" picks app/.env and misses the VITE_ keys.
function findEnv() {
  for (const base of [here, process.cwd()]) {
    let dir = base
    for (let i = 0; i < 6; i++) {
      const p = resolve(dir, '.env')
      if (existsSync(p) && /\bVITE_WORKER_URL\b/.test(readFileSync(p, 'utf8'))) {
        return p
      }
      const up = dirname(dir)
      if (up === dir) break
      dir = up
    }
  }
  return null
}
function loadEnv(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const envPath = findEnv()
if (!envPath) {
  console.error('Could not locate .env (looked from script dir and cwd up to repo root).')
  process.exit(1)
}
const env = loadEnv(envPath)
const WORKER = (env.VITE_WORKER_URL || '').replace(/\/+$/, '')
const TOKEN = env.VITE_FAMILY_TOKEN_JONATHAN || env.VITE_FAMILY_TOKEN_HELEN
if (!WORKER || !TOKEN) {
  console.error('Missing VITE_WORKER_URL or family token in .env')
  process.exit(1)
}

// ─── flags ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const limitArg = argv.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity

// ─── policy ─────────────────────────────────────────────────────────
const BUCKET = 'roadtrip-assets'
const SIZE_THRESHOLD = 1_000_000 // 1 MB — anything bigger is suspect
const MAX_EDGE = 2048
const JPEG_QUALITY = 85
// The wrangler r2 object put command needs to run from the worker
// directory (where wrangler.toml lives, so the binding context
// resolves cleanly). Script lives in app/scripts/ → ../../worker/.
const WORKER_DIR = resolve(here, '..', '..', 'worker')

// ─── work ───────────────────────────────────────────────────────────
async function main() {
  console.log(`Worker: ${WORKER}`)
  console.log(`Mode:   ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (will overwrite R2 objects)'}`)
  if (Number.isFinite(LIMIT)) console.log(`Limit:  ${LIMIT}`)
  console.log()

  console.log('Pulling /memories ...')
  const r = await fetch(`${WORKER}/memories`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!r.ok) {
    console.error(`memories fetch failed: ${r.status} ${r.statusText}`)
    process.exit(1)
  }
  const memories = await r.json()

  // Flatten every photo ref across every memory. A memory can carry
  // either a single photoRef OR a photoRefs[] album.
  const photoRefs = []
  for (const m of memories) {
    if (m.photoRef?.url && m.photoRef.key) {
      photoRefs.push({ ...m.photoRef, memoryId: m.id, author: m.authorTraveler })
    }
    for (const ref of m.photoRefs || []) {
      if (ref?.url && ref.key) {
        photoRefs.push({ ...ref, memoryId: m.id, author: m.authorTraveler })
      }
    }
  }
  console.log(`Found ${photoRefs.length} photo refs across ${memories.length} memories.\n`)

  // Probe sizes. The Worker doesn't route HEAD (auth-rejects with
  // 401) and doesn't honor Range (no Content-Range), but the GET
  // response always carries Content-Length. We discard the body via
  // res.body.cancel() right after reading the header so we don't
  // pay the full bytes for the probe.
  console.log('Probing sizes ...')
  const sized = []
  for (const ref of photoRefs) {
    try {
      const probe = await fetch(ref.url)
      const len = parseInt(probe.headers.get('content-length') || '0', 10) || 0
      try { await probe.body?.cancel() } catch {}
      sized.push({ ...ref, size: len })
    } catch {
      sized.push({ ...ref, size: 0 })
    }
  }
  const oversized = sized
    .filter((r) => r.size > SIZE_THRESHOLD)
    .sort((a, b) => b.size - a.size)
  const small = sized.length - oversized.length

  console.log(`  ${oversized.length} oversized (> ${(SIZE_THRESHOLD / 1024 / 1024).toFixed(1)} MB)`)
  console.log(`  ${small} already-small (skipping)\n`)

  if (oversized.length === 0) {
    console.log('Nothing to do.')
    return
  }

  // Show the top of the list before any writes — gives a sense of
  // scale even before --dry-run output.
  console.log('Top by size:')
  for (const r of oversized.slice(0, 5)) {
    console.log(`  ${(r.size / 1024 / 1024).toFixed(2).padStart(6)} MB  ${r.author?.padEnd(9) || ''}  ${r.key}`)
  }
  console.log()

  const queue = oversized.slice(0, LIMIT)
  console.log(`Processing ${queue.length} photo(s)...\n`)

  if (DRY_RUN) {
    console.log('Dry run — no actual writes. Re-run without --dry-run to apply.')
    return
  }

  const tmp = mkdtempSync(resolve(tmpdir(), 'roadtrip-backfill-'))
  let ok = 0
  let failed = 0
  const failures = []

  for (const ref of queue) {
    try {
      process.stdout.write(`  ${ref.key} ... `)
      // Download original
      const dlRes = await fetch(ref.url)
      if (!dlRes.ok) throw new Error(`download ${dlRes.status}`)
      const inputBuf = Buffer.from(await dlRes.arrayBuffer())

      // Downscale + re-encode. .rotate() applies the EXIF orientation
      // tag and strips all metadata in the output — both the
      // orientation fix and the privacy benefit (GPS removed) are
      // intentional. The album surface reads memory.capturedAt as the
      // source of truth, not the file's EXIF.
      const outBuf = await sharp(inputBuf)
        .rotate()
        .resize({
          width: MAX_EDGE,
          height: MAX_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer()

      const tmpFile = resolve(tmp, ref.key.replace(/\//g, '_') + '.jpg')
      writeFileSync(tmpFile, outBuf)

      // Write back to R2 at the SAME KEY. wrangler r2 object put
      // overwrites in place — the memory's photoRef.url stays valid.
      execSync(
        `npx wrangler r2 object put "${BUCKET}/${ref.key}" --file="${tmpFile}" --content-type="image/jpeg" --remote`,
        { cwd: WORKER_DIR, stdio: ['ignore', 'ignore', 'pipe'] }
      )

      const ratio = (outBuf.length / inputBuf.length).toFixed(2)
      console.log(
        `${(inputBuf.length / 1024 / 1024).toFixed(2)} MB → ${(outBuf.length / 1024 / 1024).toFixed(2)} MB  (×${ratio})`
      )
      ok++
    } catch (err) {
      console.log(`FAILED — ${err.message?.split('\n')[0] || err}`)
      failed++
      failures.push({ key: ref.key, error: err.message || String(err) })
    }
  }

  rmSync(tmp, { recursive: true, force: true })

  console.log()
  console.log(`Done. ${ok} succeeded, ${failed} failed.`)
  if (failures.length) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  ${f.key}: ${f.error}`)
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
