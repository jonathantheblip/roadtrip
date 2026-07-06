// encodeVideo.worker.js — WebCodecs encode loop in a Worker.
//
// The MAIN THREAD (see app/src/lib/videoPipeline.js) extracts frames
// from the input file via HTMLVideoElement + requestVideoFrameCallback
// (the only path that works across iOS Safari ≥17.4 and Chromium),
// transfers each ImageBitmap to this worker, and the worker:
//
//   1. VideoEncoder: H.264 720p ~2 Mbps with a ~2s keyframe interval
//   2. Audio, one of two modes (chosen by the host's carry ladder):
//        'packets' — the MAINLINE: pre-encoded AAC packets demuxed from the
//        source (lib/mp4Audio) go straight to mp4-muxer addAudioChunkRaw.
//        No AudioEncoder is constructed on this path — the family's iOS
//        builds have never proven one exists.
//        'pcm' — legacy fallback for non-AAC sources: AudioData chunks →
//        AudioEncoder (AAC 128 kbps). If this device has no AudioEncoder the
//        track is dropped and REPORTED (audioIncluded:false), never silent.
//   3. mp4-muxer: assembles the chunks into an MP4 ArrayBuffer
//
// Why the split: workers can't construct HTMLVideoElement, but they
// CAN take ImageBitmap (transferable) and AudioData (also transferable
// via WebCodecs). Doing the decode on the main thread + the
// CPU-heavy encode in a worker keeps the dispatch modal's progress
// percent + bar smooth at 60fps on a 2018 iPhone.
//
// TIMING (the alignment contract's worker half): video chunks carry the
// host's rVFC mediaTime; raw AAC packets carry the source's stts media time
// (first packet at 0). firstTimestampBehavior:'offset' rebases each track so
// its first sample lands at 0 — both tracks therefore share the source
// timeline zeroed at their own head, which holds for the untrimmed ≤3:00
// camera clips this pipeline accepts.
//
// Messages in:
//   { type: 'config', width, height, frameRate, totalFrames,
//     audio?: { mode: 'packets', codec, numberOfChannels, sampleRate, description }
//           | { mode: 'pcm', numberOfChannels, sampleRate } }
//   { type: 'frame', bitmap, timestamp }        (transferable bitmap)
//   { type: 'audioPackets', packets: [{ data, timestampMicros, durationMicros }] }
//   { type: 'audio', audioData }                (transferable AudioData, pcm mode)
//   { type: 'flush' }
//
// Messages out:
//   { type: 'ready' }
//   { type: 'progress', percent }
//   { type: 'done', blob, width, height, audioIncluded, audioDropReason }
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
// Audio bookkeeping for the honest 'done' report: which mode the host chose,
// whether any audio actually landed in the muxer, and why it didn't.
let audioMode = null // 'packets' | 'pcm' | null
let audioRawAdded = 0
let audioPcmAdded = 0
let audioDropReason = null
// The AAC decoderConfig (with the demuxed AudioSpecificConfig as description)
// rides the FIRST addAudioChunkRaw so the esds carries the source's true
// config instead of mp4-muxer's guessed one.
let pendingAudioMeta = null
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
    if (msg.type === 'audioPackets') {
      addRawAudioPackets(msg.packets)
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

  audioMode = audio?.mode || null
  // The PCM rung NEEDS an AudioEncoder; the packet rung never does. A pcm
  // request on a device without one drops the track HONESTLY — the encode
  // proceeds video-only and 'done' reports audioIncluded:false, which the
  // host surfaces as the clip's sound outcome (never a crashed import, never
  // a silent file that claims success).
  const pcmUnavailable = audioMode === 'pcm' && typeof AudioEncoder !== 'function'
  if (pcmUnavailable) {
    audioMode = null
    audioDropReason = 'no-audio-encoder'
  }
  const wantAudioTrack = audioMode === 'packets' || audioMode === 'pcm'

  muxer = new Muxer({
    target: new ArrayBufferTarget(),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
    video: { codec: 'avc', width: outW, height: outH, frameRate: fps },
    audio: wantAudioTrack
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

  if (audioMode === 'packets') {
    // Packet copy: no AudioEncoder. Stash the true decoderConfig (the
    // demuxed AudioSpecificConfig) for the first raw chunk.
    pendingAudioMeta = {
      decoderConfig: {
        codec: audio.codec || 'mp4a.40.2',
        numberOfChannels: audio.numberOfChannels || 2,
        sampleRate: audio.sampleRate || 48_000,
        description: audio.description,
      },
    }
  } else if (audioMode === 'pcm') {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta)
        audioPcmAdded += 1
      },
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

// Packet copy — feed pre-encoded AAC packets straight to the muxer. Every AAC
// frame is a sync sample ('key'). Timestamps/durations are the source's own
// (µs), pre-validated by the host (videoPipeline.validateAacPackets), so a
// throw here means the muxer itself broke — it propagates to postError and
// the clip fails LOUDLY (the couldn't-add path), never as a silent half-file.
function addRawAudioPackets(packets) {
  if (!muxer) throw withCode('video-encode-failed', 'audio packets before config')
  if (audioMode !== 'packets') throw withCode('video-encode-failed', 'audio packets in non-packet mode')
  for (const p of packets || []) {
    const data = p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data)
    muxer.addAudioChunkRaw(data, 'key', p.timestampMicros, p.durationMicros, pendingAudioMeta || undefined)
    pendingAudioMeta = null // decoderConfig only needs to ride the first chunk
    audioRawAdded += 1
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
  // audioIncluded states what's actually IN the file: chunks landed in the
  // muxer, on either rung. "The encoder was constructed" is not enough — a
  // pcm run fed zero AudioData (e.g. a host without the AudioData ctor)
  // would leave a declared-but-empty track. The host downgrades a
  // promised-but-absent track to the honest 'lost' outcome.
  const audioIncluded =
    audioMode === 'packets' ? audioRawAdded > 0 : audioMode === 'pcm' ? audioPcmAdded > 0 : false
  self.postMessage(
    { type: 'done', blob, width: outW, height: outH, audioIncluded, audioDropReason },
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
