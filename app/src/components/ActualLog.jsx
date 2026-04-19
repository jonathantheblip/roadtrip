import { useEffect, useState } from 'react'
import {
  addStop, updateStop, deleteStop, getAllStops, getAllDays, putDay,
  exportDaysToMarkdown,
} from '../utils/actualLog'
import { AudioMemo } from './AudioMemo'

const TYPES = [
  { k: 'meal', l: 'Meal' },
  { k: 'activity', l: 'Activity' },
  { k: 'gas', l: 'Gas' },
  { k: 'drive-by', l: 'Drive-by / Photo' },
  { k: 'overnight', l: 'Overnight' },
  { k: 'other', l: 'Other' },
]

function todayIso() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function nowHHMM() {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function pad(n) { return n.toString().padStart(2, '0') }

export function ActualLog({ seeded }) {
  const [stops, setStops] = useState([])
  const [days, setDays] = useState([])
  const [tick, setTick] = useState(0)
  const [editing, setEditing] = useState(null)       // stop id being edited
  const [expandedDay, setExpandedDay] = useState(null)
  const [exportOutput, setExportOutput] = useState('')

  useEffect(() => {
    if (!seeded) return
    let active = true
    Promise.all([getAllStops(), getAllDays()]).then(([s, d]) => {
      if (!active) return
      setStops(s); setDays(d)
    })
    return () => { active = false }
  }, [seeded, tick])

  const refresh = () => setTick((t) => t + 1)

  const byDate = stops.reduce((acc, s) => {
    (acc[s.date] ||= []).push(s)
    return acc
  }, {})

  const dateKeys = Array.from(
    new Set([...Object.keys(byDate), ...days.map((d) => d.date)])
  ).sort()

  const handleExport = async () => {
    const md = await exportDaysToMarkdown(dateKeys)
    setExportOutput(md)
    try {
      await navigator.clipboard.writeText(md)
    } catch { /* clipboard may be blocked */ }
  }

  return (
    <>
      <div className="trip-card">
        <h3>Add a stop</h3>
        <p className="sub">
          Name, time, notes. Everything else optional. Under 15 seconds at a light.
        </p>
        <AddStopForm onAdded={refresh} />
      </div>

      <div className="trip-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <h3 style={{ margin: 0 }}>Trip log</h3>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExport}
          >
            Export markdown
          </button>
        </div>
        {dateKeys.length === 0 && (
          <p className="muted">No stops yet. Add one above.</p>
        )}
        {dateKeys.map((date) => {
          const day = days.find((d) => d.date === date)
          const dayStops = byDate[date] || []
          const isOpen = expandedDay === date || dateKeys.length <= 2
          return (
            <div className="log-day" key={date}>
              <button
                type="button"
                className="log-day-header"
                style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left' }}
                onClick={() => setExpandedDay(isOpen ? null : date)}
              >
                {humanDate(date)}{' '}
                {day?.totalDrivingHours != null && (
                  <span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    · ~{day.totalDrivingHours}h driving
                  </span>
                )}
              </button>
              {isOpen && (
                <>
                  {dayStops.map((s) => (
                    <LogStop
                      key={s.id}
                      stop={s}
                      isEditing={editing === s.id}
                      onEdit={() => setEditing(s.id)}
                      onCancelEdit={() => setEditing(null)}
                      onSaved={() => { setEditing(null); refresh() }}
                      onDeleted={() => { setEditing(null); refresh() }}
                    />
                  ))}
                  <DayReflectionEditor day={day} date={date} onSaved={refresh} />
                  <AudioMemo date={date} />
                </>
              )}
            </div>
          )
        })}
        {exportOutput && (
          <>
            <h4 style={{ margin: '12px 0 6px' }}>Markdown (also copied to clipboard)</h4>
            <pre className="export-output">{exportOutput}</pre>
          </>
        )}
      </div>
    </>
  )
}

function AddStopForm({ onAdded }) {
  const [name, setName] = useState('')
  const [time, setTime] = useState(nowHHMM())
  const [type, setType] = useState('activity')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(todayIso())

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    await addStop({
      name: name.trim(),
      arrivalTime: time,
      type,
      date,
      location: location.trim(),
      notes: notes.trim(),
    })
    setName(''); setNotes(''); setLocation('')
    setTime(nowHHMM())
    onAdded?.()
  }

  return (
    <form onSubmit={submit}>
      <div className="form-row">
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Box Office Brewery"
            required
          />
        </label>
        <label>
          Time
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t.k} value={t.k}>{t.l}</option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      <div className="form-row">
        <label style={{ flex: '1 1 100%' }}>
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, state"
          />
        </label>
      </div>
      <div className="form-row">
        <label style={{ flex: '1 1 100%' }}>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened. Who ate. What worked."
          />
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary">Add stop</button>
      </div>
    </form>
  )
}

