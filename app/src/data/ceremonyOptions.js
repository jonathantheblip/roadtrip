// Sunday Apr 19 ceremony-morning options.
// Source: CHANGE_ORDER_2026-04-18_SUNDAY_MORNING.md
//
// IMPORTANT: These are OPTIONS, not a plan. No default, no "recommended"
// badge. No Jonathan on any option — he is at the ceremony. The word
// "ceremony" only appears in the card header, never in option bodies.

export const CEREMONY_OPTIONS = [
  {
    id: 'A',
    title: 'Slow Jonesborough morning',
    driveFromCabin: '15 min',
    timeEstimate: '2–3 hrs',
    serves: ['helen', 'aurelia', 'rafa'],
    gotcha:
      'Verify Main Street Cafe / Corner Cup Sunday hours before driving',
    detail:
      'Drive to Jonesborough (~15 min). Park on Main Street.\n' +
      'Breakfast at Main Street Cafe & Catering OR The Corner Cup — both local, ' +
      "both have vegetarian options for Helen.\n" +
      "Walk historic Main Street: Tennessee's oldest town (1779), brick " +
      'sidewalks, 18th-19th c. storefronts.\n' +
      'Griffin Art Gallery on Main Street if open (James & Debbie Griffin, ' +
      'local artist couple).\n' +
      'International Storytelling Center grounds — free to walk.\n\n' +
      "Helen gets a real breakfast + 18th-century architecture, " +
      'Aurelia gets a photogenic downtown, Rafa can run the brick sidewalks, ' +
      'no driving once parked.',
  },
  {
    id: 'B',
    title: 'Covered Bridge Park, Elizabethton',
    driveFromCabin: '5 min',
    timeEstimate: '45–60 min',
    serves: ['aurelia', 'rafa'],
    gotcha: 'Short — pair with another option',
    detail:
      '5 min from cabin. Elizabethton Covered Bridge (1882, still standing). ' +
      'Doe River park around it. Free, no schedule.\n\n' +
      'Stays close to cabin. Photogenic, short. Pair with breakfast somewhere ' +
      'to fill the window.',
  },
  {
    id: 'C',
    title: 'Sycamore Shoals grounds + river walk',
    driveFromCabin: '10 min',
    timeEstimate: '45–60 min',
    serves: ['rafa', 'helen'],
    // Per acceptance criterion 5 — caveat must be visible without expanding.
    gotcha: 'Visitor Center CLOSED until 1 PM Sunday — do grounds only',
    detail:
      '1651 W Elk Ave, Elizabethton · 10 min from cabin.\n' +
      'Park grounds + Watauga River walking path (open dawn to dusk).\n' +
      'Fort Watauga reconstruction visible from outside.\n' +
      '**Visitor Center opens 1 PM Sundays — not available during the morning window.**\n\n' +
      'River walk + historic site for Helen, run-around for Rafa.',
  },
  {
    id: 'D',
    title: 'Jonesborough breakfast + Sycamore Shoals combo',
    driveFromCabin: '15 min out, 10 min return',
    timeEstimate: '2.5–3 hrs',
    serves: ['helen', 'aurelia', 'rafa'],
    gotcha: 'Same Sunday-hours caveats as A and C',
    detail:
      'Breakfast in Jonesborough (15 min drive).\n' +
      'Return via Sycamore Shoals for 30-45 min river walk (10 min from cabin on the way back).\n' +
      'Two distinct stops without feeling rushed.\n\n' +
      'Best structure if the family wants variety without logistics hassle.',
  },
  {
    id: 'E',
    title: 'Stay at cabin',
    driveFromCabin: '0',
    timeEstimate: 'flexible',
    // Spec non-negotiable: Option E is a real, valid choice — no stigma.
    serves: ['helen', 'aurelia', 'rafa'],
    gotcha: null,
    detail:
      'Slow morning, coffee on the porch, cartoons for Rafa, phone time for Aurelia, book time for Helen.\n\n' +
      "A slow morning doesn't require the family to also do something. " +
      'Legitimate, non-failure choice.',
  },
  {
    id: 'F',
    title: 'Tweetsie Trail walk (flex / rain backup)',
    driveFromCabin: '5 min',
    timeEstimate: '45–90 min',
    serves: ['rafa', 'aurelia'],
    gotcha: 'Weather-dependent; use if rain',
    detail:
      'Paved rail-trail from Elizabethton trailhead. Stroller-friendly, ' +
      'stays close to town. Weather-dependent backup if raining at any of the above.',
  },
]
