// Verified hours, phone, cost, and flag data from ROADTRIP_VERIFIED_STOP_DATA.md.
// Keyed by stop id. Merged into STOPS at export time in stops.js.
// Only fields provided here override the base stop — undefined fields fall
// back to whatever the base entry had.

export const VERIFIED_STOPS = {
  // Fri Apr 17
  f3: {
    address: '1405 County Route 22, Ghent, NY 12075',
    hours: 'Dawn–Dusk daily (Visitors Center 9 AM–5 PM). Closed Tuesdays.',
    phone: '(518) 392-4747',
    cost: 'Free — register vehicle online at artomi.org/visit',
  },

  // Sat Apr 18
  s1: {
    address: '150 South Washington Ave, Scranton, PA 18503',
    hours: 'Sat 9:30 AM–4 PM (winter schedule through April)',
    phone: '(570) 445-1898',
    cost: 'Free (National Park Service)',
    flag: '⚠️ No train rides in April — season starts May 9. Museum & roundhouse only.',
  },
  s3: {
    address: '340 Verbeke St, Harrisburg, PA 17102',
    hours: 'Sat 11:30 AM–10 PM',
    phone: '(717) 695-4888',
    cost: '$$',
  },
  s7: {
    cost: '$$',
    flag: '⚠️ Verify address and hours before arrival — small local spot.',
  },

  // Sun Apr 19
  u1: {
    address: '150 River St, Chattanooga, TN 37402',
    hours: 'Open park — dawn to dusk',
    cost: 'Free',
  },
  u3: {
    address: '6030 Barber Motorsports Pkwy, Leeds, AL 35094',
    hours: 'Sun: Noon–6 PM (April hours)',
    phone: '(205) 699-7275',
    cost: 'Adults ~$15–20, Kids 4–12 ~$10',
    flag: '⚠️ Opens at NOON on Sundays. Confirm open Apr 19 — check @barbermuseum on Instagram mid-week.',
  },

  // Mon Apr 20
  m1: {
    address: '2148 Riverside Dr, Jackson, MS 39202',
    hours: 'Mon–Sat 9 AM–5 PM (verify)',
    cost: '~$6–8 adults, ~$4–5 kids',
  },
  m2: {
    address: '3201 Clay St, Vicksburg, MS 39183',
    hours: 'Park roads: 7:30 AM–7 PM daily',
    phone: '(601) 636-0583',
    cost: '$20 per vehicle',
    flag: '⚠️ Visitor center CLOSED Mondays. Download NPS app for 15-stop audio tour before arriving.',
  },
  m5: {
    address: 'I-20 at Exit 501, Terrell, TX',
    hours: '24 hours',
    cost: 'N/A',
  },

  // Thu Apr 23
  t1: {
    address: '401 W 7th Ave, Corsicana, TX 75110',
    hours: 'Mon–Sat 8 AM–6 PM (verify)',
    cost: '$',
  },
  t3: {
    address: 'I-45 at Madisonville, TX',
    hours: '24 hours',
    cost: 'N/A',
  },
  t4: {
    address: 'I-45, Huntsville, TX (visible from highway)',
    hours: '24/7 — it\u2019s a 67-foot statue',
    cost: 'Free',
  },
  tm_hugos: {
    address: '1600 Westheimer Rd, Houston, TX 77006',
    hours: 'Thu 11:30 AM–9 PM',
    phone: '(713) 524-7744',
    cost: '$$$',
    flag: '⚠️ Reservation recommended. Call (713) 524-7744. Request garden room (quieter).',
  },

  // Fri Apr 24 (discover entries used by the Houston morning)
  d_tx_rothko: {
    address: '3900 Yupon St, Houston, TX 77006',
    hours: 'Fri 10 AM–6 PM. Closed Mondays.',
    phone: '(713) 524-9839',
    cost: 'Free',
    flag: '⚠️ Check rothkochapel.org events calendar day before — they close for events ~2x/month. No photography inside.',
  },
  d_tx_menil: {
    address: '1533 Sul Ross St, Houston, TX 77006',
    hours: 'Wed–Sun 11 AM–7 PM (verify Fri hours)',
    cost: 'Free',
  },

  // Discover entries surfaced as cards
  d_tx_kimbell: {
    address: '3333 Camp Bowie Blvd, Fort Worth, TX 76107',
    hours: 'Tue–Sat 10 AM–5 PM, Sun Noon–5 PM (likely closed Mon)',
    phone: '(817) 332-8451',
    cost: 'Free permanent collection; special exhibits vary',
  },
  d_tx_modern: {
    address: '3200 Darnell St, Fort Worth, TX 76107',
    hours: 'Tue–Sun 10 AM–5 PM (verify)',
    phone: '(817) 738-9215',
    cost: '~$10–16 adults',
  },
  d_tx_stockyards: {
    address: '131 E Exchange Ave, Fort Worth, TX 76164',
    hours: 'Cattle drive at 11:30 AM daily',
    cost: 'Free to watch',
  },
}