function LogStop({ stop, isEditing, onEdit, onCancelEdit, onSaved, onDeleted }) {
  const [time, setTime] = useState(stop.arrivalTime || '')
  const [name, setName] = useState(stop.name)
  const [notes, setNotes] = useState(stop.notes)
  const [type, setType] = useState(stop.type)

  const save = async () => {
    await updateStop(stop.id, { arrivalTime: time, name, notes, type })
    onSaved?.()
  }
  const del = async () => {
    if (!confirm('Delete this stop?')) return
    await deleteStop(stop.id)
    onDeleted?.()
  }

  if (!isEditing) {
    return (
      <div className="log-stop">
        <div className="log-stop-time">{stop.arrivalTime || '—'}</div>
        <div className="log-stop-body">
          <div className="log-stop-name">{stop.name}</div>
          <div className="log-stop-meta">
            <span className="log-stop-tag">{stop.type}</span>
            {stop.location}
            {stop.wasPlanned && <span className="log-stop-tag" style={{ marginLeft: 6 }}>planned</span>}
          </div>
          {stop.notes && <div className="log-stop-notes">{stop.notes}</div>}
          {stop.servedWhom?.length > 0 && (
            <div className="log-stop-meta"><em>Served: {stop.servedWhom.join(', ')}</em></div>
          )}
          <div className="log-stop-actions">
            <button type="button" className="btn-secondary" onClick={onEdit}>Edit</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="log-stop">
      <div className="log-stop-time">
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div className="log-stop-body">
        <div className="form-row">
          <label style={{ flex: '1 1 100%' }}>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.k} value={t.k}>{t.l}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label style={{ flex: '1 1 100%' }}>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={save}>Save</button>
          <button type="button" className="btn-secondary" onClick={onCancelEdit}>Cancel</button>
          <button type="button" className="btn-danger" onClick={del}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function DayReflectionEditor({ day, date, onSaved }) {
  const [reflection, setReflection] = useState(day?.reflection || '')
  const [totalHours, setTotalHours] = useState(day?.totalDrivingHours ?? '')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setReflection(day?.reflection || '')
    setTotalHours(day?.totalDrivingHours ?? '')
  }, [day?.reflection, day?.totalDrivingHours])

  const save = async () => {
    const totalH = totalHours === '' ? null : Number(totalHours)
    await putDay({
      date,
      departureLocation: day?.departureLocation || '',
      overnightLocation: day?.overnightLocation || '',
      totalDrivingHours: isNaN(totalH) ? null : totalH,
      reflection,
    })
    setEditing(false)
    onSaved?.()
  }

  if (!editing) {
    return (
      <div className="log-stop" style={{ borderTop: '1px dashed var(--border)' }}>
        <div className="log-stop-time muted">Reflect</div>
        <div className="log-stop-body">
          {day?.reflection ? (
            <div className="log-reflection">{day.reflection}</div>
          ) : (
            <div className="muted">No reflection yet.</div>
          )}
          <div className="log-stop-actions">
            <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
              {day?.reflection ? 'Edit reflection' : 'Add reflection'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="log-stop">
      <div className="log-stop-time muted">Reflect</div>
      <div className="log-stop-body">
        <div className="form-row">
          <label>
            Total driving (hours)
            <input
              type="number"
              step="0.5"
              value={totalHours}
              onChange={(e) => setTotalHours(e.target.value)}
            />
          </label>
        </div>
        <div className="form-row">
          <label style={{ flex: '1 1 100%' }}>
            Reflection — what worked, what we learned
            <textarea
              rows={6}
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
            />
          </label>
        </div>
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={save}>Save</button>
          <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function humanDate(iso) {
  try {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    })
  } catch { return iso }
}
