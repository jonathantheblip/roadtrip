import { useEffect, useMemo, useState } from 'react'
import { listAllFlags, addFlag, setResolved } from '../utils/riskWatch'
import { RISK_FLAG_TYPES } from '../data/riskFlags'
import { STOPS } from '../data/stops'
import { flagAppliesToStop, flagActiveOn } from '../utils/riskWatch'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function RiskWatch() {
  const [flags, setFlags] = useState([])
  const [tick, setTick] = useState(0)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    listAllFlags().then(setFlags).catch(() => setFlags([]))
  }, [tick])

  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const { activeToday, activeTomorrow, upcoming, resolved } = useMemo(() => {
    const today = flags.filter((f) => !f.resolved && flagActiveOn(f, now))
    const tom = flags.filter((f) => !f.resolved && !flagActiveOn(f, now) && flagActiveOn(f, tomorrow))
    const upcoming = flags.filter(
      (f) => !f.resolved && !flagActiveOn(f, now) && !flagActiveOn(f, tomorrow)
    )
    const res = flags.filter((f) => f.resolved)
    return { activeToday: today, activeTomorrow: tom, upcoming, resolved: res }
  }, [flags, now.toDateString()])

  const refresh = () => setTick((t) => t + 1)

  const handleResolve = async (id, v) => {
    await setResolved(id, v)
    refresh()
  }

  return (
    <>
      <div className="trip-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Risks & closures</h3>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? 'Cancel' : '+ Add flag'}
          </button>
        </div>
        <p className="sub">
          Every "X closed Mondays" footnote surfaced here so it fires when it matters,
          not after someone drives there.
        </p>
        {showAdd && <AddFlagForm onAdded={() => { setShowAdd(false); refresh() }} />}
      </div>

      <FlagGroup title="Active today" flags={activeToday} onResolve={handleResolve} />
      <FlagGroup title="Tomorrow" flags={activeTomorrow} onResolve={handleResolve} />
      <FlagGroup title="Upcoming / other" flags={upcoming} onResolve={handleResolve} />
      {resolved.length > 0 && (
        <FlagGroup title="Resolved" flags={resolved} onResolve={handleResolve} resolved />
      )}
    </>
  )
}

function FlagGroup({ title, flags, onResolve, resolved }) {
  if (!flags.length) return null
  return (
    <div className="trip-card">
      <h3>{title} ({flags.length})</h3>
      {flags.map((f) => {
        const attached = STOPS.filter((s) => flagAppliesToStop(f, s))
        return (
          <div key={f.id} className="risk-flag-row">
            <div className="risk-flag-subject">
              ⚠ {f.subject}
              <span className="risk-flag-type"> · {f.riskType}</span>
            </div>
            <div className="risk-flag-details">{f.details}</div>
            {f.appliesToDaysOfWeek?.length > 0 && (
              <div className="risk-flag-meta">
                Days: {f.appliesToDaysOfWeek.map((d) => DAY_NAMES[d]).join(', ')}
              </div>
            )}
            {attached.length > 0 && (
              <div className="risk-flag-meta">
                Attaches to: {attached.map((s) => s.name).join(', ')}
              </div>
            )}
            <div className="risk-flag-actions">
              {f.source && (
                <a href={f.source} target="_blank" rel="noopener">Source</a>
              )}
              <button
                type="button"
                className={resolved ? 'btn-secondary' : 'btn-primary'}
                onClick={() => onResolve(f.id, !resolved)}
                style={{ fontSize: 12, padding: '6px 10px' }}
              >
                {resolved ? 'Re-open' : 'Mark resolved'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AddFlagForm({ onAdded }) {
  const [subject, setSubject] = useState('')
  const [riskType, setRiskType] = useState('closed-weekday')
  const [details, setDetails] = useState('')
  const [source, setSource] = useState('')
  const [daysStr, setDaysStr] = useState('')
  const [keywordsStr, setKeywordsStr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!subject.trim()) return
    const appliesToDaysOfWeek = daysStr
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n >= 0 && n <= 6)
    const keywords = keywordsStr.split(',').map((k) => k.trim()).filter(Boolean)
    await addFlag({
      subject: subject.trim(),
      riskType,
      details: details.trim(),
      source: source.trim(),
      appliesToDaysOfWeek: appliesToDaysOfWeek.length ? appliesToDaysOfWeek : null,
      keywords: keywords.length ? keywords : [subject.trim().toLowerCase()],
    })
    onAdded?.()
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 8 }}>
      <div className="form-row">
        <label style={{ flex: '1 1 100%' }}>
          Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </label>
      </div>
      <div className="form-row">
        <label>
          Type
          <select value={riskType} onChange={(e) => setRiskType(e.target.value)}>
            {RISK_FLAG_TYPES.map((t) => <option key={t.k} value={t.k}>{t.l}</option>)}
          </select>
        </label>
        <label>
          Days (0-6, comma)
          <input
            value={daysStr}
            onChange={(e) => setDaysStr(e.target.value)}
            placeholder="e.g. 1 (Mon) or 0,1"
          />
        </label>
      </div>
      <div className="form-row">
        <label style={{ flex: '1 1 100%' }}>
          Details
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Source URL
          <input value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
        <label>
          Keywords (comma)
          <input
            value={keywordsStr}
            onChange={(e) => setKeywordsStr(e.target.value)}
            placeholder="e.g. sloss furnaces"
          />
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary">Add flag</button>
      </div>
    </form>
  )
}
