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
          },
          {
            time: '10:30',
            text: 'Paluxy River &mdash; 113M-year-old footprints. Bring water shoes.',
          },
          { time: '12:30', text: 'Lunch in Glen Rose.' },
          {
            time: '1:30',
            text: '<strong>Fossil Rim Wildlife Center</strong>. Drive-through safari. Giraffes.',
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
  subtitle:
    'Rothko · Menil · Cy Twombly · Rice · Axiom · B6 932 IAH → BOS',
  intro:
    "Two schedules &mdash; pick based on Chris's Axiom availability. Both include Rothko Chapel, Menil Collection, Cy Twombly Gallery, Rice University, and Axiom Space, and end at IAH for B6 932 to BOS.",
  flightText: '✈️ B6 932 · IAH → BOS · Nonstop',
  footer:
    "Schedule depends on Chris's availability and the B6 932 departure time. Both options get the family to IAH with time to spare.",
  options: [
    {
      key: 'a',
      title: 'Option A',
      subtitle: 'Art morning, Axiom afternoon',
      condition: 'If Chris is available early PM',
      schedule: [
        {
          time: '9:30',
          text: 'Pack up Airbnb. Walk to the Rothko Chapel.',
        },
        {
          time: '10am',
          text: '<strong>Rothko Chapel</strong> &mdash; everyone. 14 Rothko murals. Dark, contemplative, profound. <em>Helen has wanted this her entire adult life.</em>',
        },
        {
          time: '10:30',
          text: 'Walk to <strong>Menil Collection</strong> (opens 11am). Coffee nearby.',
        },
        {
          time: '11am',
          text: 'Helen + Aurelia enter the Menil. Jonathan + Rafa on the grounds.',
        },
        {
          time: '11:30',
          text: 'Helen &rarr; <strong>Cy Twombly Gallery</strong>. Her #3 artist. 20 min.',
        },
        { time: '12pm', text: 'Regroup. Drive to Rice for campus walk.' },
        {
          time: '1pm',
          text: '<strong>Rice University</strong> campus tour. Sallyport, Lovett Hall, the redesigned Academic Quad. Jonathan&rsquo;s campus.',
        },
        {
          time: '2pm',
          text: 'Drive to <strong>Axiom Space</strong> (Clear Lake, ~35 min).',
        },
        {
          time: '2:30',
          text: '<strong>Axiom tour with Chris</strong>. Mission Control, AxEMU suits, the real thing. 60&ndash;90 min.',
        },
        { time: '4:30', text: 'Drop rental car at IAH.' },
      ],
    },
    {
      key: 'b',
      title: 'Option B',
      subtitle: 'Axiom morning, art afternoon',
      condition: 'If Chris is available morning',
      schedule: [
        {
          time: '8:30',
          text: 'Pack up Airbnb. Drive to <strong>Axiom Space</strong>.',
        },
        {
          time: '9am',
          text: '<strong>Axiom tour with Chris</strong>. Mission Control, AxEMU suits. 60&ndash;90 min.',
        },
        {
          time: '11am',
          text: 'Drive to <strong>Rice University</strong>.',
        },
        {
          time: '11:30',
          text: '<strong>Rice</strong> campus walk + lunch at Rice Village.',
        },
        { time: '1pm', text: 'Drive to Menil area.' },
        {
          time: '1:30',
          text: '<strong>Rothko Chapel</strong>. <em>Helen has wanted this her entire adult life.</em>',
        },
        {
          time: '2pm',
          text: '<strong>Menil Collection</strong> + <strong>Cy Twombly Gallery</strong>. Helen &rarr; Twombly. Jonathan + Rafa on the grounds.',
        },
        { time: '3pm', text: 'Head to IAH. Return rental car.' },
      ],
    },
  ],
}
