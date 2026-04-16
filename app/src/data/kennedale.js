// Arlington structured days (Tue 21 team split, Wed 22 flat schedule)
// and Houston Friday with two schedule options. Content ported verbatim
// from the vanilla index.html via ROADTRIP_PWA_BUILD_SPEC.md.
//
// Schedule row text uses inline HTML (<strong>, <em>) — we render it via
// dangerouslySetInnerHTML inside the schedule table. Safe because it's
// fully-authored static content that ships with the app.

import { FLIGHT_SCENARIO } from './flightScenario'

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
          { time: '3:30', text: 'Head back to Arlington.' },
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

// Two Friday variants keyed by FLIGHT_SCENARIO. Both preserve Sat 25 PM
// volleyball tournament. Pick via getHoustonFriday().
const HOUSTON_FRIDAY_VARIANTS = {
  b6932: {
    dayLabel: 'Fri Apr 24',
    title: 'Fly Home (pack-and-go)',
    subtitle: 'Optional Broken Obelisk walk · B6 932 IAH → BOS · 1:17 PM',
    intro:
      'Current flight B6 932 departs IAH at 1:17 PM &mdash; Friday is pack-and-go only. No Menil art morning. Axiom and Rice already happened Thursday evening. <em>If flight changes to UA 592, flip <code>FLIGHT_SCENARIO</code> to see the full art morning.</em>',
    flightText: '✈️ B6 932 · IAH → BOS · Nonstop · Departs 1:17 PM · Arrives 5:58 PM EDT',
    footer:
      'Home in Belmont ~7:00 PM. Saturday volleyball tournament PM wave preserved.',
    schedule: [
      {
        time: '8:00',
        text: 'Wake, pack, coffee.',
      },
      {
        time: '9:30',
        text: '<em>Optional:</em> walk to <strong>Broken Obelisk</strong> &amp; Menil grounds (dawn&ndash;dusk, free, outdoor). Skip if running late.',
      },
      {
        time: '10:15',
        text: 'Load car, depart for IAH.',
        bring: 'Confirm JetBlue check-in done on app.',
      },
      {
        time: '11:15',
        text: 'Arrive <strong>IAH Terminal A</strong>. Return rental car, clear security, lunch airside.',
      },
      {
        time: '1:17',
        text: '<strong>B6 932 departs</strong> IAH → BOS.',
      },
      {
        time: '~7:00',
        text: 'Home in Belmont.',
      },
    ],
  },

  ua592: {
    dayLabel: 'Fri Apr 24',
    title: 'Rothko + Menil + Fly Home',
    subtitle: 'Rothko Chapel · Twombly · The Gift of Drawing · UA 592 IAH → BOS · 4:52 PM',
    intro:
      'UA 592 departs IAH at 4:52 PM CDT, giving the morning to Helen\u2019s pilgrimage. <strong>Must leave the Airbnb for IAH by 2:00 PM.</strong>',
    flightText: '✈️ UA 592 · IAH → BOS · Nonstop · Departs 4:52 PM · Arrives 9:46 PM EDT',
    footer:
      'Home in Belmont ~10:30 PM. Saturday volleyball tournament PM wave preserved.',
    schedule: [
      {
        time: '9:30',
        text: 'Walk from Airbnb to Rothko Chapel (~10 min).',
      },
      {
        time: '10:00',
        text: '<strong>Rothko Chapel</strong> &mdash; <em>everyone together</em>. 14 Rothko murals. Broken Obelisk + reflecting pool outside. <strong>Helen\u2019s lifelong first visit.</strong> 30&ndash;40 min.',
        bring: 'Quiet voices. No photography inside.',
      },
      {
        time: '~10:40',
        text: '<strong>SPLIT:</strong> Helen + Aurelia &rarr; Menil campus (opens 11 AM). Jonathan + Rafa &rarr; Menil grounds / Mandell Park playground.',
      },
      {
        time: '11:00',
        text: 'Helen + Aurelia enter <strong>Menil Collection</strong> main building. Magritte, Ernst, Pollock, AbEx &mdash; reconnaissance for the Hill Country house.',
      },
      {
        time: '~11:45',
        text: 'Helen + Aurelia &rarr; <strong>Cy Twombly Gallery</strong> (standalone Renzo Piano). Her #3 artist. Sailcloth ceilings, white oak floors. <em>Say Goodbye, Catullus</em> in the final room.',
      },
      {
        time: '~12:10',
        text: 'Helen + Aurelia &rarr; <strong>Menil Drawing Institute</strong>. <strong>NEW:</strong> <em>The Gift of Drawing: Cy Twombly</em> &mdash; opened Mar 27, closes Aug 9. ~30 works never shown in US.',
      },
      {
        time: '~12:30',
        text: '<strong>Dan Flavin</strong> at Richmond Hall (5 min, optional).',
      },
      {
        time: '12:35',
        text: 'Regroup for lunch &mdash; Common Bond Bistro or nearby Montrose spot.',
      },
      {
        time: '1:15',
        text: 'Back to Airbnb, grab bags, load car.',
      },
      {
        time: '2:00',
        text: '<strong>Depart for IAH</strong> (~35 min).',
      },
      {
        time: '2:35',
        text: 'Arrive IAH [check UA 592 terminal]. Return rental car, clear security.',
      },
      {
        time: '4:52',
        text: '<strong>UA 592 departs</strong> IAH → BOS. Arrives 9:46 PM EDT.',
      },
      {
        time: '~10:30',
        text: 'Home in Belmont.',
      },
    ],
  },
}

export const getHoustonFriday = () => HOUSTON_FRIDAY_VARIANTS[FLIGHT_SCENARIO]

// Back-compat export — resolves to the active variant so existing imports keep working.
export const HOUSTON_FRIDAY = HOUSTON_FRIDAY_VARIANTS[FLIGHT_SCENARIO]
