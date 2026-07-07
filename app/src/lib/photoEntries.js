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

import { stopIsBase, tripImplicitBase, implicitBaseIdForDay, isHomeDay } from './photoMatch.js'
import { parseStopTime } from './photoBackfill.js'
import { partsWithDays } from './tripParts.js'
import { localDateIso, nowMinutesInZone } from './localDate.js'
import { spanWords } from './evidence.js'

// The album entry's identity: one memory can yield several tiles (multi-photo
// refs), so a tile is (memoryId, rendered url). Exported so a surface that
// REPLACES a ref's url in place (the "add it again with sound" swap) can
// re-key its open lightbox onto the replacement instead of watching the old
// key vanish — the one place this format is defined.
export function photoEntryKey(memoryId, url) {
  return `${memoryId}::${url}`
}

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
        key: photoEntryKey(m.id, url),
        memoryId: m.id,
        stopId: m.stopId || null,
        // Stop-filing provenance (mig 017) rides the entry so the lightbox can
        // render the honest "moved because…" / "locked by a person" note (Ch3).
        // Null on every legacy row → the note simply doesn't render.
        stopProv: m.stopProv || null,
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
        // Video proof (#2/#4, foolproof import): the shrunk byte size + the clip
        // length ride the ref so the saved tile can show the size chip (bottom-
        // left) + duration (top-right). Null for photos / legacy videos with no
        // stored bytes (the chip just doesn't render — never a fake size).
        videoBytes: Number.isFinite(ref?.bytes) ? ref.bytes : null,
        durationMs: Number.isFinite(ref?.durationMs) ? ref.durationMs : null,
        // Sound outcome recorded at encode time: 'carried' | 'none' (source
        // itself was silent) | 'lost' (source HAD sound the saved copy
        // doesn't — the only value that earns a tile tag). Null = legacy ref,
        // unknown → no tag, never a guess.
        sound:
          ref?.sound === 'carried' || ref?.sound === 'none' || ref?.sound === 'lost'
            ? ref.sound
            : null,
        // Not yet on R2 — a pending video ref is in the device outbox (on its way
        // or, rarely, stuck). The tile cross-references the live queue for the
        // stuck/uploading distinction; this is the "not backed up yet" flag.
        pending: ref?.storage === 'pending',
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

// A location label that trim/case-insensitively equals the section title it
// renders under is a duplicate, not information — null it. Distinct address
// vs name (and any per-photo EXIF label that differs) is kept untouched.
function suppressHeaderEcho(label, header) {
  if (!label || !header) return label || null
  return label.trim().toLowerCase() === header.trim().toLowerCase() ? null : label
}

// ── Self-healing filing (settled rule, live-trip 2026-07-05 + VISION §1) ────
// "In transit" is never a junk drawer: an in-transit photo files BETWEEN its
// two stops; without two true (clock-timed) stops it files CHRONOLOGICALLY
// into its day; only genuinely undateable photos remain at the bottom. A saved
// bracket (or stopId) can DIE as the plan changes — stop deleted, re-timed,
// replaced — so placement is re-derived at RENDER time from TODAY's plan and
// keeps healing as the plan changes (order-independence).

// Sub-day sort slot for a day-anchored loose section ("In transit"/"Unfiled"
// with no bracketing clock stops): after every planned section of its day (a
// real day never has 50 stops; planned sections sort by stop index, brackets
// by index ± 0.5), below the 99 unknown sentinel. The fraction-of-day of the
// section's FIRST (earliest-captured) entry is added so two same-day loose
// sections order chronologically — the deterministic tie-break.
const DAY_ANCHOR_ORDER = 50

// One zone per trip day — the zone of the leg that OWNS the day (leg tz →
// trip default → null = device-local). Built once per grouping pass from
// partsWithDays, THE canonical day→part mapping (its clamped windows already
// settle the shared checkout/arrival day on the ARRIVING leg), so the album
// never grows a second opinion about which leg a day belongs to. Legacy trips
// (one derived wrapper) resolve every day to trip.tz / device-local — the
// pre-composite behavior, byte-identical.
function buildDayTz(trip) {
  const byIso = new Map()
  const tripTz = trip?.tz != null ? trip.tz : null
  for (const part of partsWithDays(trip)) {
    const tz = part?.tz != null ? part.tz : tripTz
    for (const day of part.days || []) {
      if (day?.isoDate && !byIso.has(day.isoDate)) byIso.set(day.isoDate, tz)
    }
  }
  return { byIso, tripTz }
}

