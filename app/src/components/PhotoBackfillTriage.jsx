import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Image as ImageIcon, MapPin, Loader2, AlertCircle, Check } from 'lucide-react'
import { readPhotoExif, filterByTripRange } from '../lib/photoBackfill'
import { matchPhotosToStops } from '../lib/photoMatch'
import { reverseGeocode } from '../lib/geocode'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { uploadBackfillPhotos } from '../lib/photoBackfillUpload'

// Photo backfill — triage surface. Walks the family member through a
// day-by-day, stop-by-stop layout of the photos they just picked,
// pre-selected for upload. They uncheck what they don't want, then
// hit "Upload N photos." Designed to match Settings/HelenView's
// editorial aesthetic (linen + Fraunces + sage/brass).
//
// Phases:
//   - extracting: EXIF read across every input file, in parallel
//   - matching:   pure deterministic match + reverse-geocode any
//                 deviation clusters in parallel
//   - ready:      triage UI, user reviews, presses Upload
//   - uploading:  upload pipeline runs (handled by parent via
//                 onUpload — keeps this component pure-ish)
//
// On Upload: parent receives an array of `{ file, exif, match,
// reattachOf }` entries (only the checked ones) plus the deviation
// clusters with resolved names. Parent handles the actual saveAsset
// + pushMemory pipeline so this component stays testable in
// isolation.

const PHASE = {
  EXTRACTING: 'extracting',
  MATCHING: 'matching',
  READY: 'ready',
  UPLOADING: 'uploading',
  DONE: 'done',
  ERROR: 'error',
}

