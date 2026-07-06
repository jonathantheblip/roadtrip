# Chapter 3 — Photo moves

Two tightly-coupled pieces of the self-healing album: how the family **learns** a photo moved
(the note), and how a person **moves** one by hand (the override that makes the machine's manners real).
Live components: `album/moves.jsx` (`MoveLightbox`, `MoveSheet`, `MovedSection`, `SuggestDemo`,
`MoveLetter`), `album/chapter3.jsx`, `album/ch3-data.jsx`. Copy: `specs/copy_deck.md`.
**Rafa excluded by rule** — no notes, no chips, no move controls; his photos are simply always in the
right place. Voices: Helen / Jonathan / Aurelia.

> **The trust grammar (the spine of this whole chapter):** every "moved because…" names a **HUMAN act**
> ("moved when you named Race Point," "moved when Wednesday's dinner changed"), **never** machine-speak. A
> nightly catch-up (sweep) **inherits the human act it catches up on.** A hand-move **LOCKS** the photo
> forever — after that the machine may only *suggest*, never move it. **Authorship outranks the machine.**

---

## The system these serve (settled)
Photos file themselves to days' places and named moments. When reality changes (a plan edit, a moment
named, better GPS) the server quietly re-files — but ONLY on strong evidence (GPS-backed, clear winner,
whole memory agreeing) and **NEVER anything a person placed by hand.** Every automatic move is visible,
explained, and reversible. Move data rides existing synced per-photo metadata (`movedFrom` + labels
snapshotted at decision time + `reasonCode` + `who` + `when` + `locked`), so **any device tells the same
true story days later.**

---

