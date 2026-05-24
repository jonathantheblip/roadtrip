# Claude Design spec — In-app Claude for trip planning

## What this is

A conversational interface inside the roadtrip PWA that lets Helen (and Jonathan) plan and modify trips by talking to Claude, sharing screenshots, and reviewing drafts before they become real. The product Helen asked for: "I want to do what you do, from the app."

This is not a v1. There is no v2. Whatever ships in this build is what Helen lives with.

## What ships

A persistent chat surface available from two entry points: a global FAB on the Trips index ("Plan a trip with Claude") and a chat icon within any trip detail view ("Modify this trip with Claude"). Both open the same conversation panel; in-trip mode pre-loads the trip context into Claude's working memory.

Helen can:
- Type, dictate (mic everywhere), or paste/upload images and screenshots
- Issue commands ("add Sift Bake Shop to Sunday morning") or ask for help ("I don't know what to do Saturday morning")
- Review every Claude-proposed change as a draft confirmation card before it touches data
- Hide specific trips, days, stops, or details from other family members — and set time-based or location-based reveal triggers for surprises
- Trigger a trip audit on demand or watch passive flags surface

Jonathan gets the same surface. Same hide/reveal capability.

## Three modes Claude operates in

Claude detects mode from Helen's language, with explicit overrides available:

**Execute mode** — direct, do-the-thing. "Add Sift Bake Shop to Sunday morning." "Move the Mystic Aquarium stop to 11am." "Cancel Saturday dinner." Claude drafts the change as a confirmation card with a single "Save" tap. No clarifying questions unless something's structurally impossible (e.g., she asked to add a stop to a day that doesn't exist in the trip).

