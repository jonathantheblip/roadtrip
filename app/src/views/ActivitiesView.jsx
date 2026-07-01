import { useMemo, useState } from 'react'
import { ChevronLeft, MapPin, Phone, Clock, AlertCircle, Sparkles, Link2 } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import { tripHomeBase } from '../data/trips'
import {
  getActivitiesForTrip,
  filterActivities,
  descriptionFor,
  drivingMinutesFor,
  groupByCategory,
  CATEGORY_LABEL,
  isClosedToday,
} from '../data/sideActivities'
import { computeOpenState, openStateColor } from '../lib/openState'
import { LeaveWhenModal } from '../components/LeaveWhenModal'
import { isStayTrip, stayPlaceCoords } from '../lib/tripShape'
import { WeCouldNearby } from './WeCouldNearby'
import { useProposals } from '../lib/proposals'
import { ProposalsBanner } from '../components/ProposalsBanner'
import { ProposeSheet } from '../components/ProposeSheet'

// Things to do — trip-scoped activity menu. Filter chips at the top
// (4 family members + Everyone, strict intersection); category-grouped
// card list below. Picks up whichever themed surface is active via
// CSS vars (linen for Helen, near-black for Rafa, etc.), so the same
// component reads correctly across all four traveler views.
//
// View vs filter (spec §5): the active `traveler` decides which
// description text renders inside each card; the chip selection
// decides which cards appear at all. They're independent — switching
// themed surfaces does not reset filter state within a session.
export function ActivitiesView({ trip, traveler, onBack, onOpenImport, onLocate }) {
  const activities = useMemo(
    () => getActivitiesForTrip(trip?.id, trip),
    [trip?.id, trip?.sharedActivities]
  )
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteDraft, setPasteDraft] = useState('')

  // Propose → decide (slice 6): the family loop lives here, on the "We could…"
  // tab — where the ideas are. Gated to a stay (where the nearby tray runs); the
  // hook no-ops without a worker. `proposeSpot` drives the bottom-sheet.
  const proposalsOn = isStayTrip(trip)
  const { pending, accepted, propose, vote, decide } = useProposals(proposalsOn ? trip?.id : null)
  const [proposeSpot, setProposeSpot] = useState(null)

  // Default: Everyone on. Gives an immediate full view; chip
  // toggling narrows the list. State is local to this mount —
  // closing/reopening the view starts fresh, matching the spec's
  // "not persisted across sessions" rule.
  const [selected, setSelected] = useState(
    () => new Set(['jonathan', 'helen', 'aurelia', 'rafa'])
  )

  function toggleMember(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleEveryone() {
    setSelected((prev) => {
      const allOn =
        prev.has('jonathan') &&
        prev.has('helen') &&
        prev.has('aurelia') &&
        prev.has('rafa')
      return allOn ? new Set() : new Set(['jonathan', 'helen', 'aurelia', 'rafa'])
    })
  }

  const filtered = useMemo(
    () => filterActivities(activities, selected),
    [activities, selected]
  )
  const sections = useMemo(() => groupByCategory(filtered), [filtered])

  // On a STAY with coordinates, the "We could…" nearby tray leads — so a
  // brand-new trip with no curated list never opens to a blank page
  // (FAMILY_TRIPS_VISION §2/§3). When that tray is present, drop the
  // dead-end "No activities seeded" line; the tray speaks for the page.
  const nearbyEnabled = isStayTrip(trip) && !!stayPlaceCoords(trip)
  // "Getting there" origin: the stay place on a stay (its lodging coords), else
  // the trip's home base — so the affordance appears on stays too (tripHomeBase
  // deliberately ignores trip.lodging coords, which a stay relies on).
  const gettingThereOrigin =
    (isStayTrip(trip) && stayPlaceCoords(trip)) || tripHomeBase(trip)
  const subtitle =
    activities.length === 0
      ? nearbyEnabled
        ? ''
        : 'No activities seeded for this trip yet.'
      : activitiesSubtitle(trip)

  return (
    <div
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        minHeight: '100vh',
        paddingBottom: 120,
      }}
    >
      <header style={{ padding: 'calc(env(safe-area-inset-top) + 60px) 18px 6px' }}>
        <button
          onClick={onBack}
          type="button"
          style={{
            background: 'transparent',
            border: 0,
            padding: 0,
            cursor: 'pointer',
            color: 'var(--muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            opacity: 0.7,
            marginBottom: 18,
          }}
        >
          <ChevronLeft size={12} /> {trip?.title || 'Trip'}
        </button>
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
          {nearbyEnabled ? 'We could…' : 'Things to do'}
        </div>
        {subtitle && (
          <div
            style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--muted)',
              marginTop: 6,
            }}
          >
            {subtitle}
          </div>
        )}
      </header>

      {proposalsOn && (
        <ProposalsBanner
          pending={pending}
          accepted={accepted}
          traveler={traveler}
          onVote={vote}
          onDecide={decide}
        />
      )}

      <WeCouldNearby
        trip={trip}
        traveler={traveler}
        onPropose={proposalsOn ? setProposeSpot : undefined}
        onLocate={onLocate ? () => onLocate(trip) : undefined}
      />

      {proposeSpot && (
        <ProposeSheet
          spot={proposeSpot}
          traveler={traveler}
          onClose={() => setProposeSpot(null)}
          onSend={async ({ recipients, note }) => {
            await propose({ spotId: proposeSpot.id, spot: proposeSpot, recipients, note })
            setProposeSpot(null)
          }}
        />
      )}

      {onOpenImport && (
        <div style={{ padding: '14px 14px 0' }}>
          <button
            type="button"
            data-testid="open-share-in"
            onClick={() => setPasteOpen((v) => !v)}
            style={{
              width: '100%',
              padding: '12px 14px',
              background: 'transparent',
              border: '1px solid var(--accent)',
              borderRadius: 10,
              cursor: 'pointer',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            <Link2 size={14} style={{ color: 'var(--accent-text)' }} />
            Add from link
          </button>
          {pasteOpen && (
            <div
              data-testid="share-in-paste"
              style={{
                marginTop: 10,
                padding: '12px',
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: 'var(--card, transparent)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <label
                htmlFor="share-in-url"
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  opacity: 0.6,
                }}
              >
                Paste a Google or Apple Maps link
              </label>
              <input
                id="share-in-url"
                data-testid="share-in-url"
                type="url"
                value={pasteDraft}
                onChange={(e) => setPasteDraft(e.target.value)}
                placeholder="https://maps.app.goo.gl/…"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'transparent',
                  color: 'var(--text)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 12,
                }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-pill"
                  onClick={() => {
                    setPasteOpen(false)
                    setPasteDraft('')
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="share-in-go"
                  className="btn-pill"
                  disabled={!pasteDraft.trim()}
                  onClick={() => {
                    const url = pasteDraft.trim()
                    setPasteOpen(false)
                    setPasteDraft('')
                    onOpenImport?.(url)
                  }}
                  style={{
                    cursor: pasteDraft.trim() ? 'pointer' : 'not-allowed',
                    background: 'var(--accent)',
                    color: '#fff',
                    border: '1px solid var(--accent)',
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activities.length > 0 && (
        <FilterChips
          selected={selected}
          onToggle={toggleMember}
          onToggleEveryone={toggleEveryone}
        />
      )}

      <div style={{ padding: '8px 14px 0' }}>
        {activities.length === 0 ? null : selected.size === 0 ? (
          <EmptyState />
        ) : sections.length === 0 ? (
          <NoMatches />
        ) : (
          sections.map((section) => (
            <Section key={section.category} label={section.label}>
              {section.items.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  traveler={traveler}
                  homeBase={gettingThereOrigin}
                />
              ))}
            </Section>
          ))
        )}
      </div>
    </div>
  )
}

function FilterChips({ selected, onToggle, onToggleEveryone }) {
  const everyoneOn =
    selected.has('jonathan') &&
    selected.has('helen') &&
    selected.has('aurelia') &&
    selected.has('rafa')
  const ids = ['jonathan', 'helen', 'aurelia', 'rafa']
  return (
    <div style={{ padding: '14px 14px 6px' }}>
      <div
        style={{
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          opacity: 0.55,
          marginBottom: 8,
          paddingLeft: 4,
        }}
      >
        Filter who
      </div>
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        {ids.map((id) => {
          const on = selected.has(id)
          return (
            <button
              key={id}
              type="button"
              onClick={() => onToggle(id)}
              aria-pressed={on}
              style={{
                padding: '6px 12px',
                borderRadius: 14,
                border: '1px solid',
                // Use TRAVELER_DOT (Jonathan cobalt, Helen forest, Aurelia
                // pink, Rafa oxblood) to match the person-tag chips used in
                // StopDetail / ThreadedMemories / PostcardComposer.
                // TRAVELERS[id].color is a legacy integration-attribution
                // color, not the chip color.
                borderColor: on ? TRAVELER_DOT[id] || 'var(--accent)' : 'var(--border)',
                background: on ? TRAVELER_DOT[id] || 'var(--accent)' : 'transparent',
                color: on ? '#FBF8F2' : 'inherit',
                cursor: 'pointer',
                fontFamily: 'Inter Tight, system-ui, sans-serif',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.01em',
              }}
            >
              {TRAVELERS[id]?.name || id}
            </button>
          )
        })}
        <button
          type="button"
          onClick={onToggleEveryone}
          aria-pressed={everyoneOn}
          style={{
            padding: '6px 12px',
            borderRadius: 14,
            border: '1px solid',
            borderColor: everyoneOn ? 'var(--text)' : 'var(--border)',
            background: everyoneOn ? 'var(--text)' : 'transparent',
            color: everyoneOn ? 'var(--bg)' : 'inherit',
            cursor: 'pointer',
            fontFamily: 'Inter Tight, system-ui, sans-serif',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.01em',
          }}
        >
          Everyone
        </button>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      style={{
        padding: '40px 18px',
        textAlign: 'center',
        fontFamily: 'Fraunces, Georgia, serif',
        fontStyle: 'italic',
        color: 'var(--muted)',
        fontSize: 16,
        lineHeight: 1.5,
      }}
    >
      Pick who's going to see what works for them.
    </div>
  )
}

function NoMatches() {
  return (
    <div
      style={{
        padding: '32px 18px',
        textAlign: 'center',
        fontFamily: 'Fraunces, Georgia, serif',
        fontStyle: 'italic',
        color: 'var(--muted)',
        fontSize: 15,
        lineHeight: 1.5,
      }}
    >
      Nothing on this list works for everyone you picked. Try fewer chips.
    </div>
  )
}

function Section({ label, children }) {
  return (
    <section style={{ marginTop: 18 }}>
      <div
        style={{
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          opacity: 0.65,
          padding: '0 4px 8px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 12,
          color: 'var(--text)',
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </section>
  )
}

function ActivityCard({ activity, traveler, homeBase }) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const description = descriptionFor(activity, traveler)
  const closed = isClosedToday(activity)
  const isShareIn = activity.source === 'share_in'
  const mapsUrl = mapsLinkForActivity(activity, traveler)
  const telHref = activity.phone ? `tel:${String(activity.phone).replace(/[^\d+]/g, '')}` : null
  // "Getting there" needs both an origin (the stay place / home base, passed as
  // homeBase) and a destination (the activity's lat/lng). If either is missing,
  // hide the affordance.
  const canLeaveWhen =
    !!homeBase &&
    Number.isFinite(activity?.lat) &&
    Number.isFinite(activity?.lng)

  function openMaps() {
    if (mapsUrl) window.open(mapsUrl, '_blank')
  }

  return (
    <article
      style={{
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--card, transparent)',
        overflow: 'hidden',
      }}
    >
      {activity.heroImage ? (
        <img
          src={activity.heroImage}
          alt={activity.name}
          style={{
            width: '100%',
            aspectRatio: '16 / 9',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <TypographicHeader activity={activity} />
      )}

      <div style={{ padding: '14px 14px 16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 8,
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              opacity: 0.55,
            }}
          >
            [{CATEGORY_LABEL[activity.category] || activity.category}]
          </span>
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              opacity: 0.6,
            }}
          >
            {(() => {
              const m = drivingMinutesFor(activity)
              return m != null ? `${m} MIN` : ''
            })()}
          </span>
        </div>

        <h3
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 19,
            fontWeight: 700,
            lineHeight: 1.18,
            margin: 0,
            color: 'var(--text)',
          }}
        >
          {activity.name}
        </h3>

        {isShareIn && (
          <div
            style={{
              marginTop: 6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--accent-text)',
              opacity: 0.85,
            }}
          >
            <Sparkles size={10} /> Added via share
          </div>
        )}

        {closed && <ClosedBanner />}

        <p
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 14.5,
            fontStyle: description ? 'italic' : 'normal',
            lineHeight: 1.5,
            color: description ? 'var(--text)' : 'var(--muted)',
            margin: '10px 0 0',
            opacity: description ? 0.95 : 0.7,
          }}
        >
          {description ||
            structuralFallback(activity)}
        </p>

        <HoursLine activity={activity} />

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 12,
          }}
        >
          {mapsUrl && (
            <button
              type="button"
              onClick={openMaps}
              className="btn-pill"
              style={{ cursor: 'pointer' }}
            >
              <MapPin size={12} />
              {TRAVELERS[traveler]?.maps === 'waze' ? 'Open in Waze' : 'Open in Maps'}
            </button>
          )}
          {canLeaveWhen && (
            <button
              type="button"
              onClick={() => setLeaveOpen(true)}
              className="btn-pill"
              style={{ cursor: 'pointer' }}
            >
              <Clock size={12} />
              Getting there
            </button>
          )}
          {telHref && (
            <a className="btn-pill" href={telHref}>
              <Phone size={12} />
              Call
            </a>
          )}
        </div>

        {activity.notes && (
          <NotesBlock
            notes={activity.notes}
            open={notesOpen}
            onToggle={() => setNotesOpen((o) => !o)}
          />
        )}
      </div>
      {leaveOpen && (
        <LeaveWhenModal
          destination={{ lat: activity.lat, lng: activity.lng }}
          destinationName={activity.name}
          defaultOrigin={homeBase}
          seedDurationMinutes={drivingMinutesFor(activity)}
          traveler={traveler}
          onClose={() => setLeaveOpen(false)}
        />
      )}
    </article>
  )
}

