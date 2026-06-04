// Bucket label for the dev-mode upload log (uploadLog.js).
//
// Labels a logged upload-failure code as:
//   'A' — silent / auto-queued: the UI stayed quiet and the sync pill
//         carries the signal (e.g. a network drop that queued, or the
//         importer's silent skip of an unencodable video —
//         'video-encode-failed').
//   'C' — a failure that was surfaced to the user (a hard size cap).
//
// This is all that survives of the former single-photo dispatch
// composer's error-surface policy. The composer — and its three plain-
// language error panels, the banned-vocabulary guard, and the upload-
// error classifier — was retired in importer Stage 3 (the One True
// Importer is now the sole upload surface). The dev upload log still
// records silent skips, so the A/C label is still earned.

const BUCKET_C_CODES = new Set(['video-too-large', 'still-too-large'])

// NOT used to drive UI — only to colour-code the dev-log entries.
export function bucketForCode(code) {
  return BUCKET_C_CODES.has(code) ? 'C' : 'A'
}
