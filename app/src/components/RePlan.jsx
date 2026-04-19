import { useEffect, useMemo, useState } from 'react'
import { curatedByRegion } from '../data/curatedStops'
import { evaluateStop } from '../utils/scoreStop'
import { recentMealCategories } from '../utils/actualLog'
import { listAllFlags } from '../utils/riskWatch'
import { LOCATIONS, computeRoute, fmtTime } from '../utils/driveTime'
import { FAMILY } from '../data/preferences'
import { wazeUrl, appleMapsUrl } from '../utils/navLinks'

const SITUATIONS = [
  { k: 'none', l: "Everything's fine — give me options" },
  { k: 'running-late', l: 'Running late' },
  { k: 'need-food', l: 'Need food' },
  { k: 'need-run-around', l: 'Need run-around for Rafa' },
  { k: 'stop-closed', l: 'Stop canceled / closed' },
  { k: 'weather', l: 'Weather' },
]

const FAMILY_KEYS = Object.keys(FAMILY)

export function RePlan({ activePerson }) {
  const [origin, setOrigin] = useState('wvwc')
  const [destination, setDestination] = useState('elizabethton')
  const [atTime, setAtTime] = useState(defaultNow())
  const [situation, setSituation] = useState('none')
  const [family, setFamily] = useState([...FAMILY_KEYS])
  const [need, setNeed] = useState('meal')       // meal | photo | activity | run-around
  const [recentMeals, setRecentMeals] = useState([
    // Friday Apr 17 dinner was Savona's — Italian.
    { name: "Savona's Hudson", notes: 'Italian', date: '2026-04-17' },
  ])
  const [riskFlags, setRiskFlags] = useState([])

  // On mount, hydrate recent meals + risk flags from IndexedDB (last 2 days).
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    recentMealCategories(today, 2).then((list) => {
      if (list?.length) setRecentMeals(list)
    }).catch(() => { /* offline / empty */ })
    listAllFlags().then(setRiskFlags).catch(() => setRiskFlags([]))
  }, [])

  const nowDate = fromInputValue(atTime)

  // Time-of-day context helps suggest meal vs activity.
  const hour = nowDate.getHours()
  const isDinnerWindow = hour >= 17 && hour <= 21
  const isLunchWindow = hour >= 11 && hour <= 14

  const candidates = useMemo(() => {
    const o = LOCATIONS[origin]
    // origin is always a valid LOCATIONS key (populated from the dropdown),
    // so curatedByRegion always has coords — no fallback branch needed.
    return curatedByRegion(o.lat, o.lng, 200)
      .filter((s) => {
        if (need === 'meal') return s.types?.includes('food')
        if (need === 'photo') return s.types?.includes('photo')
        if (need === 'run-around') return s.types?.includes('energy')
        return true
      })
  }, [origin, need])

  const ranked = useMemo(() => {
    const requireMeal = need === 'meal'
    const evaluated = candidates.map((c) => evaluateStop(c, {
      familyPresent: family,
      recentMeals,
      nowDate,
      situation: situation === 'none' ? null : situation,
      requireMeal,
      riskFlags,
    }))
    evaluated.sort((a, b) => {
      if (a.hardVeto !== b.hardVeto) return a.hardVeto ? 1 : -1
      return b.score - a.score
    })
    return evaluated
  }, [candidates, family, recentMeals, nowDate.getTime(), situation, need])

  // Schedule / risk: compute arrival with remaining route + selected stops.
  const schedule = useMemo(() => {
    return computeRoute({
      from: origin,
      to: destination,
      departure: nowDate,
      stops: [], // start bare; user can layer accepted alternatives later.
      buffer: 'realistic',
    })
  }, [origin, destination, nowDate.getTime()])

  return (
    <>
      <div className="trip-card">
        <h3>Re-plan my day</h3>
        <p className="sub">
          Right now, from where you are, to where you need to be tonight. This replaces chat.
        </p>
        <div className="form-row">
          <label>
            I'm at
            <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
              {Object.keys(LOCATIONS).map((k) => (
                <option key={k} value={k}>{LOCATIONS[k].name}</option>
              ))}
            </select>
          </label>
          <label>
            Ending in
            <select value={destination} onChange={(e) => setDestination(e.target.value)}>
              {Object.keys(LOCATIONS).map((k) => (
                <option key={k} value={k}>{LOCATIONS[k].name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Current time
            <input
              type="datetime-local"
              value={atTime}
              onChange={(e) => setAtTime(e.target.value)}
            />
          </label>
          <label>
            What changed
            <select value={situation} onChange={(e) => setSituation(e.target.value)}>
              {SITUATIONS.map((s) => (
                <option key={s.k} value={s.k}>{s.l}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Looking for
            <select value={need} onChange={(e) => setNeed(e.target.value)}>
              <option value="meal">Meal</option>
              <option value="photo">Photo / drive-by</option>
              <option value="run-around">Run-around</option>
              <option value="activity">Activity</option>
            </select>
          </label>
          <label>
            Who's in play
            <FamilyPicker active={family} onChange={setFamily} />
          </label>
        </div>
        <p className="sub">
          {isDinnerWindow && need === 'meal' && 'Dinner window. '}
          {isLunchWindow && need === 'meal' && 'Lunch window. '}
          Novelty context: last 48h meals — {recentMeals.length
            ? recentMeals.map((m) => m.name).join(', ')
            : '(none logged)'}
        </p>
      </div>

      <div className="trip-card">
        <h3>Updated schedule</h3>
        {schedule.error ? (
          <p className="err">{schedule.error}</p>
        ) : (
          <>
            <div className="drive-leg">
              <span><strong>Drive remaining</strong></span>
              <span>{fmtH(schedule.pureDriveMin)}</span>
            </div>
            <div className="drive-leg">
              <span><strong>Arrive at {LOCATIONS[destination].name}</strong></span>
              <span>
                {fmtTime(schedule.arriveAt, schedule.toTz)}
                {schedule.tzDelta !== 0 && <span className="muted"> ({schedule.fromTz}→{schedule.toTz})</span>}
              </span>
            </div>
            <div className={`verdict ${schedule.verdict === "don't" ? 'dont' : schedule.verdict}`}>
              {schedule.verdict.toUpperCase()} — {schedule.reasoning}
            </div>
            <RiskFlags schedule={schedule} ranked={ranked} situation={situation} />
          </>
        )}
      </div>

      <div className="trip-card">
        <h3>Alternatives</h3>
        <p className="sub">
          Ranked by who they serve. Every pick names specific family members and why.
          Hard vetoes (chain, closed, dietary) are surfaced and de-ranked, not hidden.
        </p>
        {ranked.length === 0 && <p className="muted">No candidates in region.</p>}
        {ranked.slice(0, 6).map((ev) => (
          <AltCard key={ev.stop.id} ev={ev} activePerson={activePerson} />
        ))}
      </div>
    </>
  )
}

function RiskFlags({ schedule, ranked, situation }) {
  const flags = []
  // Barber closes 6 PM CT — flag if arrival past 5 PM CT with Barber still to go.
  const arriveCT = schedule.arriveAt
  const arriveHour = arriveCT.getHours()
  if (schedule.toTz === 'CT' && arriveHour >= 18) {
    flags.push(`Arriving after 6 PM ${schedule.toTz} — Barber would already be closed.`)
  }
  if (schedule.longestStretchH > 3) {
    flags.push(`Longest stretch is ${schedule.longestStretchH.toFixed(1)}h — break it up.`)
  }
  if (situation === 'running-late') {
    flags.push('Running late — drop the 30-min-or-less stops first, keep the anchor.')
  }
  if (flags.length === 0) {
    return <p className="muted" style={{ marginTop: 8 }}>No risks flagged.</p>
  }
  return (
    <div style={{ marginTop: 10 }}>
      {flags.map((f, i) => <div className="risk-flag" key={i}>{f}</div>)}
    </div>
  )
}

function AltCard({ ev, activePerson }) {
  const { stop } = ev
  return (
    <article className={`replan-alt ${ev.hardVeto ? 'hard-veto' : ''}`}>
      <div className="replan-alt-head">
        <div className="replan-alt-name">{stop.name}</div>
        <div className="replan-alt-meta">
          {stop.offHwyMin != null && `${stop.offHwyMin} min off hwy · `}
          {stop.dwellMin != null && `${stop.dwellMin}m stop`}
        </div>
      </div>
      <div className="replan-alt-serves">
        {Object.entries(ev.hooks).map(([p, reason]) => (
          <span key={p} className="replan-alt-serve" title={reason}>
            {cap(p)}
          </span>
        ))}
      </div>
      {Object.entries(ev.hooks).slice(0, 3).map(([p, reason]) => (
        <div key={p} className="replan-alt-hook">
          <strong>{cap(p)}:</strong> {reason}
        </div>
      ))}
      <div className={`replan-alt-novelty ${ev.novelty}`}>
        Novelty: {ev.novelty === 'fresh' ? 'fresh' : 'REPEAT of recent meal'}
      </div>
      {ev.vetoes.length > 0 && (
        <div className="replan-alt-veto">
          {ev.vetoes.map((v, i) => (
            <div key={i}>⚠ {v.msg}</div>
          ))}
        </div>
      )}
      <div className="replan-alt-actions">
        {stop.address && (
          <a href={wazeUrl(stop)} target="_blank" rel="noopener">Waze</a>
        )}
        {stop.address && (
          <a href={appleMapsUrl(stop.address)} target="_blank" rel="noopener">Apple Maps</a>
        )}
        {stop.phone && <a href={`tel:${stop.phone.replace(/[^\d+]/g, '')}`}>{stop.phone}</a>}
      </div>
      <details className="replan-alt-why">
        <summary>Why this ranking (score {ev.score})</summary>
        <ul style={{ paddingLeft: 18, margin: '6px 0 0' }}>
          {ev.reasons.map((r, i) => (
            <li key={i}><strong>{r.person}:</strong> {r.reason}</li>
          ))}
        </ul>
      </details>
      {stop.note && <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{stop.note}</div>}
    </article>
  )
}

function FamilyPicker({ active, onChange }) {
  const toggle = (k) => {
    if (active.includes(k)) onChange(active.filter((x) => x !== k))
    else onChange([...active, k])
  }
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {FAMILY_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className={active.includes(k) ? 'btn-primary' : 'btn-secondary'}
          style={{ padding: '6px 10px', fontSize: 12 }}
          onClick={() => toggle(k)}
        >
          {cap(k)}
        </button>
      ))}
    </div>
  )
}

function defaultNow() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromInputValue(s) {
  if (!s) return new Date()
  return new Date(s)
}

function fmtH(min) {
  const h = Math.floor(min / 60)
  const m = Math.round(min - h * 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function cap(s) { return s[0].toUpperCase() + s.slice(1) }
