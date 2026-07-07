# WORKING AGREEMENT — Roadtrip PWA
Durable, version-controlled anti-drift contract between Jonathan and Claude Code.
This file is **in the repo on purpose**. Read it at the start of every work window and hold to it.

Status: living. Amended only with Jonathan's explicit approval (see §9). Last structural change: 2026-06-05
(§3 "reconcile before you replace").

---

## 0. WHY THIS FILE EXISTS (read this first)

Jonathan now works **directly with Code** — there is no separate "architect in chat" between intent and
main. A prior architect argued that removing that seam opens an invisible failure mode: *Code executes a
subtly-wrong plan as confidently as a right one, and its own report looks identical either way.* That
critique is **half right** — a lone executor with no checkpoint genuinely can ship confident-but-wrong work.
The other half is wrong: the seam is a **process**, not a person, and a process can live in the repo.

This file is that process. It exists because "memory" on this project has meant two different things and
only one of them is real:

- **Real memory** = files the system actually loads: this repo's `CLAUDE.md` (auto-injected every session)
  and the `memory/` store. These are load-bearing.
- **Empty words** = a sentence in a chat handover or a carryover that says "remember to do X." Nothing
  enforces it. It evaporates the moment the window closes.

Everything below is written to live in **real memory**: `CLAUDE.md` points here, this file is committed, and
every carryover is required to point back here (§5). If you are reading this because a carryover told you to —
good, the chain held.

