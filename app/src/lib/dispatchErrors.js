// Designed error states for the dispatch (Add photo / video) flow.
//
// Every failure mode the user can encounter has copy here. The modal
// reads via copyForError(code); falling back to a generic line that
// is STILL safe to show — never a raw error.toString() in the UI.

const COPY = {
  // file picker
  'missing-file': {
    title: 'No file picked',
    body: 'Tap the picker and choose a photo or video to share.',
    action: { kind: 'retry', label: 'Try again' },
  },
  'is-video': {
    title: 'Looks like a video',
    body: 'This dispatch is for photos. Switch to the video composer to share it.',
    action: { kind: 'cancel', label: 'OK' },
  },
  'not-image': {
    title: "That doesn't look like a photo",
    body: 'Pick a JPEG, PNG, HEIC, or WebP image from your library.',
    action: { kind: 'retry', label: 'Pick again' },
  },
  'unsupported-image': {
    title: 'Unsupported image format',
    body: 'Pick a JPEG, PNG, HEIC, or WebP. If this is a RAW or DNG file, export a JPEG copy from Photos first.',
    action: { kind: 'retry', label: 'Pick again' },
  },
  'too-large-input': {
    title: 'File is too large',
    body: 'Pick a smaller photo, or export a lower-resolution copy from Photos.',
    action: { kind: 'retry', label: 'Pick again' },
  },
  // decode / encode
  'decode-failed': {
    title: "Couldn't read the image",
    body: 'The file looks corrupted or partial. Try a different photo.',
    action: { kind: 'retry', label: 'Pick another' },
  },
  'heic-decode-failed': {
    title: 'HEIC not readable on this browser',
    body: 'iPhone HEIC works on iOS 17 and up. Export a JPEG copy from Photos and try again.',
    action: { kind: 'retry', label: 'Pick again' },
  },
  'canvas-encode-failed': {
    title: "Couldn't compress the photo",
    body: 'Try again. If it keeps failing, free up some storage on this phone and reopen the app.',
    action: { kind: 'retry', label: 'Try again' },
  },
  'still-too-large': {
    title: 'Photo is still too big after compression',
    body: "It must be very high-resolution. Pick a different photo, or export a smaller copy from Photos.",
    action: { kind: 'retry', label: 'Pick another' },
  },
  // storage
  'storage-quota': {
    title: 'Out of storage on this phone',
    body: "Free up space in Photos or apps, then tap retry. Until then, the dispatch will keep trying when storage opens up.",
    action: { kind: 'retry', label: 'Retry' },
  },
  // upload network
  'network': {
    title: 'No internet right now',
    body: "Saved locally — the dispatch will upload when you're back online. You can keep using the app.",
    action: { kind: 'dismiss', label: 'OK' },
  },
  'worker-5xx': {
    title: 'Server hiccup',
    body: "We saved the dispatch locally and will retry automatically. Nothing to do.",
    action: { kind: 'dismiss', label: 'OK' },
  },
  'worker-auth': {
    title: 'Family token rejected',
    body: 'This phone is signed in as someone the worker doesn\'t recognize. Tell Jonathan.',
    action: { kind: 'cancel', label: 'Close' },
  },
}

const FALLBACK = {
  title: 'Something went wrong',
  body: "Saved locally — it'll try again when conditions improve.",
  action: { kind: 'retry', label: 'Try again' },
}

export function copyForError(code) {
  if (!code) return FALLBACK
  if (Object.prototype.hasOwnProperty.call(COPY, code)) return COPY[code]
  return FALLBACK
}

// Classify a thrown error from the upload path into one of our codes.
// `err.code` (set by photoPipeline + uploadQueue) wins; otherwise
// match on message text. Returns a code that copyForError() understands.
export function classifyUploadError(err) {
  if (err?.code && Object.prototype.hasOwnProperty.call(COPY, err.code)) {
    return err.code
  }
  const msg = String(err?.message || err || '').toLowerCase()
  if (/quota|exceeded the quota|notenoughspace/.test(msg)) return 'storage-quota'
  if (/networkerror|failed to fetch|load failed|fetch failed/.test(msg)) return 'network'
  if (/worker 4\d\d/.test(msg)) {
    if (/401|403/.test(msg)) return 'worker-auth'
    return 'worker-5xx' // 4xx other than auth → treat as transient server issue
  }
  if (/worker 5\d\d/.test(msg)) return 'worker-5xx'
  return null
}

export const ALL_CODES = Object.keys(COPY)
