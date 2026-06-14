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
import { Copy, Check, Share2, X, Image as ImageIcon, Plus, UploadCloud } from 'lucide-react'
import { listMemoriesForTrip, saveMemory } from '../lib/memoryStore'
import { isSurprise } from '../lib/surprises'
import { shareMemory, pushMemory } from '../lib/workerSync'
import { subscribe as subscribeQueue } from '../lib/uploadQueue'
import { importComposerFile, importAccept, canImportVideo } from '../lib/composerImport'

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
      <div style={{ position: 'relative', height: h, borderRadius: 1, overflow: 'hidden' }}>
        <img src={p.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        {p.isVideo && <VideoDot />}
      </div>
    </div>
  )
}
function ComposerPreview({ items, layout }) {
  if (!items.length) return null
  if (layout === 'mosaic') {
    const cols = items.length > 10 ? 3 : 2
    return <div style={{ columnCount: cols, columnGap: 6 }}>{items.map((p, i) => <div key={p.id} style={{ breakInside: 'avoid', marginBottom: 6 }}><PrevMat p={p} h={PREV_H[i % PREV_H.length]} /></div>)}</div>
  }
  if (layout === 'stack') {
    const photos = items.slice(0, 5)
    return (
      <div style={{ position: 'relative', height: 150 }}>
        {photos.map((p, i) => (
          <div key={p.id} style={{ position: 'absolute', top: 6 + i * 5, left: '50%', width: 120, marginLeft: -60, zIndex: i, transform: `rotate(${(i - 2) * 4}deg)` }}><PrevMat p={p} h={92} /></div>
        ))}
      </div>
    )
  }
  if (layout === 'filmstrip') {
    const holes = Array.from({ length: 10 }, (_, i) => <span key={i} style={{ width: 5, height: 7, borderRadius: 1.5, background: '#2A2521' }} />)
    return (
      <div style={{ background: '#0C0A09', borderRadius: 4, padding: '5px 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px 4px' }}>{holes}</div>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>{items.map((p) => <div key={p.id} style={{ flex: '0 0 80px' }}><PrevMat p={p} h={92} border={false} /></div>)}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px 2px' }}>{holes}</div>
      </div>
    )
  }
  // wall (default) — masonry with slight rotations
  const cols = items.length > 16 ? 3 : 2
  return <div style={{ columnCount: cols, columnGap: 6 }}>{items.map((p, i) => <div key={p.id} style={{ breakInside: 'avoid', marginBottom: 6, transform: (i % 3 - 1) ? `rotate(${(i % 3 - 1) * 1.1}deg)` : 'none' }}><PrevMat p={p} h={PREV_H[i % PREV_H.length]} /></div>)}</div>
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
  const allPieces = useMemo(() => [...imported, ...pieces], [imported, pieces])
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
  const pendingSel = sel.filter((p) => !isReady(currentRef(p)))
  const allReady = pendingSel.length === 0 // every selected piece is uploaded

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

  async function share() {
    if (!sel.length || step === 'working') return
    if (!allReady) return // Share is UI-gated while imports upload; defensive no-op
    setStep('working')
    setErrMsg('')
    try {
      // The composed album memory — reuse each piece's CURRENT r2 ref. For an
      // imported piece that's the now-uploaded ref (re-read by memory id), never
      // the stale pending object-URL, so a recipient never gets a blob: tile.
      const saved = saveMemory({
        tripId,
        stopId: null, // a trip-level composed memory (no single stop)
        authorTraveler: traveler,
        visibility: 'shared',
        kind: 'photo',
        caption: caption.trim() || undefined,
        photoRefs: sel.map((p) => currentRef(p)).filter(Boolean),
      })
      const id = saved?.id
      if (!id) throw new Error('save failed')
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
            <img src={p.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: on ? 1 : 0.92 }} />
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
                <button onClick={() => setStep('select')} disabled={step === 'working'} style={{ flex: '0 0 auto', padding: '15px 18px', borderRadius: 999, border: '1px solid var(--line-bold)', background: 'transparent', color: 'var(--muted)', cursor: step === 'working' ? 'default' : 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>‹ Back</button>
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
  )
}
