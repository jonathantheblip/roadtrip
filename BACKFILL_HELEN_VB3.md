# Backfill — Helen's vb3-4 captures (volleyball-2026)

Ten photo memories from Helen's iPhone, captured during the May
24 volleyball tournament Sunday-night window, that landed in D1
as `kind:'photo'` rows with **no R2 upload** — the photo blobs
never made it off her device.

This file is the recovery-target ledger. Each row below is a
real capture Helen attempted. Backfill itself is a separate
task: re-attach the original photos from Helen's iPhone Camera
Roll / iCloud Photos to these memory IDs so the metadata trail
isn't lost.

## Why these still exist in D1

After [P0.2's fix](KNOWN_BUGS_HELEN_SURFACE.md) shipped 2026-05-27,
both the client (`workerSync.pushMemory`) and the worker
(`postMemory`) refuse new half-records. The eleven seed/fixture
records were soft-deleted (`deleted_at` set) the same day. These
ten remained intentionally — they're not garbage. They are real
captures whose metadata is the only trail of Helen's intent at
those moments.

Recovery surface, when it ships: a small UI in the trip view (or
Settings) lets Helen browse these stub rows, pick a date range
from her phone's photo library, and re-attach.

## The records

All ten share:
- **tripId**: `volleyball-2026`
- **stopId**: `vb3-4` (Match 1 vs Northeast 13.2 — Court 3,
  Sunday 4:00 PM, Mohegan Sun)
- **authorTraveler**: `helen`
- **visibility**: `shared`
- **kind**: `photo`
- **photoRef / photoRefs / photoExternalURLs**: none (the bug)
- **caption / text / mood / transcript**: none

The only per-row variation is the capture timestamp.

| Memory ID | createdAt (UTC) | createdAt (EDT — Helen's tz) |
|---|---|---|
| `mem_mplsxfw3_o1omm` | 2026-05-25T22:52:27.716Z | Sun May 24, 6:52:27 PM |
| `mem_mplsxihv_83ftp` | 2026-05-25T22:52:31.077Z | Sun May 24, 6:52:31 PM |
| `mem_mplsyfxj_x89xm` | 2026-05-25T22:53:14.419Z | Sun May 24, 6:53:14 PM |
| `mem_mplt0y4w_8bcix` | 2026-05-25T22:55:11.317Z | Sun May 24, 6:55:11 PM |
| `mem_mpltmnto_0wrye` | 2026-05-25T23:12:04.393Z | Sun May 24, 7:12:04 PM |
| `mem_mpltpcd1_x940t` | 2026-05-25T23:14:09.497Z | Sun May 24, 7:14:09 PM |
| `mem_mpludgca_2zlyp` | 2026-05-25T23:32:54.407Z | Sun May 24, 7:32:54 PM |
| `mem_mplugnqh_yjhma` | 2026-05-25T23:35:23.948Z | Sun May 24, 7:35:23 PM |
| `mem_mpm24z9s_946yt` | 2026-05-26T03:10:15.966Z | Sun May 24, 11:10:15 PM |
| `mem_mpm281zj_cdkb8` | 2026-05-26T03:12:39.441Z | Sun May 24, 11:12:39 PM |

Note the timestamp shape: a tight 6:52–6:55 PM EDT burst (4
captures in ~3 minutes — likely a sequence shot of a single
moment), a second cluster 7:12–7:35 PM EDT (4 captures across
23 min), then a final pair at 11:10–11:12 PM EDT. Suggests
multiple distinct capture sessions, each of which failed at
upload.

## Stop context (so the recovery flow can show what the row meant)

`vb3-4` on `volleyball-2026`:

- **time**: 4:00 PM (start)
- **name**: "Match 1 vs Northeast 13.2 — Court 3"
- **kind**: tournament
- **for**: Aurelia, Jonathan, Helen
- **note**: "Round 2 Pool 2. Best of 3."
- **address**: Court 3, Mohegan Sun, Uncasville, CT
- **lat/lng**: 41.4923, -72.0934

The 4:00 PM start time doesn't constrain captures — Helen
tagged any evening photo to vb3-4 because it was the
most-recent volleyball event. Recovery should allow the user
to optionally re-tag to a different stop within the same day
when re-attaching.

## Suggested recovery flow

For a future build (not part of this cleanup):

1. **Detect stub records**: any memory with `kind:'photo'`,
   no photoRef/photoRefs/photoExternalURLs, and the existing
   tile shows "Photo unavailable" per the P0.2 fix.
2. **Per-tile affordance**: an "attach photo" action on the
   unavailable tile that opens the device photo picker.
3. **Hint by time**: pre-filter the picker to images captured
   within ±5 min of the stub's `createdAt` (iOS Photos
   picker supports date-range selection).
4. **Save path**: the picked image flows through the existing
   AddDispatchModal upload → R2 → `pushMemory` path, but
   updates the existing `mem_*` row rather than creating a
   new one. The createdAt is preserved; new photoRef +
   photoRefs[0] populated.

## What to do if Helen's iPhone has lost the originals

If iCloud Photos didn't preserve the originals for these
moments, the metadata trail is all that's left. In that case,
the choices are:

- **Keep the stubs visible as memorials** with the
  "Photo unavailable" tile — there's evidence she tried.
- **Delete the ten stubs** by soft-deleting via the worker
  `DELETE /memories/:id` endpoint, the same way P0.2 cleanup
  removed the eleven fixtures.

The decision is Jonathan's. As of 2026-05-27, the stubs
remain.

## Related

- [KNOWN_BUGS_HELEN_SURFACE.md](KNOWN_BUGS_HELEN_SURFACE.md) — P0.2 entry has the full
  root-cause story and the prevention guards now in place.
- Production fix commit: `6bde7d1` on `main`.
