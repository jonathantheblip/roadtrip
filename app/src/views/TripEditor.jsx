import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft, Plus, Trash2, ArrowUp, ArrowDown, Mic, Sparkles,
  MapPin, Image as ImageIcon, Check, Loader, AlertTriangle, Eye,
} from 'lucide-react'
import { TRAVELER_ORDER, TRAVELERS } from '../data/travelers'
import { geocodeAddress } from '../lib/geocode'
import { suggestPitch, isAiAssistConfigured } from '../lib/aiAssist'
import { transcribeWithStatus, isWhisperConfigured } from '../lib/whisper'
import { uploadTripCover } from '../lib/workerSync'
import { saveAsset, makeAssetKey } from '../lib/memAssets'
import { saveMemory, listMemoriesForStop } from '../lib/memoryStore'
import { VoiceRecorder } from '../components/VoiceRecorder'
import { newTripId } from '../utils/ids'

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

// What the themed views need before a trip can be published. Mirrors
// the seed-trip polish bar — no sparse trip ever reaches the views.
function completeness(trip) {
  const missing = []
  if (!trip.title?.trim()) missing.push('Title')
  if (!trip.dateRangeStart || !trip.dateRangeEnd) missing.push('Start & end dates')
  if (!trip.endCity?.trim()) missing.push('End city')
  if (!trip.overview?.trim()) missing.push('Summary')
  const days = trip.days || []
  if (days.length === 0) missing.push('At least one day')
  days.forEach((d, i) => {
    const n = i + 1
    if (!d.isoDate) missing.push(`Day ${n}: date`)
    if (!d.title?.trim()) missing.push(`Day ${n}: label`)
    const stops = d.stops || []
    if (stops.length === 0) missing.push(`Day ${n}: at least one stop`)
    stops.forEach((s, j) => {
      const sn = `Day ${n} · stop ${j + 1}`
      if (!s.name?.trim()) missing.push(`${sn}: name`)
      if (!s.time?.trim()) missing.push(`${sn}: time`)
      if (!s.note?.trim()) missing.push(`${sn}: the pitch`)
      if (!s.for || s.for.length === 0) missing.push(`${sn}: who it's for`)
      if (!s.address?.trim()) missing.push(`${sn}: address`)
    })
  })
  return { ok: missing.length === 0, missing }
}

