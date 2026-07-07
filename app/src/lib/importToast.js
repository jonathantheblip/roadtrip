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
    // `r.ok` counts every new item — photos AND videos. Split them so the line
    // never calls a video a "photo" ("3 photos · 1 video"). The video count
    // rides in on `r.videos` (threaded from the import summary in ImportFlow's
    // doSave); clamp to `r.ok` so a partial-failure batch can never show more
    // videos than items actually saved. Absent `r.videos` → 0 → the classic
    // photos-only shape, byte-identical to before.
    const videos = Math.min(r.videos || 0, r.ok)
    const photos = r.ok - videos
    const pPart = photos > 0 ? `${photos} ${photos === 1 ? 'photo' : 'photos'}` : ''
    const vPart = videos > 0 ? `${videos} ${videos === 1 ? 'video' : 'videos'}` : ''
    const base = [pPart, vPart].filter(Boolean).join(' · ')
    // Sound honesty: a clip that imported WITHOUT the sound its source had must
    // show in the one-line summary too — appended to the honest count, never a
    // bare success count. Rafa's lens is the one exception: he never meets a
    // sound-loss notice (his videoCopy deck nulls every soundLost string —
    // banner and tile chip included); the honest line surfaces on a parent's
    // lens instead. (The photo/video split itself is just honest counting, so
    // it applies on every lens.)
    if (r.soundLost > 0 && traveler !== 'rafa') {
      return {
        message: `${base} added · ${r.soundLost} without ${r.soundLost === 1 ? 'its' : 'their'} sound`,
        syncing: r.queued || 0,
      }
    }
    // Photos-only keeps the classic count/noun shape (the ImportToast component
    // renders `${count} ${noun} added`); any batch with a video uses the split
    // message so both kinds are named honestly.
    if (videos === 0) {
      return { count: r.ok, noun: r.ok === 1 ? 'photo' : 'photos', syncing: r.queued || 0 }
    }
    return { message: `${base} added`, syncing: r.queued || 0 }
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
