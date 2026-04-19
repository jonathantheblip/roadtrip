// Meta lookups used throughout the app — day order, display labels, state
// name expansions, and filter option lists. Keep in sync with the original
// ROADTRIP_PWA_BUILD_SPEC.md.

export const DAYS_ORDER = [
  'fri17',
  'sat18',
  'sun19',
  'mon20',
  'tue21',
  'wed22',
  'thu23',
  'fri24',
]

export const DAY_LABELS = {
  fri17: 'Fri 17',
  sat18: 'Sat 18',
  sun19: 'Sun 19',
  mon20: 'Mon 20',
  tue21: 'Tue 21',
  wed22: 'Wed 22',
  thu23: 'Thu 23',
  fri24: 'Fri 24',
}

export const DAY_FULL_LABELS = {
  fri17: 'Fri Apr 17',
  sat18: 'Sat Apr 18',
  sun19: 'Sun Apr 19',
  mon20: 'Mon Apr 20',
  tue21: 'Tue Apr 21',
  wed22: 'Wed Apr 22',
  thu23: 'Thu Apr 23',
  fri24: 'Fri Apr 24',
}

export const STATES_ORDER = ['MA', 'CT', 'NY', 'PA', 'VA', 'TN', 'AL', 'MS', 'LA', 'TX']

export const STATE_NAMES = {
  MA: 'Massachusetts',
  CT: 'Connecticut',
  NY: 'New York',
  PA: 'Pennsylvania',
  VA: 'Virginia',
  TN: 'Tennessee',
  AL: 'Alabama',
  MS: 'Mississippi',
  LA: 'Louisiana',
  TX: 'Texas',
}

export const TYPES_ORDER = [
  { k: 'food', l: 'Food' },
  { k: 'energy', l: 'Energy' },
  { k: 'photo', l: 'Photo' },
  { k: 'poi', l: 'POI' },
  { k: 'gas', l: "Buc-ee's" },
  { k: 'viral', l: 'Viral' },
]
