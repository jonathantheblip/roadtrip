import { useWeatherPath } from '../hooks/useWeatherPath'
import './MondayWeatherCard.css'

// Monday Apr 20 weather-conditional path toggle.
// NWS forecast: 70% afternoon storms in the Ruston corridor after 1 PM CT.
// User picks dry or wet on arrival in the area (~5 PM CT). The Lincoln
// Parish Park stop dims/grays out if wet path is selected; schedule
// recalculates arrival times accordingly.

const DRY_TIMELINE = [
  ['7:00 AM', 'Depart Meridian'],
  ['9:15 AM', "Arrive Grandma's"],
  ['1:30 PM', 'Depart McComb + Donut Palace'],
  ['3:30 PM', 'Vicksburg murals (8 min)'],
  ['5:15 PM', 'Lincoln Parish Park (25 min)'],
  ['5:45 PM', 'Downtown Ruston murals (5 min)'],
  ['6:50 PM', 'Shreveport Dalmatian (10 min)'],
  ['8:40 PM', "Buc-ee's Terrell (25 min)"],
  ['~9:10 PM', "Arrive Aunt Donna's"],
]

const WET_TIMELINE = [
  ['7:00 AM', 'Depart Meridian'],
  ['9:15 AM', "Arrive Grandma's"],
  ['1:30 PM', 'Depart McComb + Donut Palace'],
  ['3:30 PM', 'Vicksburg murals — skip if heavy rain'],
  ['6:15 PM', 'Shreveport Dalmatian (15-20 min)'],
  ['8:10 PM', "Buc-ee's Terrell (30-35 min)"],
  ['~8:45 PM', "Arrive Aunt Donna's"],
]

export function MondayWeatherCard({ activePerson }) {
  const { path, setPath } = useWeatherPath()

  return (
    <aside className="mwx-card" aria-label="Monday weather-conditional path">
      <header className="mwx-header">
        <span className="mwx-eyebrow">Monday · weather-conditional</span>
        <h3>Ruston corridor — 70% afternoon storms</h3>
        <p className="mwx-sub">
          Pick on arrival (~5 PM CT). Not locked — switch paths any time.
        </p>
      </header>

      <div className="mwx-toggle" role="radiogroup" aria-label="Weather path">
        <button
          type="button"
          className={`mwx-pill ${path === 'dry' ? 'active' : ''}`}
          role="radio"
          aria-checked={path === 'dry'}
          onClick={() => setPath('dry')}
        >
          ☀️ Dry — take Ruston
        </button>
        <button
          type="button"
          className={`mwx-pill ${path === 'wet' ? 'active' : ''}`}
          role="radio"
          aria-checked={path === 'wet'}
          onClick={() => setPath('wet')}
        >
          🌧 Raining — skip to Shreveport
        </button>
        {path != null && (
          <button
            type="button"
            className="mwx-reset"
            onClick={() => setPath(null)}
            aria-label="Clear selection"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mwx-grid">
        <Timeline
          title="Dry path"
          rows={DRY_TIMELINE}
          active={path === 'dry'}
          dimmed={path === 'wet'}
        />
        <Timeline
          title="Wet path"
          rows={WET_TIMELINE}
          active={path === 'wet'}
          dimmed={path === 'dry'}
        />
      </div>

      {activePerson === 'jonathan' && (
        <details className="mwx-flex">
          <summary>Schedule slack</summary>
          <ul>
            <li>Vicksburg micro-stop is optional (saves 12 min).</li>
            <li>Downtown Ruston mural drive-through is optional (saves 5 min).</li>
            <li>Buc-ee's can compress from 25 to 15 min if needed.</li>
            <li>Grandma departure can flex ±15 min without breaking downstream.</li>
            <li>
              Schedule breaks only if Grandma departure slips past 2:00 PM CT —
              at that point, cut Vicksburg murals and compress Buc-ee's.
            </li>
          </ul>
        </details>
      )}
    </aside>
  )
}

function Timeline({ title, rows, active, dimmed }) {
  const classes = ['mwx-timeline']
  if (active) classes.push('mwx-timeline-active')
  if (dimmed) classes.push('mwx-timeline-dim')
  return (
    <div className={classes.join(' ')}>
      <div className="mwx-tl-title">{title}</div>
      <ul>
        {rows.map(([time, what]) => (
          <li key={time + what}>
            <span className="mwx-tl-time">{time}</span>
            <span className="mwx-tl-what">{what}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
