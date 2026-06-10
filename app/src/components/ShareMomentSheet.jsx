// ShareMomentSheet — the in-app "Share a moment" affordance (slice 3).
// A bottom sheet in the AUTHOR's own skin (themed via the app's CSS vars): it
// mints a public link for one memory (POST /share), shows it with Copy + the
// phone's native Share, and reassures that nothing hidden goes out. The public
// page it links to lives in the worker (sharePage.js) and re-checks masking on
// every open — this sheet just creates the link.
//
// Token rules honored: readable text uses --muted (never --faint); accent-as-
// TEXT uses --accent-text (not --accent, which is fill-only on the dark skins);
// the primary button is an --accent FILL with --accent-ink on top.
import { useEffect, useState } from 'react'
import { Copy, Check, Share2, X } from 'lucide-react'
import { shareMemory } from '../lib/workerSync'

export function ShareMomentSheet({ memoryId, onClose }) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [url, setUrl] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    shareMemory(memoryId)
      .then((res) => {
        if (cancelled) return
        setUrl(res?.url || '')
        setStatus('ready')
      })
      .catch((e) => {
        if (cancelled) return
        setErrMsg(
          e?.status === 409
            ? "This one's a surprise — it can't be shared until it's revealed."
            : "Couldn't make a link just now. Check your connection and try again."
        )
        setStatus('error')
      })
    return () => { cancelled = true }
  }, [memoryId])

  // Esc closes.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1900)
    } catch { /* clipboard blocked */ }
  }
  const doShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'A moment from the Jackson-Hemleys’ trip', url })
        return
      }
    } catch { /* dismissed */ }
    doCopy()
  }

  // Friendly display of the link (drop the protocol).
  const shown = url.replace(/^https?:\/\//, '')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share this moment"
      data-testid="share-moment-sheet"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 260,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(1.5px)',
      }}
    >
      <div
        style={{
          background: 'var(--bg)', color: 'var(--text)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: '12px 20px calc(env(safe-area-inset-bottom) + 22px)',
          boxShadow: '0 -18px 50px -20px rgba(0,0,0,0.4)',
          border: '1px solid var(--border)', borderBottom: 'none',
          fontFamily: 'var(--font-body)',
        }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 3, background: 'var(--faint)', margin: '0 auto 16px' }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--heading-weight, 600)', fontSize: 23, letterSpacing: '-0.01em' }}>
              Share this moment
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>
              Anyone with the link can see this one memory.
            </div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{ background: 'transparent', border: 0, color: 'var(--muted)', cursor: 'pointer', padding: 4, flexShrink: 0 }}
          >
            <X size={20} />
          </button>
        </div>

        {status === 'loading' && (
          <div data-testid="share-loading" style={{ marginTop: 18, fontSize: 13.5, color: 'var(--muted)' }}>
            Making a link…
          </div>
        )}

        {status === 'error' && (
          <div data-testid="share-error" style={{ marginTop: 18, fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.45 }}>
            {errMsg}
          </div>
        )}

        {status === 'ready' && (
          <>
            {/* link row */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10, marginTop: 16,
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
                padding: '12px 12px 12px 15px',
              }}
            >
              <span
                data-testid="share-link"
                style={{ flex: 1, minWidth: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {shown}
              </span>
              <button
                type="button" onClick={doCopy} aria-label="Copy link"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, background: 'transparent', border: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--accent-text, var(--accent))' }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            {/* actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                type="button" onClick={doCopy}
                style={{
                  flex: 1, height: 50, borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: 'var(--accent)', color: 'var(--accent-ink)',
                  fontFamily: 'var(--font-body)', fontSize: 15.5, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {copied ? <Check size={17} /> : <Copy size={17} />} {copied ? 'Link copied' : 'Copy link'}
              </button>
              <button
                type="button" onClick={doShare}
                style={{
                  flex: '0 0 auto', width: 124, height: 50, borderRadius: 14, cursor: 'pointer',
                  background: 'transparent', color: 'var(--text)', border: '1.5px solid var(--line-bold, var(--border))',
                  fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Share2 size={16} /> Share
              </button>
            </div>
          </>
        )}

        {/* reassurance — shown in every state; it's the masking promise */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 16 }}>
          <span style={{ flex: '0 0 auto', marginTop: 1, color: 'var(--accent-text, var(--accent))', display: 'inline-flex' }}>
            <Check size={16} />
          </span>
          <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--muted)' }}>
            Nothing hidden is included — only this moment goes out. Surprises and private notes stay in the app.
          </span>
        </div>
      </div>
    </div>
  )
}
