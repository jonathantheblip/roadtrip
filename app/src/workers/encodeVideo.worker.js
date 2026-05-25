// encodeVideo.worker.js — WebCodecs encode loop in a Worker.
//
// The MAIN THREAD (see app/src/lib/videoPipeline.js) extracts frames
// from the input file via HTMLVideoElement + requestVideoFrameCallback
// (the only path that works across iOS Safari ≥17.4 and Chromium),
// transfers each ImageBitmap to this worker, and the worker:
//
//   1. VideoEncoder: H.264 720p ~2 Mbps with a ~2s keyframe interval
//   2. AudioEncoder (if the host supplied AudioData):
//      AAC 128 kbps, sample rate from input
//   3. mp4-muxer: assembles the chunks into an MP4 ArrayBuffer
//
// Why the split: workers can't construct HTMLVideoElement, but they
// CAN take ImageBitmap (transferable) and AudioData (also transferable
// via WebCodecs). Doing the decode on the main thread + the
// CPU-heavy encode in a worker keeps the dispatch modal's progress
// percent + bar smooth at 60fps on a 2018 iPhone.
//
// Messages in:
//   { type: 'config', width, height, frameRate, audio?: { numberOfChannels, sampleRate }, totalFrames }
//   { type: 'frame', bitmap, timestamp }   (transferable bitmap)
//   { type: 'audio', audioData }           (transferable AudioData)
//   { type: 'flush' }
//
// Messages out:
//   { type: 'ready' }
//   { type: 'progress', percent }
//   { type: 'done', blob, width, height }
//   { type: 'error', code, message }

import { Muxer, ArrayBufferTarget } from 'mp4-muxer'

const TARGET_LONG_EDGE = 720
const VIDEO_BITRATE = 2_000_000
const AUDIO_BITRATE = 128_000
const KEYFRAME_INTERVAL_SECONDS = 2

let muxer = null
let videoEncoder = null
let audioEncoder = null
let outW = 0
let outH = 0
let totalFrames = 1
let processedFrames = 0
let keyFrameInterval = 60
let errored = false
// Per-frame duration in microseconds (1 / fps × 1e6). Set in configure()
// and stamped on every VideoFrame so the encoder's output chunks carry
// a valid duration. Without this, iOS Safari's encoder leaves chunk
// duration unset and mp4-muxer rejects with "addVideoChunkRaw's fourth
// argument (duration) must be a non-negative real number". Chromium's
// encoder auto-computes from consecutive timestamps; iOS does not.
let frameDurationUs = Math.round(1_000_000 / 30)

function postError(code, message, stack) {
  if (errored) return
  errored = true
  self.postMessage({ type: 'error', code, message, stack })
}

self.onmessage = async (e) => {
  try {
    const msg = e.data
    if (!msg || errored) return

    if (msg.type === 'config') {
      configure(msg)
      self.postMessage({ type: 'ready' })
      return
    }
    if (msg.type === 'frame') {
      await encodeFrame(msg.bitmap, msg.timestamp)
      return
    }
    if (msg.type === 'audio') {
      await encodeAudio(msg.audioData)
      return
    }
    if (msg.type === 'flush') {
      await finalize()
      return
    }
  } catch (err) {
    postError(err?.code || 'video-encode-failed', err?.message || String(err), err?.stack)
  }
}

function configure({ width, height, frameRate, audio, totalFrames: total }) {
  if (typeof VideoEncoder === 'undefined') {
    throw withCode('webcodecs-unavailable', 'VideoEncoder not available in worker')
  }
  const sized = targetSize(width, height, TARGET_LONG_EDGE)
  outW = sized.w
  outH = sized.h
  const fps = frameRate || 30
  totalFrames = Math.max(1, total || 1)
  keyFrameInterval = Math.max(1, Math.round(fps * KEYFRAME_INTERVAL_SECONDS))
  frameDurationUs = Math.max(1, Math.round(1_000_000 / fps))

  muxer = new Muxer({
    target: new ArrayBufferTarget(),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
    video: { codec: 'avc', width: outW, height: outH, frameRate: fps },
    audio: audio
      ? {
          codec: 'aac',
          numberOfChannels: audio.numberOfChannels || 2,
          sampleRate: audio.sampleRate || 48_000,
        }
      : undefined,
  })

  videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => postError('video-encode-failed', err?.message || 'video encoder error'),
  })
  videoEncoder.configure({
    codec: 'avc1.42E01F', // baseline 3.1 — broad iOS playback
    width: outW,
    height: outH,
    bitrate: VIDEO_BITRATE,
    framerate: fps,
  })

  if (audio) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (err) => postError('video-encode-failed', err?.message || 'audio encoder error'),
    })
    audioEncoder.configure({
      codec: 'mp4a.40.2',
      numberOfChannels: audio.numberOfChannels || 2,
      sampleRate: audio.sampleRate || 48_000,
      bitrate: AUDIO_BITRATE,
    })
  }
}

let scaleCanvas = null
let scaleCtx = null

async function encodeFrame(bitmap, timestamp) {
  if (!videoEncoder) throw withCode('video-encode-failed', 'frame before config')
  if (!scaleCanvas || scaleCanvas.width !== outW || scaleCanvas.height !== outH) {
    scaleCanvas = new OffscreenCanvas(outW, outH)
    scaleCtx = scaleCanvas.getContext('2d')
    if (!scaleCtx) throw withCode('video-encode-failed', '2D context unavailable')
    scaleCtx.imageSmoothingQuality = 'high'
  }
  try {
    scaleCtx.drawImage(bitmap, 0, 0, outW, outH)
    const frame = new VideoFrame(scaleCanvas, {
      timestamp,
      duration: frameDurationUs,
    })
    const keyFrame = processedFrames % keyFrameInterval === 0
    videoEncoder.encode(frame, { keyFrame })
    frame.close()
  } finally {
    bitmap.close?.()
  }
  processedFrames++
  if (processedFrames % 4 === 0 || processedFrames === totalFrames) {
    const percent = Math.min(99, Math.round((processedFrames / totalFrames) * 100))
    self.postMessage({ type: 'progress', percent })
  }
}

async function encodeAudio(audioData) {
  if (!audioEncoder) {
    audioData.close?.()
    return
  }
  audioEncoder.encode(audioData)
  audioData.close?.()
}

async function finalize() {
  if (!videoEncoder || !muxer) {
    throw withCode('video-encode-failed', 'flush before config')
  }
  await videoEncoder.flush()
  if (audioEncoder) await audioEncoder.flush()
  muxer.finalize()
  self.postMessage({ type: 'progress', percent: 100 })
  const buf = muxer.target.buffer
  const blob = new Blob([buf], { type: 'video/mp4' })
  self.postMessage(
    { type: 'done', blob, width: outW, height: outH },
    // No transferable list — the Blob handles its own ownership.
  )
}

function targetSize(srcW, srcH, maxEdge) {
  const longest = Math.max(srcW, srcH)
  let w = srcW
  let h = srcH
  if (longest > maxEdge) {
    const scale = maxEdge / longest
    w = Math.round(srcW * scale)
    h = Math.round(srcH * scale)
  }
  // H.264 wants even dimensions.
  return { w: even(w), h: even(h) }
}

function even(n) {
  return n % 2 === 0 ? n : n - 1
}

function withCode(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}
