# 01 · The four decisions

Four point-fixes that retire driving-specific framing where it doesn't belong and keep the
common case quiet. Each is **no new screen**. Prototype: `Roadtrip — Hangout-First Redesign.html`.

---

## 1 · The Map's progress panel adapts to how you're moving

**Problem.** The live Map's panel always read **"This drive 64%"** with a driving bar — on
*every* trip, including a beach hangout or a city day on foot. It answered a question the trip
never asked.

**Design.** One panel, **four faces**. It reads the *active travel leg* (or none) and shows
that. The drive bar is just one face, shown only when a drive is the live leg.

| Trip | Panel header | Body | What the map shows |
|---|---|---|---|
| **Stay** (cabin/beach) | `Where we are` | "At the cottage · Indian Neck · nobody's going anywhere" + family presence bubbles | Home-base marker + a few faint nearby pins. **No route line, no %, no ETA.** |
| **City** (foot/transit) | `Where we are` | "Wicker Park · you're here" → next leg: **"Next: the Met · 8-min walk · or Blue Line 4 min"** with past•here•next dots | "You are here" + close pins + short dashed hops |
| **Road** (real drive) | `This drive` | **"64%"** + bar + "1h 02m left · 38 mi · arrive 1:29 · doors 1:30" | Long route line + a marker on it. **Unchanged — today's behavior, kept.** |
| **Mixed** (international) | `Right now` | "Train to Alfama · ≈22 min · arrives 11:25" + a day strip **FLIGHT done · TRAIN now · ON FOOT later** | Multi-modal legs |

**On tap.** Stay: a presence bubble → that person's status ("Rafa · the flats"). City/Mixed: the
next-leg row → that mode's directions (see Decision 2). Road: unchanged.
**Rule.** The bar appears **only** when a drive is the active leg. Stay/city/mixed never see it.
**New screen?** No — same Map surface, adaptive panel.

---

## 2 · "Leave when?" → "Getting there" (mode-aware; goes quiet on a walk)

**Problem.** "Leave when?" always framed the trip as a car drive — "≈12 min in traffic" + a
leave-by alarm + driving navigation — even walking three blocks from the hotel to a museum.

**Design.** Rename the affordance **"Getting there."** It reads the mode, and on an easy walk it
softens or doesn't appear at all.

| Reachability | Copy | Deep-link |
|---|---|---|
| **Walk · open-ended** (no fixed time) | "**7-min walk** · from the cottage" → "Open till 5 — no need to time it." **No leave-by line at all.** | Apple Maps, **Walking** |
| **Walk · fixed time** (a 2:00 show) | "**7-min walk.** Head out around 1:50 — a gentle nudge to make the 2:00, not an alarm." (warm/paper, never red) | Walking (or Transit if faster: "Blue Line ~6 min") |
| **Transit** | "**Blue Line ~18 min** · leave by 1:35 for the 2:00." | Apple Maps, **Transit** |
| **Drive** (real road leg / far stop) | "**12 min in traffic** · leave by 12:15 to make doors 1:30." (red-tinted, the full countdown) | Waze / Apple Maps, **Driving** — *unchanged* |

**Key behavior.** For a walkable, no-fixed-time stop the leave-by line is **absent** — there's
nothing to time. The drive case is exactly today's; only the easy cases changed shape.
**New screen?** No — it's the stop's own affordance, re-shaped.

---

## 3 · Honest "On the agenda" overflow

**Problem.** The home's agenda silently showed the **first 4** events and dropped the rest. On a
6+ event city day the family couldn't tell there was more.

**Design.**
- **≤ 4 events (the common stay day):** show all. **No "+N", no expander, no chevron noise.** The
  calm case looks calm. (Optional reassurance line: "Three easy things. Nothing hidden.")
- **5+ events:** show four, then an honest row that **names the count and the hidden times**:
  **"+2 more today · 3:30, 6:30 ⌄"**.
  - **On tap → expands in place** (accordion). No navigation, no scroll loss. The row becomes
    **"Show less ⌃."**
  - Secondary "Open full day →" routes to the **existing Itinerary/Plan** scoped to today.

**New screen?** No. A dedicated full-day view is the one place a new screen tempts — *not needed*,
the Itinerary already serves it; the home agenda is a glance surface and should expand inline.

---

## 4 · Lowest-friction path to publish a simple weekend

**Problem.** Creating "Grandma's this weekend" (title + place + dates) dropped you into an editor
that **blocked Publish** until you hand-wrote (a) a one-line summary AND (b) a day with a date +
label — busywork for a deliberately-unplanned 2-night stay. Also: every manual trip carried a
single internal "part," forcing a plain stay to render with complex framing ("In [place]," a "The
plan" section).

**Design.** Keep the gate's *intent* ("renders at parity, not sparse") but **satisfy it at
creation**:

**(a) Minimum to publish + pre-fill.** Floor = title, place, dates (already typed). Creation then:
- writes the **summary** from the inputs — *"A weekend at Grandma's."* (editable, valid by default);
- **seeds the days** from the date range — Fri · Sat · Sun (empty is allowed).
→ The gate is met, shown as a green **"Ready to publish"** with checks. **Publish is live on the
create screen — one tap.** "Add plans first →" is the secondary, never the toll. Microcopy:
*"You can plan after you publish — or not at all."*

**(b) The freshly-created home is "alive at empty."** Not a blank form:
- Hero **"At Grandma's"** over a warm frame; "Tomorrow · 2 nights."
- The Weave **promise**: *"Your weekend's story will write itself here."*
- **Lately**: *"Photos will gather here as you go"* (dashed).
- Agenda: *"Nothing planned — and that's allowed."* + a ghost "Add something."
- One gentle door: "See what you could do nearby." + who's coming.

**(c) A one-place trip reads simple.** Confirmed: a single-place stay renders the simple **"At
[place]"** home — no "The plan," no day tabs, no drive frame. The lone internal "part" **no longer
forces** complex framing. **Rule:** render simple unless the trip has **≥2 places/legs** or a
**timed multi-event day**. (The NY birthday trip still earns "In New York.") See `02` for the
At/In logic.

**New screen?** No — the create screen does the work; the home is the existing home.

---

### Bonus living-heart moments (proposed, then locked — see `02`)
- **A · the page forms as you go** — the Weave starts composing from the day's first photo/voice
  note, visible on the home all day. *(Locked: keep.)*
- **B/C** folded into the living heart itself (the stay's heartbeat + a deep set of "nothing-day"
  lines). See `02` + `04`.
