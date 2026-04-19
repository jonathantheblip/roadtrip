// Overnight lodging + flight home data. Tue 21 and Wed 22 inherit Mon 20's
// "Aunt Donna's house" so they don't get their own entries.

export const OVERNIGHTS = {
  fri17: {
    lodging: 'Postcard Cabins Eastern Catskills',
    region: 'Catskill, NY',
    host: 'Postcard Cabins (contactless)',
    hostPhone: '888-236-2427',
    address: '282 Cairo Junction Rd, Catskill, NY 12414',
    checkIn: '4:00 PM',
    checkOut: 'Sat 11:00 AM',
    checkInMethod: 'Contactless — details sent by text morning of',
    reservationCode: '#92285479 (bunk) · #92289948 (queen)',
    guests: '3 adults, 1 child (2 cabins)',
    wifiPassword: null,
    notes:
      'Two cabins booked: bunk bed + queen. Neighboring cabin request submitted — not guaranteed. No restaurants on-site — bring groceries (Hannaford run at 3:00 PM covers this). Each cabin: two-burner stove, cookware, dishware, mini-fridge. Fire pit + grill grate outside (wood fire, build it yourself). 60 wooded acres. Cell service spotty; landline in each cabin. Contactless check-in via text.',
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
    lodging: 'The Threefoot Hotel (Tribute Portfolio)',
    region: 'Meridian, MS',
    host: 'Marriott · Bonvoy',
    hostPhone: '(601) 207-8700',
    address: '601 22nd Ave, Meridian, MS 39301',
    checkIn: '8:15 PM CT (Sun) — desk is 24/7',
    checkOut: 'Mon 10:00 AM CT',
    checkInMethod: 'Front desk · Bonvoy app mobile key',
    reservationCode: '80722561 · 80726084 (two rooms)',
    cost: 'Two rooms · Bonvoy points',
    guests: '3 adults, 1 child (2 rooms)',
    wifiPassword: null,
    notes:
      '1929 Art Deco skyscraper, tallest in East MS, on the National Register. ' +
      'Self-park at Arts District Garage (712 24th Ave, 1 block) — avoid the $30 valet. ' +
      'Gold status does NOT include free breakfast at Tribute. 6:01 Local on ' +
      'ground floor opens 6 AM for Monday breakfast. Boxcar rooftop on 16th floor ' +
      '4–10 PM Sundays.',
  },
  mon20_grandma: {
    // Monday anchor visit — NOT an overnight. Kept here for reference so the
    // trip app can surface details about the 2.5-hour lunch stop without
    // bleeding into the overnight card.
    lodging: "Grandma's (day visit only, no overnight)",
    region: 'McComb, MS',
    host: 'Grandma',
    address: '1064 Quin Lane, McComb, MS 39648',
    checkIn: '11:00 AM CT (Mon)',
    checkOut: '1:30 PM CT — sharp',
    guests: 'Family',
    notes:
      'Monday anchor lunch (2h 30m). Broadway Deli pickup brought to Grandma. ' +
      'Leave 1:30 PM CT sharp — slipping past 3 hours pushes Kennedale arrival past 9 PM.',
  },
  mon20: {
    lodging: "Aunt Donna's house",
    region: 'Arlington, TX',
    host: 'Aunt Donna',
    address: '2331 Bay Lakes Court, Arlington, TX 76016',
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
