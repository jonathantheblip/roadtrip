// "Prep for Tomorrow" data per ROADTRIP_PWA_ADDENDUM.md §4.
// Each entry is shown at the BOTTOM of its day's itinerary view, the
// evening before the day it's prepping for. The special 'pretrip'
// entry shows at the TOP of the Itinerary tab (before Fri 17).
//
// Audience keys drive per-person filtering and section headers:
//   helen / aurelia / rafa / jonathan — person-specific content feeds
//   pack     — gear to bring
//   note     — neutral context
//   warning  — critical action items (flight-day baggage rules, etc.)

export const PREP = {
  pretrip: {
    forDay: 'fri17',
    forLabel: 'Fri 17 · Belmont to Catskills',
    title: 'Before you leave',
    sections: [
      {
        audience: 'helen',
        items: [
          'Download Bowery Boys #388 "Hudson River School" in Apple Podcasts',
          'Download Modern Art Notes #134 "Carl Andre"',
        ],
      },
      {
        audience: 'aurelia',
        items: [
          'Download latest from Mia Maples and Moriah Elizabeth on YouTube',
        ],
      },
      {
        audience: 'rafa',
        items: [
          'Download Godzilla fight compilations',
          'Download GrayStillPlays videos',
        ],
      },
    ],
  },

  fri17: {
    forDay: 'sat18',
    forLabel: 'Sat 18 · Catskills to Elizabethton',
    title: 'Prep for tomorrow',
    sections: [
      {
        audience: 'helen',
        items: [
          '99% Invisible #275 "Coal Hogs Work Safe"',
          'In The Past Lane #196 "The Molly Maguires"',
          'Dolly Parton\u2019s America Ep 6 "Hillbilly"',
        ],
      },
      {
        audience: 'aurelia',
        items: ['Download YouTube content for a long drive day'],
      },
      {
        audience: 'rafa',
        items: ['Spider-Verse clips', 'BeckBros', 'Size comparison videos'],
      },
      {
        audience: 'pack',
        items: [
          'Water shoes for Rafa (Paluxy River dinosaur footprints on Tue)',
        ],
      },
    ],
  },

  sat18: {
    forDay: 'sun19',
    forLabel: 'Sun 19 · Elizabethton to McComb',
    title: 'Prep for tomorrow',
    sections: [
      {
        audience: 'helen',
        items: [
          'Uncivil "The Song"',
          'Uncivil full-series episodes for Alabama',
          'Code Switch "Live From Birmingham"',
          'Seizing Freedom (first few episodes)',
        ],
      },
      {
        audience: 'aurelia',
        items: ['YouTube content for the drive'],
      },
      {
        audience: 'rafa',
        items: ['YouTube content for the drive'],
      },
      {
        audience: 'note',
        items: [
          'Long drive day \u2014 snacks and entertainment fully loaded.',
          'Jonathan is alone tonight for the ashes ceremony.',
        ],
      },
    ],
  },

  sun19: {
    forDay: 'mon20',
    forLabel: 'Mon 20 · McComb to Arlington',
    title: 'Prep for tomorrow',
    sections: [
      {
        audience: 'helen',
        items: [
          'Radiolab "The Flag and the Fury"',
          'Points South "Fannie Lou Hamer\u2019s Freedom Farm"',
          '99% Invisible "America\u2019s Last Top Model"',
          'Fresh Air Jesmyn Ward interview',
        ],
      },
      {
        audience: 'aurelia',
        items: ['Top up YouTube downloads'],
      },
      {
        audience: 'rafa',
        items: ['Top up YouTube downloads'],
      },
      {
        audience: 'note',
        items: [
          'Another long drive day through Mississippi and Louisiana into Texas.',
        ],
      },
    ],
  },

  // Mon 20 night → Tue 21 is intentionally empty per the addendum.
  // Everyone's settled at Donna's and Tue 21 is the team-split day.

  tue21: {
    forDay: 'wed22',
    forLabel: 'Wed 22 · Six Flags',
    title: 'Prep for tomorrow',
    sections: [
      {
        audience: 'pack',
        items: [
          'Comfortable shoes',
          'Change of clothes for Rafa',
          'Sunscreen',
          'Ponchos if rain is in the forecast',
        ],
      },
      {
        audience: 'note',
        items: [
          'Charge all devices fully \u2014 long day at the park.',
          'No podcast/YouTube prep needed \u2014 it\u2019s a park day.',
        ],
      },
    ],
  },

  wed22: {
    forDay: 'thu23',
    forLabel: 'Thu 23 · Arlington to Houston',
    title: 'Prep for tomorrow',
    sections: [
      {
        audience: 'warning',
        items: [
          'AXIOM 3 PM TOUR — closed-toe shoes required. NO phones / iPads / cameras inside; everything checked at reception. Photography banned. Pack/set aside tonight.',
          'Early start: 8 AM breakfast with the aunts, depart Arlington 9:30 AM. No sleeping in.',
        ],
      },
      {
        audience: 'helen',
        items: [
          'New Books in Architecture "Louis Kahn: Architecture as Philosophy"',
          '99% Invisible "The Mind of an Architect"',
          'Gravy "Czech Out Texas Kolaches"',
        ],
      },
      {
        audience: 'rafa',
        items: [
          'Axiom Space YouTube videos (prep for Chris\u2019s tour)',
          'ISS live feed highlights',
        ],
      },
      {
        audience: 'pack',
        items: [
          'Start consolidating luggage \u2014 only one more night after tonight.',
        ],
      },
    ],
  },

  thu23: {
    forDay: 'fri24',
    forLabel: 'Fri 24 · Houston + fly home',
    title: 'Prep for tomorrow',
    sections: [
      {
        audience: 'warning',
        items: [
          'DO NOT CHECK BAGS WITH: kids\u2019 iPads, chargers, snacks, headphones.',
        ],
      },
      {
        audience: 'note',
        items: [
          'Confirm car rental return location and time.',
          'Check in on the JetBlue app.',
        ],
      },
      {
        audience: 'helen',
        items: [
          'The Lonely Palette "Rothko\u2019s Untitled (Black on Gray)"',
          'ArtCurious #72 "Art Auction Audacity: Rothko\u2019s No. 6" for morning listening before the Chapel',
        ],
      },
    ],
  },
}
