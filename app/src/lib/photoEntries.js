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

export function flattenPhotoEntries(memories) {
  const out = []
  for (const m of memories || []) {
    const seenInThisMem = new Set()
    const refs = [m.photoRef, ...(m.photoRefs || [])].filter(Boolean)
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
        url,
      })
    })
  }
  return out
}

export function refUrl(ref) {
  if (!ref) return null
  if (typeof ref.url === 'string' && ref.url) return ref.url
  if (typeof ref === 'string') return ref
  return null
}

// Per-trip grouping — used by PhotosView. Returns an array of
// { stopKey, stopName, dayLabel, timeLabel, _dayN, _stopOrder,
//   entries[] } sorted by day then stop position.
export function groupByStop(entries, trip) {
  if (!entries.length) return []
  const stopIndex = new Map()
  for (const day of trip?.days || []) {
    for (const stop of day.stops || []) {
      stopIndex.set(stop.id, { stop, day })
    }
  }
  const buckets = new Map()
  for (const entry of entries) {
    const sid = entry.stopId || '__unassigned'
    if (!buckets.has(sid)) buckets.set(sid, [])
    const ctx = stopIndex.get(sid) || null
    buckets.get(sid).push({
      ...entry,
      stopName: ctx?.stop?.name || 'Unfiled',
      stopAddress: ctx?.stop?.address || null,
      locationLabel:
        entry.exifLocation ||
        (entry.exifLat != null && entry.exifLng != null
          ? `${entry.exifLat.toFixed(3)}, ${entry.exifLng.toFixed(3)}`
          : ctx?.stop?.address || ctx?.stop?.name || null),
      _dayN: ctx?.day?.n ?? 99,
      _stopOrder: ctx?.stop?.id
        ? (ctx.day?.stops || []).findIndex((s) => s.id === ctx.stop.id)
        : 99,
      _dayLabel: ctx?.day?.date || ctx?.day?.title || '',
      _timeLabel: ctx?.stop?.time || '',
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
