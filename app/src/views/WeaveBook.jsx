// The little book — a trip's SHARED collection of kept weave pages.
//
// WEAVE_SCOPE slice 3, part 2. Fetches the trip's kept weaves (worker
// GET /weave/book) and shows them as an index, oldest first. Tapping a page
// opens the FULL weave for that day — reusing TheWeave with a forced day (so
// the rich beats + the ✦ Save-to-Photos all come for free), pre-marked "in
// the book".
//
// Increment 2: "Save the book" stitches every kept day into ONE video
// (weaveBookEncode → the shared encode worker) → share sheet → Apple Photos.
// WebCodecs-gated (button absent when unsupported); the Save itself is
// device-only, same as the single-page video.
//
// Theme: pure CSS-var tokens → it wears the active person's lens. Degrades
// gracefully: no worker / nothing kept → empty state.

import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, BookOpen, Film, Check } from 'lucide-react'
import { fetchWeaveBook } from '../lib/weave'
import { encodeWeaveBook, shareWeave, isVideoEncodeSupported } from '../lib/weaveBookEncode'
import { TheWeave } from './TheWeave'

function formatDay(iso) {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export function WeaveBook({ trip, trips, traveler, onBack }) {
  const [state, setState] = useState('loading') // loading | ready | empty
  const [pages, setPages] = useState([])
  const [selectedDayIso, setSelectedDayIso] = useState(null)
  const [saveState, setSaveState] = useState('idle') // idle | encoding | sharing | shared
  // How the save actually landed: 'shared' (native sheet succeeded → Photos/
  // Messages/etc.) vs 'downloaded' (plain file fallback, NOT in Photos). Drives
  // the confirmation copy so it can't claim "Saved to Photos" on a download.
  const [savedVia, setSavedVia] = useState('shared')
  const encodeAbortRef = useRef(null)

  const videoSupported = isVideoEncodeSupported()

  useEffect(() => {
    let cancelled = false
    fetchWeaveBook(trip?.id).then(({ pages }) => {
      if (cancelled) return
      setPages(pages)
      setState(pages.length ? 'ready' : 'empty')
    })
    return () => {
      cancelled = true
    }
  }, [trip?.id])

  // Cancel any in-flight encode when the overlay unmounts.
  useEffect(() => () => encodeAbortRef.current?.abort(), [])

  async function saveBook() {
    if (saveState !== 'idle') return
    encodeAbortRef.current = new AbortController()
    setSaveState('encoding')
    try {
      const blob = await encodeWeaveBook({
        trip,
        traveler,
        pages,
        onProgress: () => {},
        signal: encodeAbortRef.current.signal,
      })
      setSaveState('sharing')
      // shareWeave → 'shared' (native sheet) or 'downloaded' (plain file). Carry
      // it so the confirmation is honest instead of always saying "Saved to Photos".
      const outcome = await shareWeave(blob, { title: `${trip?.title || 'Our trip'} — the book` })
      setSavedVia(outcome === 'downloaded' ? 'downloaded' : 'shared')
      setSaveState('shared')
    } catch (err) {
      const isAbort = err?.name === 'AbortError' || err?.message === 'aborted'
      if (!isAbort) console.warn('[weave book] save failed:', err)
      setSaveState('idle')
    }
  }

  // A selected page opens the full weave for that day (reuses everything:
  // rich beats, theming, the ✦ Save button). Back returns to the index.
  if (selectedDayIso) {
    return (
      <TheWeave
        trip={trip}
        trips={trips}
        traveler={traveler}
        forceDayIso={selectedDayIso}
        initialKept
        onBack={() => setSelectedDayIso(null)}
      />
    )
  }

  return (
    <div
      data-testid="weave-book"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        color: 'var(--text)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {/* Top bar — back to the trip. Clear the iOS status bar (black-translucent). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 'calc(env(safe-area-inset-top) + 14px) 16px 14px',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Close book"
          style={{ background: 'transparent', border: 0, padding: 4, cursor: 'pointer', color: 'var(--text)', display: 'inline-flex' }}
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      <div style={{ flex: 1, padding: '0 22px 40px', maxWidth: 620, width: '100%', margin: '0 auto' }}>
        {/* Title block. */}
        <header style={{ marginBottom: 24 }}>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 8,
            }}
          >
            <BookOpen size={12} /> The book
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: 1.1, margin: 0, color: 'var(--text)' }}>
            {trip?.title || 'This trip'}
          </h1>
        </header>

        {state === 'loading' && (
          <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>Gathering the pages…</p>
        )}

        {state === 'empty' && (
          <div
            data-testid="weave-book-empty"
            style={{
              border: '1px dashed var(--border)',
              borderRadius: 14,
              padding: '28px 22px',
              textAlign: 'center',
              color: 'var(--muted)',
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              lineHeight: 1.5,
            }}
          >
            No kept pages yet. Open the Weave and tap{' '}
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>“Keep this page”</span> to start the book.
          </div>
        )}

        {state === 'ready' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pages.map((p) => (
                <button
                  key={p.dayIso}
                  type="button"
                  data-testid="weave-book-page"
                  onClick={() => setSelectedDayIso(p.dayIso)}
                  style={{
                    textAlign: 'left',
                    background: 'var(--card, var(--bg2))',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: '16px 18px',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 9.5,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--muted)',
                    }}
                  >
                    {p.stat || formatDay(p.dayIso)}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1.15 }}>{p.title}</div>
                  {p.opening && (
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 14,
                        lineHeight: 1.45,
                        color: 'var(--muted)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {p.opening}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Save the whole book as one video (device-only Save-to-Photos).
                Absent when WebCodecs is unavailable — no disabled state. */}
            {videoSupported && (
              <button
                type="button"
                data-testid="weave-book-save"
                onClick={saveBook}
                disabled={saveState !== 'idle'}
                style={{
                  marginTop: 22,
                  width: '100%',
                  padding: '15px 22px',
                  borderRadius: 999,
                  border: 0,
                  cursor: saveState === 'idle' ? 'pointer' : 'default',
                  background: 'var(--accent)',
                  color: 'var(--accent-ink, var(--bg))',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 700,
                  fontSize: 15,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Film size={16} /> Save the book
              </button>
            )}
          </>
        )}
      </div>

      {/* Encode / share progress. */}
      {saveState !== 'idle' && (
        <div
          data-testid="weave-book-progress"
          role="status"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            background: 'color-mix(in srgb, var(--bg) 86%, transparent)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 24,
            textAlign: 'center',
          }}
        >
          {saveState === 'shared' ? (
            <>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: '#34C759',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                }}
              >
                <Check size={24} />
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text)' }}>{savedVia === 'downloaded' ? 'Saved to your device' : 'Saved to Photos'}</div>
              <button
                type="button"
                onClick={() => setSaveState('idle')}
                style={{
                  padding: '11px 24px',
                  borderRadius: 999,
                  border: '1px solid var(--line-bold)',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </>
          ) : (
            <>
              <Film size={30} color="var(--muted)" />
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text)' }}>
                {saveState === 'sharing' ? 'Almost there…' : 'Binding the book…'}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.1em' }}>
                {pages.length} page{pages.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
