// thumbUrl — append ?w=<width> to a photo URL served by the sync
// Worker so the album-grid <img> tiles request a downscaled variant.
// The Worker's /assets/:key handler intercepts ?w=, runs photon
// resize + JPEG re-encode, caches the variant in R2, and serves it.
//
// Why this exists: even after the structural fix to saveAsset
// (commit 21fc084) defends new uploads, the lightbox + grid still
// render the same URL. iOS Safari's per-tab decoded-image memory
// budget can be exhausted by a few full-resolution photos in a row.
// Tiles get a tiny thumb (≤2048px); the lightbox keeps the bare URL
// for max fidelity.
//
// Safe by construction:
//  - Non-string / falsy input → returned unchanged.
//  - URLs that don't go through the Worker (ObjectURLs, external
//    pasted images, blob: previews) → returned unchanged.
//  - Existing ?w= on the URL → respected (no double-append).

const WORKER_HOST_RE = /\/\/(?:[^/]+\.)?workers\.dev\//

export function thumbUrl(url, width) {
  if (typeof url !== 'string' || !url) return url
  if (!Number.isFinite(width) || width <= 0) return url
  // Only rewrite URLs served by the sync Worker. Blob:, data:, and
  // third-party hosts pass through.
  if (!WORKER_HOST_RE.test(url)) return url
  // Already has a w= param? Trust the existing caller — don't
  // clobber, don't double-append.
  if (/[?&]w=\d+/.test(url)) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}w=${Math.round(width)}`
}
