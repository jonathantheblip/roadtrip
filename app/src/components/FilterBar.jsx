import { useMemo } from 'react'
import { STOPS } from '../data/stops'
import { DAYS_ORDER, DAY_LABELS, TYPES_ORDER } from '../data/meta'
import { useVisitedContext } from '../hooks/VisitedContext'
import './FilterBar.css'

export function FilterBar({
  filterDay,
  filterType,
  rainyDay,
  onDayChange,
  onTypeChange,
  onRainyDayChange,
}) {
  const { visited } = useVisitedContext()

  const dayCounts = useMemo(() => {
    const counts = {}
    DAYS_ORDER.forEach((d) => {
      const dayStops = STOPS.filter((s) => s.day === d && s.category !== 'discover')
      const done = dayStops.filter((s) => visited.includes(s.id)).length
      if (dayStops.length > 0) counts[d] = `${done}/${dayStops.length}`
    })
    return counts
  }, [visited])

  return (
    <div className="filter-section">
      <div className="filter-row">
        <span className="filter-label">Day</span>
        <div className="filters">
          <FilterButton
            label="All"
            active={filterDay === 'all'}
            onClick={() => onDayChange('all')}
          />
          {DAYS_ORDER.map((d) => (
            <FilterButton
              key={d}
              label={DAY_LABELS[d]}
              active={filterDay === d}
              onClick={() => onDayChange(d)}
              badge={dayCounts[d]}
            />
          ))}
        </div>
      </div>
      <div className="filter-row">
        <span className="filter-label">Type</span>
        <div className="filters">
          <FilterButton
            label="All"
            active={filterType === 'all'}
            onClick={() => onTypeChange('all')}
          />
          {TYPES_ORDER.map((t) => (
            <FilterButton
              key={t.k}
              label={t.l}
              active={filterType === t.k}
              onClick={() => onTypeChange(t.k)}
            />
          ))}
          <FilterButton
            label={rainyDay ? '\u2614 Rainy Day' : '\u2600\uFE0F Any Weather'}
            active={rainyDay}
            onClick={() => onRainyDayChange(!rainyDay)}
          />
        </div>
      </div>
    </div>
  )
}

function FilterButton({ label, active, onClick, badge }) {
  return (
    <button
      type="button"
      className={`filter-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
      {badge && <span className="filter-badge">{badge}</span>}
    </button>
  )
}
