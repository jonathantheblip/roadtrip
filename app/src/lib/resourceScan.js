// resourceScan.js — the re-source scan MECHANISM (design: "Find your photos'
// locations", Album System Ch 04). The evolution of the Stage C-b Locate tool
// (gpsBackfill.js) that reads the STRIPPED uploaded copy — a dry well — this reads
// the ORIGINALS on the family member's phone, where GPS + the capture-time offset
// still live, matches each original to its imported memory by CAPTURE INSTANT, and
// fills in the recovered { lat, lng } + offsetMinutes additively.
//
// ⚠ THIS TOOL IS ARCHAEOLOGY, NOT ARCHITECTURE. It exists only because
// photoPipeline.readExif() didn't capture OffsetTimeOriginal at import until this
// same change closed that gap (see photoPipeline.js readExif). Every photo imported
// from here forward already carries its offset — needsOffset is false at import
// time, so this scan is a no-op for it. What remains for this tool to serve is the
// BACKLOG: everything imported before the fix. Once that backlog is scanned by every
// device that holds originals, this tool has no more work, ever again.
//
// THE MATCH KEY. The imported ref's `capturedAt` was computed at import as
// exifDateToDate(DateTimeOriginal ?? CreateDate).toISOString() — a LOCAL-time parse,
// so it carries the tz the importing device was in. We recompute it the SAME way,
// and — when the original still carries its OffsetTimeOriginal — we ALSO derive the
// photo's TRUE instant (wall clock minus its own offset). Which of the two is the
// real one depends on where the phone was at IMPORT vs at SCAN, and we cannot know:
// import-at-home → the device-local reading is right; import-abroad, scan-at-home →
// the true instant is. Both are exact instants, never a guess.
//
// THE REAL PROOF OF IDENTITY IS CONTENT, NOT A LABEL. Three rounds of review tried
// to prove "this original belongs to that ref" from TIMING + AUTHORSHIP alone, and
// every version broke: `authorTraveler` records who IMPORTED a memory, not who took
// the photo (an AirDropped or shared-album photo is authored by whoever added it),
// so "same author, same second" can still be two different photos. No refinement of
// the time key fixes this — the index can hold exactly ONE candidate at a key and
// still be the wrong photo. Writes are additive, so a wrong one is permanent.
//
// The fix: verify CONTENT. `ref.scene` is a perceptual hash (sceneHash.js, dHash
// over a 9×8 grayscale grid) the composition backfill already computed for the
// whole archive from each stored photo's surviving pixels. This scan computes the
// SAME hash from the picked original (sceneHashFromFile) and requires it to match
// the candidate's stored hash before writing ANYTHING — regardless of who imported
// it. Content match is proof; a content MISMATCH is proof of the opposite (refuse,
// don't fall through to a guess) — this is what closes the collision class no
// author/timing rule could: two of the SAME author's photos landing on one instant,
// or an imported photo whose real author differs from the record's authorTraveler.
//
// THE RESIDUAL, NAMED HONESTLY: a ref not yet composition-backfilled has no
// `ref.scene` to check against. For that narrow, self-healing window (the daily
// cron closes it), the scan falls back to the OLD, weaker rule — fill only refs the
// scanner authored — which still carries the theoretical same-author-collision risk
// review round 4 found. It does not fall back for another adult's or a kid's ref:
// those still require content proof, full stop.
//
// MASKING UPSTREAM. `masked` lives only on worker-emitted projections; a surprise a
// person authored on their OWN device is a raw, unflagged row. So a viewer is passed
// in and `isMaskedFrom` is the real guard — a recovered field must never touch,
// count, or hint at a photo hidden from whoever is running the scan.
//
// All I/O is injected (loadTags / loadSceneHash / applyGps / applyOffset) so the
// engine unit-tests without real files or the DOM. Pure helpers carry the logic.

import { exifReaderToRaw, exifReaderToMeta, sanitizeSidecar, parseOffsetMinutes } from './exifRead.js'
import { isMaskedFrom } from './surprises.js'
import { sceneHashFromGray, sceneSimilar, SCENE_DEFAULTS } from './sceneHash.js'
import { loadImageBitmap } from './photoPipeline.js'

export { parseOffsetMinutes }

