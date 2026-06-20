// Photo-entry helpers shared by PhotosView (per-trip album) and
// AllPhotosView (cross-trip album, Punchlist 4). Pure JS — no React,
// no Vite-only features — so the Node unit tests can import these
// directly without a JSDOM shim.
//
// Date precedence (album sort + label):
//   1. memory.capturedAt  — explicit album date. Set automatically at
//      save time from EXIF / video container; overridable via the
//      dev-mode lightbox affordance for retroactively-uploaded photos.
//   2. ref.capturedAt     — per-photo EXIF for multi-photo memories
//      whose entries pre-date the migration, or photoExternalURLs
//      that came through a path that wrote it.
//   3. memory.createdAt   — the upload time. Rendered with the
//      '· uploaded' label so the chronology is honest.
//
// Multi-photo memory handling — legacy album composer (pre-M2) wrote
// memories with N photos + a single caption. The tile render shows
// the caption only on photoIndexInMemory === 0 and tags the rest as
// "2 of 5" so the album doesn't repeat the same sentence on every
// sibling. Single-photo memories (post-M2 dispatch composer) render
// normally.

import { stopIsBase } from './photoMatch.js'

export function flattenPhotoEntries(memories) {
  const out = []
  for (const m of memories || []) {
    const seenInThisMem = new Set()
    // photoRefs[] is the canonical multi-photo form. photoRef is a
    // back-compat mirror of photoRefs[0] — except after the M2 write
    // path, the two refs can hold different R2 keys for the same
    // image (workerSync.pushMemory uploaded the same blob twice on
    // some memories). URL-only dedup misses that case because the
    // R2 keys differ. So when photoRefs[] is populated, ignore the
    // single photoRef entirely. Falls back to photoRef only when
    // photoRefs[] is missing (legacy / Aurelia PostcardComposer).
    // See KNOWN_BUGS_HELEN_SURFACE.md duplicate-album-entries
    // finding (2026-05-27).
    const refs = m.photoRefs?.length
      ? m.photoRefs.filter(Boolean)
      : m.photoRef
        ? [m.photoRef]
        : []
    const memoryAt =
      typeof m.capturedAt === 'string' && m.capturedAt ? m.capturedAt : null
    // Pass 1 — collect every {url, ref} pair this memory yields,
    // post-URL-dedup, so we know the count before stamping per-tile
    // index labels in pass 2.
    const memoryEntries = []
    function push(url, ref) {
      if (!url || seenInThisMem.has(url)) return
      seenInThisMem.add(url)
      memoryEntries.push({ url, ref })
    }
    for (const ref of refs) push(refUrl(ref), ref)
    for (const ext of m.photoExternalURLs || []) {
      if (typeof ext === 'string' && ext) push(ext, null)
    }
    const total = memoryEntries.length
    memoryEntries.forEach(({ url, ref }, idx) => {
      const exifAt = ref?.capturedAt || null
      const realDate = memoryAt || exifAt
      // A video ref carries a posterUrl (its own `url` points at the .mp4, which
      // an <img> can't render). Detect video by poster presence OR a video/* mime
      // (both survive the worker round-trip) so the tile renders a still + play
      // badge and the lightbox renders a <video> instead of a dead <img>.
      const posterUrl =
        typeof ref?.posterUrl === 'string' && ref.posterUrl ? ref.posterUrl : null
      const isVideo =
        !!posterUrl ||
        (typeof ref?.mime === 'string' && ref.mime.startsWith('video/')) ||
        ref?.kind === 'video'
      out.push({
        key: `${m.id}::${url}`,
        memoryId: m.id,
        stopId: m.stopId || null,
        tripId: m.tripId || null,
        author: m.authorTraveler,
        caption: m.caption || m.text || '',
        // Per-photo position within the parent memory. Tile render uses
        // these to suppress the caption on every sibling after the
        // first and to show "N of M" instead.
        photoIndexInMemory: idx,
        photoCountInMemory: total,
        capturedAt: realDate || m.createdAt,
        capturedAtSource: realDate
          ? memoryAt
            ? 'memory'
            : 'exif'
          : 'createdAt',
        // The memory-level capturedAt the lightbox edits — so the
        // dev-mode override knows what value to seed its input with
        // even when this entry's ref also carries a (now-secondary)
        // EXIF date.
        memoryCapturedAt: memoryAt,
        memoryCreatedAt: m.createdAt || null,
        // EXIF lat/lng if present, otherwise null. The stop-association
        // fallback for the LOCATION label is applied during grouping
        // (we need the stop record to compute it).
        exifLat: Number.isFinite(ref?.lat) ? ref.lat : null,
        exifLng: Number.isFinite(ref?.lng) ? ref.lng : null,
        exifLocation:
          typeof ref?.locationLabel === 'string' ? ref.locationLabel : null,
        // Memory-level "from A to B" identity (migration 007) — same on
        // every entry of the memory; null for non-interstitial memories.
        // groupByStop reads it to render a between-stops section.
        interstitial:
          m.interstitial && typeof m.interstitial === 'object'
            ? m.interstitial
            : null,
        // Video: isVideo flips the tile to poster+play-badge and the lightbox to
        // a <video>; posterUrl is the renderable still (null for plain photos).
        isVideo,
        posterUrl,
        url,
        // The stored-object key (R2). Identity for cross-memory dedup: a
        // composed share-moment re-uses the SAME key as the photos it was built
        // from. Null for unsynced/local/external refs (no shared object), which
        // are therefore never collapsed.
        refKey: typeof ref?.key === 'string' && ref.key ? ref.key : null,
      })
    })
  }
  return out
}

