// Emergency / practical data per state per ROADTRIP_PWA_ADDENDUM.md §6.
// Renders as a collapsible card at the top of each state's Discover
// section. Default closed — findable but not prominent.
//
// Fields:
//   er:        array of { name, address? } hospital entries
//   coverage:  string | null — cell coverage warning, or null if normal
//   rental:    string | null — car rental breakdown note (TX only)

export const ESSENTIALS = {
  // Massachusetts is the starting point — no card per the addendum.
  CT: {
    er: [
      { name: 'Hartford Hospital', address: '80 Seymour St, Hartford, CT' },
    ],
    coverage: null,
    rental: null,
  },
  NY: {
    er: [
      { name: 'Vassar Brothers Medical Center', address: 'Poughkeepsie, NY' },
    ],
    coverage: 'Spotty in the western Catskills valleys.',
    rental: null,
  },
  PA: {
    er: [
      { name: 'Geisinger Community Medical Center', address: 'Scranton, PA' },
      {
        name: 'Penn State Health Holy Spirit',
        address: 'Camp Hill, PA (Harrisburg area)',
      },
    ],
    coverage: 'Gaps on I-81 through the mountains.',
    rental: null,
  },
  VA: {
    er: [
      {
        name: 'Augusta Health',
        address: 'Fishersville, VA (near Shenandoah)',
      },
    ],
    coverage:
      'DEAD ZONES on Skyline Drive and through the mountain passes. Download everything before entering.',
    rental: null,
  },
  TN: {
    er: [
      { name: 'Erlanger Medical Center', address: 'Chattanooga, TN' },
      {
        name: 'Johnson City Medical Center',
        address: 'Johnson City, TN (Jonesborough area)',
      },
    ],
    coverage: 'Generally OK on I-81 and I-75 corridors.',
    rental: null,
  },
  AL: {
    er: [{ name: 'UAB Hospital', address: 'Birmingham, AL' }],
    coverage: 'Gaps on US-280 east of Birmingham.',
    rental: null,
  },
  MS: {
    er: [
      {
        name: 'University of Mississippi Medical Center',
        address: 'Jackson, MS',
      },
      {
        name: 'Southwest Mississippi Regional Medical Center',
        address: 'McComb, MS',
      },
    ],
    coverage:
      'SIGNIFICANT DEAD ZONES between McComb and Jackson on US-51. Also gaps on back roads between Vicksburg and I-20. Download everything before entering Mississippi.',
    rental: null,
  },
  LA: {
    er: [
      { name: 'St. Francis Medical Center', address: 'Monroe, LA' },
    ],
    coverage: null,
    rental: null,
  },
  TX: {
    er: [
      { name: 'Baylor Scott & White', address: 'Dallas, TX' },
      { name: "Cook Children's Medical Center", address: 'Fort Worth, TX' },
      { name: "Texas Children's Hospital", address: 'Houston, TX' },
      { name: 'Houston Methodist Hospital', address: 'Houston, TX' },
    ],
    coverage:
      'Generally good on I-45 and I-35. Gaps possible on rural county roads.',
    rental:
      'National / Enterprise roadside \u2014 check the rental agreement for the phone number.',
  },
}
