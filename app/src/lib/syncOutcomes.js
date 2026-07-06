// syncOutcomes — the one per-outcome signal both sync queues speak (batch A-2,
// carried from A-1). Dequeue alone is ambiguous: an entry leaves the queue when
// the push LANDED, when the worker will never take it, and when the family's
// delete won — three different truths a surface must not conflate (the
// saved-queued badge used to have no way to flip to confirmed at all, and
// flipping on mere dequeue would show a green check for a refusal). One engine,
// two channels ('trip' | 'memory' — the deleteTombstones kind vocabulary), so
// the trips queue and the memory queue cannot drift apart in what they report.
//
// Pure fan-out. No storage, no network, no React.

// The complete outcome vocabulary. Every terminal sync decision maps to exactly
// one of these; 'still-pending' is the only non-terminal signal (the entry
// stays queued and the next drain retries).
//   synced         — the worker confirmed THIS device's change reached the family
//   refused        — the worker will never take it (masked stand-in, or the
//                    family's copy stands after bounded recovery); local settled
//   delete-adopted — the family deleted the item; the delete won and local
//                    adopted it (worker-asserted only, never inferred)
//   still-pending  — transient failure; queued for the next opportunity
export const SYNC_OUTCOMES = ['synced', 'refused', 'delete-adopted', 'still-pending']

const KINDS = ['trip', 'memory']
const subs = { trip: new Set(), memory: new Set() }

// Report the honest outcome of one sync attempt for `id`. Invalid kinds or
// outcomes are dropped (a bad caller must not fan out a lie).
export function emitOutcome(kind, id, outcome) {
  if (!KINDS.includes(kind) || !id || !SYNC_OUTCOMES.includes(outcome)) return
  for (const fn of subs[kind]) {
    try {
      fn(id, outcome)
    } catch {
      /* a bad subscriber never breaks a sync path */
    }
  }
}

// Subscribe to outcomes on one channel. fn(id, outcome). Returns unsubscribe.
export function subscribeOutcomes(kind, fn) {
  if (!KINDS.includes(kind)) return () => {}
  subs[kind].add(fn)
  return () => subs[kind].delete(fn)
}
