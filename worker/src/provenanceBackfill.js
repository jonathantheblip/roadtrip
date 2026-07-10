// provenanceBackfill.js — the RETROACTIVE provenance tagging pass (Build 2,
// FAMILY_TRIPS_VISION §14): for every EXISTING ref that already carries a
// value on a field (lat/lng or offsetMinutes) but no `prov` tag for it yet,
// classify WHICH TIER that value came from and tag it. Written once, but as
// an idempotent, safely-rerunnable pass — not a throwaway script — since the
// archive keeps growing and this must stay correct against future imports
// too, not just tonight's snapshot.
//
// Classification (earns the 'exif' default by exhausting the known-inferred
// fingerprint FIRST, per the plan — never assume):
//   • has lat/lng, no prov.gps            → 'exif' (the archive's current
//     20 GPS refs are all confirmed real EXIF reads — zero scan-tool writes
//     exist yet, so this is exhaustively correct today).
//   • has offsetMinutes, no prov.off, AND the memory's OWN ID is in the exact
//     hardcoded known-manual-batch ID list below → 'inferred-manual' (the
//     5-ref nyc-rafa-2026 batch and the 31-ref provincetown batch, both
//     confirmed direct-D1 UPDATEs, never scripted/committed, never EXIF).
//     Classified on IDENTITY, never on a mutable field: `updated_at` is
//     stamped fresh on EVERY unrelated `POST /memories` write to any of these
//     41 rows (worker/src/index.js), so a timestamp fingerprint silently goes
//     stale the moment a caption is edited or a photo re-filed — misclassifying
//     the ref as 'exif' (REFERENCE tier, permanently un-overwritable per
//     memoryStore.js's tieredWriteAllowed) forever. A memory's own `id` is
//     immutable for its whole life, so identity is the only safe key here.
//   • has offsetMinutes, no prov.off, id not in the known list
//     → 'exif' (should not exist in the archive per the audit, but coded
//     defensively for future archive growth before this ships).
//
// SAFE by construction, same shape as sceneBackfill.js:
//  • idempotent — a field that already carries its prov key is skipped;
//  • OCC-guarded — the UPDATE matches the stored updated_at;
//  • does NOT bump updated_at — pure metadata enrichment, not a family edit;
//  • bounded — at most `limit` refs actually tagged per call.
// Skips `volleyball-2026` entirely (confirmed fixture/test data).

const SKIP_TRIP_IDS = new Set(['volleyball-2026'])

// The two real one-off manual D1 UPDATE batches (2026-07-10 audit), identified
// by their EXACT memory ids — never by a mutable field like updated_at, which
// is stamped on every unrelated write (see header). Both batches wrote
// offsetMinutes:-240 directly via a raw D1 UPDATE, never through EXIF or the
// re-source scan. Freshly re-derived from live prod D1 the same night this
// fix landed (not copied from an earlier, possibly-stale audit number):
//   nyc-rafa-2026          (5 refs)  — SELECT id FROM memories WHERE trip_id='nyc-rafa-2026' AND updated_at=1783453041025
//   provincetown-july-4th (31 refs) — SELECT id FROM memories WHERE trip_id LIKE 'provincetown%' AND updated_at=1783458189845
const KNOWN_MANUAL_BATCH_MEMORY_IDS = new Set([
  // nyc-rafa-2026 (5)
  'mem_mraxts7d_tcl51',
  'mem_mraxtsll_8ramg',
  'mem_mraxttr8_ge35u',
  'mem_mraxtucw_5ktkk',
  'mem_mraxtw2r_6lnlv',
  // provincetown-july-4th-2026-07-2 (31)
  'mem_mr6khc1v_f4z5i',
  'mem_mr6khcsu_duwo1',
  'mem_mr6khddl_5u010',
  'mem_mr6khdys_n3lz3',
  'mem_mr6khejs_lbnmi',
  'mem_mr6khf1y_jos9y',
  'mem_mr6khfn0_x6tk9',
  'mem_mr6khgei_u3976',
  'mem_mr6khgyq_p43ap',
  'mem_mr6khhq8_m0196',
  'mem_mr6khifm_kup3e',
  'mem_mr6khjgu_181jw',
  'mem_mr6z96qw_ss87a',
  'mem_mr6z9c5f_69rzf',
  'mem_mr6z9glo_9gc1b',
  'mem_mr6z9v8o_zji9v',
  'mem_mr6z9zqr_j2lqb',
  'mem_mr6za0xi_vfcnd',
  'mem_mr6za3c1_p9iha',
  'mem_mr6za5vk_m161t',
  'mem_mr6za9k0_pzrk3',
  'mem_mr6zad3x_grknd',
  'mem_mr862shh_6lnht',
  'mem_mr862std_wofjj',
  'mem_mr862tb4_si8bq',
  'mem_mr862tnm_alobq',
  'mem_mr862u4b_wdd6i',
  'mem_mr862uo8_fsc5a',
  'mem_mr862v23_3l7aj',
  'mem_mr862vjj_tmlql',
  'mem_mr862ysb_ciqyp',
])

