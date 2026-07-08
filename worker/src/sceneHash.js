// sceneHash.js — WORKER MIRROR of app/src/lib/sceneHash.js. A compact perceptual
// "scene signature" for a photo: a dHash over a tiny grayscale thumbnail. It captures
// COMPOSITION / BACKGROUND, the one grouping dimension that SURVIVES our pipeline —
// the upload downscale strips EXIF (GPS + the capture-time offset are gone), but the
// PIXELS remain, so a scene signature is recoverable for the WHOLE archive straight
// from the stored image (no GPS, no agenda, no device round-trip). This is the
// dimension the engine OVERLAPS with time and GPS: two photos that share a background
// belong to one moment even when neither carries a location and nothing was planned.
//
// PURE + self-contained (own popcount, no imports) so this referee copy mirrors the
// client byte-for-byte and a parity test gates the two. ENVIRONMENT-FREE by design:
// the CALLER turns bytes → grayscale (browser OffscreenCanvas at import; a worker
// decoder for the archive backfill); THIS module only hashes the grayscale and
// compares signatures, so it is identical — and unit-testable — on both sides.
//
// dHash: over a (gridW × gridH) grayscale grid, each row compares adjacent pixels →
// (gridW-1) × gridH bits. The 9×8 default → 8×8 = 64 bits → 16 hex chars. dHash is
// robust to scale + brightness and sensitive to structure — ideal for "same place".

export const SCENE_DEFAULTS = {
  gridW: 9, // sample columns (one wider than the bit width — dHash compares neighbours)
  gridH: 8, // sample rows → (9-1)*8 = 64 bits
  sameMaxBits: 10, // ≤ this many of 64 bits differ → treat as the SAME scene
}

// Popcount of a nibble (0..15) — the dHash is packed 4 bits per hex char, so the
// Hamming distance is a per-char table lookup.
const NIBBLE_POP = (() => {
  const t = new Uint8Array(16)
  for (let i = 0; i < 16; i++) t[i] = (i & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1)
  return t
})()

// grayscale: an array-like of length ≥ gridW*gridH, row-major, values 0..255.
// → a lowercase hex string (a 64-bit dHash as 16 chars for the 9×8 default), or null
// on a too-small grid. Deterministic; no allocation beyond the output string.
export function sceneHashFromGray(gray, gridW = SCENE_DEFAULTS.gridW, gridH = SCENE_DEFAULTS.gridH) {
  if (!gray || gray.length < gridW * gridH) return null
  let hex = ''
  let nibble = 0
  let bitsInNibble = 0
  for (let y = 0; y < gridH; y++) {
    const row = y * gridW
    for (let x = 0; x < gridW - 1; x++) {
      nibble = (nibble << 1) | (gray[row + x] > gray[row + x + 1] ? 1 : 0)
      if (++bitsInNibble === 4) {
        hex += nibble.toString(16)
        nibble = 0
        bitsInNibble = 0
      }
    }
  }
  if (bitsInNibble) hex += (nibble << (4 - bitsInNibble)).toString(16) // pad a partial nibble
  return hex
}

// Hamming distance (differing bits) between two equal-length hex signatures. Returns
// Infinity when either is missing, malformed, or a different length — so an absent
// signature is never falsely "the same scene".
export function sceneDistance(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a.length) {
    return Infinity
  }
  let d = 0
  for (let i = 0; i < a.length; i++) {
    const na = parseInt(a[i], 16)
    const nb = parseInt(b[i], 16)
    // Guard BEFORE the XOR: `NaN ^ n` coerces NaN→0 in JS (yielding a bogus finite
    // distance), so a non-hex char must be caught here, not after.
    if (Number.isNaN(na) || Number.isNaN(nb)) return Infinity
    d += NIBBLE_POP[na ^ nb]
  }
  return d
}

export function sceneSimilar(a, b, maxBits = SCENE_DEFAULTS.sameMaxBits) {
  return sceneDistance(a, b) <= maxBits
}
