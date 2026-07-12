// seqName.js — the filename-SEQUENCE witness (BUILD_PLAN_WITNESS_FLEET_2.md W2).
// iPhones number photos IMG_0001, IMG_0002… even when the camera clock lies — a
// same-device numbering run tells the TRUE capture ORDER independent of any
// clock. DIAGNOSTIC FIRST, NOT a clustering input: sequence adjacency is an
// ORDER witness, not a SAMENESS witness (IMG_4021/4022 can be towns apart), so
// this module never bridges or splits moments — it only reports.
//
// Grounded 2026-07-12: srcName capture is complete + round-trip-safe (client
// exifRead.js, worker photoSidecar.js) but reach today is forward-plus-
// one-EXIF-scan-away (worker/src/resourceScan.js) — a fully-stripped item
// (screenshot, most messaging-app saves) carries no srcName at all and this
// module's parser simply abstains (returns null), same as any non-IMG-style
// filename (Android/WhatsApp/a rename). Device identity is a known weak point
// (the practical key is author+meta.make+meta.model+filename-prefix, which is
// WRONG under AirDrop-import — sender's counter, importer's author); accepted,
// not solved here.
//
// Pure, worker-side, "mirror-ready" shape (no client mirror exists yet — this
// build's only consumer is offsetInference.js's report; a future client use
// would copy this file's shape verbatim, same as every other engine pair in
// this codebase).

// Anchored, whitelisted-extension, exact-match — no coercion, no truncation.
// Accepts a 3-6 digit run (the real boundary: iPhone counters are 4 digits
// today but a 3-or-6-digit variant should still parse; a 2-digit or 7-digit
// run is a near-miss/oversize REJECTION, never silently trimmed to fit).
const SEQ_RE = /^([A-Za-z_]+)(\d{3,6})\.([A-Za-z0-9]{2,5})$/
const EXT_WHITELIST = new Set(['heic', 'heif', 'jpg', 'jpeg', 'png', 'gif', 'mov', 'mp4'])

// srcName → { prefix, num } | null. `prefix` includes the trailing underscore
// (e.g. "IMG_", "IMG_E" for Apple's edited-copy variant) so IMG_1234.HEIC and
// IMG_E1234.HEIC — genuinely different counters — never compare against each
// other (the "never compare across prefixes" rule falls out of using the full
// prefix string as part of the device key, not a separate check).
export function parseSeqName(srcName) {
  if (typeof srcName !== 'string' || !srcName) return null
  const m = SEQ_RE.exec(srcName)
  if (!m) return null
  const [, prefix, digits, ext] = m
  if (!EXT_WHITELIST.has(ext.toLowerCase())) return null
  const num = parseInt(digits, 10)
  if (!Number.isFinite(num)) return null
  return { prefix, num }
}

// The practical (author, make, model, filename-prefix) device key — a string
// so it doubles as a Map key. Returns null when the ref carries no parseable
// srcName at all (nothing to group). Documented weak point, accepted:
// AirDrop-import stamps the SENDER's counter with the IMPORTER's author, so
// this key can under- or over-group across a shared-photo import.
export function deviceKeyFor(ref, author) {
  const parsed = parseSeqName(ref?.srcName)
  if (!parsed) return null
  const make = typeof ref?.meta?.make === 'string' ? ref.meta.make : ''
  const model = typeof ref?.meta?.model === 'string' ? ref.meta.model : ''
  // An EXPLICIT, visible separator — joined via Array#join, never bare string
  // concatenation — so author:'ab'+make:'c' and author:'a'+make:'bc' can never
  // collide into the same key, and the key stays grep-visible (this project
  // was bitten once already by an invisible-character bug: a literal NUL byte
  // in photoSuggest.js, 2026-07-12 — never again on purpose).
  return [author || '', make, model, parsed.prefix].join('|')
}

// A gap this wide between two sorted-by-number neighbors is treated as a
// counter WRAP (…IMG_9998, IMG_9999, IMG_0001, IMG_0002…) or an unrelated
// jump, never a real ordering signal — decided: ignore, not modular math.
const MAX_SEQ_GAP = 1000

// The order-consistency diagnostic (offsetInference.js's report, no writes):
// for each device-key group among `refs`, sort by sequence NUMBER (the
// trusted order — "even when a camera clock lies, the numbers tell the true
// order") and walk consecutive pairs. A capturedAt that goes BACKWARD while
// the sequence number goes forward is clock suspicion on that span — report
// it, change nothing.
//
// `refs`: [{ key, srcName, capturedAt, meta, author }] — capturedAt an ISO
// string, author threaded in by the caller (a per-memory field, not per-ref).
// Returns [{ deviceKey, refKeyA, refKeyB, seqA, seqB, capturedAtA, capturedAtB }].
export function findSequenceInversions(refs) {
  const groups = new Map()
  for (const ref of Array.isArray(refs) ? refs : []) {
    const parsed = parseSeqName(ref?.srcName)
    if (!parsed) continue
    const capturedAtMs = Date.parse(ref?.capturedAt)
    if (!Number.isFinite(capturedAtMs)) continue
    const deviceKey = deviceKeyFor(ref, ref?.author)
    if (!deviceKey) continue
    if (!groups.has(deviceKey)) groups.set(deviceKey, [])
    groups.get(deviceKey).push({ key: ref.key, num: parsed.num, capturedAtMs, capturedAt: ref.capturedAt })
  }
  const inversions = []
  for (const [deviceKey, items] of groups) {
    items.sort((a, b) => a.num - b.num)
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1]
      const cur = items[i]
      if (cur.num - prev.num > MAX_SEQ_GAP) continue // a wrap/unrelated jump — ignore, not modular math
      if (cur.capturedAtMs < prev.capturedAtMs) {
        inversions.push({
          deviceKey,
          refKeyA: prev.key,
          refKeyB: cur.key,
          seqA: prev.num,
          seqB: cur.num,
          capturedAtA: prev.capturedAt,
          capturedAtB: cur.capturedAt,
        })
      }
    }
  }
  return inversions
}
