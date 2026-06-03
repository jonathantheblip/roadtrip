# Roadtrip — start here

**Before any work, read [WORKING_AGREEMENT.md](WORKING_AGREEMENT.md) and hold to it.**
It is the durable, version-controlled anti-drift contract for this project. This `CLAUDE.md` is the
auto-loaded anchor that points to it — so the agreement loads as *real* context every session, not as a
chat handover that evaporates when the window closes.

The three rules that catch the most expensive mistakes (full set in the agreement):

1. **Ground truth over inherited claims.** Carryovers, specs, prior reports, and `memory/` are pointers, not
   truth. Re-derive any load-bearing fact from the file / test / command output before building on it.
2. **Surface the "should we?"** Code executes a decided thing well but must STOP and ask when the real
   question is whether a step should be done — in this order, now. Jonathan makes those calls.
3. **`committed ≠ pushed ≠ deployed`.** Push to `main` *is* a deploy here. Treat commit / push / schema /
   dependency changes as decision gates, not routine relays.

**Every carryover file MUST open by reasserting:** "Read WORKING_AGREEMENT.md first; this carryover is a
pointer, not truth." (See agreement §5.)

Product context and personas live in [MASTER_SPEC.md](MASTER_SPEC.md) (§0–§2/§5 durable; §3/§4 a frozen
snapshot). Live feature state lives in `memory/`. Both are *pointers to verify*, not authorities to obey.