function TypographicHeader({ activity }) {
  // No hero image — render the activity name as the visual anchor in
  // the active theme's accent color so the card still has presence.
  return (
    <div
      style={{
        padding: '24px 16px 18px',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, transparent), transparent)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--accent-text)',
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {CATEGORY_LABEL[activity.category] || activity.category}
      </div>
      <div
        style={{
          fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
          fontSize: 26,
          lineHeight: 1.05,
          fontWeight: 700,
          color: 'var(--text)',
          letterSpacing: '-0.015em',
        }}
      >
        {activity.name}
      </div>
    </div>
  )
}

function HoursLine({ activity }) {
  // Prefer the live computed state when Places gave us structured
  // periods. Falls back to the human-curated `activity.hours` string
  // when no structured data is available.
  const hasStructured = Array.isArray(activity?.hoursStructured?.periods)
    && activity.hoursStructured.periods.length > 0
  const state = computeOpenState(activity)

  // Nothing to render at all if there's neither structured data nor a
  // free-text hours string.
  if (!hasStructured && !activity.hours) return null

  // "Call to confirm" still fires when hours haven't been verified —
  // but only if we don't have structured Places data. If Places gave
  // us periods, we trust them and skip the confirm prompt.
  const showConfirm = activity.hoursVerified === false && !hasStructured

  const dotColor = openStateColor(state.status)
  const labelText = hasStructured ? state.label : (activity.hours || state.label)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        marginTop: 10,
        fontSize: 12.5,
        lineHeight: 1.4,
        color: 'var(--muted)',
      }}
    >
      {hasStructured ? (
        <span
          aria-hidden="true"
          title={`Status: ${state.status}`}
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: dotColor,
            marginTop: 5,
            flexShrink: 0,
          }}
        />
      ) : (
        <Clock size={12} style={{ marginTop: 3, flexShrink: 0, opacity: 0.7 }} />
      )}
      <span style={{ flex: 1 }}>{labelText}</span>
      {showConfirm && (
        <span
          title="Call to confirm — hours not verified for the trip dates"
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--accent-text)',
            fontWeight: 600,
          }}
        >
          <AlertCircle size={10} /> Call to confirm
        </span>
      )}
    </div>
  )
}

