// The never-discard metadata sidecar (Build 1, FAMILY_TRIPS_VISION §13) —
// SERVER-SIDE bounds check. Independent of, and never imported from,
// app/src/lib/exifRead.js's client-side sanitizeMeta/sanitizeSidecar (they're
// separate deployables) — this file re-validates every field from scratch,
// because the client blob is never trusted. This project has shipped an
// UNBOUNDED parser TWICE (the OffsetTimeOriginal leak, in two separate
// parsers, before either was bounds-checked) — every field here is
// whitelisted by name, capped in length, and range-checked as finite, not
// just "present".
//
// `photoEntry` (the push whitelist) and `rowToMemory` (the pull whitelist)
// in index.js both call sanitizeSidecarServer so a garbage/oversized/hostile
// sidecar is silently trimmed down to whatever passes, rather than either
// failing the whole memory write or riding an unbounded blob into D1.

const META_STRING_MAX = 64
const META_STRING_KEYS = new Set(['make', 'model', 'lens'])
const META_DATE_KEYS = new Set(['createdAt', 'modifiedAt'])
// [min, max] inclusive, physically-plausible ranges — mirrors
// app/src/lib/exifRead.js's META_NUMBER_BOUNDS exactly (kept in sync by hand;
// a mismatch here only ever makes the worker MORE strict than the client,
// never less, so drift is safe by construction).
const META_NUMBER_BOUNDS = {
  focalMm: [0, 2000],
  iso: [0, 500000],
  fnum: [0, 100],
  expMs: [0, 3_600_000],
  flash: [0, 255],
  altM: [-1000, 9000],
  headingDeg: [0, 360],
  w: [1, 20000],
  h: [1, 20000],
  orient: [1, 8],
}
// The whitelist — cap on total key count is implicit (this fixed list is the
// only thing ever read off the input object).
const META_KEYS = [
  'make', 'model', 'lens',
  'focalMm', 'iso', 'fnum', 'expMs', 'flash',
  'altM', 'headingDeg',
  'w', 'h', 'orient',
  'createdAt', 'modifiedAt',
]

export function sanitizeMetaServer(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const out = {}
  for (const key of META_KEYS) {
    if (!(key in input)) continue
    const v = input[key]
    if (META_STRING_KEYS.has(key)) {
      if (typeof v === 'string' && v.length > 0 && v.length <= META_STRING_MAX) out[key] = v
    } else if (META_DATE_KEYS.has(key)) {
      if (typeof v === 'string' && v.length <= META_STRING_MAX && Number.isFinite(Date.parse(v))) out[key] = v
    } else if (key in META_NUMBER_BOUNDS) {
      const [lo, hi] = META_NUMBER_BOUNDS[key]
      if (Number.isFinite(v) && v >= lo && v <= hi) out[key] = v
    }
  }
  return Object.keys(out).length ? out : undefined
}

const SRC_NAME_MAX = 200
const ATSRC_VALUES = new Set(['exif-original', 'exif-create', 'exif-modify', 'file-mtime', 'test'])

// `prov` (Build 2) — mirrors app/src/lib/exifRead.js's PROV_GPS_VALUES/
// PROV_OFF_VALUES/sanitizeProv exactly (independent copy, never imported —
// separate deployable, same house rule as every other sidecar field: the
// client's own bounds-check is never trusted). Sparse; strict enum on both
// sub-keys.
// 'propagated' (Build 5, BUILD_PLAN_SIGNAL_FLEET.md) — a moment-scoped GPS
// inheritance from a REFERENCE-tier sibling in the same ledger moment. Stays
// INFERRED-tier in app/src/lib/memoryStore.js's GPS_REFERENCE_PROV (a guess,
// never itself a propagation source — the cascade-hazard guard).
// 'inferred-presence' (Build W5, BUILD_PLAN_WITNESS_FLEET_2.md) — a match
// against the ref's OWN AUTHOR's recorded presence-trail crumb
// (worker/src/presenceWitness.js). Same INFERRED-tier posture as
// 'propagated': deliberately NOT in GPS_REFERENCE_PROV/REFERENCE_GPS_PROV
// anywhere in this codebase (a guess, upgradeable by a later real EXIF/scan
// read, never itself a propagation/witness SOURCE — the same cascade-hazard
// guard).
const PROV_GPS_VALUES = new Set(['exif', 'scan', 'propagated', 'inferred-presence'])
const PROV_OFF_VALUES = new Set(['exif', 'scan', 'inferred-manual', 'inferred-place'])

export function sanitizeProvServer(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const out = {}
  if (typeof input.gps === 'string' && PROV_GPS_VALUES.has(input.gps)) out.gps = input.gps
  if (typeof input.off === 'string' && PROV_OFF_VALUES.has(input.off)) out.off = input.off
  return Object.keys(out).length ? out : undefined
}

// `faces` (Build W4 — faces, BUILD_PLAN_WITNESS_FLEET_2.md) — mirrors
// app/src/lib/exifRead.js's FACE_ID_RE/sanitizeFaces exactly (independent
// copy, never imported — separate deployable, same house rule as every
// other sidecar field: the client's own bounds-check is never trusted).
// THE load-bearing safety property: ONLY pseudonymous cluster ids of this
// EXACT shape may ever reach D1 — a raw embedding, a real person's id/name,
// or anything else is dropped, never passed through. No `g` flag on
// FACE_ID_RE — sanitizeFacesServer calls `.test()` in a loop, and a
// global-flagged regex's `.test()` is stateful across calls (the exact bug
// class weatherBackfill.js's EXCLUDE_RE hit in review, 2026-07-12); anchored
// `^…$` on a non-global regex has no such state.
const FACE_ID_RE = /^fc_[0-9]{1,3}$/
const FACES_MAX = 10

export function sanitizeFacesServer(input) {
  if (!Array.isArray(input)) return undefined
  const out = []
  const seen = new Set()
  for (const v of input) {
    if (typeof v !== 'string' || !FACE_ID_RE.test(v)) continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= FACES_MAX) break
  }
  return out.length ? out : undefined
}

// Whitelist + bound `{ meta, srcName, srcMod, atSrc, prov, faces }` off an
// arbitrary (client-supplied, or D1-stored-then-reparsed) object. Returns
// only the keys that passed; never throws on hostile input.
export function sanitizeSidecarServer(input) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  const meta = sanitizeMetaServer(input.meta)
  if (meta) out.meta = meta
  if (typeof input.srcName === 'string' && input.srcName.length > 0 && input.srcName.length <= SRC_NAME_MAX) {
    out.srcName = input.srcName
  }
  if (Number.isFinite(input.srcMod) && input.srcMod > 0) out.srcMod = input.srcMod
  if (typeof input.atSrc === 'string' && ATSRC_VALUES.has(input.atSrc)) out.atSrc = input.atSrc
  const prov = sanitizeProvServer(input.prov)
  if (prov) out.prov = prov
  const faces = sanitizeFacesServer(input.faces)
  if (faces) out.faces = faces
  return out
}
