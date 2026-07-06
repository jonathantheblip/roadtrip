// memorySyncFlow — the pure half of honest memory sync (self-healing-photos
// foundation batch A-2: intent replay, stop-preserving conflict recovery,
// refusal adoption). The memory-side sibling of tripSyncFlow.
//
// Plain .js on purpose: everything here is pure or dependency-injected so the
// unit suite (node --test) can drive every branch without a browser or a
// network. memoryStore wires the real storage and transport in; nothing here
// imports React, the network layer, or localStorage.

// Two records may carry an unfiled stop as null (an explicit interstitial /
// composer save) or as undefined (rowToMemory emits `stop_id || undefined`;
// a JSON round-trip drops the key). The FILING is the same either way — a
// compare that treats them as different would push content-identical writes
// and mis-read a satisfied move intent as still owed.
export function sameStopId(a, b) {
  return (a ?? null) === (b ?? null)
}

// The default (no-closure) reapply for a 409'd whole-record save: the local
// deliberate edit wins every CONTENT field — but a memory's stop filing is not
// content. Only a MOVE op (updateMemoryStop's closure / a replayed move
// intent) may change stopId; a caption edit on a behind device must never
// silently revert a fresh move made elsewhere. So the merge is "local record,
// fresh filing" — and once provenance exists (Stage B, migration 017),
// fresh.stopProv rides along with the filing it describes.
export function mergeSaveOverFresh(localRecord, fresh) {
  const merged = { ...localRecord }
  merged.stopId = fresh?.stopId
  // Stage-B seam: provenance is part of the filing, not the content — it must
  // travel with the stopId it explains, or a preserved move would carry the
  // WRONG story (e.g. the old mover's name on the new filing).
  if (fresh && 'stopProv' in fresh) merged.stopProv = fresh.stopProv
  return merged
}

// The reapply closure for a MOVE: re-assert the stored target onto the fresh
// row. Returning null tells the conflict recovery "fresh already satisfies
// this intent — adopt fresh, push nothing" (a content-identical re-push would
// only bump updated_at and churn every other device's pull). The target is
// the closure's captured stopId — the intent decided at move time — never
// re-derived from any record at reapply time.
//
// Stage-B seam: when fresh carries `stopProv` with a manual lock
// (source:'manual') and this move is machine-driven, the worker refuses the
// change and returns the stored row (rule 2) — this closure then never wins;
// the refusal-adoption path owns that outcome. The prov to WRITE for the move
// itself will ride the intent (memorySyncQueue entries extend with `prov`).
export function moveReapply(stopId, nowIso = () => new Date().toISOString()) {
  return (fresh) => {
    if (sameStopId(fresh?.stopId, stopId)) return null
    return { ...fresh, stopId, updatedAt: nowIso() }
  }
}

// Classify a pushMemory result into the honest per-item outcome — the
// sync-honesty rule: read the per-item result, never transport success alone.
//   unconfigured — nothing to sync to (no worker), or a masked projection the
//                  client-side preflight declined; NEVER an error and never
//                  queued (a retry could not change either answer here —
//                  masked is refused upstream, unconfigured is refused by the
//                  drain's own configured check)
//   refused      — the worker declined to persist ({ ok, skipped } — a masked
//                  projection that slipped past the preflight); the stored row
//                  stands, retrying is pointless
//   synced       — the push landed. `updatedAt` is the server row stamp when
//                  the worker's answer carried one (null on a parse-miss
//                  `true` — confirmed but stampless, so no restamp is
//                  possible); `serverRow` is the stored row the worker handed
//                  back, for the refusal-adoption seam (Stage B: a manual-lock
//                  refusal answers 200 with the row it KEPT — the pusher must
//                  adopt that answer, not keep displaying its refused version)
export function readMemoryPushResult(res) {
  if (res === true) return { status: 'synced', updatedAt: null, serverRow: null }
  if (res && typeof res === 'object') {
    if (res.skipped) return { status: 'refused', updatedAt: null, serverRow: null }
    return {
      status: 'synced',
      updatedAt: typeof res.updatedAt === 'string' && res.updatedAt ? res.updatedAt : null,
      serverRow: res.id ? res : null,
    }
  }
  return { status: 'unconfigured', updatedAt: null, serverRow: null }
}

// Newest SERVER stamp (epoch ms) across a pulled batch — the live channel's
// delta cursor (A-3). Pulled rows carry the worker-issued updatedAt as an ISO
// string (derived from the row's epoch-ms updated_at, so Date.parse
// round-trips it exactly). Rows without a parseable stamp are skipped; an
// empty/invalid batch returns null so the caller can tell "no stamp learned"
// from epoch 0.
export function latestServerStamp(records) {
  let max = null
  if (!Array.isArray(records)) return max
  for (const r of records) {
    const t = Date.parse(r?.updatedAt)
    if (Number.isFinite(t) && (max == null || t > max)) max = t
  }
  return max
}
