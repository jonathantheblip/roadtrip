// importToastProps — the one honest summary line for a photo/video import
// batch, shared by PhotosView's per-trip importer and App.jsx's home-screen
// bulk importer (both call uploadBackfillPhotos/ImportFlow and get back the
// SAME { ok, queued, reattached, failed, errors, nothingNew } shape — this
// was duplicated byte-for-byte in both files before; pulled out here so
// there's one place to get it right, and so it's plain-testable (the two
// callers are .jsx views, which a plain `node --test` run can't import at
// all — no JSX transform in that runner).
export function importToastProps(r) {
  if (!r) return null
  if (r.nothingNew) return { message: 'Nothing new to import' }
  if (r.ok > 0) {
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
