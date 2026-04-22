import { HOUSTON_FRIDAY } from '../data/kennedale'
import './HoustonFriday.css'

export function HoustonFriday() {
  return (
    <article className="houston-friday">
      <header className="houston-header">
        <h2 className="houston-title">
          {HOUSTON_FRIDAY.dayLabel} &mdash; {HOUSTON_FRIDAY.title}
        </h2>
        <p className="houston-subtitle">{HOUSTON_FRIDAY.subtitle}</p>
      </header>

      <p
        className="houston-intro"
        dangerouslySetInnerHTML={{ __html: HOUSTON_FRIDAY.intro }}
      />

      <div className="option-panel">
        <table className="schedule">
          <tbody>
            {HOUSTON_FRIDAY.schedule.map((row, i) => (
              <tr key={i}>
                <td className="schedule-time">{row.time}</td>
                <td className="schedule-text">
                  <span dangerouslySetInnerHTML={{ __html: row.text }} />
                  {row.bring && (
                    <div className="schedule-bring">
                      <span className="bring-label">Bring</span>
                      <span className="bring-text">{row.bring}</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan="2" className="flight-row">
                {HOUSTON_FRIDAY.flightText}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {HOUSTON_FRIDAY.bail && (
        <details className="bail-options">
          <summary>{HOUSTON_FRIDAY.bail.label}</summary>
          <ul>
            {HOUSTON_FRIDAY.bail.rows.map((r, i) => (
              <li key={i}>
                <strong>{r.trigger}:</strong> {r.pivot}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="houston-footer">{HOUSTON_FRIDAY.footer}</p>
    </article>
  )
}
