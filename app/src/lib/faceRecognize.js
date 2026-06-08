// faceRecognize.js — the recognition PASS. Scans the photos a person
// could be in, finds + fingerprints every face, and stores the result in
// the on-device face index. The heavy step (detect + embed) runs once per
// photo, lazily and incrementally (only un-scanned photos), so it never
// re-does work and never has to block the UI. Everything stays on the
// device (faceModel runs locally; faceIndex is local IndexedDB).

import { detectAndEmbed, loadImageBitmap } from './faceModel.js'
import { getScannedKeys, setScannedFaces } from './faceIndex.js'

// The image to scan for an entry: a photo's own url, or a video's poster
// frame. (v1 samples the single poster frame; full video face-tracking is
// out of scope — a video with no poster is skipped.)
export function scanUrlForEntry(e) {
  if (e.isVideo) return e.posterUrl || null
  return e.url || null
}

// The entries still needing a scan (not yet indexed, and scannable).
export async function pendingScan(entries) {
  const scanned = await getScannedKeys()
  return entries.filter((e) => !scanned.has(e.key) && scanUrlForEntry(e))
}

// Run the pass over the given entries. Incremental + cached: skips
// already-scanned photos, and marks a failed photo as scanned-empty so a
// broken/unreachable image isn't retried forever. onProgress(done, total)
// drives a progress UI; signal aborts cleanly mid-run.
export async function runRecognitionPass(entries, opts = {}) {
  const todo = await pendingScan(entries)
  let done = 0
  for (const e of todo) {
    if (opts.signal?.aborted) break
    let faces = []
    try {
      const bmp = await loadImageBitmap(scanUrlForEntry(e))
      const found = await detectAndEmbed(bmp)
      bmp.close?.()
      faces = found.map((f) => ({
        embedding: f.embedding,
        box: [f.box.originX, f.box.originY, f.box.width, f.box.height],
        score: f.score,
      }))
    } catch {
      faces = [] // scanned-empty: don't retry a broken photo forever
    }
    await setScannedFaces(e.key, faces)
    done++
    opts.onProgress?.(done, todo.length)
  }
  return { scanned: done, total: todo.length }
}
