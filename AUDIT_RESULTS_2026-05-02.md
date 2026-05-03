# UI / Plumbing Integrity Audit — 2026-05-02

Performed against the change order of the same date. Audited every UI
element flagged in the change order's checklist plus a sweep of the rest
of `app/src/` for stubs, hardcoded fakes, and "Pass 2" placeholders.

Governing principle: **the app should only promise what it can do, never
what it can't**.

| UI Element | Screen | What It Promises | What It Does | Action Taken |
|---|---|---|---|---|
| Sharing toggle ("private to you" ↔ "shared with family") | StopDetail composer (all travelers) | Shared records visible to other family members; private records visible only to author | **Fixed today.** Was writing every shared record to the user's own `sharedCloudDatabase`, which CloudKit never replicates. Now writes shared records to `privateCloudDatabase` Family zone (owner) with a CKShare-based read path on the recipient side. | Fixed in [cloudKitSync.js](app/src/lib/cloudKitSync.js) |
| Voice / microphone button | ThreadedMemories composer | Hold to record; transcript appears once Whisper returns | Records audio → IDB blob → Memory(kind=voice) → if `VITE_WHISPER_PROXY` set, Whisper transcribes and `transcriptionStatus` flips to `done`/`failed`; else `skipped` and the audio still plays. **Honest about its capability** in all states. | Keep |
| Camera button | ThreadedMemories composer | Pick up to 6 photos, captions, "Save N to thread" | Real `<input type="file" multiple>` → IDB asset store → `photoRefs[]` on Memory → CKAsset upload via `pushMemory`. Numbered selection badges + remove + caption + "Save N to thread" all work. | Keep (built 2026-05-01, sync fixed today) |
| Camera button | Aurelia PostcardComposer | Single photo + caption + mood + tag → postcard memory | Real file picker → IDB → `photoRef` → `pushMemory`. Works. | Keep |
| Delete (trash icon) | ThreadedMemories own messages | Tapping deletes the memory for everyone | Calls `deleteMemory` → `deleteRemote` which routes to the same database scope as the original write (today's fix). Local cache + remote both removed. | Keep (verified by today's sync refactor) |
| Day selector (D1 / D2 / D3) | JonathanView, RafaView, HelenView | Tabs swap which day's content the page reads from | Wired to real `trip.days[].n`. No hardcoded day data. | Keep |
| Family member tabs (Jonathan/Helen/Aurelia/Rafa) | Bottom Switcher | Switches active traveler, themes, default day, view | Real state in App.jsx, persisted to URL/cookie/localStorage. Each tab routes to its own view component. | Keep |
| "Add to the thread" text input | ThreadedMemories | Submitting saves a Memory others can see when shared | `saveMemory(kind: 'text')` → `scheduleMirror` → CloudKit (private or shared zone per visibility). | Keep |
| Photo count labels (e.g. "3 photos", count chip on preview) | HelenView preview tile, PhotoBubble album footer | Reflects the actual number of photos in the memory | Counts come from `mem.photoRefs.length` (or `[mem.photoRef]` for legacy single). Not hardcoded. | Keep |
| Navigation links (Open in Maps / Waze) | StopDetail, anywhere `mapsLink` is used | Opens the active traveler's preferred app at the stop's real address | `mapsLink(stop, traveler)` builds Apple Maps or Waze URL from `stop.address` / `stop.lat,lng` per `TRAVELERS[traveler].maps`. Real addresses, real coordinates, real preferences. | Keep |
| FlightAware status widget | StopDetail (flight stops), HelenView, JonathanView | Live flight status when available; clear "no live feed yet" + working external link otherwise | When `VITE_FLIGHT_API` proxy is set, fetches AeroAPI v4 and renders status. When not set (current state), `getFlightStatus` returns null → label reads `SCHEDULED` from the stop's own data, the status text says "no live feed yet" and a working `flightaware.com` link is shown. **Honest in both states.** | Keep — surfaces honest fallback. Wire AeroAPI proxy to make it live. |
| JonathanView ticker flight status (top strip) | JonathanView masthead | A live-status sticker for the inbound flight | **Was lying.** Showed `${flightNumber} · ON TIME` regardless of real status. Now shows `${flightNumber} · ${scheduled time}` — only what we know for sure. | Fixed in [JonathanView.jsx:96](app/src/views/JonathanView.jsx:96) |
| iCloud sync state pill ("Signed in / Signed out / Error") | Settings → iCloud sync | Reflects real CloudKit auth state | `useCloudKitAuth` hook polls `setUpAuth` and exposes `state ∈ {idle, loading, signedIn, signedOut, error, unconfigured}`. UI shows the matching label, error text, and sign-in button. | Keep |
| "Pull memories" / "Push memories" / "Seed trips to iCloud" | Settings | Sync actions against CloudKit | All three call into `cloudKitSync` and surface success/failure copy. | Keep (Push memories added today for backfill) |
| "Invite family" button | Settings → Family sharing | Open Apple's hosted share UI; family members get a tappable invite link | New today. Calls `db.shareWithUI` on the Family zone in `privateCloudDatabase`. Apple's hosted UI handles invitations + the share URL. | Built today |
| Share-acceptance via URL (`?ck_shareurl=…`) | App.jsx cold-load handler | A family member tapping the invite URL is auto-joined to the share | New today. Detects param, calls `container.acceptShares([{shareURL}])`, pulls remote, merges, strips param. | Built today |
| Aurelia view "HER STUFF" subtitle | AureliaView header | Identity framing only; no "private journal" claim | Cosmetic copy. PostcardComposer hardcodes `visibility='shared'` on save, which matches the postcard metaphor (something you send the family). No private-journal promise being broken. | Keep |
| Aurelia postcard tag step copy ("they get a notification") | PostcardComposer step 3 | Tagging a family member sends them a notification | **Was lying.** No push-notification system exists in this PWA. Reworded to "their avatar shows on the postcard in the family thread" (which is what actually happens). | Fixed in [PostcardComposer.jsx:309](app/src/components/PostcardComposer.jsx:309) |
| JonathanView "Queue" section (Bathroom / Fast food / Outside / Emergency) | JonathanView | "Quick logs from anywhere" — tap a category to log briefly | **Was lying.** Each button just opened Settings. Now each tap saves a `kind: 'text'` Memory like `"Bathroom — stopped"` against the day's first stop, mirrors to CloudKit, and shows a `✓ logged to thread` confirmation. | Fixed in [JonathanView.jsx](app/src/views/JonathanView.jsx) |
| Sharing of in-app photo memories vs. iCloud Shared Album link in Trip Settings | Settings → Shared album | Two parallel surfaces. The link opens the iCloud Shared Album natively; the in-app photo memories live separately in CloudKit. | Both work as labeled (the link only opens the album; the in-app memories sync via CloudKit per the today fix). They don't talk to each other and neither claims to. | Keep — separate surfaces, no overlap claim |
| Settings "Coming next" list (screenshot ingestion / Gmail / FlightAware live) | Settings bottom | Roadmap copy framed as "coming next" | None of those three are wired. Per the change order's "no UI without working plumbing" rule, this section was a roadmap, not plumbing. | **Removed** from Settings.jsx |
| ThreadedMemories file header comment | n/a (source comment) | Said "Photo composer is a Pass-2 stub" | Stale. The composer is real now. | Updated comment |
| `RoadSearch.jsx`, `JonathanQueue.jsx`, `RiskWatch.jsx`, `EmergencyFab.jsx`, `ActualLog.jsx`, `ItineraryView.jsx`, `MondayWeatherCard.jsx`, `useTheme.js` | (not rendered) | n/a — these components exist in `app/src/` but are not imported or rendered by any active view | No user impact today. They're dead code from earlier passes. | Out of scope for this audit — flag for a separate cleanup pass |

## Items deliberately not removed

The change order says "if the plumbing cannot be built now: remove the UI element entirely." I deferred or rebuilt rather than removed in two cases worth flagging for confirmation:

1. **FlightAware widget** — kept because it degrades honestly: with no proxy it shows the scheduled time, says "no live feed yet," and links to FlightAware's public live page. That *is* working plumbing (the link is real; the schedule is real). Removing would lose a useful link. Confirm if you'd rather remove anyway.
2. **`sharedAlbumURL` field on Trip** — kept because the link genuinely opens the iCloud Shared Album when set. Settings step-by-step instructions for paste-the-URL are honest. Confirm if you'd rather pull this once the in-app photo sync feels complete enough.

## Net change to "what does the app promise"

After this audit:
- Every visible affordance on every screen does what it says, or honestly reports its state ("no live feed yet").
- Three lies removed (queue buttons, postcard tag copy, Jonathan flight ticker).
- One roadmap section removed (Settings "Coming next").
- Two new working surfaces added (Invite family, share acceptance).
- One sync bug fixed at the foundation (shared records now actually reach other family members).