export function provenanceBackfillLimit(env) {
  const raw = env?.PHOTO_PROV_BACKFILL_LIMIT
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 250
}

// Pure — exported for the classification unit tests. Returns 'exif' | null
// (null = nothing to tag: no lat/lng at all, or already tagged).
export function classifyGpsProv(ref) {
  if (!ref || typeof ref !== 'object') return null
  if (!(Number.isFinite(ref.lat) && Number.isFinite(ref.lng))) return null
  if (ref.prov?.gps) return null
  return 'exif'
}

// Pure — exported for the classification unit tests. `memoryId` is the
// MEMORY ROW's own immutable `id` — the identity key, never a mutable field
// like updated_at (see header: that stamp is rewritten on every unrelated
// write to the row, so keying on it silently loses the fingerprint over time).
// Returns 'inferred-manual' | 'exif' | null (null = nothing to tag).
export function classifyOffsetProv(ref, memoryId) {
  if (!ref || typeof ref !== 'object') return null
  if (!Number.isFinite(ref.offsetMinutes)) return null
  if (ref.prov?.off) return null
  if (KNOWN_MANUAL_BATCH_MEMORY_IDS.has(memoryId)) {
    // Defensive secondary check: the known batches wrote offsetMinutes:-240
    // with no lat, direct via D1. Identity alone is enough to classify (that's
    // the whole point of this fix), but if the field shape has drifted since
    // this was written, LOUDLY say so — data may have changed underneath us,
    // and silent wrongness is worse than a loud warning a human can go check.
    const hasLat = Number.isFinite(ref.lat) && Number.isFinite(ref.lng)
    if (ref.offsetMinutes !== -240 || hasLat) {
      console.error(
        `[provenance-backfill] SHAPE DRIFT on known-manual-batch memory ${memoryId}: ` +
          `expected offsetMinutes=-240 and no lat/lng, got offsetMinutes=${ref.offsetMinutes} ` +
          `lat=${ref.lat} lng=${ref.lng}. Classifying as inferred-manual by IDENTITY anyway — ` +
          `this ref is worth a human look.`
      )
    }
    return 'inferred-manual'
  }
  return 'exif'
}

export async function backfillProvenanceTags(env, { tripId, dryRun = false, limit } = {}) {
  const cap = Number.isFinite(limit) ? limit : provenanceBackfillLimit(env)
  const sql = tripId
    ? 'SELECT id, trip_id, photo_r2_keys_json, updated_at FROM memories WHERE trip_id = ? AND deleted_at IS NULL'
    : 'SELECT id, trip_id, photo_r2_keys_json, updated_at FROM memories WHERE deleted_at IS NULL'
  const stmt = tripId ? env.DB.prepare(sql).bind(tripId) : env.DB.prepare(sql)
  const { results: rows } = await stmt.all()
  const stats = {
    dryRun,
    refsScanned: 0,
    gpsTagged: 0,
    offTagged: 0,
    alreadyTagged: 0,
    memsWritten: 0,
    hitLimit: false,
  }
  let attempted = 0
  for (const r of rows || []) {
    if (stats.hitLimit) break
    if (SKIP_TRIP_IDS.has(r.trip_id)) continue
    let refs
    try {
      refs = JSON.parse(r.photo_r2_keys_json || '[]')
    } catch {
      continue
    }
    if (!Array.isArray(refs) || !refs.length) continue
    let changed = false
    for (const ref of refs) {
      if (!ref || typeof ref !== 'object') continue
      const hasGps = Number.isFinite(ref.lat) && Number.isFinite(ref.lng)
      const hasOffset = Number.isFinite(ref.offsetMinutes)
      if (!hasGps && !hasOffset) continue // nothing this pass could ever tag on this ref
      stats.refsScanned++
      const gpsTag = classifyGpsProv(ref)
      const offTag = classifyOffsetProv(ref, r.id)
      if (!gpsTag && !offTag) {
        stats.alreadyTagged++
        continue
      }
      if (attempted >= cap) {
        stats.hitLimit = true
        continue
      }
      attempted++
      if (gpsTag) {
        stats.gpsTagged++
        if (!dryRun) {
          ref.prov = { ...ref.prov, gps: gpsTag }
          changed = true
        }
      }
      if (offTag) {
        stats.offTagged++
        if (!dryRun) {
          ref.prov = { ...ref.prov, off: offTag }
          changed = true
        }
      }
    }
    if (changed && !dryRun) {
      // OCC-guarded, never bumps updated_at — pure metadata enrichment.
      const upd = await env.DB.prepare(
        'UPDATE memories SET photo_r2_keys_json = ? WHERE id = ? AND updated_at = ? AND deleted_at IS NULL'
      )
        .bind(JSON.stringify(refs), r.id, r.updated_at)
        .run()
      if ((upd?.meta?.changes ?? 0) > 0) stats.memsWritten++
    }
  }
  return stats
}
