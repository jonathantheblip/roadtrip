# 03 · Scaling the home (weekend → 3-city international)

**Direction A — one living heart that flexes.** Not a second app for complex trips. Complexity is
a set of modules that mount **only on a real signal** (explicit parts · a flight · a
timezone/currency delta). Prototype: `Roadtrip — Scaling the Home.html`.

Scenarios it's designed against: **A** Grandma's weekend (the core) · **B** lake house (the
typical trip) · **C** city weekend + a flight · **D** 2 weeks in Italy, 3 cities · **E** a
different party (just the parents; a grandparent joining one leg).

---

## The spectrum (the proof)
The *same* component, growing. Nothing below replaces the simple home.

| Scenario | Hero | What's added | What stays off |
|---|---|---|---|
| **A · weekend** | At Grandma's | — (alive-at-empty) | rail, flight, context, timezone |
| **B · lake** | At the lake house | Weave "forming," Lately photos, 2 easy events | rail, flight, context, timezone |
| **C · city + flight** | At the loft | a **Next-Up flight** ("you landed · UA 1287") | rail, context (domestic) |
| **D · Italy, 3 cities** | In Florence | rail + "Part 2 of 3," context, leg-scoped We-could, parts agenda, timezone | — (everything on) |

A flight ≠ a composite trip (C proves it): one travel leg into one base still renders the simple
home.

---

## 1 · Orientation — "where am I in this trip?"
A composite trip needs **more** in-the-moment orientation than a weekend, so it lives at the **top
of the same home**.

- **Journey rail** (slim, above the hero): `Part 2 of 3 · Italy` + the legs as a row —
  **Rome ✓ · Florence ● · Venice** (done / now / upcoming) — with the current leg's local time.
  **Tap a leg → that leg in The Plan** (existing surface; no new screen).
- **Hero becomes per-leg:** "In Florence," eyebrow "FLORENCE · LEG 2." The hero photo, the
  sunrise/sunset cues, and the We-could tray all **re-anchor to the current city** (uses the
  per-leg anchor already built).

## 2 · Per-leg context — what changes, where it surfaces (and stays hidden)
Which matter, and when:

| Signal | Surfaces | Stays hidden when |
|---|---|---|
| **Local time** | Always (rail + "now"), when the leg's zone ≠ the viewer's | domestic / same zone |
| **Weather** | The leg's current weather (hero + We-could) | n/a (always the current city's) |
| **"You changed timezones"** | The **arrival moment** (once, on entering a new zone) | no zone change |
| **Currency** | A quiet reference in the context card + prices in We-could (€ with a "$ hint") | same currency |
| **Language** | A light cue ("Buongiorno") + nearby search adapts to locale | same language |

- **Arrival moment** (kept, liked): a once-per-city card on first open in a new country/zone —
  *"Welcome to Italy. Clocks +6 · it's 3:15 PM here. Euro (€) · €1 ≈ $1.08. Italian ·
  'Buongiorno.'"* Only what actually changed; then it's gone. A domestic hop shows nothing.
- **Context card** then folds to a quiet rail line after day one — it never nags.
- **Hard gate:** the entire context module is absent unless a real delta exists → the Grandma's
  weekend never sees a word of it.

## 3 · Timezone honesty (the "confidently-wrong clock" fix)
There was **no timezone concept** — "now," countdowns, and "today" used the phone's clock, wrong
when checked from home or by someone not-yet-arrived.

- Every **"now," countdown, and "today" on a trip is the current leg's local time.**
- A **remote viewer** (a parent at home, or pre-arrival) sees **both**:
  *"4:20 PM in Florence · 10:20 AM where you are."* Leg time leads; home time is faint.
- **Never** a single misleading clock.

## 4 · The live home, scoped to the current leg
A composite trip was **gated out** of the live home (read as a "route"), losing who's-around and
We-could exactly when it needed them. Fix: **full live home on composite trips, scoped.**

- **"We could… *in [current city]*"** — the tray header + every suggestion flip Rome → Florence on
  arrival; travel times measure from **this** leg's lodging, prices in local currency.
- **Who's-around** works the same and gains cross-leg value: "Aurelia's still in Rome,"
  "Dad lands 2:10."
- **Tabs unchanged:** WE COULD · NOW · PHOTOS · LOOK BACK — composite trips simply stop being
  excluded from the shell.

## 5 · Multi-leg flights (honest "+1 day")
Only the first flight was modeled, on the phone's clock; a connection or an overnight that lands
the next calendar day couldn't be told honestly.

- Flights become **legs with their own zones.** Each segment shows **its own local time + airport
  zone**; a **"+1 day"** marks the calendar crossing; layovers are explicit.
- **On the home (Next-Up):** "Departs tonight · 9:35p **BOS** → 2:20p **FCO** · **Sun +1** · 1
  stop FRA." Arrival in the destination zone, on the day it lands — never tonight's date, never
  your clock. Boarding pass + gate fold in after check-in.
- **In The Plan:** BOS→FRA (lands 11:05 AM **CEST +1**) · layover Frankfurt 1h40 · FRA→FCO. Each
  segment its own time + zone, no collapsed clock.
- Trains/ferries/drives between cities model the same (e.g. a night-train Next-Up: "Florence →
  Venice · Fri 9:10 AM").

---

## Scenario E — a different party
The home reads **who's on the trip / on this leg**, not a fixed family of four.
- **Just the parents:** who's-around shows two; the kid-leaning We-could weighting drops; Rafa's
  pad isn't in play.
- **A grandparent joining one leg:** they appear in who's-around + the journey only for the legs
  they're on; presence/timezone honesty covers "Grandma lands Florence Thu."
*(Data: trip membership is per-leg, not global — see `06`.)*

---

## No leak + new-screen flags
- **Gating matrix** (see `05`): A/B render **only** the living heart. Complexity is opt-in by trip
  shape and cannot leak down.
- **Zero new destinations.** The journey rail is a strip (taps reuse **The Plan**); arrival +
  timezone are ephemeral banners; per-leg context is a home module; the 4-tab shell is unchanged.
