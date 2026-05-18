# CHANGE ORDER — <DATE>
## <One-line title>

---

## Context

<What happened, who hit it, the working hypothesis. Link the prior
change order or incident if this follows one.>

---

## Governing Principles

These are standing rules. They apply to every change order whether or
not they are restated.

1. **No UI without plumbing.** No toggle, label, status indicator, or
   affordance exists in the UI unless the backend behaves as the UI
   claims. (Standing rule, May 2 2026.) The converse also holds: data a
   form captures must be rendered somewhere, or it is plumbing without
   UI.
2. **Every create path produces a renderer-complete record.** Whether a
   record is built through Claude Code, screenshot ingestion, manual
   entry, or edit — the resulting stored record has every field the
   themed views read from. The path doesn't dictate the polish.
3. **Verify against the running code, not the change order's
   assumptions.** Architecture moves (e.g. the May 2026 CloudKit →
   Cloudflare Worker + D1 + R2 migration). If a change order's
   instructions reference a system that no longer exists, diagnose
   against what's actually deployed and say so in the report.
4. **Destructive steps are gated.** Deleting or overwriting user data
   waits for explicit confirmation of exactly which records, even when
   the rest of the order proceeds autonomously. Prefer giving the user
   an in-app affordance to do the destructive action themselves over
   doing it for them.

---

## Merge gate: known-good / known-bad

> Every form that writes to the sync Worker (D1/R2) — formerly
> CloudKit — ships with a documented known-good and known-bad input.
> Both are run before merge. Output of both is attached to the PR.

This converts Principle 1 from a posture into a hard merge gate. A PR
that adds or changes a write form does not merge until:

- **Known-good input** is documented, run, and its output (the created
  record round-tripping through the read path and rendering at parity)
  attached.
- **Known-bad input** is documented, run, and its output (the form
  blocking the write with a clear inline error, no record created)
  attached.
- **Idempotency** is demonstrated: rapid repeat submits produce exactly
  one record (client-stable id + in-flight guard).

---

## Parts

<Numbered parts. The first part that touches data is "Diagnose — report
back, do not delete." End it with an explicit stop for confirmation
before any destructive step.>

---

## Acceptance tests (before merge)

Attach output of each to the PR:

1. **Known-good input** — complete entry saves, round-trips, renders at
   parity.
2. **Known-bad input** — missing required field blocks save with an
   inline error; no record created.
3. **Idempotency** — rapid repeat submit yields one record; post-success
   taps are no-ops.
4. **Concurrent edit** — last-write-wins is acceptable; the conflict
   surfaces in the UI.