function ClosedBanner() {
  return (
    <div
      style={{
        marginTop: 10,
        padding: '8px 10px',
        borderRadius: 6,
        background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
        fontFamily: 'Fraunces, Georgia, serif',
        fontSize: 13.5,
        fontStyle: 'italic',
        color: 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <AlertCircle size={14} />
      Closed today
    </div>
  )
}

function NotesBlock({ notes, open, onToggle }) {
  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          color: 'var(--muted)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          fontWeight: 600,
          opacity: 0.8,
        }}
      >
        {open ? '— Notes ↑' : '+ Notes ↓'}
      </button>
      {open && (
        <p
          style={{
            marginTop: 6,
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--muted)',
            opacity: 0.9,
          }}
        >
          {notes}
        </p>
      )}
    </div>
  )
}

function structuralFallback(activity) {
  // Reader has no description — render a neutral one-liner from the
  // structural fields so the card still says something useful.
  const parts = []
  const m = drivingMinutesFor(activity)
  // "N min away" — mode-neutral. "N min drive" assumed a car on every trip; on a
  // stay/city trip the family may be walking or on transit, so don't assert a drive.
  if (m != null) parts.push(`${m} min away`)
  parts.push(CATEGORY_LABEL[activity.category] || activity.category)
  return parts.join(' · ')
}

