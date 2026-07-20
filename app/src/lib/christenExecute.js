// christenExecute.js — O4 live wiring (TRUTH-CRITICAL): the executor that runs a
// christenPlan's ordered steps against INJECTED deps, so it is node-testable without
// React/network. It is pure orchestration — christenPlan (pure) decides WHAT and in what
// order; this runs it, enforcing the guarantees the plan encodes.
//
// THE #5 ORPHAN ORDERING is honored by `requires` against a COMPLETION-TOKEN map — note
// the DELIBERATE token (grounded from christenPlan.js): the `trip-mutate` step completes
// as the token 'trip-ack', and `file-photos` requires ['trip-ack'], so a filing can NEVER
// precede the trip push's sync ACK (a filing must never point at an id the album can't
// render). A naive name-keyed executor would deadlock file-photos — the token map is
// load-bearing.
//
// FAILURE SEMANTICS (spec F2): a trip-mutate terminal failure DEGRADES honestly — no
// created stop, no filing, no christening confirm; the words fall back to the S1 free-text
// 'corrected' POST (plan.degraded.post) and the S1 "kept your words" copy, never the
// christening receipt (#4 honest-copy). A confirm-POST failure is QUEUED, never fatal
// (the sync-honesty queue owns the retry, carrying the A1 lean snapshot). MASKING defers
// the WHOLE write to the surprise reveal — nothing hits the shared agenda now.
//
// deps (all optional; a missing one no-ops that effect):
//   mutateTrip(step)   → Promise  — append the stop via pushTrip + AWAIT the sync ack; THROWS on terminal fail
//   fileMemory(filing) → void     — updateMemoryStop(memoryId, stopId, {source:'confirmed'})
//   stampGps(g)        → void      — applyRefGps (a christening yields [] → usually a no-op)
//   postConfirm(body)  → Promise<boolean> — POST /heal-confirm; false/throw ⇒ queue
//   queueRetry(body)   → void      — enqueue a failed POST for the sync-honesty retry
//   deferForReveal(plan) → void    — hold a masked christening until the surprise reveals

// The trip-mutate step reports its completion as the ack token the later steps wait on.
const COMPLETION_TOKEN = { 'trip-mutate': 'trip-ack', 'file-photos': 'file-photos', 'confirm-post': 'confirm-post' }

// The truth-critical write deps are REQUIRED, never advisory (the review's root-cause
// finding): `wrote` and the `trip-ack` token must reflect an effect that ACTUALLY
// happened, never a step merely reached. A `?.`-optional write would let a missing dep
// FAKE the ack (orphaning photos to an un-synced id) or report success with zero filings.
// Advisory deps (stampGps, deferForReveal, queueRetry) may be absent.
export async function executeChristenPlan(plan, deps = {}) {
  if (!plan || plan.decision === 'skip') return { status: 'skip', wrote: false, filed: 0 }

  // MASKING: a christening from a moment masked for any member holds its ENTIRE write
  // (mutate/file/POST) until the surprise reveals — the shared agenda must not leak that
  // a masked moment exists. Nothing writes now.
  if (plan.masking?.deferred) {
    try { deps.deferForReveal?.(plan) } catch { /* advisory — never throws into the surface */ }
    return { status: 'deferred', wrote: false, filed: 0, receipt: plan.receipt }
  }

  const done = new Set()
  const requiresMet = (s) => (s.requires || []).every((r) => done.has(r))
  const markDone = (s) => done.add(COMPLETION_TOKEN[s.step] || s.step)
  let filed = 0 // photos ACTUALLY dispatched — `wrote` derives from this, never step-marking

  // DEGRADED: the stop never synced → never file/POST the christening. The words land via
  // the plan's S1 free-text fallback; the receipt is the S1 "kept your words" copy.
  const goDegraded = async () => {
    const dg = plan.degraded
    if (dg?.post && typeof deps.postConfirm === 'function') {
      try { const ok = await deps.postConfirm(dg.post); if (ok === false) deps.queueRetry?.(dg.post) } catch { deps.queueRetry?.(dg.post) }
    }
    return { status: 'degraded', wrote: false, filed: 0, receipt: dg?.receipt ?? plan.receipt }
  }

  for (const s of plan.steps || []) {
    // Ordering is enforced, not advisory: a step whose prerequisites haven't completed
    // never runs (a filing never precedes the trip-ack).
    if (!requiresMet(s)) return { status: 'blocked', at: s.step, wrote: filed > 0, filed }

    if (s.step === 'trip-mutate') {
      // mutateTrip is truth-critical: a missing OR failed one must route to the honest
      // degraded fallback — it must NEVER fake the ack (which would orphan photos).
      if (typeof deps.mutateTrip !== 'function') return goDegraded()
      try { await deps.mutateTrip(s) } catch { return goDegraded() }
      markDone(s)
    } else if (s.step === 'file-photos') {
      const filings = s.filings || []
      // a missing filer must NEVER report success — no lying 'done' with zero writes.
      if (filings.length && typeof deps.fileMemory !== 'function') {
        return { status: 'error', at: 'file-photos', wrote: false, filed: 0, error: 'fileMemory dep required' }
      }
      for (const f of filings) {
        try { deps.fileMemory(f); filed += 1 } catch (e) {
          // a TORN write: some photos already filed + D13-locked. Surface the PARTIAL so
          // the host reconciles — never a clean 'done', never a clean 'error' that would
          // invite a twin-minting retry.
          return { status: 'partial', at: 'file-photos', wrote: filed > 0, filed, error: String(e?.message || e) }
        }
      }
      for (const g of s.gpsStamps || []) { try { deps.stampGps?.(g) } catch { /* advisory — coords propagate later */ } }
      markDone(s)
    } else if (s.step === 'confirm-post') {
      if (typeof deps.postConfirm !== 'function') {
        // the filings stand; the confirm must be queued, not silently dropped as success.
        if (typeof deps.queueRetry === 'function') { deps.queueRetry(s.body); markDone(s); continue }
        return { status: 'partial', at: 'confirm-post', wrote: filed > 0, filed, error: 'postConfirm dep required' }
      }
      try { const ok = await deps.postConfirm(s.body); if (ok === false) deps.queueRetry?.(s.body) } catch { deps.queueRetry?.(s.body) }
      markDone(s)
    } else {
      markDone(s) // unknown/forward-compat step
    }
  }
  return { status: 'done', wrote: filed > 0, filed, receipt: plan.receipt }
}
