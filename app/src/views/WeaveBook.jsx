// The little book — a trip's SHARED collection of kept weave pages.
//
// WEAVE_SCOPE slice 3, part 2. Fetches the trip's kept weaves (worker
// GET /weave/book) and shows them as an index, oldest first. Tapping a page
// opens the FULL weave for that specific day — reusing TheWeave with a forced
// day (so the rich beats + the ✦ Save-to-Photos all come for free), with the
// page pre-marked "in the book".
//
// Theme: pure CSS-var tokens → it wears the active person's lens like every
// other surface. Degrades gracefully: no worker / nothing kept → empty state.

import { useState, useEffect } from 'react'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { fetchWeaveBook } from '../lib/weave'
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
      {/* Top bar — back to the trip. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '14px 16px',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Close book"
          style={{
            background: 'transparent',
            border: 0,
            padding: 4,
            cursor: 'pointer',
            color: 'var(--text)',
            display: 'inline-flex',
          }}
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
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 30,
              lineHeight: 1.1,
              margin: 0,
              color: 'var(--text)',
            }}
          >
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
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1.15 }}>
                  {p.title}
                </div>
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
        )}
      </div>
    </div>
  )
}
