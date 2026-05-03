import { useEffect, useState } from 'react'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { loadAsset } from '../lib/memAssets'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import { Avatar, AvatarStack } from '../components/Avatar'
import { PostcardComposer } from '../components/PostcardComposer'
import { allStops } from '../data/trips'

// Aurelia — Postcard Scrapbook ("Trip Book"). Design-bundle authoritative
// (prototype.jsx#AureliaBook). Italic serif title on rose paper, a stack
// of slightly-rotated polaroid cards (each carrying tape, a photo
// placeholder, an italic quote, author + time + felt-mood, WITH
// avatars, location). Hot-pink FAB at the bottom-right.

export function AureliaView({ trip, traveler, onOpenStop, onOpenSettings }) {
  // Re-render after the composer saves so the new postcard pops in.
  const [refreshTick, setRefreshTick] = useState(0)
  const [composing, setComposing] = useState(false)
  const [activeDay, setActiveDay] = useState(trip.days[0]?.n)
  const day = trip.days.find((d) => d.n === activeDay) || trip.days[0]
  const mems = listMemoriesForTrip(trip.id, traveler)
  const stopsById = new Map(
    allStops(trip).map((s) => [s.id, s])
  )
  // Suppress unused-warning while keeping the dep in scope.
  void refreshTick

  // Tilts give the postcard pile its scrapbook feel. Stable per memory id
  // so a re-render doesn't shuffle them.
  function tiltFor(id) {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
    const range = 3.5 // ±3.5 deg
    return ((h % 1000) / 1000 - 0.5) * 2 * range
  }

  // Tints cycle through Aurelia's warm scrapbook palette.
  const tints = ['#e8a880', '#c9a890', '#b8a8c8', '#d6c5a8', '#e8c2b0']

  return (
    <div
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        minHeight: '100vh',
        paddingBottom: 120,
        position: 'relative',
      }}
    >
      <div
        style={{
          padding: '60px 18px 0',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Eyebrow color="var(--muted)">A · SINCE 2012</Eyebrow>
        <Eyebrow color="var(--muted)">HER STUFF</Eyebrow>
      </div>
      <div style={{ padding: '8px 18px 12px' }}>
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 36,
            fontWeight: 700,
            lineHeight: 0.95,
            fontStyle: 'italic',
            color: 'var(--text)',
          }}
        >
          Aurelia's<br />Trip Book
        </div>
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--muted)',
            marginTop: 8,
          }}
        >
          a place for what you actually cared about.
        </div>
      </div>

      {/* Day picker — Helen-style cards in Aurelia's pink palette so
          she can navigate the itinerary alongside the scrapbook. */}
      <div style={{ padding: '4px 18px 0', display: 'flex', gap: 6 }}>
        {trip.days.map((d) => {
          const isActive = d.n === activeDay
          const dow = (d.date || '').split(' ')[0]
          return (
            <button
              key={d.n}
              type="button"
              onClick={() => setActiveDay(d.n)}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: 12,
                background: isActive ? 'var(--accent)' : 'var(--card)',
                color: isActive ? 'var(--accent-ink, #fff)' : 'var(--muted)',
                border: isActive ? 'none' : '1px solid var(--border)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 9,
                  letterSpacing: '0.1em',
                  opacity: 0.75,
                }}
              >
                DAY {d.n}
              </div>
              <div
                style={{
                  fontFamily: 'Fraunces, Georgia, serif',
                  fontSize: 14,
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                {dow}
              </div>
            </button>
          )
        })}
      </div>

      {/* Day eyebrow + serif day title */}
      <div style={{ padding: '14px 18px 0' }}>
        <Eyebrow color="var(--muted)">
          DAY {day.n} · {(day.date || '').toUpperCase()}
        </Eyebrow>
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.1,
            marginTop: 4,
            color: 'var(--text)',
            fontStyle: 'italic',
          }}
        >
          {day.title}
        </div>
      </div>

      {/* Compact stop list for the active day — taps deep-link into
          StopDetail (which has the threaded composer). */}
      <div style={{ padding: '12px 18px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {day.stops.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onOpenStop(day.n, s.id)}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <Eyebrow color="var(--muted)">{s.time}</Eyebrow>
              <Eyebrow color="var(--faint, var(--muted))">
                {(s.kind || '').toUpperCase()}
              </Eyebrow>
            </div>
            <div
              style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 16,
                fontWeight: 600,
                marginTop: 4,
                lineHeight: 1.18,
              }}
            >
              {s.name}
            </div>
            {s.note && (
              <div
                style={{
                  fontFamily: 'Fraunces, Georgia, serif',
                  fontSize: 12,
                  fontStyle: 'italic',
                  color: 'var(--muted)',
                  marginTop: 4,
                  lineHeight: 1.4,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {s.note}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Postcards section header */}
      <div
        style={{
          padding: '28px 18px 4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          borderTop: '1px solid var(--border)',
          marginTop: 28,
        }}
      >
        <Eyebrow color="var(--accent)" style={{ fontWeight: 600 }}>
          POSTCARDS
        </Eyebrow>
        <Eyebrow color="var(--muted)">
          {mems.length} {mems.length === 1 ? 'CARD' : 'CARDS'}
        </Eyebrow>
      </div>

      <div
        style={{
          padding: '8px 16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
        }}
      >
        {mems.length === 0 ? (
          <EmptyState onOpenStop={onOpenStop} firstStop={trip.days[0]?.stops[0]} firstDay={trip.days[0]?.n} />
        ) : (
          mems.map((m, i) => {
            const stop = stopsById.get(m.stopId)
            return (
              <Postcard
                key={m.id}
                tilt={tiltFor(m.id)}
                tint={tints[i % tints.length]}
                mem={m}
                stop={stop}
                onClick={() => stop && onOpenStop(stop.day, stop.id)}
              />
            )
          })
        )}
      </div>

      <button
        type="button"
        aria-label="Compose postcard"
        onClick={() => setComposing(true)}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 92,
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: 'var(--accent)',
          color: 'var(--accent-ink, #fff)',
          fontSize: 28,
          fontWeight: 300,
          cursor: 'pointer',
          boxShadow: '0 10px 28px rgba(232, 71, 140, 0.45)',
          zIndex: 20,
        }}
      >
        +
      </button>

      {composing && (
        <PostcardComposer
          trip={trip}
          traveler={traveler}
          onClose={(result) => {
            setComposing(false)
            if (result?.saved) setRefreshTick((t) => t + 1)
          }}
        />
      )}
    </div>
  )
}

