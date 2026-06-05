import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { loadAsset } from '../lib/memAssets'
import { thumbUrl } from '../lib/thumbUrl'
import { useInView } from '../lib/useInView'
import { TRAVELERS } from '../data/travelers'
import { Avatar, AvatarStack } from '../components/Avatar'
import { PostcardComposer } from '../components/PostcardComposer'
import { allStops } from '../data/trips'
import { hasActivitiesForTrip, getActivitiesForTrip } from '../data/sideActivities'

// Aurelia — "Her roll." Redesign increment 3 (2026-06-05): the big
// LIGHT→DARK inversion. Was a rose-paper scrapbook; now a near-black
// film-roll editorial — Instrument Serif italic display (self-hosted),
// hot-pink accent, grained photo frames with a film-sprocket edge.
// Same data + behaviors as before: the "note from Dad" letter (kept as a
// cream-paper artifact slipped into the dark roll), both photos entries,
// the postcard memories, the composer, things-to-do, day nav.

// Instrument Serif (self-hosted, see styles/platform.css @font-face) is
// Aurelia's display face. The cream "note from Dad" letter keeps Fraunces
// on purpose — it reads as a real typeset letter, not app chrome.
const SERIF = "'Instrument Serif', 'Times New Roman', Georgia, serif"

export function AureliaView({ trip, traveler, onOpenStop, onOpenActivities, onOpenPhotos, onOpenAllPhotos }) {
  // Re-render after the composer saves so the new postcard pops in.
  const [refreshTick, setRefreshTick] = useState(0)
  const [composing, setComposing] = useState(false)
  // Default to today if today falls inside the trip's ISO date range.
  // Falls back to day 1 for planning + completed trips. Matches
  // JonathanView + HelenView. See KNOWN_BUGS_HELEN_SURFACE.md P2.4.
  const [activeDay, setActiveDay] = useState(() => {
    const today = new Date().toISOString().slice(0, 10)
    const onToday = trip.days.find((d) => d.isoDate === today)
    return onToday?.n || trip.days[0]?.n
  })
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

  // Photo-placeholder tints — moody film frames now (was warm pastels,
  // which fought the dark ground). Pulled from the design's roll palette.
  const tints = ['#6E5A6A', '#46505E', '#7A6448', '#5C4A52', '#4A5A50']

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
      {/* Masthead — film-roll voice, big lowercase Instrument Serif italic. */}
      <div
        style={{
          padding: 'calc(env(safe-area-inset-top) + 60px) 18px 0',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Eyebrow color="var(--accent-text)">THE ROLL · ONLY MINE</Eyebrow>
        <Eyebrow color="var(--muted)">
          {mems.length} {mems.length === 1 ? 'FRAME' : 'FRAMES'}
        </Eyebrow>
      </div>
      <div style={{ padding: '6px 18px 12px' }}>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 52,
            fontWeight: 400,
            lineHeight: 0.95,
            fontStyle: 'italic',
            letterSpacing: '-0.01em',
            color: 'var(--text)',
          }}
        >
          aurelia
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 16,
            fontStyle: 'italic',
            color: 'var(--muted)',
            marginTop: 6,
          }}
        >
          a place for what you actually cared about.
        </div>
      </div>

      {/* Personal letter from another traveler, if the trip carries one
          addressed to Aurelia. Renders right under the masthead so it's
          the first content she sees — for the May 2026 volleyball trip, a
          note from Dad. Kept as warm cream paper on the dark roll (her
          must-keep artifact); only its pink accents follow the new hue. */}
      {trip.travelerNotes?.aurelia && (
        <div style={{ padding: '14px 14px 6px' }}>
          <PersonalLetter note={trip.travelerNotes.aurelia} />
        </div>
      )}

      {/* Photos entry — the foregrounded verb. Styled as a grained film
          frame ("her best frame"), hot-pink CTA. Aurelia uses the album
          to post + scroll back; Helen's dispatch composer launches here
          too. Kept high on the page. */}
      {onOpenPhotos && (
        <div style={{ padding: '12px 18px 0' }}>
          <button
            type="button"
            data-testid="aurelia-photos-entry"
            onClick={onOpenPhotos}
            style={{
              width: '100%',
              padding: 0,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--line-bold)',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              textAlign: 'left',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <FilmFrame tint="#5C4A52" height={132}>
              <div style={{ position: 'relative', padding: '0 18px 16px 26px' }}>
                <Eyebrow color="var(--accent-text)">★ THE PHOTO ALBUM</Eyebrow>
                <div
                  style={{
                    fontFamily: SERIF,
                    fontSize: 26,
                    fontStyle: 'italic',
                    color: '#fff',
                    marginTop: 4,
                    lineHeight: 1.05,
                  }}
                >
                  every frame, this trip →
                </div>
              </div>
            </FilmFrame>
          </button>
          {onOpenAllPhotos && (
            <button
              type="button"
              data-testid="aurelia-all-photos-entry"
              onClick={onOpenAllPhotos}
              style={{
                width: '100%',
                padding: '9px 14px',
                marginTop: 8,
                borderRadius: 'var(--radius)',
                border: '1px solid var(--accent)',
                background: 'transparent',
                color: 'var(--accent-text)',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: SERIF,
                  fontSize: 15,
                  fontStyle: 'italic',
                  fontWeight: 400,
                }}
              >
                ✨ Every trip's photos
              </span>
              <span style={{ fontSize: 14 }}>→</span>
            </button>
          )}
        </div>
      )}

      {/* Things to do — secondary pink-outline pill into the activities menu. */}
      {hasActivitiesForTrip(trip.id) && onOpenActivities && (
        <div style={{ padding: '8px 18px 0' }}>
          <button
            type="button"
            onClick={onOpenActivities}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--accent)',
              background: 'transparent',
              color: 'var(--accent-text)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontFamily: SERIF,
                fontSize: 15,
                fontStyle: 'italic',
                fontWeight: 400,
              }}
            >
              ✨ {getActivitiesForTrip(trip.id, trip).length} things to do
            </span>
            <span style={{ fontSize: 16 }}>→</span>
          </button>
        </div>
      )}

      {/* Day picker — dark film chips so she can navigate the itinerary
          alongside the roll. */}
      <div style={{ padding: '14px 18px 0', display: 'flex', gap: 6 }}>
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
                borderRadius: 'var(--radius)',
                background: isActive ? 'var(--accent)' : 'var(--card)',
                color: isActive ? 'var(--accent-ink)' : 'var(--muted)',
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
                }}
              >
                DAY {d.n}
              </div>
              <div
                style={{
                  fontFamily: SERIF,
                  fontSize: 16,
                  fontStyle: 'italic',
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
            fontFamily: SERIF,
            fontSize: 24,
            fontWeight: 400,
            lineHeight: 1.05,
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
              borderRadius: 'var(--radius)',
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
              <Eyebrow color="var(--muted)">
                {(s.kind || '').toUpperCase()}
              </Eyebrow>
            </div>
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 18,
                fontStyle: 'italic',
                marginTop: 4,
                lineHeight: 1.12,
              }}
            >
              {s.name}
            </div>
            {s.note && (
              <div
                style={{
                  fontFamily: SERIF,
                  fontSize: 13,
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

      {/* The roll — her postcard frames */}
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
        <Eyebrow color="var(--accent-text)" style={{ fontWeight: 600 }}>
          THE ROLL
        </Eyebrow>
        <Eyebrow color="var(--muted)">
          {mems.length} {mems.length === 1 ? 'FRAME' : 'FRAMES'}
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
          color: 'var(--accent-ink)',
          fontSize: 28,
          fontWeight: 300,
          cursor: 'pointer',
          boxShadow: '0 10px 28px rgba(255, 61, 120, 0.45)',
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

// A grained, film-edged frame: dark photographic gradient + sprocket
// strip down the left + a bottom scrim so overlaid text stays legible.
// Used for the hero photo-album entry; children render over the scrim.
function FilmFrame({ tint, height, children }) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        overflow: 'hidden',
        background: `linear-gradient(150deg, ${shade(tint, 22)}, ${tint} 48%, ${shade(tint, -20)})`,
      }}
    >
      {/* film sprocket edge */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 14,
          background:
            'repeating-linear-gradient(180deg, #0a0a0a 0 9px, rgba(255,255,255,0.16) 9px 13px)',
        }}
      />
      {/* bottom scrim */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.82))',
        }}
      />
      {children}
    </div>
  )
}

