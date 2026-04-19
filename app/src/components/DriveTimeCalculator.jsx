import { useMemo, useState } from 'react'
import {
  LOCATIONS, BUFFER_OPTIONS, computeRoute, fmtTime,
} from '../utils/driveTime'

function defaultDeparture() {
  const d = new Date()
  d.setMinutes(d.getMinutes() + 15, 0, 0)
  return d
}

function toInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromInputValue(s) {
  if (!s) return new Date()
  return new Date(s)
}

export function DriveTimeCalculator() {
  const [from, setFrom] = useState('elizabethton')
  const [to, setTo] = useState('meridian')
  const [departure, setDeparture] = useState(toInputValue(defaultDeparture()))
  const [stops, setStops] = useState([
    { locationKey: 'knoxville', durationMin: 45, name: "Yassin's — lunch" },
    { locationKey: 'chattanooga', durationMin: 75, name: 'Hunter Museum' },
    { locationKey: 'leeds', durationMin: 120, name: 'Barber' },
  ])
  const [buffer, setBuffer] = useState('realistic')

  const keys = useMemo(
    () => Object.keys(LOCATIONS).sort((a, b) => LOCATIONS[a].name.localeCompare(LOCATIONS[b].name)),
    []
  )

  const result = useMemo(
    () => computeRoute({
      from,
      to,
      departure: fromInputValue(departure),
      stops,
      buffer,
    }),
    [from, to, departure, stops, buffer]
  )

  const updateStop = (idx, patch) => {
    setStops((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const addStop = () => {
    setStops((arr) => [...arr, { locationKey: keys[0], durationMin: 30, name: '' }])
  }

  const removeStop = (idx) => {
    setStops((arr) => arr.filter((_, i) => i !== idx))
  }

  return (
    <>
      <div className="trip-card">
        <h3>Time Check</h3>
        <p className="sub">
          "Can we make {LOCATIONS[to]?.name || '—'} by 8 PM?" — built for that.
          Offline math. Dial the buffer.
        </p>
        <div className="form-row">
          <label>
            From
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              {keys.map((k) => (
                <option key={k} value={k}>{LOCATIONS[k].name}</option>
              ))}
            </select>
          </label>
          <label>
            To
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              {keys.map((k) => (
                <option key={k} value={k}>{LOCATIONS[k].name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Departure
            <input
              type="datetime-local"
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
            />
          </label>
          <label>
            Buffer
            <select value={buffer} onChange={(e) => setBuffer(e.target.value)}>
              {BUFFER_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        <h4 style={{ margin: '14px 0 6px' }}>Stops in between</h4>
        <div className="stops-editor">
          {stops.map((s, i) => (
            <div className="stop-row" key={i}>
              <select
                value={s.locationKey}
                onChange={(e) => updateStop(i, { locationKey: e.target.value })}
              >
                {keys.map((k) => (
                  <option key={k} value={k}>{LOCATIONS[k].name}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Name"
                value={s.name}
                onChange={(e) => updateStop(i, { name: e.target.value })}
                style={{ flex: '1 1 20%' }}
              />
              <input
                type="number"
                min={0}
                step={5}
                value={s.durationMin}
                onChange={(e) => updateStop(i, { durationMin: Number(e.target.value) || 0 })}
                style={{ width: 72, flex: '0 0 72px' }}
              />
              <button type="button" className="btn-danger" onClick={() => removeStop(i)}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={addStop}>+ Add stop</button>
        </div>
      </div>

      <div className="trip-card">
        <h3>Result</h3>
        {result.error ? (
          <p className="err">{result.error}</p>
        ) : (
          <RouteResult result={result} />
        )}
      </div>
    </>
  )
}

function RouteResult({ result }) {
  const arriveOriginTz = fmtTime(result.arriveAtOrigin, result.fromTz)
  const arriveDestTz = fmtTime(result.arriveAt, result.toTz)
  const tzNote = result.tzDelta !== 0
    ? ` (${result.fromTz}→${result.toTz}, ${result.tzDelta}m tz shift)`
    : ''

  return (
    <>
      <div className="drive-leg">
        <span><strong>Pure driving</strong></span>
        <span>{fmtH(result.pureDriveMin)}</span>
      </div>
      <div className="drive-leg">
        <span><strong>Door-to-door</strong></span>
        <span>{fmtH(result.doorToDoorMin)}</span>
      </div>
      <div className="drive-leg">
        <span><strong>Arrive</strong></span>
        <span>
          {arriveDestTz}{tzNote}
        </span>
      </div>
      <div className="drive-leg">
        <span><strong>Longest stretch</strong></span>
        <span>
          {fmtH(result.longestStretchH * 60)}
          {result.longestStretchH > 2.5 && <span className="drive-leg-flag">&gt; 2.5h</span>}
        </span>
      </div>

      <div className={`verdict ${result.verdict === "don't" ? 'dont' : result.verdict}`}>
        {result.verdict.toUpperCase()} — {result.reasoning}
      </div>

      <h4 style={{ margin: '14px 0 6px' }}>Legs</h4>
      {result.legs.map((l, i) => (
        <div className="drive-leg" key={i}>
          <span>
            {LOCATIONS[l.from].name} → {l.name}
            {l.dwellMin > 0 && <span className="muted"> ({l.dwellMin}m stop)</span>}
          </span>
          <span>
            {fmtH(l.driveMin)} · arr {fmtTime(l.arriveAt, result.fromTz)}
          </span>
        </div>
      ))}
    </>
  )
}

function fmtH(min) {
  const h = Math.floor(min / 60)
  const m = Math.round(min - h * 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
