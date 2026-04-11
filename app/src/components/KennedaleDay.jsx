import { KENNEDALE_DAYS } from '../data/kennedale'
import './KennedaleDay.css'

export function KennedaleDay({ day }) {
  const data = KENNEDALE_DAYS[day]
  if (!data) return null

  return (
    <article className="kennedale-day">
      <header className="kennedale-header">
        <h2 className="kennedale-title">
          {data.dayLabel} &mdash; {data.title}
        </h2>
        <p className="kennedale-subtitle">{data.subtitle}</p>
      </header>

      {data.teams && (
        <div className="team-grid">
          <TeamBox variant="girls" team={data.teams.girls} />
          <TeamBox variant="guys" team={data.teams.guys} />
        </div>
      )}

      {data.schedule && <ScheduleTable rows={data.schedule} />}

      {data.evening && (
        <div className="evening">
          <div className="evening-label">{data.evening.label}</div>
          <ScheduleTable rows={data.evening.schedule} />
        </div>
      )}
    </article>
  )
}

function TeamBox({ variant, team }) {
  return (
    <div className={`team-box team-${variant}`}>
      <h3 className="team-title">{team.title}</h3>
      <ScheduleTable rows={team.schedule} compact />
    </div>
  )
}

function ScheduleTable({ rows, compact = false }) {
  return (
    <table className={`schedule ${compact ? 'compact' : ''}`}>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td className="schedule-time">{row.time}</td>
            <td
              className="schedule-text"
              dangerouslySetInnerHTML={{ __html: row.text }}
            />
          </tr>
        ))}
      </tbody>
    </table>
  )
}
