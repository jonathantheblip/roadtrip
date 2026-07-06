// importToastProps — the one honest summary line for a photo/video import
// batch, shared by PhotosView's per-trip importer and App.jsx's home-screen
// bulk importer (both call uploadBackfillPhotos/ImportFlow and get back the
// SAME { ok, queued, reattached, failed, errors, nothingNew } shape — this
// was duplicated byte-for-byte in both files before; pulled out here so
// there's one place to get it right, and so it's plain-testable (the two
// callers are .jsx views, which a plain `node --test` run can't import at
// all — no JSX transform in that runner).
export function importToastProps(r, traveler) {
  if (!r) return null
  if (r.nothingNew) return { message: 'Nothing new to import' }
  if (r.ok > 0) {
    // Sound honesty: a clip that imported WITHOUT the sound its source had
    // must show in the one-line summary too — "3 photos added · 1 without its
    // sound" — never a bare success count. Absent/zero keeps the classic shape.
    // Rafa's lens is the one exception: he never meets a sound-loss notice
    // (his videoCopy deck nulls every soundLost string — banner and tile chip
    // included); the honest line surfaces on a parent's lens instead.
    if (r.soundLost > 0 && traveler !== 'rafa') {
      return {
        message: `${r.ok} ${r.ok === 1 ? 'photo' : 'photos'} added · ${r.soundLost} without ${r.soundLost === 1 ? 'its' : 'their'} sound`,
        syncing: r.queued || 0,
      }
    }
    return { count: r.ok, noun: r.ok === 1 ? 'photo' : 'photos', syncing: r.queued || 0 }
  }
  if (r.reattached > 0) {
    return { message: `${r.reattached} re-attached` }
  }
  // A batch where EVERY item failed (network hiccup, an unencodable video, a
  // worker error) used to fall through to the same "Nothing new to import"
  // toast as picking nothing at all — indistinguishable from "it worked, you
  // just didn't add anything." The technical detail stays in the dev upload
  // log (logUploadEvent); this just tells the family something real happened.
  if (r.failed > 0) {
    return { message: `Couldn't add ${r.failed === 1 ? 'that one' : `${r.failed} of those`} — try again` }
  }
  return { message: 'Nothing new to import' }
}
