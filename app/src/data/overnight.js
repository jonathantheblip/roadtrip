// Overnight lodging + flight home data per ROADTRIP_PWA_ADDENDUM.md §2–3.
// Only days where the family is sleeping somewhere new get an entry.
// Tue 21 and Wed 22 inherit Mon 20's "Aunt Donna's house" — no new card.

export const OVERNIGHTS = {
  fri17: {
    lodging: 'Catskills farmhouse',
    region: 'Delaware County, NY',
    address: 'TBD — awaiting host confirmation',
    checkIn: 'TBD',
    hostContact: 'TBD',
    wifiPassword: null,
    notes:
      'One-night exception request pending with the host (3-night minimum). Backup: Poconos property.',
  },
  sat18: {
    lodging: 'Elizabethton Airbnb',
    region: 'Elizabethton, TN',
    address: '317 E Cottage Ave, Elizabethton, TN',
    checkIn: 'TBD — check the Airbnb app',
    hostContact: null,
    wifiPassword: null,
    notes:
      'Jonathan alone tonight for the ashes ceremony. Needs privacy, porch, views.',
  },
  sun19: {
    lodging: "Grandma's house",
    region: 'McComb, MS',
    address: '1064 Quin Lane, McComb, MS 39648',
    checkIn: 'N/A — family home',
    hostContact: null,
    wifiPassword: null,
    notes: 'No booking needed.',
  },
  mon20: {
    lodging: "Aunt Donna's house",
    region: 'Kennedale, TX',
    address: 'TBD — fill in Donna\u2019s address',
    checkIn: 'N/A — family home',
    hostContact: null,
    wifiPassword: null,
    notes:
      'Staying 3 nights (Mon–Wed). Donna recently retired — flexible schedule.',
  },
  thu23: {
    lodging: 'Houston Airbnb',
    region: 'Montrose, Houston',
    address: '1301 Marshall St, Houston, TX',
    checkIn: 'TBD — check the Airbnb app',
    hostContact: null,
    wifiPassword: 'TBD',
    notes:
      '3BR, walking distance to Rothko Chapel and Menil Collection.',
  },
}

export const FLIGHT_HOME = {
  day: 'fri24',
  airline: 'JetBlue',
  flight: 'B6 932',
  route: 'IAH → BOS',
  departureTime: 'TBD — fill in when confirmed',
  terminal: 'TBD',
  carRentalReturn: 'National/Enterprise at IAH — TBD',
  reminders: [
    'Return rental car 2 hrs before departure',
    'Check in on JetBlue app the morning of',
    "Pack kids' iPads in carry-on, not checked bags",
  ],
}
