import { useState } from 'react'
import { ChevronLeft, Clock, MapPin, ExternalLink, Bed, Key, Phone, Ticket, Hash, Copy, Wifi, ClipboardCheck, Route } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import { tripHomeBase } from '../data/trips'
import { mapsLink, scenicMapsLink } from '../lib/mapsLink'
import { isStayTrip, stayPlaceCoords } from '../lib/tripShape'
import { FlightStatus } from './FlightStatus'
import { DayChips } from './DayChips'
import { ThreadedMemories } from '../components/ThreadedMemories'
import { LeaveWhenModal, leaveWhenDefaultForStop } from '../components/LeaveWhenModal'

// "Get directions" for a check-in / check-out stop on a STAY must point at the
// trip's OWN lodging — not whatever address the stop itself happens to carry.
// Live bug (2026-07-01): an "Arrive" stop's own address was just the city
// ("Provincetown, MA", no street number), so mapsLink's full-address heuristic
// rejected it and fell back to a vague city search; a "Depart"-type stop can
// carry an even more misleading address (the day-level `lodging` field flips
// to "— (home)" on checkout day in some trips, per isLodgingStop below —
// pointing "directions" at the family's home city instead of the stay).
// `trip.lodging.address` is the one blessed, always-correct source for where
// the family is actually staying (tripShape.stayPlaceCoords reads the same
// field) — prefer it for any stop that's plainly ABOUT that lodging, rather
// than trusting a per-stop address that may be stale, vague, or home-shaped.
function lodgingAwareStop(trip, stop) {
  const kind = stop?.kind
  const isLodgingKind = kind === 'lodging' || kind === 'arrival' || kind === 'departure'
  if (isLodgingKind && isStayTrip(trip) && trip?.lodging?.address) {
    return { ...stop, address: trip.lodging.address }
  }
  return stop
}

function urlLabel(stop) {
  const ticketKinds = new Set(['theater', 'show', 'concert', 'tour', 'arrival', 'departure'])
  if (ticketKinds.has(stop.kind)) return 'Tickets'
  if (stop.kind === 'tournament' || stop.kind === 'duty') return 'Schedule'
  if (/^breakfast|lunch|dinner|brunch|snack$/i.test(stop.kind)) return 'Menu'
  return 'Open link'
}