function refUrl(ref) {
  if (!ref) return null
  if (typeof ref.url === 'string' && ref.url) return ref.url
  if (typeof ref === 'string') return ref
  return null
}

// The idb asset-store key whose blob renders this ref, or null when the ref
// renders from a durable url (r2 / external / legacy) instead. An idb- or
// pending-backed ref's own `url` is a SESSION object URL that dies on reload —
// so for those refs idb is the source of truth, not the persisted url. For a
// video the renderable still is its poster (no offline video store, by design),
// so we read `posterKey`. Pure (no idb call) — used by both the async hydration
// hook (useHydratedMemories) and the per-surface thread/postcard loaders so the
// "prefer idb for pending" rule lives in exactly one place.
export function refIdbAssetKey(ref) {
  if (!ref || typeof ref !== 'object') return null
  if (ref.storage !== 'pending' && ref.storage !== 'idb') return null
  return ref.kind === 'video'
    ? (typeof ref.posterKey === 'string' && ref.posterKey ? ref.posterKey : null)
    : (typeof ref.key === 'string' && ref.key ? ref.key : null)
}

// Keep one tile per STORED-OBJECT key. The only thing that legitimately shares
// an R2 key across memories is a composed share-moment re-using the exact
// photos it was built from — so this collapses that duplicate and nothing else.
// Entries without a key (unsynced/local/external refs, and every test fixture's
// placeholder data-URL) are passed through untouched: a shared URL is NOT
// identity (two distinct photos can reuse one placeholder), only a shared key
// is. On a collision keep the entry from the OLDER memory (the original always
// predates the composed grouping); order is otherwise preserved.
function dedupeByPhoto(entries) {
  const slotByKey = new Map()
  const out = []
  for (const e of entries) {
    const id = e?.refKey
    if (!id) {
      out.push(e)
      continue
    }
    const at = slotByKey.get(id)
    if (at === undefined) {
      slotByKey.set(id, out.length)
      out.push(e)
    } else if (memCreatedMs(e) < memCreatedMs(out[at])) {
      out[at] = e // older memory wins the tile
    }
  }
  return out
}

function memCreatedMs(e) {
  const t = e?.memoryCreatedAt ? Date.parse(e.memoryCreatedAt) : NaN
  // Unknown create-time sorts last so it never displaces a dated entry.
  return Number.isFinite(t) ? t : Infinity
}

