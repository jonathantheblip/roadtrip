// Feature 4 — Closure & Risk Watch seed library.
// Pre-seeded from trip-planning chat history. Flags surface proactively:
//   Layer 1: Tomorrow's Heads-up card (evening-before)
//   Layer 2: Re-plan scoring (downgrade / reject matching candidates)
//   Layer 3: On-tap badge per stop
//
// Risk types:
//   closed-weekday | closed-seasonal | closed-renovation | hours-restricted
//   construction | no-longer-operating | relevant-reservation-req | other

export const RISK_FLAG_TYPES = [
  { k: 'closed-weekday',       l: 'Closed certain weekdays' },
  { k: 'closed-seasonal',      l: 'Closed seasonally' },
  { k: 'closed-renovation',    l: 'Closed for renovation' },
  { k: 'hours-restricted',     l: 'Restricted hours' },
  { k: 'construction',         l: 'Construction' },
  { k: 'no-longer-operating',  l: 'No longer operating' },
  { k: 'relevant-reservation-req', l: 'Reservation required' },
  { k: 'other',                l: 'Other' },
]

export const RISK_SEED = [
  {
    id: 'rf-walnut-bridge',
    subject: 'Walnut Street Bridge, Chattanooga',
    riskType: 'construction',
    details: 'Closed through late September 2026 for renovation. Do not route there.',
    source: 'https://www.chattanooga.gov',
    appliesToDaysOfWeek: null,
    appliesToTimesOfDay: null,
    keywords: ['walnut street bridge'],
    linkedStopIds: ['u3'],
  },
  {
    id: 'rf-dinner-bell',
    subject: 'Dinner Bell, McComb',
    riskType: 'closed-weekday',
    details: 'Closed Mondays and Tuesdays. Broadway Deli is the Mon/Tue answer.',
    source: 'https://www.facebook.com/TheDinnerBellMcComb/',
    appliesToDaysOfWeek: [1, 2], // Mon, Tue
    keywords: ['dinner bell'],
    linkedStopIds: [],
  },
  {
    id: 'rf-yassins-walnut',
    subject: "Yassin's Falafel — Walnut St flagship, Knoxville",
    riskType: 'construction',
    details: 'Flagship closed for construction AND closed Sundays. Use Marble City Market stall instead.',
    source: 'https://yassinsfalafelhouse.com',
    appliesToDaysOfWeek: [0], // Sundays absolutely not
    keywords: ['yassin walnut', 'yassin’s walnut', 'yassin flagship'],
    linkedStopIds: [],
  },
  {
    id: 'rf-vicksburg-vc',
    subject: 'Vicksburg NMP Visitor Center',
    riskType: 'closed-weekday',
    details: 'Visitor Center CLOSED Mondays. Tour road + USS Cairo + monuments open daily. Pre-pay $20 on recreation.gov.',
    source: 'https://www.nps.gov/vick',
    appliesToDaysOfWeek: [1],
    keywords: ['vicksburg'],
    linkedStopIds: ['m5'],
  },
  {
    id: 'rf-the-max',
    subject: 'Mississippi Arts + Entertainment Experience (The MAX), Meridian',
    riskType: 'closed-weekday',
    details: 'Closed Mondays.',
    source: 'https://msarts.org',
    appliesToDaysOfWeek: [1],
    keywords: ['the max', 'mississippi arts'],
    linkedStopIds: [],
  },
  {
    id: 'rf-highland-carousel',
    subject: 'Highland Park Dentzel Carousel, Meridian',
    riskType: 'closed-renovation',
    details: 'Closed for renovation through 2026.',
    source: 'https://www.meridianms.org',
    keywords: ['highland park carousel', 'dentzel'],
    linkedStopIds: [],
  },
  {
    id: 'rf-sloss',
    subject: 'Sloss Furnaces, Birmingham',
    riskType: 'closed-weekday',
    details: 'Closed Mondays.',
    source: 'https://www.slossfurnaces.com',
    appliesToDaysOfWeek: [1],
    keywords: ['sloss furnaces', 'sloss'],
    linkedStopIds: [],
  },
  {
    id: 'rf-bcri',
    subject: 'Birmingham Civil Rights Institute',
    riskType: 'closed-weekday',
    details: 'Closed Sunday and Monday.',
    source: 'https://www.bcri.org',
    appliesToDaysOfWeek: [0, 1],
    keywords: ['civil rights institute', 'bcri'],
    linkedStopIds: [],
  },
  {
    id: 'rf-meridian-sun-dinner',
    subject: 'Most Meridian downtown dinner spots',
    riskType: 'closed-weekday',
    details:
      "Closed Sunday nights: Weidmann's, Harvest Grill, Fare on Eighth, Jean's, " +
      "6:01 Local (dinner), Threefoot Brewing, Brickhaus. Amore Italian is the Sunday answer.",
    source: 'chat history',
    appliesToDaysOfWeek: [0],
    keywords: [
      'weidmann', 'harvest grill', 'fare on eighth', "jean's", 'jeans',
      'threefoot brewing', 'brickhaus',
    ],
    linkedStopIds: [],
  },
  {
    id: 'rf-bham-sun-dinner',
    subject: 'Birmingham Sunday-closed restaurants',
    riskType: 'closed-weekday',
    details:
      "Closed Sundays: Chez Fonfon, Bottega, Hot and Hot, Bettola, Highlands Bar & Grill, Carrigan's.",
    source: 'chat history',
    appliesToDaysOfWeek: [0],
    keywords: [
      'chez fonfon', 'bottega', 'hot and hot', 'bettola',
      'highlands bar', "carrigan's", 'carrigans',
    ],
    linkedStopIds: [],
  },
  {
    id: 'rf-kma',
    subject: 'Knoxville Museum of Art (KMA)',
    riskType: 'hours-restricted',
    details: 'Opens 1 PM on Sundays — not a full-day option.',
    source: 'https://knoxart.org',
    appliesToDaysOfWeek: [0],
    appliesToTimesOfDay: { start: '00:00', end: '13:00' },
    keywords: ['knoxville museum of art', 'kma'],
    linkedStopIds: [],
  },
  {
    id: 'rf-barber-close',
    subject: 'Barber Vintage Motorsports Museum',
    riskType: 'hours-restricted',
    details: '1h 20m window on Sunday — doors close 6 PM CT sharp.',
    source: 'https://www.barbermuseum.org',
    appliesToDaysOfWeek: [0],
    appliesToTimesOfDay: { start: '18:00', end: '23:59' },
    keywords: ['barber vintage', 'barber motorsports'],
    linkedStopIds: ['u4'],
  },
]
