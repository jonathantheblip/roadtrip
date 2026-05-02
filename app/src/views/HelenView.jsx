import { useEffect, useState } from 'react'
import { Mic, MapPin } from 'lucide-react'
import { listMemoriesForStop } from '../lib/memoryStore'
import { loadAsset } from '../lib/memAssets'
import { Avatar, AvatarStack } from '../components/Avatar'
import { findArrivalStop, FlightStatus } from './FlightStatus'

// Helen — Threaded Archive Timeline. Design-bundle authoritative
// (prototype.jsx#HelenTimeline + screens-supporting.jsx#StopWithThread).
// Linen-on-paper. Day-as-card chips at the top. Each day's stops render
// in a vertical timeline with a memory-thread preview strip beneath
// stops that have memories, or an "+ add a memory" pill when empty.

export function HelenView({ trip, traveler, onOpenStop, onOpenSettings }) {
  const [activeDay, setActiveDay] = useState(trip.days[0]?.n)
  const day = trip.days.find((d) => d.n === activeDay) || trip.days[0]
  const arrival = findArrivalStop(trip)

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
          padding: '60px 18px 4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Eyebrow color="var(--muted)">{trip.title.toUpperCase()}</Eyebrow>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Map view"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            letterSpacing: '0.14em',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <MapPin size={11} /> MAP
        </button>
      </div>

      <div style={{ padding: '6px 18px 4px', display: 'flex', gap: 6 }}>
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
                borderRadius: 10,
                background: isActive ? 'var(--text)' : 'transparent',
                color: isActive ? 'var(--bg)' : 'var(--muted)',
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
                  opacity: 0.7,
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

      <div style={{ padding: '12px 18px 0' }}>
        <Eyebrow color="var(--muted)">
          DAY {day.n} · {(day.date || '').toUpperCase()}
        </Eyebrow>
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1.05,
            marginTop: 4,
            color: 'var(--text)',
          }}
        >
          {day.title}
        </div>
      </div>

      {arrival?.day?.n === day.n && (
        <div style={{ padding: '14px 18px 0' }}>
          <FlightStatus
            stop={arrival.stop}
            variant="panel"
            framing="their"
            traveler={traveler}
          />
        </div>
      )}

      <div style={{ padding: '14px 0 0' }}>
        {day.stops.map((s, i) => (
          <StopWithThread
            key={s.id}
            stop={s}
            traveler={traveler}
            last={i === day.stops.length - 1}
            onOpen={() => onOpenStop(day.n, s.id)}
          />
        ))}
      </div>

      <button
        type="button"
        aria-label="Capture memory"
        onClick={() => {
          const target = day.stops?.[0]
          if (target) onOpenStop(day.n, target.id)
        }}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 92,
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: 'none',
          background: 'var(--accent)',
          color: 'var(--accent-ink, #fff)',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(46, 93, 58, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          fontWeight: 300,
          zIndex: 20,
        }}
      >
        +
      </button>
    </div>
  )
}