// A trip-level letter from one traveler to another, surfaced inside the
// recipient's themed view. Kept as warm cream paper even on Aurelia's
// dark roll (Jonathan's call, 2026-06-05) — it reads as a real letter
// slipped into the roll. Only the pink tape/label follow the new accent.
function PersonalLetter({ note }) {
  const paragraphs = Array.isArray(note?.body) ? note.body : [note?.body || '']
  return (
    <article
      style={{
        position: 'relative',
        background: '#FBF5EC',
        color: '#3D2424',
        borderRadius: 4,
        padding: '34px 24px 26px',
        boxShadow:
          '0 16px 38px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.3)',
        transform: 'rotate(-1.2deg)',
        border: '1px solid rgba(150, 100, 80, 0.10)',
        marginTop: 8,
      }}
    >
      {/* Pink paper tape across the top — picks up Aurelia's hot-pink
          accent so the card visually belongs to her surface even though
          the paper itself is the warmer cream of a real letter. */}
      <div
        style={{
          position: 'absolute',
          top: -10,
          left: '50%',
          transform: 'translateX(-50%) rotate(2.2deg)',
          width: 96,
          height: 22,
          background: 'rgba(255, 61, 120, 0.26)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      />

      <div
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#C03671',
          fontWeight: 700,
          marginBottom: 14,
        }}
      >
        ✉ A note from {note.from}
      </div>

      {note.salutation && (
        <div
          style={{
            fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
            fontSize: 19,
            fontStyle: 'italic',
            fontWeight: 500,
            marginBottom: 14,
            color: '#2A1818',
          }}
        >
          {note.salutation}
        </div>
      )}

      <div
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 15,
          lineHeight: 1.62,
          fontStyle: 'italic',
          color: '#3D2424',
        }}
      >
        {paragraphs.map((p, i) => (
          <p
            key={i}
            style={{ margin: i === 0 ? 0 : '14px 0 0', padding: 0 }}
          >
            {p}
          </p>
        ))}
      </div>

      {(note.closing || note.signature) && (
        <div style={{ marginTop: 22, paddingLeft: 4 }}>
          {note.closing && (
            <div
              style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 15,
                fontStyle: 'italic',
                color: '#3D2424',
              }}
            >
              {note.closing}
            </div>
          )}
          {note.signature && (
            <div
              style={{
                fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
                fontSize: 30,
                fontStyle: 'italic',
                fontWeight: 700,
                color: '#2A1818',
                marginTop: 4,
                letterSpacing: '-0.01em',
              }}
            >
              {note.signature}
            </div>
          )}
        </div>
      )}
    </article>
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
  // A 'photo' memory with no R2/IDB ref and no external URL has no
  // image to paint. Surface a calm "unavailable" frame instead of the
  // tinted-stripe loader, which falsely promises "loading."
  // See KNOWN_BUGS_HELEN_SURFACE.md P0.2.
  const photoRefs = mem.photoRefs?.length
    ? mem.photoRefs
    : mem.photoRef
      ? [mem.photoRef]
      : []
  const isPhotoMissing =
    (mem.kind || 'photo') === 'photo' &&
    !photoRefs.some((r) => r?.url || r?.key) &&
    !(mem.photoExternalURLs?.length > 0)
  const [photoUrl, setPhotoUrl] = useState(null)
  // Defer photo fetch until tile is near the viewport — Aurelia's
  // view can render dozens of postcards across a long-trip archive.
  // See KNOWN_BUGS_HELEN_SURFACE.md P0.4.
  const { ref: postcardRef, inView } = useInView({ rootMargin: '300px 0px' })
  useEffect(() => {
    if (!inView) return
    let active = true
    let created = null
    if (mem.photoRef?.url) {
      // R2 / legacy remote — request a thumbnail variant. thumbUrl
      // passes blob: / data: / third-party URLs through untouched.
      setPhotoUrl(thumbUrl(mem.photoRef.url, 600))
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
  }, [inView, mem.photoRef?.key, mem.photoRef?.url])

  return (
    <button
      ref={postcardRef}
      type="button"
      onClick={onClick}
      style={{
        background: 'var(--card)',
        borderRadius: 'var(--radius)',
        padding: 10,
        boxShadow: 'var(--shadow-card)',
        transform: `rotate(${tilt}deg)`,
        position: 'relative',
        cursor: 'pointer',
        border: '1px solid var(--border)',
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
          background: 'rgba(243, 238, 233, 0.16)',
          transform: 'rotate(-6deg)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
        }}
      />
      {/* photo */}
      {isPhotoMissing ? (
        <div
          aria-label="Photo unavailable"
          style={{
            width: '100%',
            aspectRatio: '5 / 3',
            borderRadius: 2,
            background: 'var(--bg2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
          }}
        >
          <ImageOff size={22} strokeWidth={1.5} />
        </div>
      ) : (
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '5 / 3',
            borderRadius: 2,
            overflow: 'hidden',
            background: photoUrl
              ? `url(${photoUrl}) center/cover no-repeat`
              : `linear-gradient(150deg, ${shade(tint, 18)}, ${tint} 50%, ${shade(tint, -18)})`,
          }}
        >
          {/* film sprocket edge — sells the roll */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: 10,
              background:
                'repeating-linear-gradient(180deg, #0a0a0a 0 7px, rgba(255,255,255,0.14) 7px 10px)',
            }}
          />
        </div>
      )}
      <div
        style={{
          marginTop: 10,
          padding: '0 6px',
          fontFamily: SERIF,
          fontSize: 17,
          fontStyle: 'italic',
          lineHeight: 1.3,
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
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontSize: 13,
            color: 'var(--accent-text)',
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
              color: 'var(--muted)',
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
            color: 'var(--muted)',
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
        borderRadius: 'var(--radius)',
        textAlign: 'center',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 20,
          fontStyle: 'italic',
          color: 'var(--muted)',
          marginBottom: 12,
        }}
      >
        no frames yet — tap a stop to make the first one.
      </div>
      <button
        type="button"
        onClick={() => firstStop && onOpenStop(firstDay, firstStop.id)}
        style={{
          padding: '8px 16px',
          borderRadius: 999,
          border: 'none',
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
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
