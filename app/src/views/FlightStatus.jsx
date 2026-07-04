import { useEffect, useState, useCallback } from 'react'
import { Plane, RefreshCw, ExternalLink } from 'lucide-react'
import { getFlightStatus, flightAwareUrl, formatStatusLabel } from '../lib/flightStatus'
import { flightSegments, flightLayovers, isMultiSegmentFlight, segmentDayDelta, flightSummaryLine } from '../lib/flightSegments'

// Two render modes:
//   variant="pill"   → compact inline pill (used inside stop cards)
//   variant="panel"  → full panel (used at the top of the day's themed
//                      view and on the StopDetail screen)
//
// `framing` controls the title:
//   "their"  → "Jonathan's flight" (Helen / Aurelia / Rafa)
//   "your"   → "Your flight" (Jonathan)
//
// A CONNECTION (design 03 §5: "legs with their own zones… layovers are
// explicit") skips live tracking entirely — FlightAware is keyed on one
// flightNumber/flightDate pair, so it stays exactly what it's always been:
// a SINGLE flight's live status. A multi-segment stop instead renders the
// static itinerary — each segment its own time + airport, honest "+N day",
// layovers between — which is the data actually on hand for a connection.
// A single-segment (or legacy flat-field) stop is BYTE-IDENTICAL to before.
export function FlightStatus({ stop, variant = 'pill', framing = 'their', traveler = null }) {
  const multi = isMultiSegmentFlight(stop)
  const [data, setData] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchedAt, setFetchedAt] = useState(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const next = await getFlightStatus(stop.flightNumber, stop.flightDate)
    setData(next)
    setFetchedAt(new Date())
    setRefreshing(false)
  }, [stop.flightNumber, stop.flightDate])

  useEffect(() => {
    if (multi || !stop.flightNumber) return
    let cancel = false
    ;(async () => {
      const next = await getFlightStatus(stop.flightNumber, stop.flightDate)
      if (!cancel) {
        setData(next)
        setFetchedAt(new Date())
      }
    })()
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multi, stop.flightNumber, stop.flightDate])

  if (multi) {
    return variant === 'pill'
      ? <ConnectionPill stop={stop} />
      : <ConnectionPanel stop={stop} framing={framing} />
  }

  const statusLabel = formatStatusLabel(data) || 'SCHEDULED'
  const fallbackUrl = flightAwareUrl(stop.flightNumber)
  const live = !!data

  if (variant === 'pill') {
    return (
      <PillBody
        stop={stop}
        statusLabel={statusLabel}
        live={live}
        fallbackUrl={fallbackUrl}
      />
    )
  }
  return (
    <PanelBody
      stop={stop}
      data={data}
      statusLabel={statusLabel}
      framing={framing}
      live={live}
      refreshing={refreshing}
      fetchedAt={fetchedAt}
      onRefresh={refresh}
      fallbackUrl={fallbackUrl}
    />
  )
}

// The compact inline pill for a connection — no live tracking, just the
// condensed itinerary line ("9:35 PM BOS → 2:20 PM FCO +1 Sun · 1 stop FRA").
function ConnectionPill({ stop }) {
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full"
      style={{
        background: 'rgba(128, 128, 128, 0.12)',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}
    >
      <Plane size={11} />
      <span>{flightSummaryLine(stop)}</span>
    </span>
  )
}

