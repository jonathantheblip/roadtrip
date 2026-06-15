// faceModel.js — on-device face DETECTION + EMBEDDING. The browser-only
// half of the recognizer; faceMatch.js is the pure-math half. Lazy-loads
// two ONNX models through ONE onnxruntime-web runtime — SCRFD (face
// detector, finds faces across scales) + MobileFaceNet (embedding) —
// ENTIRELY ON THE DEVICE: photos and the resulting fingerprints never
// leave the iPad (the load-bearing kids'-privacy promise). The model
// files are generic math downloaded like any web asset; they carry
// nothing about the family.
//
// Per photo: detect faces (SCRFD @1024, the device-confirmed sweet spot)
// → drop too-small detections → align each face to a 112×112 crop from
// the eye keypoints → embed → 512-d L2-normalized fingerprint. Deciding
// which of the 4 enrolled people a fingerprint is = faceMatch.js.
//
// Isolated behind this one module the same way the EXIF library lives
// behind exifRead.js: a future model swap touches only here.
//
// MODEL (blessed): immich-app/buffalo_s detection + recognition (SCRFD +
// MobileFaceNet, InsightFace lineage). Chosen as the model for this
// private family app — its non-commercial license fits personal,
// non-commercial use, and it's proven in production face recognition.
// Runtime WASM + models load from CDN/HF; could be self-hosted later for
// full offline use (no privacy change — they are generic, data-free).

import { l2normalize } from './faceMatch.js'
import { detectFacesScrfd } from './scrfd.js'

// All external asset URLs in one place, overridable via
// globalThis.__RT_FACE_CONFIG (test seam / self-host switch).
const FACE_CONFIG = {
  // onnxruntime-web WASM/glue files — runs BOTH the SCRFD detector and
  // the embedder (one runtime).
  ortWasmBase: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/',
  // SCRFD face detector (InsightFace, ~2.5 MB) — finds faces across
  // scales incl. small/distant ones. The default detector.
  scrfdModel:
    'https://huggingface.co/immich-app/buffalo_s/resolve/main/detection/model.onnx',
  // ONNX face-embedding model (~13.6 MB, 112×112 → 512-d)
  embedderModel:
    'https://huggingface.co/immich-app/buffalo_s/resolve/main/recognition/model.onnx',
  detectorInputSize: 1024, // device-confirmed sweet spot (1280 over-detects)
  detectorScoreThresh: 0.5,
  // Skip detections whose smaller side is under this many original-image
  // pixels — a guard against the tiny false "faces" SCRFD can fire on
  // busy patterns (LED boards), and faces too small to recognize anyway.
  minFaceSize: 24,
  embedSize: 112,
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

let scrfdPromise = null // SCRFD detector ORT session
let embedderPromise = null
let ortPromise = null
let backendInfo = { embedder: 'unknown', detector: 'unknown' }

// ─── lazy model loaders (load once, cached) ───────────────────────

// onnxruntime-web loaded once; runs both the SCRFD detector and the
// embedder. The extern-wasm build (vite condition) fetches its wasm from
// wasmPaths.
async function loadOrt() {
  if (ortPromise) return ortPromise
  ortPromise = (async () => {
    const ort = await import('onnxruntime-web/webgpu')
    ort.env.wasm.wasmPaths = cfg().ortWasmBase
    // Silence the benign VerifyOutputSizes warnings SCRFD emits when run
    // at an input size other than its 640 export annotation.
    ort.env.logLevel = 'error'
    return ort
  })()
  return ortPromise
}

// Create an ORT session, preferring WebGPU when the device offers it
// (iPadOS 26 does), falling back to WASM if the GPU session won't init.
async function createSession(ort, modelUrl) {
  const attempts = globalThis.navigator?.gpu ? [['webgpu', 'wasm'], ['wasm']] : [['wasm']]
  let lastErr
  for (const executionProviders of attempts) {
    try {
      const session = await ort.InferenceSession.create(modelUrl, { executionProviders })
      return { session, provider: executionProviders[0] }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

async function loadScrfdDetector() {
  if (scrfdPromise) return scrfdPromise
  scrfdPromise = (async () => {
    const ort = await loadOrt()
    const { session, provider } = await createSession(ort, cfg().scrfdModel)
    backendInfo.detector = `scrfd/${provider}`
    return { ort, session }
  })()
  return scrfdPromise
}

async function loadEmbedder() {
  if (embedderPromise) return embedderPromise
  embedderPromise = (async () => {
    const ort = await loadOrt()
    const { session, provider } = await createSession(ort, cfg().embedderModel)
    backendInfo.embedder = provider
    return { ort, session }
  })()
  return embedderPromise
}

// ─── face alignment + preprocessing ───────────────────────────────

// Build the 112×112 aligned face crop from a source image and a
// detection's two eye keypoints (normalized [0,1]). Uses a 2-point
// similarity transform (rotation + uniform scale + translation) that
// maps the detected eyes onto the ArcFace template positions. Falls
// back to a centered square box-crop when eyes are unavailable.
export function alignFaceTo112(source, srcW, srcH, detection) {
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
    // box-crop fallback: square the bounding box with margin.
    // The detection's box field is `.box` (shape {originX,originY,width,
    // height} — see scrfd.js detectFacesScrfd); an earlier `.boundingBox`
    // reference was always undefined and threw here whenever a face had no
    // eye keypoints. This path is the no-keypoints fallback only — the
    // normal aligned path above is unchanged, so matching math is untouched.
    const b = detection.box
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
  await loadScrfdDetector()
  const t1 = now()
  await loadEmbedder()
  const t2 = now()
  return {
    detectorMs: Math.round(t1 - t0),
    embedderMs: Math.round(t2 - t1),
    totalMs: Math.round(t2 - t0),
    backend: {
      ...backendInfo,
      inputSize: cfg().detectorInputSize,
      webgpu: !!globalThis.navigator?.gpu,
    },
  }
}

// Detect every face in an image source (ImageBitmap / HTMLImageElement
// / HTMLCanvasElement) via SCRFD. → [{ box, score, keypoints }], with
// too-small detections dropped (minFaceSize guard).
export async function detectFaces(source) {
  const { ort, session } = await loadScrfdDetector()
  return detectFacesScrfd(ort, session, source, {
    inputSize: cfg().detectorInputSize,
    scoreThresh: cfg().detectorScoreThresh,
    minFaceSize: cfg().minFaceSize,
  })
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