// Stop detail. Memories live in the ThreadedMemories component (Design
// Direction 02 — collaborative thread per stop with text / voice /
// photo composer at the bottom). `dark` flips the page surface to
// charcoal/cream so it matches Jonathan / Rafa / dark-mode Helen.
// Embedded panels (flight, lodging) react to the surface via CSS.
export function StopDetail({ trip, day, stop, traveler, dark, onBack, onOpenDay }) {
  const [leaveOpen, setLeaveOpen] = useState(false)
  // "Getting there" needs an ORIGIN. On a STAY the origin is the place you're
  // staying (its lodging coords) — where tripHomeBase deliberately doesn't look,
  // since a stay keeps coords on trip.lodging, not homeBase; without this the
  // affordance never appeared on the very trips where a short walk matters most.
  // A route trip keeps the home-base origin (the drive-home anchor).
  const gettingThereOrigin =
    (isStayTrip(trip) && stayPlaceCoords(trip)) || tripHomeBase(trip)
  const canLeaveWhen =
    !!gettingThereOrigin &&
    Number.isFinite(stop?.lat) &&
    Number.isFinite(stop?.lng) &&
    stop.kind !== 'lodging'
  const leaveWhenDefault = leaveWhenDefaultForStop(stop, day)
  return (
    <div className={`min-h-screen pb-32 ${dark ? 'surface-dark' : 'surface-light'}`}>
      {onOpenDay && (
        <DayChips days={trip.days} activeDayN={day.n} onJump={onOpenDay} />
      )}
      <header className="px-6 pt-6 pb-6 border-b surface-rule">
        <button
          onClick={onBack}
          className="link-quiet flex items-center gap-1 f-dm text-xs opacity-70"
          style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, marginBottom: 24 }}
          type="button"
        >
          <ChevronLeft size={14} /> Day {day.n} · {day.title}
        </button>
        <p className="f-mono text-[10px] tt-widest uppercase opacity-50 mb-1">
          {stop.time} · {stop.kind}
        </p>
        <h1 className="f-news tt-tightest text-5xl leading-95 mb-4">{stop.name}</h1>
        {stop.for?.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <span className="smallcaps f-dm text-[11px] opacity-60">For</span>
            {stop.for.map((t) => (
              <span key={t} className="inline-flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: TRAVELER_DOT[t] }}
                />
                <span className="f-dm text-xs opacity-70">{TRAVELERS[t]?.name}</span>
              </span>
            ))}
          </div>
        )}
        <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
          {stop.address && (
            <a
              className="btn-pill"
              href={mapsLink(lodgingAwareStop(trip, stop), traveler)}
              target="_blank"
              rel="noreferrer"
            >
              <MapPin size={12} />
              {TRAVELERS[traveler]?.maps === 'waze' ? 'Open in Waze' : 'Open in Maps'}
            </a>
          )}
          {(() => {
            // Multi-stop scenic routes always go through Google Maps —
            // Waze can't chain two intermediate waypoints from a URL, and
            // Apple Maps can't chain any at all. Surfaces alongside the
            // direct-route button so anyone in a hurry can still go straight
            // there.
            const scenic = scenicMapsLink(stop)
            if (!scenic) return null
            const count = stop.waypoints?.length || 0
            return (
              <a className="btn-pill" href={scenic} target="_blank" rel="noreferrer">
                <Route size={12} />
                Scenic route · {count} stop{count === 1 ? '' : 's'}
              </a>
            )
          })()}
          {stop.url && (
            <a className="btn-pill" href={stop.url} target="_blank" rel="noreferrer">
              <ExternalLink size={12} />
              {urlLabel(stop)}
            </a>
          )}
          {canLeaveWhen && (
            <button
              type="button"
              className="btn-pill"
              onClick={() => setLeaveOpen(true)}
              style={{ cursor: 'pointer' }}
            >
              <Clock size={12} />
              Getting there
            </button>
          )}
        </div>
      </header>
      {leaveOpen && (
        <LeaveWhenModal
          destination={{ lat: stop.lat, lng: stop.lng }}
          destinationName={stop.name}
          defaultOrigin={gettingThereOrigin}
          defaultTarget={leaveWhenDefault}
          traveler={traveler}
          onClose={() => setLeaveOpen(false)}
        />
      )}

      {stop.image && (
        <figure className="px-6 pt-6">
          {stop.imageUrl ? (
            <a
              href={stop.imageUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${stop.name} listing`}
            >
              <img
                src={stop.image}
                alt={stop.name}
                style={{
                  width: '100%',
                  borderRadius: 8,
                  display: 'block',
                }}
              />
            </a>
          ) : (
            <img
              src={stop.image}
              alt={stop.name}
              style={{
                width: '100%',
                borderRadius: 8,
                display: 'block',
              }}
            />
          )}
        </figure>
      )}

      <section className="px-6 py-8 border-b surface-rule">
        <p
          className="f-news text-lg leading-relaxed opacity-80 max-w-prose"
          style={{ whiteSpace: 'pre-line' }}
        >
          {renderNoteWithLinks(
            traveler === 'helen' && stop.helenNote ? stop.helenNote : stop.note
          )}
        </p>
      </section>

      {(stop.reservation || stop.confirmation || stop.phone) && (
        <section className="px-6 py-6 border-b surface-rule">
          <p className="smallcaps f-dm text-[11px] opacity-60 mb-3">Logistics</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stop.reservation && (
              <div className="flex items-start gap-2">
                <Ticket size={14} className="opacity-60" style={{ marginTop: 2, flexShrink: 0 }} />
                <p className="f-news text-base leading-snug">{stop.reservation}</p>
              </div>
            )}
            {stop.confirmation && (
              <div className="flex items-start gap-2">
                <Hash size={14} className="opacity-60" style={{ marginTop: 2, flexShrink: 0 }} />
                <p className="f-mono text-sm leading-snug" style={{ letterSpacing: '0.04em' }}>
                  {stop.confirmation}
                </p>
              </div>
            )}
            {stop.phone && (
              <a
                className="link-quiet flex items-center gap-2 f-news text-base"
                href={`tel:${String(stop.phone).replace(/[^\d+]/g, '')}`}
              >
                <Phone size={14} className="opacity-60" style={{ flexShrink: 0 }} />
                {stop.phone}
              </a>
            )}
          </div>
        </section>
      )}

      {stop.flightNumber && (
        <section className="px-6 py-6 border-b surface-rule">
          <FlightStatus
            stop={stop}
            variant="panel"
            framing={traveler === 'jonathan' ? 'your' : 'their'}
            traveler={traveler}
          />
        </section>
      )}

      {isLodgingStop(trip, day, stop) && (
        <section className="px-6 py-6 border-b surface-rule">
          <LodgingPanel lodging={trip.lodging} />
        </section>
      )}

      <section className="px-6 py-8">
        <ThreadedMemories trip={trip} stop={stop} traveler={traveler} />
      </section>
    </div>
  )
}

// Match a stop against the trip's lodging record. Surfaces the rich
// lodging panel (check-in/out times, Buzzmein portal) whenever the user
// taps into a lodging stop on a day that lists the trip lodging.
function isLodgingStop(trip, day, stop) {
  if (!trip?.lodging || stop.kind !== 'lodging') return false
  const lodgingName = trip.lodging.name
  if (!lodgingName) return false
  // Day-level join: every NYC day's `lodging` field is "Murray Hill Airbnb"
  // until checkout day, where it becomes "— (home)". Match on that to
  // decide whether the trip-level lodging applies to this stop.
  return day?.lodging === lodgingName
}

function LodgingPanel({ lodging }) {
  return (
    <div className="embed-panel">
      <div className="flex items-center gap-2 mb-3">
        <Bed size={14} />
        <p className="smallcaps f-dm text-[11px] opacity-70">{lodging.name}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="f-mono text-[9px] tt-widest uppercase opacity-50">Check in</p>
          <p className="f-news text-base leading-tight">{lodging.checkIn || '—'}</p>
        </div>
        <div>
          <p className="f-mono text-[9px] tt-widest uppercase opacity-50">Check out</p>
          <p className="f-news text-base leading-tight">{lodging.checkOut || '—'}</p>
        </div>
      </div>
      {lodging.notes && (
        <p className="f-dm text-sm opacity-70 leading-relaxed mb-3">{lodging.notes}</p>
      )}
      {(lodging.keypadCode || lodging.keypadCode === '') && (
        <CopyField
          icon={<Key size={12} />}
          label="Keypad code"
          value={lodging.keypadCode}
          placeholder="Coming Thursday"
        />
      )}
      {(lodging.wifiSsid || lodging.wifiPassword || lodging.wifiPassword === '') && (
        <CopyField
          icon={<Wifi size={12} />}
          label={lodging.wifiSsid ? `Wi-Fi · ${lodging.wifiSsid}` : 'Wi-Fi password'}
          value={lodging.wifiPassword}
          placeholder="Coming Thursday"
        />
      )}
      {lodging.checkoutChecklist?.length > 0 && (
        <CheckoutChecklist items={lodging.checkoutChecklist} />
      )}
      {lodging.portalUrl && (
        <a
          className="btn-pill"
          href={lodging.portalUrl}
          target="_blank"
          rel="noreferrer"
        >
          <Key size={12} />
          Buzzmein guest portal
        </a>
      )}
    </div>
  )
}

// One-tap copy of a short string (Wi-Fi password, keypad code). The
// label sits to the left, the value to the right; tapping the whole row
// copies and flashes a tiny "copied" confirmation in the corner. When
// the value is empty, the row renders as a quiet placeholder so the
// surface is ready for the host to drop the value in later.
function CopyField({ icon, label, value, placeholder }) {
  const [copied, setCopied] = useState(false)
  const trimmed = (value || '').trim()
  const hasValue = trimmed.length > 0

  async function handleCopy() {
    if (!hasValue) return
    try {
      await navigator.clipboard.writeText(trimmed)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // Older Safari fallbacks via a hidden input. Rare on modern iOS,
      // but harmless if it never runs.
      try {
        const el = document.createElement('input')
        el.value = trimmed
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      } catch {
        /* swallow */
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!hasValue}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '10px 12px',
        marginBottom: 8,
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--card, transparent)',
        color: 'inherit',
        cursor: hasValue ? 'pointer' : 'default',
        textAlign: 'left',
      }}
      aria-label={`Copy ${label}`}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ display: 'inline-flex', opacity: 0.7 }}>{icon}</span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span
            className="f-mono"
            style={{
              fontSize: 9,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              opacity: 0.55,
            }}
          >
            {label}
          </span>
          <span
            className="f-news"
            style={{
              fontSize: 16,
              lineHeight: 1.15,
              marginTop: 2,
              opacity: hasValue ? 1 : 0.5,
              fontStyle: hasValue ? 'normal' : 'italic',
              userSelect: 'all',
              wordBreak: 'break-all',
            }}
          >
            {hasValue ? trimmed : placeholder}
          </span>
        </span>
      </span>
      <span
        className="f-mono"
        style={{
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          opacity: hasValue ? 0.8 : 0.35,
          color: copied ? 'var(--accent-text)' : 'inherit',
        }}
      >
        {copied ? <ClipboardCheck size={12} /> : <Copy size={12} />}
        {copied ? 'COPIED' : 'COPY'}
      </span>
    </button>
  )
}

// Parse a small subset of markdown — just inline `[text](url)` links —
// out of a stop note so we can write the listing URL into the prose
// without a bespoke field per stop. Newlines are handled by the
// `whiteSpace: pre-line` style on the surrounding paragraph, so the
// data stays readable as a string.
function renderNoteWithLinks(note) {
  if (!note) return null
  const tokens = []
  const re = /\[([^\]]+)\]\(([^)]+)\)/g
  let i = 0
  let m
  while ((m = re.exec(note)) !== null) {
    if (m.index > i) tokens.push({ kind: 'text', value: note.slice(i, m.index) })
    tokens.push({ kind: 'link', text: m[1], url: m[2] })
    i = m.index + m[0].length
  }
  if (i < note.length) tokens.push({ kind: 'text', value: note.slice(i) })
  return tokens.map((t, idx) =>
    t.kind === 'link' ? (
      <a
        key={idx}
        href={t.url}
        target="_blank"
        rel="noreferrer"
        style={{
          color: 'inherit',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          textDecorationThickness: '1px',
          textUnderlineOffset: 3,
        }}
      >
        {t.text}
      </a>
    ) : (
      <span key={idx}>{t.value}</span>
    )
  )
}

function CheckoutChecklist({ items }) {
  return (
    <div style={{ marginTop: 4, marginBottom: 8 }}>
      <p
        className="f-mono"
        style={{
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          opacity: 0.55,
          marginBottom: 6,
        }}
      >
        Checkout
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((item, i) => (
          <li
            key={i}
            className="f-news"
            style={{
              fontSize: 13.5,
              lineHeight: 1.4,
              padding: '6px 0',
              borderBottom: i < items.length - 1 ? '1px dashed var(--border)' : 'none',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              opacity: 0.85,
            }}
          >
            <span
              className="f-mono"
              style={{
                fontSize: 10,
                opacity: 0.5,
                paddingTop: 2,
                flexShrink: 0,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
