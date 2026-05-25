# Real-media fixture corpus

This is the test corpus referenced by `BUG_TRAP_PUNCHLIST.md` Item
A.2 and consumed by every upload-touching test. **Synthetic
Canvas-generated fixtures are not enough** — they hide the exact
class of bug the bug trap exists to catch (full-resolution iPhone
JPEG memory pressure, HEIC handling differences, h.265 video
container quirks, screen-recording metadata, EXIF orientation
edge cases).

All files in this directory are tracked via Git LFS (see the
repo-root `.gitattributes`). On a fresh clone you'll need:

```
brew install git-lfs   # one-time per machine
git lfs install        # one-time per repo
git lfs pull           # downloads the actual fixture bytes
```

## What goes here

Jonathan provides these from his own + Helen's camera rolls.
Filenames are load-bearing — the fixture loader at
`app/tests/e2e/_fixtures/realMedia.js` references them by name.
Keep the names exactly as listed; replace the bytes any time the
files need refreshing.

| Filename | Source | Approx size | Why we need it |
|---|---|---|---|
| `iphone-heic-with-gps.heic` | iPhone, HEIC capture mode, location on | ~4 MB | Real HEIC bytes with EXIF + GPS intact. Exercises HEIC decode + EXIF strip on the upload pipeline. |
| `iphone-jpeg-fullres.jpg` | iPhone, JPEG capture mode | ~5 MB | Full-resolution iPhone JPEG (4032×3024 or 5712×4284). The exact shape that black-tiled on iOS Safari before the structural fix. |
| `iphone-screenshot.png` | iPhone screenshot (volume + side button) | ~200 KB | PNG-encoded, no EXIF, transparent-color-profile metadata. Exercises the PNG branch + Share-In paste path. |
| `iphone-screen-recording.mp4` | iPhone screen recording (Control Center) | ~5–15 MB | Real iOS screen recording container — iPhones produce `.mp4` (h.264 in MP4) for screen recordings, distinct from the `.mov` files the camera produces. Exercises the video pipeline against a non-camera source. |
| `iphone-video-1080p-5s.mov` | iPhone, 1080p 30fps, ~5 seconds | ~10 MB | Standard short video. Baseline for the encode pipeline. |
| `iphone-video-4k-30s.mov` | iPhone, 4K 60fps, ~30 seconds | ~80–100 MB | Large video — exercises the post-encode size cap (25 MB), Bucket C "too long to share" error path, and the memory pressure of decoding a big input. |
| `iphone-video-portrait.mov` | iPhone, portrait orientation, ~3 seconds | ~5 MB | Portrait-rotation EXIF. Exercises the orientation-honoring branch of the encode pipeline. |
| `iphone-video-landscape.mov` | iPhone, landscape orientation, ~3 seconds | ~5 MB | Landscape-natural orientation. Pair with the portrait above to verify rotation handling. |

> The original punchlist Item A.2 listed the screen recording as
> a PNG — that's a typo (PNG is a still image format). Treating
> it as a MOV per iPhone's actual capture format. If Jonathan
> intended a still PNG of a screen-recording UI overlay, he can
> add it as `iphone-screen-recording-still.png` and we'll
> reference it separately.

Total approximate size: **~150–200 MB**. Comfortably under
GitHub's LFS storage cap; bandwidth budget only matters on fresh
clones (single-developer workflow keeps it cheap).

## Adding the files

1. AirDrop the files from your phone to your laptop
2. Rename them to match the table above exactly
3. Drop them into this directory
4. `git lfs install` (if not already)
5. `git add tests/fixtures/media/*` from repo root
6. `git status` should show them as LFS objects (the diff says
   `version https://git-lfs.github.com/spec/v1` rather than raw
   bytes). If you see binary diff content, LFS isn't catching
   them — check `.gitattributes` is at the repo root.
7. Commit + push

## What tests use these

After Item A.2 lands, the loader at
`app/tests/e2e/_fixtures/realMedia.js` exposes these as Buffers
ready to hand to Playwright's `setInputFiles`. Tests reference
them by symbolic name (`HEIC`, `JPEG_FULLRES`, etc.) so
re-naming the files only requires updating the loader.
