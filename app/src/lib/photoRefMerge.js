// photoRefs[] merge helper. Pure JS, no React / IDB / fetch — so
// the dedup logic stays Node-testable without pulling the rest of
// the memory pipeline into the import graph.
//
// Used by the backfill upload path: when re-attaching a photo to a
// metadata-only memory record, we splice the new ref into the
// existing record's photoRefs[] without duplicating an entry the
// record already had.

// Append `newRef` to `existing.photoRefs[]`, deduping by `key`.
// Existing refs come first; the legacy `photoRef` field is folded
// into the array (and not duplicated when already present). Null
// entries in the existing array are dropped.
export function mergeRefIntoExisting(existing, newRef) {
  const out = []
  const seen = new Set()
  for (const r of existing?.photoRefs || []) {
    if (!r) continue
    const k = r.key || r.url
    if (k && seen.has(k)) continue
    if (k) seen.add(k)
    out.push(r)
  }
  if (existing?.photoRef && !out.some((r) => sameKey(r, existing.photoRef))) {
    out.push(existing.photoRef)
    const k = existing.photoRef.key || existing.photoRef.url
    if (k) seen.add(k)
  }
  if (newRef) {
    const nk = newRef.key || newRef.url
    if (!nk || !seen.has(nk)) out.push(newRef)
  }
  return out
}

function sameKey(a, b) {
  return (a?.key && b?.key && a.key === b.key) || (a?.url && b?.url && a.url === b.url)
}
