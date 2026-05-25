// videoPipeline.js — main-thread orchestrator for the M3 video encode.
//
// Helen picks a video → this lib loads it in a hidden HTMLVideoElement,
// walks every frame with requestVideoFrameCallback (rVFC), and ships
// each frame as an ImageBitmap to encodeVideo.worker.js. Audio comes
// out of AudioContext.decodeAudioData and is fed to the worker as
// AudioData chunks. The worker assembles the MP4 and returns a Blob.
//
// Why this split: workers can't construct an HTMLVideoElement, and
// the only iOS-compatible way to demux an arbitrary mp4/mov is to use
// a real <video>. Doing the decode on the main thread + the
// CPU-heavy encode in a worker keeps the dispatch modal's progress UI
// smooth (frames are transferred, not copied).
//
// The function is async-iterator-shaped from the consumer's
// perspective: pass an onProgress callback and await encodeVideo()
// to get the final blob. Throws Errors with .code set to a designed
// dispatchErrors code on failure.

const TARGET_LONG_EDGE = 720
const KEYFRAME_INTERVAL_SECONDS = 2
const ENCODE_TIMEOUT_MS = 120_000 // hard cap so a stuck encode doesn't strand the UI

// Detect at runtime whether WebCodecs is usable on this device. The
// composer calls this before rendering the video picker — when false,
// the picker is hidden per §3 (no "Update iOS" copy ever).
export function isVideoEncodeSupported() {
  if (typeof window === 'undefined') return false
  return (
    typeof window.VideoEncoder === 'function' &&
    typeof window.VideoFrame === 'function' &&
    typeof window.OffscreenCanvas === 'function'
  )
}

// Encode a user-picked video file into an upload-ready MP4 Blob.
//
// `file` — the picked File (or Blob)
// `onProgress(percent)` — called repeatedly as the worker reports
//   progress, plus once at percent=100 right before the blob resolves.
//
// Returns `{ blob, width, height, durationMs, posterBlob }`.
//   posterBlob is a tiny JPEG of the first frame so the queue tile has
//   something to render before the upload lands.
export async function encodeVideo(file, { onProgress, signal } = {}) {
  if (!isVideoEncodeSupported()) {
    throw withCode(
      'webcodecs-unavailable',
      'VideoEncoder unavailable on this device'
    )
  }
  if (!file) throw withCode('missing-file', 'no file')

  const url = URL.createObjectURL(file)
  let video = null
  let worker = null
  try {
    video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    video.src = url
    await new Promise((resolve, reject) => {
      const onErr = () => reject(withCode('decode-failed', 'video element error'))
      video.addEventListener('error', onErr, { once: true })
      video.addEventListener('loadedmetadata', () => resolve(), { once: true })
    })

    const inputW = video.videoWidth
    const inputH = video.videoHeight
    if (!inputW || !inputH) {
      throw withCode('decode-failed', 'video has no dimensions')
    }
    const durationMs = Math.max(1000, Math.round((video.duration || 0) * 1000))
    const frameRate = await estimateFrameRate(video).catch(() => 30)
    const totalFrames = Math.max(1, Math.round((durationMs / 1000) * frameRate))

    // First-frame poster — extract before we hand the video off to the
    // encode loop, so queued tiles never look blank.
    const posterBlob = await extractFirstFramePoster(video, inputW, inputH).catch(() => null)

    // Audio extraction — concurrent with frame walking. We use Web
    // Audio decodeAudioData against the file bytes; the resulting
    // AudioBuffer is sliced into AudioData chunks for the encoder.
    const audioPromise = decodeAudioTrack(file).catch(() => null)

    worker = new Worker(
      new URL('../workers/encodeVideo.worker.js', import.meta.url),
      { type: 'module' }
    )
    const result = await runWorkerEncode({
      worker,
      video,
      inputW,
      inputH,
      frameRate,
      totalFrames,
      audioPromise,
      onProgress,
      signal,
    })
    return {
      blob: result.blob,
      width: result.width,
      height: result.height,
      durationMs,
      posterBlob,
    }
  } finally {
    URL.revokeObjectURL(url)
    try {
      worker?.terminate()
    } catch {
      /* ignore */
    }
    try {
      if (video) {
        video.removeAttribute('src')
        video.load?.()
      }
    } catch {
      /* ignore */
    }
  }
}

