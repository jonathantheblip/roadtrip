// Overnight lodging + flight home data. Tue 21 and Wed 22 inherit Mon 20's
// "Aunt Donna's house" so they don't get their own entries.

export const OVERNIGHTS = {
  fri17: {
    lodging: 'Cozy Rustic Farmhouse With Wood Stove',
    region: 'Catskills (Delaware County), NY',
    host: 'Olivia',
    hostConfirmed: true,
    address: 'TBD — get from Airbnb app listing page',
    checkIn: '3:00 PM',
    checkOut: 'Sat 11:00 AM',
    checkInMethod: 'TBD — message Olivia for details',
    guests: '3 adults, 1 child',
    wifiPassword: null,
    notes:
      'Host confirmed — "looking forward to hosting you and your family." This was the 1-night exception to 3-night minimum — it worked.',
  },
  sat18: {
    lodging: 'The Cottage on Cottage',
    region: 'Elizabethton, TN',
    host: 'Daphanie',
    hostPhone: '(423) 895-3020',
    address: '317 E Cottage Ave, Elizabethton, TN 37643',
    checkIn: '3:00 PM',
    checkOut: 'Sun 10:00 AM',
    checkInMethod: 'Self check-in with keypad',
    reservationCode: 'HM3RQZHCM4',
    cost: '$320',
    guests: '3 adults, 1 child',
    wifiPassword: null,
    notes:
      'Jonathan alone for ashes ceremony. Privacy, porch, views. Keypad entry — no host coordination needed.',
  },
  sun19: {
    lodging: "Grandma's house",
    region: 'McComb, MS',
    host: 'Grandma',
    address: '1064 Quin Lane, McComb, MS 39648',
    checkIn: 'N/A — family home',
    checkOut: 'N/A',
    checkInMethod: 'N/A',
    guests: 'Family',
    wifiPassword: null,
    notes: 'No booking needed. Staying overnight.',
  },
  mon20: {
    lodging: "Aunt Donna's house",
    region: 'Kennedale, TX',
    host: 'Aunt Donna',
    address: "TBD — get Donna's address from Jonathan",
    checkIn: 'N/A — family home',
    checkOut: 'N/A',
    checkInMethod: 'N/A',
    guests: 'Family',
    wifiPassword: null,
    notes:
      'Staying 3 nights (Mon–Wed). Donna recently retired, flexible schedule. Aunt Debra joins for dinners (still working).',
  },
  thu23: {
    lodging: 'Montrose Clásica Mansion A',
    region: 'Downtown / MedCenter, Houston, TX',
    host: 'Phillip',
    coHost: 'Michelle (Phillip\u2019s assistant)',
    address: '1301 Marshall St, Houston, TX (confirm in Airbnb app)',
    checkIn: '6:00 PM',
    checkOut: 'Fri 10:00 AM',
    checkInMethod: 'TBD — check Airbnb app for instructions',
    guests: '3 adults, 1 child',
    wifiPassword: null,
    notes:
      'Strict house rules: no loud noise, no smoking inside, no parties. Walking distance to Rothko Chapel and Menil Collection.',
  },
}

export const FLIGHT_HOME = {
  day: 'fri24',
  airline: 'JetBlue',
  flight: 'B6 932',
  confirmation: 'LONGQI',
  date: 'Fri Apr 24, 2026',
  route: 'IAH → BOS',
  departure: {
    airport: 'IAH',
    terminal: 'A',
    city: 'Houston, TX',
    time: '1:17 PM',
  },
  arrival: {
    airport: 'BOS',
    terminal: 'C',
    city: 'Boston, MA',
    time: '6:06 PM',
  },
  travelers: [
    { name: 'Helen Hemley', seat: '19D' },
    { name: 'Jonathan Jackson', seat: '19E' },
    { name: 'Rafael Jackson', seat: '13E' },
    { name: 'Aurelia Jackson', seat: '13F' },
  ],
  seatingNote:
    'Seating plan: one parent sits with each kid. Swap at the gate — Jonathan or Helen moves to row 13, one kid moves to row 19.',
  carRental: 'National (Emerald Club) — confirmation TBD',
  reminders: [
    'Return rental car at IAH by 11:00 AM (Terminal A area)',
    'Check in on JetBlue app morning of',
    "Pack kids' iPads, chargers, headphones, and snacks in carry-on — NOT checked bags",
    'Rafa and Aurelia in row 13 (window + middle). Parents in row 19 (window + middle). Rearrange at gate.',
  ],
}