// The full panel for a connection — "In The Plan" (design 03 §5): each
// segment its own time + zone, layovers explicit, no collapsed clock.
function ConnectionPanel({ stop, framing }) {
  const segs = flightSegments(stop)
  const layovers = flightLayovers(stop)
  const heading = framing === 'your' ? 'Your flight' : 'The flight'
  return (
    <div className="embed-panel">
      <div className="flex items-center gap-2 mb-2">
        <Plane size={14} />
        <p className="smallcaps f-dm text-[11px] opacity-70">{heading}</p>
        <p className="f-mono text-[10px] opacity-50" style={{ marginLeft: 'auto' }}>
          {segs.length - 1} STOP{segs.length - 1 === 1 ? '' : 'S'}
        </p>
      </div>
      {segs.map((seg, i) => {
        const delta = segmentDayDelta(seg)
        return (
          <div key={i}>
            <div className="flex items-baseline justify-between" style={{ marginTop: i ? 10 : 0 }}>
              <p className="f-news text-lg tt-tight leading-tight">
                {seg.flightNo}
                {seg.from.code && (
                  <>
                    <span className="opacity-50" style={{ margin: '0 8px' }}>·</span>
                    {seg.from.code}
                    <span className="opacity-50" style={{ margin: '0 6px' }}>→</span>
                    {seg.to.code}
                  </>
                )}
              </p>
            </div>
            <p className="f-dm text-[12px] opacity-70 mt-1">
              {seg.dep.local && `Departs ${seg.dep.local}`}
              {seg.dep.local && seg.arr.local && ' · '}
              {seg.arr.local && `Lands ${seg.arr.local}${delta ? ` +${delta}` : ''}`}
              {!seg.dep.local && !seg.arr.local && 'Time not entered yet'}
            </p>
            {i < layovers.length && layovers[i]?.code && (
              <p className="f-mono text-[10px] opacity-50 mt-2" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Layover {layovers[i].code}{Number.isFinite(layovers[i].mins) ? ` · ${Math.floor(layovers[i].mins / 60)}h${layovers[i].mins % 60 ? `${layovers[i].mins % 60}m` : ''}` : ''}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Status pill color. Inherits surface color (currentColor) for the default
// "scheduled" state so it works on both light and dark surfaces; oxblood
// for problems, an opacity-faded inherit for landed/historical.
function statusStyle(label) {
  if (!label) return { color: 'currentColor' }
  if (label.startsWith('DELAYED') || label === 'CANCELLED') {
    return { color: '#C0573F' } // oxblood — passes contrast on both palettes
  }
  if (label === 'LANDED') return { color: 'inherit', opacity: 0.55 }
  return { color: 'currentColor' }
}

function PillBody({ stop, statusLabel, live, fallbackUrl }) {
  return (
    <a
      href={fallbackUrl}
      target="_blank"
      rel="noreferrer"
      className="link-quiet inline-flex items-center gap-2 px-3 py-1 rounded-full"
      style={{
        background: 'rgba(128, 128, 128, 0.12)',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        ...statusStyle(statusLabel),
      }}
    >
      <Plane size={11} />
      <span>{stop.flightNumber}</span>
      <span style={{ opacity: 0.5 }}>·</span>
      <span>{stop.scheduledArrivalLocal || stop.time}</span>
      <span style={{ opacity: 0.5 }}>·</span>
      <span>{statusLabel}</span>
      {!live && <ExternalLink size={10} style={{ opacity: 0.5 }} />}
    </a>
  )
}

function PanelBody({
  stop,
  data,
  statusLabel,
  framing,
  live,
  refreshing,
  fetchedAt,
  onRefresh,
  fallbackUrl,
}) {
  // "Your flight" when you're the viewer it's framed for; otherwise the honest
  // neutral "The flight" — NOT a hardcoded "Jonathan's flight" (the flier isn't
  // modeled per-stop, and on a trip where someone else flies that attribution
  // was simply wrong). Per-flier naming ("Helen's flight") is a follow-up that
  // needs the flier carried on the stop.
  const heading = framing === 'your' ? 'Your flight' : 'The flight'
  return (
    <div className="embed-panel">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Plane size={14} />
          <p className="smallcaps f-dm text-[11px] opacity-70">{heading}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="link-quiet inline-flex items-center gap-1 f-mono"
          style={{
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            opacity: refreshing ? 0.5 : 0.7,
            padding: 0,
          }}
        >
          <RefreshCw size={11} /> refresh
        </button>
      </div>
      <div className="flex items-baseline justify-between">
        <p className="f-news text-2xl tt-tight leading-tight">
          {stop.flightNumber}
          <span className="opacity-50" style={{ margin: '0 8px' }}>
            ·
          </span>
          {stop.flightOrigin}
          <span className="opacity-50" style={{ margin: '0 6px' }}>
            →
          </span>
          {stop.flightDest}
        </p>
        <span
          className="f-mono"
          style={{
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            ...statusStyle(statusLabel),
          }}
        >
          {statusLabel}
        </span>
      </div>
      <p className="f-dm text-[12px] opacity-70 mt-2">
        Scheduled {stop.scheduledArrivalLocal || stop.time}
        {data?.actualArrival
          ? ` · landed ${new Date(data.actualArrival).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}`
          : ''}
        {data?.destination?.gate ? ` · gate ${data.destination.gate}` : ''}
        {data?.destination?.baggage ? ` · bag ${data.destination.baggage}` : ''}
      </p>
      <div className="flex items-center justify-between mt-3">
        <p className="f-mono text-[10px] opacity-50">
          {live
            ? fetchedAt
              ? `live · synced ${fetchedAt.toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}`
              : 'live'
            : 'no live feed yet'}
        </p>
        {!live && (
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noreferrer"
            className="link-quiet inline-flex items-center gap-1 f-mono"
            style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase' }}
          >
            FlightAware <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  )
}

// Helper: pull the first arrival stop from a trip with a flightNumber.
// Used by views to surface the panel before the daily content.
export function findArrivalStop(trip) {
  for (const day of trip.days || []) {
    for (const stop of day.stops || []) {
      if (flightSegments(stop).length && (stop.kind === 'arrival' || stop.kind === 'departure')) {
        return { stop, day }
      }
    }
  }
  return null
}
