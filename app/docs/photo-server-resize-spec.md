# Server-side photo resize — spec for Pri 1.5

Status: spec only. **Not implemented.** Awaiting Jonathan's approval
before any Worker code lands.

## Context

The structural client-side fix (Pri 1, commit ✱) routes every photo
through `preparePhotoForUpload` via `saveAsset`. New photos are
downscaled to 2048px before they leave the browser. But:

- 63 of 68 existing photos in R2 are still full-resolution
  (2.5–7.4 MB iPhone JPEGs at 4032×3024 or 5712×4284).
- iOS Safari paints those as black tiles when several are on screen
  at once (decoded RGBA exceeds the per-tab graphics budget).
- The structural fix only protects new uploads. The historical bug
  remains visible on every existing memory.
- A future caller could still bypass the pipeline by passing
  `{ raw: true }` for a legitimate reason. Server-side resize is the
  defense-in-depth that handles both cases.

## What's not available

**Cloudflare Image Resizing** (the `/cdn-cgi/image/...` URL syntax
and the `fetch(url, { cf: { image: {...} } })` Worker API) is a
zone-level feature on Pro+ plans. Probed against
`roadtrip-sync.jonathan-d-jackson.workers.dev` on 2026-05-24 — both
URL forms return `error code 1042` ("Image Resizing not enabled for
this zone"). `*.workers.dev` zones cannot enable Image Resizing
without moving the Worker behind a custom domain on Cloudflare Pro
($25/mo).

## What works

Three viable options, in increasing order of operational complexity:

### Option A — `@cf-wasm/photon` (recommended)

A Rust→WASM image library (Photon by Cloudflare's WASM working
group) that compiles to a single .wasm module the Worker imports.
Resize is synchronous from the script's perspective and runs inside
the Worker isolate's CPU budget.

- Bundle impact: +~700 KB (uncompressed), compresses to ~250 KB
- CPU per resize: ~100ms for a 5712×4284 → 2048×1536 JPEG re-encode
  on a typical isolate. Workers Free plan allows up to 10ms CPU per
  request — we'd need to either (a) keep the resized variant in R2
  so the resize only runs once, or (b) ensure the Workers plan is
  Standard ($5/mo, 30s CPU).
- License: MIT, actively maintained.
- API surface stable; documented.

### Option B — One-shot re-process script

Run a one-time Node script that fetches each huge photo via the
Worker, downscales in Sharp (already a devDep — sharp ^0.34.5), and
re-uploads via the same `POST /assets/photo/:id` endpoint.

- No new Worker complexity.
- Fixes existing 63 photos in one batch.
- Does NOT defend against future client-side bypasses (only Pri 1's
  structural change does that, and only for callers that don't pass
  `{ raw: true }`).
- Operational quirk: re-upload changes the R2 key (because the
  Worker generates a fresh random suffix on POST). To preserve the
  memory→photo references in D1, the script would need to either
  (a) PUT the new bytes at the existing key (requires adding a PUT
  endpoint to the Worker) or (b) re-write the photo_r2_key in the
  memories table after re-upload.

### Option C — Cloudflare Images (paid product)

Move all photo serving to `imagedelivery.net` via Cloudflare Images
($5/mo for 100K images stored + transformed). Solves resize + global
caching + format negotiation (WebP/AVIF) in one shot.

- Operational change: every photoRef.url moves to a new host.
  Backfill is required.
- Recurring cost: ~$5/mo at current volume, scales linearly.
- Best long-term answer; significant migration work for the family
  trip use case.

## Recommendation

**Option A + Option B together.** A is the durable defense; B
handles the existing photos so Helen doesn't have to wait for the
edge cache to warm. Specifically:

1. Run the one-shot re-process (Option B) once. ~15 min of script
   time, ~5 min of Worker deploy (add the PUT endpoint or path-stable
   re-upload). Helen sees existing photos render correctly on her
   iPhone the next time she opens the app.
2. Add `@cf-wasm/photon` to the Worker. The `GET /assets/:key`
   handler grows a `?w=<int>` query-parameter branch: when present,
   the Worker fetches the R2 object, runs photon's resize+JPEG
   re-encode, caches the result in R2 under `<key>_w<w>`, and serves
   it. Subsequent requests skip the resize and serve the cached
   variant directly.
3. Update photoRef.url builders to append `?w=2048` for album-grid
   renders and leave the bare URL for full-resolution lightbox.

## API contract (Option A side)

`GET /assets/:key?w=<int>` — optional resize.

- `w` must be a positive integer ≤ 4096 (clamped).
- Server caches the resized variant at R2 key `<key>_w<w>` with the
  same `private, max-age=31536000, immutable` cache headers.
- If R2 already has the cached variant, serve it directly.
- If not, fetch the original, resize via photon, PUT to R2, serve.
- Aspect ratio preserved. JPEG q=82 (slightly tighter than the
  client's 0.85 since we're producing a thumbnail).
- Content-Type: image/jpeg.
- 404 if the original doesn't exist.

## Test plan

Unit (Worker, in a future PR):
- `?w=2048` against a 5712×4284 original returns a ≤ 2048 image
- Two requests for the same `?w` hit the cached R2 variant (probe
  the timing or add a header for cache-hit/miss observability)
- `?w=0`, `?w=999999`, `?w=abc` all return 400 or clamp safely
- Original `GET /assets/:key` (no `?w=`) still serves the unchanged
  bytes

Integration:
- Real photo from D1, request `?w=512`, save response to disk, run
  through `file` — must be JPEG at ≤ 512 longest edge
- Real photo opened on Helen's iPhone with `?w=2048` appended → no
  black tile

## Open questions for Jonathan

1. **Workers plan**: A's photon path needs Standard ($5/mo) for CPU
   headroom. Are we on Free or Standard?
2. **One-shot script** (Option B): OK to run from Jonathan's laptop
   with the existing Helen + Jonathan family tokens, or should it
   be a Worker-side cron?
3. **R2 storage cost**: each cached `?w=2048` variant roughly
   triples the R2 object count. At current volume (68 photos
   → ~200 with one cached variant per common width), still well
   inside R2's free tier (10 GB stored). Fine to proceed.
4. **Cache key collision**: should the cached variant key include
   the JPEG quality so future quality changes don't serve stale
   cached bytes? Recommend yes: `<key>_w<w>_q<quality>`.
