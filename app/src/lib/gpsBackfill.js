// Archive GPS backfill (Stage C-b) — recover location for the SUBSET of already-
// uploaded photos whose R2 asset still carries EXIF.
//
// THE HONEST SCOPE (verified, 2026-07-06): the upload pipeline shrinks every
// photo through a canvas re-encode, which STRIPS EXIF — so the R2 copy of a
// normally-imported photo has no GPS to recover. The only archive photos that
// still carry EXIF are the ones that slipped past the shrink (an undecodable /
// odd-format file uploaded raw). This pass finds THOSE: it re-reads each
// GPS-less R2 photo's own bytes and, where a location survives, writes it onto
// the ref so the photo becomes healable. It reports what it actually finds —
// a handful, not the whole archive.
//
// Cheap: it stream-reads only the first slice of each asset (EXIF lives in the
// JPEG's opening APP1 marker) and cancels the download early, so it never pulls
// a whole image just to learn it has no coords. Idempotent + resumable: every
// ref it examines is remembered, so a re-run (or a resumed run after an abort)
// skips what it already checked. Keyless (GET /assets is public), no deps
// beyond the EXIF reader the importer already uses.

import { exifReaderToRaw } from './exifRead.js'

const CHECKED_KEY = 'rt_gps_backfill_checked_v1'
// EXIF (with GPS) sits in the JPEG's opening APP1 segment; 256 KB is a generous
// margin that still cancels the download well before a full-size original's tail.
const DEFAULT_HEAD_BYTES = 256 * 1024

// A ref is a candidate when it is R2-backed (a real, fetchable key + url) and
// carries no coords yet. Pending/idb refs (not yet uploaded) and refs that
// already have GPS (the C-a forward path, or a prior recovery) are skipped.
function refIsCandidate(r) {
  return (
    !!r &&
    typeof r === 'object' &&
    r.storage === 'r2' &&
    typeof r.key === 'string' && r.key &&
    typeof r.url === 'string' && r.url &&
    !(Number.isFinite(r.lat) && Number.isFinite(r.lng))
  )
}

// Pure: the flat candidate list across a memory set. One entry per fetchable,
// coordless ref (photoRef + photoRefs[]), de-duped by key.
export function collectCandidateRefs(memories) {
  const out = []
  const seen = new Set()
  for (const m of memories || []) {
    if (!m || m.masked || m.deletedAt) continue
    const refs = []
    if (m.photoRef) refs.push(m.photoRef)
    if (Array.isArray(m.photoRefs)) refs.push(...m.photoRefs)
    for (const r of refs) {
      if (!refIsCandidate(r) || seen.has(r.key)) continue
      seen.add(r.key)
      out.push({ memoryId: m.id, tripId: m.tripId || null, refKey: r.key, url: r.url })
    }
  }
  return out
}

// Stream the first `maxBytes` of a URL, then cancel — so a full-size original
// never downloads past its EXIF. Falls back to a bounded arrayBuffer slice when
// the response has no readable stream (older runtimes / mocked fetches).
async function fetchHeadBytes(url, maxBytes, fetchImpl) {
  const res = await fetchImpl(url)
  if (!res || !res.ok) {
    // Carry the status so the caller can tell a PERMANENT client error (the
    // asset is gone / forbidden — never mark it "to retry") from a TRANSIENT
    // one (5xx / offline — retry next run).
    throw Object.assign(new Error(`asset fetch ${res ? res.status : 'failed'}`), {
      status: res ? res.status : 0,
    })
  }
  if (!res.body || typeof res.body.getReader !== 'function') {
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf).subarray(0, maxBytes)
  }
  const reader = res.body.getReader()
  const chunks = []
  let received = 0
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
    }
  } finally {
    try { await reader.cancel() } catch { /* already closed */ }
  }
  const out = new Uint8Array(Math.min(received, maxBytes))
  let off = 0
  for (const c of chunks) {
    if (off >= out.length) break
    const take = Math.min(c.length, out.length - off)
    out.set(c.subarray(0, take), off)
    off += take
  }
  return out
}

// Extract {lat,lng} from raw JPEG head bytes via the EXIF reader, or null. A
// truncated/parse error (or a shrunk photo with no EXIF) is a clean "no coords".
async function extractGps(bytes, loadTags) {
  try {
    // ExifReader wants an ArrayBuffer/Buffer, not a Uint8Array VIEW (a subarray
    // shares its parent's buffer). `.slice()` gives a fresh, tight Uint8Array
    // whose `.buffer` is exactly the head bytes — the input ExifReader accepts.
    const tags = await loadTags(bytes.slice().buffer)
    const raw = exifReaderToRaw(tags)
    if (Number.isFinite(raw.GPSLatitude) && Number.isFinite(raw.GPSLongitude)) {
      return { lat: raw.GPSLatitude, lng: raw.GPSLongitude }
    }
  } catch { /* truncated head or no EXIF — treat as no coords */ }
  return null
}

// localStorage-backed "already examined" set (resumability). Injected in tests.
function loadChecked(storage) {
  try {
    const a = JSON.parse(storage.getItem(CHECKED_KEY) || '[]')
    return new Set(Array.isArray(a) ? a : [])
  } catch {
    return new Set()
  }
}
function persistChecked(storage, set) {
  try {
    storage.setItem(CHECKED_KEY, JSON.stringify([...set]))
  } catch { /* quota / private mode — resume just re-checks, never wrong */ }
}

// Run the pass. All I/O is injected so the engine is unit-testable:
//   memories   — the local memory set to scan
//   fetchImpl  — fetch(url) → Response
//   loadTags   — bytes → ExifReader tags (loadExifTags in production)
//   apply      — (memoryId, refKey, {lat,lng}) → void, writes the coords + queues a push
//   storage    — localStorage-like (the resumable checked-set)
//   onProgress — ({ done, total, found }) → void
//   signal     — optional AbortSignal to stop between refs
// Returns { total, checked, found, perTrip: { [tripId]: foundCount } }.
export async function runGpsBackfill({
  memories,
  fetchImpl,
  loadTags,
  apply,
  storage,
  onProgress,
  signal,
  headBytes = DEFAULT_HEAD_BYTES,
} = {}) {
  const checked = loadChecked(storage)
  const all = collectCandidateRefs(memories)
  const pending = all.filter((c) => !checked.has(c.refKey))
  const total = pending.length
  let done = 0
  let found = 0
  const perTrip = {}

  for (const c of pending) {
    if (signal?.aborted) break
    onProgress?.({ done, total, found })
    try {
      const bytes = await fetchHeadBytes(c.url, headBytes, fetchImpl)
      const gps = await extractGps(bytes, loadTags)
      if (gps) {
        apply(c.memoryId, c.refKey, gps)
        found += 1
        perTrip[c.tripId || '_'] = (perTrip[c.tripId || '_'] || 0) + 1
      }
      // Examined (found or honestly empty) → remember so a resume skips it.
      checked.add(c.refKey)
      persistChecked(storage, checked)
    } catch (err) {
      // A PERMANENT client error (4xx — the asset is deleted/forbidden, e.g. a
      // 404 for an R2 object that's gone) is marked checked: re-fetching it
      // every run would never progress. A TRANSIENT failure (5xx / offline /
      // no status) is left unchecked so the next run retries it.
      const st = err?.status
      if (Number.isInteger(st) && st >= 400 && st < 500) {
        checked.add(c.refKey)
        persistChecked(storage, checked)
      }
    }
    done += 1
  }
  onProgress?.({ done, total, found })
  return { total: all.length, checked: checked.size, found, perTrip }
}
