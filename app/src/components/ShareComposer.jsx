// ShareComposer — the in-app "compose & share" flow (share-out Phase 2, E1 MVP).
// Pick several photos already on the trip → caption → Share. It creates ONE
// composed album memory (the picked pieces as its photoRefs) and mints a public
// link for it; the public page renders it through the Slice-1 collage WALL.
//
// E1 scope: compose from EXISTING shared trip photos only (no new-media import —
// that's E3 — and no layout chips yet — that's E2; the album renders as the wall).
// Reuses the existing pieces' refs (storage:'r2', already uploaded) so nothing is
// re-uploaded and the share survives the worker round-trip.
//
// SAFETY: the piece source excludes surprise memories + non-shared (private)
// memories, so you can't accidentally publish something you've hidden or kept
// private. (POST /share also re-checks masking, but we never offer it here.)
//
// Token rules: readable text uses var(--muted) (never --faint); accent-as-TEXT
// uses var(--accent-text); the primary button is an --accent FILL with
// --accent-ink on top — same conventions as ShareMomentSheet / SurpriseComposer.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Check, Share2, X, Image as ImageIcon, Plus, UploadCloud, Mic, Pencil } from 'lucide-react'
import { listMemoriesForTrip, saveMemory } from '../lib/memoryStore'
import { isSurprise } from '../lib/surprises'
import { shareMemory, pushMemory, uploadBlob } from '../lib/workerSync'
import { subscribe as subscribeQueue } from '../lib/uploadQueue'
import { importComposerFile, importAccept, canImportVideo } from '../lib/composerImport'
import { VoiceRecorder } from './VoiceRecorder'

const MAX_ITEMS = 25

// Flatten the trip's shared, non-surprise photo memories into selectable pieces
// that KEEP the real ref (storage:'r2' + key) so the composed memory reuses the
// uploaded R2 object — no re-upload, survives sync.
function tripPhotoPieces(tripId, traveler) {
  const mems = listMemoriesForTrip(tripId, traveler).filter(
    (m) => m && !m.masked && m.visibility === 'shared' && !isSurprise(m)
  )
  const out = []
  for (const m of mems) {
    const refs = m.photoRefs?.length ? m.photoRefs : m.photoRef ? [m.photoRef] : []
    refs.forEach((ref, i) => {
      if (!ref) return
      const url = ref.posterUrl || ref.url
      if (!url) return
      // Not yet uploaded (offline-queued) → not shareable; don't even offer it.
      // A pending ref's url is a session-only blob: object URL.
      if (ref.storage === 'pending' || String(url).startsWith('blob:')) return
      out.push({
        id: `${m.id}::${ref.key || ref.url || i}`,
        ref,
        url,
        isVideo: !!(ref.posterUrl || (ref.mime || '').startsWith('video')),
      })
    })
  }
  return out
}