// Decode a picked original File into the SAME perceptual scene hash the composition
// backfill computed for the stored copy (sceneSignature.js, worker-side, via Photon
// `resize(gridW, gridH, SamplingFilter.Nearest)`).
//
// EMPIRICALLY VERIFIED, not assumed: an earlier version of this function drew the
// bitmap through `ctx.drawImage(bitmap, 0, 0, gridW, gridH)` with smoothing off,
// expecting that to be the browser's nearest-neighbor equivalent. On the app's real
// fixture it diverged from Photon's real output by 25 of 64 bits — nowhere near
// SCENE_DEFAULTS.sameMaxBits (10). At a ~450:1 reduction (a 4032×3024 photo → 9×8),
// browsers do NOT guarantee true point-sampling from drawImage regardless of the
// smoothing flag. Tracing Photon's actual output pinned its exact formula: PIXEL-
// CENTER nearest-neighbor, `floor((x + 0.5) * srcW / gridW)` — reproducing that by
// hand, sampling directly from a 1:1 (unscaled) getImageData read, matched Photon's
// hash of the same raw bytes BIT-FOR-BIT. That is what this function does; it never
// asks the browser to resize for us. (The remaining ~9-bit gap between a hash of
// the raw original and one of the recompressed, downscaled STORED copy is real but
// small — dHash's tolerance for recompression, not a decoder disagreement — and
// sits well inside sameMaxBits.) Returns null (never throws) on any decode failure
// — the scan degrades to the fallback rule, it never hard-fails the file.
// A dimension no real phone photo exceeds (comfortably above an iPhone's 48MP
// mode, 8064px longest edge) but that bounds worst-case memory against a
// pathological input (a scanned document, a huge screenshot/export) the family
// could still hand the picker. getImageData at this cap is a fixed ~256MB
// ceiling; unbounded, a large-enough file could exhaust iOS Safari's decode
// budget mid-scan (photoPipeline.js's own downscaleImage exists for exactly this
// reason on the upload path). Above the cap, we accept the browser's own resize
// (and its precision loss — see the header) rather than risk the crash; below
// it, EVERY real photo this tool is built for gets the verified, exact 1:1 path.
const MAX_DECODE_EDGE = 8192

export async function sceneHashFromFile(file, { gridW = SCENE_DEFAULTS.gridW, gridH = SCENE_DEFAULTS.gridH } = {}) {
  try {
    const bitmap = await loadImageBitmap(file)
    const nativeW = bitmap.width || bitmap.naturalWidth
    const nativeH = bitmap.height || bitmap.naturalHeight
    if (!nativeW || !nativeH) return null
    const longest = Math.max(nativeW, nativeH)
    const scale = longest > MAX_DECODE_EDGE ? MAX_DECODE_EDGE / longest : 1
    const srcW = Math.max(1, Math.round(nativeW * scale))
    const srcH = Math.max(1, Math.round(nativeH * scale))
    const canvas =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(srcW, srcH)
        : Object.assign(document.createElement('canvas'), { width: srcW, height: srcH })
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // 1:1 for every real phone photo (scale === 1) — no browser resize, we pick
    // the samples ourselves, exactly the path verified bit-for-bit against Photon.
    // Only a file past MAX_DECODE_EDGE asks the browser to resize first.
    ctx.drawImage(bitmap, 0, 0, srcW, srcH)
    const { data } = ctx.getImageData(0, 0, srcW, srcH)
    const n = gridW * gridH
    const gray = new Float64Array(n)
    for (let gy = 0; gy < gridH; gy++) {
      const sy = Math.min(srcH - 1, Math.floor((gy + 0.5) * srcH / gridH))
      for (let gx = 0; gx < gridW; gx++) {
        const sx = Math.min(srcW - 1, Math.floor((gx + 0.5) * srcW / gridW))
        const o = (sy * srcW + sx) * 4
        gray[gy * gridW + gx] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
      }
    }
    return sceneHashFromGray(gray, gridW, gridH)
  } catch {
    return null
  }
}

