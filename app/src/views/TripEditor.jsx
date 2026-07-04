import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft, Plus, Trash2, ArrowUp, ArrowDown, Mic, Sparkles,
  MapPin, Image as ImageIcon, Check, Loader, AlertTriangle, Eye, Lock, Play,
} from 'lucide-react'
import { TRAVELER_ORDER, TRAVELERS } from '../data/travelers'
import { homeVoice } from '../lib/homeVoice'
import { recordEntryId, dayRecordOf, readRecord, pendingNoteIds, resolvePendingNote } from '../lib/dayRecord'
import { geocodeAddress } from '../lib/geocode'
import { stopIsBase } from '../lib/photoMatch'
import { suggestPitch, isAiAssistConfigured } from '../lib/aiAssist'
import { transcribeWithStatus, isWhisperConfigured } from '../lib/whisper'
import { uploadTripCover } from '../lib/workerSync'
import { saveAsset, makeAssetKey, loadAsset } from '../lib/memAssets'
import { saveMemory, listMemoriesForStop, listMemoriesForTrip } from '../lib/memoryStore'
import { VoiceRecorder } from '../components/VoiceRecorder'
import { newTripId } from '../utils/ids'
import { tripCompleteness } from '../lib/tripComplete'
import { isStayTrip } from '../lib/tripShape'
import { hasExplicitParts, getParts, partPlaceLabel } from '../lib/tripParts'
import { humanDateRange } from '../lib/createTripCard'

// Confirm-the-pin map for the lodging address — leaflet is heavy, so it's only
// pulled in when a trip actually has a located lodging (Phase 2).
const LodgingPinConfirm = lazy(() => import('../components/LodgingPinConfirm'))

// The trip editor (change order 2026-05-17 §4). There was no editor in
// the codebase — NewTrip was create-only and its "next pass" was never
// built. This exposes EVERY field the themed views read, structured for
// incremental fill-in, with the enrichment paths that bring a manually
// entered trip to the same polish as a Claude-Code-built one.
//
// Save model: local state is the working copy; every change schedules a
// debounced autosave through the SAME upsert the manual-add form uses
// (one create/update function, one schema). Idempotent by the trip's
// client-stable id — concurrent edits are last-write-wins and surfaced.

const DEBOUNCE_MS = 900
const STOP_KINDS = [
  'sights', 'food', 'lodging', 'logistics', 'drive', 'tour', 'museum',
  'park', 'show', 'arrival', 'departure', 'visit', 'other',
]

function clone(t) {
  return JSON.parse(JSON.stringify(t || {}))
}

// Human day label from an ISO date, e.g. "2026-06-19" → "Fri Jun 19".
// HelenView splits date.split(' ')[0] for the weekday chip, so the
// shape matters.
function humanDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  if (isNaN(d)) return ''
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

// The publish gate now lives in lib/tripComplete (tripCompleteness) so the
// Drafts list's one-tap "Restore" and this editor agree on "ready to publish".
const completeness = tripCompleteness