function Postcard({ tilt, tint, mem, stop, onClick }) {
  const author = TRAVELERS[mem.authorTraveler]
  const time = formatTime(mem.createdAt)
  const loc = (stop?.address || '').split(',')[0] || ''
  const taggedBy = stop?.for || []
  const mood = mem.mood || inferMood(mem)
  const caption =
    mem.text || mem.caption || mem.transcript || '(saved without words)'
  const [photoUrl, setPhotoUrl] = useState(null)
  useEffect(() => {
    let active = true
    let created = null
    if (mem.photoRef?.url) {
      setPhotoUrl(mem.photoRef.url)
    } else if (mem.photoRef?.key) {
      loadAsset('photo', mem.photoRef.key).then((blob) => {
        if (!active || !blob) return
        created = URL.createObjectURL(blob)
        setPhotoUrl(created)
      })
    }
    return () => {
      active = false
      if (created) URL.revokeObjectURL(created)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mem.photoRef?.key, mem.photoRef?.url])

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'var(--card)',
        borderRadius: 4,
        padding: 10,
        boxShadow: '0 10px 28px rgba(61, 14, 34, 0.16)',
        transform: `rotate(${tilt}deg)`,
        position: 'relative',
        cursor: 'pointer',
        border: 0,
        textAlign: 'left',
        color: 'var(--text)',
      }}
    >
      {/* paper tape */}
      <div
        style={{
          position: 'absolute',
          top: -8,
          left: 32,
          width: 54,
          height: 16,
          background: 'rgba(255, 255, 255, 0.55)',
          transform: 'rotate(-6deg)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        }}
      />
      {/* photo */}
      <div
        style={{
          width: '100%',
          aspectRatio: '5 / 3',
          borderRadius: 2,
          background: photoUrl
            ? `url(${photoUrl}) center/cover no-repeat`
            : `repeating-linear-gradient(45deg, ${tint}, ${tint} 6px, ${shade(tint, -10)} 6px, ${shade(tint, -10)} 12px)`,
        }}
      />
      <div
        style={{
          marginTop: 10,
          padding: '0 6px',
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 14,
          fontStyle: 'italic',
          lineHeight: 1.35,
        }}
      >
        “{caption}”
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 6px 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Avatar id={mem.authorTraveler} size={18} />
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              color: 'var(--muted)',
              letterSpacing: '0.06em',
            }}
          >
            {(author?.name || mem.authorTraveler).toLowerCase()} · {time}
          </span>
        </div>
        <span
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontStyle: 'italic',
            fontSize: 11,
            color: 'var(--accent)',
          }}
        >
          felt {mood}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 6px 0',
          borderTop: '1px dashed var(--border)',
          marginTop: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 8,
              color: 'var(--faint)',
              letterSpacing: '0.1em',
            }}
          >
            WITH
          </span>
          <AvatarStack ids={taggedBy} size={14} gap={-3} />
        </div>
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 8,
            color: 'var(--faint)',
            letterSpacing: '0.1em',
          }}
        >
          {loc}
        </span>
      </div>
    </button>
  )
}