// EXIF raw (exifReaderToRaw output) → the fields we can recover from an original.
// `capturedAt` is the instant the importer would have derived on THIS device (the
// primary key). `capturedAtTrue` is the photo's real instant, derived from its own
// recorded offset — the key that survives a device timezone change between import
// and scan. `CreateDate` is the same fallback photoPipeline.readExif uses.
export function originalToRecovered(raw) {
  const out = {}
  const dt = raw?.DateTimeOriginal || raw?.CreateDate
  if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
    out.capturedAt = dt.toISOString()
    // Which candidate won — threaded onto a filled ref as `atSrc` (Build 1),
    // same enum photoBackfill.js's parseExifData tracks.
    out.capturedAtSource = raw?.DateTimeOriginal ? 'exif-original' : 'exif-create'
    const off = parseOffsetMinutes(raw?.OffsetTimeOriginal)
    if (Number.isFinite(off)) {
      out.offsetMinutes = off
      // The wall clock read as UTC, then shifted by the photo's own offset.
      const wallClockAsUtcMs = dt.getTime() - dt.getTimezoneOffset() * 60000
      out.capturedAtTrue = new Date(wallClockAsUtcMs - off * 60000).toISOString()
    }
  }
  if (Number.isFinite(raw?.GPSLatitude) && Number.isFinite(raw?.GPSLongitude)) {
    out.lat = raw.GPSLatitude
    out.lng = raw.GPSLongitude
  }
  return out
}

// capturedAt (any ISO) → a second-precision key ("2026-07-05T17:42:00"), so import-ms
// vs recompute-no-ms never blocks a match. Invalid → null.
export function instantKey(capturedAt) {
  if (typeof capturedAt !== 'string') return null
  const t = Date.parse(capturedAt)
  return Number.isFinite(t) ? new Date(Math.floor(t / 1000) * 1000).toISOString().slice(0, 19) : null
}

// The keys one original may legitimately be filed under: the device-local reading
// (what the importer computed if it ran in this same timezone) and, when the offset
// survived, the photo's true instant. Both exact; deduped, order = preference.
export function candidateKeys(recovered) {
  const keys = []
  for (const iso of [recovered?.capturedAt, recovered?.capturedAtTrue]) {
    const k = instantKey(iso)
    if (k && !keys.includes(k)) keys.push(k)
  }
  return keys
}

// The refs a memory really owns. `photoRef` is a back-compat MIRROR of photoRefs[0]
// — and after the M2 write path the two can hold different R2 keys for one image.
// flattenPhotoEntries (the canonical enumerator) ignores photoRef whenever
// photoRefs[] is populated; do the same, or every single-photo memory is counted,
// filled, and REPORTED twice.
function refsOf(m) {
  if (Array.isArray(m?.photoRefs) && m.photoRefs.length) return m.photoRefs.filter(Boolean)
  return m?.photoRef ? [m.photoRef] : []
}

// Index the LOCAL memories' real photo refs by capture instant → the refs at that
// instant, each tagged with what it still needs (GPS / offset) and who took it.
// Skipped entirely: memories masked from `viewer` (raw surprise rows included —
// `masked` alone is not the predicate), deleted rows, non-r2 refs, and VIDEO refs
// (the picker hands over images; a video original can never arrive here, so counting
// one as "needy" would promise a number that can never drain).
// An ALREADY-COMPLETE ref is indexed too (complete: true) — the scan must tell
// "this original's photo already knows where it was" apart from "this original
// matches nothing we imported", or a finished photo gets reported as unmatched.
export function buildRefIndex(memories, viewer) {
  const idx = new Map()
  for (const m of memories || []) {
    if (!m || m.masked || m.deletedAt) continue
    if (viewer && isMaskedFrom(m, viewer)) continue
    for (const r of refsOf(m)) {
      if (!r || r.storage !== 'r2' || !r.key || !r.capturedAt) continue
      if (r.kind === 'video') continue
      const key = instantKey(r.capturedAt)
      if (!key) continue
      const needsGps = !(Number.isFinite(r.lat) && Number.isFinite(r.lng))
      const needsOffset = !Number.isFinite(r.offsetMinutes)
      // The never-discard sidecar (Build 1) — a ref with no `meta` yet is
      // eligible for a gap-fill from this scan's original. Deliberately NOT
      // part of `complete`/needy-count below: the tool's own completion
      // signal ("this photo already knows where and when it was") is scoped
      // to GPS+time, matching every existing bucket message; sidecar
      // enrichment rides along as a free extra whenever a target is found,
      // never gates whether a photo counts as needing something.
      const needsMeta = !r.meta
      if (!idx.has(key)) idx.set(key, [])
      idx.get(key).push({
        memoryId: m.id,
        refKey: r.key,
        tripId: m.tripId || null,
        author: m.authorTraveler || null,
        scene: typeof r.scene === 'string' && r.scene ? r.scene : null,
        needsGps,
        needsOffset,
        needsMeta,
        complete: !needsGps && !needsOffset,
      })
    }
  }
  return idx
}

