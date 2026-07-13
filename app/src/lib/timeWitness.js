// timeWitness.js — the D14 / D1-qualifier PURE witnesses (BUILD_PLAN_WITNESS_
// FLEET_2.md W8, "the time-witness pack"): reusable, mirror-safe (no I/O)
// classifiers consumed by sessionHeal.js's point-builder on BOTH sides.
// Byte-identical to worker/src/timeWitness.js (no imports on either side, so
// there is nothing for the two files to differ on) — a parity test still
// gates them against drift.
//
// Three witnesses, all read-side (never rewrite capturedAt):
//   1. atSrc TIERING (D1 qualifier) — a `file-mtime` capturedAt is suggestion-
//      grade (it's a SAVE time, not a camera read); `exif-original`/
//      `exif-create`/`exif-modify` are genuine camera-EXIF reads. Absent atSrc
//      (the pre-sidecar archive majority) is treated as UNKNOWN, not
//      suggestion-grade, for THIS classification specifically — it just abstains
//      from the camera-only checks below rather than being lumped in with a
//      confirmed file-mtime read.
//   2. IMPORT-LAG trust (D14 item 1b) — DIRECTION-ASYMMETRIC, atSrc-aware: a LONG
//      lag between capture and upload always DEMOTES trust (safe for any atSrc —
//      a huge gap is evidence of a backfill import, never proof either way of the
//      claimed capture time, but never grounds for extra trust); a SHORT lag only
//      CORROBORATES when atSrc is genuine camera-EXIF — for file-mtime or absent
//      atSrc, a short lag is evidence the timestamp IS the save/upload time
//      (constitution rule 3: it may not corroborate its own file-system-clock
//      parent — both descend from the same clock).
//   3. PASSENGER refs (item 3, non-camera demotion) — a screenshot/graphic
//      re-encoded to JPEG by the pipeline (photoPipeline.js) still carries its
//      ORIGINAL extension in srcName (`IMG_1234.PNG` survives even though the
//      stored bytes became image/jpeg). srcName's extension NOT matching a real
//      camera format, PLUS the sidecar corroborator "srcName present but meta
//      absent" (the metadata capture ran and found no EXIF at all) — together
//      are the reliable signal; either alone abstains. FORWARD-ONLY: an archive
//      screenshot that predates srcName capture is undetectable by this (stated
//      plainly, not solved here — the locate-originals scan can't match a
//      no-EXIF original).
//
// The exact millisecond thresholds below are THIS BUILD's own reasonable-default
// judgment call — the plan states the asymmetric RULE, not exact numbers. Named,
// exported constants so they're easy to retune later without touching the
// classification logic itself.

export const CAMERA_ATSRC = new Set(['exif-original', 'exif-create', 'exif-modify'])

export function isCameraAtSrc(atSrc) {
  return typeof atSrc === 'string' && CAMERA_ATSRC.has(atSrc)
}

// suggestion-grade per item 2: ONLY an explicit file-mtime read. Absent atSrc is
// UNKNOWN (not suggestion-grade) for this specific check — see the file header.
export function isSuggestionGradeAtSrc(atSrc) {
  return atSrc === 'file-mtime'
}

// Import-lag thresholds (this build's own reasonable defaults — see header).
export const LONG_LAG_MS = 30 * 24 * 3600 * 1000 // 30 days: a backfill-scale gap
export const SHORT_LAG_MS = 24 * 3600 * 1000 // 24 hours: a same-day-ish upload

// { capturedAtMs, createdAtMs, atSrc } → 'long-demote' | 'short-corroborate' |
// 'short-excluded' | 'no-signal'. Pure; never throws on bad input. A negative
// lag (uploaded "before" the claimed capture — nonsense, e.g. a test fixture or
// a clock anomaly) abstains rather than being classified either way.
export function importLagClass({ capturedAtMs, createdAtMs, atSrc } = {}) {
  if (!Number.isFinite(capturedAtMs) || !Number.isFinite(createdAtMs)) return 'no-signal'
  const lagMs = createdAtMs - capturedAtMs
  if (!Number.isFinite(lagMs) || lagMs < 0) return 'no-signal'
  if (lagMs > LONG_LAG_MS) return 'long-demote' // any atSrc — safe to always demote
  if (lagMs <= SHORT_LAG_MS) {
    // rule 3: file-mtime/absent atSrc shares the SAME file-system clock as
    // created_at — a short lag there is evidence the timestamp IS the save
    // time, not independent corroboration of a real capture time.
    return isCameraAtSrc(atSrc) ? 'short-corroborate' : 'short-excluded'
  }
  return 'no-signal' // between short and long — genuinely uninformative either way
}

// item 3 — PASSENGER (screenshot/graphic) detection. Camera-typical extensions
// an iPhone/Android camera actually produces; anything else (png/gif/bmp/webp/…)
// is suspect ONLY when the sidecar corroborator also fires (see below).
const CAMERA_EXT = new Set(['heic', 'heif', 'jpg', 'jpeg', 'mov', 'mp4'])

function srcExt(srcName) {
  const m = /\.([A-Za-z0-9]{2,5})$/.exec(typeof srcName === 'string' ? srcName : '')
  return m ? m[1].toLowerCase() : null
}

// A ref this build classifies as a PASSENGER: srcName survives with a NON-camera
// extension AND the metadata sidecar ran but found no EXIF at all (meta absent).
// Either signal alone abstains (false, never a demotion) — the plan's stricter
// fallback (sidecar-bearing requires make/model-absent too; sidecar-less
// abstains entirely) is NOT implemented here — only build it if real testing
// surfaces a misclassification problem with this primary design.
export function isPassengerRef(ref) {
  const ext = srcExt(ref?.srcName)
  if (!ext || CAMERA_EXT.has(ext)) return false
  const meta = ref?.meta
  const metaAbsent = !meta || typeof meta !== 'object' || Array.isArray(meta) || Object.keys(meta).length === 0
  return metaAbsent
}
