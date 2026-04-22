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
    title: 'Grapevine Mills full day + Hurtado with Donna',
    subtitle:
      'Meow Wolf · Bubble Planet · Peppa Pig · Round 1 · shopping · Hurtado 5:30 PM · Donna farewell dinner',
    schedule: [
      {
        time: '10:15',
        text: "<strong>Depart Donna's</strong> (2331 Bay Lakes Ct, Arlington).",
        bring: "Card with ceiling for Aurelia's shopping budget ($75, she picks). Rafa snacks.",
      },
      {
        time: '10:45',
        text: 'Arrive <strong>Grapevine Mills</strong> — 3000 Grapevine Mills Pkwy, Grapevine.',
      },
      {
        time: '10:45–12:30',
        text: '<strong>Meow Wolf: The Real Unreal</strong> (Suite 253). <em>Rafa tour-guides Helen</em> — her first visit. Aurelia + Jonathan take their own pass.',
      },
      {
        time: '12:30',
        text: 'Lunch — mall food court or <strong>Rainforest Cafe</strong> if Rafa needs the show.',
      },
      {
        time: '1:30',
        text: '<strong>Bubble Planet</strong> walk-by. $18.90 adult / $13.90 child if we commit. Ball pit possibly too tall for Rafa — not pre-booked.',
      },
      {
        time: '2:00',
        text: '<strong>Peppa Pig World of Play</strong> — 30-min attempt for Rafa (edge case, he is almost 5).',
      },
      {
        time: '2:30',
        text: '<strong>Round 1 Bowling &amp; Arcade</strong> — divide and conquer. Jonathan + Rafa bowl, Helen + Aurelia start shopping.',
      },
      {
        time: '3:30',
        text: '<strong>LEGO Store</strong> + <strong>Aurelia shopping</strong>. Store targets: American Eagle, Aerie, Hollister (both locations), PacSun, Hot Topic, H&amp;M, Forever 21, Herschel Supply Co.',
        bring: '"$75, you pick" — the agency is the point. Not a gift-economy move, a trip-souvenir-she-actually-wears move.',
      },
      {
        time: '4:30',
        text: 'Depart Grapevine Mills.',
      },
      {
        time: '4:55',
        text: "Home to change at Donna's.",
      },
      {
        time: '5:30',
        text: "<strong>Hurtado Barbecue — Arlington</strong>, 317 E Main St. <em>Donna farewell dinner</em>. Helen-safe: bean tacos, rajas tacos, cheese quesadillas confirmed on the veg menu.",
      },
      {
        time: '7:15',
        text: "Rafa bedtime. Car packed tonight — Thursday is 7:00 AM wheels-up.",
      },
    ],
    bail: {
      label: 'Bail options for today',
      rows: [
        {
          trigger: 'Kids are wrecked by 2 PM',
          pivot: "Skip Peppa Pig and the Round 1 second half. Go home early. Rafa naps before Hurtado.",
        },
        {
          trigger: 'Aurelia wants more shopping time',
          pivot: "Helen stays with Aurelia, Jonathan takes Rafa home at 3:30 to decompress. Everyone reconverges at Hurtado 5:30.",
        },
        {
          trigger: 'Rafa melts down at Meow Wolf',
          pivot: "Straight to Round 1 for the bowling reset. Skip Peppa Pig.",
        },
        {
          trigger: 'Hurtado wait is long (walk-in)',
          pivot: "Call on arrival for quote; if >25 min, Babe's Chicken or Esparza's Fort Worth are Donna-approved backups.",
        },
      ],
    },
    cutFromOriginal:
      'iFLY Frisco removed (Aurelia declined morning-of). Flower Child Southlake removed. Evening decompression replaced with Hurtado + Donna farewell dinner.',
  },
}

// Two Friday variants keyed by FLIGHT_SCENARIO. Both preserve Sat 25 PM
// volleyball tournament. Pick via getHoustonFriday().
const HOUSTON_FRIDAY_VARIANTS = {
  b6932: {
    dayLabel: 'Fri Apr 24',
    title: 'Fly Home (pack-and-go)',
    subtitle: 'B6 932 IAH → BOS · 1:17 PM · Art happened Thursday',
    intro:
      'Flight B6 932 departs IAH at 1:17 PM &mdash; Friday is pack-and-go only. Rothko Chapel + Menil main building already happened Thursday in compressed form (see Thursday schedule). <em>Optional morning bail: if Helen wants the Twombly Drawing Institute show, it&rsquo;s possible to squeeze in 10&ndash;11:30 AM before the airport — tight but doable, Menil Drawing Institute opens at 10 AM and IAH is 35 min from Montrose.</em>',
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
        time: '10:00',
        text: '<em>Optional bail:</em> <strong>Menil Drawing Institute</strong> — <em>The Gift of Drawing: Cy Twombly</em> (opens 10 AM, closes Aug 9). Tight but possible if Helen wants it. Leave by 11:30 AM.',
      },
      {
        time: '10:15',
        text: 'Load car, depart for IAH <em>(push to 11:30 if taking the Twombly bail)</em>.',
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
    bail: {
      label: 'Bail options for Friday',
      rows: [
        {
          trigger: 'Helen wants the Twombly Drawing Institute show',
          pivot: 'Menil Drawing Institute opens 10 AM. Walk there from Airbnb, leave by 11:30 AM for IAH (35 min drive). Tight but doable.',
        },
        {
          trigger: 'Flight delayed',
          pivot: 'Rothko Chapel re-visit as standby — it is 5 min from the Airbnb.',
        },
      ],
    },
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
