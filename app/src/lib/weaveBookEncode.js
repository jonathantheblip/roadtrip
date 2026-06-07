// weaveBookEncode.js — stitch a trip's KEPT weave pages into one video.
//
// WEAVE_SCOPE slice 3, part 2 (Increment 2 — the trip-video keepsake of the
// book). Reuses the per-day renderer (weaveRenderer.renderWeaveFrame) and the
// shared encode worker (encodeVideo.worker.js) — the SAME 576×720 / 30fps /
// H.264 pipeline as a single page, just concatenated: each kept day animates
// its ~5s page back-to-back, so the output is (N kept days × 5s). Each day's
// segment restarts the weave-up fade, giving a natural beat between pages.
//
// Main-thread only (token/font/image resolution needs the DOM). The actual
// Save-to-Photos is device-only (share sheet), same as the single-page video.

import { renderWeaveFrame, RENDER_W, RENDER_H, TOTAL_FRAMES, DURATION } from './weaveRenderer.js'
import { resolveTokens, preloadImages, shareWeave, isVideoEncodeSupported } from './weaveEncode.js'
import { buildBeats } from './weave.js'
import { listMemoriesForTrip } from './memoryStore.js'

// Re-export so the view imports one module.
export { shareWeave, isVideoEncodeSupported }

const BASE_TIMEOUT_MS = 30_000
const PER_SEGMENT_TIMEOUT_MS = 30_000

// One render segment per kept page: its day, beats (rebuilt from this device's
// local memories), narrative (from the stored book page), stat, and preloaded
// images. Pages whose day or memories can't be resolved are skipped.
async function buildSegments({ trip, traveler, pages }) {
  const memories = listMemoriesForTrip(trip.id, traveler)
  const segments = []
  for (const page of pages) {
    const day = (trip?.days || []).find((d) => d.isoDate === page.dayIso)
    if (!day) continue
    const beats = buildBeats(trip, day, memories)
    if (!beats.length) continue
    const images = await preloadImages(beats)
    segments.push({
      day,
      beats,
      images,
      narrative: { title: page.title, opening: page.opening, closing: page.closing },
      stat: page.stat || null,
    })
  }
  return segments
}

export async function encodeWeaveBook({ trip, traveler, pages, onProgress, signal }) {
  const tokens = resolveTokens()
  await document.fonts.ready
  const segments = await buildSegments({ trip, traveler, pages })
  if (!segments.length) throw new Error('no renderable pages in the book')

  const worker = new Worker(
    new URL('../workers/encodeVideo.worker.js', import.meta.url),
    { type: 'module' }
  )
  try {
    return await runBookEncode({ worker, segments, traveler, tokens, onProgress, signal })
  } finally {
    try { worker.terminate() } catch { /* ignore */ }
    for (const seg of segments) {
      for (const bmp of seg.images.values()) {
        try { bmp.close() } catch { /* ignore */ }
      }
    }
  }
}

async function runBookEncode({ worker, segments, traveler, tokens, onProgress, signal }) {
  const totalFrames = segments.length * TOTAL_FRAMES

  let readyResolve
  let doneResolve, doneReject
  const readyP = new Promise((r) => (readyResolve = r))
  const doneP = new Promise((res, rej) => {
    doneResolve = res
    doneReject = rej
  })

  const timeout = setTimeout(
    () => doneReject(new Error('weave book encode timed out')),
    BASE_TIMEOUT_MS + segments.length * PER_SEGMENT_TIMEOUT_MS
  )

  worker.onmessage = (e) => {
    const msg = e.data
    if (msg.type === 'ready') readyResolve()
    else if (msg.type === 'progress') onProgress?.(msg.percent)
    else if (msg.type === 'done') {
      clearTimeout(timeout)
      doneResolve(msg.blob)
    } else if (msg.type === 'error') {
      clearTimeout(timeout)
      doneReject(new Error(msg.message || 'encode error'))
    }
  }
  worker.onerror = (e) => {
    clearTimeout(timeout)
    doneReject(new Error(e?.message || 'worker error'))
  }

  worker.postMessage({
    type: 'config',
    width: RENDER_W,
    height: RENDER_H,
    frameRate: 30,
    totalFrames,
    audio: undefined,
  })

  await readyP
  if (signal?.aborted) throw new Error('aborted')

  // Render every segment's frames into one continuous stream. The timestamp
  // is the GLOBAL frame index so the muxer lays the days end-to-end.
  const renderCanvas = new OffscreenCanvas(RENDER_W, RENDER_H)
  let frameIndex = 0
  for (const seg of segments) {
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      if (signal?.aborted) throw new Error('aborted')
      const t = i === 0 ? 0 : (i / (TOTAL_FRAMES - 1)) * DURATION
      renderWeaveFrame(renderCanvas, {
        beats: seg.beats,
        narrative: seg.narrative,
        stat: seg.stat,
        day: seg.day,
        traveler,
        tokens,
        images: seg.images,
        t,
      })
      const bitmap = renderCanvas.transferToImageBitmap()
      const timestamp = Math.round(frameIndex * (1_000_000 / 30))
      worker.postMessage({ type: 'frame', bitmap, timestamp }, [bitmap])
      frameIndex++
    }
  }

  worker.postMessage({ type: 'flush' })
  return await doneP
}