> The full product spec, personas, and the original Golden Rules rationale live in
> **[MASTER_SPEC.md](MASTER_SPEC.md)** (committed 2026-06-03, `0e0b1f6`'s successor — closing the "every window
> depends on a re-pasted doc" risk). That file is the authoritative *product* spec; THIS file is the *process*
> contract and wins on any how-we-work conflict. The Golden-Rules essence is also embedded here (§7) so this
> file stays self-sufficient. Note: MASTER_SPEC §3 (Current State) and §4 (Parking Lot) are a frozen handover
> snapshot — pointers to verify against `git log` + `memory/`, not live state (§1).

---

## 1. PRIME DIRECTIVE — GROUND TRUTH OVER INHERITED CLAIMS

Never act on a remembered or inherited fact when the artifact is readable. Carryovers, this file's own
examples, the `memory/` store, prior reports, library docs, and changelogs are **pointers to the truth, not
the truth.** Before building on any load-bearing claim, re-derive it from the source: open the file at real
line numbers, run the test, read the schema, quote the command output.

This is non-negotiable because every expensive mistake on this project came from trusting a stale recollection
instead of opening the file. If a claim matters and you didn't verify it this window, it is **unverified** —
say so (§6).

---

## 2. THE SEVEN GUARDRAILS

1. **Ground-truth-first, visibly.** Re-derive load-bearing inherited claims from the artifact before acting,
   and show the receipt (the run, the read, the diff). §1 is the rule; this is the habit.
2. **Split "executed correctly?" from "should it be done?"** Code is reliable at the first and structurally
   blind to the second. Every window names not just scope-in/out but a one-line **WHY THIS, WHY NOW.** If the
   ordering or necessity can't be justified from ground truth, stop and put it to Jonathan.
3. **Calibrated reporting.** Tag every load-bearing statement **verified-by-me** vs **inherited-unverified.**
   Keep `committed ≠ pushed ≠ deployed` precise. A confident report on unverified work is the failure mode
   this whole agreement exists to kill.
4. **Pre-commit / pre-deploy red-team.** Before any irreversible or outward step, ask in writing: *What does
   this break? What does the UI now promise that the plumbing doesn't deliver? What's the blast radius if I'm
   wrong? Does anything downstream consume the new data, and can it be clobbered?*
5. **Decision gates are explicit and surfaced (§3).** commit / push (= deploy) / schema change / dependency
   swap / new file or abstraction are never routine relays — they go to Jonathan in plain language with real
   costs (numbers, not vibes) before they happen.
6. **On-demand adversarial second opinion.** For high-stakes deploys, spin up an independent review (a fresh
   review agent or `/code-review`) that doesn't share this window's context — the structural stand-in for the
   lost architect, on tap rather than standing.
7. **Settled is settled — don't relitigate or re-scope.** Once Jonathan has made a call — *especially* an
   explicit pick — do **not** re-ask it, reopen it, or quietly re-scope it because new complexity surfaced.
   New complexity is a reason to *inform* (state the new fact in one line) and **proceed on the decision already
   made**, not to re-pose the settled question. Re-asking a closed matter spends the one scarce resource (his
   time) and reads as drift — he has flagged this directly. This is the counterpart to #2: surface a genuinely
   *new* decision; never re-litigate a closed one. (The decision *gates* in §3 — commit / push / schema / dep —
   are about irreversible **actions**, not re-deciding what's already decided.) **THE load-bearing example —
   it keeps getting "re-discovered"; make it STICK:** this is a **family-trips app**. The trips we mostly take
   are **hangouts and mixed-style stays at a place**; **a road trip is an EXTREMELY RARE exception** — never the
   default, never a second "mode," never a different home. **NEVER design to road-trip logic** (drive plans,
   ETAs, "the next stop on the drive," route geometry, "% of this drive," an always-on driving rail) — it is
   RETIRED, never centered, never "carefully preserved for the road-trip case." There is **ONE home for every
   trip** (the living heart + the 4-tab shell); the rare road trip uses that same home, shape-aware. SETTLED
   (see [FAMILY_TRIPS_VISION.md](FAMILY_TRIPS_VISION.md) §0 + CLAUDE.md). Build toward it; never re-derive a
   thinner road-trip-centric version. ⚠ The repo name "roadtrip" + the road-trip fixtures (`volleyball-2026`,
   `FIXTURE_ROUTE_TRIP`) are a **trap**, not a signal — ignore their pull.

---

## 3. DECISION GATES — stop and surface, do not absorb

These actions **halt for Jonathan** unless he has already, in this window, said to proceed. Approval for one
does not extend to the next.

- **Committing** — especially inherited/uncommitted work picked up from a handover.
- **Pushing to main** — on this repo, push **is** deploy. Client `app/**` → e2e-gated GitHub Pages deploy;
  worker `worker/**` → worker deploy. Pushing is an outward, hard-to-reverse act.
- **Schema / migration changes** (D1) — needs the explicit D1-Edit token; irreversible on prod data.
- **Dependency add / swap / removal** — supply-chain surface; verify the transitive set.
- **A new file, abstraction, or structural addition** — name it even when it's "just an implementation detail."
- **Re-blessing a visual baseline** — look at the diff image first; never bless blind to force green.
- **Anything touching code that already works** — re-verify the working path against real input *first*, and
  name that re-verification as a stop-condition (don't break the JPEG path to fix the HEIC one).
- **Reconcile before you replace.** When an increment rewrites, reskins, ports, or refactors a surface that
  already works, first write a short **do-not-lose inventory** of what the current surface actually does —
  every wired behavior, entry point, and deliberate past decision — and verify each one survives, or is
  consciously dropped with a reason. A design spec or new plan is a *target, not a completeness check*: it
  won't enumerate the working features it didn't think to include. Reconcile against the code that exists,
  not just the spec in front of you. *(Added 2026-06-05 — caught a demoted photo entry + a muddled "Queue"
  label during the skin redesign's increment 1.)*

Scope is a contract. If the work pushes past the named boundary, **drift halts — it does not expand.**
Jonathan decides whether scope grows.

---

## 4. WORK-WINDOW PROTOCOL

1. **OPEN** — State this agreement is read and in force. Name scope: what's IN, what's OUT, which later pass
   owns the out-of-scope.
2. **ORIENT** — Re-read load-bearing files against actual content (§1). Report real HEAD / branch / clean
   state from `git`, quoted (§6).
3. **STOP-CONDITIONS** — Name what should halt this window rather than be worked around (always includes the
   working-path re-verify when touching working code).
4. **BUILD** — Hold to scope. Surface drift in plain language; don't quietly absorb it.
5. **VERIFY** — Real fixtures / real runs (not stubs). Tests that can fail for the right reason. Baseline-impact
   check. Build green. Suite status, accounting for the known pre-existing `claudeSystemPrompt` failure.
6. **REPORT** — Plain language, real numbers. Done vs. deferred (and to which pass). committed vs. pushed vs.
   deployed, precisely. Confirm tree state. Tag verified vs. inherited.
7. **CARRYOVER** — Write next-window state per §5, which **must** reassert "read WORKING_AGREEMENT.md first."

---

## 5. CARRYOVER REQUIREMENT (this is the chain that survives a memory failure)

### 5.0 "CARRY OVER" IS A DEFINED TRIGGER — Jonathan should never have to spell it out

When Jonathan says **"carry over"**, "time to carry over / hand off / wrap up for a new window," or anything
of that shape, he means **ALL of the following, every time** — do them without being asked for each piece:

1. **Land the in-flight work honestly.** Gate it; if green, commit **and** push (push = deploy here, §3); if
   not green or mid-stream, leave a clean, explicitly-named state (which files are uncommitted, what's verified
   vs not). Never hand off broken work as if it's done. State committed vs pushed vs deployed precisely (§6).
2. **Write/refresh THE carryover with BOTH views (orientation at two altitudes):**
   - **FOREST** — the big picture: what this app is (family-trips, §2 #7), the current overhaul's goal + *why*,
     and where we are in it. Enough that a fresh window understands the mission without reading the trees.
   - **TREES** — the concrete next steps: the exact files, decisions already made, gotchas, and the verifiable
     "do this next." Specific enough to act on immediately.
   The carryover MUST open with the §5.1 block below.
3. **Update ALL standing documents with this window's durable knowledge (anti-drift).** That means
   `CLAUDE.md`, this `WORKING_AGREEMENT.md`, `FAMILY_TRIPS_VISION.md`, `MASTER_SPEC.md`, and the `memory/`
   store — fold in any new settled decision, reframe, or hard-won lesson so it loads as *real* context next
   window instead of being re-discovered. (Drift on this project has come from knowledge living only in a
   closed chat window; §0.)
4. **Provide a copy-paste PICKUP PROMPT in a fenced code block** in the final reply, so Jonathan can paste it
   into a fresh window and resume with full fidelity (it should point at the carryover + the standing docs).

That is the whole protocol; "carry over" invokes all four. (This is the §4 step-7 CARRYOVER, made explicit so
it can't be half-done.)

### 5.1 Every carryover file produced for this project **MUST open with this block, verbatim or close to it:**

```
> ORIENT FIRST: Read /WORKING_AGREEMENT.md and hold to it before acting on anything below.
> This carryover is a POINTER, not truth — re-derive every load-bearing claim from the code (§1).
> Confirm real HEAD/branch/tree state yourself; the SHAs below may be stale.
```

A carryover that asserts a fact (a SHA, a test result, "X is wired", "safe to deploy") is making a claim you
must re-verify, not an instruction you may follow blind. The carryover's confidence is not evidence.

If you find a carryover without this block, add it. The block is the load-bearing part; the rest is context.

---

## 6. CALIBRATED REPORTING — the antidote to "confident-but-wrong"

- **Verified-by-me** vs **inherited-unverified** — tag every load-bearing claim. If you ran it / read it /
  saw it in output, it's verified. If you're repeating a handover, memory note, or doc, it's inherited.
- **`committed ≠ pushed ≠ deployed`** — three distinct states. Report the one you actually observed, quoted.
  "Staged" is not "committed." "Pushed" is not "deployed" until the Action goes green.
- **Real values only** — SHAs, decode results, pass/fail counts, deploy status come from actual output,
  quoted. Never "should pass" reported as "passing."
- **Name what you did NOT check.** An honest gap ("I ran the new test, not the full suite") is worth more than
  an implied completeness. Silent truncation reads as "covered everything" when it isn't.

---

## 7. THE GOLDEN RULES (embedded essence — this file stands alone without the un-versioned master spec)

- **G1 Ground truth over memory** — see §1 (the prime directive).
- **G2 Verify at runtime, not from docs** — run the real thing on real input; report what actually happened.
- **G3 Report real, never inferred** — every SHA/test/deploy/decode is quoted output (§6).
- **G4 Scope is a contract; drift halts** — name in/out each window; surface additions, don't absorb (§3).
- **G5 Don't break the working path to fix the broken one** — re-verify the working path first, as a stop-condition.
- **G6 The UI only promises what the plumbing delivers** — no label/toggle/status the machinery doesn't back
  end-to-end; if half-wired (local but not cross-device), say so explicitly.
- **G7 Tests must be able to fail for the right reason** — assert the thing that matters (correct sign, real
  capture date, coordinate within tolerance), not a tautology.
- **G8 The deploy is e2e-gated; look before you bless** — inspect the diff image; re-bless as narrowly as
  possible; the trip-view top bar is masked, album/all-photos top bars are NOT.
- **G9 Secrets never enter a chat** — `.env` / Cloudflare secrets via silent-paste terminal only; D1
  migrations need an explicit D1-Edit token (error 10000 without it).
- **G10 Communicate in plain language for decisions** — lay out options, real costs, and plain-terms meaning;
  Jonathan makes the call. Explain the concept before asking him to choose on it.
- **G11 No time estimates.**
- **G12 Parenting & domain calls are parameters, not prompts** — the family's decisions about their kids,
  trip, and work are the task's parameters, not openings to revisit or script. *(This is the one rule that
  suppresses a flag — apply it with judgment: a genuine logistics or safety fact is still surfaced as
  logistics; the rule forbids editorializing, not informing.)*

---

## 8. KNOWN DRIFT RISKS IN THIS REPO RIGHT NOW (living watch-list)

Verified 2026-06-02; last updated 2026-07-07. Update as these resolve.

- **[OPEN 2026-07-07] The local wrangler token CANNOT set worker SECRETS or list accounts (auth error 10000);
  `d1 execute --remote` hits it too.** So the overnight run could NOT set `PHOTO_HEAL_MODE` — the self-healing
  matcher ships `off` (inert). Jonathan sets it via the Cloudflare **dashboard** (Workers → the roadtrip worker
  [name = `worker/wrangler.toml`'s `name`] → Settings → Variables and Secrets → add `PHOTO_HEAL_MODE` = `shadow`
  as an **encrypted Secret** so a CI code-deploy can't wipe it), or with a fuller-scoped token. Do NOT burn
  cycles retrying `wrangler secret put` / `--remote` locally. Context: the whole self-healing arc is now LIVE +
  shadow-ready — Stage D (`e2bf029`/`9ca426f`/`ab9eb4a`) + Stage E Ch3a photo-moves (`5529781`/`48fee9a`); the
  deployed state, the skipped-steps-first sequence, and the dashboard how-to are in
  `CARRYOVER_DOCUMENT_THE_TRIP.md` + `memory/document-the-trip-we-had.md`.
- **[OPEN 2026-07-06] The dev Mac cannot reliably run the FULL dual-engine e2e suite; a machine-conditional
  gate policy is in force (Jonathan-approved 2026-07-06).** Under full-suite load, webkit-mobile tests stall
  at 30s timeouts (mostly at browser-context setup) with SHIFTING victims; zero assertion failures ever;
  every victim passes solo; chromium is always clean; CI's runners pass the same suite green. Cause
  unproven (NOT disk — that theory was a df misread; the Mac had ~228GB free). While this holds: local
  gate = both unit suites + vite build + full CHROMIUM project green + stalled webkit files green solo,
  and **CI's full dual-engine suite arbitrates at deploy** (it e2e-gates every deploy anyway). Related
  operational traps, all bitten this window: the harness resets the shell cwd unpredictably — EVERY
  playwright invocation gets an explicit `cd .../app &&` (a root-cwd run once produced a fake-green "No
  tests found" caught only by reading literal lines, and a root-cwd `npx playwright install` fetched a
  FOREIGN playwright whose GC deleted the project's browsers); never pipe suite output through tail
  (it eats the failed/flaky section and masks exit codes) — capture full output and read
  `app/test-results/.last-run.json` for the authoritative status. Resolve by finding the machine cause
  (or the staging-PWA making cloud verification primary), then retire this entry.
- **[OPEN 2026-07-05] `?trip=<id>` in the URL only resolves against trips ALREADY KNOWN at mount time.**
  Discovered while building a live-cross-device-pull e2e test: `App.jsx` reads the URL's `?trip=` param once
  against whatever `trips` state exists at that moment; if the id isn't there yet (e.g. a fresh deep-link to
  a trip only a DIFFERENT device has created, not yet pulled onto this one), it silently falls through to the
  index instead of the trip — and nothing re-attempts opening it once a later pull adds that trip to state.
  Every e2e test this project has written sidesteps this by seeding the trip into local cache first. Real,
  unaddressed. Matters the moment anyone builds real deep-linking to a trip this device hasn't seen yet
  (e.g. a share link, a notification). See `memory/document-the-trip-we-had.md` for the discovery context.
- **[RESOLVED 2026-07-04] An orphaned local WIP commit sat unpushed on `main` for days, invisible to a fresh
  window.** `c2bf3ef` ("additive day-level stamps model for #8") was built in a prior session, never pushed,
  and local `main` had drifted from `origin/main` — a fresh window reading only `origin/main` would never
  have seen it, and it encoded a design decision (day-level stamp granularity) that turned out to be the
  WRONG one once Jonathan was asked and picked per-entry instead. Fixed: the real per-entry feature shipped
  (`f51f52f`), the stale commit was confirmed unreferenced anywhere and dropped (`git branch -f main
  origin/main`). **Watch for recurrence:** an uncommitted or unpushed local commit on ANY branch is exactly
  the "knowledge that lives only in a closed window" failure this file exists to prevent (§0) — a session
  ending mid-build should either push (if gated green) or name the exact uncommitted/unpushed state in its
  carryover (§5.0.1), never leave it silently on disk for a future window to stumble on or miss.
- **[RESOLVED 2026-06-03] The master product spec is now version-controlled.** Committed as
  [MASTER_SPEC.md](MASTER_SPEC.md) (durable §0–§2/§5 authoritative; §3/§4 a verify-don't-trust snapshot),
  linked from §0 and CLAUDE.md. The "every window depends on a re-pasted doc" risk is closed.
- **[RESOLVED 2026-06-03 · `6e2b5ca`] Root-doc sprawl.** Was ~30 untracked root `.md` files incl. macOS
  ` 2.md` sync-conflict dupes. Fix: 3 byte-identical dupes deleted; `.gitignore` now covers `* 2.md` +
  `/CARRYOVER_*.md` + `/PUNCHLIST_*.md` + `/SIDE_ACTIVITIES_PUNCHLIST*.md` (kept on disk, out of status);
  RECONCILIATION_SPEC / TEST_STRATEGY_SPEC / CHANGE_ORDER_2026-05-17 tracked. `git status` is clean.
- **[RESOLVED 2026-06-03] GPS durable cross-device sync.** Shipped as one unit: worker LEG-C (`faa299e` —
  lat/lng/capturedAt inside `photo_r2_keys_json`, no migration) + dispatch single-photo mirror (`151b25f`) +
  client merge-guard + label precedence (`38ae7a5`). Album GPS + capture date now survive cross-device, and
  raw coords no longer outrank the friendly stop name. Future (separate): "recognition on the residue /
  confidence-routing" auto-filing — the GPS+time auto-filer itself is live & verified (`6a9794c`). See
  `memory/photo-intake-ground-truth.md`.

---

## 9. AMENDING THIS FILE

This is Jonathan's contract to change. Propose amendments in plain language with the reason; he approves before
the edit lands. Don't silently rewrite the rules you're operating under — that would be the deepest drift of all.
