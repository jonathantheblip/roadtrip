# Trip Reconciliation & Archiving — Spec

## Purpose

A trip's plan and what actually happened diverge. The Jackson Family
Drive deviated from its route. Reconciliation is where the planned
trip becomes a true record: stops that happened get confirmed, stops
that didn't get marked, places added on the fly get captured, and the
photos are the ground truth that drives the whole pass.

When reconciliation is done, the trip gets an "archived" label and
moves into a date-grouped archive. It is NOT locked — Helen can keep
adding to an archived trip later.

## Core design move: reconciliation folds into backfill triage

These are the same surface. The photo backfill flow already walks the
trip day by day, matching photos to stops and surfacing deviation
clusters as named places. Reconciliation adds the "what actually
happened" layer to that same screen. Helen imports her April photos,
sees them sorted onto stops and into deviation buckets, and as she
reviews them she's also confirming the record.

The photos are the evidence. A stop with photos clearly happened. A
deviation cluster in Vicksburg means the family stopped in Vicksburg.
Walking the photos day by day IS the reconciliation.

---

## The reconciliation layer (added to backfill triage)

The photos build the shape of the trip automatically. Helen edits a
proposal; she does not assemble the record by hand. When the matcher
runs over her imported photos, it produces a reconciled draft of what
happened, and the triage view presents that draft for refinement.

### Automatic classification from metadata

The matcher (already built in BACKFILL_FLOW_SPEC) tags each photo by
where and when it was taken. Reconciliation reads those tags and
proposes structure with no manual input:

- **Photos clustered at a planned stop's location and time** →
  that stop is auto-confirmed as **happened**. No action needed.
- **Photos clustered at a place far from the route** (the deviation
  case) → auto-proposed as a **new stop**, reverse-geocoded to a
  place name, dropped into the day at the right time slot with the
  photos attached. It appears in the draft already built, not as a
  "want to add this?" prompt.
- **Photos with highway / roadside / gas-station signature** —
  metadata on a road, between stops, brief dwell, no tight cluster →
  classified as **interstitial**, grouped into the "From X to Y"
  bucket. These are the drive shots; they don't become stops.
- **Planned stop with no photos near it** → proposed as
  **happened, no photos** (still in the record) — Helen can flip it
  to didn't-happen if it was skipped.

So when Helen opens the reconciliation view after import, the day is
already shaped: confirmed stops, new stops from clusters, interstitials
bucketed, gaps flagged. The work in front of her is refinement, not
construction.

### What "highway / roadside / gas-station signature" means

The interstitial-vs-stop call is made on the photo cluster's profile:

- **Becomes a stop:** 3+ photos within 500m of each other, dwell
  implied by timestamps spanning more than ~20 minutes, off the
  direct route line. Someone got out and spent time there.
- **Stays interstitial:** photos spread along the route line, short
  or no dwell, or singletons between stops. Taken from the car or at
  a quick gas/rest stop. The reverse-geocode for these is coarse
  (road name, town passed through) and they stay in the "From X to Y"
  bucket rather than getting promoted.

The thresholds are tunable — first real run on the April photos will
show whether 500m / 20min is right, and we adjust from there.

### Helen's edits on top of the proposal

Once the draft is built, Helen refines:

- **Rename** an auto-created stop (raw geocode "Warren County, MS" →
  "Vicksburg Military Park")
- **Promote** an interstitial to a stop if the auto-call was wrong
  (it was actually a real stop, not a drive-by)
- **Demote** an auto-created stop back to interstitial if it over-fired
- **Flip** a no-photos stop between happened and didn't-happen
  (didn't-happen removes it from the record)
- **Merge** two clusters the matcher split, or split one it merged
- **Edit** name, time, description on any stop inline

The default is that the proposal is correct. Editing is the exception,
not the workflow. A good import means Helen mostly confirms and renames
a couple of things.

### Per-stop state (the underlying field)

Each stop carries a state, set automatically and overridable:

- **happened** — auto-set when photos cluster at the stop
- **happened_no_photos** — auto-set for planned stops with no photo
  match; Helen confirms or flips to didn't-happen
- **didnt_happen** — Helen's call; a planned stop that was skipped.
  Marking a stop didn't-happen removes it from the trip record. It's
  not greyed or kept as a not-visited marker — it's gone. (The plan
  it came from still exists in history if you ever build plan-vs-reality,
  via the trip's original payload, but the reconciled record doesn't
  carry skipped stops.)
- **auto_added** — a stop created from a photo cluster (carries
  `addedDuringReconciliation: true`)

---

## Marking a trip archived

When Helen is done reconciling, a "Mark as archived" action at the
trip level:

1. Sets the trip's status to `archived`
2. The trip moves into the date-grouped archive section of the trip
   list (see below)