// Per-trip grouping — used by PhotosView. Returns an array of
// { stopKey, stopName, dayLabel, timeLabel, isBase, _dayN, _stopOrder,
//   entries[] } sorted by day then stop position. `isBase` marks a
// "place you're staying" section (rendered "At [place]", time dropped).
export function groupByStop(entries, trip) {
  if (!entries.length) return []
  // Collapse the SAME photo referenced by more than one memory down to a
  // single library tile. A composed share-moment (ShareComposer) re-uses the
  // EXACT refs of the photos you picked, so without this the grid would show
  // each picked photo twice — once in its original spot, once under the moment.
  // Keep the entry from the OLDER memory (the original always predates the
  // composed grouping), so the surviving tile stays the photo's real home.
  // Only the library grids (PhotosView / Jonathan's JRecord / AllPhotosView via
  // groupAcrossTrips) route through groupByStop; the count/scan callers of
  // flattenPhotoEntries do not, so they keep every raw entry.
  entries = dedupeByPhoto(entries)
  const stopIndex = new Map()
  for (const day of trip?.days || []) {
    for (const stop of day.stops || []) {
      stopIndex.set(stop.id, { stop, day })
    }
  }
  // Resolve a between-stops ("from A to B") section's label + position from
  // its bounding stop ids. Anchors to the BEFORE stop so the section sorts
  // just after it (order + 0.5); falls back to the AFTER stop at a leading
  // day edge (order − 0.5, so it sorts just before it). Phrasing matches
  // reconcileDraft's interstitialTitle so the triage and the album read
  // identically (migration 007).
  function interstitialCtx(it) {
    const beforeCtx = it.before ? stopIndex.get(it.before) : null
    const afterCtx = it.after ? stopIndex.get(it.after) : null
    const beforeName = beforeCtx?.stop?.name || null
    const afterName = afterCtx?.stop?.name || null
    let label
    if (beforeName && afterName) label = `From ${beforeName} to ${afterName}`
    else if (afterName) label = `Before ${afterName}`
    else if (beforeName) label = `After ${beforeName}`
    else label = 'In transit'
    const orderIn = (ctx, id) => (ctx.day?.stops || []).findIndex((s) => s.id === id)
    if (beforeCtx) {
      const pos = orderIn(beforeCtx, it.before)
      return {
        label,
        dayN: beforeCtx.day?.n ?? 99,
        stopOrder: (pos >= 0 ? pos : 99) + 0.5,
        dayLabel: beforeCtx.day?.date || beforeCtx.day?.title || '',
      }
    }
    if (afterCtx) {
      const pos = orderIn(afterCtx, it.after)
      return {
        label,
        dayN: afterCtx.day?.n ?? 99,
        stopOrder: (pos >= 0 ? pos : 0) - 0.5,
        dayLabel: afterCtx.day?.date || afterCtx.day?.title || '',
      }
    }
    return { label, dayN: 99, stopOrder: 99, dayLabel: '' }
  }

  const buckets = new Map()
  for (const entry of entries) {
    // A reconciled interstitial photo keeps stopId = null and carries its
    // "from A to B" identity separately. A real stopId always wins — only a
    // genuinely stopless photo with an interstitial routes to a between-stops
    // section; everything else uses the stop path unchanged.
    const it =
      !entry.stopId && entry.interstitial && typeof entry.interstitial === 'object'
        ? entry.interstitial
        : null
    if (it) {
      const ic = interstitialCtx(it)
      const sid = `__interstitial:${it.before || 'start'}__${it.after || 'end'}`
      if (!buckets.has(sid)) buckets.set(sid, [])
      buckets.get(sid).push({
        ...entry,
        stopName: ic.label,
        stopAddress: null,
        // No stop to file under — the section header already says "from A to
        // B", so the per-tile label is just a stored label or raw coords.
        locationLabel:
          entry.exifLocation ||
          (entry.exifLat != null && entry.exifLng != null
            ? `${entry.exifLat.toFixed(3)}, ${entry.exifLng.toFixed(3)}`
            : null),
        _dayN: ic.dayN,
        _stopOrder: ic.stopOrder,
        _dayLabel: ic.dayLabel,
        _timeLabel: '',
      })
      continue
    }
    const sid = entry.stopId || '__unassigned'
    if (!buckets.has(sid)) buckets.set(sid, [])
    const ctx = stopIndex.get(sid) || null
    // A base (a place you're staying) renders as an "At [place]" section: it
    // carries an `isBase` flag and drops the clock time, since it's a place,
    // not a timed event.
    const isBase = stopIsBase(ctx?.stop)
    buckets.get(sid).push({
      ...entry,
      stopName: ctx?.stop?.name || 'Unfiled',
      stopAddress: ctx?.stop?.address || null,
      // Label precedence: a stored/human label first, then the stop this
      // photo is filed to (address → name), and only as a LAST resort the
      // raw EXIF coordinates — so a finite GPS fix never replaces a
      // friendly stop name with a decimal pair. (Coords → place-name
      // reverse-geocoding lives only in the backfill triage today; the
      // album render has no geocoder.)
      locationLabel:
        entry.exifLocation ||
        ctx?.stop?.address ||
        ctx?.stop?.name ||
        (entry.exifLat != null && entry.exifLng != null
          ? `${entry.exifLat.toFixed(3)}, ${entry.exifLng.toFixed(3)}`
          : null),
      _dayN: ctx?.day?.n ?? 99,
      _stopOrder: ctx?.stop?.id
        ? (ctx.day?.stops || []).findIndex((s) => s.id === ctx.stop.id)
        : 99,
      _dayLabel: ctx?.day?.date || ctx?.day?.title || '',
      _timeLabel: isBase ? '' : ctx?.stop?.time || '',
      _isBase: isBase,
    })
  }
  const groups = []
  for (const [stopKey, list] of buckets) {
    // Sort within group by capture date ascending per spec.
    list.sort((a, b) =>
      (a.capturedAt || '') < (b.capturedAt || '') ? -1 : 1
    )
    const first = list[0]
    groups.push({
      stopKey,
      stopName: first?.stopName || 'Unfiled',
      dayLabel: first?._dayLabel || '',
      timeLabel: first?._timeLabel || '',
      isBase: first?._isBase || false,
      _dayN: first?._dayN ?? 99,
      _stopOrder: first?._stopOrder ?? 99,
      entries: list,
    })
  }
  // Order groups: day asc, then stop position within day asc.
  groups.sort((a, b) => {
    if (a._dayN !== b._dayN) return a._dayN - b._dayN
    return a._stopOrder - b._stopOrder
  })
  return groups
}

