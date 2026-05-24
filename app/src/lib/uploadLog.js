// Dev-mode upload log — ring buffer in localStorage that captures
// every silent and surfaced failure across the dispatch pipeline.
//
// Per the carryover §3, Helen never sees technical detail — but every
// failure must remain fully traceable so Jonathan (or future Code) can
// reason about what happened without re-running the bug. This module
// is the trace surface.
//
// Storage: rt_upload_log_v1, capped at MAX_ENTRIES. JSON array of
//   { ts, code, bucket, outcome, message, stack, fileMeta, attempt,
//     context }
//
// The Settings panel renders this log (Section "View upload log") when
// localStorage.rt_dev_mode === 'true'. Maintainer-only — no UI to flip
// the flag.

import { bucketForCode } from './dispatchErrors.js'

const STORAGE_KEY = 'rt_upload_log_v1'
const MAX_ENTRIES = 200

function safeRead() {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function safeWrite(entries) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Quota error is itself a Bucket A condition — never crash the
    // caller because the log can't write.
  }
}

// Append one entry to the ring buffer. Caller passes whatever it knows
// about the failure; missing fields are fine. The buffer trims to the
// most recent MAX_ENTRIES, so older entries fall off automatically.
export function logUploadEvent({
  code,
  outcome = null,
  message = null,
  stack = null,
  fileMeta = null,
  attempt = 1,
  context = null,
} = {}) {
  const entry = {
    ts: new Date().toISOString(),
    code: code || 'unknown',
    bucket: bucketForCode(code) || 'A',
    outcome,
    message: message || null,
    stack: stack || null,
    fileMeta: fileMeta || null,
    attempt,
    context: context || null,
  }
  const existing = safeRead()
  existing.push(entry)
  // Trim from the front so the latest entries are at the end (newest
  // last — matches a console.log feel and is easier to scan when copied
  // into a Slack thread).
  const trimmed =
    existing.length > MAX_ENTRIES
      ? existing.slice(existing.length - MAX_ENTRIES)
      : existing
  safeWrite(trimmed)
  return entry
}

// Read all entries. Settings.jsx renders them oldest-first; that's the
// natural reading order for a debug history.
export function readUploadLog() {
  return safeRead()
}

// Per-code histogram for the dev panel summary line.
export function uploadLogHistogram() {
  const entries = safeRead()
  const out = Object.create(null)
  for (const e of entries) {
    out[e.code] = (out[e.code] || 0) + 1
  }
  return out
}

// Wipe the log. The Settings panel exposes this so a maintainer can
// reset between debugging sessions.
export function clearUploadLog() {
  safeWrite([])
}

// Maintainer toggle — gated by localStorage.rt_dev_mode === 'true'.
// No UI sets this flag; you flip it in DevTools.
export function isDevModeEnabled() {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem('rt_dev_mode') === 'true'
  } catch {
    return false
  }
}

// Build a copy-to-clipboard payload of the entire log. Settings has a
// "Copy all" button that calls this and writes the result via the
// Clipboard API.
export function uploadLogAsText() {
  const entries = safeRead()
  if (entries.length === 0) return '(empty upload log)'
  const histogram = uploadLogHistogram()
  const histLine = Object.entries(histogram)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')
  const header = [
    `Upload log — ${entries.length} entries`,
    `Histogram: ${histLine}`,
    '─'.repeat(40),
    '',
  ].join('\n')
  const body = entries
    .map((e) => {
      const lines = [
        `${e.ts}  [${e.bucket}] ${e.code}${e.outcome ? ` → ${e.outcome}` : ''}${e.attempt > 1 ? `  attempt=${e.attempt}` : ''}`,
      ]
      if (e.message) lines.push(`  message: ${e.message}`)
      if (e.fileMeta) {
        const fm = e.fileMeta
        const meta = [
          fm.name && `name=${fm.name}`,
          fm.type && `type=${fm.type}`,
          fm.size != null && `size=${fm.size}`,
          fm.exifDate && `exif=${fm.exifDate}`,
        ]
          .filter(Boolean)
          .join('  ')
        if (meta) lines.push(`  file: ${meta}`)
      }
      if (e.context) {
        try {
          lines.push(`  context: ${JSON.stringify(e.context)}`)
        } catch {
          /* skip un-serializable */
        }
      }
      if (e.stack) lines.push(`  stack:\n${indent(e.stack, '    ')}`)
      return lines.join('\n')
    })
    .join('\n\n')
  return header + body
}

function indent(text, prefix) {
  return String(text)
    .split('\n')
    .map((l) => prefix + l)
    .join('\n')
}