**Guidance mode** — exploratory, think-with-me. "I don't know what to do Saturday morning." "What would be fun for the kids on a rainy day in Asheville?" Claude responds in conversation, surfaces 2-3 specific options with reasoning grounded in family profiles (Helen's restrictions, Aurelia's interests, Rafa's tolerances), and waits for Helen to pick or steer. Confirmation cards only fire when Helen indicates she wants to commit.

**Override phrases** — "just do it" or "stop asking" forces execute mode for the current request. "Help me think" or "what do you suggest" forces guidance mode.

The transition between modes is fluid within a single conversation. Helen can plan loosely for ten minutes, then say "okay let's lock it in" and shift to execute.

## Confirmation card pattern

Every Claude-proposed change to trip data renders as a draft confirmation card before saving. Same shape as the Share-In confirmation card that already exists in the codebase, generalized:

- Hero (if applicable): image, map preview, or icon
- Editable fields: every field Helen can adjust before saving
- "Save" / "Discard" / "Edit more" actions
- Optional "ask Claude something" inline — Helen can question the draft without dismissing it ("why did you pick 9am?")

No silent saves. Ever. The system never writes data Helen didn't approve.

## Context awareness

Claude in the app sees what Helen sees plus a layer below it:

- Active trip (if any): name, dates, all days, stops, activities, photos
- All trips Helen owns or co-owns
- Family profiles: dietary restrictions, interests, ages, tolerances
- Memory album: photos and videos from past trips, sortable by date and stop
- The reader's identity: Helen sees Helen's view; Jonathan sees Jonathan's

Claude does NOT see anything outside this app — no email, no calendar, no external accounts.

## Image and voice input

**Voice (Whisper API, already in the project):** tap mic in any text input, transcribe in place. Works in chat, in field edits, in caption boxes — anywhere Helen would otherwise type.

**Image input in chat:** Helen can paste, drop, or pick an image. Claude reads it and replies in chat conversationally — "I see a menu from Pasta & Co. Want me to add it as a dinner stop somewhere this trip?" Helen then directs the action. Claude does not silently draft data from an image; the human stays in control of what becomes structured.

Acceptable image inputs include: restaurant menus, Instagram screenshots, hotel confirmations, Google Maps screenshots, handwritten notes, business cards, signs.

## Audit and contingency

Two surfaces, both Helen-facing, both designed not to nag:

**Passive audit** — small "X things to review" pill in the trip header, only when X > 0. Items it surfaces:

- Driving times that exceed family patterns (>2.5 hours flagged for Jonathan's call, per the existing rule)
- Stops at closed or seasonally-closed venues (uses the existing Places businessStatus + regularOpeningHours data)
- Stops at venues that have closed permanently since the trip was created (uses the nightly Worker re-fetch when it ships; for now, on-trip-load re-fetch)
- Pacing flags: more than 4 active stops in one day, or activities scheduled past 9pm with Rafa present
- Weather mismatches: outdoor anchor activity scheduled on a day with rain forecast

Pill tap opens a list of flagged items. Each flag has a one-tap "ask Claude to fix this" affordance that opens a conversation with the flag pre-loaded.

**Active audit button** — "Stress-test this trip" in trip settings. Same checks as passive, run on demand, returns a full report including items that aren't flagged passively (lodging dates not contiguous, missing return travel, etc.). Helen can tap any item to discuss with Claude.

**Contingency planning** — Claude proactively raises contingencies only when conditions warrant. Specifically: when the trip's weather forecast (Open-Meteo or similar, fetched per trip date+location) suggests >40% rain probability on a day with an outdoor anchor activity, Claude raises it in conversation: "There's a real chance of rain Saturday in Asheville. Your anchor that day is Linville Falls — want me to draft an indoor alternative we can swap to if needed?"

Contingencies are NEVER pre-emptively drafted as confirmation cards. They're conversation prompts only. Helen decides whether to plan them.

**What is not flagged** unless Helen asks:
- Budgeting / cost
- Parenting choices (the family rule about not surfacing Rafa-specific risks unless Jonathan asks extends to Claude in the app)
- Optimization in general — Claude doesn't suggest "more efficient" plans unless asked

## Hide and reveal

Every level of the trip hierarchy supports a `visibility` field:

- Trip
- Day
- Stop
- Activity
- Detail (sub-stop element: time, description, address, etc.)

Visibility states per level:

- `shared` (default) — everyone with access to the trip sees it
- `hidden_from:[<user_id>...]` — explicit users can't see this layer or its children
- `surprise:{trigger}` — hidden until a trigger fires

Triggers are:

- `time:<ISO datetime>` — visible to specified users starting at that time
- `location:{lat, lng, radius_m, user_id}` — visible to the specified user when their device enters the geofence (uses existing geolocation permission)
- `manual` — Helen taps "share now" to reveal

Helen sees hide/reveal indicators throughout her view. A small lock icon on a hidden stop or activity, with a hover/long-press detail explaining "hidden from Jonathan until Saturday 8am."

UX for hiding: contextual menu on any item ("..."  → Visibility → Hide from Jonathan / Hide until [time] / Hide until I arrive at [location]). The menu is the same Helen sees on all items; hiding is just one option.

UX for reveal: a "Reveals" page in trip settings shows everything scheduled to reveal, with timestamps and triggers. Helen can edit, cancel, or trigger manually from there.

## How Claude handles asymmetric information

When Jonathan asks Claude something about a trip where Helen has hidden information, Claude:

- **Hedges and points to the app:** "According to your trip plans, Sunday's drive is about 4 hours." (true to Jonathan's view, silent about the hidden Asheville detour)
- **Doesn't lie:** if Jonathan asks "is there anything I should know about Sunday," Claude says "I'd ask Helen — she's been working on parts of this trip."
- **Doesn't volunteer asymmetric existence:** Claude never says "Helen has hidden information from you." Existence of hidden content is itself part of the surprise. Claude's response when asked about hidden content is the same response it would give if there were nothing hidden — point to what's visible, suggest checking with Helen.

The principle: Claude's response to either of you is fully consistent with what you can see in your view of the app, with appropriate hedging when something might be incomplete. No active false statements.

## Misleading vs. hidden

Hidden information is absent from a user's view. Misleading information is present but wrong on purpose. Both are supported.

A stop or activity can be marked `decoy: true` with a `real_value` field. The decoy renders to specified users; the real value renders to Helen (and other authors). Claude knows about both and treats them according to the asymmetry rules above — answering from the reader's view, hedging when the reader asks specifically about something where the real and decoy diverge.

When the surprise trigger fires, the decoy is replaced by the real value in the affected users' views, with a small one-time animation: "Helen updated this stop."

## Concurrent editing

Last-write-wins via the existing sync path. Plus a small indicator: "Helen edited this stop 2 minutes ago." If both users edit the same field within the same sync window, the later write silently overrides. If this becomes a real problem, the next build adds operational-transform merge.

## Budget cap

Anthropic API usage tracked per family. Two thresholds:

- **75% of monthly cap** — notification to Jonathan only. Helen sees nothing.
- **100% of monthly cap** — hard cutoff for Claude calls. Helen sees: "I'm out of budget for the month. Send Jonathan a message and he can raise the limit." Single tap to text Jonathan.

Cap value, threshold percentages, and notification routing are all in Settings, gated to Jonathan only (Helen doesn't see this section in her settings).

## Settings additions

New section: "Claude in the app." Gated visibility — some settings only for Jonathan.

Helen sees:
- Voice input on/off
- Image upload on/off (default on)
- "Help me think" verbosity (concise / standard / detailed)
- Default for new items: hidden or shared (default: shared)

Jonathan sees (in addition to Helen's):
- Monthly budget cap ($)
- Soft threshold % (default 75)
- Hard threshold % (default 100)
- Notification phone number for cap warnings
- Anthropic API key (display only, configured via Worker secret)

## Error handling

User-facing error policy from the existing carryover applies. Claude failures are silent and queued where possible:

- Network drop mid-conversation → message stays in input, retry on reconnect, no error
- Anthropic API timeout → "Claude's taking a moment. Try again?" with retry button
- Anthropic API error (non-timeout) → "Something went wrong on my end. Try again or rephrase?"
- Budget hit → the dedicated cap message

No technical error codes, no raw error.toString(), no stack traces in user-facing copy.

Backend traceability per the existing pattern: every Claude call logs to `app/src/lib/uploadLog.js` extended (or a new `claudeLog.js`) with full request/response/error for dev-mode review.

## Out of scope for this build

- Retroactive trip building (filling in past trips from memory) — deferred per Jonathan's call
- Cross-trip Claude reasoning ("plan a trip similar to our Asheville trip last year") — deferred until past-trip data is structured
- Email / calendar integration — never in scope; Claude in the app only sees what's in the app
- Multi-modal output: Claude responds in text + confirmation cards. No image generation, no embedded charts.
- Claude scheduling things on its own without Helen's approval — every action requires confirmation

## Architecture notes for Code

These belong in the build prompt, not the Design spec, but listed here so Design knows what's downstream:

- New Worker endpoint: `POST /claude/chat` — proxies Anthropic API with the family context loaded into system prompt. Streams responses. Maintains conversation state per (user, trip) tuple in D1.
- New Worker endpoint: `POST /enrich-activity` — runs the existing Places + Routes + hours + hero photo chain on a single activity proposed by Claude. Returns the enriched record. Called when Claude drafts an activity that needs metadata.
- New CloudKit/D1 record types: `Conversation`, `ConversationMessage`, `Draft` (proposed but unsaved changes).
- Visibility model extends every existing record type: `Trip`, `Day`, `Stop`, `Activity`, plus a new `Detail` granularity.
- Decoy model: every trip-data record gains optional `decoy` and `real_value` fields, plus a `visibility_for_user` resolver function that returns the user-appropriate view.
- Anthropic API budget tracking: per-call cost estimation, monthly aggregation in D1, threshold checks before each call.

## What I want from Design

A complete visual and interaction spec covering:

1. **Chat surface** — global FAB placement, in-trip entry, full-screen vs. bottom-sheet vs. side-panel decision, conversation rendering (text bubbles, image attachments, voice transcription UX, streaming response feel)
2. **Confirmation card system** — the generalized pattern for any Claude-proposed change. Helen will see this dozens of times in a planning session; it has to be fast and trustworthy.
3. **Hide/reveal indicators** — lock icons, "hidden until" badges, reveal animation, the "Reveals" settings page
4. **Audit pill + report** — passive pill design, report page layout, "ask Claude to fix this" handoff
5. **Settings layout** — Helen's view vs. Jonathan's gated additions
6. **Mode transitions** — visual difference (if any) between execute and guidance mode responses
7. **Voice mic UX** — recording state, transcription preview, edit-before-send
8. **Image preview in chat** — how attached images render, how Claude's read of the image gets surfaced
9. **Empty states** — first conversation in a new trip, no audits to surface, no reveals scheduled
10. **Error states** — the three user-facing error messages, queue indicator, retry affordance

Helen's aesthetic from PhotosView (linen surface, Fraunces headline, italic subtitle, photo-forward warmth) should extend here. Jonathan's view inherits but can carry his existing dark-editorial typography. Aurelia and Rafa don't get this feature in v1 — they're not asking for it and the audit/contingency logic doesn't fit their use cases.

## Constraints

- Helen is not a v1 type. Ship sanded. Every rough edge that surfaces in design review gets addressed before code touches it.
- False or stale information is the failure mode that frustrates her. Design must make confirmation cards feel trustworthy and the audit surface feel accurate.
- Helen experiences guidance-mode more often than Jonathan does. The conversation rendering should not feel sterile or transactional during guidance — it should feel like talking to someone who's thinking with her.
- The asymmetric-information feature is genuinely novel. Design should treat it as a first-class capability, not a hidden checkbox. Helen surprising the family is a use case to celebrate visually.
- Concurrent editing indicators ("Helen edited this 2 minutes ago") should feel collaborative, not alarming.

Standing by for the Design pass.
