// weaveEncode.js — encode orchestrator for the Weave keepsake video.
//
// Main thread only (token/font resolution requires the DOM).
// Spins up encodeVideo.worker.js, drives a canvas render loop via
// weaveRenderer.js, and hands the resulting MP4 Blob to the share sheet.
//
// Output: 576×720 portrait MP4 at 30fps/150 frames (5s). The worker's
// TARGET_LONG_EDGE=720 cap is exactly satisfied by these dimensions —
// no downscaling occurs.

import { renderWeaveFrame, RENDER_W, RENDER_H, TOTAL_FRAMES, DURATION } from './weaveRenderer.js'
export { isVideoEncodeSupported } from './videoPipeline.js'

const ENCODE_TIMEOUT_MS = 90_000

// ── Token resolution (main thread only) ──────────────────────────────

function resolveTokens() {
  const s = getComputedStyle(document.body)
  const v = (name) => s.getPropertyValue(name).trim()
  return {
    bg: v('--bg'),
    text: v('--text'),
    muted: v('--muted'),
    accent: v('--accent'),
    accentText: v('--accent-text'),
    accentInk: v('--accent-ink'),
    border: v('--border'),
    lineBold: v('--line-bold'),
    bg2: v('--bg2') || v('--card'),
    card: v('--card'),
    fontBody: v('--font-body'),
    fontDisplay: v('--font-display'),
  }
}

// ── Image pre-loading ─────────────────────────────────────────────────

async function preloadImages(beats) {
  const map = new Map()
  const tasks = []
  for (const beat of beats) {
    if (beat.kind !== 'photo') continue
    const ref = beat.memory?.photoRefs?.[0] || beat.memory?.photoRef
    const url = ref?.url
    if (!url || map.has(url)) continue
    tasks.push(
      fetch(url)
        .then((r) => r.blob())
        .then((blob) => createImageBitmap(blob))
        .then((bmp) => map.set(url, bmp))
        .catch(() => { /* skip unloadable images */ })
    )
  }
  await Promise.allSettled(tasks)
  return map
}

// ── Encode orchestrator ───────────────────────────────────────────────

export async function encodeWeavePage({ beats, narrative, stat, day, traveler, onProgress, signal }) {
  // Resolve on main thread — these APIs are unavailable inside the worker.
  const tokens = resolveTokens()
  const [images] = await Promise.all([
    preloadImages(beats),
    document.fonts.ready,
  ])

  const worker = new Worker(
    new URL('../workers/encodeVideo.worker.js', import.meta.url),
    { type: 'module' }
  )

  try {
    return await runCanvasEncode({
      worker, beats, narrative, stat, day, traveler, tokens, images, onProgress, signal,
    })
  } finally {
    try { worker.terminate() } catch { /* ignore */ }
    // Release preloaded bitmaps.
    for (const bmp of images.values()) {
      try { bmp.close() } catch { /* ignore */ }
    }
  }
}

async function runCanvasEncode({ worker, beats, narrative, stat, day, traveler, tokens, images, onProgress, signal }) {
  let readyResolve
  let doneResolve, doneReject
  const readyP = new Promise((r) => (readyResolve = r))
  const doneP = new Promise((res, rej) => {
    doneResolve = res
    doneReject = rej
  })

  const timeout = setTimeout(
    () => doneReject(new Error('weave encode timed out')),
    ENCODE_TIMEOUT_MS
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

  // Config: 576×720, 30fps, 150 frames, no audio.
  worker.postMessage({
    type: 'config',
    width: RENDER_W,
    height: RENDER_H,
    frameRate: 30,
    totalFrames: TOTAL_FRAMES,
    audio: undefined,
  })

  await readyP
  if (signal?.aborted) throw new Error('aborted')

  // Render all frames on the main thread and transfer each bitmap to the worker.
  // OffscreenCanvas.transferToImageBitmap() is zero-copy (transfers ownership).
  const renderCanvas = new OffscreenCanvas(RENDER_W, RENDER_H)
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    if (signal?.aborted) throw new Error('aborted')
    const t = i === 0 ? 0 : (i / (TOTAL_FRAMES - 1)) * DURATION
    renderWeaveFrame(renderCanvas, { beats, narrative, stat, day, traveler, tokens, images, t })
    const bitmap = renderCanvas.transferToImageBitmap()
    const timestamp = Math.round(i * (1_000_000 / 30))
    worker.postMessage({ type: 'frame', bitmap, timestamp }, [bitmap])
  }

  worker.postMessage({ type: 'flush' })
  return await doneP
}

// ── Share sheet / download fallback ──────────────────────────────────

export async function shareWeave(blob, narrative) {
  const file = new File([blob], 'weave.mp4', { type: 'video/mp4' })
  const shareData = {
    files: [file],
    title: narrative?.title || 'Tonight, woven',
  }

  if (navigator.canShare?.(shareData)) {
    await navigator.share(shareData)
    return 'shared'
  }

  // Fallback: trigger a browser download.
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = 'weave.mp4'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return 'downloaded'
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
}
