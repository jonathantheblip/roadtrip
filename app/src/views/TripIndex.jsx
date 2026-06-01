import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import { effectiveStatus } from '../data/trips'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { thumbUrl } from '../lib/thumbUrl'
import { hasExplicitHero } from '../lib/tripHero'
import { AvatarStack } from '../components/Avatar'

// Trip index — the platform's home. Direct port of the Design bundle's
// HomeScreen (screens-supporting.jsx#HomeScreen). Per traveler theme
// applied via CSS variables, so the same layout reads cleanly on
// Jonathan's Kottke-dark and Rafa's near-black as it does on Helen's
// linen and Aurelia's rose.
//
// Each trip card surfaces:
//   • status eyebrow (in planning / archived / live) with date range
//   • serif title + italic subtitle
//   • photo placeholder (Pass-2 will swap to a real hero asset)
//   • AvatarStack of travelers + "<start> → <end>" route
//   • live memory count read from listMemoriesForTrip

export function TripIndex({ traveler = 'helen', trips = [], onOpenTrip, onNewTrip }) {
  // Order by where each trip sits relative to today, then bucket prior
  // years into a separate archive. effectiveStatus(trip) (in trips.js)
  // is the single source of truth for the status chip — a stored
  // 'planning' that's already past now reads ARCHIVED. groupTrips()
  // applies the same date logic to the layout: current-year trips
  // (upcoming first, then most-recent past) up top, prior years in
  // ARCHIVE · YYYY sections below.
  const { current, archives } = useMemo(() => groupTrips(trips), [trips])
  const liveCounts = useMemo(() => {
    const map = new Map()
    for (const t of trips) {
      map.set(t.id, listMemoriesForTrip(t.id, traveler).length)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traveler, trips.length])

  // Hero photo fallback per trip: prefer the trip's explicit
  // heroImage; otherwise pick a photo memory the user has access to,
  // preferring one tagged to the trip's heroStopId so the card stays
  // editorially anchored. Computed once at the index level so each
  // TripCard receives a ready URL — keeps the cards presentational
  // and avoids N memoryStore reads in the render path. See
  // KNOWN_BUGS_HELEN_SURFACE.md P1.1 / P1.2.
  const heroPhotoUrls = useMemo(() => {
    const map = new Map()
    for (const t of trips) {
      if (hasExplicitHero(t)) continue // explicit hero wins (shared §0 guard)
      const mems = listMemoriesForTrip(t.id, traveler).filter(
        (m) => m.kind === 'photo'
      )
      let chosen = null
      if (t.heroStopId) {
        chosen = mems.find((m) => m.stopId === t.heroStopId) || null
      }
      if (!chosen) chosen = mems[0] || null
      if (!chosen) continue
      const refs = chosen.photoRefs?.length
        ? chosen.photoRefs
        : chosen.photoRef
          ? [chosen.photoRef]
          : []
      const url = refs[0]?.url
      if (url) map.set(t.id, thumbUrl(url, 600))
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traveler, trips.length])

  return (
    <div
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        minHeight: '100vh',
        paddingBottom: 120,
      }}
    >
      <div
        style={{
          padding: '60px 18px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Eyebrow color="var(--muted)">THE JACKSON FAMILY</Eyebrow>
        <button
          type="button"
          onClick={onNewTrip}
          style={{
            // 44px min-height matches Apple HIG touch target; was 32px
            // (6+12+12+text) which lands just under the threshold and
            // makes mistypes easy next to the "⋯" overflow. See
            // KNOWN_BUGS_HELEN_SURFACE.md P3.2.
            minHeight: 44,
            padding: '6px 14px',
            borderRadius: 22,
            border: '1px solid var(--text)',
            background: 'transparent',
            color: 'var(--text)',
            fontSize: 12,
            fontFamily: 'Inter Tight, system-ui, sans-serif',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
          }}
        >
          <Plus size={12} /> New trip
        </button>
      </div>

      <div style={{ padding: '8px 18px 12px' }}>
        <div
          style={{
            fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
            fontSize: 38,
            fontWeight: 700,
            lineHeight: 0.95,
            letterSpacing: '-0.02em',
            color: 'var(--text)',
          }}
        >
          Trips
        </div>
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 14,
            fontStyle: 'italic',
            color: 'var(--muted)',
            marginTop: 6,
          }}
        >
          An archive, and a planning surface for what comes next.
        </div>
      </div>

      <Hairline color="var(--text)" style={{ margin: '0 18px' }} />

      <div style={{ padding: '0 18px' }}>
        {current.map((trip, i) => {
          const isFirst = i === 0
          return (
            <div key={trip.id}>
              {!isFirst && <Hairline color="var(--text)" style={{ margin: '14px 0' }} />}
              <TripCard
                trip={trip}
                memoryCount={liveCounts.get(trip.id) || 0}
                heroPhotoUrl={heroPhotoUrls.get(trip.id) || null}
                onOpen={() => onOpenTrip(trip.id)}
                isFirst={isFirst}
                animDelay={i}
              />
            </div>
          )
        })}

        {archives.map(({ year, count, months }) => (
          <div key={year} style={{ marginTop: 36 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                padding: '4px 0 10px',
              }}
            >
              <Eyebrow color="var(--muted)" weight={700}>
                ARCHIVE · {year}
              </Eyebrow>
              <Eyebrow color="var(--faint, var(--muted))">
                {count} TRIP{count === 1 ? '' : 'S'}
              </Eyebrow>
            </div>
            <Hairline color="var(--text)" />
            {months.map((month) => (
              <div key={month.key} style={{ marginTop: 18 }}>
                <Eyebrow
                  color="var(--muted)"
                  weight={600}
                  style={{ display: 'block', padding: '2px 0 8px' }}
                >
                  {month.label.toUpperCase()}
                </Eyebrow>
                {month.trips.map((trip, i) => (
                  <div key={trip.id}>
                    {i > 0 && <Hairline color="var(--text)" style={{ margin: '14px 0' }} />}
                    <TripCard
                      trip={trip}
                      memoryCount={liveCounts.get(trip.id) || 0}
                      heroPhotoUrl={heroPhotoUrls.get(trip.id) || null}
                      onOpen={() => onOpenTrip(trip.id)}
                      isFirst={false}
                      animDelay={current.length + i}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Today + current year are read once when the module loads, which is
// fine for a PWA that lives weeks at a time — the list re-groups itself
// whenever the trip array changes anyway.
const TODAY_ISO = new Date().toISOString().slice(0, 10)
const CURRENT_YEAR = new Date().getFullYear()

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function tripYear(t) {
  // Prefer the end date when both are present so multi-day trips that
  // straddle a year boundary archive into the year they ended.
  const startYear = parseInt((t.dateRangeStart || '').slice(0, 4), 10)
  const endYear = parseInt((t.dateRangeEnd || '').slice(0, 4), 10)
  return endYear || startYear || CURRENT_YEAR
}

// Month index (0–11) a trip files under within its archive year. Keyed
// off the start date (fallback end) per spec, so a trip reads under the
// month it began. null when no date is pinned.
function archiveMonth(t) {
  const src = t.dateRangeStart || t.dateRangeEnd || ''
  const m = parseInt(src.slice(5, 7), 10)
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : null
}

function isUpcomingOrActive(t) {
  // No end date → treat as upcoming so freshly-created planning trips
  // sit at the top until dates firm up.
  if (!t.dateRangeEnd) return true
  return t.dateRangeEnd >= TODAY_ISO
}

// An explicit archive (Helen's "Mark as archived" action, which stamps
// archivedAt) belongs in the archive regardless of date. The legacy
// seed `status: 'archived'` is intentionally NOT treated as explicit —
// those trips group by date like everything else, preserving the
// existing layout.
function isExplicitlyArchived(t) {
  return !!t.archivedAt
}

function groupTrips(trips) {
  const current = []
  const archived = []
  for (const t of trips) {
    if (isExplicitlyArchived(t)) {
      archived.push(t)
    } else if (tripYear(t) === CURRENT_YEAR) {
      current.push(t)
    } else {
      archived.push(t)
    }
  }
  // Current year: upcoming/active first (soonest start), then past
  // (most recent end first). Beats the old status-based sort which
  // pinned every "planning" trip above every "archived" one regardless
  // of date, leaving last month's trip on top of next week's.
  current.sort((a, b) => {
    const aUp = isUpcomingOrActive(a)
    const bUp = isUpcomingOrActive(b)
    if (aUp && !bUp) return -1
    if (!aUp && bUp) return 1
    if (aUp) return (a.dateRangeStart || '').localeCompare(b.dateRangeStart || '')
    return (b.dateRangeEnd || '').localeCompare(a.dateRangeEnd || '')
  })

  // Archive: year (newest first) → month (newest first), section
  // headers, newest trips first within each month.
  const byYear = new Map()
  for (const t of archived) {
    const y = tripYear(t)
    if (!byYear.has(y)) byYear.set(y, [])
    byYear.get(y).push(t)
  }
  const archives = Array.from(byYear.keys())
    .sort((a, b) => b - a)
    .map((year) => {
      const yearTrips = byYear.get(year)
      const byMonth = new Map()
      for (const t of yearTrips) {
        const m = archiveMonth(t)
        const key = m == null ? 'undated' : m
        if (!byMonth.has(key)) byMonth.set(key, [])
        byMonth.get(key).push(t)
      }
      for (const arr of byMonth.values()) {
        arr.sort((a, b) => (b.dateRangeEnd || '').localeCompare(a.dateRangeEnd || ''))
      }
      const months = Array.from(byMonth.keys())
        .sort((a, b) => {
          if (a === 'undated') return 1
          if (b === 'undated') return -1
          return b - a
        })
        .map((mk) => ({
          key: `${year}-${mk}`,
          label: mk === 'undated' ? 'Undated' : MONTH_NAMES[mk],
          trips: byMonth.get(mk),
        }))
      return { year, count: yearTrips.length, months }
    })

  return { current, archives }
}

// Shared hero <img> styling. Extracted verbatim from the original
// inline literal so the explicit-hero arm renders byte-identical DOM to
// before (its visual baseline must NOT move — the §0 protected path),
// and the heroPhotoUrl / heroResolved arms match it exactly.
const HERO_IMG_STYLE = {
  width: '100%',
  aspectRatio: '16 / 9',
  borderRadius: 10,
  marginTop: 12,
  objectFit: 'cover',
  display: 'block',
}

// Stable per-trip hash → deterministic floor gradient angle. NOT
// Math.random: a per-render random would reflow the floor on every
// paint and flap the visual baselines. Same id → same angle, forever.
function hashTripId(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// §4 FLOOR — the guaranteed last-resort hero. A themed, in-DOM block
// (zero network, can never 404) keyed off the active traveler palette:
// --card/--bg/--accent/--text are already per-traveler themed in
// themes.css, so the floor reads correctly on Helen's linen and
// Jonathan's Kottke-dark alike. Renders only when a trip has no explicit
// hero, no memory photo, and no worker-resolved photo (pending / failed /
// no-match per §6). This is what replaced the old `: null` branch, so a
// trip card is NEVER blank and the deleted diagonal placeholder can
// never return. See CARRYOVER_TRIP_HERO_PLAN §4/§6.
function TripCardFloor({ trip }) {
  // Deterministic gradient angle + a single faint serif monogram (the
  // trip title's first letter, drop-cap style). DELIBERATELY no title or
  // location text: the card already renders the title (above the hero)
  // and the location (below it), so repeating either here would (a) be
  // redundant, and (b) duplicate queryable text — getByText('<title>')
  // would resolve to two nodes and break strict-mode locators
  // (reconcile-archive.spec relies on exactly one). The block is purely
  // decorative, so it's aria-hidden — the enclosing card button already
  // carries the title for assistive tech.
  const angle = 115 + (hashTripId(trip.id || trip.title || '') % 5) * 12
  const monogram = ((trip.title || 'T').trim().charAt(0) || 'T').toUpperCase()
  return (
    <div
      aria-hidden="true"
      style={{
        ...HERO_IMG_STYLE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(${angle}deg, var(--card) 0%, var(--bg) 100%)`,
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 92,
          fontWeight: 700,
          lineHeight: 1,
          color: 'var(--text)',
          opacity: 0.14,
          userSelect: 'none',
        }}
      >
        {monogram}
      </span>
    </div>
  )
}

function TripCard({ trip, memoryCount, heroPhotoUrl, onOpen, isFirst, animDelay }) {
  // Date-derived status so a 'planning' trip auto-flips to 'live' on
  // its start date and 'archived' after its end date — no need to
  // edit trips.js when the calendar moves. Single source of truth in
  // data/trips.js#effectiveStatus, shared with RafaView.
  const status = effectiveStatus(trip)
  const statusLabel =
    status === 'live'
      ? '● LIVE'
      : status === 'archived'
        ? 'ARCHIVED'
        : '● IN PLANNING'
  const statusColor = status === 'archived' ? 'var(--muted)' : 'var(--accent-text)'
  const startCity = (trip.startCity || '').toUpperCase()
  const endCity = (trip.endCity || '').toUpperCase()
  // For genuine A→B road trips, render the route. For trips that
  // anchor at one place (a weekend in NYC, a volleyball tournament at
  // Mohegan Sun) the route notation reads as road-trip energy when the
  // trip isn't really one — so a per-trip locationLabel override wins.
  const locationLabel = trip.locationLabel
    ? trip.locationLabel.toUpperCase()
    : `${startCity} → ${endCity}`
  const dayCount = trip.days?.length || 0
  const titleLines = (trip.title || '').split(/[—:]/).map((s) => s.trim())

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`fade-up d${Math.min(animDelay + 1, 6)}`}
      style={{
        width: '100%',
        background: 'transparent',
        border: 0,
        padding: '14px 0',
        cursor: 'pointer',
        color: 'inherit',
        textAlign: 'left',
        display: 'block',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <Eyebrow color={statusColor} weight={600}>
          {statusLabel}
        </Eyebrow>
        <Eyebrow color="var(--muted)">
          {(trip.dateRange || '').toUpperCase()}
        </Eyebrow>
      </div>
      <div
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 24,
          fontWeight: 700,
          lineHeight: 1.05,
          marginTop: 6,
          color: 'var(--text)',
        }}
      >
        {titleLines.length > 1 ? (
          <>
            {titleLines[0]}
            <br />
            {titleLines.slice(1).join(' — ')}
          </>
        ) : (
          trip.title
        )}
      </div>
      {trip.subtitle && (
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--muted)',
            marginTop: 4,
          }}
        >
          {trip.subtitle}
        </div>
      )}

      {/* Hero precedence (highest → lowest), CARRYOVER_TRIP_HERO_PLAN §0/§4:
          1. explicit heroImage  — Jonathan's choice, PROTECTED, untouched
          2. heroPhotoUrl        — the family's own photo tagged to the
                                    trip's heroStopId (existing editorial anchor)
          3. heroResolved.url    — the worker-resolved Places destination hero
          4. <TripCardFloor>     — the themed floor (replaces the old `: null`;
                                    can never 404, so a card is never blank).
          The placeholder is gone: there is no branch that renders nothing. */}
      {hasExplicitHero(trip) ? (
        <img src={trip.heroImage} alt={trip.title} loading="lazy" style={HERO_IMG_STYLE} />
      ) : heroPhotoUrl ? (
        <img src={heroPhotoUrl} alt={trip.title} loading="lazy" style={HERO_IMG_STYLE} />
      ) : trip.heroResolved?.url ? (
        <img src={trip.heroResolved.url} alt={trip.title} loading="lazy" style={HERO_IMG_STYLE} />
      ) : (
        <TripCardFloor trip={trip} />
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 10,
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
          }}
        >
          <AvatarStack ids={trip.travelers || []} size={isFirst ? 20 : 18} />
          <Eyebrow color="var(--muted)">
            {locationLabel}
          </Eyebrow>
        </div>
        <Eyebrow color="var(--accent-text)" weight={600}>
          {memoryCount} {memoryCount === 1 ? 'MEMORY' : 'MEMORIES'}
          {!isFirst && dayCount > 0 ? ` · ${dayCount} DAYS` : ''}
        </Eyebrow>
      </div>
    </button>
  )
}

function Eyebrow({ children, color, weight = 500, style }) {
  return (
    <span
      style={{
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontWeight: weight,
        color: color || 'currentColor',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

function Hairline({ color, style }) {
  return (
    <div
      style={{
        height: 1,
        background: color || 'currentColor',
        opacity: 0.18,
        ...style,
      }}
    />
  )
}
