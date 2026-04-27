import { useEffect, useState, useCallback } from 'react'
import { Plane, RefreshCw, ExternalLink } from 'lucide-react'
import { getFlightStatus, airlineStatusUrl, formatStatusLabel } from '../lib/flightStatus'

// Two render modes:
//   variant="pill"   → compact inline pill (used inside stop cards)
//   variant="panel"  → full panel (used at the top of the day's themed
//                      view and on the StopDetail screen)
//
// `framing` controls the title:
//   "their"  → "Jonathan's flight" (Helen / Aurelia / Rafa)
//   "your"   → "Your flight" (Jonathan)
export function FlightStatus({ stop, variant = 'pill', framing = 'their', traveler = null }) {
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
  }, [stop.flightNumber, stop.flightDate])

  const statusLabel = formatStatusLabel(data) || 'SCHEDULED'
  const fallbackUrl = airlineStatusUrl(stop.flightNumber)
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

function statusColor(label) {
  if (!label) return '#1A1614'
  if (label.startsWith('DELAYED') || label === 'CANCELLED') return '#8B2B1F'
  if (label === 'LANDED') return '#8A7F73'
  return '#1A1614'
}

function PillBody({ stop, statusLabel, live, fallbackUrl }) {
  return (
    <a
      href={fallbackUrl}
      target="_blank"
      rel="noreferrer"
      className="link-quiet inline-flex items-center gap-2 px-3 py-1 rounded-full"
      style={{
        background: 'rgba(26,22,20,0.06)',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: statusColor(statusLabel),
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
  const heading = framing === 'your' ? 'Your flight' : 'Jonathan’s flight'
  return (
    <div
      className="rounded-sm p-4"
      style={{ border: '1px solid #DDD3C2', background: '#FBF8F2' }}
    >
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
            color: statusColor(statusLabel),
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
            airline status <ExternalLink size={11} />
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
      if (stop.flightNumber && (stop.kind === 'arrival' || stop.kind === 'departure')) {
        return { stop, day }
      }
    }
  }
  return null
}