async function runWorkerEncode({
  worker,
  video,
  inputW,
  inputH,
  frameRate,
  totalFrames,
  audioPromise,
  onProgress,
  signal,
}) {
  let readyResolve
  let doneResolve
  let doneReject
  const ready = new Promise((r) => (readyResolve = r))
  const done = new Promise((res, rej) => {
    doneResolve = res
    doneReject = rej
  })
  const timeoutHandle = setTimeout(() => {
    doneReject(withCode('video-encode-failed', `encode exceeded ${ENCODE_TIMEOUT_MS} ms`))
  }, ENCODE_TIMEOUT_MS)

  worker.onmessage = (e) => {
    const msg = e.data
    if (msg.type === 'ready') readyResolve()
    else if (msg.type === 'progress') onProgress?.(msg.percent)
    else if (msg.type === 'done') {
      clearTimeout(timeoutHandle)
      doneResolve({ blob: msg.blob, width: msg.width, height: msg.height })
    } else if (msg.type === 'error') {
      clearTimeout(timeoutHandle)
      doneReject(withCode(msg.code || 'video-encode-failed', msg.message))
    }
  }
  worker.onerror = (e) => {
    clearTimeout(timeoutHandle)
    doneReject(withCode('video-encode-failed', e?.message || 'worker error'))
  }

  const audio = await audioPromise // null if no audio track
  worker.postMessage({
    type: 'config',
    width: inputW,
    height: inputH,
    frameRate,
    totalFrames,
    audio: audio
      ? { numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate }
      : undefined,
  })
  await ready

  if (signal?.aborted) {
    throw withCode('video-encode-failed', 'aborted before frame walk')
  }

  // Walk every frame via requestVideoFrameCallback. Falls back to
  // currentTime stepping on browsers without rVFC (older Safari).
  await walkAllFrames(video, totalFrames, async (bitmap, timestampUs) => {
    worker.postMessage({ type: 'frame', bitmap, timestamp: timestampUs }, [bitmap])
  })

  // Ship audio chunks. We chop into ~1024-frame AudioData buffers; the
  // encoder is happy with anything reasonable.
  if (audio) {
    const chunks = sliceAudioBufferIntoAudioData(audio)
    for (const data of chunks) {
      worker.postMessage({ type: 'audio', audioData: data }, [data])
    }
  }

  worker.postMessage({ type: 'flush' })
  return await done
}

// ─── frame walker ─────────────────────────────────────────────────
//
// requestVideoFrameCallback is the only API that yields true per-frame
// timing. Safari 17.4+ and Chromium support it. When it's missing
// (older Safari), we fall back to a currentTime sweep that's coarser
// but still functional.

async function walkAllFrames(video, totalFrames, onFrame) {
  // Try rVFC path first.
  if (typeof video.requestVideoFrameCallback === 'function') {
    await video.play().catch(() => {})
    let frameCount = 0
    // iOS Safari can call rVFC with a repeated or non-monotonic
    // metadata.mediaTime for consecutive frames on certain .mov files —
    // observed with iPhone 1080p captures on iOS 18.7+ in the Simulator
    // gate (R3b). The encoder then computes a zero-or-negative chunk
    // duration from the consecutive timestamps and mp4-muxer rejects
    // with "addVideoChunkRaw's fourth argument (duration) must be a
    // non-negative real number". Clamping ts to be strictly greater
    // than the previous one (≥ 1 µs delta) keeps the encoder's duration
    // math positive without distorting timing meaningfully.
    let lastTs = -1
    await new Promise((resolve, reject) => {
      let cancelled = false
      const drain = (_now, metadata) => {
        if (cancelled) return
        const rawTs = Math.round(
          (metadata?.mediaTime ?? video.currentTime) * 1_000_000
        )
        const ts = Number.isFinite(rawTs) && rawTs > lastTs ? rawTs : lastTs + 1
        lastTs = ts
        createImageBitmap(video)
          .then((bitmap) => onFrame(bitmap, ts))
          .catch((err) => {
            cancelled = true
            reject(withCode('decode-failed', err?.message || 'createImageBitmap failed'))
          })
          .then(() => {
            frameCount++
            if (frameCount >= totalFrames) {
              video.pause()
              resolve()
            } else {
              video.requestVideoFrameCallback(drain)
            }
          })
      }
      // Once playback stalls/ends, resolve. Some browsers stop calling
      // rVFC at end of stream without firing 'ended'.
      video.addEventListener('ended', () => resolve(), { once: true })
      video.requestVideoFrameCallback(drain)
    })
    return
  }

  // Fallback: step currentTime through the duration. Lower quality
  // but works on older Safari.
  const stepSec = (video.duration || 1) / totalFrames
  for (let i = 0; i < totalFrames; i++) {
    if (i > 0) {
      await seekTo(video, i * stepSec)
    }
    const bitmap = await createImageBitmap(video)
    await onFrame(bitmap, Math.round(i * stepSec * 1_000_000))
  }
}

