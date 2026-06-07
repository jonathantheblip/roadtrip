// faceModel.js — on-device face DETECTION + EMBEDDING. The browser-only
// half of the recognizer; faceMatch.js is the pure-math half. Lazy-
// loads MediaPipe (Google's face finder) + an ONNX face-embedding model
// run through onnxruntime-web, both ENTIRELY ON THE DEVICE: photos and
// the resulting fingerprints never leave the iPad (the load-bearing
// kids'-privacy promise). The model files are generic math downloaded
// like any web asset — they carry nothing about the family.
//
// Per photo: detect faces (MediaPipe BlazeFace) → align each face to a
// 112×112 crop from the eye keypoints → embed (ONNX MobileFaceNet) →
// 512-d L2-normalized fingerprint. Deciding which of the 4 enrolled
// people a fingerprint is = faceMatch.js.
//
// Isolated behind this one module the same way the EXIF library lives
// behind exifRead.js: a future model/detector swap touches only here.
//
// PROVISIONAL spike model: immich-app/buffalo_s recognition
// (MobileFaceNet, InsightFace lineage — NON-COMMERCIAL license). Fine
// for a private family app and proven in production face recognition,
// but the final production model + its license is a follow-up decision.
// Detector + runtime WASM load from CDN for the spike; production can
// self-host these for full offline use (no privacy change — they are
// generic, data-free).

import { l2normalize } from './faceMatch.js'

// All external asset URLs in one place, overridable via
// globalThis.__RT_FACE_CONFIG (test seam / self-host switch).
export const FACE_CONFIG = {
  // onnxruntime-web WASM/glue files (the embedder runtime)
  ortWasmBase: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/',
  // MediaPipe tasks-vision WASM fileset (the detector runtime)
  mpWasmBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
  // MediaPipe BlazeFace short-range detector model (~230 KB)
  detectorModel:
    'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
  // ONNX face-embedding model (~13.6 MB, 112×112 → 512-d)
  embedderModel:
    'https://huggingface.co/immich-app/buffalo_s/resolve/main/recognition/model.onnx',
  embedSize: 112,
  minDetectionConfidence: 0.5,
}

function cfg() {
  return { ...FACE_CONFIG, ...(globalThis.__RT_FACE_CONFIG || {}) }
}

// The ArcFace 112×112 alignment template — canonical positions of the
// two eyes. Aligning each detected face to these (rotate + scale +
// translate from the detected eye points) is what the embedder was
// trained to receive; a raw box-crop embeds noticeably worse.
const TEMPLATE_EYE_0 = [38.2946, 51.6963] // subject's right eye (image-left)
const TEMPLATE_EYE_1 = [73.5318, 51.5014] // subject's left eye (image-right)

let detectorPromise = null
let embedderPromise = null
let backendInfo = { embedder: 'unknown', delegate: 'unknown' }

// ─── lazy model loaders (load once, cached) ───────────────────────

async function loadDetector() {
  if (detectorPromise) return detectorPromise
  detectorPromise = (async () => {
    const vision = await import('@mediapipe/tasks-vision')
    const { FilesetResolver, FaceDetector } = vision
    const fileset = await FilesetResolver.forVisionTasks(cfg().mpWasmBase)
    // GPU delegate first (fast); fall back to CPU if the device/context
    // rejects it.
    for (const delegate of ['GPU', 'CPU']) {
      try {
        const det = await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: cfg().detectorModel, delegate },
          runningMode: 'IMAGE',
          minDetectionConfidence: cfg().minDetectionConfidence,
        })
        backendInfo.delegate = delegate
        return det
      } catch (e) {
        if (delegate === 'CPU') throw e
      }
    }
  })()
  return detectorPromise
}

async function loadEmbedder() {
  if (embedderPromise) return embedderPromise
  embedderPromise = (async () => {
    const ort = await import('onnxruntime-web/webgpu')
    ort.env.wasm.wasmPaths = cfg().ortWasmBase
    // Prefer WebGPU when the device offers it (iPadOS 26 does); if the
    // GPU session won't initialize, fall back to WASM so the spike still
    // produces a result (and reports which backend actually ran).
    const attempts = globalThis.navigator?.gpu ? [['webgpu', 'wasm'], ['wasm']] : [['wasm']]
    let lastErr
    for (const executionProviders of attempts) {
      try {
        const session = await ort.InferenceSession.create(cfg().embedderModel, {
          executionProviders,
        })
        backendInfo.embedder = executionProviders[0]
        return { ort, session }
      } catch (e) {
        lastErr = e
      }
    }
    throw lastErr
  })()
  return embedderPromise
}

// ─── face alignment + preprocessing ───────────────────────────────