function EmptyState({ onOpenStop, firstStop, firstDay }) {
  return (
    <div
      style={{
        padding: 24,
        background: 'var(--card)',
        borderRadius: 6,
        textAlign: 'center',
        boxShadow: '0 6px 20px rgba(61, 14, 34, 0.10)',
      }}
    >
      <div
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 18,
          fontStyle: 'italic',
          color: 'var(--muted)',
          marginBottom: 12,
        }}
      >
        no postcards yet — tap a stop to make the first one.
      </div>
      <button
        type="button"
        onClick={() => firstStop && onOpenStop(firstDay, firstStop.id)}
        style={{
          padding: '8px 16px',
          borderRadius: 16,
          border: 'none',
          background: 'var(--accent)',
          color: 'var(--accent-ink, #fff)',
          fontFamily: 'Inter Tight, system-ui, sans-serif',
          fontWeight: 600,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Open Day 1
      </button>
    </div>
  )
}

function Eyebrow({ children, color, style }) {
  return (
    <div
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: color || 'currentColor',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// Hand-rolled "felt {mood}" classifier from the memory's words. Cheap
// keyword bucket for v1; easy to swap for a sentiment model later.
function inferMood(mem) {
  const t = (mem.text || mem.transcript || mem.caption || '').toLowerCase()
  if (!t) return 'quiet'
  if (/lol|haha|loud|wild|chaos|crazy|run/.test(t)) return 'chaos'
  if (/love|gorgeous|beautiful|stunning|pretty|magic/.test(t)) return 'beautiful'
  if (/sad|tired|hard|miss|lonely|cold/.test(t)) return 'tender'
  if (/win|yes|great|nailed|amazing|excellent/.test(t)) return 'triumphant'
  return 'quiet'
}

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) + pct
  let g = ((n >> 8) & 0xff) + pct
  let b = (n & 0xff) + pct
  r = Math.max(0, Math.min(255, r))
  g = Math.max(0, Math.min(255, g))
  b = Math.max(0, Math.min(255, b))
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