// The trip day an entry's capture instant belongs to (the VISION one-clock
// commitment) — { day, iso, tz, wallMin } or null when capturedAt is
// unparseable or no day claims it. Membership is judged PER-DAY, in the zone
// of the leg that OWNS the day: a day claims the instant iff the instant's
// wall date IN THAT DAY'S OWN ZONE equals day.isoDate. That is the exact test
// the evidence engine runs (photosForDay: localDateIso(at, legTz) ===
// isoDate), so album day-attribution and the settle card's evidence can never
// disagree — and it is device-independent by construction. (A provisional leg
// picked from the DEVICE's calendar is NOT: it filed one photo differently on
// a Tokyo phone vs a New-York phone and compared Tokyo wall minutes against
// Honolulu-authored stop times — the C1 half-mirror bug.) Cross-zone edges
// stay honest: an eastward jump can make two days claim one instant (both
// calendars contain it) — the first day in trip order wins, identically on
// every device; a westward dateline seam can leave NO day claiming it
// (Tokyo's calendar has left its leg, Honolulu's hasn't begun) — genuinely
// unattributable → the caller's residue path, exactly as photosForDay refuses
// it for both days. NOTE: photoMatch still bins by a UTC day window at IMPORT
// time — that is the known parked divergence (healed later by the one-clock
// work); do not copy its window here.
function dayForCapture(trip, entry, dayTz) {
  const ms = Date.parse(entry?.capturedAt || '')
  if (!Number.isFinite(ms)) return null
  const d = new Date(ms)
  for (const day of trip?.days || []) {
    if (!day?.isoDate) continue
    const tz = dayTz.byIso.has(day.isoDate) ? dayTz.byIso.get(day.isoDate) : dayTz.tripTz
    if (localDateIso(d, tz) !== day.isoDate) continue
    // Wall-clock minutes in the SAME zone that claimed the day, so the in-day
    // bracket comparison, the chronological slot, and the eyebrow band can
    // never disagree with the day pick about what "local" means. (All entries
    // of one day share this zone — the band's zone is a per-day constant.)
    return { day, iso: day.isoDate, tz, wallMin: nowMinutesInZone(tz, d) }
  }
  return null
}

