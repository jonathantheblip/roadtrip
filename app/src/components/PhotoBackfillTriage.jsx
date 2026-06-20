import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  Image as ImageIcon,
  MapPin,
  Loader2,
  AlertCircle,
  Check,
  Pencil,
  Trash2,
  RotateCcw,
  Plus,
  Scissors,
  X,
} from 'lucide-react'
import { readExifForImport, filterByTripRange } from '../lib/photoBackfill'
import { matchPhotosToStops } from '../lib/photoMatch'
import { reverseGeocode } from '../lib/geocode'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { uploadBackfillPhotos } from '../lib/photoBackfillUpload'
import {
  buildReconciliationDraft,
  STOP_STATE,
  AUTO_STOP_PLACEHOLDER,
} from '../lib/reconcileDraft'
import { applyReconciliation } from '../lib/reconcileApply'
import {
  renameStop,
  retimeStop,
  markDidntHappen,
  restoreStop,
  demoteToInterstitial,
  promoteToStop,
  mergeStops,
  splitStop,
} from '../lib/reconcileEdits'

// Photo backfill + trip reconciliation — one surface. The family member
// imports the photos they just picked; we match them to the planned
// stops, then present a day-by-day, stop-by-stop draft of "what actually
// happened" for them to confirm or refine. Each planned stop carries a
// state badge (happened / no photos), off-route photo clusters surface
// as auto-added stops, and transit shots bucket as interstitials. Helen
// refines on top — rename, retime, mark a no-photo stop as didn't-happen
// (which removes it), promote a transit bucket to a real stop, demote an
// auto stop back to transit, merge two stops, split one in two — then
// Save persists the reconciled trip and uploads the checked photos bound
// to their final stops.
//
// Phases: extracting → matching → ready (the triage/reconcile draft) →
// uploading → done. The classification + persistence live in pure libs
// (reconcileDraft / reconcileEdits / reconcileApply); this component is
// the view + the save wiring.

const PHASE = {
  EXTRACTING: 'extracting',
  MATCHING: 'matching',
  READY: 'ready',
  UPLOADING: 'uploading',
  DONE: 'done',
  ERROR: 'error',
}

// State badge palette — Helen's linen/Fraunces/sage language. Sage for
// confirmed, muted for the no-photo gaps, brass for what we discovered,
// oxblood for the removed.
const STATE_BADGE = {
  [STOP_STATE.HAPPENED]: { label: 'Happened', fg: 'var(--brand, #6F7C5A)', bg: 'rgba(111,124,90,0.14)' },
  [STOP_STATE.HAPPENED_NO_PHOTOS]: { label: 'No photos', fg: 'var(--muted)', bg: 'transparent' },
  [STOP_STATE.AUTO_ADDED]: { label: 'Added', fg: '#9A6A2F', bg: 'rgba(154,106,47,0.14)' },
  [STOP_STATE.DIDNT_HAPPEN]: { label: "Didn't happen", fg: 'var(--accent, #8B2B1F)', bg: 'rgba(139,43,31,0.12)' },
}

