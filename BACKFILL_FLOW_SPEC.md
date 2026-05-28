# Photo Backfill Flow — Spec

## Purpose

Import photos from a family member's device (Camera Roll / iCloud
Photo Library) into an existing trip, matched to stops by EXIF
timestamp and GPS. Reusable across any trip, any family member,
any time — not a one-shot migration tool.

## Two immediate targets

1. **Jackson Family Drive (April 17–24, 2026):** 0 memories in D1.
   Trip record exists. Helen's photos are in iCloud Photo Library
   (synced to Jonathan's account). Full backfill — photos need to
   be imported, matched to stops, and written to R2 + D1.

2. **10 vb3-4 captures (volleyball weekend):** D1 memory records
   exist with timestamps and metadata but no R2 photo. Originals
   on Helen's phone. Re-attach flow — match by timestamp, upload
   the photo to R2, link to the existing memory record.

## Who uses this

Any family member, from their own device. The entry point lives
in trip settings (not a dev panel) so Helen, Jonathan, Aurelia,
or Rafa's device can be the source. Jonathan may also run a
laptop-side batch for bulk triage when working from iCloud sync.

---

## UX flow

### Step 1 — Trigger (in-app, per-trip)

In trip settings, a section: **"Import photos from your library"**.

Tap opens the native multi-select photo picker (`<input type="file"
accept="image/*" multiple>` on iOS triggers the Photo Library
picker). No date-range filter at the OS level — the app handles
filtering after selection.

Alternatively, for Jonathan on laptop: a drag-and-drop zone that
accepts a batch of files exported from iCloud / Photos.app.

### Step 2 — EXIF extraction (client-side)

For each selected photo, extract:

- **Timestamp:** `DateTimeOriginal` (EXIF tag 36867). Fall back to
  `CreateDate` (tag 36868), then `ModifyDate` (tag 306), then file
  `lastModified`. Timezone: `OffsetTimeOriginal` (tag 36881) if
  present; otherwise infer from GPS coordinates → timezone lookup.
- **GPS coordinates:** `GPSLatitude` + `GPSLongitude` (tags 2/4)
  with `GPSLatitudeRef` / `GPSLongitudeRef` for sign.
- **Orientation:** EXIF orientation tag, preserved through upload
  pipeline (already handled by existing `saveAsset`).

Library: `exifr` (already a known quantity in the JS ecosystem,
lightweight, runs in browser). No server round-trip for metadata.

### Step 3 — Date-range filter

Discard any photo whose timestamp falls outside the trip's date
range (start date 00:00 local → end date 23:59 local). This is
the coarse filter that prevents the entire Camera Roll from
landing in a trip.

Display to the user: **"N photos from [trip dates]"** with a
count. Photos outside the range are silently excluded — no error,
no explanation needed.

### Step 4 — Stop matching (client-side)

Each trip day has an ordered list of stops, each with:
- A time (start time of the stop)
- An address (geocoded to coordinates at trip-build time)

**Matching algorithm:**

For each photo, in order of specificity:

1. **GPS + time match:** Photo GPS is within 500m of a stop's
   coordinates AND photo timestamp is within the stop's time
   window. Time window = stop start time → next stop's start time
   (or end of day for the last stop). This is the high-confidence
   match.

2. **Time-only match (no GPS or GPS too far from any stop):**
   Photo timestamp falls within a stop's time window. Assigned to
   that stop with lower confidence. Covers indoor photos where GPS
   is absent or inaccurate.

3. **Interstitial (between stops):** Photo timestamp falls between
   two stops AND GPS (if present) doesn't match either stop.
   Tagged as interstitial with the bounding stop pair. Gets its
   own bucket in triage titled "From [Stop A] to [Stop B]".
   These are driving shots, rest-stop photos, scenery.

   **Deviation cluster:** If 3+ interstitial photos share GPS
   within 500m of each other AND are >2km from the route line,
   the cluster is treated as an unplanned stop. Reverse-geocode
   the cluster centroid to get a real place name (e.g.,
   "Vicksburg, Mississippi"). The bucket title becomes that
   name instead of "From X to Y".

4. **Unmatched:** Photo has a timestamp within the trip range but
   doesn't fit any stop window. Assigned to the day with no stop
   association. Rare — usually means the trip data has gaps.

**Output:** A sorted list of photos, each tagged with:
- `day` (which trip day)
- `stopId` (matched stop, or null for interstitial/unmatched)
- `matchType` ("gps+time" | "time" | "interstitial" | "deviation" | "unmatched")
- `interstitialBetween` ([stopA_id, stopB_id] if interstitial)
- `deviationName` (reverse-geocoded place name if deviation cluster)

### Step 5 — Triage UI

The user sees their photos organized by day and stop, with the
matching already done. The UI:

- **Day tabs** across the top (matches the trip view pattern).
- **Stop groups** within each day, with the stop name as header.
- **Interstitial buckets** between stop groups, titled "From X
  to Y". If a deviation cluster was detected, the title is the
  resolved place name instead.
- **Each photo** is a thumbnail with a checkbox, pre-checked.
  The user unchecks any they don't want uploaded. Photos
  detected as already-imported show unchecked and slightly
  greyed with an "already imported" label — re-checkable if
  the user wants to re-import.
- **Unmatched photos** (if any) appear at the bottom of the day
  with "Not matched to a stop — tap to assign" affordance.

This is the light-triage surface. Helen doesn't want every photo
uploaded — she picks the good ones by unchecking the rest. Default
is all-selected because most trip photos are keepers; the work is
removing the few she doesn't want.

Bottom of the screen: **"Upload N photos"** button with the count
updating as checkboxes change.

### Step 6 — Upload

Checked photos upload through the existing pipeline:
- Client-side downscale via `saveAsset` (preserves EXIF orientation)
- R2 upload via worker POST /assets
- D1 memory record created with:
  - `kind: "photo"`
  - `tripId` from the current trip
  - `stopId` from the matching step
  - `capturedAt` from EXIF timestamp (not upload time)
  - `author` from the current user profile
  - `photoRefs[]` pointing to the R2 key
- Background Sync with Page Visibility fallback (existing iOS
  pattern)

Progress: a simple progress bar or "N of M uploaded" counter.
Upload failures queue for retry via existing Background Sync.

### Step 7 — Confirmation

Upload complete → the trip view now shows the imported photos in
their matched stops. Hero image populates automatically via the
existing `heroStopId` fallback. The user is returned to the trip
view.

---

## Re-attach flow (for the 10 vb3-4 records)

These records already exist in D1 with timestamps but no R2 photo.
The backfill flow handles this as a special case:

1. During Step 4, if a photo's EXIF timestamp matches an existing
   memory record's `capturedAt` within a tolerance (±60 seconds),
   the system proposes a re-attach instead of a new record.
2. In the triage UI, re-attach candidates show the existing
   caption/metadata alongside the matched photo: "This photo
   matches an existing memory — attach?"
3. On upload, the photo goes to R2 and the existing D1 record is
   updated with the new `photoRefs[]` — no duplicate memory created.

---

## Geocoding dependency

Stop matching requires each stop to have coordinates. Current state:
stops carry addresses but may not all be geocoded. Two options:

**Option A (preferred):** Geocode at trip-build time. When a trip is
created or edited, each stop's address is geocoded and coordinates
are stored. This is a one-time cost that benefits multiple features
(map view, distance calculations, this backfill flow).

**Option B (fallback):** Geocode on-demand during the backfill flow.
When the triage UI loads, any stop without coordinates gets geocoded
via the Google Maps Geocoding API. Results cached in D1.

If neither has been built when the first backfill runs, the flow
degrades gracefully to time-only matching (Step 4, option 2) — still
useful, just lower precision.

---

## Laptop batch mode (Jonathan's workflow)

For bulk triage from a Mac with iCloud Photo Library sync:

1. Open Photos.app, select the date range, export originals to a
   folder.
2. Open the PWA on the laptop, navigate to the trip, open the
   import flow.
3. Drag-and-drop the folder into the import zone (or use the file
   picker).
4. Same EXIF extraction → matching → triage → upload flow.

This is the same code path as the phone flow — the only difference
is the input mechanism (drag-and-drop vs. photo picker).

---

## Scope boundaries

**In scope:**
- Photo import from device/iCloud into existing trips
- EXIF-based stop matching with interstitial handling
- Light triage UI with per-photo opt-out
- Re-attach for existing metadata-only records
- Reusable across any trip, any family member

**Out of scope (future):**
- Video import (different pipeline, larger files)
- Automatic trip creation from a photo dump
- Shared Album ingestion (CloudKit is retired; if Apple introduces
  a successor, revisit)
- Cross-device push ("Jonathan imports on laptop, photos appear on
  Helen's phone") — this already works via the existing sync layer;
  once photos are in R2 + D1, every device sees them

---

## Build order

1. **EXIF extraction + date filter** — client-side, no UI yet.
   Validate against a batch of real photos from the April trip.
2. **Stop matching algorithm** — client-side, unit-testable.
   Input: list of photos with EXIF data + list of stops with
   times and coordinates. Output: matched list.
3. **Triage UI** — the day/stop/photo grid with checkboxes.
   Static first (hardcoded test data), then wired to real extraction.
4. **Upload integration** — wire to existing `saveAsset` + worker
   POST pipeline.
5. **Re-attach logic** — the vb3-4 special case.
6. **Settings entry point** — the "Import photos" section in trip
   settings, accessible to all family members.
7. **Geocoding** — Option A or B, depending on what's already built.

Each step is independently testable. Steps 1–4 are the critical
path. Step 5 is a small addition once 1–4 work. Steps 6–7 are
wiring.

---

## Resolved decisions

1. **Caption policy:** Imported photos arrive captionless. Helen
   (or any family member) can add captions after import. No
   auto-generated captions from stop names or locations.

2. **Duplicate detection:** Both. Photos whose EXIF timestamp
   matches an already-imported memory (within ±60s tolerance)
   are detected and shown in triage **unchecked** (greyed slightly,
   labeled "already imported"). This way a hasty first pass
   doesn't lock Helen out — she can re-check if she skipped
   one she actually wanted, but duplicates don't silently
   multiply.

3. **Interstitial grouping:** Interstitials get their own bucket
   between each pair of stops within the day. Each bucket is
   titled **"From [Stop A] to [Stop B]"** — framing these as
   photos taken in transit from one stop to the next. A day
   with 4 stops might have up to 3 interstitial buckets between
   them, plus one before the first stop and one after the last.

   **Deviation detection:** When a cluster of interstitial photos
   share GPS coordinates that are far from the planned route
   (>2km from the line between the two stops), the system
   treats this as an unplanned stop. Instead of "From X to Y",
   it reverse-geocodes the cluster centroid and titles the
   bucket with the resolved location name (e.g., "Vicksburg,
   Mississippi" or "Buc-ee's, Baytown"). This handles the
   Jackson Family Drive case where the family deviated from
   the plan — the photos land in a named place, not a vague
   transit label.

   **Cluster threshold:** 3+ photos within 500m of each other
   and >2km from the route line triggers deviation detection.
   Fewer photos stay in the "From X to Y" bucket.
