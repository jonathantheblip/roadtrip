// Designed error policy for the dispatch (Add photo / video) flow.
//
// Per the carryover §3 (2026-05-24), the user-facing surface for upload
// failures collapses to two buckets:
//
//   Bucket A — silent and automatic. The composer jumps to 'done', the
//   sync pill in the album header carries the signal, and the queue
//   drains on next foreground / online event / successful retry. No
//   toast, no language, no technical vocabulary.
//
//   Bucket C — genuine user-action-required. Exactly three plain-
//   language strings ever appear in failure UI. They map to:
//     - video-too-long   (post-encode size cap exceeded)
//     - photo-too-large  (post-compression size cap exceeded)
//     - photo-unreadable (decode failed after one silent retry)
//
// The internal classify codes survive for traceability (dev-mode upload
// log, queue lastErrorCode field), but they no longer drive copy.
// Helen's vocabulary is photo / video / share / trim / screenshot —
// nothing else.

// All internal classify codes the pipeline can produce. Preserved for
// dev-mode logging and queue metadata. The bucket each code belongs to
// is what determines whether and how it surfaces.
export const ALL_CODES = [
  'missing-file',
  'is-video',
  'not-image',
  'unsupported-image',
  'too-large-input',
  'decode-failed',
  'heic-decode-failed',
  'canvas-encode-failed',
  'still-too-large',
  'storage-quota',
  'network',
  'worker-5xx',
  'worker-auth',
  // Video-path codes added in M3 — listed here so the bucket map and
  // the dev log both know about them from day one.
  'video-encode-failed',
  'video-too-large',
  'webcodecs-unavailable',
]

// Codes that NEVER surface to the user. The composer pivots to 'done'
// on these and lets the sync pill carry the signal. The dev-mode upload
// log captures them in full.
//
// 'canvas-encode-failed' and 'heic-decode-failed' are silent on the
// FIRST attempt. If they recur after a single in-modal retry, the
// caller upgrades them to 'photo-unreadable' (Bucket C) before this
// map is consulted — so they stay listed here as silent by default.
const BUCKET_A = new Set([
  'network',
  'worker-5xx',
  'worker-auth',
  'storage-quota',
  'missing-file',
  'canvas-encode-failed',
  'heic-decode-failed',
  // The iOS photo picker only surfaces images/videos. These cases are
  // unreachable from a normal pick but still possible from a Files
  // picker or a share-sheet drop, so we keep them silent rather than
  // crashing the modal.
  'is-video',
  'not-image',
  'unsupported-image',
  'too-large-input',
  'decode-failed',
  // M3 silent cases:
  'webcodecs-unavailable', // hide affordance, don't error
  'video-encode-failed',   // single silent retry handled by caller; if
                            // it recurs the caller upgrades to a Bucket C
                            // outcome
])

// The three Bucket C outcomes. These are NOT internal codes — they're
// the named outcomes the UI can render. The mapping from internal code
// → outcome is what the modal calls to decide whether to render a
// plain-language panel.
export const BUCKET_C_OUTCOMES = {
  'video-too-long': {
    title: 'This video is too long to share.',
    body: 'Trim it in Photos first, then share the shorter version.',
  },
  'photo-too-large': {
    title: 'This photo is too large.',
    body: 'Try sharing a screenshot of it instead.',
  },
  'photo-unreadable': {
    title: "This photo can't be read right now.",
    body: 'Try sharing it again, or share a different photo.',
  },
}

// Map an internal classify code + the context that produced it to a
// Bucket C outcome key, or null for silent (Bucket A). Context lets the
// classify caller signal "this is the second attempt at a decode and it
// still failed" — only at that point does the silent code upgrade to a
// user-visible outcome.
//
// Returns:
//   - one of 'video-too-long' / 'photo-too-large' / 'photo-unreadable'
//   - or null (meaning: silent, queue + pill carries the signal)
export function userFacingErrorForOutcome({ code, context = {} } = {}) {
  if (!code) return null

  // Direct Bucket C codes from the video and photo size paths.
  if (code === 'video-too-large') return 'video-too-long'
  if (code === 'still-too-large') return 'photo-too-large'

  // Decode failures upgrade to a Bucket C outcome only on the SECOND
  // attempt — the caller passes { attempt: 2 } after a single silent
  // retry has already failed.
  if (
    (code === 'decode-failed' ||
      code === 'heic-decode-failed' ||
      code === 'canvas-encode-failed') &&
    context.attempt >= 2
  ) {
    return 'photo-unreadable'
  }

  // Everything else is Bucket A.
  return null
}

// Look up the copy for a Bucket C outcome. Throws if asked for an
// unknown outcome — that would be a wiring bug worth catching loudly.
export function copyForOutcome(outcome) {
  const copy = BUCKET_C_OUTCOMES[outcome]
  if (!copy) {
    throw new Error(
      `copyForOutcome: unknown outcome '${outcome}'. ` +
        `Valid: ${Object.keys(BUCKET_C_OUTCOMES).join(', ')}.`
    )
  }
  return copy
}

// Bucket lookup for the dev-mode upload log so the log can colour-code
// silent vs. surfaced entries. NOT used to drive UI.
export function bucketForCode(code) {
  if (BUCKET_A.has(code)) return 'A'
  if (
    code === 'video-too-large' ||
    code === 'still-too-large'
  ) {
    return 'C'
  }
  return 'A'
}

// Classify a thrown error from the upload path into one of our codes.
// `err.code` (set by photoPipeline + uploadQueue) wins; otherwise match
// on message text. Returns a code that bucketForCode() and
// userFacingErrorForOutcome() understand, or null if nothing matched.
export function classifyUploadError(err) {
  if (err?.code && ALL_CODES.includes(err.code)) {
    return err.code
  }
  const msg = String(err?.message || err || '').toLowerCase()
  if (/quota|exceeded the quota|notenoughspace/.test(msg)) return 'storage-quota'
  if (/networkerror|failed to fetch|load failed|fetch failed/.test(msg)) return 'network'
  if (/worker 4\d\d/.test(msg)) {
    if (/401|403/.test(msg)) return 'worker-auth'
    return 'worker-5xx' // 4xx other than auth → treat as transient
  }
  if (/worker 5\d\d/.test(msg)) return 'worker-5xx'
  return null
}

// ─── Vocabulary guard ───────────────────────────────────────────────
//
// Tests use this to assert that no Bucket C copy contains a banned
// technical term. Kept here (not in the test file) so future copy
// changes that introduce a banned word fail loudly in CI.

export const BANNED_VOCABULARY = [
  'HEIC',
  'EXIF',
  'codec',
  'queue',
  'IndexedDB',
  'MB',
  'KB',
  'bytes',
  'compression',
  'encoding',
  'ffmpeg',
  'WebCodecs',
  'mp4-muxer',
  'blob',
  'R2',
  'Worker',
  'token',
  'auth',
  'sync',
  'drain',
  'retry-loop',
  'attempts',
]

export function containsBannedVocabulary(text) {
  if (!text) return null
  const lc = String(text).toLowerCase()
  for (const word of BANNED_VOCABULARY) {
    // Word-boundary check on lowercase form to avoid substring false
    // positives (e.g. 'mb' inside 'remember' should not flag).
    const pattern = new RegExp(`\\b${word.toLowerCase()}\\b`)
    if (pattern.test(lc)) return word
  }
  return null
}
