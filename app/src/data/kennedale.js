// Kennedale structured days (Tue 21 team split, Wed 22 flat schedule)
// and Houston Friday with two schedule options. Content ported verbatim
// from the vanilla index.html via ROADTRIP_PWA_BUILD_SPEC.md.
//
// Schedule row text uses inline HTML (<strong>, <em>) — we render it via
// dangerouslySetInnerHTML inside the schedule table. Safe because it's
// fully-authored static content that ships with the app.

export const KENNEDALE_DAYS = {
  tue21: {
    key: 'tue21',
    dayLabel: 'Tue Apr 21',
    title: 'DFW Day 1: Divide & Conquer',
    subtitle:
      'Aunt Donna joins the girls · Dinosaur Valley + Fossil Rim for the boys · Aunt Debra at dinner',
    teams: {
      girls: {
        title: 'Helen + Aurelia + Aunt Donna',
        schedule: [
          {
            time: '10am',
            text: '<strong>Kimbell Art Museum</strong>, Fort Worth. Free. Louis Kahn. Caravaggio, Monet.',
          },
          {
            time: '11:30',
            text: '<strong>Modern Art Museum</strong>. Tadao Ando. Rothko, Richter.',
          },
          {
            time: '12:30',
            text: 'Lunch: <strong>HG Sply Co</strong>. &ldquo;Hunted&rdquo; + &ldquo;Gathered&rdquo; menu.',
          },
          {
            time: '2pm',
            text: '<strong>Bishop Arts</strong> or <strong>NorthPark</strong>. Aurelia&rsquo;s choice.',
          },
          {
            time: '3:30',
            text: '<strong>Le R&ecirc;ve Gelato</strong>. Trompe-l&rsquo;&oelig;il pastries.',
          },
        ],
      },
      guys: {
        title: 'Jonathan + Rafa',
        schedule: [
          {
            time: '9:30',
            text: 'Drive to <strong>Dinosaur Valley State Park</strong>.',
            bring: 'Water shoes (Paluxy River), sunscreen, towel, water bottles, bug spray',
          },
          {
            time: '10:30',
            text: 'Paluxy River &mdash; 113M-year-old footprints.',
          },
          { time: '12:30', text: 'Lunch in Glen Rose.' },
          {
            time: '1:30',
            text: '<strong>Fossil Rim Wildlife Center</strong>. Drive-through safari. Giraffes.',
            bring: 'Stay in the car \u2014 no special gear, but binoculars if you have them',
          },
          { time: '3:30', text: 'Head back to Kennedale.' },
        ],
      },
    },
    evening: {
      label: 'Evening (everyone)',
      schedule: [
        { time: '5:30', text: "Regroup at Aunt Donna's." },
        {
          time: '6:30',
          text: 'Dinner: <strong>Meso Maya</strong> (or <strong>Don Artemio</strong> for date night). Invite <strong>Aunt Debra</strong>.',
        },
      ],
    },
  },

  wed22: {
    key: 'wed22',
    dayLabel: 'Wed Apr 22',
    title: 'DFW Day 2: Six Flags + Viral Treats',
    subtitle: 'All-together energy day · Donna welcome',
    schedule: [
      {
        time: '9:30',
        text: '<strong>Six Flags Over Texas</strong>, Arlington. Gates open.',
        bring:
          'Comfortable shoes, change of clothes for Rafa, sunscreen, ponchos if rain',
      },
      {
        time: 'AM',
        text: 'Jonathan + Aurelia &rarr; big coasters. Helen + Rafa &rarr; Bugs Bunny Boomtown. Donna: Rafa partner if she comes (frees Helen to ride with Aurelia).',
      },
      { time: '12:30', text: 'Regroup for lunch inside the park.' },
      { time: '3:30', text: 'Leave before meltdown.' },
      {
        time: '4pm',
        text: '<strong>SomiSomi</strong> or <strong>Amorino Gelato</strong>. Viral dessert stop.',
      },
      {
        time: '6pm',
        text: 'Dinner: <strong>Rodeo Goat</strong>. Casual, patio. Great veggie options.',
      },
    ],
  },
}

export const HOUSTON_FRIDAY = {
  dayLabel: 'Fri Apr 24',
  title: 'Houston Morning + Fly Home',
  subtitle: 'Rothko · Menil · Cy Twombly · B6 932 IAH → BOS',
  intro:
    "B6 932 departs IAH at 1:17 PM, so Friday is a tight art morning only. Axiom Space and Rice University move to Thu Apr 23 &mdash; coordinate with Chris.",
  flightText: '✈️ B6 932 · IAH → BOS · Nonstop · Departs 1:17 PM',
  footer:
    'Arrive at IAH by noon. Car rental return by 10:45 AM at Terminal A.',
  schedule: [
    {
      time: '9:00',
      text: 'Pack up the Airbnb. Walk to the Rothko Chapel (opens 10am — sit outside with coffee).',
    },
    {
      time: '10:00',
      text: '<strong>Rothko Chapel</strong> &mdash; everyone. 14 Rothko murals. Dark, contemplative, profound. <em>Helen has wanted this her entire adult life.</em>',
      bring: 'Quiet voices. No photography inside.',
    },
    {
      time: '10:30',
      text: 'Walk to <strong>Menil Collection</strong> + <strong>Cy Twombly Gallery</strong>.',
    },
    {
      time: '11:00',
      text: 'Menil / Twombly &mdash; abbreviated visit. Helen prioritizes Twombly.',
    },
    {
      time: '11:30',
      text: 'Drive to IAH (~35 min from Montrose).',
    },
    {
      time: '12:00',
      text: 'Arrive IAH, return rental car, check in.',
    },
    {
      time: '1:17',
      text: '<strong>B6 932 departs</strong> IAH → BOS. Arrives 6:06 PM.',
    },
  ],
}
