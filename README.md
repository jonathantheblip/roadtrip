# roadtrip

The Jackson family trip app — a PWA (`app/`, built to `docs/` for GitHub
Pages) backed by a Cloudflare Worker (`worker/`, D1 + R2).

## Calendar Pull

Pull events from the family's shared iCloud calendar into a trip as stops.
The calendar is a **source, not a destination** — the app reads from it,
never writes to it. iCloud Calendar has no usable server API, so the read
happens **on-device** via an Apple Shortcut that has native calendar
access; the Shortcut hands events to the Worker, which filters + geocodes
and returns the survivors for an in-app confirmation screen.

```
Apple Shortcut (on phone)                 Worker                         App
─────────────────────────                 ──────                         ───
Find Calendar Events (date range)
  → pre-filter (recurring, near-home)
  → POST /calendar/import ───────────────▶ re-filter (authority)
                                           geocode locations
                                           scope/match trip
  ◀─────────────────────────────────────── { matched, tripId, events }
  → open app deep link ───────────────────────────────────────────────▶ confirmation
                                                                          screen → stops
```

### Worker endpoint — `POST /calendar/import`

Extends the existing Worker (`roadtrip-sync.jonathan-d-jackson.workers.dev`);
no second deployment.

**Request body**

```jsonc
{
  "tripId": "asheville-2026",          // optional — Path 1 scopes to it
  "dateRange": { "start": "2026-10-09", "end": "2026-10-12" },
  "events": [
    { "title": "Dinner at Cúrate", "start": "2026-10-10T19:00:00",
      "end": "2026-10-10T21:00:00", "location": "Cúrate, Asheville",
      "hasRecurrence": false }
  ]
}
```

**Response**

```jsonc
{
  "matched": true,
  "tripId": "asheville-2026",
  "dateRange": { "start": "2026-10-09", "end": "2026-10-12" },
  "events": [
    { "title": "Dinner at Cúrate", "start": "...", "end": "...",
      "location": "Cúrate, Asheville",
      "address": "13 Biltmore Ave, Asheville, NC 28801",   // geocoded
      "lat": 35.5951, "lng": -82.5515 }
  ]
}
```

When no trip matches (Path 2, no `tripId`, no confirmed trip covers the
range): `{ "matched": false, "tripId": null, "events": [], "reason": "no matching trip" }`.

