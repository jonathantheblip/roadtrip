# CHANGE ORDER — 2026-05-17
## Manual Trip Add: Repair, Rebuild, Enrich

---

## Context

A week ago Helen tried to add a trip through the manual-add form. The submit produced three duplicate Trip records and none of them open in the edit screen. Working hypothesis: submit handler has no in-flight guard and no client-generated `recordName`, so each tap created a new record; the resulting records are missing fields the edit screen needs to render.

Jonathan has partial details for the upcoming trip and will paste them in Part 5. Helen will fill in the rest through the rebuilt edit screen. We are not asking Helen to re-enter the trip a fourth time.

The output of Helen's edits must match the polish of Claude-Code-built trips when rendered in the themed views. No sparse fallbacks, no empty pitches, no missing person tags. The path doesn't dictate the finish.

---

## Governing Principles

1. **No UI without plumbing.** No toggle, label, status indicator, or affordance exists in the UI unless the backend behaves as the UI claims. (Standing rule, May 2.)
2. **Every create path produces a renderer-complete record.** Whether a trip is built through Claude Code, screenshot ingestion, manual entry, or edit — the resulting CloudKit record has every field the themed views read from. The path doesn't dictate the polish.

---

## Part 1: Diagnose (run first, report back, do not delete)

1. Open CloudKit Dashboard → container `iCloud.com.jacksonfamily.trips`. Search both Private and Public DBs for Trip records authored by Helen's user ID, created in the last 14 days. Sort by created.
2. Confirm three duplicate records. For each, report:
   - `recordName`
   - `created` and `modified` timestamps
   - `databaseScope` (Private vs Public)
   - All populated fields including typed columns (`dateRangeStart`, `dateRangeEnd`, `endCity`) and the full JSON blob payload
3. Locate the manual-add component (grep for the form: likely `AddTripForm`, `NewTripForm`, `TripCreate`, or similar). Report:
   - The submit handler code
   - Whether it generates a client-side `recordName` (UUIDv4) before save
   - Whether it has a submit-in-flight guard
   - Whether it surfaces save errors to the UI
   - Which fields it writes vs. which fields the edit screen requires to render
4. Locate the edit screen component. Report the schema it reads from.
5. **Stop here.** Report findings. Wait for Jonathan to confirm which of the three records to keep before any deletion.

---

## Part 2: Repair Helen's data (after Jonathan confirms)

1. Delete the two duplicates Jonathan flags. Use the CloudKit JS `delete` operation from within the codebase (not the Dashboard) so the change is in the audit trail.
2. Leave the kept record alone. Part 5 backfills it.

---

## Part 3: Fix manual-add

In the manual-add component's submit handler:

1. Generate `recordName` as UUIDv4 client-side. Set it on the record before save. This makes the operation idempotent — re-saving the same record updates instead of duplicating.
2. Disable the submit button on tap. Show a loading state until the CloudKit save resolves.
3. On success: confirmation state, then navigate directly to the edit screen for the new trip so Helen continues adding detail without leaving flow.
4. On error: surface the error inline. Do not silently fail. Do not navigate.
5. Use the same write function as the edit screen. One create/update function, one schema, one set of fields. If the create writes something the edit can't load, that's the bug.

---

## Part 4: Rebuild the edit screen

The edit screen exposes every field the renderer reads from, structured so Helen can fill them in incrementally, with enrichment paths that bring manual input to Claude-Code-built polish.

### Field coverage

Group by where each field appears in the themed views:

- **Trip-level:** name, date range, end city, cover photo, summary
- **Days:** ordered list, each with date, label (e.g., "Travel day," "Houston, Day 1"), and ordered Stops
- **Stops:** name, address, lat/lng, time/window, person tags, the pitch, logistics (reservation, confirmation #, phone), attached Memories/Photos

Every field visible. Nothing hidden behind an "advanced" toggle.

### Enrichment

1. **Address → lat/lng.** Geocode in the background when she enters an address. If the codebase already wires a geocoder, use it; if not, surface as a TODO in the PR — do not silently drop lat/lng, but do not block the save on it.
2. **Voice capture.** Whisper is already wired (`OPENAI_API_KEY` in `.env`). Mic button on the pitch field and on memory fields. Voice → Whisper → text → editable field.
3. **AI-assist for pitches.** "Help me write this" button on the pitch field. Sends the stop's name, address, person tags, and any raw notes to Claude API (already wired for screenshot ingestion). Returns a pitch in the voice and structure the renderer expects. Helen reviews and edits before save. This is the mechanism that brings manual input to parity.
4. **Photo upload.** Same CloudKit `Photo` record path the rest of the app uses. Drag-drop or tap-to-upload. Renders inline in the themed views.

### Draft state

A trip created through manual-add starts with `draft: true`. Drafts do not appear in the main trip list in any themed view — they live in a "Drafts" section in Helen's settings. When every renderer-required field is populated, the edit screen surfaces a "Publish" button that flips `draft: false`. Published trips render alongside Claude-Code-built ones.

This is what prevents sparse-looking trips from ever showing in the views.

---

## Part 5: Backfill the upcoming trip

Write the following into the surviving record from Part 2. Fields marked `// TBD` stay empty for Helen to complete through the edit screen.

```
TRIP NAME: Vermont — Juneteenth Weekend
DATE RANGE: 2026-06-19 to 2026-06-21 (Fri–Sun)
END CITY: // TBD — cabin location pending host confirmation
COVER PHOTO: // TBD
SUMMARY: Three nights in a Vermont cabin over Juneteenth weekend, drawn from a five-day allocation won at the Cambridge Preschool of the Arts (POTA) silent auction in February 2026. Hosts: Jessica and Yoav. Yoav: 781-530-7888. Address and check-in details pending host confirmation.

DAY 1:
  DATE: 2026-06-19
  LABEL: Drive up
  STOPS: // TBD — depends on cabin location

DAY 2:
  DATE: 2026-06-20
  LABEL: // TBD
  STOPS: // TBD

DAY 3:
  DATE: 2026-06-21
  LABEL: Drive home
  STOPS: // TBD
```

---

## Part 6: Acceptance tests (before merge)

Attach output of each to the PR:

1. **Known-good input.** Enter a complete trip through the form. Save succeeds. List shows it as draft. Edit screen loads it. Every field round-trips. Publish flips it to visible. Themed views render it at parity with a Claude-Code-built trip.
2. **Known-bad input.** Submit without required fields. Form blocks save with a clear inline error. No record created.
3. **Idempotency.** Tap submit five times rapidly. One record created. Subsequent taps after success are no-ops (button disabled).
4. **Concurrent edit.** Edit the same trip on phone and laptop at the same time. Last-write-wins is acceptable; the conflict surfaces in the UI.

---

## Part 7: Template update

Add to the change-order template:

> Every form that writes to CloudKit ships with a documented known-good and known-bad input. Both are run before merge. Output of both is attached to the PR.

This converts the standing UI/plumbing principle from a posture into a merge gate.