// THE FALLBACK RULE — used only when content proof is unavailable (neither side has
// a scene hash to compare). Fill only refs the scanner authored. This is weaker than
// content verification (authorTraveler is the importer, not provably the
// photographer) but it's the best available signal when pixels can't be compared,
// and it's the same rule three review rounds already hardened: never another
// adult's ref, never a kid's (the index only contains IMPORTED photos, so "nothing
// of the scanner's is here" is not proof nothing of theirs was ever taken here —
// see the module header), never an author-less ref (author_traveler is NOT NULL in
// the schema; defensive only). Returns [] when nothing here is theirs to fill.
function fillableByAuthorOnly(candidates, scanner) {
  if (!scanner) return candidates // unit-test convenience; production always passes one
  return candidates.filter((c) => c.author && c.author === scanner)
}

// How many indexed refs still need something. The surface asks this before the
// grant: zero → "everything here already knows where it was", no pick needed.
export function countNeedyRefs(refIndex) {
  let n = 0
  for (const cands of refIndex.values()) {
    for (const c of cands) if (!c.complete) n += 1
  }
  return n
}

// Do two candidate lists refer to the exact same set of refs? (order-independent).
function sameRefSet(a, b) {
  if (a.length !== b.length) return false
  const keyOf = (c) => c.memoryId + ' ' + c.refKey
  const bKeys = new Set(b.map(keyOf))
  return a.every((c) => bKeys.has(keyOf(c)))
}

