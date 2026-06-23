// PartsTripView — the saved-trip view for a COMPOSITE trip (a city break, a
// flight + city + stay, a multi-leg odyssey). New-trip redesign: "real timed
// city days" + "parts show up after you save."
//
// Why a separate view: the per-lens views (Jonathan/Helen/Aurelia) are built
// around a single road-trip day at a time — day tabs, a DRIVE/FLIGHT/ETA ticker,
// one active day. That IA is wrong for a city/composite trip. So App renders THIS
// view instead when a trip carries explicit `parts[]`; every LEGACY trip still
// renders its bespoke lens, byte-identical (the branch lives in App.renderTripView,
// gated on hasExplicitParts — see tripParts.js). Rafa keeps his storybook views.
//
// The days are DERIVED, not stored: partsWithDays() lays each saved day under its
// part by date and enumerates a dated part's window so empty days read as loose
// "open space" (one anchor + room to fill). Pure, fully unit-tested in tripParts.
//
// Skinned via the per-lens CSS vars already on the body (--accent / --text /
// --muted / --border / --card), so it carries each person's color identity.
import { partsWithDays, deriveTripShape, partCount } from '../lib/tripParts.js'
import { humanDateRange } from '../lib/createTripCard.js'
import { AvatarStack } from '../components/Avatar'

const SERIF = 'Fraunces, "Iowan Old Style", Georgia, serif'
const MONO = 'JetBrains Mono, monospace'

// 'YYYY-MM-DD' → "Wed · Jul 2" (formatted in UTC so the calendar date never
// drifts across timezones). Falls back to the day's own human label when present.
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function dayLabel(day) {
  // Prefer the isoDate so real and loose days read in ONE consistent format
  // ("Mon · Jun 22"); fall back to a stored human label only when there's no date.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day?.isoDate || '')
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    return `${WD[d.getUTCDay()]} · ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`
  }
  return day?.date || 'Day'
}

const SHAPE_EYEBROW = {
  bigger: 'A bigger trip',
  city: 'City break',
  stay: 'A stay',
  drive: 'Road trip',
  flight: 'A trip',
}

function Label({ children, color = 'var(--muted)', size = 9 }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: size, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, color }}>
      {children}
    </span>
  )
}

