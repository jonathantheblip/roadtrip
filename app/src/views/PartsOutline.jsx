// PartsOutline — the parts → days → stops body of a COMPOSITE trip (a city break,
// a flight + city + stay, a multi-leg odyssey), embedded INSIDE the living-heart
// home. There is ONE home for every trip (FAMILY_TRIPS_VISION §11): a complex trip
// leads with the living heart (place/now + the just-in-time "Next up" ticket) and
// shows its full plan here, below — never a separate parts-only home.
//
// The days are DERIVED, not stored: partsWithDays() lays each saved day under its
// part by date and enumerates a dated part's window so empty days read as loose
// "open space" (one anchor + room to fill). Pure, fully unit-tested in tripParts.
//
// Skinned via the per-lens CSS vars already on the body (--accent / --text /
// --muted / --border / --card), so it carries each person's color identity. It
// sits in the living heart's padded content column, so its cards carry no extra
// horizontal margin (the column pads them).
import { partsWithDays, partPlaceLabel } from '../lib/tripParts.js'
import { readableRecordEntries, isDraftEntry, entryStamps } from '../lib/dayRecord.js'
import { humanDateRange } from '../lib/createTripCard.js'
import { AvatarStack } from '../components/Avatar'

const SERIF = 'Fraunces, "Iowan Old Style", Georgia, serif'
const MONO = 'JetBrains Mono, monospace'

// 'YYYY-MM-DD' → "Wed · Jul 2" (formatted in UTC so the calendar date never
// drifts across timezones). Falls back to the day's own human label when present.
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Exported for the stay home's "The whole stay" unfold (SEE-the-plan,
// 2026-07-02) — the one shared, UTC-safe day-label format, so the unfolded
// stay and the composite plan can never disagree on a date (and no caller is
// tempted into toLocaleDateString on an ISO string, the TZ-fragile class).
export function dayLabel(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day?.isoDate || '')
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    return `${WD[d.getUTCDay()]} · ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`
  }
  return day?.date || 'Day'
}

function Label({ children, color = 'var(--muted)', size = 9 }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: size, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, color }}>
      {children}
    </span>
  )
}

