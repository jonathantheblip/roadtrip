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
    title: 'DFW Day 2: Six Flags Replacement',
    subtitle:
      'iFLY Frisco (booked) · Meow Wolf Grapevine · Aurelia shopping · bail at every stage',
    schedule: [
      {
        time: '9:30',
        text: "<strong>Depart Donna's</strong> for iFLY Frisco. Pack waivers confirmation.",
        bring: 'iFLY waivers completed night before. Cash / card with ceiling for Aurelia shopping budget.',
      },
      {
        time: '10:15',
        text: 'Arrive <strong>iFLY Frisco</strong>. 8380 State Hwy 121, Frisco (not The Colony). 10:30 AM slot.',
      },
      {
        time: '10:30',
        text: '<strong>iFLY</strong> weekday Super Saver. Rafa 1 flight (~$75). Aurelia + Jonathan 2-flight Super Saver (~$75 ea). Helen spectates. Booked &gt;48h ahead — refund/reschedule rights preserved.',
      },
      {
        time: '~11:45',
        text: 'Exit iFLY, drive ~20 min to Southlake.',
      },
      {
        time: '12:15',
        text: 'Lunch: <strong>Flower Child Southlake</strong>. Real vegetarian for Helen, kid-friendly.',
      },
      {
        time: '1:30',
        text: '<strong>Meow Wolf Grapevine</strong> (return visit). Rafa tour-guides Helen. Aurelia + Jonathan take their own pass.',
      },
      {
        time: '3:00',
        text: '<strong>Bubble Planet</strong> walk-by (Grapevine Mills, same complex). $18.90 adult / $13.90 child. <em>Not pre-booked</em> — skip if energy spent. Ball pit may be too tall for Rafa.',
      },
      {
        time: '3:00',
        text: '<strong>Grapevine Mills shopping</strong> for Aurelia. Mall literally attached. 45–60 min. Budget frame: "$75, you pick" — the agency is the point.',
        bring:
          'Aurelia targets: American Eagle / Aerie, Hollister, PacSun, Hot Topic. Secondary: H&amp;M, Forever 21, Lids, Herschel, Dr. Martens. Helen anchor: LOFT Outlet / J.Crew Factory / Bath &amp; Body Works. Rafa containment: Round 1 bowling/arcade (drop-in), LEGO Store, Peppa Pig World of Play.',
      },
      {
        time: '4:15',
        text: 'Depart Grapevine Mills.',
      },
      {
        time: '4:45',
        text: "Home Arlington. 2.5h decompression before Rafa's 7:15 bedtime.",
      },
      {
        time: 'Evening',
        text: "Quiet night. <em>Donna farewell dinner moved to TUESDAY night</em> — not Thursday morning (Thursday is 7 AM wheels-up).",
      },
    ],
    bail: {
      label: 'Bail options (every decision point has a pivot)',
      rows: [
        {
          trigger: 'Kids reject iFLY at breakfast',
          pivot: "Drive straight to Meow Wolf Grapevine for 10 AM open (25 min). Lunch Main Street Bistro or Mi Día From Scratch. Afternoon Gaylord Texan atrium (free walk-in, $17 parking). Home by 4.",
        },
        {
          trigger: 'Rafa balks at iFLY gear-up',
          pivot: 'Aurelia + Jonathan fly as booked. Helen + Rafa spectate. $75 worst case. Already priced in — this is the expected scenario.',
        },
        {
          trigger: 'Aurelia also bails at iFLY',
          pivot: 'Skip iFLY. Drive 30 min south to Meow Wolf. Early lunch Flower Child Southlake on the way. Bubble Planet as backup.',
        },
        {
          trigger: 'Mood collapses post-iFLY',
          pivot: 'Skip Meow Wolf + Bubble Planet. Grapevine Main Street walk (10 min from iFLY). Aurelia photographs, Helen real lunch, Rafa runs sidewalks. Home by 3:30.',
        },
        {
          trigger: 'Meow Wolf is too much for Rafa (sensory)',
          pivot: 'Jonathan + Rafa exit to Round 1 for bowling/arcade. Helen + Aurelia finish Meow Wolf. Reconvene early dinner.',
        },
        {
          trigger: "Rafa toast during shopping",
          pivot: 'Jonathan + Rafa at Round 1 while Helen + Aurelia shop. Meet at car 4:15.',
        },
        {
          trigger: 'Weather surprises',
          pivot: "Everything indoor — no pivot needed. iFLY, Meow Wolf, Bubble Planet, Gaylord atrium all weather-proof.",
        },
        {
          trigger: 'Jonathan wants solo-Aurelia time',
          pivot: "Aurelia + Jonathan SomiSomi Carrollton run (35 min RT from Arlington). Slots into 4:30–6:30. Helen + Rafa at Donna's.",
        },
      ],
    },
    nostalgia: {
      label: "Nostalgia pivots (Jonathan's discretion, not in main plan)",
      note: 'All near The Colony, ~10 min each from iFLY Frisco:',
      rows: [
        '5716 Truitt — old house drive-by',
        'BB Owen Elementary',
        'Soccer fields — Rafa bait',
      ],
    },
    cutFromOriginal:
      'Six Flags Over Texas removed (kids not ready). SomiSomi / Rodeo Goat removed — evening is decompression at Donna\'s.',
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
