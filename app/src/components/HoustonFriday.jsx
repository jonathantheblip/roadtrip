import { useState } from 'react'
import { HOUSTON_FRIDAY } from '../data/kennedale'
import './HoustonFriday.css'

export function HoustonFriday() {
  const [activeOption, setActiveOption] = useState('a')
  const option = HOUSTON_FRIDAY.options.find((o) => o.key === activeOption)

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

      <div className="option-toggle" role="tablist" aria-label="Schedule option">
        {HOUSTON_FRIDAY.options.map((opt) => {
          const isActive = activeOption === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`option-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveOption(opt.key)}
            >
              <span className="option-btn-title">{opt.title}</span>
              <span className="option-btn-subtitle">{opt.subtitle}</span>
            </button>
          )
        })}
      </div>

      <div className="option-panel" key={activeOption}>
        <div className="option-condition">{option.condition}</div>
        <table className="schedule">
          <tbody>
            {option.schedule.map((row, i) => (
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

      <p className="houston-footer">{HOUSTON_FRIDAY.footer}</p>
    </article>
  )
}
