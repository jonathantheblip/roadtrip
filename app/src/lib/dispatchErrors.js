// Bucket label for the dev-mode upload log (uploadLog.js).
//
// Labels a logged upload-failure code as:
//   'A' — silent / auto-queued: the UI stayed quiet and the sync pill
//         carries the signal (e.g. a network drop that queued).
//   'C' — a failure that was surfaced to the user.
//
// The foolproof-video import (#2/#4) turned the importer's video failures into
// SURFACED outcomes, not silent skips: an un-encodable clip now shows the warm
// "couldn't add" confirm banner ('video-encode-failed'), and an over-3:00 clip
// shows the "trim it" boundary ('video-too-long') — both with the clip named and
// the good clips still filing. So those codes are Bucket C now (surfaced), same as
// the size caps. Genuinely-silent conditions (a network drop that auto-queued, a
// purged raw leftover) remain Bucket A.
//
// This is all that survives of the former single-photo dispatch composer's error-
// surface policy (retired in importer Stage 3). NOT used to drive UI — only to
// colour-code the dev-log entries for the instrumentation harvest.

const BUCKET_C_CODES = new Set([
  'video-too-large',
  'still-too-large',
  // Every importer video-encode failure is now SURFACED on the confirm (the DOM
  // tier can see it), so it's Bucket C, not a swallowed Bucket-A skip:
  'decode-failed', // the clip won't decode → "couldn't add" banner (#2)
  'video-encode-failed', // the encode failed → "couldn't add" banner (#2)
  'video-too-long', // over the 3:00 cap → the "trim it" boundary (#4)
])

// NOT used to drive UI — only to colour-code the dev-log entries.
export function bucketForCode(code) {
  return BUCKET_C_CODES.has(code) ? 'C' : 'A'
}
