import { DAYS_ORDER, DAY_LABELS, TYPES_ORDER } from '../data/meta'
import './FilterBar.css'

export function FilterBar({
  filterDay,
  filterType,
  onDayChange,
  onTypeChange,
}) {
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
        </div>
      </div>
    </div>
  )
}

function FilterButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      className={`filter-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}