// Build the 112×112 aligned face crop from a source image and a
// detection's two eye keypoints (normalized [0,1]). Uses a 2-point
// similarity transform (rotation + uniform scale + translation) that
// maps the detected eyes onto the ArcFace template positions. Falls
// back to a centered square box-crop when eyes are unavailable.
function alignFaceTo112(source, srcW, srcH, detection) {
  const size = cfg().embedSize
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement('canvas'), { width: size, height: size })
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  const kps = detection.keypoints
  if (kps && kps.length >= 2) {
    const e0 = { x: kps[0].x * srcW, y: kps[0].y * srcH }
    const e1 = { x: kps[1].x * srcW, y: kps[1].y * srcH }
    const dsx = e1.x - e0.x
    const dsy = e1.y - e0.y
    const dtx = TEMPLATE_EYE_1[0] - TEMPLATE_EYE_0[0]
    const dty = TEMPLATE_EYE_1[1] - TEMPLATE_EYE_0[1]
    const sNorm = Math.hypot(dsx, dsy) || 1
    const scale = Math.hypot(dtx, dty) / sNorm
    const ang = Math.atan2(dty, dtx) - Math.atan2(dsy, dsx)
    const cos = Math.cos(ang) * scale
    const sin = Math.sin(ang) * scale
    const tx = TEMPLATE_EYE_0[0] - (cos * e0.x - sin * e0.y)
    const ty = TEMPLATE_EYE_0[1] - (sin * e0.x + cos * e0.y)
    ctx.setTransform(cos, sin, -sin, cos, tx, ty)
    ctx.drawImage(source, 0, 0)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  } else {
    // box-crop fallback: square the bounding box with margin
    const b = detection.boundingBox
    const cx = b.originX + b.width / 2
    const cy = b.originY + b.height / 2
    const half = Math.max(b.width, b.height) * 0.7
    ctx.drawImage(source, cx - half, cy - half, half * 2, half * 2, 0, 0, size, size)
  }
  return ctx.getImageData(0, 0, size, size)
}

// RGBA pixels → Float32 NCHW [1,3,112,112], RGB, normalized to
// (x-127.5)/127.5 (the InsightFace recognition input contract).
function imageDataToTensor(imageData) {
  const size = cfg().embedSize
  const { data } = imageData
  const out = new Float32Array(3 * size * size)
  const plane = size * size
  for (let i = 0; i < plane; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    out[i] = (r - 127.5) / 127.5
    out[plane + i] = (g - 127.5) / 127.5
    out[2 * plane + i] = (b - 127.5) / 127.5
  }
  return out
}

// ─── public API ───────────────────────────────────────────────────

// Warm both models up front; returns load timing + which backend ran.
export async function initFaceEngine() {
  const t0 = now()
  await loadDetector()
  const t1 = now()
  await loadEmbedder()
  const t2 = now()
  return {
    detectorMs: Math.round(t1 - t0),
    embedderMs: Math.round(t2 - t1),
    totalMs: Math.round(t2 - t0),
    backend: { ...backendInfo, webgpu: !!globalThis.navigator?.gpu },
  }
}

// Detect every face in an image source (ImageBitmap / HTMLImageElement
// / HTMLCanvasElement). → [{ box, score, keypoints }].
export async function detectFaces(source) {
  const detector = await loadDetector()
  const res = detector.detect(source)
  return (res.detections || []).map((d) => ({
    box: d.boundingBox,
    score: d.categories?.[0]?.score ?? null,
    keypoints: d.keypoints,
  }))
}

// Embed a single already-aligned 112×112 tensor → 512-d normalized.
async function embedTensor(tensorData) {
  const { ort, session } = await loadEmbedder()
  const input = new ort.Tensor('float32', tensorData, [1, 3, cfg().embedSize, cfg().embedSize])
  const out = await session.run({ [session.inputNames[0]]: input })
  const raw = out[session.outputNames[0]].data
  return l2normalize(raw)
}

function sourceDims(source) {
  return {
    w: source.width ?? source.videoWidth ?? source.naturalWidth,
    h: source.height ?? source.videoHeight ?? source.naturalHeight,
  }
}

// Align + embed ONE already-detected face → 512-d normalized vector.
// Used by enrollment (embed a face the user picked) and by
// detectAndEmbed below.
export async function embedDetection(source, detection, dims) {
  const { w, h } = dims || sourceDims(source)
  const imageData = alignFaceTo112(source, w, h, detection)
  return embedTensor(imageDataToTensor(imageData))
}

// Detect → align → embed every face in a photo.
// → [{ box, score, keypoints, embedding, embedMs }]
export async function detectAndEmbed(source) {
  const dims = sourceDims(source)
  const detections = await detectFaces(source)
  const faces = []
  for (const det of detections) {
    const te = now()
    const embedding = await embedDetection(source, det, dims)
    faces.push({
      box: det.box,
      score: det.score,
      keypoints: det.keypoints,
      embedding,
      embedMs: Math.round(now() - te),
    })
  }
  return faces
}

// Fetch a photo URL → ImageBitmap (decoded, ready for the detector).
// Same-origin blob URLs and the CORS-enabled Worker both decode here.
export async function loadImageBitmap(url) {
  const resp = await fetch(url)
  const blob = await resp.blob()
  return createImageBitmap(blob)
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now()
}