// Pair one recovered original to the ref(s) at its instant. Returns
// { matched, reason, writes } where `reason` says exactly why nothing was written,
// so the surface never has to guess (and never tells the family a photo "already
// knew where it was" when the truth is one of the others):
//   'unmatched'  — no imported photo sits at either reading of this instant, OR
//                  content was checkable and every checkable candidate is a
//                  DIFFERENT photo (content disproves this original belongs here)
//   'ambiguous'  — either: content matched MORE THAN ONE candidate (never
//                  auto-resolved — see the comment below); OR no content proof
//                  was available and two readings land on two DIFFERENT candidate
//                  sets — either way, which is real is unknowable, nothing is touched
//   'not-yours'  — (fallback rule only) the photos there were taken on someone
//                  else's phone; only that phone's own scan can fill them in
//   'complete'   — the photo there already knows where and when it was
//   'nothing'    — the photo still needs something, but this original has nothing
//                  this scan can add (no location to give, or it only carries a
//                  field the photo already has). We do NOT claim which — the
//                  surface must not assert a cause we cannot know.
//   null         — writes were produced
export function matchRecovered(recovered, refIndex, scanner) {
  const keys = candidateKeys(recovered)
  const hits = keys.map((key) => refIndex.get(key) || []).filter((cands) => cands.length)
  if (!hits.length) return { matched: false, reason: 'unmatched', writes: [] }

  // Union across every hit key, deduped — once content can prove identity it no
  // longer matters which TIME reading led here.
  const seen = new Set()
  const allCandidates = []
  for (const cands of hits) {
    for (const c of cands) {
      const dk = c.memoryId + ' ' + c.refKey
      if (seen.has(dk)) continue
      seen.add(dk)
      allCandidates.push(c)
    }
  }

  // Content, checked per-candidate, computed ONCE against every live candidate at
  // this instant. A DISPROOF is proof (of the opposite): that specific candidate
  // is excluded PERMANENTLY, regardless of what the weaker fallback rule would
  // otherwise allow — a negative content result is never overridden by
  // authorship. `remaining` is everyone NOT disproved — this includes both
  // content-VERIFIED candidates and candidates this scan simply couldn't check
  // (no scene hash on either side), because "couldn't check" is not the same as
  // "ruled out": an unchecked sibling at the same instant could still be the true
  // match, and must stay visible to the safety logic below rather than silently
  // vanishing the moment something else happens to verify.
  const disproved = recovered.scene ? new Set(allCandidates.filter((c) => c.scene && !sceneSimilar(recovered.scene, c.scene))) : new Set()
  const remaining = allCandidates.filter((c) => !disproved.has(c))
  if (!remaining.length) {
    // Content was checkable for every candidate here, and none matched — this
    // original simply isn't any of them.
    return { matched: false, reason: 'unmatched', writes: [] }
  }
  const verified = recovered.scene ? remaining.filter((c) => c.scene && sceneSimilar(recovered.scene, c.scene)) : []

  let target
  if (verified.length === 1 && remaining.length === 1) {
    // A MATCH is proof — resolves even a same-second collision or a two-key
    // ambiguity no timing rule could — but ONLY when it is the sole live
    // candidate at this instant. A single verified match sitting alongside an
    // UNCHECKED sibling (found live, review round 7: the composition backfill
    // runs on an ongoing bounded cron, so "some refs here have a scene hash,
    // others don't yet" is a routine, recurring state, not a rare edge case) is
    // NOT safe to auto-fill — the coincidental match could be a false positive
    // while the real match is the one we simply haven't hashed yet. Content
    // proof only counts once it has ruled out every OTHER live possibility, not
    // merely the ones it happened to be able to check.
    target = verified
  } else if (verified.length >= 1) {
    // Either MORE THAN ONE candidate content-matched, or exactly one did but a
    // still-live, unverifiable sibling remains at the same instant. Round 5
    // found writing the same coordinates onto every independently-close
    // candidate silently, permanently mis-fills whichever one isn't real. Round
    // 6 found the obvious fix — require mutual closeness among the verified set
    // — is UNSOUND: Hamming distance obeys the triangle inequality, not
    // equality, so two genuinely DIFFERENT candidates A and B can each
    // independently sit within sameMaxBits of the recovered hash R AND be within
    // sameMaxBits of EACH OTHER, whenever their bit-differences from R happen to
    // overlap rather than compound (verified, not assumed: a real A/B pair with
    // d(R,A)=6, d(R,B)=6, d(A,B)=6 — all within the 10-bit tolerance — where A
    // and B differ from R in non-overlapping, genuinely distinct ways). There is
    // no cheap discriminator here — ANY threshold on mutual distance, or on
    // "how many other candidates exist," can be defeated the same way. So:
    // anything less than total, unambiguous certainty always refuses. This costs
    // the rare legitimate case (the same real photo filed into two memories, or
    // a coincidental match resolved a moment too early) — acceptable, since
    // "prefer nothing to a guess" is this module's own stated invariant, and a
    // refused scan can always be re-run later once backfill or other evidence
    // catches up.
    return { matched: true, reason: 'ambiguous', writes: [] }
  } else {
    // No content proof settled it for what's left. Two distinct readings landing
    // on two DIFFERENT (post-disproof) candidate sets is the one case content
    // can't resolve — preferring either key writes the wrong photo in the
    // other's scenario, and the write is permanent. Refuse.
    const remainingHits = hits.map((cands) => cands.filter((c) => !disproved.has(c))).filter((cands) => cands.length)
    if (remainingHits.length > 1 && !sameRefSet(remainingHits[0], remainingHits[1])) {
      return { matched: true, reason: 'ambiguous', writes: [] }
    }
    target = fillableByAuthorOnly(remaining, scanner)
  }

  if (!target.length) return { matched: true, reason: 'not-yours', writes: [] }
  // GPS+offset completeness — "where and when" — is the ONLY thing that
  // decides the classification below, never the sidecar. A photo that
  // already knew where and when it was stays "already known" even when
  // this pass silently backfills its Build-1 metadata sidecar underneath;
  // the sidecar can still ride along on the SAME write (see the loop
  // below), it just never flips the family-facing story. Same rule
  // buildRefIndex's needsMeta comment states for the needy-count; this is
  // its write-side twin. (A prior version of this check also required the
  // sidecar to already be filled before calling a photo "complete" — that
  // silently reclassified a bare sidecar backfill as "matched" and
  // wrongly fired the settle note; see the e2e regression this replaced.)
  const wasComplete = target.every((c) => c.complete)

  const writes = []
  for (const c of target) {
    const w = { memoryId: c.memoryId, refKey: c.refKey, tripId: c.tripId, candidate: c }
    if (c.needsGps && Number.isFinite(recovered.lat) && Number.isFinite(recovered.lng)) {
      w.lat = recovered.lat
      w.lng = recovered.lng
    }
    if (c.needsOffset && Number.isFinite(recovered.offsetMinutes)) w.offsetMinutes = recovered.offsetMinutes
    // The never-discard sidecar (Build 1) — same target, same safety logic
    // above (content-verified or the author-only fallback); this just adds
    // one more field to the same write when the ref doesn't have it yet,
    // regardless of whether GPS/offset were already known (wasComplete).
    // srcName/srcMod/atSrc ride along ONLY when there's real meta to
    // accompany them.
    if (c.needsMeta && recovered.meta) {
      const sidecar = sanitizeSidecar({
        meta: recovered.meta,
        srcName: recovered.srcName,
        srcMod: recovered.srcMod,
        atSrc: recovered.capturedAtSource,
      })
      if (Object.keys(sidecar).length) w.sidecar = sidecar
    }
    if ('lat' in w || 'offsetMinutes' in w || 'sidecar' in w) writes.push(w)
  }
  if (!writes.length) return { matched: true, reason: wasComplete ? 'complete' : 'nothing', writes: [] }
  return { matched: true, reason: wasComplete ? 'complete' : null, writes }
}

