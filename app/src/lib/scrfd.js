// SCRFD face detector (InsightFace) run via onnxruntime-web. Replaces
// MediaPipe's short-range detector, which missed small/distant faces —
// the on-device spike found volleyball-court faces undetected (every
// wide shot scored "0 faces"). SCRFD run at a higher input resolution
// finds faces across scales, and returns 5 landmarks (eyes/nose/mouth),
// so one ORT runtime now does both detect and embed.
//
// The decode was verified node-side against a real photo before
// shipping: 3 strides (8/16/32) × 2 anchors, model outputs ordered
// scores → boxes → keypoints; box = distance2bbox from each anchor
// center, then NMS, then map back from the letterboxed input to
// original-image pixels. Everything runs on-device.

const SCRFD_STRIDES = [8, 16, 32]
const NUM_ANCHORS = 2

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

// Letterbox the source into an SxS tensor: scale to fit keeping aspect
// (top-left anchored, black pad), normalize to (x-127.5)/128 RGB NCHW.
// Returns { data, detScale } where detScale maps input px → original px.
function preprocess(source, srcW, srcH, S) {
  const detScale = S / Math.max(srcW, srcH)
  const dw = Math.round(srcW * detScale)
  const dh = Math.round(srcH * detScale)
  const canvas = makeCanvas(S, S)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, S, S) // transparent→black after removeAlpha below
  ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, dw, dh)
  const { data } = ctx.getImageData(0, 0, S, S) // RGBA
  const plane = S * S
  const out = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    out[i] = (data[i * 4] - 127.5) / 128
    out[plane + i] = (data[i * 4 + 1] - 127.5) / 128
    out[2 * plane + i] = (data[i * 4 + 2] - 127.5) / 128
  }
  return { data: out, detScale }
}

function iou(a, b) {
  const x1 = Math.max(a[0], b[0])
  const y1 = Math.max(a[1], b[1])
  const x2 = Math.min(a[2], b[2])
  const y2 = Math.min(a[3], b[3])
  const w = Math.max(0, x2 - x1)
  const h = Math.max(0, y2 - y1)
  const inter = w * h
  const areaA = (a[2] - a[0]) * (a[3] - a[1])
  const areaB = (b[2] - b[0]) * (b[3] - b[1])
  return inter / (areaA + areaB - inter + 1e-9)
}

function nms(dets, iouThresh) {
  dets.sort((p, q) => q.score - p.score)
  const keep = []
  for (const d of dets) {
    if (keep.every((k) => iou(k.box, d.box) < iouThresh)) keep.push(d)
  }
  return keep
}

// Decode SCRFD's 9 outputs into face detections in original-image px.
function decode(out, names, S, detScale, scoreThresh) {
  const dets = []
  SCRFD_STRIDES.forEach((stride, si) => {
    const scores = out[names[si]].data
    const bboxes = out[names[3 + si]].data
    const kpss = out[names[6 + si]].data
    const gw = Math.ceil(S / stride)
    const gh = Math.ceil(S / stride)
    let idx = 0
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        for (let a = 0; a < NUM_ANCHORS; a++, idx++) {
          const score = scores[idx]
          if (score < scoreThresh) continue
          const cx = x * stride
          const cy = y * stride
          const l = bboxes[idx * 4] * stride
          const t = bboxes[idx * 4 + 1] * stride
          const r = bboxes[idx * 4 + 2] * stride
          const b = bboxes[idx * 4 + 3] * stride
          const box = [
            (cx - l) / detScale,
            (cy - t) / detScale,
            (cx + r) / detScale,
            (cy + b) / detScale,
          ]
          const kps = []
          for (let k = 0; k < 5; k++) {
            kps.push([
              (cx + kpss[idx * 10 + k * 2] * stride) / detScale,
              (cy + kpss[idx * 10 + k * 2 + 1] * stride) / detScale,
            ])
          }
          dets.push({ score, box, kps })
        }
      }
    }
  })
  return nms(dets, 0.4)
}

// Detect every face in an image source. Returns the engine's detection
// shape — { box:{originX,originY,width,height}, score, keypoints:[{x,y}] }
// with keypoints NORMALIZED to [0,1] so they feed the same eye-alignment
// the MediaPipe path used (kps[0],[1] are the two eyes).
export async function detectFacesScrfd(ort, session, source, opts = {}) {
  const S = opts.inputSize || 1024
  const scoreThresh = opts.scoreThresh ?? 0.5
  const srcW = source.width ?? source.naturalWidth ?? source.videoWidth
  const srcH = source.height ?? source.naturalHeight ?? source.videoHeight
  const { data, detScale } = preprocess(source, srcW, srcH, S)
  const out = await session.run({
    [session.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, S, S]),
  })
  const dets = decode(out, session.outputNames, S, detScale, scoreThresh)
  return dets.map((d) => ({
    box: {
      originX: d.box[0],
      originY: d.box[1],
      width: d.box[2] - d.box[0],
      height: d.box[3] - d.box[1],
    },
    score: d.score,
    keypoints: d.kps.map(([x, y]) => ({ x: x / srcW, y: y / srcH })),
  }))
}