export function PhotoBackfillTriage({ trip, traveler, files, tripsApi, onCancel, onComplete }) {
  const [phase, setPhase] = useState(PHASE.EXTRACTING)
  const [extractProgress, setExtractProgress] = useState({ done: 0, total: 0 })
  const [extracted, setExtracted] = useState([]) // [{ id, file, photo, exif }]
  const [excludedCount, setExcludedCount] = useState(0)
  const [matchResult, setMatchResult] = useState({ matches: [], deviationClusters: [] })
  const [clusterNames, setClusterNames] = useState({}) // clusterId -> name
  const [draft, setDraft] = useState(null) // reconciliation draft (working copy)
  const [checked, setChecked] = useState({}) // photoId -> bool
  const [activeDayN, setActiveDayN] = useState(null)
  const [editingStopId, setEditingStopId] = useState(null)
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

  const extractedById = useMemo(() => new Map(extracted.map((e) => [e.id, e])), [extracted])
  const photoById = useMemo(() => new Map(extracted.map((e) => [e.id, e.photo])), [extracted])

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
          const exif = await readExifForImport(entry.file)
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

  // 2. Match + build the reconciliation draft + reverse-geocode clusters.
  useEffect(() => {
    if (phase !== PHASE.MATCHING) return
    let cancelled = false
    const photos = extracted.map((e) => e.photo)
    const result = matchPhotosToStops(photos, trip)
    if (cancelled) return
    setMatchResult(result)
    setDraft(buildReconciliationDraft(photos, trip, { matchResult: result }))

    // Pre-check every non-duplicate photo.
    const init = {}
    for (const e of extracted) {
      const dup = isDuplicateOf(e, existingMemories)
      init[e.id] = !dup
    }
    setChecked(init)

    // Land on the first day that has any extracted photo.
    setActiveDayN(pickInitialDay(result.matches, trip))
    setPhase(PHASE.READY)

    return () => {
      cancelled = true
    }
  }, [phase, extracted, trip, existingMemories])

  // Reverse-geocode the off-route cluster centroids in their OWN effect,
  // keyed on the match result. Doing this inside the phase-gated matching
  // effect (above) would lose every result: that effect's cleanup fires
  // the instant it flips phase to READY, cancelling the in-flight geocode
  // before setClusterNames lands. Keyed on matchResult, this runs once
  // after the clusters exist and survives the phase change.
  useEffect(() => {
    const clusters = matchResult.deviationClusters || []
    if (clusters.length === 0) return
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(
        clusters.map(async (c) => {
          const name = await reverseGeocode(c.centroid.lat, c.centroid.lng)
          return [c.id, name]
        })
      )
      if (cancelled) return
      const next = {}
      for (const [id, name] of entries) if (name) next[id] = name
      if (Object.keys(next).length) setClusterNames(next)
    })()
    return () => {
      cancelled = true
    }
  }, [matchResult])

  // Patch resolved cluster names onto auto-added stops still wearing the
  // placeholder — never clobbering a Helen rename (which no longer equals
  // the placeholder string).
  useEffect(() => {
    if (Object.keys(clusterNames).length === 0) return
    setDraft((prev) => (prev ? patchAutoNames(prev, clusterNames) : prev))
  }, [clusterNames])

  function toggle(photoId) {
    setChecked((prev) => ({ ...prev, [photoId]: !prev[photoId] }))
  }

  const checkedCount = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked]
  )

  // ── draft edit handlers (each is an immutable reconcileEdits op) ──
  const editApply = (fn) => {
    setDraft((d) => (d ? fn(d) : d))
  }
  const onRename = (dayN, stopId, name) => editApply((d) => renameStop(d, dayN, stopId, name))
  const onRetime = (dayN, stopId, time) => editApply((d) => retimeStop(d, dayN, stopId, time))
  const onMarkDidntHappen = (dayN, stopId) => {
    editApply((d) => markDidntHappen(d, dayN, stopId))
    setEditingStopId(null)
  }
  const onRestore = (dayN, stopId) => editApply((d) => restoreStop(d, dayN, stopId))
  const onDemote = (dayN, stopId) => {
    editApply((d) => demoteToInterstitial(d, dayN, stopId))
    setEditingStopId(null)
  }
  const onPromote = (dayN, bucketKey) => editApply((d) => promoteToStop(d, dayN, bucketKey, photoById))
  const onMerge = (dayN, stopId, intoStopId) => {
    editApply((d) => mergeStops(d, dayN, stopId, intoStopId, photoById))
    setEditingStopId(null)
  }
  const onSplit = (dayN, stopId) => editApply((d) => splitStop(d, dayN, stopId, photoById))

  async function handleSave() {
    if (!draft) return
    const { trip: out, photoBindings, photoInterstitials } =
      applyReconciliation(draft, trip)

    const matchById = new Map(matchResult.matches.map((m) => [m.photoId, m]))
    const payload = []
    for (const entry of extracted) {
      if (!checked[entry.id]) continue
      const dup = isDuplicateOf(entry, existingMemories)
      const stopId =
        entry.id in photoBindings
          ? photoBindings[entry.id]
          : matchById.get(entry.id)?.stopId ?? null
      // The "from A to B" identity for a null-bound (interstitial) photo —
      // null for everything filed to a real stop. Carried through to
      // saveMemory so the album renders it between the two stops (007).
      const interstitial = photoInterstitials?.[entry.id] || null
      payload.push({
        file: entry.file,
        exif: entry.exif,
        match: matchById.get(entry.id),
        reattachOf: dup?.reattach || null,
        duplicateOf: dup?.duplicate || null,
        stopId,
        interstitial,
      })
    }

    setPhase(PHASE.UPLOADING)
    setUploadProgress({ done: 0, total: payload.length, currentName: null })
    try {
      // Persist the reconciled trip first. The local write is synchronous
      // and instant; the Worker push is non-fatal (M2 policy) — a sync
      // failure must not lose Helen's reconciliation, which is already
      // safe in the local cache.
      await tripsApi?.upsertTrip?.(out)
      const results = await uploadBackfillPhotos({
        photos: payload,
        trip: out,
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
            Saving…
          </p>
          <p className="f-dm" style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
            {uploadProgress.total > 0
              ? `${uploadProgress.done} of ${uploadProgress.total} photos${
                  uploadProgress.currentName ? ` · ${uploadProgress.currentName}` : ''
                }`
              : 'Recording what happened…'}
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
                    : 100
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
    const r = uploadResults || { ok: 0, reattached: 0, queued: 0, failed: 0, errors: [] }
    return (
      <TriageShell trip={trip} onBack={null}>
        <div style={{ padding: '32px 18px' }}>
          <p className="f-news" style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>
            Saved.
          </p>
          <ul className="f-news" style={{ fontSize: 16, lineHeight: 1.6, paddingLeft: 20, margin: 0 }}>
            <li>Trip updated with what actually happened.</li>
            {r.ok > 0 && (
              <li>{r.ok} new photo{r.ok === 1 ? '' : 's'} imported</li>
            )}
            {r.queued > 0 && (
              <li>{r.queued} will sync when you’re back online</li>
            )}
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

  // READY — draft-driven reconciliation view.
  const days = draft?.days || []
  const tripDayByN = new Map((trip.days || []).map((d) => [d.n, d]))
  const unmatchedNull = (draft?.unmatched || []).filter((u) => u.dayN == null)
  const dayTabs = [
    ...days.map((d) => ({ dayN: d.dayN, draftDay: d })),
    ...(unmatchedNull.length ? [{ dayN: null, draftDay: null }] : []),
  ]
  const activeDraftDay = days.find((d) => d.dayN === activeDayN) || null
  const isNullDay = activeDayN == null && unmatchedNull.length > 0
  const activeUnmatched = (draft?.unmatched || []).filter((u) =>
    isNullDay ? u.dayN == null : u.dayN === activeDayN
  )

  function dayLabelFor(dayN, draftDay) {
    if (dayN == null) return 'No date'
    const td = tripDayByN.get(dayN)
    return td?.date || draftDay?.dayTitle || `Day ${dayN}`
  }
  function dayPhotoCount(dayN, draftDay) {
    if (dayN == null) return unmatchedNull.length
    let n = (draft?.unmatched || []).filter((u) => u.dayN === dayN).length
    for (const s of draftDay?.stops || []) n += s.photoIds.length
    for (const b of draftDay?.interstitials || []) n += b.photoIds.length
    return n
  }

  return (
    <TriageShell trip={trip} onBack={onCancel}>
      <div style={{ padding: '6px 18px 4px', display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto' }}>
        {dayTabs.map(({ dayN, draftDay }) => {
          const isActive = dayN === activeDayN
          return (
            <button
              key={`day-${dayN ?? 'null'}`}
              type="button"
              onClick={() => {
                setActiveDayN(dayN)
                setEditingStopId(null)
              }}
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
                {dayN == null ? '—' : `DAY ${dayN}`}
              </div>
              <div className="f-news" style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
                {dayLabelFor(dayN, draftDay)}
              </div>
              <div className="f-mono" style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>
                {dayPhotoCount(dayN, draftDay)} photo{dayPhotoCount(dayN, draftDay) === 1 ? '' : 's'}
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
        {activeDraftDay ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {activeDraftDay.stops.map((stop, i) => (
              <StopCard
                key={stop.stopId}
                stop={stop}
                dayN={activeDraftDay.dayN}
                stops={activeDraftDay.stops}
                index={i}
                editing={editingStopId === stop.stopId}
                onToggleEdit={() =>
                  setEditingStopId((cur) => (cur === stop.stopId ? null : stop.stopId))
                }
                checked={checked}
                existingMemories={existingMemories}
                extractedById={extractedById}
                onToggle={toggle}
                onRename={onRename}
                onRetime={onRetime}
                onMarkDidntHappen={onMarkDidntHappen}
                onRestore={onRestore}
                onDemote={onDemote}
                onMerge={onMerge}
                onSplit={onSplit}
              />
            ))}
            {activeDraftDay.interstitials.map((bucket) => (
              <InterstitialCard
                key={bucket.key}
                bucket={bucket}
                dayN={activeDraftDay.dayN}
                checked={checked}
                existingMemories={existingMemories}
                extractedById={extractedById}
                onToggle={toggle}
                onPromote={onPromote}
              />
            ))}
            {activeUnmatched.length > 0 && (
              <UnmatchedSection
                unmatched={activeUnmatched}
                checked={checked}
                existingMemories={existingMemories}
                extractedById={extractedById}
                onToggle={toggle}
              />
            )}
          </div>
        ) : isNullDay ? (
          <UnmatchedSection
            unmatched={activeUnmatched}
            checked={checked}
            existingMemories={existingMemories}
            extractedById={extractedById}
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
            // Sit above the global traveler Switcher pill (see App.jsx +
            // styles/platform.css `.switcher`) — the dock is ~64px +
            // safe-area. Without this offset the bar buries under it.
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
            onClick={handleSave}
            className="btn-pill"
            style={{
              padding: '10px 18px',
              fontSize: 14,
              background: 'var(--text)',
              color: 'var(--bg)',
              minHeight: 44,
              cursor: 'pointer',
            }}
          >
            {checkedCount > 0
              ? `Save · upload ${checkedCount} photo${checkedCount === 1 ? '' : 's'}`
              : 'Save changes'}
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
        <p className="f-news-i" style={{ fontSize: 14, opacity: 0.6, marginTop: 6 }}>
          {trip.title}
        </p>
      </div>
      {children}
    </div>
  )
}

function StateBadge({ state }) {
  const b = STATE_BADGE[state] || STATE_BADGE[STOP_STATE.HAPPENED_NO_PHOTOS]
  return (
    <span
      className="f-mono smallcaps"
      style={{
        fontSize: 9,
        letterSpacing: '0.08em',
        padding: '2px 7px',
        borderRadius: 999,
        color: b.fg,
        background: b.bg,
        border: b.bg === 'transparent' ? `1px solid var(--border)` : 'none',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {b.label}
    </span>
  )
}

function PhotoGrid({ photoIds, checked, existingMemories, extractedById, onToggle }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
        gap: 8,
      }}
    >
      {photoIds.map((pid) => {
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
  )
}

function StopCard({
  stop,
  dayN,
  stops,
  index,
  editing,
  onToggleEdit,
  checked,
  existingMemories,
  extractedById,
  onToggle,
  onRename,
  onRetime,
  onMarkDidntHappen,
  onRestore,
  onDemote,
  onMerge,
  onSplit,
}) {
  const isGone = stop.state === STOP_STATE.DIDNT_HAPPEN

  // didnt_happen renders compactly with an Undo affordance — it's a
  // removal preview, not an editable stop.
  if (isGone) {
    return (
      <section style={{ opacity: 0.6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              className="f-news"
              style={{ fontSize: 16, fontWeight: 600, textDecoration: 'line-through' }}
            >
              {stop.name}
            </div>
          </div>
          <StateBadge state={stop.state} />
          <button
            type="button"
            onClick={() => onRestore(dayN, stop.stopId)}
            className="btn-pill"
            style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <RotateCcw size={11} /> Undo
          </button>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {stop.time ? (
              <span className="f-mono" style={{ fontSize: 10, opacity: 0.6 }}>{stop.time}</span>
            ) : null}
            <StateBadge state={stop.state} />
          </div>
          <div className="f-news" style={{ fontSize: 17, fontWeight: 600, marginTop: 3, lineHeight: 1.15 }}>
            {stop.name}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleEdit}
          aria-label={editing ? `Close editor for ${stop.name}` : `Edit ${stop.name}`}
          aria-expanded={editing}
          className="btn-pill"
          style={{
            fontSize: 11,
            padding: '5px 9px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
            minHeight: 32,
            background: editing ? 'var(--text)' : 'transparent',
            color: editing ? 'var(--bg)' : 'inherit',
          }}
        >
          {editing ? <X size={12} /> : <Pencil size={12} />}
        </button>
      </div>

      {editing && (
        <StopEditPanel
          stop={stop}
          dayN={dayN}
          stops={stops}
          index={index}
          onRename={onRename}
          onRetime={onRetime}
          onMarkDidntHappen={onMarkDidntHappen}
          onDemote={onDemote}
          onMerge={onMerge}
          onSplit={onSplit}
        />
      )}

      {stop.photoIds.length > 0 ? (
        <PhotoGrid
          photoIds={stop.photoIds}
          checked={checked}
          existingMemories={existingMemories}
          extractedById={extractedById}
          onToggle={onToggle}
        />
      ) : (
        <p className="f-news-i" style={{ fontSize: 12, opacity: 0.5, margin: 0 }}>
          No photos matched this stop.
        </p>
      )}
    </section>
  )
}

// Nearest non-removed stops on each side, for merge targets. The implicit base
// is never a merge target — you can't fold a real stop into the trip's place.
function mergeNeighbors(stops, index) {
  const ok = (s) => s && s.state !== STOP_STATE.DIDNT_HAPPEN && !s.isBase
  let prev = null
  let next = null
  for (let i = index - 1; i >= 0; i--) if (ok(stops[i])) { prev = stops[i]; break }
  for (let i = index + 1; i < stops.length; i++) if (ok(stops[i])) { next = stops[i]; break }
  return { prev, next }
}

function StopEditPanel({ stop, dayN, stops, index, onRename, onRetime, onMarkDidntHappen, onDemote, onMerge, onSplit }) {
  const hasPhotos = stop.photoIds.length > 0
  // The implicit base ("At the cabin") is the trip's place, not an editable
  // cluster — it can't be split/merged/demoted ("not a stop" makes no sense for
  // where you're staying). Its photos can still be unchecked individually.
  const canSplit = stop.photoIds.length >= 2 && !stop.isBase
  const canDidntHappen = !hasPhotos // photos are proof
  const canDemote = stop.source !== 'planned' && !stop.isBase
  const canMerge = !stop.isBase
  const { prev, next } = mergeNeighbors(stops, index)

  const fieldStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: 14,
    fontFamily: 'inherit',
  }
  const actionStyle = {
    fontSize: 12,
    padding: '7px 11px',
    minHeight: 36,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  }

  return (
    <div
      style={{
        marginBottom: 12,
        padding: 12,
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--card, transparent)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <label style={{ display: 'block' }}>
        <span className="f-mono smallcaps" style={{ fontSize: 9, opacity: 0.6, letterSpacing: '0.08em' }}>Name</span>
        <input
          type="text"
          value={stop.name}
          data-testid="stop-name-input"
          onChange={(e) => onRename(dayN, stop.stopId, e.target.value)}
          style={{ ...fieldStyle, marginTop: 4 }}
        />
      </label>
      <label style={{ display: 'block' }}>
        <span className="f-mono smallcaps" style={{ fontSize: 9, opacity: 0.6, letterSpacing: '0.08em' }}>Time</span>
        <input
          type="text"
          value={stop.time}
          placeholder="e.g. 3:30 PM"
          data-testid="stop-time-input"
          onChange={(e) => onRetime(dayN, stop.stopId, e.target.value)}
          style={{ ...fieldStyle, marginTop: 4 }}
        />
      </label>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canSplit && (
          <button type="button" className="btn-pill" style={actionStyle} onClick={() => onSplit(dayN, stop.stopId)}>
            <Scissors size={12} /> Split here
          </button>
        )}
        {canMerge && prev && (
          <button type="button" className="btn-pill" style={actionStyle} onClick={() => onMerge(dayN, stop.stopId, prev.stopId)}>
            Merge into {truncate(prev.name)}
          </button>
        )}
        {canMerge && next && (
          <button type="button" className="btn-pill" style={actionStyle} onClick={() => onMerge(dayN, stop.stopId, next.stopId)}>
            Merge into {truncate(next.name)}
          </button>
        )}
        {canDemote && (
          <button
            type="button"
            className="btn-pill"
            style={{ ...actionStyle, color: 'var(--accent, #8B2B1F)' }}
            onClick={() => onDemote(dayN, stop.stopId)}
          >
            <Trash2 size={12} /> Not a stop
          </button>
        )}
        {canDidntHappen && (
          <button
            type="button"
            className="btn-pill"
            style={{ ...actionStyle, color: 'var(--accent, #8B2B1F)' }}
            onClick={() => onMarkDidntHappen(dayN, stop.stopId)}
          >
            <Trash2 size={12} /> Didn't happen
          </button>
        )}
      </div>
    </div>
  )
}

function InterstitialCard({ bucket, dayN, checked, existingMemories, extractedById, onToggle, onPromote }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div
          className="f-mono smallcaps"
          style={{ fontSize: 11, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}
        >
          <MapPin size={11} /> {bucket.title || 'In transit'}
        </div>
        <button
          type="button"
          className="btn-pill"
          onClick={() => onPromote(dayN, bucket.key)}
          style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        >
          <Plus size={11} /> Make a stop
        </button>
      </div>
      <PhotoGrid
        photoIds={bucket.photoIds}
        checked={checked}
        existingMemories={existingMemories}
        extractedById={extractedById}
        onToggle={onToggle}
      />
    </section>
  )
}

function UnmatchedSection({ unmatched, checked, existingMemories, extractedById, onToggle }) {
  return (
    <section>
      <div className="f-mono smallcaps" style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
        Not matched to a stop
      </div>
      <p className="f-news-i" style={{ fontSize: 12, opacity: 0.55, margin: '0 0 8px' }}>
        These upload to the trip without a stop — assign them later.
      </p>
      <PhotoGrid
        photoIds={unmatched.map((u) => u.photoId)}
        checked={checked}
        existingMemories={existingMemories}
        extractedById={extractedById}
        onToggle={onToggle}
      />
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

function truncate(s, n = 16) {
  const str = String(s || '')
  return str.length > n ? `${str.slice(0, n - 1)}…` : str
}

// Patch resolved geocode names onto auto-added stops still showing the
// placeholder. Returns the same draft when nothing changed so React
// doesn't re-render needlessly.
function patchAutoNames(draft, clusterNames) {
  let changed = false
  const days = draft.days.map((day) => ({
    ...day,
    stops: day.stops.map((stop) => {
      if (
        stop.source === 'auto_added' &&
        stop.name === AUTO_STOP_PLACEHOLDER &&
        stop.clusterId &&
        clusterNames[stop.clusterId]
      ) {
        changed = true
        return { ...stop, name: clusterNames[stop.clusterId] }
      }
      return stop
    }),
  }))
  return changed ? { ...draft, days } : draft
}

// Returns { duplicate, reattach } | null.
// duplicate = same EXIF timestamp ±60s AND existing record has photoRefs.
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