## Piece 1 — The moved-note & chip lifecycle (Q1) — `MovedSection`
A permanent per-tile badge would fight the calm album ("a dozen forever-chips read as 'something is wrong
with all of these'"). So a move is **news for exactly one visit**, then silent:

- **Fresh move → a small "moved" chip**, bottom-**LEFT** of the tile (`.tile-chip--moved`), visually
  distinct from the transient state chips at bottom-right. `--font-mono` 7.5px on a dark scrim.
- **Section-level line** (one, gentle) under that section's header: **"3 photos moved here when the day
  changed."** + a `--faint` sub "tap any to see why." A small `--accent` dot leads it; background `--bg2`.
- **What quiets them:** the **first album visit AFTER the move** — not first lightbox view (you shouldn't
  have to open each one). After that visit: **nothing remains on the tile** — no badge, no dot. The album is calm again.
- **What always remains:** the full story, **one tap deep in the lightbox** (Piece 2). It is permanent and
  synced; the tile just stops announcing it.

---

## Piece 2 — The lightbox story line + locked state (Q2) — `MoveLightbox`
In the lightbox footer, **below the place line**, one quiet italic sentence names the human act. It rides
on the existing lightbox (spec 01, Screen C) — add these two rows to the footer:

- **Story line** (`--font-fraunces` italic ~13.5px, `--muted` on scrim). Reason codes → copy (exact strings,
  all voices, in the deck):
  - `named` — a moment was named: "Moved here when you named breakfast at the Brasserie."
  - `plan` — the plan changed: "Moved here when Saturday's breakfast shifted to 9am."
  - `gps` — location resolved: "Settled here once its location came through."
  - `catchup` — a nightly sweep, **inherits** the act: "Caught up here when the breakfast stop moved."
- **Locked line** (after a hand-move): firmer, `--gold-ink` `#F3E4B8`, with a small `Ic.lock` — this is the
  ONE line in the album that isn't quiet, because it's authorship:
  **"Placed here by {who} — stays put."** ({who} = "you" on your own device; the mover's name elsewhere.)
- **Action row** (beside the existing **"Edit date"** chip): a **"Move to…"** button with `Ic.pin`. After a
  hand-move it becomes a disabled **"🔒 Locked"** pill (the machine can't move a locked photo).

---

## Piece 2b — The Move-to hand (Q3) — `MoveSheet`
Tapping "Move to…" opens a bottom sheet (`.sheet`), title "Move this photo to…" (aurelia lowercase italic).
- **Day-sectioned list** (matches the album spine + the day-picker/SettleSheet precedent). Mono day eyebrow
  per section (`FRI · MAY 1`).
- **Places vs named moments read differently** — this distinction is load-bearing:
  - **Place:** `Ic.pin` + **upright** `--font-fraunces` 15.5px/600 + mono sub "A PLACE".
  - **Named moment** (the family's own word from the settle sheet): a **quote glyph** (") + `--font-fraunces`
    **italic** 15.5px/500 + mono sub "A NAMED MOMENT".
- **Current location marked:** `Ic.check` + "here now" in `--accent`; that row is **not tappable**.
- **"Leave it unfiled"** — ALWAYS present, at the bottom, dashed border, `Ic.grid`, sub "not tied to a moment."
  Moving to unfiled is a real, honest destination and must exist.
- **One tap moves.** A hand-move LOCKS (Piece 2). Sheet dismisses by tap-outside / swipe.
- **Who can move:** **any adult** (fixing the album is communal), not just the author. **Delete stays
  author-only.** Batch/multi-select is explicitly a **later release** — single-photo only here.

---

## Piece 3 — Who-moved-what honesty (Q4)
A hand-move by Helen shows on Jonathan's device as **the same synced, attributed story**: his lightbox reads
**"Placed by Helen. Locked."** (his drier rendering of the identical fact), and on his next album visit the
photo may carry the one-visit "moved" chip like any other move. Nothing hidden — the album is communal.
Because labels are snapshotted at decision time, every device tells the identical story later.
(Prototype: `MoveLightbox` with `startPlaced` + `moverName="Helen"` on `data-lens="jonathan"`.)

---

## Piece 3b — The suggestion moment (Q5) — `SuggestDemo`
When the machine is **unsure** (not strong evidence), it does NOT move — it **suggests**, reusing the shipped
two-step banner idiom, **adults only**:
- Banner: `Ic.bolt` + "These 3 might belong at Rosa's." + **[Move them] [Not now]**. Sub: "not now quiets it
  on every device."
- **"Not now" sticky-dismisses family-wide** (synced) — it will NOT reappear on any device until **genuinely
  new evidence** arrives.
- **Where it rests:** a single quiet **"Loose ends"** line at the **very bottom** of the album — "A few photos
  might belong elsewhere — take a look." + `Ic.right`. Findable if sought, invisible otherwise.
- **Reappearance (new evidence):** returns **named as new** so a "no" is respected, never nagged: "New: these 3
  now look like Rosa's — move them?"

---

## Piece 4 — The backfill letter (Q6) — `MoveLetter`
The one-time archive pass produces **one warm per-trip letter — never a hundred chips.**
- **Lands on** the trip's **"Looking back" card / keepsake home** (ties to Ch2's home).
- **Looks like:** a soft `--surface` card, envelope motif (✉️), the count, one warm line, and a **"Have a
  look"** CTA (`--accent` pill + `Ic.right`). Eyebrow "LOOKING BACK · {trip}".
  - Helen "214 photos from the Vermont week found their places — have a look."
  - Jonathan "214 archived photos located across the Vermont trip. Have a look."
  - aurelia "214 old photos from vermont found their spots — have a look."
- **"Have a look" goes to** that trip's album, scrolled to the newly-placed days, with those sections **gently
  marked for one visit** (the same one-visit section line — "214 found their places") which then quiets like any
  other move. It's the archive-scale sibling of Piece 1.

---

## State (Ch3)
Per photo: `movedFrom` (prev place label, snapshotted), `movedToLabel`, `reasonCode`
(`named|plan|gps|catchup|hand`), `movedBy` (identity | 'machine'), `movedAt`, `locked` (true after a
hand-move). `seenSinceMove` (bool) drives chip/section-line quieting — flips true on the first album visit
after the move. Suggestions: `suggestionId`, `dismissedFamilyWide` (bool), `evidenceVersion` (bump = allowed
to resurface). All synced except the per-device face index that feeds suggestions.
