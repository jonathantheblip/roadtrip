import { useMemo, useState } from 'react'
import { STOPS } from '../data/stops'
import { STATES_ORDER, STATE_NAMES, TYPES_ORDER } from '../data/meta'
import { filterStops } from '../utils/filterStops'
import { StopCard } from './StopCard'
import { EssentialsCard } from './EssentialsCard'
import { RouteMapLazy } from './RouteMapLazy'
import './DiscoverView.css'

export function DiscoverView({ activePerson }) {
  const [filterState, setFilterState] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [rainyDay, setRainyDay] = useState(false)
  const [viewMode, setViewMode] = useState('map')

  const stops = useMemo(
    () =>
      filterStops(STOPS, {
        category: 'discover',
        activePerson,
        state: filterState,
        type: filterType,
        rainyDay,
      }),
    [activePerson, filterState, filterType, rainyDay]
  )

  let body
  if (stops.length === 0) {
    body = (
      <div className="empty">
        No discover stops match those filters &mdash; try &ldquo;All&rdquo;.
      </div>
    )
  } else if (filterState === 'all') {
    body = <GroupedByState stops={stops} activePerson={activePerson} />
  } else {
    body = (
      <FlatState
        state={filterState}
        stops={stops}
        activePerson={activePerson}
      />
    )
  }

  if (viewMode === 'map') {
    return (
      <section className="discover discover-map-mode">
        <RouteMapLazy mode="discover" stops={stops} activePerson={activePerson}>
          <div className="map-float-filters">
            <div className="filter-row">
              <FilterPill label="All" active={filterState === 'all'} onClick={() => setFilterState('all')} />
              {STATES_ORDER.map((s) => (
                <FilterPill key={s} label={s} active={filterState === s} onClick={() => setFilterState(s)} />
              ))}
            </div>
            <div className="filter-row">
              <FilterPill label="All" active={filterType === 'all'} onClick={() => setFilterType('all')} />
              {TYPES_ORDER.map((t) => (
                <FilterPill key={t.k} label={t.l} active={filterType === t.k} onClick={() => setFilterType(t.k)} />
              ))}
              <FilterPill
                label={rainyDay ? '\u2614 Rainy' : '\u2600\uFE0F Weather'}
                active={rainyDay}
                onClick={() => setRainyDay(!rainyDay)}
              />
              <FilterPill label="List" active={false} onClick={() => setViewMode('list')} />
            </div>
          </div>
        </RouteMapLazy>
      </section>
    )
  }

  return (
    <section className="discover">
      <header className="discover-intro">
        <div className="discover-eyebrow">Discover</div>
        <h2 className="discover-title">Off-itinerary picks, by state</h2>
        <p className="discover-lede">
          Not on the day-by-day plan &mdash; just good stops within a short
          detour. Filter by state to see what&rsquo;s worth stopping for.
        </p>
      </header>

      <div className="filter-section">
        <div className="filter-row">
          <span className="filter-label">State</span>
          <div className="filters">
            <FilterPill
              label="All"
              active={filterState === 'all'}
              onClick={() => setFilterState('all')}
            />
            {STATES_ORDER.map((s) => (
              <FilterPill
                key={s}
                label={s}
                active={filterState === s}
                onClick={() => setFilterState(s)}
              />
            ))}
          </div>
        </div>
        <div className="filter-row">
          <span className="filter-label">Type</span>
          <div className="filters">
            <FilterPill
              label="All"
              active={filterType === 'all'}
              onClick={() => setFilterType('all')}
            />
            {TYPES_ORDER.map((t) => (
              <FilterPill
                key={t.k}
                label={t.l}
                active={filterType === t.k}
                onClick={() => setFilterType(t.k)}
              />
            ))}
            <FilterPill
              label={rainyDay ? '\u2614 Rainy Day' : '\u2600\uFE0F Any Weather'}
              active={rainyDay}
              onClick={() => setRainyDay(!rainyDay)}
            />
            <FilterPill label="Map" active={false} onClick={() => setViewMode('map')} />
          </div>
        </div>
      </div>

      {body}
    </section>
  )
}

function FilterPill({ label, active, onClick }) {
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

function GroupedByState({ stops, activePerson }) {
  const grouped = useMemo(() => {
    const acc = {}
    stops.forEach((s) => {
      if (!acc[s.state]) acc[s.state] = []
      acc[s.state].push(s)
    })
    return acc
  }, [stops])

  return (
    <>
      {STATES_ORDER.map((state) => {
        const list = grouped[state]
        if (!list || list.length === 0) return null
        return (
          <div key={state} className="discover-state">
            <h3 className="discover-state-title">
              <span className="discover-state-name">{STATE_NAMES[state]}</span>
              <span className="discover-state-count">
                {list.length} {list.length === 1 ? 'pick' : 'picks'}
              </span>
            </h3>
            <EssentialsCard state={state} />
            <div className="stops-grid">
              {list.map((s) => (
                <StopCard key={s.id} stop={s} activePerson={activePerson} />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

function FlatState({ state, stops, activePerson }) {
  return (
    <div className="discover-state">
      <h3 className="discover-state-title">
        <span className="discover-state-name">{STATE_NAMES[state]}</span>
        <span className="discover-state-count">
          {stops.length} {stops.length === 1 ? 'pick' : 'picks'}
        </span>
      </h3>
      <EssentialsCard state={state} />
      <div className="stops-grid">
        {stops.map((s) => (
          <StopCard key={s.id} stop={s} activePerson={activePerson} />
        ))}
      </div>
    </div>
  )
}
