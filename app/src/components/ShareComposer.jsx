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
import { useEffect, useMemo, useState } from 'react'
import { Copy, Check, Share2, X, Image as ImageIcon } from 'lucide-react'
import { listMemoriesForTrip, saveMemory } from '../lib/memoryStore'
import { isSurprise } from '../lib/surprises'
import { shareMemory } from '../lib/workerSync'

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

export function ShareComposer({ trip, traveler, onClose }) {
  const tripId = trip?.id
  const serif = 'var(--font-display, var(--font-body, system-ui))'
  const pieces = useMemo(() => (tripId ? tripPhotoPieces(tripId, traveler) : []), [tripId, traveler])

  const [selIds, setSelIds] = useState([]) // ordered selection
  const [caption, setCaption] = useState('')
  const [step, setStep] = useState('select') // select | working | shared | error
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const sel = selIds.map((id) => pieces.find((p) => p.id === id)).filter(Boolean)
  const atMax = sel.length >= MAX_ITEMS
  const toggle = (id) =>
    setSelIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_ITEMS ? s : [...s, id]))

  async function share() {
    if (!sel.length || step === 'working') return
    setStep('working')
    setErrMsg('')
    try {
      // The composed album memory — reuse the picked pieces' r2 refs verbatim.
      const saved = saveMemory({
        tripId,
        stopId: null, // a trip-level composed memory (no single stop)
        authorTraveler: traveler,
        visibility: 'shared',
        kind: 'photo',
        caption: caption.trim() || undefined,
        photoRefs: sel.map((p) => p.ref),
      })
      const id = saved?.id
      if (!id) throw new Error('save failed')
      const res = await shareMemory(id)
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

  return (
    <div onClick={onClose} data-testid="share-composer" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 90, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={sheet}>
        <div style={{ padding: '16px 18px calc(env(safe-area-inset-bottom) + 22px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontFamily: serif, fontSize: 23, fontWeight: 600 }}>
                {step === 'shared' ? 'Shared' : 'Compose a moment'}
              </div>
              <div style={{ fontFamily: serif, fontSize: 12.5, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', marginTop: 3 }}>
                {step === 'shared' ? 'A link to share — nothing hidden goes out.' : 'Pick the photos to share as one keepsake.'}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}><X size={20} /></button>
          </div>

          {(step === 'select' || step === 'working' || step === 'error') && (
            <>
              {pieces.length === 0 ? (
                <div style={{ border: '1px dashed var(--line-bold)', borderRadius: Math.min(r, 16), padding: '26px 16px', textAlign: 'center', fontFamily: serif, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', color: 'var(--muted)', fontSize: 14 }}>
                  No shared photos on this trip yet — add some first, then come back to compose.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>
                      {sel.length ? `${sel.length} selected${atMax ? ' · max' : ''}` : 'Tap to choose'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 0.6, color: 'var(--muted)' }}>up to {MAX_ITEMS}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
                    {pieces.map((p) => {
                      const n = selIds.indexOf(p.id)
                      const on = n >= 0
                      return (
                        <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-label={on ? `Selected, position ${n + 1}` : 'Select photo'} aria-pressed={on}
                          style={{ position: 'relative', padding: 0, border: 'none', cursor: 'pointer', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--bg2)', boxShadow: on ? '0 0 0 3px var(--accent)' : 'none' }}>
                          <img src={p.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: on ? 1 : 0.92 }} />
                          {p.isVideo && <span aria-hidden="true" style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 11 }}>▶</span>}
                          {on && (
                            <span aria-hidden="true" style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink, #fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{n + 1}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Say something (optional)" aria-label="Caption"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: Math.min(r, 12), border: '1px solid var(--line-bold)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 14, outline: 'none', marginBottom: 12, colorScheme: traveler === 'helen' ? 'light' : 'dark' }} />
                  {errMsg && <div style={{ fontFamily: serif, fontSize: 12.5, fontStyle: 'italic', color: 'var(--muted)', marginBottom: 10, lineHeight: 1.4 }}>{errMsg}</div>}
                  <button disabled={!sel.length || step === 'working'} onClick={share} style={primaryBtn(!!sel.length && step !== 'working')}>
                    <Share2 size={15} /> {step === 'working' ? 'Making the link…' : 'Share this moment'}
                  </button>
                  <div style={{ fontFamily: serif, fontSize: 12, fontStyle: 'italic', color: 'var(--muted)', textAlign: 'center', marginTop: 10, lineHeight: 1.4 }}>
                    Saved to the trip. Nothing else goes out unless you send the link.
                  </div>
                </>
              )}
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
