// composerImport — bring BRAND-NEW media into a shared "moment" (share-out E3).
//
// Importing a photo/video into the composer routes through the SAME proven,
// offline-safe pipeline the bulk Photos importer uses: read EXIF (capture date),
// encode video (WebCodecs, gated), then upload-or-queue and create a trip-level
// memory (saveImportedMedia). The returned piece carries `importId` (the new
// memory's id) so the composer can re-read the now-r2 ref after the upload queue
// drains — a moment never ships a `blob:` url to a recipient.
//
// Per the design's "Saved to the trip" copy, an imported photo becomes a normal
// trip photo (that's how it inherits the bulletproof offline survival). The
// composer then references it.
import { readExifForImport } from './photoBackfill'
import { encodeVideo, isVideoEncodeSupported } from './videoPipeline'
import { extractVideoCreationDate } from './videoMeta'
import { saveImportedMedia } from './photoBackfillUpload'

export function isVideoFile(file) {
  return (file?.type || '').startsWith('video/')
}

// True when this browser can import video at all (WebCodecs encode available).
// The composer hides the video option otherwise — a picked video would be
// silently dropped — exactly as PhotosView gates its picker `accept`.
export function canImportVideo() {
  return isVideoEncodeSupported() || !!globalThis.__RT_COMPOSER_FAKE_ENCODE
}

// The picker `accept` string, video only where it can actually be encoded.
export function importAccept() {
  return canImportVideo() ? 'image/*,video/*' : 'image/*'
}

// Headless e2e can't run WebCodecs, so the offline hard-gate test sets
// window.__RT_COMPOSER_FAKE_ENCODE to exercise the upload/queue/drain/share path
// with a tiny synthetic mp4 + poster. Inert in production (the flag is never set).
function fakeEncoded() {
  return {
    blob: new Blob([new Uint8Array([0, 0, 0, 32])], { type: 'video/mp4' }),
    posterBlob: new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' }),
    mime: 'video/mp4',
    width: 320,
    height: 180,
    durationMs: 1000,
  }
}

async function encodeForImport(file, onProgress) {
  if (globalThis.__RT_COMPOSER_FAKE_ENCODE) return fakeEncoded()
  const enc = await encodeVideo(file, { onProgress })
  return {
    blob: enc.blob,
    posterBlob: enc.posterBlob || null,
    mime: 'video/mp4',
    width: enc.width,
    height: enc.height,
    durationMs: enc.durationMs,
  }
}

function pieceFromImport({ id, ref, pending }) {
  const isVideo = ref.kind === 'video' || (ref.mime || '').startsWith('video')
  return {
    id: `imp::${id}`,
    importId: id, // the new memory's id — re-read its ref after the queue drains
    ref,
    // A video shows its poster; a posterless video → no url (the grid/preview
    // renders a placeholder, never an <img src=.mp4>).
    url: ref.posterUrl || (isVideo ? undefined : ref.url),
    isVideo,
    pending,
  }
}

// Import ONE picked File → a selectable composer piece. Throws { code } on a
// video the browser can't encode so the caller can show an honest message.
// `onProgress(percent)` reports the video encode (0..100); ignored for photos.
export async function importComposerFile(file, { trip, traveler, onProgress } = {}) {
  if (isVideoFile(file)) {
    if (!canImportVideo()) {
      throw Object.assign(new Error('This device can’t add videos here.'), { code: 'video-unsupported' })
    }
    const capturedAt = await extractVideoCreationDate(file).catch(() => null)
    const encoded = await encodeForImport(file, onProgress)
    const saved = await saveImportedMedia({ file, kind: 'video', exif: { capturedAt }, encoded, trip, traveler })
    return pieceFromImport(saved)
  }
  const exif = await readExifForImport(file)
  const saved = await saveImportedMedia({ file, kind: 'photo', exif, trip, traveler })
  return pieceFromImport(saved)
}