**Filters (applied server-side as the authority — the worker is the source
of truth on what's trip-relevant):**
1. **Date-window overlap.** Keep only events overlapping `dateRange`:
   `event.start ≤ windowEnd AND event.end ≥ windowStart`, compared at day
   granularity (so multi-day events that *started before* the window but
   span into it — a Jul 1–5 vacation vs. a Jul 3 window — are kept, and
   all-day midnight events aren't dropped by a strict comparison). The
   Shortcut's "Find Calendar Events" can't express an overlap predicate
   (its Start Date operators are only is-exactly / is-today / is-between /
   is-in-next / is-in-last), so it **over-pulls a wide window** and the
   worker does the precise scoping. Requires `start` **and** `end` per event.
2. **Recurrence.** Drop events with a recurrence rule (`hasRecurrence` /
   `recurrence` / `rrule` / `recurrenceRule`). The Shortcut can't read
   recurrence on-device, so it sends them — but standing commitments
   (karate, practice) are near-home or location-less and get dropped by
   filter 3 anyway; a rare *away-from-home* recurring event surfaces in the
   confirmation screen for a one-tap uncheck.
3. **Location away from home.** Drop events with no location, or a location
   within ~25 mi of home (Belmont, MA). Located events that can't be
   geocoded are **kept** — the confirmation screen is the safety net.

**Trip resolution:**
- `tripId` present → scope to that trip (Path 1).
- `tripId` absent → match `dateRange` to the confirmed trip with the most
  date overlap (Path 2). Drafts and dateless trips are ignored.

### Shortcut contract — the four things to wire

**1. Authorization header.** Bearer token:

```
Authorization: Bearer <CALENDAR_IMPORT_TOKEN>
```

**2. Which token / where it lives.** A **dedicated, least-privilege
`CALENDAR_IMPORT_TOKEN`** lives in the Shortcut — *not* a family token.
The Worker holds the powerful family tokens; the Shortcut never sees them.
`/calendar/import` is read-only (it filters, geocodes, and matches a trip,
but creates nothing — stop creation happens in the app), so if the
iCloud-distributed Shortcut link ever leaks, the blast radius is "someone
can submit calendar events and learn which trip covers a date range" —
they cannot read memories or mutate any data. The endpoint also still
accepts the four family tokens (so the app/tests can call it), but the
distributed Shortcut should carry only the import token.

Set it once: `cd worker && npx wrangler secret put CALENDAR_IMPORT_TOKEN`.

**3. Confirmation deep link (Shortcut → app).** After the POST, the
Shortcut base64-encodes the Worker's JSON response and opens:

```
https://jonathantheblip.github.io/roadtrip/?action=calendar-import&data=<BASE64>&person=<traveler>
```

`data` is the Worker response body, base64-encoded — **standard or
URL-safe, encoded or raw**. Apple's "Encode with base64" emits standard
base64 and the Shortcut appends it unencoded; the app restores the
`+`→space that an unencoded query produces, accepts `-`/`_`, re-pads, and
decodes UTF-8 — so you don't need to URL-encode it. `person` is optional
(defaults to the last-used traveler). The app decodes `data`, resolves the
trip from `tripId`, and renders the confirmation screen. If `data` can't
be decoded, the app shows a visible "couldn't read the calendar data"
error rather than silently dropping to the trip list.

**4. Path 1 input (app → Shortcut).** The in-app "Pull calendar events"
action (trip Settings, confirmed trips only) opens:

```
shortcuts://run-shortcut?name=Roadtrip%20Calendar%20Pull&input=text&text=<URLENCODED_JSON>
```

where the text input is JSON the Shortcut parses:

```json
{ "tripId": "asheville-2026", "dateRange": { "start": "2026-10-09", "end": "2026-10-12" } }
```

For Path 2 the Shortcut is run standalone (share sheet / Shortcuts app),
prompts Helen for a date range, and omits `tripId` so the Worker matches.

### Building the Shortcut (by hand, once)

The Shortcut itself is authored on the phone and distributed as an iCloud
link Jonathan installs once per device. Name it exactly
**`Roadtrip Calendar Pull`** (Path 1's URL refers to it by name). Steps:

1. **Accept input** — if "Shortcut Input" has text, parse it as JSON for
   `tripId` + `dateRange` (Path 1). Otherwise **Ask for Input** (a start
   and end date) (Path 2).
2. **Find Calendar Events** — over-pull a **wide** window (e.g. Start Date
   *is between* a few days before `start` and `end`). Don't try to be
   precise here: Shortcuts has no before/after operator and no overlap, so
   the worker does the exact date scoping. Don't bother filtering recurring
   or near-home either — the worker handles both.
3. **Build the payload as JSON _text_, not native events.** Loop the
   events and assemble a raw JSON string — each event a dict with
   `title`, `start`, `end`, `location` (dates via *Format Date → ISO
   8601*; `end` is required for the worker's overlap scoping). Wrap as
   `{ tripId?, dateRange, events }`. **Critical:** the request body must be
   this JSON string sent as text — if you hand Shortcuts the native
   Calendar Event objects, it coerces them to `.ics` files and the worker
   rejects the body (HTTP 400 `invalid JSON body`).
4. **Get Contents of URL** — `POST` to
   `https://roadtrip-sync.jonathan-d-jackson.workers.dev/calendar/import`
   with header `Authorization: Bearer <CALENDAR_IMPORT_TOKEN>` and the JSON
   text as the body.
5. **Base64-encode** the response, then **Open URL**
   `https://jonathantheblip.github.io/roadtrip/?action=calendar-import&data=<that>` —
   the app opens to the confirmation screen.

If the Worker returns `matched: false`, show the `reason` as an alert and
stop (nothing to confirm). All-day events (vacation blocks, school days)
arrive at midnight and become stops with no clock time — expected, not a bug.