function StopRow({ stop, onOpen, first }) {
  return (
    <div style={{ borderTop: first ? 'none' : '1px solid var(--border)', padding: '11px 0' }}>
      <button
        type="button"
        onClick={onOpen}
        style={{ width: '100%', background: 'transparent', border: 0, padding: 0, cursor: onOpen ? 'pointer' : 'default', color: 'inherit', textAlign: 'left', display: 'flex', gap: 13, alignItems: 'flex-start' }}
      >
        <div style={{ width: 48, flexShrink: 0, paddingTop: 2 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>
            {(stop.time || '').replace(' ', '') || '—'}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {stop.kind && <Label>[{stop.kind}]</Label>}
          <div style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.18, color: 'var(--text)', marginTop: 3, letterSpacing: '-0.012em' }}>
            {stop.name}
          </div>
          {stop.note && (
            <div style={{ fontFamily: SERIF, fontSize: 12.5, fontStyle: 'italic', color: 'var(--muted)', marginTop: 4, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {stop.note}
            </div>
          )}
          {((stop.for && stop.for.length > 0) || stop.address) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
              <AvatarStack ids={stop.for || []} size={15} gap={-4} />
              {stop.address && <Label>· {(stop.address || '').split(',')[0] || ''}</Label>}
            </div>
          )}
        </div>
      </button>
    </div>
  )
}

function DayRow({ day, onOpenStop }) {
  const stops = (day.stops || []).filter((s) => s && !s.skipped)
  const loose = day.loose || stops.length === 0
  return (
    <div data-testid="parts-trip-day" data-loose={loose ? '1' : undefined} style={{ padding: '10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <Label color="var(--text)" size={9.5}>{dayLabel(day)}</Label>
        {!loose && <Label size={8.5}>{stops.length} {stops.length === 1 ? 'stop' : 'stops'}</Label>}
      </div>
      {loose ? (
        <div style={{ fontFamily: SERIF, fontSize: 13, fontStyle: 'italic', color: 'var(--muted)', marginTop: 5 }}>
          Open — nothing planned yet.
        </div>
      ) : (
        <div style={{ marginTop: 4 }}>
          {stops.map((s, i) => (
            <StopRow
              key={s.id || i}
              stop={s}
              first={i === 0}
              onOpen={onOpenStop && day.n ? () => onOpenStop(day.n, s.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PartSection({ part, onOpenStop }) {
  const when = humanDateRange(part.dateStart, part.dateEnd)
  const days = part.days || []
  return (
    <section
      data-testid="parts-trip-part"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius, 14px)',
        boxShadow: 'var(--shadow-card, none)',
        padding: '16px',
        margin: '0 12px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <Label color="var(--accent-text, var(--accent))">{part.type || 'stay'}</Label>
        {when && when !== 'TBD' && <Label size={8.5}>{when}</Label>}
      </div>
      <h2 style={{ fontFamily: SERIF, fontSize: 23, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--text)', margin: '6px 0 0' }}>
        {part.title || part.place || 'A part of the trip'}
      </h2>
      {part.place && part.title && part.place !== part.title && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{part.place}</div>
      )}
      <div style={{ marginTop: 8 }}>
        {days.length === 0 ? (
          <div style={{ fontFamily: SERIF, fontSize: 13, fontStyle: 'italic', color: 'var(--muted)', padding: '4px 0 8px' }}>
            {part.type === 'flight' || part.type === 'drive' || part.type === 'train' || part.type === 'ferry'
              ? 'A travel leg.'
              : 'No days yet.'}
          </div>
        ) : (
          days.map((d, di) => <DayRow key={d.isoDate || di} day={d} onOpenStop={onOpenStop} />)
        )}
      </div>
    </section>
  )
}

export function PartsTripView({ trip, onOpenStop, onOpenPhotos, onOpenActivities, onOpenClaude }) {
  if (!trip) return null
  const parts = partsWithDays(trip)
  const shape = deriveTripShape(trip)
  const totalDays = parts.reduce((sum, p) => sum + (p.dayCount || 0), 0)
  const when = humanDateRange(trip.dateRangeStart, trip.dateRangeEnd)
  const n = partCount(trip)

  return (
    <div data-testid="parts-trip-view">
      {/* Trip header — sits on the page bg (not a card), so its text uses the
          AA-safe tokens (--accent-text / --text), never raw --muted which fails
          on Helen's paper. Per-lens color identity rides --accent-text. */}
      <div style={{ padding: '16px 16px 8px' }}>
        <Label color="var(--accent-text, var(--accent))">{SHAPE_EYEBROW[shape] || 'A trip'}</Label>
        <h1 style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 600, lineHeight: 0.98, letterSpacing: '-0.02em', color: 'var(--text)', margin: '7px 0 0' }}>
          {trip.title || 'Untitled trip'}
        </h1>
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text)', marginTop: 9, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {when && when !== 'TBD' && <span>{when}</span>}
          <span>{n} {n === 1 ? 'part' : 'parts'} · {totalDays} {totalDays === 1 ? 'day' : 'days'}</span>
        </div>
        {trip.subtitle && (
          <div style={{ fontFamily: SERIF, fontSize: 14, fontStyle: 'italic', color: 'var(--text)', marginTop: 10, lineHeight: 1.45 }}>
            {trip.subtitle}
          </div>
        )}
      </div>

      {/* The parts — each a card, so its muted detail text composites over --card
          (white on Helen) and clears AA, matching the lenses' card language. */}
      {parts.map((p, i) => (
        <PartSection key={p.id || i} part={p} onOpenStop={onOpenStop} />
      ))}

      {/* Quiet, non-dead-end footer — the trip's other surfaces stay reachable. */}
      {(onOpenPhotos || onOpenActivities || onOpenClaude) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '20px 16px 28px', borderTop: '1px solid var(--border)', marginTop: 16 }}>
          {onOpenClaude && (
            <button type="button" onClick={() => onOpenClaude()} className="link-quiet" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer', color: 'var(--text)', fontFamily: MONO, fontSize: 11, letterSpacing: '0.04em' }}>
              Adjust with Claude
            </button>
          )}
          {onOpenActivities && (
            <button type="button" onClick={() => onOpenActivities()} className="link-quiet" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer', color: 'var(--text)', fontFamily: MONO, fontSize: 11, letterSpacing: '0.04em' }}>
              Things to do
            </button>
          )}
          {onOpenPhotos && (
            <button type="button" onClick={() => onOpenPhotos()} className="link-quiet" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer', color: 'var(--text)', fontFamily: MONO, fontSize: 11, letterSpacing: '0.04em' }}>
              Photos
            </button>
          )}
        </div>
      )}
    </div>
  )
}
