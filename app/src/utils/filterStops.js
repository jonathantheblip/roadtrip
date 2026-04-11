// Generic stop filtering used by the Itinerary and (later) Discover views.
// - category === 'planned': exclude discover POIs
// - category === 'discover': keep only discover POIs
// - personAllows: Jonathan/everyone see everything; other persons need to
//   be explicitly tagged or share a stop tagged 'everyone'

export function personAllows(stop, activePerson) {
  if (activePerson === 'jonathan' || activePerson === 'everyone') return true
  return stop.persons.includes(activePerson) || stop.persons.includes('everyone')
}

export function filterStops(STOPS, { category, activePerson, day, type, state } = {}) {
  return STOPS.filter((stop) => {
    if (category === 'planned' && stop.category === 'discover') return false
    if (category === 'discover' && stop.category !== 'discover') return false
    if (day && day !== 'all' && stop.day !== day) return false
    if (type && type !== 'all' && !stop.types.includes(type)) return false
    if (state && state !== 'all' && stop.state !== state) return false
    return personAllows(stop, activePerson)
  })
}