export function PhotoBackfillTriage({ trip, traveler, files, onCancel, onComplete }) {
  const [phase, setPhase] = useState(PHASE.EXTRACTING)
  const [extractProgress, setExtractProgress] = useState({ done: 0, total: 0 })
  const [extracted, setExtracted] = useState([]) // [{ file, photo, exif }]
  const [excludedCount, setExcludedCount] = useState(0)
  const [matchResult, setMatchResult] = useState({ matches: [], deviationClusters: [] })
  const [clusterNames, setClusterNames] = useState({}) // clusterId -> name
  const [checked, setChecked] = useState({}) // photoId -> bool
  const [activeDayN, setActiveDayN] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0, currentName: null })
  const [uploadResults, setUploadResults] = useState(null)

  // Synth IDs are stable so checkboxes survive renders.
  const fileEntries = useMemo(
    () =>
      (files || []).map((f, i) => ({
        id: `pick-${i}-${f.name || 'unnamed'}-${f.size || 0}`,
        file: f,
      })),
    [files]
  )

  // Existing memories for the trip — duplicate + re-attach detection.
  const existingMemories = useMemo(() => {
    try {
      return listMemoriesForTrip(trip.id, traveler).filter((m) => m.kind === 'photo')
    } catch {
      return []
    }
  }, [trip.id, traveler])

  // 1. EXIF extraction across every file.
  useEffect(() => {
    let cancelled = false
    setPhase(PHASE.EXTRACTING)
    setExtractProgress({ done: 0, total: fileEntries.length })
    ;(async () => {
      const results = []
      let done = 0
      for (const entry of fileEntries) {
        if (cancelled) return
        try {
          const exif = await readPhotoExif(entry.file)
          results.push({
            id: entry.id,
            file: entry.file,
            exif,
            photo: {
              id: entry.id,
              capturedAt: exif.capturedAt,
              lat: exif.lat,
              lng: exif.lng,
            },
          })
        } catch (err) {
          results.push({
            id: entry.id,
            file: entry.file,
            exif: { capturedAt: null, lat: null, lng: null },
            photo: { id: entry.id, capturedAt: null, lat: null, lng: null },
            error: err?.message || String(err),
          })
        }
        done += 1
        if (!cancelled) setExtractProgress({ done, total: fileEntries.length })
      }
      if (cancelled) return
      // Trip-range filter.
      const filtered = filterByTripRange(
        results.map((r) => r.photo),
        trip.dateRangeStart,
        trip.dateRangeEnd
      )
      if (filtered.reason === 'invalid-range') {
        setErrorMsg('This trip is missing valid start/end dates — backfill needs both.')
        setPhase(PHASE.ERROR)
        return
      }
      const includedIds = new Set(filtered.included.map((p) => p.id))
      const kept = results.filter((r) => includedIds.has(r.photo.id))
      setExtracted(kept)
      setExcludedCount(results.length - kept.length)
      setPhase(PHASE.MATCHING)
    })()
    return () => {
      cancelled = true
    }
  }, [fileEntries, trip.dateRangeStart, trip.dateRangeEnd])

  // 2. Match + reverse-geocode deviation clusters.
  useEffect(() => {
    if (phase !== PHASE.MATCHING) return
    let cancelled = false
    const photos = extracted.map((e) => e.photo)
    const result = matchPhotosToStops(photos, trip)
    if (cancelled) return
    setMatchResult(result)

    // Pre-check every non-duplicate photo.
    const init = {}
    for (const e of extracted) {
      const dup = isDuplicateOf(e, existingMemories)
      init[e.id] = !dup
    }
    setChecked(init)

    // Land on the first day that has any extracted photo.
    const firstDayN = pickInitialDay(result.matches, trip)
    setActiveDayN(firstDayN)

    setPhase(PHASE.READY)

    // Reverse-geocode each cluster centroid in parallel; surface
    // names as they resolve.
    ;(async () => {
      const entries = await Promise.all(
        result.deviationClusters.map(async (c) => {
          const name = await reverseGeocode(c.centroid.lat, c.centroid.lng)
          return [c.id, name]
        })
      )
      if (cancelled) return
      const next = {}
      for (const [id, name] of entries) next[id] = name
      setClusterNames(next)
    })()

    return () => {
      cancelled = true
    }
  }, [phase, extracted, trip, existingMemories])

  function toggle(photoId) {
    setChecked((prev) => ({ ...prev, [photoId]: !prev[photoId] }))
  }

  const checkedCount = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked]
  )

  async function handleUpload() {
    const matchById = new Map(matchResult.matches.map((m) => [m.photoId, m]))
    const payload = []
    for (const entry of extracted) {
      if (!checked[entry.id]) continue
      const match = matchById.get(entry.id)
      const dup = isDuplicateOf(entry, existingMemories)
      payload.push({
        file: entry.file,
        exif: entry.exif,
        match,
        reattachOf: dup?.reattach || null,
        duplicateOf: dup?.duplicate || null,
      })
    }
    if (payload.length === 0) return
    setPhase(PHASE.UPLOADING)
    setUploadProgress({ done: 0, total: payload.length, currentName: null })
    try {
      const results = await uploadBackfillPhotos({
        photos: payload,
        trip,
        traveler,
        onProgress: (p) => setUploadProgress(p),
      })
      setUploadResults(results)
      setPhase(PHASE.DONE)
    } catch (err) {
      setErrorMsg(err?.message || String(err))
      setPhase(PHASE.ERROR)
    }
  }

  // ─── render ────────────────────────────────────────────────────

  if (phase === PHASE.ERROR) {
    return (
      <TriageShell trip={trip} onBack={onCancel}>
        <div style={{ padding: '24px 18px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <AlertCircle size={18} color="var(--accent, #8B2B1F)" />
          <p className="f-news text-base" style={{ margin: 0 }}>
            {errorMsg || 'Something went wrong reading these photos.'}
          </p>
        </div>
      </TriageShell>
    )
  }

  if (phase === PHASE.EXTRACTING || phase === PHASE.MATCHING) {
    const label =
      phase === PHASE.EXTRACTING
        ? `Reading photo ${extractProgress.done} of ${extractProgress.total}…`
        : 'Matching photos to stops…'
    return (
      <TriageShell trip={trip} onBack={onCancel}>
        <div
          style={{
            padding: '32px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: 'var(--muted)',
          }}
        >
          <Loader2 size={18} className="spin" />
          <p className="f-news text-base" style={{ margin: 0 }}>{label}</p>
        </div>
      </TriageShell>
    )
  }

  if (phase === PHASE.UPLOADING) {
    return (
      <TriageShell trip={trip} onBack={null}>
        <div style={{ padding: '32px 18px' }}>
          <p className="f-news" style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
            Uploading…
          </p>
          <p className="f-dm" style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
            {uploadProgress.done} of {uploadProgress.total} photos
            {uploadProgress.currentName ? ` · ${uploadProgress.currentName}` : ''}
          </p>
          <div
            style={{
              marginTop: 16,
              height: 6,
              borderRadius: 3,
              background: 'var(--bg2, #EEE7D8)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${
                  uploadProgress.total
                    ? Math.round((uploadProgress.done / uploadProgress.total) * 100)
                    : 0
                }%`,
                height: '100%',
                background: 'var(--brand, #6F7C5A)',
                transition: 'width 200ms',
              }}
            />
          </div>
        </div>
      </TriageShell>
    )
  }

  if (phase === PHASE.DONE) {
    const r = uploadResults || { ok: 0, reattached: 0, failed: 0, errors: [] }
    return (
      <TriageShell trip={trip} onBack={null}>
        <div style={{ padding: '32px 18px' }}>
          <p className="f-news" style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>
            Done.
          </p>
          <ul className="f-news" style={{ fontSize: 16, lineHeight: 1.6, paddingLeft: 20, margin: 0 }}>
            <li>{r.ok} new photo{r.ok === 1 ? '' : 's'} imported</li>
            {r.reattached > 0 && (
              <li>{r.reattached} photo{r.reattached === 1 ? '' : 's'} re-attached to existing memories</li>
            )}
            {r.failed > 0 && (
              <li style={{ color: 'var(--accent, #8B2B1F)' }}>
                {r.failed} failed — check the upload log in Settings
              </li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => onComplete?.(r)}
            className="btn-pill"
            style={{
              marginTop: 24,
              padding: '10px 18px',
              background: 'var(--text)',
              color: 'var(--bg)',
              minHeight: 44,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Back to the trip
          </button>
        </div>
      </TriageShell>
    )
  }

  // READY: group photos by day → stop / interstitial bucket.
  const groupedByDay = groupPhotosByDay(extracted, matchResult.matches, trip, clusterNames)
  const activeDayGroup = groupedByDay.find((d) => d.dayN === activeDayN) || groupedByDay[0]

  return (
    <TriageShell trip={trip} onBack={onCancel}>
      <div style={{ padding: '6px 18px 4px', display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto' }}>
        {groupedByDay.map((d) => {
          const isActive = d.dayN === (activeDayGroup?.dayN ?? null)
          return (
            <button
              key={`day-${d.dayN}-${d.dayIsoDate}`}
              type="button"
              onClick={() => setActiveDayN(d.dayN)}
              style={{
                padding: '6px 10px',
                borderRadius: 10,
                background: isActive ? 'var(--text)' : 'transparent',
                color: isActive ? 'var(--bg)' : 'var(--muted)',
                border: isActive ? 'none' : '1px solid var(--border)',
                cursor: 'pointer',
                textAlign: 'left',
                minWidth: 92,
                flexShrink: 0,
              }}
            >
              <div className="f-mono" style={{ fontSize: 9, letterSpacing: '0.1em', opacity: 0.7 }}>
                DAY {d.dayN ?? '–'}
              </div>
              <div className="f-news" style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
                {d.dayLabel}
              </div>
              <div className="f-mono" style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>
                {d.totalCount} photo{d.totalCount === 1 ? '' : 's'}
              </div>
            </button>
          )
        })}
      </div>

      {excludedCount > 0 && (
        <p
          className="f-dm"
          style={{ padding: '8px 18px 0', margin: 0, fontSize: 12, color: 'var(--muted)' }}
        >
          {excludedCount} photo{excludedCount === 1 ? '' : 's'} outside the trip date range — skipped.
        </p>
      )}

      <div style={{ padding: '12px 18px 220px' }}>
        {activeDayGroup ? (
          <DayGroupView
            group={activeDayGroup}
            checked={checked}
            existingMemories={existingMemories}
            extractedById={new Map(extracted.map((e) => [e.id, e]))}
            onToggle={toggle}
          />
        ) : (
          <p className="f-news" style={{ color: 'var(--muted)', margin: 0 }}>
            No photos in the trip date range.
          </p>
        )}
      </div>

      {extracted.length > 0 && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            // Sit above the global traveler Switcher pill (see
            // App.jsx + styles/platform.css `.switcher`) — switcher
            // pill is ~64px tall + safe-area-inset-bottom. Without
            // this offset our upload bar gets buried under the dock.
            bottom: 'calc(env(safe-area-inset-bottom) + 76px)',
            padding: '12px 18px',
            background: 'var(--bg)',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            zIndex: 51, // above the switcher's z-index: 50
          }}
        >
          <p className="f-dm" style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            {checkedCount} of {extracted.length} selected
          </p>
          <button
            type="button"
            onClick={handleUpload}
            disabled={checkedCount === 0}
            className="btn-pill"
            style={{
              padding: '10px 18px',
              fontSize: 14,
              background: checkedCount === 0 ? 'transparent' : 'var(--text)',
              color: checkedCount === 0 ? 'var(--muted)' : 'var(--bg)',
              opacity: checkedCount === 0 ? 0.5 : 1,
              minHeight: 44,
              cursor: checkedCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Upload {checkedCount} photo{checkedCount === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </TriageShell>
  )
}

function TriageShell({ trip, onBack, children }) {
  return (
    <div
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        minHeight: '100vh',
        paddingBottom: 80,
      }}
    >
      <div style={{ padding: 'calc(env(safe-area-inset-top) + 60px) 18px 4px' }}>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="link-quiet f-dm"
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              opacity: 0.7,
              color: 'var(--text)',
            }}
          >
            <ChevronLeft size={14} /> Back
          </button>
        ) : null}
        <h1
          className="f-news"
          style={{ fontSize: 28, lineHeight: 1.05, fontWeight: 700, marginTop: onBack ? 18 : 0 }}
        >
          Import photos
        </h1>
        <p
          className="f-news-i"
          style={{ fontSize: 14, opacity: 0.6, marginTop: 6 }}
        >
          {trip.title}
        </p>
      </div>
      {children}
    </div>
  )
}

function DayGroupView({ group, checked, existingMemories, extractedById, onToggle }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {group.buckets.map((bucket) => (
        <BucketSection
          key={bucket.key}
          bucket={bucket}
          checked={checked}
          existingMemories={existingMemories}
          extractedById={extractedById}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

function BucketSection({ bucket, checked, existingMemories, extractedById, onToggle }) {
  return (
    <section>
      <div
        className="f-mono smallcaps"
        style={{ fontSize: 11, opacity: 0.7, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        {bucket.kind === 'deviation' ? <MapPin size={11} /> : null}
        {bucket.title}
      </div>
      {bucket.subtitle && (
        <p className="f-news-i" style={{ fontSize: 12, opacity: 0.55, margin: '0 0 8px' }}>
          {bucket.subtitle}
        </p>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
          gap: 8,
        }}
      >
        {bucket.photoIds.map((pid) => {
          const entry = extractedById.get(pid)
          if (!entry) return null
          const dup = isDuplicateOf(entry, existingMemories)
          return (
            <PhotoTile
              key={pid}
              entry={entry}
              checked={!!checked[pid]}
              duplicate={dup}
              onToggle={() => onToggle(pid)}
            />
          )
        })}
      </div>
    </section>
  )
}

function PhotoTile({ entry, checked, duplicate, onToggle }) {
  const [previewUrl, setPreviewUrl] = useState(null)
  const urlRef = useRef(null)
  useEffect(() => {
    if (!entry.file) return
    let cancelled = false
    const url = URL.createObjectURL(entry.file)
    urlRef.current = url
    if (!cancelled) setPreviewUrl(url)
    return () => {
      cancelled = true
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }, [entry.file])

  const isDup = !!duplicate?.duplicate
  const isReattach = !!duplicate?.reattach && !isDup
  const tileLabel = isDup
    ? 'already imported'
    : isReattach
    ? 'matches an existing memory — attach?'
    : null

  return (
    <label
      style={{
        position: 'relative',
        display: 'block',
        aspectRatio: '1 / 1',
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'pointer',
        border: checked
          ? '2px solid var(--brand, #6F7C5A)'
          : '1px solid var(--border)',
        opacity: isDup && !checked ? 0.45 : 1,
      }}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            filter: isDup && !checked ? 'grayscale(0.6)' : 'none',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: 'var(--bg2, #EEE7D8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
          }}
        >
          <ImageIcon size={18} />
        </div>
      )}
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={`Include photo ${entry.file?.name || ''}`}
        style={{
          position: 'absolute',
          top: 6,
          left: 6,
          width: 20,
          height: 20,
          margin: 0,
          accentColor: 'var(--brand, #6F7C5A)',
          cursor: 'pointer',
        }}
      />
      {checked && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            width: 20,
            height: 20,
            borderRadius: 4,
            background: 'var(--brand, #6F7C5A)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Check size={14} color="var(--bg)" />
        </div>
      )}
      {tileLabel && (
        <div
          className="f-mono"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            fontSize: 9,
            padding: '3px 6px',
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            letterSpacing: '0.05em',
          }}
        >
          {tileLabel}
        </div>
      )}
    </label>
  )
}

// ─── helpers ─────────────────────────────────────────────────────

// Returns { duplicate: <existingMemory>, reattach: <existingMemory> } | null.
// duplicate = same EXIF timestamp ±60s AND existing record has photoRefs (real photo on R2).
// reattach  = same EXIF timestamp ±60s AND existing record is metadata-only.
function isDuplicateOf(entry, existingMemories) {
  const ts = entry?.exif?.capturedAt
  if (!ts) return null
  const t = Date.parse(ts)
  if (!Number.isFinite(t)) return null
  for (const m of existingMemories) {
    if (!m?.capturedAt) continue
    const mt = Date.parse(m.capturedAt)
    if (!Number.isFinite(mt)) continue
    if (Math.abs(t - mt) > 60_000) continue
    const hasPhoto = (m.photoRefs?.length > 0) || !!m.photoRef
    if (hasPhoto) return { duplicate: m, reattach: null }
    return { duplicate: null, reattach: m }
  }
  return null
}

function pickInitialDay(matches, trip) {
  const days = trip.days || []
  if (days.length === 0) return null
  // Use the lowest-n day that has any photo matched to it.
  const counts = new Map()
  for (const m of matches) {
    if (m.dayN == null) continue
    counts.set(m.dayN, (counts.get(m.dayN) || 0) + 1)
  }
  for (const day of days) {
    if (counts.has(day.n)) return day.n
  }
  return days[0].n
}

// Group every photo by trip-day + intra-day bucket. Output:
//   [
//     {
//       dayN, dayIsoDate, dayLabel, totalCount,
//       buckets: [
//         { key, kind: 'stop'|'interstitial'|'deviation'|'unmatched', title, subtitle, photoIds: [] }
//       ]
//     }
//   ]
function groupPhotosByDay(extracted, matches, trip, clusterNames) {
  const matchById = new Map(matches.map((m) => [m.photoId, m]))
  const stopMap = new Map()
  for (const day of trip.days || []) {
    for (const stop of day.stops || []) {
      stopMap.set(stop.id, { stop, day })
    }
  }

  // Day buckets keyed by dayN; "no day" entries land in a synthetic
  // bucket at the end.
  const dayBuckets = new Map()
  function ensureDay(dayN, dayIsoDate, dayLabel) {
    if (dayBuckets.has(dayN)) return dayBuckets.get(dayN)
    const created = {
      dayN,
      dayIsoDate,
      dayLabel,
      totalCount: 0,
      // Map of bucket key → bucket object
      _bucketMap: new Map(),
      buckets: [],
    }
    dayBuckets.set(dayN, created)
    return created
  }

  for (const day of trip.days || []) {
    ensureDay(day.n, day.isoDate, formatDayLabel(day))
  }

  for (const entry of extracted) {
    const m = matchById.get(entry.id)
    let dayBucket
    if (!m || m.dayN == null) {
      dayBucket = ensureDay(null, null, 'No date')
    } else {
      dayBucket = ensureDay(m.dayN, m.dayIsoDate, dayBucket?.dayLabel || formatDayLabelByIso(m.dayIsoDate, trip))
    }
    dayBucket.totalCount += 1

    const bucket = getBucketForMatch(m, dayBucket, stopMap, clusterNames)
    bucket.photoIds.push(entry.id)
  }

  // Finalize: build buckets list in stop order for each day.
  const result = []
  for (const day of trip.days || []) {
    const d = dayBuckets.get(day.n)
    if (!d) continue
    d.buckets = orderBucketsForDay(d._bucketMap, day, clusterNames)
    delete d._bucketMap
    result.push(d)
  }
  // Append the "no day" bucket if it has any entries.
  const nullDay = dayBuckets.get(null)
  if (nullDay && nullDay.totalCount > 0) {
    nullDay.buckets = Array.from(nullDay._bucketMap.values())
    delete nullDay._bucketMap
    result.push(nullDay)
  }
  return result
}

function formatDayLabel(day) {
  if (day.date) return day.date.split(' ')[0]
  return `Day ${day.n}`
}
function formatDayLabelByIso(iso, trip) {
  const day = (trip.days || []).find((d) => d.isoDate === iso)
  return day ? formatDayLabel(day) : iso || '—'
}

function getBucketForMatch(match, dayBucket, stopMap, clusterNames) {
  let key
  let title
  let subtitle = null
  let kind

  if (!match || match.matchType === 'unmatched' || match.dayN == null) {
    key = 'unmatched'
    title = 'Not matched to a stop'
    subtitle = 'Tap a photo to assign it manually after upload.'
    kind = 'unmatched'
  } else if (match.matchType === 'gps+time' || match.matchType === 'time') {
    key = `stop:${match.stopId}`
    const stopEntry = stopMap.get(match.stopId)
    title = stopEntry ? (stopEntry.stop.name || stopEntry.stop.title || match.stopId) : match.stopId
    if (match.matchType === 'time') subtitle = 'matched by time'
    kind = 'stop'
  } else if (match.matchType === 'deviation') {
    key = `deviation:${match.deviationClusterId}`
    const name = clusterNames?.[match.deviationClusterId]
    title = name || 'Off-route stop'
    subtitle = 'photos clustered off the planned route'
    kind = 'deviation'
  } else if (match.matchType === 'interstitial') {
    const a = match.interstitialBefore
    const b = match.interstitialAfter
    key = `interstitial:${a || 'start'}-${b || 'end'}`
    const aName = a ? stopMap.get(a)?.stop?.name : null
    const bName = b ? stopMap.get(b)?.stop?.name : null
    if (aName && bName) title = `From ${aName} to ${bName}`
    else if (bName) title = `Before ${bName}`
    else if (aName) title = `After ${aName}`
    else title = 'In transit'
    kind = 'interstitial'
  } else {
    key = 'other'
    title = match.matchType
    kind = match.matchType
  }

  if (!dayBucket._bucketMap.has(key)) {
    dayBucket._bucketMap.set(key, { key, kind, title, subtitle, photoIds: [] })
  }
  return dayBucket._bucketMap.get(key)
}

// Order buckets within a day: walk the day's stop list in time order,
// interleaving any interstitial / deviation buckets that fall after
// each stop. Unmatched goes last.
function orderBucketsForDay(bucketMap, day, clusterNames) {
  const ordered = []
  const remaining = new Map(bucketMap)
  // Walk stops in their original order (the day's stops array is
  // already authored in time order in our data).
  for (let i = 0; i < (day.stops || []).length; i++) {
    const stop = day.stops[i]
    const key = `stop:${stop.id}`
    if (remaining.has(key)) {
      ordered.push(remaining.get(key))
      remaining.delete(key)
    }
    // Interstitials sitting between this stop and the next.
    const next = day.stops[i + 1]
    if (next) {
      const intKey = `interstitial:${stop.id}-${next.id}`
      if (remaining.has(intKey)) {
        ordered.push(remaining.get(intKey))
        remaining.delete(intKey)
      }
      // Deviation clusters between these two stops — match by name in clusterNames.
      for (const [k, v] of remaining) {
        if (v.kind !== 'deviation') continue
        // We can't easily attribute the deviation to a stop pair from
        // the cluster name alone, so we just splice them in here when
        // their match's between-stops align. For now, anchor every
        // deviation cluster after its day's first stop and let the
        // user see them in the natural day flow.
        ordered.push(v)
        remaining.delete(k)
      }
    }
  }
  // "Before first stop" interstitial — interstitial:start-<firstStop.id>
  const firstStop = day.stops?.[0]
  if (firstStop) {
    const k = `interstitial:start-${firstStop.id}`
    if (remaining.has(k)) {
      ordered.unshift(remaining.get(k))
      remaining.delete(k)
    }
  }
  // "After last stop" interstitial.
  const lastStop = day.stops?.[day.stops.length - 1]
  if (lastStop) {
    const k = `interstitial:${lastStop.id}-end`
    if (remaining.has(k)) {
      ordered.push(remaining.get(k))
      remaining.delete(k)
    }
  }
  // Anything left over (orphan deviations, unmatched) at the end.
  for (const v of remaining.values()) {
    if (v.kind === 'unmatched') ordered.push(v)
  }
  for (const v of remaining.values()) {
    if (v.kind !== 'unmatched' && !ordered.includes(v)) ordered.push(v)
  }
  return ordered
}