export function TripEditor({ trip: incoming, traveler, dark, tripsApi, onBack, onOpenTrip, onDiscard, onDiscarded, focusDayIso, backLabel }) {
  const [trip, setTrip] = useState(() => clone(incoming))
  const tripRef = useRef(trip)
  tripRef.current = trip

  const [saveState, setSaveState] = useState('idle') // idle|saving|saved|error
  const [saveErr, setSaveErr] = useState('')
  const [conflict, setConflict] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // The editor's two tenses: 'plan' (stops — the default, unchanged) and
  // 'record' (what actually happened — mouth three). UI-only; flipping never
  // schedules a save. The record tense writes day.record, never day.stops.
  const [mode, setMode] = useState('plan')
  const lastPushedJson = useRef(JSON.stringify(incoming))
  const timerRef = useRef(null)
  // When the user discards a draft, the unmount autosave below MUST NOT fire — it
  // would re-insert the very trip we just removed. This flag short-circuits it.
  const discardedRef = useRef(false)

  // Reload working copy if the editor is pointed at a different trip.
  useEffect(() => {
    if (incoming?.id && incoming.id !== tripRef.current.id) {
      setTrip(clone(incoming))
      lastPushedJson.current = JSON.stringify(incoming)
      setConflict(false)
      setSaveState('idle')
    }
  }, [incoming?.id])

  // Land on the day the caller was looking at (SEE+EDIT, 2026-07-02): the
  // home's per-day pencil and a stop's "Change" pill pass focusDayIso so
  // "move Thursday's dinner" doesn't start with a scroll hunt. If the day
  // doesn't exist yet — "Add something" on an OPEN day the grid enumerated
  // but the trip never wrote — CREATE it (empty, dated, inserted in date
  // order) so the caller gets the day they asked for, then scroll to it.
  // The caller suppressed its own scroll-to-top, so this owns the landing.
  const focusScrollPending = useRef(!!focusDayIso)
  useEffect(() => {
    if (!focusDayIso) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(focusDayIso)) {
      // Garbage in → land at the top, once, and stop looking.
      focusScrollPending.current = false
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      return
    }
    const days = [...(tripRef.current.days || [])]
    if (!days.some((d) => d?.isoDate === focusDayIso)) {
      const newDay = {
        n: 0, isoDate: focusDayIso, date: humanDate(focusDayIso), title: '',
        drive: { from: '', to: '', hours: '', miles: 0 }, lodging: '', stops: [],
      }
      // Insert before the first LATER dated day; dateless days keep their
      // manual order untouched (no whole-array sort — order is load-bearing).
      const at = days.findIndex((d) => d?.isoDate && d.isoDate > focusDayIso)
      if (at >= 0) days.splice(at, 0, newDay)
      else days.push(newDay)
      days.forEach((d, i) => { d.n = i + 1 })
      patchDays(days)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The scroll lands once the anchor exists (created days need a render
  // first). Self-terminating: clears the flag the render it fires.
  useEffect(() => {
    if (!focusScrollPending.current || !focusDayIso) return
    const el = document.getElementById(`editor-day-${focusDayIso}`)
    if (el) {
      focusScrollPending.current = false
      requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))
    }
  })

  // Concurrent-edit detection (change order §6.4 — last-write-wins is
  // acceptable, the conflict must surface). If the synced copy for this
  // id changes to something neither our last push nor our current
  // working copy produced, another device wrote it.
  useEffect(() => {
    const remote = tripsApi.trips.find((t) => t.id === trip.id)
    if (!remote) return
    const remoteJson = JSON.stringify(remote)
    if (
      remoteJson !== lastPushedJson.current &&
      remoteJson !== JSON.stringify(tripRef.current)
    ) {
      setConflict(true)
    }
  }, [tripsApi.trips, trip.id])

  const flush = useCallback(async () => {
    const snapshot = clone(tripRef.current)
    setSaveState('saving')
    setSaveErr('')
    const res = await tripsApi.upsertTrip(snapshot)
    lastPushedJson.current = JSON.stringify(snapshot)
    if (res.ok) {
      // Only claim "synced" when the edit actually reached the family (res.synced);
      // a draft / unconfigured save is honest as "Saved" (not "Saved · synced").
      setSaveState(res.synced ? 'saved' : 'saved-unsynced')
    } else {
      setSaveState('error')
      setSaveErr(res.error || 'Sync failed — kept on this device.')
    }
  }, [tripsApi])

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, DEBOUNCE_MS)
  }, [flush])

  // Flush any pending edit on unmount so leaving the editor never drops
  // the last keystroke. Skipped entirely after a discard — re-saving there
  // would resurrect the trip the user just deleted.
  useEffect(() => {
    return () => {
      if (discardedRef.current) return
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        const snap = clone(tripRef.current)
        if (JSON.stringify(snap) !== lastPushedJson.current) {
          tripsApi.upsertTrip(snap)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patch = useCallback((p) => {
    setTrip((cur) => ({ ...cur, ...p }))
    scheduleSave()
  }, [scheduleSave])

  const patchDays = useCallback((days) => {
    setTrip((cur) => ({ ...cur, days }))
    scheduleSave()
  }, [scheduleSave])

  const v = useMemo(() => homeVoice(traveler), [traveler])
  const comp = useMemo(() => completeness(trip), [trip])
  // SHAPE-AWARE EDITOR (FAMILY_TRIPS_VISION): a stay sheds the road-trip fields —
  // start/end city and the per-day drive plan — so the editor stops asking a cabin
  // weekend road-trip questions. The author can still flip the shape (the toggle in
  // the header) to bring them back for a real road trip. inferTripShape honors an
  // explicit trip.shape first, so the toggle is authoritative.
  const stay = useMemo(() => isStayTrip(trip), [trip])

  // ── Day / stop mutations ────────────────────────────────────────────
  function addDay() {
    const days = [...(trip.days || [])]
    days.push({
      n: days.length + 1, isoDate: '', date: '', title: '',
      drive: { from: '', to: '', hours: '', miles: 0 },
      lodging: '', stops: [],
    })
    patchDays(days)
  }
  function updateDay(i, p) {
    const days = trip.days.map((d, idx) => (idx === i ? { ...d, ...p } : d))
    patchDays(days)
  }
  function moveDay(i, dir) {
    const j = i + dir
    if (j < 0 || j >= trip.days.length) return
    const days = [...trip.days]
    ;[days[i], days[j]] = [days[j], days[i]]
    days.forEach((d, idx) => { d.n = idx + 1 })
    patchDays(days)
  }
  function removeDay(i) {
    const days = trip.days.filter((_, idx) => idx !== i)
    days.forEach((d, idx) => { d.n = idx + 1 })
    patchDays(days)
  }
  function addStop(di) {
    const days = clone(trip.days)
    days[di].stops = days[di].stops || []
    days[di].stops.push({
      id: `stop_${newTripId().slice(5, 17)}`,
      time: '', name: '', kind: 'sights',
      for: [...(trip.travelers || TRAVELER_ORDER)],
      note: '', address: '', lat: null, lng: null,
      url: '', reservation: '', confirmation: '', phone: '',
    })
    patchDays(days)
  }
  function updateStop(di, si, p) {
    const days = clone(trip.days)
    days[di].stops[si] = { ...days[di].stops[si], ...p }
    patchDays(days)
  }
  function moveStop(di, si, dir) {
    const sj = si + dir
    const stops = trip.days[di].stops
    if (sj < 0 || sj >= stops.length) return
    const days = clone(trip.days)
    ;[days[di].stops[si], days[di].stops[sj]] = [days[di].stops[sj], days[di].stops[si]]
    patchDays(days)
  }
  function removeStop(di, si) {
    const days = clone(trip.days)
    days[di].stops = days[di].stops.filter((_, idx) => idx !== si)
    patchDays(days)
  }

  // ── Record (what actually happened) mutations ───────────────────────
  // These write day.record ONLY — never day.stops. The plan is the future,
  // the record is the past, and the design's hard rule is they never cross
  // ("Changes here never touch the plan"). Each manual entry earns a stable
  // id up front so the debounced autosave is idempotent. A row lives in the
  // working copy until it earns a name; the read faces (namedRecordEntries)
  // hide the nameless, so a half-typed row never leaks onto the home.
  //
  // All three go through readRecord() so they write the OBJECT shape and
  // preserve day-level state (kept/nothing) — and so a legacy bare-array record
  // (written before the shape evolved, live on the family's trip) is upgraded
  // in place, its entries never discarded.
  function addRecordEntry(di) {
    const days = clone(trip.days)
    const rec = readRecord(days[di])
    const entries = rec.entries.slice()
    entries.push({
      id: recordEntryId(null, entries.length),
      time: '', name: '', kind: '',
      for: [...(trip.travelers || TRAVELER_ORDER)],
      note: '', address: '', lat: null, lng: null,
      source: 'manual', recordedBy: traveler || null,
      recordedAt: new Date().toISOString(),
    })
    days[di].record = { ...rec, entries }
    patchDays(days)
  }
  function updateRecordEntry(di, ri, p) {
    const days = clone(trip.days)
    const rec = readRecord(days[di])
    if (!rec.entries[ri]) return
    const entries = rec.entries.slice()
    entries[ri] = { ...entries[ri], ...p }
    days[di].record = { ...rec, entries }
    patchDays(days)
  }
  function removeRecordEntry(di, ri) {
    const days = clone(trip.days)
    const rec = readRecord(days[di])
    days[di].record = { ...rec, entries: rec.entries.filter((_, idx) => idx !== ri) }
    patchDays(days)
  }

  // A PARENT places (or dismisses) one of Rafa's "tell about today" pending notes
  // (design 04) — entryId+transcript set appends onto that entry's note; entryId
  // omitted leaves it a loose voice memory. Reuses the tested pure resolver
  // (dayRecord.js) rather than re-deriving the append/dequeue logic here.
  function placePendingNote(dayIso, memId, entryId, transcript) {
    const next = resolvePendingNote(trip, { dayIso }, memId, entryId, transcript)
    // resolvePendingNote → commitDays returns days at .data.days for a D1-shaped
    // trip, .days for the flat shape this editor actually carries (clone(incoming)
    // never wraps in .data) — read robustly rather than assume the flat case, so a
    // future D1-shaped `trip` can't silently patch `days: undefined` and wipe stops.
    patchDays(next.data?.days || next.days)
  }

  async function publish() {
    if (!comp.ok) return
    setTrip((cur) => ({ ...cur, draft: false }))
    // Persist immediately rather than waiting on the debounce.
    if (timerRef.current) clearTimeout(timerRef.current)
    const snap = { ...clone(tripRef.current), draft: false }
    tripRef.current = snap
    setSaveState('saving')
    const res = await tripsApi.upsertTrip(snap)
    lastPushedJson.current = JSON.stringify(snap)
    setSaveState(res.ok ? (res.synced ? 'saved' : 'saved-unsynced') : 'error')
    if (!res.ok) setSaveErr(res.error || 'Sync failed.')
  }
  function unpublish() {
    patch({ draft: true })
  }
  // Discard a draft outright (only offered for drafts — a published trip is the
  // family's, deleted from the index, not here). Order matters: set the discard
  // flag and clear the debounce BEFORE removing, so the unmount autosave can't
  // resurrect it; then remove and leave the editor.
  async function discardDraft() {
    discardedRef.current = true
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (onDiscard) await onDiscard(trip.id)
    // The trip is GONE — land where a trip-less view makes sense (the caller
    // passes the index). A from-trip Back here would strand the app on a
    // trip view whose trip no longer exists.
    ;(onDiscarded || onBack)?.()
  }

  async function onCover(file) {
    if (!file) return
    try {
      const out = await uploadTripCover(trip.id, file)
      patch({ coverPhotoUrl: out.url, coverPhotoRef: { storage: 'r2', key: out.key, mime: out.mime } })
    } catch (err) {
      setSaveErr(`Cover upload failed: ${err?.message || err}`)
    }
  }

  return (
    <div className={`min-h-screen pb-32 ${dark ? 'surface-dark' : 'surface-light'}`}>
      <header
        className="px-6 pb-5 border-b surface-rule"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 24px)' }}
      >
        <button
          onClick={onBack}
          className="link-quiet flex items-center gap-1 f-dm text-xs opacity-70"
          style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, marginBottom: 18 }}
          type="button"
        >
          {/* The label tells the truth about where Back goes: opened from the
              trip home / a stop it returns to the trip (the caller passes its
              title); the Settings/drafts flows keep the index return. */}
          <ChevronLeft size={14} /> {backLabel || 'Trips'}
        </button>
        <div className="flex items-start justify-between" style={{ gap: 12 }}>
          <div>
            <h1 className="f-news tt-tightest text-4xl leading-95">
              {trip.title?.trim() || 'Untitled trip'}
            </h1>
            <p className="f-dm text-[11px] opacity-70 mt-2">
              {trip.draft ? 'DRAFT — not shown in the trip list until you publish' : 'PUBLISHED'}
            </p>
          </div>
          <SaveBadge state={saveState} err={saveErr} />
        </div>

        {conflict && (
          <div
            role="alert"
            className="f-dm text-xs mt-4"
            style={{
              background: 'rgba(139,43,31,0.08)', border: '1px solid var(--accent-text, var(--text))',
              color: 'var(--accent-text, var(--text))', padding: '8px 10px', borderRadius: 8,
              display: 'flex', gap: 8, alignItems: 'center',
            }}
          >
            <AlertTriangle size={14} />
            This trip was edited on another device. Last save wins — your
            edits here will overwrite that copy when they save.
            <button
              type="button" onClick={() => setConflict(false)}
              style={{ marginLeft: 'auto', background: 'transparent', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
            >
              Got it
            </button>
          </div>
        )}
      </header>

      <ModeTabs mode={mode} onChange={setMode} v={v} />

      {mode === 'record' ? (
        <RecordMode
          trip={trip}
          traveler={traveler}
          travelers={trip.travelers || TRAVELER_ORDER}
          v={v}
          onAdd={addRecordEntry}
          onUpdate={updateRecordEntry}
          onRemove={removeRecordEntry}
          onPlacePending={placePendingNote}
        />
      ) : (
        <>
      {/* ── Trip-level ─────────────────────────────────────────────── */}
      <Section title="The trip">
        <Text label="Title" required value={trip.title} onChange={(v) => patch({ title: v })} placeholder="Vermont — Juneteenth Weekend" />
        <Text label="Subtitle" value={trip.subtitle} onChange={(v) => patch({ subtitle: v })} placeholder="A long weekend in the Green Mountains" />
        <Text label="Epigraph" value={trip.epigraph} onChange={(v) => patch({ epigraph: v })} placeholder="One line that sets the tone." />
        <Area label="Summary" required value={trip.overview} onChange={(v) => patch({ overview: v })} placeholder="The shape of the trip in a few sentences." />
        <Text label="Date range (label)" value={trip.dateRange} onChange={(v) => patch({ dateRange: v })} placeholder="Jun 19 – 21, 2026 (Fri–Sun)" />
        <Row>
          <DateField label="Start date" required value={trip.dateRangeStart} onChange={(v) => patch({ dateRangeStart: v })} />
          <DateField label="End date" required value={trip.dateRangeEnd} onChange={(v) => patch({ dateRangeEnd: v })} />
        </Row>
        <ShapeToggle
          stay={stay}
          onChange={(isStay) => patch({ shape: isStay ? 'stay' : 'route' })}
        />
        {/* Road-trip-only: a stay has no start→end cities (they feed the drive-home
            scaffolding a stay sheds). Shown only for a route — and never with a
            false required marker (the publish gate doesn't check either city). */}
        {!stay && (
          <Row>
            <Text label="Start city" value={trip.startCity} onChange={(v) => patch({ startCity: v })} placeholder="Belmont, MA" />
            <Text label="End city" value={trip.endCity} onChange={(v) => patch({ endCity: v })} placeholder="Southern Vermont" />
          </Row>
        )}
        <Travelers value={trip.travelers || []} onChange={(v) => patch({ travelers: v })} />
        <CoverPhoto url={trip.coverPhotoUrl} onPick={onCover} />
        <Text label="Shared album URL" value={trip.sharedAlbumURL} onChange={(v) => patch({ sharedAlbumURL: v })} placeholder="https://www.icloud.com/sharedalbum/…" />
      </Section>

      {/* ── The parts (composite trip) — read-only shape ───────────────
          A trip created by the concierge with distinct legs carries explicit
          parts[]. Show them here so the editor reflects the trip's real shape;
          the day-by-day below stays the editable source of truth (days live
          flat in trip.days, parts are a high-level view — see tripParts.js).
          Legacy trips have no explicit parts → this section never renders. */}
      {hasExplicitParts(trip) && (
        <Section title={`The parts · ${getParts(trip).length}`}>
          <p className="f-news-i text-sm opacity-70" style={{ marginBottom: 8 }}>
            The high-level shape of this trip. Edit the day-by-day below.
          </p>
          {getParts(trip).map((p, pi) => {
            const when = humanDateRange(p.dateStart, p.dateEnd)
            return (
              <div key={p.id || pi} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0', borderTop: pi ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', minWidth: 46 }}>
                  {p.type || 'stay'}
                </span>
                <span style={{ flex: 1, color: 'var(--text)' }}>{p.title || partPlaceLabel(p) || 'A part'}</span>
                {when && when !== 'TBD' && (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{when}</span>
                )}
              </div>
            )
          })}
        </Section>
      )}

      {/* ── Lodging (trip-level, drives StopDetail LodgingPanel) ────── */}
      <Section title="Lodging">
        <Lodging value={trip.lodging || {}} onChange={(lodging) => patch({ lodging })} />
      </Section>

      {/* ── Days & stops ───────────────────────────────────────────── */}
      <Section
        title="Days"
        action={<IconBtn onClick={addDay} label="Add day"><Plus size={14} /> Add day</IconBtn>}
      >
        {(trip.days || []).length === 0 && (
          <p className="f-news-i text-sm opacity-70">No days yet. Add the first one.</p>
        )}
        {(trip.days || []).map((d, di) => (
          <DayBlock
            key={di}
            anchorId={d.isoDate ? `editor-day-${d.isoDate}` : undefined}
            day={d}
            index={di}
            count={trip.days.length}
            traveler={traveler}
            tripId={trip.id}
            stay={stay}
            travelers={trip.travelers || TRAVELER_ORDER}
            onUpdate={(p) => updateDay(di, p)}
            onMove={(dir) => moveDay(di, dir)}
            onRemove={() => removeDay(di)}
            onAddStop={() => addStop(di)}
            onUpdateStop={(si, p) => updateStop(di, si, p)}
            onMoveStop={(si, dir) => moveStop(di, si, dir)}
            onRemoveStop={(si) => removeStop(di, si)}
          />
        ))}
      </Section>

      {/* ── Publish gate ───────────────────────────────────────────── */}
      <div className="px-6 py-8 border-t surface-rule">
        {trip.draft ? (
          <>
            <button
              type="button"
              className="btn-solid"
              disabled={!comp.ok}
              onClick={publish}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                opacity: comp.ok ? 1 : 0.5, cursor: comp.ok ? 'pointer' : 'not-allowed',
              }}
            >
              <Eye size={14} /> Publish trip
            </button>
            {!comp.ok && (
              <div className="f-dm text-xs opacity-70 mt-4">
                <p className="smallcaps mb-2" style={{ color: 'var(--accent-text, var(--text))' }}>
                  Still needed before publishing
                </p>
                <ul style={{ listStyle: 'disc', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {comp.missing.slice(0, 12).map((m) => <li key={m}>{m}</li>)}
                  {comp.missing.length > 12 && <li>+{comp.missing.length - 12} more</li>}
                </ul>
              </div>
            )}
            {comp.ok && (
              <p className="f-news-i text-sm opacity-70 mt-3">
                Everything the themed views need is filled in. Publishing
                makes this trip appear alongside the others.
              </p>
            )}
            {/* Discard — back out of a draft for good. Two-tap confirm so a
                stray press can't lose work. Only ever shown for a draft. */}
            <div className="mt-6">
              {confirmDiscard ? (
                <div className="flex items-center" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <span className="f-dm text-xs opacity-70">Discard this draft for good?</span>
                  <button
                    type="button"
                    className="btn-pill"
                    onClick={discardDraft}
                    style={{ borderColor: 'var(--accent-text, var(--text))', color: 'var(--accent-text, var(--text))', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Trash2 size={13} /> Discard draft
                  </button>
                  <button type="button" className="btn-pill" onClick={() => setConfirmDiscard(false)}>
                    Keep it
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="link-quiet f-dm text-xs"
                  onClick={() => setConfirmDiscard(true)}
                  style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--muted)' }}
                >
                  <Trash2 size={12} /> Discard this draft
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center" style={{ gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn-solid" onClick={() => onOpenTrip?.(trip.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Eye size={14} /> View in trip
            </button>
            <button type="button" className="btn-pill" onClick={unpublish}>
              Move back to draft
            </button>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  )
}

// ── Save status ───────────────────────────────────────────────────────
function SaveBadge({ state, err }) {
  const map = {
    idle: { t: 'No unsaved changes', c: 'inherit', i: null },
    saving: { t: 'Saving…', c: 'inherit', i: <Loader size={12} className="rt-spin" /> },
    saved: { t: 'Saved · synced', c: '#2E5D3A', i: <Check size={12} /> },
    // Saved locally/server but NOT yet shared with the family (a draft, or the worker
    // unconfigured). Honest: "Saved" without the false "synced" — the family can't see
    // it yet, and a draft is shared only on publish (G6: the label promises no more
    // than the plumbing delivers; upsertTrip's res.synced is the source of truth).
    'saved-unsynced': { t: 'Saved', c: '#2E5D3A', i: <Check size={12} /> },
    error: { t: err || 'Saved locally · sync failed', c: 'var(--accent-text, var(--text))', i: <AlertTriangle size={12} /> },
  }
  const m = map[state] || map.idle
  return (
    <span className="f-dm text-[11px]" style={{ color: m.c, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      {m.i}{m.t}
    </span>
  )
}

// ── Day block ─────────────────────────────────────────────────────────
function DayBlock(props) {
  const {
    day, index, count, traveler, tripId, travelers, stay, anchorId,
    onUpdate, onMove, onRemove, onAddStop, onUpdateStop, onMoveStop, onRemoveStop,
  } = props
  return (
    <div id={anchorId} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14, scrollMarginTop: 12 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <p className="smallcaps f-dm text-[11px] opacity-70">Day {index + 1}</p>
        <div className="flex" style={{ gap: 4 }}>
          <IconBtn onClick={() => onMove(-1)} label="Move day up" disabled={index === 0}><ArrowUp size={13} /></IconBtn>
          <IconBtn onClick={() => onMove(1)} label="Move day down" disabled={index === count - 1}><ArrowDown size={13} /></IconBtn>
          <IconBtn onClick={onRemove} label="Remove day" danger><Trash2 size={13} /></IconBtn>
        </div>
      </div>
      <Row>
        <DateField
          label="Date" required value={day.isoDate}
          onChange={(v) => onUpdate({ isoDate: v, date: humanDate(v) })}
        />
        <Text label="Label" required value={day.title} onChange={(v) => onUpdate({ title: v })} placeholder="Drive up" />
      </Row>
      {/* The per-day drive plan is road-trip-only — a stay returns to the same
          place each night, so it sheds "Drive from / to / time". For a stay, the
          one still-useful field (where you slept that night) stands alone. */}
      {stay ? (
        <Row>
          <Text label="Staying (this night)" value={day.lodging} onChange={(v) => onUpdate({ lodging: v })} placeholder="The cabin" />
          <div />
        </Row>
      ) : (
        <>
          <Row>
            <Text label="Drive from" value={day.drive?.from} onChange={(v) => onUpdate({ drive: { ...day.drive, from: v } })} placeholder="Belmont, MA" />
            <Text label="Drive to" value={day.drive?.to} onChange={(v) => onUpdate({ drive: { ...day.drive, to: v } })} placeholder="Southern Vermont" />
          </Row>
          <Row>
            <Text label="Drive time" value={day.drive?.hours} onChange={(v) => onUpdate({ drive: { ...day.drive, hours: v } })} placeholder="3h 30m" />
            <Text label="Lodging (this day)" value={day.lodging} onChange={(v) => onUpdate({ lodging: v })} placeholder="Cabin name" />
          </Row>
        </>
      )}

      <div style={{ marginTop: 12, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <p className="smallcaps f-dm text-[11px] opacity-70">Stops</p>
          <IconBtn onClick={onAddStop} label="Add stop"><Plus size={13} /> Add stop</IconBtn>
        </div>
        {(day.stops || []).length === 0 && (
          <p className="f-news-i text-xs opacity-70 mb-2">No stops yet.</p>
        )}
        {(day.stops || []).map((s, si) => (
          <StopBlock
            key={s.id || si}
            stop={s}
            index={si}
            count={day.stops.length}
            traveler={traveler}
            tripId={tripId}
            travelers={travelers}
            onUpdate={(p) => onUpdateStop(si, p)}
            onMove={(dir) => onMoveStop(si, dir)}
            onRemove={() => onRemoveStop(si)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Stop block ────────────────────────────────────────────────────────
function StopBlock({ stop, index, count, traveler, tripId, travelers, onUpdate, onMove, onRemove }) {
  const [recording, setRecording] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiErr, setAiErr] = useState('')
  const [geoNote, setGeoNote] = useState('')
  const fileRef = useRef(null)
  const memCount = listMemoriesForStop(stop.id, traveler).length

  async function onAddressBlur() {
    const a = (stop.address || '').trim()
    if (!a) return
    setGeoNote('Locating…')
    const hit = await geocodeAddress(a)
    if (hit) {
      onUpdate({ lat: hit.lat, lng: hit.lng })
      setGeoNote(`Located (${hit.lat.toFixed(4)}, ${hit.lng.toFixed(4)})`)
    } else {
      setGeoNote('Could not locate — saved the address; coordinates left blank.')
    }
  }

  async function runAi() {
    setAiErr('')
    setAiBusy(true)
    const res = await suggestPitch({
      name: stop.name, address: stop.address, forTags: stop.for,
      rawNotes: stop.note, tripTitle: undefined,
    })
    setAiBusy(false)
    if (res.ok) onUpdate({ note: res.text })
    else setAiErr(res.error)
  }

  async function onVoiceStop(payload) {
    setRecording(false)
    if (!payload?.blob) return
    const r = await transcribeWithStatus(payload.blob)
    if (r.status === 'done' && r.transcript) {
      onUpdate({ note: stop.note ? `${stop.note}\n${r.transcript}` : r.transcript })
    }
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    // Same path the rest of the app uses: blob → IDB → Memory(kind:photo)
    // against this stop → workerSync mirrors it to R2 → themed views
    // render it inline in the stop's memory thread.
    const key = makeAssetKey('photo')
    // saveAsset auto-downscales photos via preparePhotoForUpload. Use
    // the returned mime so photoRef reflects the actual stored bytes
    // (image/jpeg) instead of the source mime (which may be HEIC).
    const { mime } = await saveAsset('photo', key, file, file.type)
    saveMemory({
      tripId, stopId: stop.id, authorTraveler: traveler,
      visibility: 'shared', kind: 'photo',
      photoRef: { storage: 'idb', key, mime },
    })
    onUpdate({}) // nudge autosave + re-render the count
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10, background: 'var(--card)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <p className="f-mono text-[10px] opacity-70">STOP {index + 1}</p>
        <div className="flex" style={{ gap: 4 }}>
          <IconBtn onClick={() => onMove(-1)} label="Move stop up" disabled={index === 0}><ArrowUp size={12} /></IconBtn>
          <IconBtn onClick={() => onMove(1)} label="Move stop down" disabled={index === count - 1}><ArrowDown size={12} /></IconBtn>
          <IconBtn onClick={onRemove} label="Remove stop" danger><Trash2 size={12} /></IconBtn>
        </div>
      </div>
      <Row>
        <Text label="Name" required value={stop.name} onChange={(v) => onUpdate({ name: v })} placeholder="Eric Carle Museum" />
        <Text label="Time / window" value={stop.time} onChange={(v) => onUpdate({ time: v })} placeholder="11:00 AM" />
      </Row>
      <Row>
        <Select label="Kind" value={stop.kind} options={STOP_KINDS} onChange={(v) => onUpdate({ kind: v })} />
        <BaseToggle
          value={stopIsBase(stop)}
          onChange={(v) => onUpdate({ isBase: v })}
          located={Number.isFinite(stop.lat) && Number.isFinite(stop.lng)}
        />
      </Row>
      <Travelers compact label="Who it's for" value={stop.for || []} onChange={(v) => onUpdate({ for: v })} pool={travelers} />
      <div>
        <Text label="Address" value={stop.address} onChange={(v) => onUpdate({ address: v })} onBlur={onAddressBlur} placeholder="125 W Bay Rd, Amherst, MA" />
        {geoNote && (
          <p className="f-dm text-[11px] mt-1" style={{ opacity: 0.6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={11} /> {geoNote}
          </p>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <span className="smallcaps f-dm text-[11px] opacity-70">The pitch <span style={{ color: 'var(--accent-text, var(--text))' }}>*</span></span>
          <div className="flex" style={{ gap: 6 }}>
            {isWhisperConfigured() && (
              <IconBtn onClick={() => setRecording(true)} label="Dictate the pitch"><Mic size={12} /></IconBtn>
            )}
            {isAiAssistConfigured() && (
              <IconBtn onClick={runAi} label="Help me write this" disabled={aiBusy}>
                {aiBusy ? <Loader size={12} className="rt-spin" /> : <Sparkles size={12} />} Help me write
              </IconBtn>
            )}
          </div>
        </div>
        <textarea
          value={stop.note || ''}
          onChange={(e) => onUpdate({ note: e.target.value })}
          className="memory-textarea"
          style={{ width: '100%', padding: 10, fontSize: 14, minHeight: 80 }}
          placeholder="A sentence or two in the family's voice. Tap “Help me write” for a draft."
        />
        {aiErr && <p className="f-dm text-[11px] mt-1" style={{ color: 'var(--accent-text, var(--text))' }}>{aiErr}</p>}
      </div>

      <Area label="Helen's note (optional override)" value={stop.helenNote} onChange={(v) => onUpdate({ helenNote: v })} placeholder="Shown only in Helen's view, in place of the pitch." />

      <Text label="Link (tickets / menu / info)" value={stop.url} onChange={(v) => onUpdate({ url: v })} placeholder="https://…" />

      <div style={{ marginTop: 8, borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
        <p className="smallcaps f-dm text-[11px] opacity-70 mb-2">Logistics</p>
        <Row>
          <Text label="Reservation" value={stop.reservation} onChange={(v) => onUpdate({ reservation: v })} placeholder="Resy 7:30 PM, 4 guests" />
          <Text label="Confirmation #" value={stop.confirmation} onChange={(v) => onUpdate({ confirmation: v })} placeholder="ABC123" />
        </Row>
        <Text label="Phone" value={stop.phone} onChange={(v) => onUpdate({ phone: v })} placeholder="781-530-7888" />
      </div>

      <div style={{ marginTop: 8 }}>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />
        <IconBtn onClick={() => fileRef.current?.click()} label="Add a photo to this stop">
          <ImageIcon size={12} /> Add photo{memCount > 0 ? ` (${memCount} attached)` : ''}
        </IconBtn>
      </div>

      {recording && <VoiceRecorder onCancel={() => setRecording(false)} onStop={onVoiceStop} />}
    </div>
  )
}

// ── Field primitives ──────────────────────────────────────────────────
// ── The two tenses: The plan | The record ────────────────────────────
// A segmented control under the header. THE PLAN is the default and leaves
// the editor byte-identical to before this control existed. THE RECORD wears
// the gold --kept tint so the tense reads before the label does. Aurelia's
// labels lowercase via v.lc (chrome only). (02-capture-arc.md, screenshot 08.)
function ModeTabs({ mode, onChange, v }) {
  function Tab({ id, label }) {
    const on = mode === id
    const gold = id === 'record'
    return (
      <button
        type="button"
        aria-pressed={on}
        data-testid={`editor-mode-${id}`}
        onClick={() => onChange(id)}
        style={{
          flex: 1, minHeight: 38, padding: '8px 12px', borderRadius: 999, cursor: 'pointer',
          fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.13em',
          textTransform: 'uppercase', fontWeight: 600,
          background: on ? (gold ? 'color-mix(in srgb, var(--kept) 15%, transparent)' : 'var(--card)') : 'transparent',
          // The record tab's text was raw var(--kept) on its own 15%-tinted
          // background — both anchored to the same hue, so contrast between
          // them stays low no matter which theme's --kept shade renders (axe:
          // 3.03 vs the 4.5:1 floor). Anchoring the text to --text (which the
          // theme already guarantees is legible on --card/--bg) instead of the
          // decorative accent fixes it while still reading gold.
          color: on ? (gold ? 'color-mix(in srgb, var(--kept) 55%, var(--text))' : 'var(--text)') : 'var(--muted)',
          border: `1px solid ${on ? (gold ? 'color-mix(in srgb, var(--kept) 42%, transparent)' : 'var(--border)') : 'transparent'}`,
        }}
      >
        {v.lc(label)}
      </button>
    )
  }
  return (
    <div className="px-6" style={{ paddingTop: 16 }}>
      <div role="group" aria-label="The plan or the record" style={{ display: 'flex', gap: 6, padding: 4, border: '1px solid var(--border)', borderRadius: 999 }}>
        <Tab id="plan" label="The plan" />
        <Tab id="record" label="The record" />
      </div>
    </div>
  )
}

// Mouth three — "type it." The editor's record tense: what actually happened,
// day by day. Writes day.record only; the plan/lodging/trip sections are
// hidden here so the two tenses never blur. (02-capture-arc.md.)
function RecordMode({ trip, traveler, travelers, v, onAdd, onUpdate, onRemove, onPlacePending }) {
  const days = trip.days || []
  // Rafa's pending "tell about today" notes are ordinary voice Memories
  // (memoryStore.js) — the record only queues their ids (dayRecord.js's
  // pending array). Fetched once per trip/traveler; a day looks its own up
  // by id below rather than re-querying per row.
  const memoriesById = useMemo(() => {
    const map = new Map()
    for (const m of listMemoriesForTrip(trip.id, traveler)) map.set(m.id, m)
    return map
  }, [trip.id, traveler])
  return (
    <div data-testid="record-mode">
      <Section title={v.lc('Record the day')}>
        <p className="f-news-i text-sm" style={{ color: 'var(--muted)', marginTop: -6 }}>
          {v.lc('What actually happened — the loose truth of the day. It lives beside the plan and never rewrites it.')}
        </p>
        {days.length === 0 && (
          <p className="f-news-i text-sm opacity-70">{v.lc('Add a day in the plan first, then record what happened on it.')}</p>
        )}
        {days.map((d, di) => (
          <RecordDayBlock
            key={d.isoDate || di}
            day={d}
            index={di}
            travelers={travelers}
            v={v}
            onAdd={() => onAdd(di)}
            onUpdate={(ri, p) => onUpdate(di, ri, p)}
            onRemove={(ri) => onRemove(di, ri)}
            memoriesById={memoriesById}
            onPlacePending={(memId, entryId, transcript) => onPlacePending(d.isoDate, memId, entryId, transcript)}
          />
        ))}
      </Section>
      <div className="px-6 py-8 border-t surface-rule">
        <p className="f-dm text-xs" style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Lock size={12} /> {v.lc('Changes here never touch the plan.')}
        </p>
      </div>
    </div>
  )
}

function RecordDayBlock({ day, index, travelers, v, onAdd, onUpdate, onRemove, memoriesById, onPlacePending }) {
  // The editor edits the RAW array (dayRecordOf) — nameless rows are legit
  // working state here; the read faces (namedRecordEntries) hide them.
  const entries = dayRecordOf(day)
  const namedEntries = entries.filter((e) => (e?.name || '').trim())
  const pendingIds = pendingNoteIds(day)
  const label = day.date || humanDate(day.isoDate) || ''
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div className="flex items-baseline" style={{ gap: 8, marginBottom: entries.length ? 10 : 6 }}>
        <p className="smallcaps f-dm text-[11px] opacity-70">{v.lc(`Day ${index + 1}`)}</p>
        {label && <p className="f-dm text-[11px]" style={{ color: 'var(--muted)' }}>{label}</p>}
      </div>
      {entries.map((e, ri) => (
        <RecordEntry
          key={e.id || ri}
          entry={e}
          travelers={travelers}
          v={v}
          onChange={(p) => onUpdate(ri, p)}
          onRemove={() => onRemove(ri)}
        />
      ))}
      <div style={{ marginTop: entries.length ? 12 : 0 }}>
        <IconBtn onClick={onAdd} label="Add what happened"><Plus size={13} /> {v.lc('Add what happened')}</IconBtn>
      </div>
      {pendingIds.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border)' }} data-testid="pending-from-rafa">
          <p className="smallcaps f-dm text-[11px]" style={{ opacity: 0.7, marginBottom: 8 }}>
            {v.lc('Pending from Rafa')}
          </p>
          {pendingIds.map((memId) => (
            <PendingNoteRow
              key={memId}
              memId={memId}
              memory={memoriesById.get(memId)}
              namedEntries={namedEntries}
              v={v}
              onPlace={onPlacePending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// A parent resolves ONE of Rafa's pending "tell about today" notes (design 04):
// attach its transcript onto a named entry, or leave it a loose voice memory —
// the only two moves; his side has no delete/edit of its own. The audio plays
// straight from the Memory (R2 if synced, else the author's own IDB — same
// fallback ThreadedMemories' VoiceBubble uses) so a parent can hear it even
// before Whisper's transcript lands.
function PendingNoteRow({ memId, memory, namedEntries, v, onPlace }) {
  const [entryId, setEntryId] = useState('')
  const [audioUrl, setAudioUrl] = useState(null)
  useEffect(() => {
    let active = true
    let created = null
    if (memory?.audioRef?.url) {
      setAudioUrl(memory.audioRef.url)
    } else if (memory?.audioRef?.key) {
      loadAsset('audio', memory.audioRef.key).then((blob) => {
        if (!active || !blob) return
        created = URL.createObjectURL(blob)
        setAudioUrl(created)
      })
    }
    return () => {
      active = false
      if (created) URL.revokeObjectURL(created)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memory?.audioRef?.key, memory?.audioRef?.url])

  const transcript = (memory?.transcript || '').trim()
  const transcribing = !transcript && memory?.transcriptionStatus === 'pending'
  return (
    <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 10, marginBottom: 8 }} data-testid="pending-rafa-note">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          aria-label="Play Rafa's recording"
          disabled={!audioUrl}
          onClick={() => audioUrl && new Audio(audioUrl).play().catch(() => {})}
          style={{
            width: 26, height: 26, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: 'var(--accent)', color: '#fff',
            cursor: audioUrl ? 'pointer' : 'default', opacity: audioUrl ? 1 : 0.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Play size={11} fill="currentColor" />
        </button>
        <p className="f-news-i text-sm" style={{ flex: 1, margin: 0, fontStyle: transcript ? 'italic' : 'normal' }}>
          {transcript || (transcribing ? v.lc('Transcribing…') : v.lc('(play to hear it)'))}
        </p>
      </div>
      {namedEntries.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            aria-label="Attach to which entry"
            value={entryId}
            onChange={(e) => setEntryId(e.target.value)}
            className="f-dm text-xs"
            style={{ borderRadius: 6, border: '1px solid var(--border)', padding: '4px 6px', background: 'var(--card)', color: 'var(--text)' }}
          >
            <option value="">{v.lc('Attach to…')}</option>
            {namedEntries.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <IconBtn disabled={!entryId} onClick={() => onPlace(memId, entryId, transcript)} label="Attach">
            {v.lc('Attach')}
          </IconBtn>
        </div>
      )}
      <div style={{ marginTop: 6 }}>
        <button
          type="button"
          onClick={() => onPlace(memId, null, '')}
          className="f-dm text-xs"
          style={{ background: 'transparent', border: 'none', color: 'var(--muted)', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
        >
          {v.lc('Keep as a loose note')}
        </button>
      </div>
    </div>
  )
}

// Words-first time — the record speaks in "late morning," not "10:42". The
// four chips cover the common case; "Exact…" opens a free field for a real
// time or any other phrase. Stored as the entry's loose `time` string.
const WHEN_WORDS = ['Morning', 'Midday', 'Afternoon', 'Evening']
function RecordEntry({ entry, travelers, v, onChange, onRemove }) {
  const isWord = WHEN_WORDS.some((w) => w.toLowerCase() === (entry.time || '').toLowerCase())
  const [exact, setExact] = useState(() => !!(entry.time || '').trim() && !isWord)
  const chipStyle = (on) => ({
    fontSize: 11,
    background: on ? 'var(--accent)' : 'transparent',
    color: on ? 'var(--accent-ink, #fff)' : 'inherit',
    borderColor: on ? 'var(--accent)' : 'currentColor',
  })
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <Lbl label={v.lc('What happened')} />
        <IconBtn onClick={onRemove} label="Remove this entry" danger><Trash2 size={12} /></IconBtn>
      </div>
      <input
        value={entry.name || ''}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder={v.lc('The beach below the house')}
        aria-label={v.lc('What happened')}
        className="memory-textarea"
        style={{ minHeight: 'auto', padding: 10, fontSize: 16, fontFamily: 'var(--font-display)', width: '100%' }}
      />
      <div style={{ marginTop: 10 }}>
        <Lbl label={v.lc('Roughly when')} />
        <div className="flex" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {WHEN_WORDS.map((w) => (
            <button
              key={w} type="button" className="btn-pill"
              onClick={() => { setExact(false); onChange({ time: w }) }}
              style={chipStyle(!exact && (entry.time || '').toLowerCase() === w.toLowerCase())}
            >
              {v.lc(w)}
            </button>
          ))}
          <button
            type="button" className="btn-pill"
            onClick={() => setExact(true)}
            style={chipStyle(exact)}
          >
            {v.lc('Exact…')}
          </button>
        </div>
        {exact && (
          <input
            value={entry.time || ''}
            onChange={(e) => onChange({ time: e.target.value })}
            placeholder={v.lc("e.g. 4:30, or ‘after lunch’")}
            aria-label={v.lc('When (exact)')}
            className="memory-textarea"
            style={{ minHeight: 'auto', padding: 10, fontSize: 14, marginTop: 8, width: '100%' }}
          />
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <Travelers label={v.lc('Who')} value={entry.for || []} onChange={(f) => onChange({ for: f })} pool={travelers} compact />
      </div>
      <div style={{ marginTop: 10 }}>
        <Area label={v.lc('A line, if you like')} value={entry.note} onChange={(n) => onChange({ note: n })} placeholder={v.lc('One sentence is plenty.')} />
      </div>
    </div>
  )
}

function Section({ title, action, children }) {
  return (
    <section className="px-6 py-7 border-b surface-rule">
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <h2 className="f-news text-2xl tt-tightest">{title}</h2>
        {action}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </section>
  )
}
function Row({ children }) {
  return <div className="grid grid-cols-2 gap-3" style={{ alignItems: 'start' }}>{children}</div>
}
// The trip-shape control. A stay (one place you return to) hides the road-trip
// fields; flipping "we're driving between places" on brings them back. Mirrors the
// NewTrip toggle so create and edit ask the same question. Writes trip.shape, the
// top-priority signal inferTripShape reads, so the choice is authoritative.
function ShapeToggle({ stay, onChange }) {
  return (
    <label
      className="flex items-center justify-between"
      style={{ gap: 12, cursor: 'pointer' }}
    >
      <span className="flex flex-col" style={{ gap: 2 }}>
        <span className="smallcaps f-dm text-[11px] opacity-70">We’re driving between places</span>
        {/* full-opacity --muted: a faint/low-opacity caption fails AA on the light
            persona (axe-gated via photos-base) — see surprises/skin-redesign memory. */}
        <span className="f-dm text-[11px]" style={{ color: 'var(--muted)' }}>On for a road trip — start/end cities and a per-day drive plan. Off for a stay.</span>
      </span>
      <input
        type="checkbox"
        checked={!stay}
        onChange={(e) => onChange(!e.target.checked)}
        style={{ width: 20, height: 20, flexShrink: 0, accentColor: 'var(--accent, var(--text))' }}
        aria-label="We’re driving between places (a road trip)"
      />
    </label>
  )
}
function Lbl({ label, required }) {
  return (
    <span className="smallcaps f-dm text-[11px] opacity-70">
      {label}{required && <span style={{ color: 'var(--accent-text, var(--text))', marginLeft: 4 }}>*</span>}
    </span>
  )
}
function Text({ label, required, value, onChange, onBlur, placeholder }) {
  return (
    <label className="flex flex-col" style={{ gap: 6 }}>
      <Lbl label={label} required={required} />
      <input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="memory-textarea"
        style={{ minHeight: 'auto', padding: 10, fontSize: 14 }}
      />
    </label>
  )
}
function Area({ label, required, value, onChange, placeholder }) {
  return (
    <label className="flex flex-col" style={{ gap: 6 }}>
      <Lbl label={label} required={required} />
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="memory-textarea"
        style={{ padding: 10, fontSize: 14, minHeight: 70, width: '100%' }}
      />
    </label>
  )
}
function DateField({ label, required, value, onChange }) {
  return (
    <label className="flex flex-col" style={{ gap: 6 }}>
      <Lbl label={label} required={required} />
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="memory-textarea"
        style={{ minHeight: 'auto', padding: 10, fontSize: 14 }}
      />
    </label>
  )
}
function Select({ label, value, options, onChange }) {
  return (
    <label className="flex flex-col" style={{ gap: 6 }}>
      <Lbl label={label} />
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="memory-textarea"
        style={{ minHeight: 'auto', padding: 10, fontSize: 14 }}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}
// The base toggle. Sits in the slot beside "Kind". `value` is the DERIVED
// base-ness (a place you stay is on by default — see stopIsBase); ticking
// stores an explicit on/off so a hotel can be opted out or any spot opted in.
// When a base has no located address it can't catch photos, so we say so.
function BaseToggle({ value, onChange, located }) {
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <Lbl label="Base" />
      <label
        className="memory-textarea"
        style={{
          minHeight: 'auto', padding: 10, fontSize: 14, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: 'var(--accent)', width: 16, height: 16, flexShrink: 0 }}
        />
        <span>We're staying here</span>
      </label>
      {value && !located && (
        <p className="f-dm text-[11px]" style={{ opacity: 0.65, marginTop: 2 }}>
          Add an address above so photos here can file to this base.
        </p>
      )}
    </div>
  )
}
function Travelers({ label = 'Travelers', value, onChange, pool = TRAVELER_ORDER, compact }) {
  function toggle(id) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <Lbl label={label} />
      <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
        {pool.map((id) => (
          <button
            key={id}
            type="button"
            className="btn-pill"
            onClick={() => toggle(id)}
            style={{
              background: value.includes(id) ? 'var(--accent)' : 'transparent',
              color: value.includes(id) ? 'var(--accent-ink, #fff)' : 'inherit',
              borderColor: value.includes(id) ? 'var(--accent)' : 'currentColor',
              fontSize: compact ? 11 : 13,
            }}
          >
            {TRAVELERS[id]?.name || id}
          </button>
        ))}
      </div>
    </div>
  )
}
function Lodging({ value, onChange }) {
  const set = (p) => onChange({ ...value, ...p })
  const [geoNote, setGeoNote] = useState('')
  // Bumped only when a fresh geocode lands, so dragging the pin (which updates
  // lat/lng) doesn't remount the map mid-drag, but a NEW address re-centers it.
  const [pinKey, setPinKey] = useState(0)
  const located = Number.isFinite(value.lat) && Number.isFinite(value.lng)

  // Geocode the lodging address (Phase 2). Unlike a stop pin, this point is
  // load-bearing for the WHOLE stay — the live rail's "At [place]" geofence and
  // no-GPS photo filing both read it — so we surface a draggable pin to confirm
  // (Jonathan's call) rather than geocoding silently.
  async function onAddressBlur() {
    const a = (value.address || '').trim()
    if (!a) return
    if (located && a === (value.geoFor || '')) return // already located this exact address
    setGeoNote('Locating…')
    const hit = await geocodeAddress(a)
    if (hit) {
      set({ lat: hit.lat, lng: hit.lng, geoFor: a })
      setGeoNote('Found it — if the pin’s off, refine the address above or drag the pin.')
      setPinKey((k) => k + 1)
    } else {
      set({ lat: undefined, lng: undefined, geoFor: undefined })
      setGeoNote('Couldn’t find this address — it’s saved, but “At [place]” needs a located address.')
    }
  }

  return (
    <>
      <Text label="Lodging name" value={value.name} onChange={(v) => set({ name: v })} placeholder="Jessica & Yoav's cabin" />
      <Text label="Address" value={value.address} onChange={(v) => set({ address: v })} onBlur={onAddressBlur} placeholder="Pending host confirmation" />
      {geoNote && (
        <p className="f-dm text-[11px] mt-1" style={{ opacity: 0.6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <MapPin size={11} /> {geoNote}
        </p>
      )}
      {located && (
        <Suspense fallback={<p className="f-dm text-[11px] mt-1" style={{ opacity: 0.5 }}>Loading map…</p>}>
          <LodgingPinConfirm key={pinKey} lat={value.lat} lng={value.lng} onMove={(c) => set({ lat: c.lat, lng: c.lng })} />
        </Suspense>
      )}
      <Row>
        <Text label="Check in" value={value.checkIn} onChange={(v) => set({ checkIn: v })} placeholder="Fri Jun 19, 4:00 PM" />
        <Text label="Check out" value={value.checkOut} onChange={(v) => set({ checkOut: v })} placeholder="Sun Jun 21, 10:00 AM" />
      </Row>
      <Area label="Lodging notes" value={value.notes} onChange={(v) => set({ notes: v })} placeholder="Parking, keys, host contact." />
      <Text label="Guest portal URL" value={value.portalUrl} onChange={(v) => set({ portalUrl: v })} placeholder="https://…" />
    </>
  )
}
function CoverPhoto({ url, onPick }) {
  const ref = useRef(null)
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <Lbl label="Cover photo" />
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onPick(f) }} />
      {url ? (
        <div style={{ position: 'relative' }}>
          <img src={url} alt="Trip cover" style={{ width: '100%', borderRadius: 8, display: 'block', maxHeight: 180, objectFit: 'cover' }} />
          <button type="button" className="btn-pill" onClick={() => ref.current?.click()}
            style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', borderColor: 'transparent' }}>
            Replace
          </button>
        </div>
      ) : (
        <IconBtn onClick={() => ref.current?.click()} label="Upload cover photo">
          <ImageIcon size={13} /> Upload cover photo
        </IconBtn>
      )}
    </div>
  )
}
function IconBtn({ children, onClick, label, danger, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className="btn-pill"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12,
        padding: '5px 10px',
        color: danger ? 'var(--accent-text, var(--text))' : 'inherit',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}
