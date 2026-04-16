import { useMemo } from 'react'
import { STOPS } from '../data/stops'
import { DAYS_ORDER, DAY_FULL_LABELS } from '../data/meta'
import { RouteMapLazy } from './RouteMapLazy'
import { OVERNIGHTS } from '../data/overnight'
import { PREP } from '../data/prep'
import { GAS_WARNINGS } from '../data/gas_warnings'
import { filterStops } from '../utils/filterStops'
import { StopCard } from './StopCard'
import { FilterBar } from './FilterBar'
import { KennedaleDay } from './KennedaleDay'
import { HoustonFriday } from './HoustonFriday'
import { TonightCard } from './TonightCard'
import { FlightHomeCard } from './FlightHomeCard'
import { PrepCard } from './PrepCard'
import { GasWarning } from './GasWarning'
import { NextUpCard } from './NextUpCard'
import { useItineraryFilters } from '../hooks/useItineraryFilters'
import { useVisitedContext } from '../hooks/VisitedContext'
import { useSwipeDays } from '../hooks/useSwipeDays'
import { isDuringTrip } from '../utils/tripDay'
import './ItineraryView.css'

export function ItineraryView({ activePerson }) {
  const { filterDay, filterType, rainyDay, setFilterDay, setFilterType, setRainyDay, isFiltered } =
    useItineraryFilters()
  const { visited, markVisited } = useVisitedContext()
  const { swipeX, swipeHandlers } = useSwipeDays(filterDay, setFilterDay)

  const allPlanned = useMemo(
    () => filterStops(STOPS, { category: 'planned', activePerson }),
    [activePerson]
  )

  const stops = useMemo(
    () =>
      filterStops(STOPS, {
        category: 'planned',
        activePerson,
        day: filterDay,
        type: filterType,
        rainyDay,
      }),
    [activePerson, filterDay, filterType, rainyDay]
  )

  const duringTrip = isDuringTrip()
  const showNextUp = duringTrip && filterDay !== 'all'

  let body
  if (filterDay === 'tue21' || filterDay === 'wed22') {
    body = (
      <>
        <KennedaleDay day={filterDay} />
        {PREP[filterDay] && (
          <PrepCard prep={PREP[filterDay]} activePerson={activePerson} />
        )}
      </>
    )
  } else if (filterDay === 'fri24') {
    body = (
      <>
        <FlightHomeCard />
        <HoustonFriday />
      </>
    )
  } else if (!isFiltered) {
    body = <DayByDay stops={stops} activePerson={activePerson} />
  } else {
    body = (
      <FilteredList
        stops={stops}
        activePerson={activePerson}
        filterDay={filterDay}
      />
    )
  }

  return (
    <section className="itinerary">
      <RouteMapLazy
        mode="itinerary"
        stops={stops}
        activePerson={activePerson}
      />
      <FilterBar
        filterDay={filterDay}
        filterType={filterType}
        rainyDay={rainyDay}
        onDayChange={setFilterDay}
        onTypeChange={setFilterType}
        onRainyDayChange={setRainyDay}
      />
      {showNextUp && (
        <NextUpCard
          stops={allPlanned}
          day={filterDay}
          activePerson={activePerson}
          visited={visited}
          onSkip={markVisited}
        />
      )}
      <div
        className="swipe-area"
        style={swipeX ? { transform: `translateX(${swipeX}px)` } : undefined}
        {...swipeHandlers}
      >
        {body}
      </div>
    </section>
  )
}

function FilteredList({ stops, activePerson, filterDay }) {
  const overnight =
    filterDay && filterDay !== 'all' ? OVERNIGHTS[filterDay] : null
  const prep =
    filterDay && filterDay !== 'all' ? PREP[filterDay] : null
  const gas =
    filterDay && filterDay !== 'all' ? GAS_WARNINGS[filterDay] : null

  if (stops.length === 0) {
    return (
      <>
        {gas && <GasWarning warning={gas} />}
        {overnight && (
          <TonightCard overnight={overnight} activePerson={activePerson} />
        )}
        <div className="empty">No itinerary stops match.</div>
        {prep && <PrepCard prep={prep} activePerson={activePerson} />}
      </>
    )
  }
  return (
    <>
      {gas && <GasWarning warning={gas} />}
      {overnight && (
        <TonightCard overnight={overnight} activePerson={activePerson} />
      )}
      <div className="stops-grid">
        {stops.map((s) => (
          <StopCard key={s.id} stop={s} activePerson={activePerson} />
        ))}
      </div>
      {prep && <PrepCard prep={prep} activePerson={activePerson} />}
    </>
  )
}