// Exported for the stay home's "The whole stay" unfold — the same stop row
// the composite plan renders, so a stop reads identically on both surfaces.
// `looseTime` (record entries): times are prose by design — "late morning",
// "after lunch" — so the column widens and wraps instead of space-stripping
// ("latemorning") into the name column. Default off: plan stops unchanged.
export function StopRow({ stop, onOpen, first, looseTime = false }) {
  return (
    <div style={{ borderTop: first ? 'none' : '1px solid var(--border)', padding: '11px 0' }}>
      <button
        type="button"
        onClick={onOpen}
        style={{ width: '100%', background: 'transparent', border: 0, padding: 0, cursor: onOpen ? 'pointer' : 'default', color: 'inherit', textAlign: 'left', display: 'flex', gap: 13, alignItems: 'flex-start' }}
      >
        <div style={{ width: looseTime ? 64 : 48, flexShrink: 0, paddingTop: 2 }}>
          <div style={{ fontFamily: MONO, fontSize: looseTime ? 9.5 : 11, color: 'var(--text)', fontWeight: 500, ...(looseTime ? { lineHeight: 1.25, textTransform: 'uppercase', letterSpacing: '0.04em', overflowWrap: 'break-word' } : {}) }}>
            {looseTime ? (stop.time || '—') : (stop.time || '').replace(' ', '') || '—'}
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

// A RECORD entry — "what actually happened" — reads in the MEMORY tense, not
// the plan's. The plan (StopRow) leads with a mono time column + a [kind] tag;
// memory drops both and leads with the serif place, its loose time in words
// beneath ("late morning, till one"). A small marker dot in the record accent
// stands where the plan has none. (Design 02 "Named row" / 03 read faces; gold
// is reserved for a KEPT day, which arrives with the keep flow.) Read-only.
// Rafa's stamps (design 03/04) — inline glyphs after the line, "for everyone."
// A small, quiet addition; absent entirely on any entry nobody's stamped.
function StampGlyphs({ entry }) {
  const stamps = entryStamps(entry)
  if (!stamps.length) return null
  return (
    <span aria-label="Rafa stamped this" style={{ marginLeft: 6 }}>
      {stamps.map((s, i) => (
        <span key={i} style={{ fontSize: 13 }}>{s.glyph}</span>
      ))}
    </span>
  )
}

export function RecordRow({ entry, first }) {
  const time = (entry?.time || '').trim()
  const rowStyle = { borderTop: first ? 'none' : '1px solid var(--border)', padding: '10px 0', display: 'flex', gap: 11, alignItems: 'flex-start' }
  // A DRAFT (an evidence pin nobody named yet) reads DASHED + mono — a machine guess,
  // never wearing a human name (honesty rule #1). Distinct from a kept serif memory.
  if (isDraftEntry(entry)) {
    const guess = (entry.guess || '').trim()
    const n = entry.photoCount || (Array.isArray(entry.photos) ? entry.photos.length : 0)
    const meta = [time, n ? `${n} photo${n === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')
    return (
      <div style={rowStyle} data-testid="record-draft-row">
        <span
          aria-hidden="true"
          style={{ width: 7, height: 7, borderRadius: 7, border: '1.5px dashed var(--muted)', background: 'transparent', flexShrink: 0, marginTop: 8 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', lineHeight: 1.3, overflowWrap: 'break-word' }}>
            {guess || 'A spot'}<StampGlyphs entry={entry} />
          </div>
          {meta && (
            <div style={{ fontFamily: MONO, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginTop: 3, opacity: 0.85 }}>
              {meta}
            </div>
          )}
          {Array.isArray(entry.for) && entry.for.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <AvatarStack ids={entry.for} size={15} gap={-4} />
            </div>
          )}
        </div>
      </div>
    )
  }
  return (
    <div style={rowStyle}>
      <span
        aria-hidden="true"
        style={{ width: 7, height: 7, borderRadius: 7, background: 'var(--accent-text, var(--accent))', flexShrink: 0, marginTop: 8 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: 15.5, fontWeight: 600, lineHeight: 1.2, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          {entry.name}<StampGlyphs entry={entry} />
        </div>
        {time && (
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, color: 'var(--muted)', marginTop: 1, lineHeight: 1.35 }}>
            {time}
          </div>
        )}
        {entry.note && (
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {entry.note}
          </div>
        )}
        {Array.isArray(entry.for) && entry.for.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <AvatarStack ids={entry.for} size={15} gap={-4} />
          </div>
        )}
      </div>
    </div>
  )
}

function DayRow({ day, onOpenStop }) {
  const stops = (day.stops || []).filter((s) => s && !s.skipped)
  const loose = day.loose || stops.length === 0
  // THE RECORD — what actually happened (dayRecord.js). A recorded day is
  // shown on the composite plan too: "Saved ✓ then invisible" would be a
  // lying surface. Renders only when a record exists — composite trips
  // without records are byte-identical.
  const recorded = readableRecordEntries(day)
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
      {recorded.length > 0 && (
        <div data-testid="day-record" style={{ marginTop: 6 }}>
          <Label color="var(--accent-text, var(--accent))" size={8.5}>As it happened</Label>
          {recorded.map((e, ei) => (
            <RecordRow key={e.id || ei} entry={e} first={ei === 0} />
          ))}
        </div>
      )}
    </div>
  )
}

function PartSection({ part, onOpenStop }) {
  const when = humanDateRange(part.dateStart, part.dateEnd)
  const days = part.days || []
  // Object-safe: place may be a string OR a { name, lat, lng } object — read the
  // display label through the shared reader (never render the raw object).
  const placeLabel = partPlaceLabel(part)
  return (
    // The scroll target for the journey rail's "tap a leg" (LivingHeartHome):
    // reuses The Plan, no new screen.
    <section
      id={`plan-part-${part.id}`}
      data-testid="parts-trip-part"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius, 14px)',
        boxShadow: 'var(--shadow-card, none)',
        padding: '16px',
        margin: '0 0 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <Label color="var(--accent-text, var(--accent))">{part.type || 'stay'}</Label>
        {when && when !== 'TBD' && <Label size={8.5}>{when}</Label>}
      </div>
      <h2 style={{ fontFamily: SERIF, fontSize: 23, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--text)', margin: '6px 0 0' }}>
        {part.title || placeLabel || 'A part of the trip'}
      </h2>
      {placeLabel && part.title && placeLabel !== part.title && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{placeLabel}</div>
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

// The full plan of a composite trip, as a column of part cards. Header + footer
// live in the living heart around it (hero, quiet actions). `trip` carries explicit
// parts[]; onOpenStop opens a stop's detail (full ticket / flight / logistics).
export function PartsOutline({ trip, onOpenStop }) {
  if (!trip) return null
  const parts = partsWithDays(trip)
  return (
    <div>
      {parts.map((p, i) => (
        <PartSection key={p.id || i} part={p} onOpenStop={onOpenStop} />
      ))}
    </div>
  )
}