// Run the scan over a batch of device-original Files. Injected I/O:
//   files      — File[] the family granted (their originals)
//   memories   — the local memory set to match against
//   scanner    — the traveler running it (fallback-rule affinity + masking)
//   loadTags   — File → ExifReader tags (loadExifTags in production)
//   loadSceneHash — File → hex scene hash | null (sceneHashFromFile in production;
//                   optional — omitting it degrades every match to the fallback
//                   rule, never throws)
//   applyGps    — (memoryId, refKey, {lat,lng}) → the patched record, or null if gone
//   applyOffset — (memoryId, refKey, offsetMinutes) → same contract
//   applySidecar — (memoryId, refKey, {meta,srcName,srcMod,atSrc}) → same contract
//                  (Build 1 — the never-discard sidecar; optional, defaults to a
//                  no-op so existing callers/tests need not supply it)
//   onProgress — ({ done, total, ...stats }) → void
//   signal     — optional AbortSignal (stop between files)
//
// Returns per-FILE buckets (what the family reads) plus per-REF write counts. Every
// bucket maps to exactly ONE honest sentence — nothing is conflated:
//   matched          — filled GPS and/or the capture-time offset on at least one
//                      photo that didn't already have it (a sidecar backfill never
//                      triggers this on its own — see alreadyKnown/nothingToRecover)
//   alreadyKnown     — that photo already knew where and when it was (a Build-1
//                      sidecar may have silently backfilled underneath — still this
//                      bucket, never "matched", never trips the settle note)
//   nothingToRecover — the photo still needs GPS/time; this original had none of it
//                      to give (it may still have silently backfilled the sidecar)
//   notYours         — (fallback rule only) those photos belong to someone else
//   ambiguous        — (fallback rule only) two readings, two photos, unknowable
//                       which; nothing touched
//   unmatched        — no imported photo at this instant, OR content was checkable
//                       and proved this original is none of the candidates there
//   failed           — it had something to add and saving it FAILED — never silent
// A write only counts once it has LANDED, and the index is updated as it goes, so a
// second original at the same instant reports "already known", not a second find.
export async function runResourceScan({ files, memories, scanner, loadTags, loadSceneHash, applyGps, applyOffset, applySidecar, onProgress, signal } = {}) {
  const refIndex = buildRefIndex(memories, scanner)
  const list = Array.isArray(files) ? files : []
  const total = list.length
  const stats = {
    total,
    matched: 0,
    alreadyKnown: 0,
    nothingToRecover: 0,
    notYours: 0,
    ambiguous: 0,
    unmatched: 0,
    failed: 0,
    gpsFilled: 0,
    offsetFilled: 0,
    metaFilled: 0,
    filesLocated: 0,
    filesTimeFixed: 0,
    perTrip: {},
  }
  const BUCKET = {
    unmatched: 'unmatched',
    ambiguous: 'ambiguous',
    'not-yours': 'notYours',
    complete: 'alreadyKnown',
    nothing: 'nothingToRecover',
  }
  let done = 0
  for (const file of list) {
    if (signal?.aborted) break
    onProgress?.({ done, total, ...stats })
    let recovered = {}
    try {
      const tags = await loadTags(file)
      recovered = originalToRecovered(exifReaderToRaw(tags))
      // The never-discard sidecar (Build 1) — read off the SAME tags object
      // (no extra decode) plus the File itself for name/mtime.
      const meta = exifReaderToMeta(tags)
      if (meta) recovered.meta = meta
      if (typeof file?.name === 'string') recovered.srcName = file.name
      if (Number.isFinite(file?.lastModified)) recovered.srcMod = file.lastModified
    } catch {
      recovered = {}
    }
    // Content hash runs independently of EXIF — a photo can be scene-hashed even
    // when its EXIF is unreadable, and a hash failure must never block the EXIF
    // match from proceeding (sceneHashFromFile itself never throws; the try/catch
    // is only for a hostile injected loadSceneHash in tests).
    try {
      const scene = await loadSceneHash?.(file)
      if (typeof scene === 'string' && scene) recovered.scene = scene
    } catch {
      /* no content proof available for this file — matchRecovered degrades to the fallback rule */
    }
    const { reason, writes } = matchRecovered(recovered, refIndex, scanner)
    if (!writes.length) {
      // No write was even proposed — a plain named outcome (unmatched /
      // ambiguous / not-yours / complete-with-nothing-to-add-either / nothing).
      stats[BUCKET[reason]] += 1
    } else {
      let gpsHere = 0
      let offsetHere = 0
      let saveThrew = false
      // A write only counts once it LANDED. Two ways it may not, and they are NOT
      // the same story: the store THROWS when localStorage is full (a real failure
      // the family must be told about, and can retry), and returns null when the
      // memory is simply gone — a background pull deleted it mid-scan. A deleted
      // photo is not an out-of-space error, and neither may kill the scan.
      for (const w of writes) {
        let touched = false
        if (Number.isFinite(w.lat) && Number.isFinite(w.lng)) {
          try {
            if (applyGps?.(w.memoryId, w.refKey, { lat: w.lat, lng: w.lng }) !== null) {
              w.candidate.needsGps = false
              stats.gpsFilled += 1
              gpsHere += 1
              touched = true
            }
          } catch {
            saveThrew = true
          }
        }
        if (Number.isFinite(w.offsetMinutes)) {
          try {
            if (applyOffset?.(w.memoryId, w.refKey, w.offsetMinutes) !== null) {
              w.candidate.needsOffset = false
              stats.offsetFilled += 1
              offsetHere += 1
              touched = true
            }
          } catch {
            saveThrew = true
          }
        }
        // The never-discard sidecar (Build 1) — same target, additive, never
        // gates completeness (see needsMeta's comment in buildRefIndex).
        // Guarded on `applySidecar` actually being supplied (unlike
        // applyGps/applyOffset above, existing callers/tests predate this
        // field and legitimately omit it) — `undefined !== null` would
        // otherwise count a no-op as a landed write.
        if (w.sidecar && applySidecar) {
          try {
            if (applySidecar(w.memoryId, w.refKey, w.sidecar) !== null) {
              w.candidate.needsMeta = false
              stats.metaFilled += 1
              touched = true
            }
          } catch {
            saveThrew = true
          }
        }
        w.candidate.complete = !w.candidate.needsGps && !w.candidate.needsOffset
        if (touched && w.tripId) stats.perTrip[w.tripId] = (stats.perTrip[w.tripId] || 0) + 1
      }
      if (reason === 'complete') {
        // GPS+offset were already known BEFORE this pass (see matchRecovered's
        // wasComplete) — the only write possible here is a silent sidecar
        // backfill. It may land or fail; either way the family-facing story
        // stays "already known" — never surfaced as "matched", never trips
        // the settle note. Retriable later (idempotent, gap-fill-only) if it
        // failed, same as every other sidecar write.
        stats.alreadyKnown += 1
      } else if (gpsHere || offsetHere) {
        stats.matched += 1
        if (gpsHere) stats.filesLocated += 1
        if (offsetHere) stats.filesTimeFixed += 1
      } else if (saveThrew) {
        stats.failed += 1 // it had something to give; saving it failed
      } else {
        // Not already complete, and this original gave nothing for GPS/time —
        // whether it silently backfilled the sidecar (metaHere) or the memory
        // vanished mid-scan, neither changes the family-facing "nothing to
        // add" story.
        stats.nothingToRecover += 1
      }
    }
    done += 1
  }
  onProgress?.({ done, total, ...stats })
  return stats
}