function seekTo(video, t) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    try {
      video.currentTime = t
    } catch (err) {
      video.removeEventListener('seeked', onSeeked)
      reject(err)
    }
  })
}

// ─── audio extraction ─────────────────────────────────────────────

async function decodeAudioTrack(file) {
  if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') {
    return null
  }
  const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext
  const ctx = new Ctor()
  try {
    const buf = await file.arrayBuffer()
    return await ctx.decodeAudioData(buf)
  } catch {
    return null
  } finally {
    try {
      ctx.close()
    } catch {
      /* ignore */
    }
  }
}

function sliceAudioBufferIntoAudioData(audioBuffer) {
  if (typeof AudioData === 'undefined') return []
  const FRAMES_PER_CHUNK = 1024
  const ch = audioBuffer.numberOfChannels
  const sr = audioBuffer.sampleRate
  const total = audioBuffer.length
  const chunks = []
  // Interleave channels — AudioData wants planar/interleaved formats;
  // we use f32-planar so each channel's Float32Array is a separate
  // plane in the output buffer.
  const planes = []
  for (let c = 0; c < ch; c++) planes.push(audioBuffer.getChannelData(c))

  for (let offset = 0; offset < total; offset += FRAMES_PER_CHUNK) {
    const len = Math.min(FRAMES_PER_CHUNK, total - offset)
    const planar = new Float32Array(ch * len)
    for (let c = 0; c < ch; c++) {
      planar.set(planes[c].subarray(offset, offset + len), c * len)
    }
    chunks.push(
      new AudioData({
        format: 'f32-planar',
        sampleRate: sr,
        numberOfChannels: ch,
        numberOfFrames: len,
        timestamp: Math.round((offset / sr) * 1_000_000),
        data: planar,
      })
    )
  }
  return chunks
}

// ─── frame rate estimation ───────────────────────────────────────

async function estimateFrameRate(video) {
  if (typeof video.requestVideoFrameCallback !== 'function') return 30
  await video.play().catch(() => {})
  return await new Promise((resolve) => {
    const samples = []
    let prev = null
    let count = 0
    const TARGET_SAMPLES = 12

    function tick(_now, metadata) {
      const t = metadata?.mediaTime
      if (typeof t === 'number') {
        if (prev != null) {
          const dt = t - prev
          if (dt > 0.001) samples.push(dt)
        }
        prev = t
      }
      count++
      if (samples.length >= TARGET_SAMPLES || count > 30) {
        video.pause()
        try {
          video.currentTime = 0
        } catch {
          /* ignore */
        }
        if (samples.length === 0) return resolve(30)
        samples.sort((a, b) => a - b)
        const median = samples[Math.floor(samples.length / 2)]
        const fps = Math.max(15, Math.min(60, Math.round(1 / median)))
        resolve(fps)
      } else {
        video.requestVideoFrameCallback(tick)
      }
    }
    video.requestVideoFrameCallback(tick)
  })
}

// ─── first-frame poster ──────────────────────────────────────────

async function extractFirstFramePoster(video, w, h) {
  try {
    await seekTo(video, 0)
  } catch {
    /* keep going */
  }
  const max = 320 // posters live as small thumbnails
  const scale = Math.min(1, max / Math.max(w, h))
  const tw = Math.round(w * scale)
  const th = Math.round(h * scale)
  const canvas =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(tw, th)
      : Object.assign(document.createElement('canvas'), { width: tw, height: th })
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, tw, th)
  if (typeof canvas.convertToBlob === 'function') {
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 })
  }
  return await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.7)
  })
}

function withCode(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}