// Subtitle under "Things to do". This app is for ALL family trips (city,
// beach, flights, museums) — not just the volleyball weekend — so the line
// can't hardcode "Around the tournament". Anchor it on the trip's own
// destination/title when we have one ("Around New York"), and fall back to
// generic copy that fits any trip otherwise.
export function activitiesSubtitle(trip) {
  const place = tripPlaceLabel(trip)
  return place
    ? `Around ${place} — filter by who needs what.`
    : 'Things nearby — filter by who needs what.'
}

// Best-effort short place name for the trip. Prefers an explicit
// `destination`, then a home-base label, then a city-ish first word of the
// subtitle. Returns '' when nothing reliable is available.
function tripPlaceLabel(trip) {
  const dest = typeof trip?.destination === 'string' ? trip.destination.trim() : ''
  if (dest) return dest
  const hbLabel = typeof trip?.homeBase?.label === 'string' ? trip.homeBase.label.trim() : ''
  // A home-base label is usually a full address; only use a clean, short
  // single token (e.g. a city name) — never a street address.
  if (hbLabel && !/\d/.test(hbLabel) && !hbLabel.includes(',') && hbLabel.length <= 24) {
    return hbLabel
  }
  return ''
}

function mapsLinkForActivity(activity, travelerId) {
  if (activity?.lat == null || activity?.lng == null) return null
  if (TRAVELERS[travelerId]?.maps === 'waze') {
    return `https://waze.com/ul?ll=${activity.lat},${activity.lng}&navigate=yes`
  }
  return `https://maps.apple.com/?q=${encodeURIComponent(
    activity.name || ''
  )}&ll=${activity.lat},${activity.lng}`
}