function DayByDay({ stops, activePerson }) {
  const grouped = useMemo(() => {
    const acc = {}
    stops.forEach((s) => {
      if (!acc[s.day]) acc[s.day] = []
      acc[s.day].push(s)
    })
    return acc
  }, [stops])

  return (
    <>
      {PREP.pretrip && (
        <PrepCard
          prep={PREP.pretrip}
          activePerson={activePerson}
          defaultOpen
        />
      )}
      {DAYS_ORDER.map((day) => {
        if (day === 'tue21' || day === 'wed22') {
          return (
            <div key={day} className="day-section">
              <KennedaleDay day={day} />
              {PREP[day] && (
                <PrepCard prep={PREP[day]} activePerson={activePerson} />
              )}
            </div>
          )
        }
        if (day === 'fri24') {
          return (
            <div key={day} className="day-section">
              <FlightHomeCard />
              <HoustonFriday />
            </div>
          )
        }
        const dayStops = grouped[day]
        if (!dayStops || dayStops.length === 0) return null
        return (
          <DaySection
            key={day}
            day={day}
            stops={dayStops}
            activePerson={activePerson}
          />
        )
      })}
    </>
  )
}

function DaySection({ day, stops, activePerson }) {
  const isThursday = day === 'thu23'
  const overnight = OVERNIGHTS[day]
  const prep = PREP[day]
  const gas = GAS_WARNINGS[day]
  let curCluster = ''
  return (
    <div className="day-section">
      <h2 className="section-label">
        {isThursday
          ? 'Thu Apr 23 — Goodbye + Drive to Houston'
          : DAY_FULL_LABELS[day]}
      </h2>
      {gas && <GasWarning warning={gas} />}
      {overnight && (
        <TonightCard overnight={overnight} activePerson={activePerson} />
      )}
      {isThursday && (
        <div className="drive-box">
          <strong>⚠️ Axiom rules:</strong> closed-toe shoes; NO phones, iPads,
          or cameras inside — everything gets checked at reception.
          <br />
          <strong>8:00am:</strong> Goodbye breakfast with Donna &amp; Debra.
          <br />
          <strong>9:30am:</strong> Depart Arlington (I-45 South).
          <br />
          <strong>~10:30am:</strong> Collin Street Bakery, Corsicana (15 min).
          <br />
          <strong>~12:15pm:</strong> Buc-ee&rsquo;s Madisonville — lunch (30
          min).
          <br />
          <strong>~1:00pm:</strong> Sam Houston Statue — 5-min photo.
          <br />
          <strong>3:00pm:</strong> Axiom EVA tour with Chris (~45&ndash;60
          min).
          <br />
          <strong>~4:40pm:</strong> Rice University campus walk (Aurelia&rsquo;s
          request).
          <br />
          <strong>6:15pm:</strong> Dinner at Hugo&rsquo;s (14-item veg menu)
          — straight from Rice.
          <br />
          <strong>~8:30pm:</strong> Check into 1301 Marshall St, Houston.
        </div>
      )}
      <div className="stops-grid">
        {stops.map((s) => {
          const showCluster = s.cluster && s.cluster !== curCluster
          if (showCluster) curCluster = s.cluster
          return (
            <FragmentOrRow
              key={s.id}
              cluster={showCluster ? s.cluster : null}
              stop={s}
              activePerson={activePerson}
            />
          )
        })}
      </div>
      {prep && <PrepCard prep={prep} activePerson={activePerson} />}
    </div>
  )
}

function FragmentOrRow({ cluster, stop, activePerson }) {
  return (
    <>
      {cluster && <div className="cluster-header">{cluster}</div>}
      <StopCard stop={stop} activePerson={activePerson} />
    </>
  )
}