3. The trip is NOT locked — it remains fully editable. Helen can
   reopen reconciliation, add stops, import more photos, edit
   anything. "Archived" is a label and a sort location, not a freeze.

There's no required completeness check. Helen archives when she
decides the record is good enough. A trip with some stops still
marked "happened, no photos" can still be archived — life isn't
fully documented and that's fine.

---

## Archive organization (trip list)

The trip list gets a structure:

- **Active / Planning** trips at the top (current behavior)
- **Archive** below, grouped by **year → month**

Example:
```
Planning
  Asheville Long Weekend          Oct 2026

Archive
  2026
    May
      Fun @ the Sun (volleyball)
    April
      The Jackson Family Drive
```

Grouping is derived from each trip's `dateRangeStart`. Newest first
within the archive. Month and year are section headers, not tappable
filters (yet).

**Deferred (noted, not built now):** a scrubber / selection tool to
scrub through the archive by date. When the archive has enough trips
to need it, add a timeline scrubber or a year/month picker. For now,
the year→month grouping is the navigation.

---

## What reconciliation writes to the data

For each stop touched during reconciliation:
- `state`: "happened" | "happened_no_photos" | "didnt_happen" | "auto_added"
- attached photos (already handled by backfill)
- any edits to name, time, description Helen made inline

For auto-created stops (from photo clusters) and any manual additions:
- a new stop record in the day, with `addedDuringReconciliation: true`
  so the record knows this wasn't in the original plan (useful later
  if you ever want to show plan-vs-reality)

For the trip:
- `status`: "archived"
- `archivedAt`: timestamp

---

## Scope boundaries

**In scope:**
- Auto-classification from photo metadata: confirm planned stops,
  create stops from clusters, bucket interstitials, flag no-photo gaps
- The stop/interstitial decision logic (cluster dwell + distance from
  route)
- Per-stop state field (happened / happened_no_photos / didnt_happen /
  auto_added), set automatically, Helen-overridable
- Helen's refinement edits: rename, promote, demote, flip, merge,
  split, inline edit
- "Mark as archived" trip-level action (soft label, no lock)
- Archive section in trip list, grouped year → month
- archivedAt timestamp

**Out of scope (deferred):**
- Archive scrubber / timeline selection tool (build when the archive
  is big enough to need it)
- Plan-vs-reality comparison view (the addedDuringReconciliation flag
  is laid down now so this is possible later, but the view isn't built)
- Locking archived trips (explicitly NOT doing this — trips stay editable)
- Auto-archiving based on trip end date (Helen decides when a trip is
  archived, not the calendar)

**Dependencies:**
- BACKFILL_FLOW_SPEC.md — reconciliation lives in the triage surface
  that spec defines, and reads the matcher's photo tags. Backfill must
  ship first (it has — flow is live).
- Existing trip status field (planning / active / archived already
  exists in the data model and StatusTag renders it)

---

## Build order

1. **Auto-classification pass** — when the matcher runs on imported
   photos, produce the reconciled draft: confirm planned stops with
   photo clusters, create auto_added stops from off-route clusters
   (with the stop-vs-interstitial dwell/distance logic), bucket
   interstitials, flag no-photo stops. This is the core — the draft
   must arrive pre-built. Unit-test the classification logic against
   mock photo sets.

2. **Per-stop state rendering** — show each stop's auto-set state in
   the triage view with the override control. State persists to D1.

3. **Refinement controls** — rename, promote interstitial→stop, demote
   stop→interstitial, flip happened/didn't, merge, split, inline edit.

4. **Archive grouping in trip list** — Planning/Active at top, Archive
   below grouped year → month from dateRangeStart.

5. **Mark as archived action** — trip-level button, sets status +
   archivedAt, moves into archive. No lock.

6. **Integration test** — import photos for a trip with a deviation,
   verify the draft auto-builds (planned stops confirmed, deviation
   promoted to a named stop, interstitials bucketed, no-photo stop
   flagged), refine one thing, archive, verify it lands in the archive
   grouped correctly and stays editable.

Step 1 is the heart of it — the automation that builds the shape. If
the draft arrives mostly right, everything else is light. Steps 2-3
are the refinement surface. Steps 4-5 are the archive. Step 6 verifies
the Jackson-trip motion end to end.

---

## The Jackson Family Drive as first use case

This is the trip reconciliation exists for. Once Helen imports the
April photos:
- Planned stops with photos → confirmed happened
- The route deviations (the family went off-plan) → surface as named
  deviation clusters, promoted to real stops
- The trip gets marked archived, lands in Archive → 2026 → April
- It's the first trip that's a true record rather than a plan

Reconciliation and the April backfill are one motion: import the
photos, walk them day by day, the trip becomes real, archive it.