// A day's clock-timed stops as { stop, order, wallMin }, time-ascending.
// parseStopTime anchors a stop's "3:45 PM" at the day's UTC midnight, so
// minutes-from-that-midnight IS the stop's wall-clock time — directly
// comparable to the photo's leg-local wall minutes above without building a
// second absolute-time window. Loose labels ('Evening', '') are excluded: the
// settled rule brackets only between TRUE clock stops (photoMatch's own
// sortedClockStops rule). `order` is the stop's index in day.stops — the same
// unit the album's section sort uses — so the ± 0.5 slot arithmetic below
// reuses the existing convention exactly.
function clockStopsOf(day) {
  const midnight = Date.parse(`${day?.isoDate || ''}T00:00:00.000Z`)
  if (!Number.isFinite(midnight)) return []
  const out = []
  ;(day.stops || []).forEach((stop, order) => {
    const parsed = parseStopTime(stop?.time, day.isoDate)
    if (parsed.loose || !Number.isFinite(parsed.at)) return
    out.push({ stop, order, wallMin: (parsed.at - midnight) / 60_000 })
  })
  return out.sort((a, b) => a.wallMin - b.wallMin)
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
  // The trip's implicit base ("At the cabin") isn't a planned stop, so resolve it
  // here per-day with the same day-scoped id the matcher files photos to — else a
  // base-filed photo would render under "Unfiled". Per day → one "At [place]"
  // section per day, mirroring a planned per-day base stop.
  const baseTemplate = tripImplicitBase(trip)
  for (const day of trip?.days || []) {
    for (const stop of day.stops || []) {
      stopIndex.set(stop.id, { stop, day })
    }
    if (baseTemplate && day.isoDate && !isHomeDay(day)) {
      const id = implicitBaseIdForDay(day.isoDate)
      stopIndex.set(id, { stop: { ...baseTemplate, id }, day })
    }
  }
  // Resolve a between-stops ("from A to B") section's label + position from
  // its SAVED bounding stop ids. Anchors to the BEFORE stop so the section
  // sorts just after it (order + 0.5); falls back to the AFTER stop at a
  // leading day edge (order − 0.5, so it sorts just before it). Phrasing
  // matches reconcileDraft's interstitialTitle so the triage and the album
  // read identically (migration 007). Serves the paths where the saved
  // brackets still describe today's plan; a bracket that DIED is re-derived
  // in the healing branch below instead of falling through to the bare
  // "In transit" row this returns.
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
  // Buckets whose eyebrow carries WHEN instead of a stop clock — the
  // day-anchored loose sections. Maps bucket key → the leg zone the day pick
  // used, so the hour band below is computed in the same clock.
  const banded = new Map()
  // The per-day zone index for the healing paths, built lazily ONCE per pass:
  // an album where everything resolves never pays for partsWithDays.
  let dayTzCache = null
  const getDayTz = () => (dayTzCache = dayTzCache || buildDayTz(trip))
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
      const beforeCtx = it.before ? stopIndex.get(it.before) : null
      const afterCtx = it.after ? stopIndex.get(it.after) : null
      let sid
      let ic
      if (beforeCtx && afterCtx) {
        // Both saved brackets resolve in today's plan → the saved placement
        // IS current. Key + render stay byte-identical to the pre-healing
        // album (G5) — healed same-pair entries below merge into this bucket.
        sid = `__interstitial:${it.before || 'start'}__${it.after || 'end'}`
        ic = interstitialCtx(it)
      } else {
        // A bracket died (or was never set — the old producer saved both
        // null). Re-derive placement from the entry's own capture time
        // against TODAY's plan, in this order:
        //   1. its leg-local day has clock stops → re-bracket between them;
        //   2. a surviving saved bracket that doesn't contradict the photo's
        //      own day → keep today's "Before X"/"After X" render (a live
        //      stop name beats a bare time band);
        //   3. a derivable day → anchor chronologically INTO that day;
        //   4. nothing derivable → the honest bottom residue.
        const cap = dayForCapture(trip, entry, getDayTz())
        const clock = cap ? clockStopsOf(cap.day) : []
        const savedCtx = beforeCtx || afterCtx
        if (cap && clock.length) {
          // RE-BRACKET AT RENDER. Same comparison the import matcher uses
          // (last stop at-or-before wins `before`, first later wins `after`),
          // but in leg-local wall minutes, against the CURRENT stops.
          let b = null
          let a = null
          for (const c of clock) {
            if (c.wallMin <= cap.wallMin) b = c
            else {
              a = c
              break
            }
          }
          // Phrasing mirrors interstitialCtx / reconcileDraft.interstitialTitle
          // so a healed section reads exactly like a saved one.
          const bName = b?.stop?.name || null
          const aName = a?.stop?.name || null
          let label
          if (bName && aName) label = `From ${bName} to ${aName}`
          else if (aName) label = `Before ${aName}`
          else if (bName) label = `After ${bName}`
          else label = 'In transit'
          // Keyed by the DERIVED (live) pair — merges with a still-valid
          // saved bucket of the same pair, never with another day's orphans.
          sid = `__interstitial:${b ? b.stop.id : 'start'}__${a ? a.stop.id : 'end'}`
          ic = {
            label,
            dayN: cap.day.n ?? 99,
            // The existing slot arithmetic: just after the before-stop, or
            // just before the after-stop at a leading day edge.
            stopOrder: b ? b.order + 0.5 : a.order - 0.5,
            dayLabel: cap.day.date || cap.day.title || '',
          }
        } else if (savedCtx && (!cap || savedCtx.day?.isoDate === cap.iso)) {
          // ONE saved bracket still stands and the photo's own day (when
          // derivable) agrees with it → today's exact one-bracket render.
          // Kept deliberately: "Before First Stop" on a clock-less day is
          // more informative than a bare "In transit" band.
          sid = `__interstitial:${it.before || 'start'}__${it.after || 'end'}`
          ic = interstitialCtx(it)
        } else if (cap) {
          // DAY-ANCHORED CHRONOLOGICAL FALLBACK: no true clock stops to file
          // between → the photo files into its day, ordered by its own hour;
          // the eyebrow gets the day + an hour band (computed per-bucket
          // below). Day-scoped key: two days' orphans must never merge into
          // one bucket with the first entry's metadata poisoning the header.
          sid = `__interstitial:${cap.iso}:start__end`
          ic = {
            label: 'In transit',
            dayN: cap.day.n ?? 99,
            stopOrder: DAY_ANCHOR_ORDER + cap.wallMin / 1440,
            dayLabel: cap.day.date || cap.day.title || '',
          }
          if (!banded.has(sid)) banded.set(sid, { tz: cap.tz })
        } else {
          // TRUE RESIDUE — undateable AND unbracketable. One shared bottom
          // bucket (never one per dead-id pair), honest empty eyebrow.
          sid = '__interstitial:start__end'
          ic = { label: 'In transit', dayN: 99, stopOrder: 99, dayLabel: '' }
        }
      }
      if (!buckets.has(sid)) buckets.set(sid, [])
      buckets.get(sid).push({
        ...entry,
        stopName: ic.label,
        stopAddress: null,
        // No stop to file under — the section header already says "from A to
        // B", so the per-tile label is just a stored label or raw coords.
        // (Same header-echo suppression as the stop path — a stored label
        // that just repeats the section title says nothing twice.)
        locationLabel: suppressHeaderEcho(
          entry.exifLocation ||
            (entry.exifLat != null && entry.exifLng != null
              ? `${entry.exifLat.toFixed(3)}, ${entry.exifLng.toFixed(3)}`
              : null),
          ic.label
        ),
        _dayN: ic.dayN,
        _stopOrder: ic.stopOrder,
        _dayLabel: ic.dayLabel,
        _timeLabel: '',
      })
      continue
    }
    const ctx = stopIndex.get(entry.stopId || '__unassigned') || null
    if (!ctx) {
      // THE UNFILED DRAWER, day-anchored. A stopId that resolves to nothing
      // (the stop was deleted / edited into a new id) and a plain unassigned
      // photo are the same thing to the family: a photo with no place. With a
      // dateable capture it files chronologically into its day — one "Unfiled"
      // section per day (never one per dead id), same day + hour-band eyebrow
      // as the in-transit fallback. Only a photo whose date lands outside
      // every trip day (or doesn't parse) stays in the true bottom residue.
      const cap = dayForCapture(trip, entry, getDayTz())
      const sid = cap ? `__unfiled:${cap.iso}` : '__unassigned'
      if (!buckets.has(sid)) buckets.set(sid, [])
      if (cap && !banded.has(sid)) banded.set(sid, { tz: cap.tz })
      buckets.get(sid).push({
        ...entry,
        stopName: 'Unfiled',
        stopAddress: null,
        // No stop to inherit a label from — a stored label or raw coords
        // only (same chain the pre-healing unfiled path used).
        locationLabel: suppressHeaderEcho(
          entry.exifLocation ||
            (entry.exifLat != null && entry.exifLng != null
              ? `${entry.exifLat.toFixed(3)}, ${entry.exifLng.toFixed(3)}`
              : null),
          'Unfiled'
        ),
        _dayN: cap ? cap.day.n ?? 99 : 99,
        _stopOrder: cap ? DAY_ANCHOR_ORDER + cap.wallMin / 1440 : 99,
        _dayLabel: cap ? cap.day.date || cap.day.title || '' : '',
        _timeLabel: '',
        _isBase: false,
      })
      continue
    }
    const sid = entry.stopId
    if (!buckets.has(sid)) buckets.set(sid, [])
    // A base (a place you're staying) renders as an "At [place]" section: it
    // carries an `isBase` flag and drops the clock time, since it's a place,
    // not a timed event.
    const isBase = stopIsBase(ctx.stop)
    const stopName = ctx.stop?.name || 'Unfiled'
    buckets.get(sid).push({
      ...entry,
      stopName,
      stopAddress: ctx?.stop?.address || null,
      // Label precedence: a stored/human label first, then the stop this
      // photo is filed to (address → name), and only as a LAST resort the
      // raw EXIF coordinates — so a finite GPS fix never replaces a
      // friendly stop name with a decimal pair. (Coords → place-name
      // reverse-geocoding lives only in the backfill triage today; the
      // album render has no geocoder.) A label that merely repeats the
      // stop name is suppressed — the section header (and the lightbox's
      // stop line) already says it, so echoing it doubled the text (the
      // "690 COMMERCIAL ST…" twice-in-a-row bug).
      locationLabel: suppressHeaderEcho(
        entry.exifLocation ||
          ctx?.stop?.address ||
          ctx?.stop?.name ||
          (entry.exifLat != null && entry.exifLng != null
            ? `${entry.exifLat.toFixed(3)}, ${entry.exifLng.toFixed(3)}`
            : null),
        stopName
      ),
      _dayN: ctx?.day?.n ?? 99,
      // The implicit base ("At the cabin") leads its day deliberately (it's the
      // place the day hangs off, not a timed event) — explicit, not an accidental
      // findIndex(-1). A planned stop sorts by its position in the day.
      _stopOrder: ctx?.stop?._implicitBase
        ? -1
        : ctx?.stop?.id
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
    // A day-anchored loose section carries WHEN instead of a stop clock: the
    // eyebrow reads "JUL 2 · 2–5" — the record's spanWords hour voice (bare
    // 12-hour, "around N" when the span collapses), spanning the section's
    // first→last capture in the same leg zone the day pick used. Two loose
    // sections sharing a day therefore read distinctly by their bands.
    let timeLabel = first?._timeLabel || ''
    const band = banded.get(stopKey)
    if (band && first) {
      const startMs = Date.parse(first.capturedAt || '')
      const endMs = Date.parse(list[list.length - 1].capturedAt || '')
      timeLabel = spanWords({ startMs, endMs }, { tz: band.tz }) || ''
    }
    groups.push({
      stopKey,
      stopName: first?.stopName || 'Unfiled',
      dayLabel: first?._dayLabel || '',
      timeLabel,
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