// A compact live preview of the selected pieces in the chosen layout — mirrors
// the worker's collage render (sharePage.js) so what you arrange is what the
// recipient gets. Pieces = [{ id, url, isVideo }]. Light "house" look.
const PREV_H = [70, 56, 84, 62, 76, 58]
function VideoDot() {
  return <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>▶</span>
}
function PrevMat({ p, h, border = true, rot = 0 }) {
  return (
    <div style={{ transform: rot ? `rotate(${rot}deg)` : 'none', background: border ? '#FCFAF4' : 'transparent', padding: border ? 3 : 0, borderRadius: 2, boxShadow: border ? '0 1px 2px rgba(70,52,30,0.18)' : 'none', position: 'relative' }}>
      <div style={{ position: 'relative', height: h, borderRadius: 1, overflow: 'hidden', background: 'var(--bg2)' }}>
        {p.url && <img src={p.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        {p.isVideo && <VideoDot />}
      </div>
    </div>
  )
}
function fmtDur(s) {
  if (!Number.isFinite(s)) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
}
// E4 preview tiles — mirror the worker's voice pill + note slip (sharePage.js
// .wt-voice / .wt-note) so the in-app "what they'll see" matches the public page.
function PrevVoice({ p }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FCFAF4', border: '1px solid rgba(70,52,30,0.18)', borderRadius: 12, padding: '9px 11px' }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink, #fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Mic size={12} /></span>
      <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'repeating-linear-gradient(90deg, rgba(168,75,49,0.55) 0 2px, transparent 2px 4px)' }} />
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(70,52,30,0.7)' }}>{fmtDur(p.durationSeconds)}</span>
    </div>
  )
}
function PrevNote({ p }) {
  return (
    <div style={{ position: 'relative', background: '#F7F2E7', borderRadius: 3, padding: '14px 12px 12px', boxShadow: '0 1px 2px rgba(70,52,30,0.18)' }}>
      <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 7, fontFamily: '"Fraunces", Georgia, serif', fontSize: 26, color: 'var(--accent)', opacity: 0.5 }}>&ldquo;</span>
      <p style={{ margin: '5px 0 0', fontFamily: '"Fraunces", Georgia, serif', fontStyle: 'italic', fontSize: 13.5, lineHeight: 1.4, color: '#211E18', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{p.text}</p>
    </div>
  )
}
function PrevTile({ p, h }) {
  if (p.kind === 'voice') return <PrevVoice p={p} />
  if (p.kind === 'note') return <PrevNote p={p} />
  return <PrevMat p={p} h={h} />
}
function ComposerPreview({ items, layout }) {
  if (!items.length) return null
  const isMain = (p) => !(p.kind === 'voice' || p.kind === 'note')
  if (layout === 'mosaic') {
    const cols = items.length > 10 ? 3 : 2
    return <div style={{ columnCount: cols, columnGap: 6 }}>{items.map((p, i) => <div key={p.id} style={{ breakInside: 'avoid', marginBottom: 6 }}><PrevTile p={p} h={PREV_H[i % PREV_H.length]} /></div>)}</div>
  }
  if (layout === 'stack') {
    const photos = items.filter(isMain).slice(0, 5)
    const extras = items.filter((p) => !isMain(p))
    return (
      <>
        <div style={{ position: 'relative', height: 150 }}>
          {photos.map((p, i) => (
            <div key={p.id} style={{ position: 'absolute', top: 6 + i * 5, left: '50%', width: 120, marginLeft: -60, zIndex: i, transform: `rotate(${(i - 2) * 4}deg)` }}><PrevMat p={p} h={92} /></div>
          ))}
        </div>
        {extras.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>{extras.map((p) => <PrevTile key={p.id} p={p} />)}</div>}
      </>
    )
  }
  if (layout === 'filmstrip') {
    const holes = Array.from({ length: 10 }, (_, i) => <span key={i} style={{ width: 5, height: 7, borderRadius: 1.5, background: '#2A2521' }} />)
    const photos = items.filter(isMain)
    const extras = items.filter((p) => !isMain(p))
    return (
      <>
        <div style={{ background: '#0C0A09', borderRadius: 4, padding: '5px 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px 4px' }}>{holes}</div>
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>{photos.map((p) => <div key={p.id} style={{ flex: '0 0 80px' }}><PrevMat p={p} h={92} border={false} /></div>)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px 2px' }}>{holes}</div>
        </div>
        {extras.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>{extras.map((p) => <PrevTile key={p.id} p={p} />)}</div>}
      </>
    )
  }
  // wall (default) — masonry with slight rotations
  const cols = items.length > 16 ? 3 : 2
  return <div style={{ columnCount: cols, columnGap: 6 }}>{items.map((p, i) => <div key={p.id} style={{ breakInside: 'avoid', marginBottom: 6, transform: (i % 3 - 1) ? `rotate(${(i % 3 - 1) * 1.1}deg)` : 'none' }}><PrevTile p={p} h={PREV_H[i % PREV_H.length]} /></div>)}</div>
}

export function ShareComposer({ trip, traveler, onClose }) {
  const tripId = trip?.id
  const serif = 'var(--font-display, var(--font-body, system-ui))'
  const pieces = useMemo(() => (tripId ? tripPhotoPieces(tripId, traveler) : []), [tripId, traveler])

  const [selIds, setSelIds] = useState([]) // ordered selection
  const [caption, setCaption] = useState('')
  const [layout, setLayout] = useState('wall') // wall | mosaic | stack | filmstrip
  const [step, setStep] = useState('select') // select | arrange | working | shared | error
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  // E3 — importing NEW media
  const [source, setSource] = useState('trip') // 'trip' (existing) | 'new' (import)
  const [imported, setImported] = useState([]) // pieces imported this session
  const [importing, setImporting] = useState(false)
  const [importPct, setImportPct] = useState(0)
  const [importErr, setImportErr] = useState('')
  const [qTick, setQTick] = useState(0) // bumped on upload-queue changes → re-read refs
  const fileInputRef = useRef(null)
  const objectUrlsRef = useRef([]) // pending-import blob: urls, revoked on unmount
  // The id of the composed album memory, minted on the FIRST share attempt and
  // REUSED on every retry within this composition. saveMemory upserts by id, so
  // reusing it means a failed share (e.g. a 409 on an unrevealed surprise) that
  // the user retries UPDATES the one album memory instead of minting a duplicate
  // (new random id) each time. Null again only on a fresh composer mount.
  const savedRef = useRef(null)
  // E4 — voice clips + note slips added this session, ordered into the selection.
  const [extras, setExtras] = useState([])
  const [recording, setRecording] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [extrasErr, setExtrasErr] = useState('') // voice/note add failures (shown in both tabs)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // When the App-level upload-queue drains (online/visibility/interval), a queued
  // import's ref flips pending→r2. Re-render so liveById re-reads the real ref.
  useEffect(() => subscribeQueue(() => setQTick((t) => t + 1)), [])
  // Free the object URLs minted for offline-pending imports when the sheet closes.
  useEffect(() => () => { for (const u of objectUrlsRef.current) { try { URL.revokeObjectURL(u) } catch { /* already gone */ } } }, [])

  // All selectable pieces: imported-this-session first, then the trip's existing
  // shared photos. Selection (selIds) spans both sources.
  const allPieces = useMemo(() => [...imported, ...extras, ...pieces], [imported, extras, pieces])
  const sel = selIds.map((id) => allPieces.find((p) => p.id === id)).filter(Boolean)
  const atMax = sel.length >= MAX_ITEMS
  const toggle = (id) =>
    setSelIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_ITEMS ? s : [...s, id]))

  // Live memory lookup so an imported piece's ref can be re-read by its memory id
  // after the queue drains (pending object-URL → real r2 url). qTick forces the
  // re-read when the queue changes; imported.length when a new one lands.
  const liveById = useMemo(() => {
    const map = new Map()
    if (tripId) for (const m of listMemoriesForTrip(tripId, traveler)) map.set(m.id, m)
    return map
  }, [tripId, traveler, qTick, imported.length])
  const currentRef = (p) => (p?.importId ? liveById.get(p.importId)?.photoRef || p.ref : p?.ref)
  // A ref is shareable once it has a real (non-blob:, non-pending) url. The gate
  // covers EVERY selected piece — not just imports — so a not-yet-uploaded photo
  // from any source can never ship a broken ref into the share.
  const isReady = (ref) => !!(ref && ref.url && ref.storage !== 'pending' && !String(ref.url).startsWith('blob:'))
  const pieceKind = (p) => p?.kind || (p?.isVideo ? 'video' : 'photo')
  // Readiness per piece: a note is always ready (text); a voice is ready once its
  // audio is uploaded (r2 — only added after a successful upload); a photo/video
  // is ready when its ref is r2 (the E3 offline gate).
  const pieceReady = (p) => {
    const k = pieceKind(p)
    if (k === 'note') return true
    if (k === 'voice') return !!(p.audioRef && p.audioRef.storage === 'r2' && p.audioRef.url)
    return isReady(currentRef(p))
  }
  const pendingSel = sel.filter((p) => !pieceReady(p))
  const allReady = pendingSel.length === 0 // every selected piece is shareable

  // Import each picked file through the proven offline-safe pipeline → a trip
  // memory + a selectable piece. Auto-selects it (respecting the cap).
  async function onPickFiles(files) {
    setImportErr('')
    for (const file of files) {
      setImporting(true)
      setImportPct(0)
      try {
        const piece = await importComposerFile(file, { trip, traveler, onProgress: setImportPct })
        if (piece.url && String(piece.url).startsWith('blob:')) objectUrlsRef.current.push(piece.url)
        setImported((prev) => [...prev, piece]) // grid order == selection/badge order
        setSelIds((s) => (s.length >= MAX_ITEMS ? s : [...s, piece.id]))
      } catch (e) {
        setImportErr(
          e?.code === 'video-unsupported'
            ? 'This device can’t add videos here — photos work fine.'
            : 'Couldn’t add that one. Please try again.'
        )
      }
    }
    setImporting(false)
  }

  // Voice note — upload the recorded clip to R2 immediately (a share needs a
  // connection anyway; audio isn't offline-queue-backed), then add it as an
  // ordered voice piece. Offline / no worker → an honest message, nothing added.
  async function handleVoiceStop(payload) {
    setRecording(false)
    if (!payload?.blob) return
    if (sel.length >= MAX_ITEMS) { setExtrasErr(`You can add up to ${MAX_ITEMS} pieces — remove one first.`); return }
    setExtrasErr('')
    try {
      const vid = `vc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
      const remote = await uploadBlob('audio', vid, payload.blob)
      const piece = {
        id: `voice::${vid}`,
        kind: 'voice',
        audioRef: { storage: 'r2', key: remote.key, url: remote.url, mime: remote.mime || payload.mime },
        durationSeconds: payload.durationSeconds,
        url: remote.url,
      }
      setExtras((prev) => [...prev, piece])
      setSelIds((s) => (s.length >= MAX_ITEMS ? s : [...s, piece.id]))
    } catch {
      setExtrasErr('Couldn’t add the voice note — you may be offline. Connect and try again.')
    }
  }

  function addNote() {
    const t = noteText.trim()
    if (!t) return
    if (sel.length >= MAX_ITEMS) { setExtrasErr(`You can add up to ${MAX_ITEMS} pieces — remove one first.`); return }
    const piece = { id: `note::${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, kind: 'note', text: t }
    setExtras((prev) => [...prev, piece])
    setSelIds((s) => (s.length >= MAX_ITEMS ? s : [...s, piece.id]))
    setNoteText('')
    setNoteOpen(false)
  }
  function removeExtra(id) {
    setExtras((prev) => prev.filter((p) => p.id !== id))
    setSelIds((s) => s.filter((x) => x !== id))
  }

  async function share() {
    if (!sel.length || step === 'working') return
    if (!allReady) return // Share is UI-gated while imports upload; defensive no-op
    setStep('working')
    setErrMsg('')
    try {
      // Build the ordered heterogeneous pieces from the selection. Photo/video use
      // each piece's CURRENT r2 ref (re-read by memory id — never the stale pending
      // object-URL); voice carries its uploaded audio; a note is pure text. A
      // pure-photo moment sends NO pieces (the worker renders it via photoRefs,
      // exactly as E2/E3) — pieces only rides when there's a voice or note.
      const orderedPieces = sel.map((p) => {
        const k = pieceKind(p)
        if (k === 'note') return { kind: 'note', text: p.text }
        if (k === 'voice') return { kind: 'voice', key: p.audioRef.key, mime: p.audioRef.mime, url: p.audioRef.url, durationSeconds: p.durationSeconds }
        const ref = currentRef(p)
        // `sound` must ride the piece too: for a mixed moment the worker stores
        // pieces[] INSTEAD OF photoRefs[] in the JSON column, so dropping it
        // here would strip the honest no-sound label cross-device.
        return { kind: k, key: ref.key, mime: ref.mime, url: ref.url, ...(ref.capturedAt ? { capturedAt: ref.capturedAt } : {}), ...(ref.posterKey ? { posterKey: ref.posterKey, posterUrl: ref.posterUrl } : {}), ...(ref.sound ? { sound: ref.sound } : {}) }
      })
      const photoRefs = sel.filter((p) => pieceKind(p) === 'photo' || pieceKind(p) === 'video').map((p) => currentRef(p)).filter(Boolean)
      const hasExtras = sel.some((p) => pieceKind(p) === 'voice' || pieceKind(p) === 'note')
      const saved = saveMemory({
        // Reuse the id from a prior attempt in this composition (upsert), so a
        // retry after a failed /share updates the SAME album memory rather than
        // creating a duplicate. undefined on the first attempt → a fresh id.
        id: savedRef.current || undefined,
        tripId,
        stopId: null, // a trip-level composed memory (no single stop)
        authorTraveler: traveler,
        visibility: 'shared',
        kind: 'photo',
        caption: caption.trim() || undefined,
        photoRefs,
        // Explicit null (not absent) when there are no extras: on a re-save of the
        // same id, an ABSENT pieces would preserve-on-undefined and resurrect a
        // note the user removed between attempts. null clears it honestly.
        pieces: hasExtras ? orderedPieces : null,
      })
      const id = saved?.id
      if (!id) throw new Error('save failed')
      savedRef.current = id
      // Make sure the album row has reached the family D1 BEFORE minting the
      // link — POST /share resolves the memory from D1, so a not-yet-synced
      // album would 404. pushMemory is idempotent and re-uploads nothing (every
      // ref is already r2 by the time the gate opened).
      await pushMemory(saved)
      const res = await shareMemory(id, layout)
      setUrl(res?.url || '')
      setStep('shared')
    } catch (e) {
      setErrMsg(
        e?.status === 409
          ? "One of these is a surprise — it can't be shared until it's revealed."
          : "Couldn't make the link just now. Check your connection and try again."
      )
      setStep('error')
    }
  }

  function copy() {
    if (!url) return
    navigator.clipboard?.writeText(url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1900) },
      () => {}
    )
  }
  function nativeShare() {
    if (navigator.share && url) navigator.share({ title: "A moment from the Jackson-Hemleys' trip", url }).catch(() => {})
    else copy()
  }

  const r = 14
  const sheet = {
    width: '100%', background: 'var(--bg)', color: 'var(--text)', maxHeight: '92%', overflow: 'auto',
    borderTopLeftRadius: 22, borderTopRightRadius: 22, fontFamily: 'var(--font-body)',
  }
  const primaryBtn = (on) => ({
    width: '100%', padding: 15, borderRadius: 999, border: 'none', cursor: on ? 'pointer' : 'default',
    background: on ? 'var(--accent)' : 'var(--bg2)', color: on ? 'var(--accent-ink, #fff)' : 'var(--muted)',
    fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  })
  const emptyBox = {
    border: '1px dashed var(--line-bold)', borderRadius: Math.min(r, 16), padding: '26px 16px',
    textAlign: 'center', fontFamily: serif, fontStyle: traveler === 'rafa' ? 'normal' : 'italic',
    color: 'var(--muted)', fontSize: 14, marginBottom: 14,
  }
  // One grid for either source. Selection (the numbered badge) + cap are global;
  // an imported piece still uploading shows an "uploading" veil (its ref isn't r2
  // yet, so it isn't shareable until the queue drains).
  const renderGrid = (list) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
      {list.map((p) => {
        const n = selIds.indexOf(p.id)
        const on = n >= 0
        const uploading = !isReady(currentRef(p))
        return (
          <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-label={on ? `Selected, position ${n + 1}` : 'Select photo'} aria-pressed={on}
            style={{ position: 'relative', padding: 0, border: 'none', cursor: 'pointer', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--bg2)', boxShadow: on ? '0 0 0 3px var(--accent)' : 'none' }}>
            {p.url && <img src={p.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: on ? 1 : 0.92 }} />}
            {p.isVideo && <span aria-hidden="true" style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 11 }}>▶</span>}
            {uploading && (
              <span aria-hidden="true" title="Uploading…" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><UploadCloud size={18} /></span>
            )}
            {on && (
              <span aria-hidden="true" style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink, #fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{n + 1}</span>
            )}
          </button>
        )
      })}
    </div>
  )

  return (
    <>
    <div onClick={onClose} data-testid="share-composer" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 90, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={sheet}>
        <div style={{ padding: '16px 18px calc(env(safe-area-inset-bottom) + 22px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontFamily: serif, fontSize: 23, fontWeight: 600 }}>
                {step === 'shared' ? 'Shared' : step === 'arrange' || step === 'working' || step === 'error' ? 'Arrange' : 'Compose a moment'}
              </div>
              <div style={{ fontFamily: serif, fontSize: 12.5, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', marginTop: 3 }}>
                {step === 'shared' ? 'A link to share — nothing hidden goes out.' : step === 'arrange' || step === 'working' || step === 'error' ? 'Choose a layout — this is what they’ll see.' : 'Pick the photos to share as one keepsake.'}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}><X size={20} /></button>
          </div>

          {step === 'select' && (
            <>
              {/* native picker — on a phone this includes the camera (the web can't
                  browse the camera roll as a grid, so this IS "Library/Camera") */}
              <input
                ref={fileInputRef}
                type="file"
                accept={importAccept()}
                multiple
                data-testid="composer-file-input"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const files = Array.from(e.target.files || [])
                  e.target.value = '' // re-pick the same file fires again
                  if (files.length) onPickFiles(files)
                }}
              />

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[['trip', 'On this trip'], ['new', 'Add new']].map(([k, lbl]) => {
                  const on = source === k
                  return (
                    <button key={k} type="button" onClick={() => setSource(k)} aria-pressed={on}
                      style={{ padding: '8px 14px', borderRadius: 999, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line-bold)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--accent-ink, #fff)' : 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: on ? 700 : 500 }}>{lbl}</button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>
                  {sel.length ? `${sel.length} selected${atMax ? ' · max' : ''}` : 'Tap to choose'}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 0.6, color: 'var(--muted)' }}>up to {MAX_ITEMS}</span>
              </div>

              {source === 'trip' ? (
                pieces.length === 0 ? (
                  <div style={emptyBox}>No shared photos on this trip yet — switch to “Add new” to bring some in.</div>
                ) : (
                  renderGrid(pieces)
                )
              ) : (
                <>
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing}
                    style={{ width: '100%', padding: 13, borderRadius: Math.min(r, 12), border: '1.5px dashed var(--line-bold)', background: 'transparent', color: 'var(--accent-text, var(--accent))', cursor: importing ? 'default' : 'pointer', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                    <Plus size={16} /> {importing ? (importPct ? `Adding… ${importPct}%` : 'Adding…') : `Add ${canImportVideo() ? 'photos or a video' : 'photos'}`}
                  </button>
                  {importErr && <div style={{ fontFamily: serif, fontSize: 12.5, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', marginBottom: 10, lineHeight: 1.4 }}>{importErr}</div>}
                  {imported.length === 0 ? (
                    <div style={emptyBox}>Bring in new photos{canImportVideo() ? ' or a video' : ''} from your device to share as a moment.</div>
                  ) : (
                    renderGrid(imported)
                  )}
                </>
              )}

              {/* E4 — add a voice note or a typed note slip (moment-level). */}
              <div style={{ display: 'flex', gap: 9, marginBottom: 12 }}>
                <button type="button" onClick={() => { setNoteOpen(false); setExtrasErr(''); setRecording(true) }}
                  style={{ flex: 1, height: 44, borderRadius: 10, border: '1.5px solid var(--line-bold)', background: 'transparent', color: 'var(--accent-text, var(--accent))', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <Mic size={15} /> Voice note
                </button>
                <button type="button" onClick={() => { setRecording(false); setExtrasErr(''); setNoteOpen((o) => !o) }} aria-pressed={noteOpen}
                  style={{ flex: 1, height: 44, borderRadius: 10, border: `1.5px solid ${noteOpen ? 'var(--accent)' : 'var(--line-bold)'}`, background: noteOpen ? 'var(--accent)' : 'transparent', color: noteOpen ? 'var(--accent-ink, #fff)' : 'var(--accent-text, var(--accent))', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <Pencil size={15} /> Write a note
                </button>
              </div>
              {extrasErr && <div style={{ fontFamily: serif, fontSize: 12.5, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', marginBottom: 10, lineHeight: 1.4 }}>{extrasErr}</div>}
              {noteOpen && (
                <div style={{ marginBottom: 12 }}>
                  <textarea autoFocus rows={2} maxLength={500} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Write a little note…" aria-label="Note"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: Math.min(r, 10), border: '1px solid var(--line-bold)', background: 'var(--card)', color: 'var(--text)', fontFamily: serif, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', fontSize: 15, lineHeight: 1.4, outline: 'none', resize: 'vertical', colorScheme: traveler === 'helen' ? 'light' : 'dark' }} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <button type="button" onClick={() => { setNoteOpen(false); setNoteText('') }} style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line-bold)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>Cancel</button>
                    <button type="button" onClick={addNote} disabled={!noteText.trim()} style={{ padding: '8px 16px', borderRadius: 999, border: 'none', cursor: noteText.trim() ? 'pointer' : 'default', background: noteText.trim() ? 'var(--accent)' : 'var(--bg2)', color: noteText.trim() ? 'var(--accent-ink, #fff)' : 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>Add note</button>
                  </div>
                </div>
              )}
              {extras.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {extras.map((p) => {
                    const n = selIds.indexOf(p.id)
                    return (
                      <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%', padding: '7px 9px 7px 10px', borderRadius: 999, border: '1px solid var(--line-bold)', background: 'var(--card)' }}>
                        {n >= 0 && <span aria-hidden="true" style={{ width: 17, height: 17, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink, #fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700, flexShrink: 0 }}>{n + 1}</span>}
                        {p.kind === 'voice' ? <Mic size={13} style={{ color: 'var(--accent-text, var(--accent))', flexShrink: 0 }} /> : <Pencil size={13} style={{ color: 'var(--accent-text, var(--accent))', flexShrink: 0 }} />}
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{p.kind === 'voice' ? `Voice · ${fmtDur(p.durationSeconds)}` : p.text}</span>
                        <button type="button" onClick={() => removeExtra(p.id)} aria-label="Remove" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', padding: 0, flexShrink: 0 }}><X size={14} /></button>
                      </span>
                    )
                  })}
                </div>
              )}

              {sel.length > 0 && (
                <>
                  <button onClick={() => setStep('arrange')} style={primaryBtn(true)}>Next · Arrange →</button>
                  <div style={{ fontFamily: serif, fontSize: 12, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', textAlign: 'center', marginTop: 10, lineHeight: 1.4 }}>
                    Photos you add are saved to the trip for the family. Only the link shares this moment outside the app.
                  </div>
                </>
              )}
            </>
          )}

          {(step === 'arrange' || step === 'working' || step === 'error') && (
            <>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>Layout</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {[['wall', 'Wall'], ['mosaic', 'Mosaic'], ['stack', 'Stack'], ['filmstrip', 'Filmstrip']].map(([k, lbl]) => {
                  const on = layout === k
                  return (
                    <button key={k} type="button" onClick={() => setLayout(k)} aria-pressed={on}
                      style={{ padding: '8px 14px', borderRadius: 999, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line-bold)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--accent-ink, #fff)' : 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: on ? 700 : 500 }}>{lbl}</button>
                  )
                })}
              </div>
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: Math.min(r, 14), padding: 12, marginBottom: 14, maxHeight: 280, overflow: 'auto' }}>
                <ComposerPreview items={sel} layout={layout} />
              </div>
              <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Say something (optional)" aria-label="Caption"
                style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: Math.min(r, 12), border: '1px solid var(--line-bold)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 14, outline: 'none', marginBottom: 12, colorScheme: traveler === 'helen' ? 'light' : 'dark' }} />
              {errMsg && <div style={{ fontFamily: serif, fontSize: 12.5, fontStyle: 'italic', color: 'var(--muted)', marginBottom: 10, lineHeight: 1.4 }}>{errMsg}</div>}
              {!allReady && step !== 'working' && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: serif, fontSize: 12, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', marginBottom: 10, lineHeight: 1.4 }}>
                  <UploadCloud size={14} style={{ marginTop: 1, flexShrink: 0 }} /> Your photos are saved to the trip — the link will be ready once they finish uploading. If one won’t upload, go back and tap it to remove it.
                </div>
              )}
              <div style={{ display: 'flex', gap: 9 }}>
                <button onClick={() => { setErrMsg(''); setStep('select') }} disabled={step === 'working'} style={{ flex: '0 0 auto', padding: '15px 18px', borderRadius: 999, border: '1px solid var(--line-bold)', background: 'transparent', color: 'var(--muted)', cursor: step === 'working' ? 'default' : 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>‹ Back</button>
                <button disabled={step === 'working' || !allReady} onClick={share} style={{ ...primaryBtn(step !== 'working' && allReady), flex: 1 }}>
                  <Share2 size={15} /> {step === 'working' ? 'Making the link…' : !allReady ? `Uploading ${pendingSel.length}…` : 'Share this moment'}
                </button>
              </div>
            </>
          )}

          {step === 'shared' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 13px', borderRadius: Math.min(r, 13), background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 26%, transparent)', marginBottom: 14 }}>
                <span style={{ color: 'var(--accent-text)', display: 'flex' }}><Check size={18} /></span>
                <span style={{ fontFamily: serif, fontSize: 13.5, color: 'var(--text)' }}>Shared to the family.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: Math.min(r, 12), border: '1px solid var(--line-bold)', background: 'var(--card)', marginBottom: 12 }}>
                <ImageIcon size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
              </div>
              <div style={{ display: 'flex', gap: 9, marginBottom: 12 }}>
                <button onClick={copy} style={{ ...primaryBtn(true), flex: 1 }}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy link</>}</button>
                <button onClick={nativeShare} aria-label="Share via your phone" style={{ flex: '0 0 auto', width: 52, padding: 0, borderRadius: 999, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent-text, var(--accent))', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Share2 size={17} /></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: serif, fontSize: 12, fontStyle: 'italic', color: 'var(--muted)', lineHeight: 1.4, marginBottom: 14 }}>
                <Check size={14} style={{ marginTop: 1, flexShrink: 0 }} /> Nothing hidden is included — only this moment goes out. Surprises and private notes stay in the app.
              </div>
              <button onClick={onClose} style={primaryBtn(true)}>Done</button>
            </>
          )}
        </div>
      </div>
    </div>
    {/* The voice recorder is a full-screen overlay; render it as a SIBLING of the
        backdrop so its clicks don't bubble to onClose and dismiss the sheet. */}
    {recording && <VoiceRecorder onStop={handleVoiceStop} onCancel={() => setRecording(false)} />}
    </>
  )
}
