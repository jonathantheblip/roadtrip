// Single source of truth for the trip's calendar axes: dates, time zones,
// destinations, and day-of-week labels. Import from here instead of
// redefining in each consumer (the old pattern had TRIP_DATES in three
// files with two different shapes).

import { DAYS_ORDER } from './meta'
import { OVERNIGHTS } from './overnight'

// Local Date objects, midnight local time, for each trip day.
export const TRIP_DATES = {
  fri17: new Date(2026, 3, 17),
  sat18: new Date(2026, 3, 18),
  sun19: new Date(2026, 3, 19),
  mon20: new Date(2026, 3, 20),
  tue21: new Date(2026, 3, 21),
  wed22: new Date(2026, 3, 22),
  thu23: new Date(2026, 3, 23),
  fri24: new Date(2026, 3, 24),
}

// ISO (YYYY-MM-DD) form — used by callers that prefer string keys.
export const TRIP_DATE_ISO = {
  fri17: '2026-04-17', sat18: '2026-04-18', sun19: '2026-04-19',
  mon20: '2026-04-20', tue21: '2026-04-21', wed22: '2026-04-22',
  thu23: '2026-04-23', fri24: '2026-04-24',
}

// Active time zone per day. Sunday is the ET→CT crossover; Friday is the
// flight home. Other days are stable.
export const DAY_TZ = {
  fri17: 'ET', sat18: 'ET', sun19: 'CT', mon20: 'CT',
  tue21: 'CT', wed22: 'CT', thu23: 'CT', fri24: 'ET',
}
export const DAY_TZ_CROSSOVER = {
  sun19: 'ET → CT',
  fri24: 'CT → ET',
}

// Short destination city name per day, derived from OVERNIGHTS so the
// banner stays in sync with any lodging edit. Days that inherit the
// prior overnight (tue21/wed22) or fly home (fri24) get explicit
// fallbacks so the banner never reads "—".
const DEST_OVERRIDES = {
  tue21: 'Arlington, TX',
  wed22: 'Arlington, TX',
  thu23: 'Houston, TX',       // OVERNIGHTS.thu23.region is verbose
  fri24: 'Home (Boston)',
}
export const DEST_CITY = Object.fromEntries(
  DAYS_ORDER.map((k) => [k, DEST_OVERRIDES[k] || OVERNIGHTS[k]?.region || '—'])
)

export const DOW_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