// Cross-trip grouping (Punchlist 4). Walks every (trip, memories)
// pair the caller hands us, flattens to per-photo entries, and
// groups by trip → stop. Returns:
//   [{
//     tripId, tripTitle, tripStartDate, tripEndDate, tripDayCount,
//     stops: [ { stopKey, stopName, dayLabel, timeLabel, entries[] } ],
//   }]
// sorted by newest trip first (trip.startDate descending). Within a
// trip the stop ordering matches groupByStop's output. Entries are
// enriched with tripId + tripTitle so the lightbox can render
// "Trip name" as an extra line. Empty trips are filtered out.
export function groupAcrossTrips(perTrip) {
  const out = []
  for (const { trip, memories } of perTrip || []) {
    if (!trip) continue
    const entries = flattenPhotoEntries(memories).map((e) => ({
      ...e,
      tripId: trip.id,
      tripTitle: trip.title || trip.id,
    }))
    if (!entries.length) continue
    const stops = groupByStop(entries, trip).map((g) => ({
      ...g,
      tripId: trip.id,
      tripTitle: trip.title || trip.id,
      // Enrich each entry with the trip context — the lightbox reads
      // it from the entry directly so we don't need to thread the
      // section context through props.
      entries: g.entries.map((e) => ({
        ...e,
        tripId: trip.id,
        tripTitle: trip.title || trip.id,
      })),
    }))
    out.push({
      tripId: trip.id,
      tripTitle: trip.title || trip.id,
      tripStartDate: trip.dateRangeStart || trip.startDate || null,
      tripEndDate: trip.dateRangeEnd || trip.endDate || null,
      stops,
    })
  }
  // Newest trip first by start date. Trips with no start date sort to
  // the bottom so they don't punch above real-dated trips.
  out.sort((a, b) => {
    const ad = a.tripStartDate || ''
    const bd = b.tripStartDate || ''
    if (ad === bd) return 0
    if (!ad) return 1
    if (!bd) return -1
    return ad < bd ? 1 : -1
  })
  return out
}

export function firstLine(s) {
  if (!s) return ''
  const idx = s.indexOf('\n')
  return idx >= 0 ? s.slice(0, idx) : s
}

export function formatShortDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export function formatFullDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
