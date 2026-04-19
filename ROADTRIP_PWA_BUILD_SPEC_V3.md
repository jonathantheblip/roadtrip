# Roadtrip PWA — Build Spec v3 Addendum

**Author:** Jonathan (via Chat Claude planning session, Sat Apr 18 2026, late night)
**Target implementer:** Claude Code
**Scope:** Three additions to Spec v2. Same non-negotiables apply (offline-capable, one-handed iPhone use, per-persona theming preserved).

## What's new in v3

1. **Feature 4 — Closure & Risk Watch** (proactive closure flagging)
2. **Feature 5 — Day Orientation Banner** (persistent "what day / where / what time zone")
3. **Feature 6 — Daily Audio Memo** (up to 60 sec voice note, attached to Feature 1's log)

## Rejected in this session (documented so they don't resurface)

Explicitly **NOT** to be built:
- Automatic photo organization from camera roll
- Gas mileage tracking
- Expense tracking
- Sharing / social features
- AI-generated trip summaries
- Weather integration
- Call-ahead checklist (most stops don't need it; don't build reminders that nag)

---

## Feature 4 — Closure & Risk Watch

### Purpose

Every trip plan contains ~10-20 "X is closed Mondays" or "Y is closed for renovation through September" footnotes. These get lost when the plan bends. The app should surface them proactively when they're about to matter, not wait for a failed re-plan.

### What this replaces

During trip planning, Chat Claude surfaces closures as one-off warnings ("Walnut Street Bridge is closed through fall 2026," "Dinner Bell is closed Mon/Tue," "Yassin's flagship is closed for construction + Sundays"). These warnings are only useful if they fire at the moment they matter — when someone's about to drive to one.

### Data model

```
RiskFlag {
  id: uuid
  subject: string (e.g., "Walnut Street Bridge, Chattanooga")
  riskType: enum ['closed-weekday', 'closed-seasonal', 'closed-renovation',
                  'hours-restricted', 'construction', 'no-longer-operating',
                  'relevant-reservation-req', 'other']
  details: string (free text — "Closed through late September 2026 for renovation")
  source: string (URL or citation)
  dateAdded: ISO8601
  appliesToDates: string[] | null (YYYY-MM-DD, null = always)
  appliesToDaysOfWeek: number[] | null (0-6, null = all days)
  appliesToTimesOfDay: {start: HH:MM, end: HH:MM} | null
  resolved: boolean (flag has been verified irrelevant or the risk passed)
  linkedStopIds: string[] (stops this flag attaches to)
}
```

### Seeding

Pre-seed with all risk flags surfaced during trip planning. Non-exhaustive starter list from chat history:

- Walnut Street Bridge Chattanooga — closed through late Sept 2026
- Dinner Bell McComb — closed Mon/Tue
- Yassin's flagship Walnut St Knoxville — closed for construction + closed Sundays
- Vicksburg NMP Visitor Center — closed Mondays (tour road + USS Cairo open daily)
- Mississippi Arts + Entertainment Experience (The MAX) — closed Monday
- Meridian Highland Park Dentzel Carousel — closed for renovation through 2026
- Sloss Furnaces Birmingham — closed Mondays
- Birmingham Civil Rights Institute — closed Sun/Mon
- Most Meridian downtown dinner spots — closed Sunday nights (Weidmann's, Harvest Grill, Fare on Eighth, Jean's, 6:01 Local, Threefoot Brewing, Brickhaus)
- Chez Fonfon, Bottega, Hot and Hot, Bettola, Highlands Bar & Grill, Carrigan's — closed Sundays (Birmingham)
- KMA Knoxville — opens 1 PM Sundays (not full-day)
- Barber Museum — 1h 20m window on Sunday before 6 PM close

### Proactive triggering

Flags fire at three layers:

**Layer 1: Evening-before surfacing.** Each day's "Today" card gets a "Heads up for tomorrow" section listing any flags that apply to tomorrow's planned stops. Fires automatically when today's card rolls over to show tomorrow.

**Layer 2: In-the-moment warnings during re-plan.** When Feature 3 is evaluating alternatives, any candidate stop with an active flag gets downgraded or rejected. Example: Feature 3 proposes Dinner Bell McComb on a Monday — Flag Watch rejects it.

**Layer 3: On-tap lookup.** Any stop in the itinerary can be tapped to see all flags currently attached to it. Shows as a small ⚠️ badge when flags exist.

### User flows

- **Add a flag:** paste URL + select stop(s) to attach + choose risk type. 15 seconds on mobile.
- **Resolve a flag:** mark resolved when you've verified it's no longer relevant. Resolved flags hide from default view but stay in the log.
- **Import during trip planning:** Chat Claude surfaces a closure → user taps "add to risk watch" from a share sheet. (V2 — don't block on this for initial ship.)

### UI

- New bottom-nav icon: ⚠️ **Risks** (small dot when unresolved flags exist)
- Risks tab: all flags, grouped by "active today," "upcoming this week," "resolved"
- Per-stop badge: tap the ⚠️ on any itinerary stop to see attached flags
- "Tomorrow's heads up" card on Today view

### Acceptance criteria

1. **Monday morning test:** given Vicksburg NMP Visitor Center in Monday's itinerary, surfaces "Visitor Center closed Mondays — tour road open" in Sunday evening's "heads up" card.
2. **Re-plan integration:** given Monday lunch re-plan in McComb, Feature 3 does not surface Dinner Bell as an alternative.
3. **Resolution flow:** flags can be marked resolved; resolved flags don't fire anymore.
4. **Offline-capable:** works without network; flag data is local.

### Out of scope for v1

- Automatic flag scraping from web
- Community-sourced flag database
- Push notifications (surface in-app only)

---

## Feature 5 — Day Orientation Banner

### Purpose

Multi-day trips blur. When the kids ask "where are we going tonight" your brain is sometimes empty. A persistent, glanceable banner at the top of every screen tells you where you are in the trip without having to navigate.

### Display

Persistent top-of-screen banner (below the status bar, above any tab content). Shows:

- **Day of week + date:** "Sunday · Apr 19"
- **Current time zone** (with small icon if it changed today): "CT" or "CT ← ET" for crossover days
- **Tonight's destination:** "→ Meridian, MS" (the city name only, not the hotel)
- **Trip day number:** "Day 3 of 8"

Tap the banner to jump to today's schedule card. Long-press to see full trip calendar.

### Display modes

- **Full banner (default):** all four elements visible. Height: ~44px.
- **Compact banner:** when scrolling down, collapses to a thin strip with just day + destination.
- **Hidden:** user setting to disable if they find it noisy. Default: on.

### Edge cases

- **Day boundary:** banner rolls over at 3 AM local time, not midnight. (Midnight rollovers confuse late arrivals — Saturday-into-Sunday 12:25 AM arrival should still read as "Saturday · Apr 18" until morning.)
- **Time zone crossing mid-day:** icon flickers briefly ("ET → CT") for ~4 hours around the crossing, then settles.
- **Arrival day:** when you've arrived at tonight's destination, banner shifts to "→ Meridian, MS · arrived" so you know the day's driving is done.

### Acceptance criteria

1. **Sunday afternoon test:** at 2 PM CT on Sunday after crossing into Alabama, banner reads "Sunday · Apr 19 · CT ← ET · → Meridian, MS · Day 3 of 8".
2. **Late night test:** at 1 AM on Sunday morning (having arrived Elizabethton Saturday at 12:25 AM), banner reads "Saturday · Apr 18" until 3 AM, then rolls to Sunday.
3. **Arrival state:** once checked into Threefoot, banner switches to "→ Meridian, MS · arrived".
4. **Persistent:** banner shows on all tabs, all persona views, doesn't require navigation to see.

### Implementation notes

- This is a dumb component — just reads state from the current itinerary + system clock + GPS (for "arrived" state). No independent data model.
- Keep the text short. Mobile screens are narrow. If destination name exceeds 14 chars, truncate with "…".

### Out of scope

- Weather integration (explicitly rejected)
- Traffic warnings (Waze/Apple Maps job)
- Social-share badge ("Day 3/8!") — this is a private tool

---

## Feature 6 — Daily Audio Memo

### Purpose

Typing doesn't capture "Rafa said the Barber motorcycles were 'bigger than Godzilla.'" Voice memos do. One per day, up to 60 seconds.

### Scope

- **One memo per day.** Not per stop. (Per-stop is too much overhead and nothing interesting happens at most stops.)
- **Up to 60 seconds.** Hard cap. Recording UI stops at 60 or user taps stop, whichever first.
- **Optional.** Days without memos are fine. No nag to record.

### Where it lives

Attached to the Actual Route Log (Feature 1). Each `ActualDay` object gets an optional `audioMemo` field.

```
ActualDay {
  // ... existing fields from Feature 1 spec
  audioMemo: {
    blob: Blob (m4a format, stored in IndexedDB)
    durationSeconds: number
    recordedAt: ISO8601
  } | null
}
```

### UI

- **Record button** on the day's Log view. Big round button, ⏺ icon, labeled "Voice memo" below.
- **Recording UI:** full-screen overlay with waveform, remaining-seconds countdown from 60, big stop button. Tappable anywhere to pause; double-tap to save.
- **Playback:** on the day's Log view, memo appears as a small audio player card with duration displayed, waveform preview, play/pause, and a delete button.

### Export

When exporting the Actual Route Log to markdown (per Feature 1 spec), audio memos export as separate `.m4a` files alongside the markdown. Filenames match the day: `saturday_apr18_actual.md` + `saturday_apr18_actual.m4a`. Markdown references the audio inline:

```markdown
[Audio memo: saturday_apr18_actual.m4a (0:47)]
```

If the markdown file is shared without the m4a, the reference is preserved but broken — that's acceptable, don't over-engineer. Audio is a bonus artifact, not mission-critical.

### Technical notes

- Use the **MediaRecorder API** (well-supported in iOS Safari 14+). Record in m4a (audio/mp4). Fall back to webm if m4a not supported, with a known compatibility note.
- Blobs stored in IndexedDB via the same wrapper used for Feature 1. Avoid localStorage — blob size will exceed quota fast.
- File naming convention for export: `{dayname}_{YYYYMMDD}_memo.m4a` (e.g., `sunday_20260419_memo.m4a`).
- **Permissions:** request microphone permission on first record, not on app load. Respect iOS permission dialog behavior.

### Acceptance criteria

1. Can record a 47-second memo in under 5 seconds of tapping (tap record, speak, tap stop).
2. Memo plays back correctly on the same device.
3. Export produces a valid m4a that plays in macOS QuickTime and Voice Memos.
4. Export markdown references the m4a by correct filename.
5. Works offline; memo saves to IndexedDB immediately, no network required.
6. Deleting a memo removes both the blob and the reference cleanly.

### Out of scope

- Transcription (don't try — will be wrong and create more work)
- Multiple memos per day
- Per-stop memos
- Audio editing / trimming
- Cloud upload

---

## Build order (revised including v3)

1. **Feature 3** (Live Re-Plan with Alternatives) — the whole point. Ship in layers A-D per v2 spec.
2. **Feature 2** (Drive-Time Calculator) — Feature 3 uses it under the hood.
3. **Feature 4** (Closure & Risk Watch) — feeds Feature 3 scoring and evening prep.
4. **Feature 5** (Day Orientation Banner) — shallow, cheap, high daily value. Ship whenever.
5. **Feature 1** (Actual Route Log) — foundation for Feature 6.
6. **Feature 6** (Audio Memo) — ships on top of Feature 1.

Features 4 and 5 are small and can slot in opportunistically. Don't block anything on them.

## Seed data notes

When Feature 1 is built, seed with `saturday_apr18_actual.md`. When Feature 4 is built, seed with the closure list in this document. When all three are live, the app has real content from day one instead of being empty.

## Non-negotiables (unchanged from v2)

- Every new feature must preserve: "every stop names who it serves and why"
- No generic recommendations. No chain restaurants in suggestions.
- Realistic drive-time defaults. No Google Maps optimism.
- No building features from the "rejected" list above.