function StopWithThread({ stop, traveler, last, onOpen }) {
  const mems = listMemoriesForStop(stop.id, traveler)
  const authors = Array.from(new Set(mems.map((m) => m.authorTraveler)))
  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          left: 30,
          top: 8,
          bottom: last ? 30 : 0,
          width: 1,
          background: 'var(--border)',
        }}
      />
      <div style={{ padding: '14px 18px 6px', position: 'relative' }}>
        <button
          type="button"
          onClick={onOpen}
          style={{
            width: '100%',
            background: 'transparent',
            border: 0,
            padding: 0,
            cursor: 'pointer',
            color: 'inherit',
            textAlign: 'left',
            display: 'flex',
            gap: 14,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ width: 24, paddingTop: 2 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: 'var(--bg)',
                border: '2px solid var(--accent)',
                marginLeft: -1,
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <Eyebrow color="var(--muted)">{stop.time}</Eyebrow>
              <Eyebrow color="var(--faint)">{(stop.kind || '').toUpperCase()}</Eyebrow>
            </div>
            <div
              style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 17,
                fontWeight: 600,
                lineHeight: 1.2,
                marginTop: 4,
                letterSpacing: '-0.012em',
              }}
            >
              {stop.name}
            </div>
            {(stop.helenNote || stop.note) && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  marginTop: 4,
                  lineHeight: 1.4,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {stop.helenNote || stop.note}
              </div>
            )}
          </div>
        </button>

        {mems.length > 0 ? (
          <button
            type="button"
            onClick={onOpen}
            style={{
              marginLeft: 38,
              marginTop: 12,
              padding: '10px 12px',
              background: 'var(--card)',
              borderRadius: 12,
              border: '1px solid var(--border)',
              width: 'calc(100% - 56px)',
              textAlign: 'left',
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <Eyebrow color="var(--accent)" style={{ fontWeight: 600 }}>
                {mems.length} {mems.length === 1 ? 'MEMORY' : 'MEMORIES'}
              </Eyebrow>
              <AvatarStack ids={authors} size={16} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {mems.slice(0, 3).map((m) => (
                <ThreadPreviewTile key={m.id} mem={m} />
              ))}
            </div>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 9,
                color: 'var(--faint)',
                letterSpacing: '0.1em',
                textAlign: 'center',
                borderTop: '1px dashed var(--border)',
                paddingTop: 6,
              }}
            >
              OPEN THREAD →
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            style={{
              marginLeft: 38,
              marginTop: 10,
              padding: '6px 12px',
              borderRadius: 16,
              border: '1px dashed var(--border)',
              background: 'transparent',
              color: 'var(--muted)',
              fontSize: 11,
              fontFamily: 'Inter Tight, system-ui, sans-serif',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 14 }}>+</span> add a memory
          </button>
        )}
      </div>
    </div>
  )
}

function ThreadPreviewTile({ mem }) {
  const kind = mem.kind || (mem.text ? 'text' : 'photo')
  const photoRefs = mem.photoRefs?.length
    ? mem.photoRefs
    : mem.photoRef
      ? [mem.photoRef]
      : []
  const [photoUrl, setPhotoUrl] = useState(null)
  useEffect(() => {
    let cancelled = false
    let created = null
    const first = photoRefs[0]
    if (kind === 'photo' && first?.key && first.storage === 'idb') {
      loadAsset('photo', first.key).then((blob) => {
        if (cancelled || !blob) return
        created = URL.createObjectURL(blob)
        setPhotoUrl(created)
      })
    }
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [kind, photoRefs[0]?.key])
  return (
    <div style={{ flex: 1, position: 'relative' }}>
      {kind === 'photo' && (
        <div
          style={{
            aspectRatio: 1,
            background: photoUrl
              ? `url(${photoUrl}) center/cover no-repeat`
              : 'repeating-linear-gradient(45deg, #d6c5a8, #d6c5a8 6px, #c5b497 6px, #c5b497 12px)',
            borderRadius: 6,
          }}
        />
      )}
      {kind === 'photo' && photoRefs.length > 1 && (
        <div
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            background: 'rgba(0,0,0,0.65)',
            color: '#fff',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.06em',
            padding: '1px 5px',
            borderRadius: 8,
          }}
        >
          {photoRefs.length}
        </div>
      )}
      {kind === 'voice' && (
        <div
          style={{
            aspectRatio: 1,
            background: 'var(--bg2)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)',
          }}
        >
          <Mic size={18} />
        </div>
      )}
      {kind === 'text' && (
        <div
          style={{
            aspectRatio: 1,
            background: 'var(--bg2)',
            borderRadius: 6,
            padding: 6,
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 9,
            fontStyle: 'italic',
            color: 'var(--muted)',
            overflow: 'hidden',
            lineHeight: 1.2,
            display: '-webkit-box',
            WebkitLineClamp: 5,
            WebkitBoxOrient: 'vertical',
          }}
        >
          “{(mem.text || mem.transcript || mem.caption || '').slice(0, 80)}”
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 3, left: 3 }}>
        <Avatar id={mem.authorTraveler} size={14} ring />
      </div>
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
