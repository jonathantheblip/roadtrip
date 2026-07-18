// faceModel.js — on-device face DETECTION + EMBEDDING. The browser-only
// half of the recognizer; faceMatch.js is the pure-math half. Lazy-loads
// two ONNX models through ONE onnxruntime-web runtime — SCRFD (face
// detector, finds faces across scales) + MobileFaceNet (embedding) —
// ENTIRELY ON THE DEVICE. The model files are generic math downloaded like
// any web asset; they carry nothing about the family.
//
// Per photo: detect faces (SCRFD @1024, the device-confirmed sweet spot)
// → drop too-small detections → align each face to a 112×112 crop from
// the eye keypoints → embed → 512-d L2-normalized fingerprint. Deciding
// which of the 4 enrolled people a fingerprint is = faceMatch.js.
//
// Isolated behind this one module the same way the EXIF library lives
// behind exifRead.js: a future model swap touches only here.
//
// THE PRIVACY CONTRACT — revised 2026-07-14 (KEYLESS faces; Jonathan's "no
// door" call — see BUILD_PLAN_FACES_KEYLESS.md; original consent 2026-07-12).
// Stated precisely and WITHOUT overclaiming:
//   • The raw 512-d FINGERPRINTS this file computes NEVER leave the device.
//     (The PHOTOS themselves DO — they sync to R2, honestly noted below; it is
//     the fingerprints, not the photos, that are the local-only artifact.)
//   • The ENROLLMENT (each person's reference faces) NEVER leaves the device.
//   • The id→PERSON MAPPING (which family member a fingerprint belongs to) is
//     NEVER stored server-side as data — it lives only in the local `rt-faces`
//     IndexedDB store (faceIndex.js).
//   • There is NO SECRET anywhere: nothing to provision, screenshot, steal,
//     rotate, or recover. Cross-device agreement comes from a deterministic
//     tag, not a key.
//   • What DOES sync, once the family is promoted past the shipped-OFF
//     `PHOTO_FACES_MODE` knob (worker/src/index.js enforces the gate — see
//     photoFacesMode there): a per-photo tag `fc2-<hash of the shared
//     family-member id>` (faceIndex.js's faceTagOf), so every device agrees
//     "the same person is in these photos" with no key and no coordination.
// HONEST LIMIT (do not overclaim): with only four known family ids, this tag
// is a four-entry dictionary — the server we run COULD compute which id maps
// to which tag. That was ALWAYS true (it holds the photos, times, and
// photographer); the tag adds no exposure a key was ever protecting against.
// The tag's job is cross-device SAMENESS for the engine's jaccard face
// dimension, NOT secrecy from our own server. What genuinely never leaves the
// device is the list above: the fingerprints, the enrollment, the name map.
//
// MODEL (blessed): immich-app/buffalo_s detection + recognition (SCRFD +
// MobileFaceNet, InsightFace lineage). Chosen as the model for this
// private family app — its non-commercial license fits personal,
// non-commercial use, and it's proven in production face recognition.
// Runtime WASM + models are now SELF-HOSTED same-origin (slice 4b, 2026-07-17):
// the .wasm is build-copied from node_modules and the models live in
// public/models/ — nothing loads from an external CDN, which is what lets the
// strict CSP forbid all external origins (they are generic, data-free math, so
// no privacy change — the win is that no third party can serve code/weights to
// the page that decodes family photos).

import { l2normalize } from './faceMatch.js'
import { detectFacesScrfd } from './scrfd.js'

// SELF-HOSTED same-origin (Build W4 slice 4b — faces pre-promotion hygiene).
// The runtime WASM + both models are served from our OWN origin (the ONNX
// runtime .wasm is copied from node_modules into <outDir>/ort/ by vite's
// self-host-ort-wasm plugin; the models live in public/models/). NOTHING loads
// from an external CDN anymore, so the strict CSP (connect-src 'self') holds
// and no third party can serve code onto the page that decodes family photos.
// BASE_URL keeps the paths correct under GitHub Pages' repo-subpath base;
// guarded so the node unit tests (no import.meta.env) don't throw — they never
// load a model, only exercise the pure alignment math.
const BASE =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './'
// All asset URLs in one place, overridable via globalThis.__RT_FACE_CONFIG
// (test seam / alternate-host switch).
const FACE_CONFIG = {
  // onnxruntime-web WASM — runs BOTH the SCRFD detector and the embedder.
  ortWasmBase: `${BASE}ort/`,
  // SCRFD face detector (InsightFace buffalo_s, ~2.5 MB) — finds faces across
  // scales incl. small/distant ones. The default detector.
  scrfdModel: `${BASE}models/detection.onnx`,
  // ONNX face-embedding model (~13.6 MB, 112×112 → 512-d)
  embedderModel: `${BASE}models/recognition.onnx`,
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