export function TripEditor({ trip: incoming, traveler, dark, tripsApi, onBack, onOpenTrip }) {
  const [trip, setTrip] = useState(() => clone(incoming))
  const tripRef = useRef(trip)
  tripRef.current = trip

  const [saveState, setSaveState] = useState('idle') // idle|saving|saved|error
  const [saveErr, setSaveErr] = useState('')
  const [conflict, setConflict] = useState(false)
  const lastPushedJson = useRef(JSON.stringify(incoming))
  const timerRef = useRef(null)

  // Reload working copy if the editor is pointed at a different trip.
  useEffect(() => {
    if (incoming?.id && incoming.id !== tripRef.current.id) {
      setTrip(clone(incoming))
      lastPushedJson.current = JSON.stringify(incoming)
      setConflict(false)
      setSaveState('idle')
    }
  }, [incoming?.id])

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
      setSaveState('saved')
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
  // the last keystroke.
  useEffect(() => {
    return () => {
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

  const comp = useMemo(() => completeness(trip), [trip])

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
    setSaveState(res.ok ? 'saved' : 'error')
    if (!res.ok) setSaveErr(res.error || 'Sync failed.')
  }
  function unpublish() {
    patch({ draft: true })
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
      <header className="px-6 pt-6 pb-5 border-b surface-rule">
        <button
          onClick={onBack}
          className="link-quiet flex items-center gap-1 f-dm text-xs opacity-70"
          style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, marginBottom: 18 }}
          type="button"
        >
          <ChevronLeft size={14} /> Trips
        </button>
        <div className="flex items-start justify-between" style={{ gap: 12 }}>
          <div>
            <h1 className="f-news tt-tightest text-4xl leading-95">
              {trip.title?.trim() || 'Untitled trip'}
            </h1>
            <p className="f-dm text-[11px] opacity-60 mt-2">
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
              background: 'rgba(139,43,31,0.08)', border: '1px solid #C9342A',
              color: '#C9342A', padding: '8px 10px', borderRadius: 8,
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
        <Row>
          <Text label="Start city" value={trip.startCity} onChange={(v) => patch({ startCity: v })} placeholder="Belmont, MA" />
          <Text label="End city" required value={trip.endCity} onChange={(v) => patch({ endCity: v })} placeholder="Southern Vermont" />
        </Row>
        <Travelers value={trip.travelers || []} onChange={(v) => patch({ travelers: v })} />
        <CoverPhoto url={trip.coverPhotoUrl} onPick={onCover} />
        <Text label="Shared album URL" value={trip.sharedAlbumURL} onChange={(v) => patch({ sharedAlbumURL: v })} placeholder="https://www.icloud.com/sharedalbum/…" />
      </Section>

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
          <p className="f-news-i text-sm opacity-60">No days yet. Add the first one.</p>
        )}
        {(trip.days || []).map((d, di) => (
          <DayBlock
            key={di}
            day={d}
            index={di}
            count={trip.days.length}
            traveler={traveler}
            tripId={trip.id}
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
                <p className="smallcaps mb-2" style={{ color: '#C9342A' }}>
                  Still needed before publishing
                </p>
                <ul style={{ listStyle: 'disc', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {comp.missing.slice(0, 12).map((m) => <li key={m}>{m}</li>)}
                  {comp.missing.length > 12 && <li>+{comp.missing.length - 12} more</li>}
                </ul>
              </div>
            )}
            {comp.ok && (
              <p className="f-news-i text-sm opacity-60 mt-3">
                Everything the themed views need is filled in. Publishing
                makes this trip appear alongside the others.
              </p>
            )}
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
    </div>
  )
}

// ── Save status ───────────────────────────────────────────────────────
function SaveBadge({ state, err }) {
  const map = {
    idle: { t: 'No unsaved changes', c: 'inherit', i: null },
    saving: { t: 'Saving…', c: 'inherit', i: <Loader size={12} className="rt-spin" /> },
    saved: { t: 'Saved · synced', c: '#2E5D3A', i: <Check size={12} /> },
    error: { t: err || 'Saved locally · sync failed', c: '#C9342A', i: <AlertTriangle size={12} /> },
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
    day, index, count, traveler, tripId, travelers,
    onUpdate, onMove, onRemove, onAddStop, onUpdateStop, onMoveStop, onRemoveStop,
  } = props
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
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
      <Row>
        <Text label="Drive from" value={day.drive?.from} onChange={(v) => onUpdate({ drive: { ...day.drive, from: v } })} placeholder="Belmont, MA" />
        <Text label="Drive to" value={day.drive?.to} onChange={(v) => onUpdate({ drive: { ...day.drive, to: v } })} placeholder="Southern Vermont" />
      </Row>
      <Row>
        <Text label="Drive time" value={day.drive?.hours} onChange={(v) => onUpdate({ drive: { ...day.drive, hours: v } })} placeholder="3h 30m" />
        <Text label="Lodging (this day)" value={day.lodging} onChange={(v) => onUpdate({ lodging: v })} placeholder="Cabin name" />
      </Row>

      <div style={{ marginTop: 12, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <p className="smallcaps f-dm text-[11px] opacity-70">Stops</p>
          <IconBtn onClick={onAddStop} label="Add stop"><Plus size={13} /> Add stop</IconBtn>
        </div>
        {(day.stops || []).length === 0 && (
          <p className="f-news-i text-xs opacity-50 mb-2">No stops yet.</p>
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
    await saveAsset('photo', key, file, file.type)
    saveMemory({
      tripId, stopId: stop.id, authorTraveler: traveler,
      visibility: 'shared', kind: 'photo',
      photoRef: { storage: 'idb', key, mime: file.type },
    })
    onUpdate({}) // nudge autosave + re-render the count
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10, background: 'var(--card)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <p className="f-mono text-[10px] opacity-50">STOP {index + 1}</p>
        <div className="flex" style={{ gap: 4 }}>
          <IconBtn onClick={() => onMove(-1)} label="Move stop up" disabled={index === 0}><ArrowUp size={12} /></IconBtn>
          <IconBtn onClick={() => onMove(1)} label="Move stop down" disabled={index === count - 1}><ArrowDown size={12} /></IconBtn>
          <IconBtn onClick={onRemove} label="Remove stop" danger><Trash2 size={12} /></IconBtn>
        </div>
      </div>
      <Row>
        <Text label="Name" required value={stop.name} onChange={(v) => onUpdate({ name: v })} placeholder="Eric Carle Museum" />
        <Text label="Time / window" required value={stop.time} onChange={(v) => onUpdate({ time: v })} placeholder="11:00 AM" />
      </Row>
      <Row>
        <Select label="Kind" value={stop.kind} options={STOP_KINDS} onChange={(v) => onUpdate({ kind: v })} />
        <div />
      </Row>
      <Travelers compact label="Who it's for" value={stop.for || []} onChange={(v) => onUpdate({ for: v })} pool={travelers} />
      <div>
        <Text label="Address" required value={stop.address} onChange={(v) => onUpdate({ address: v })} onBlur={onAddressBlur} placeholder="125 W Bay Rd, Amherst, MA" />
        {geoNote && (
          <p className="f-dm text-[11px] mt-1" style={{ opacity: 0.6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={11} /> {geoNote}
          </p>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <span className="smallcaps f-dm text-[11px] opacity-70">The pitch <span style={{ color: '#C9342A' }}>*</span></span>
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
        {aiErr && <p className="f-dm text-[11px] mt-1" style={{ color: '#C9342A' }}>{aiErr}</p>}
      </div>

      <Area label="Helen's note (optional override)" value={stop.helenNote} onChange={(v) => onUpdate({ helenNote: v })} placeholder="Shown only in Helen's view, in place of the pitch." />

      <Text label="Link (tickets / menu / info)" value={stop.url} onChange={(v) => onUpdate({ url: v })} placeholder="https://…" />

      <div style={{ marginTop: 8, borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
        <p className="smallcaps f-dm text-[11px] opacity-60 mb-2">Logistics</p>
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
function Lbl({ label, required }) {
  return (
    <span className="smallcaps f-dm text-[11px] opacity-70">
      {label}{required && <span style={{ color: '#C9342A', marginLeft: 4 }}>*</span>}
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
  return (
    <>
      <Text label="Lodging name" value={value.name} onChange={(v) => set({ name: v })} placeholder="Jessica & Yoav's cabin" />
      <Text label="Address" value={value.address} onChange={(v) => set({ address: v })} placeholder="Pending host confirmation" />
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
        color: danger ? '#C9342A' : 'inherit',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}
