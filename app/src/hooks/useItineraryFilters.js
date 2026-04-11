import { useCallback, useState } from 'react'

// Day + type filter state. State filter lives on the Discover tab only,
// so the itinerary view doesn't touch it. Filters reset when user taps
// the active pill again.
export function useItineraryFilters() {
  const [filterDay, setFilterDay] = useState('all')
  const [filterType, setFilterType] = useState('all')

  const reset = useCallback(() => {
    setFilterDay('all')
    setFilterType('all')
  }, [])

  return {
    filterDay,
    filterType,
    setFilterDay,
    setFilterType,
    reset,
    isFiltered: filterDay !== 'all' || filterType !== 'all',
  }
}
