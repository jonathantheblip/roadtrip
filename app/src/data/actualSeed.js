// Seed data for the Actual Route Log — Saturday Apr 18 2026.
// Extracted from saturday_apr18_actual.md. Format chosen so the parser in
// actualLog.js can round-trip it back to that markdown closely.

export const ACTUAL_SEED = {
  days: [
    {
      date: '2026-04-18',
      departureLocation: 'Postcard Cabins, Catskill NY',
      overnightLocation: '317 E Cottage Ave, Elizabethton TN',
      totalDrivingHours: 14,
      reflection:
        '**What worked:**\n' +
        '- Mill Mountain Star earned its slot. A short vivid moment for Aurelia at night.\n' +
        "- Box Office was the right call on novelty — eating Italian two nights running would have dulled the week.\n" +
        '- Breaker for lunch kept Helen fed well; cascaded into an easier dinner choice.\n\n' +
        '**What we learned:**\n' +
        '- The Savona\'s / Roma\'s comparison is a real pattern. Novelty matters more than menu depth when eating three restaurant meals in 36 hours.\n' +
        '- 14 hours of driving is the ceiling, not a baseline. Sunday is 8 hours — deliberately shorter.\n' +
        '- Mid-afternoon driver swap was the right call.',
    },
  ],
  stops: [
    {
      id: 'seed-sat18-freds',
      date: '2026-04-18',
      arrivalTime: '08:30',
      name: "Fred's Coffee",
      type: 'meal',
      location: 'Catskill, NY',
      notes: 'Breakfast. Out the door to Scranton.',
      servedWhom: ['Jonathan', 'Helen', 'Aurelia', 'Rafa'],
      wasPlanned: false,
    },
    {
      id: 'seed-sat18-steamtown',
      date: '2026-04-18',
      arrivalTime: '10:45',
      name: 'Steamtown National Historic Site',
      type: 'activity',
      location: 'Scranton, PA',
      notes:
        "Rafa's anchor — working steam locomotives, big machines. Jonathan appreciated " +
        'the rail engineering. Aurelia tolerated; Helen used the time for a walk.',
      servedWhom: ['Rafa', 'Jonathan'],
      wasPlanned: true,
      plannedStopRef: 's2',
    },
    {
      id: 'seed-sat18-breaker',
      date: '2026-04-18',
      arrivalTime: '13:15',
      name: 'Breaker Brewing',
      type: 'meal',
      location: 'Wilkes-Barre, PA',
      notes:
        "Lunch. Confirmed open. Helen's vegetarian needs were met here — " +
        'this is why we picked it over roadside options.',
      servedWhom: ['Helen', 'everyone'],
      wasPlanned: false,
    },
    {
      id: 'seed-sat18-letort',
      date: '2026-04-18',
      arrivalTime: '15:30',
      name: 'LeTort Park',
      type: 'activity',
      location: 'Carlisle, PA',
      notes: "Rafa's run-around stop before the long afternoon stretch. ~30 min.",
      servedWhom: ['Rafa'],
      wasPlanned: false,
    },
    {
      id: 'seed-sat18-wvwc',
      date: '2026-04-18',
      arrivalTime: '17:21',
      name: 'West Virginia Welcome Center',
      type: 'other',
      location: 'I-81 S, WV',
      notes: 'Brief stop. Swapped drivers. Confirmed the dinner target.',
      servedWhom: ['Jonathan', 'Helen'],
      wasPlanned: false,
    },
    {
      id: 'seed-sat18-boxoffice',
      date: '2026-04-18',
      arrivalTime: '18:15',
      name: 'Box Office Brewery',
      type: 'meal',
      location: 'Strasburg, VA',
      notes:
        '1918 Strand Theater, converted to brewpub. Called ahead about Saturday ' +
        'night live music — asked for off-stage seating. Chose over Roma Casual ' +
        'because Italian two nights running would dull the week. Aurelia loved the ' +
        "1933-34 film posters. Rafa got pizza. Helen got the Beyond Burger. " +
        'Jonathan got a flight.',
      servedWhom: ['Helen', 'Aurelia', 'Jonathan', 'Rafa'],
      wasPlanned: false,
    },
    {
      id: 'seed-sat18-bucees',
      date: '2026-04-18',
      arrivalTime: '20:30',
      name: "Buc-ee's — Roanoke area",
      type: 'gas',
      location: 'Roanoke, VA',
      notes: 'Gas and snacks.',
      servedWhom: ['everyone'],
      wasPlanned: false,
    },
    {
      id: 'seed-sat18-millmtn',
      date: '2026-04-18',
      arrivalTime: '20:55',
      name: 'Mill Mountain Star',
      type: 'drive-by',
      location: 'Roanoke, VA',
      notes:
        '88-ft neon star, panoramic night view of Roanoke. ' +
        "Aurelia's photo stop. 15 minutes. Worth the detour.",
      servedWhom: ['Aurelia', 'Jonathan'],
      wasPlanned: false,
    },
    {
      id: 'seed-sat18-arrive',
      date: '2026-04-18',
      // Arrived at 12:25 AM on Sun Apr 19 — stored as 23:59 on Sat so it
      // sorts after the Mill Mountain photo stop without fragmenting the day.
      arrivalTime: '23:59',
      name: 'Arrived — Cottage on Cottage (12:25 AM)',
      type: 'overnight',
      location: '317 E Cottage Ave, Elizabethton TN',
      notes: 'Arrived ~12:25 AM. Rafa asleep early on I-26. Aurelia asleep by Johnson City.',
      servedWhom: [],
      wasPlanned: true,
    },
  ],
}
