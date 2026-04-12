import { useCallback, useState } from 'react'
import { getTodayDayKey } from '../utils/tripDay'

export function useItineraryFilters() {
  const [filterDay, setFilterDay] = useState(() => getTodayDayKey() || 'all')
  const [filterType, setFilterType] = useState('all')
  const [rainyDay, setRainyDay] = useState(false)

  const reset = useCallback(() => {
    setFilterDay('all')
    setFilterType('all')
    setRainyDay(false)
  }, [])

  return {
    filterDay,
    filterType,
    rainyDay,
    setFilterDay,
    setFilterType,
    setRainyDay,
    reset,
    isFiltered: filterDay !== 'all' || filterType !== 'all' || rainyDay,
  }
}
