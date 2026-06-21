# Roadtrip — start here

**Before any work, read [WORKING_AGREEMENT.md](WORKING_AGREEMENT.md) and hold to it.**
It is the durable, version-controlled anti-drift contract for this project. This `CLAUDE.md` is the
auto-loaded anchor that points to it — so the agreement loads as *real* context every session, not as a
chat handover that evaporates when the window closes.

**What this app IS — settled; do not relitigate or re-scope:** a **family-trips app for ANY trip shape** — a
stay or hangout at a *place* (a cabin, Grandma's, a beach house), a city break, a flight, as much as a road trip.
The road-trip shape is **one** shape, **not** the default, and this must **not** become a reskinned road-trip
app. Build *toward* [FAMILY_TRIPS_VISION.md](FAMILY_TRIPS_VISION.md); don't reconstruct a thinner,
road-trip-centric version each window. Jonathan has corrected this repeatedly — treat it as decided, not open.

The rules that catch the most expensive mistakes (full set in the agreement):

1. **Ground truth over inherited claims — and files go stale.** Carryovers, specs, prior reports, this anchor,
   and `memory/` are pointers, not truth, and they age. Re-derive every load-bearing fact (real HEAD / branch /
   tree, file contents, test output) from the live source *this window* before building on it.
2. **Surface a genuinely-NEW "should we?" — but never relitigate a SETTLED one.** Stop and ask when the open
   question is whether a step should be done, in this order, now. Do **not** re-ask a decision Jonathan has
   already made (especially an explicit pick): if new complexity surfaces, state the new fact in one line and
   **proceed** on his decision — don't re-pose the question and don't silently re-scope it. (Agreement §2, #7.)
3. **`committed ≠ pushed ≠ deployed`.** Push to `main` *is* a deploy here. Treat commit / push / schema /
   dependency changes as decision gates, not routine relays.

**Every carryover file MUST open by reasserting:** "Read WORKING_AGREEMENT.md first; this carryover is a
pointer, not truth." (See agreement §5.)

Product context and personas live in [MASTER_SPEC.md](MASTER_SPEC.md) (§0–§2/§5 durable; §3/§4 a frozen
snapshot). Live feature state lives in `memory/`. Both are *pointers to verify*, not authorities to obey.
