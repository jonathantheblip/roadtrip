# CHANGE ORDER — 2026-04-15

Everything here is additive — nothing in the main spec changes unless explicitly noted.

---

## 1. NAVIGATION BAR — "NEXT STOP" + QUICK SEARCHES

### The problem
The app shows itinerary cards with individual nav links, but there's no persistent, always-visible way to say "take me to the next place" or "find me gas right now." On a road trip with a preschooler, you need these within one tap, not three scrolls.

### Feature: Persistent Navigation Bar

Add a sticky bottom bar (above any existing tab bar) visible on the Itinerary view. Two sections:

#### A. "Next Stop" Button
A prominent, full-width button showing the next scheduled destination. Tapping it opens the appropriate navigation app for the active person.

**Nav app routing (already in spec, restated for clarity):**
- **Jonathan** → Waze: `https://waze.com/ul?ll={lat},{lng}&navigate=yes&z=10`
- **Helen** → Apple Maps: `https://maps.apple.com/?daddr={encoded_address}`
- **Aurelia** → Apple Maps: `https://maps.apple.com/?daddr={encoded_address}`
- **Rafa** → Apple Maps: `https://maps.apple.com/?daddr={encoded_address}`

**Display format:**
```
┌─────────────────────────────────────────┐
│  ➤  Art Omi Sculpture Park              │
│     Ghent, NY · ~45 min                 │
│                          [NAVIGATE]     │
└─────────────────────────────────────────┘
```

- Show destination name, city/state, and estimated drive time from previous stop
- The `[NAVIGATE]` button opens the nav app
- Tapping anywhere else on the bar expands to show address and any arrival notes (e.g., "Register online first" or "Check-in 4:00 PM")
- After arriving (based on time-of-day passing the stop's scheduled window), auto-advance to the next stop. No GPS required — just use the schedule.

**Styling per theme:**
- Jonathan: Dark card, muted accent, compact
- Helen: Sage border, brass arrow icon, Playfair destination name
- Aurelia: Soft pink card, deep rose `NAVIGATE` button
- Rafa: High-contrast, bold uppercase destination, red `NAVIGATE` button that looks like a launch button

#### B. Quick-Search Row
A horizontal row of icon buttons immediately below the Next Stop bar. Each opens a search in the active person's nav app.

| Button | Label | Search query |
|--------|-------|-------------|
| ⛽ | Gas | `gas station` / `gas station near me` |
| 🌳 | Outside | `park` / `playground near me` |
| 🍔 | Food | `restaurant near me` |
| 🚻 | Rest Stop | `rest area` / `rest stop near me` |
| 🏥 | Emergency | `emergency room near me` |

**URL patterns:**
- **Waze (Jonathan):** `https://waze.com/ul?q={query}&navigate=yes`
- **Apple Maps (everyone else):** `https://maps.apple.com/?q={query}`

**Styling:**
- Compact icon buttons, ~44px touch targets minimum
- Labels below icons, small text
- Rafa's theme: icons are larger (56px), labels are UPPERCASE, and Emergency is always visible (not scrolled off)
- On narrow screens, the row scrolls horizontally if needed, but 5 buttons should fit comfortably on an iPhone SE and up

**Important:** These are "search near me" links. They rely on the phone's GPS to determine "near me." No location data is stored in the app — the nav app handles everything.

---

## 2. FRIDAY APRIL 17 — ITINERARY DATA UPDATE

Add the Eric Carle Museum as the first stop on Friday. Update stop order and timing:

### Updated Friday stops (in order):

```javascript
{
  day: 'fri17',
  stops: [
    {
      id: 'eric-carle-museum',
      name: 'Eric Carle Museum of Picture Book Art',
      address: '125 West Bay Road, Amherst, MA 01002',
      arrival: '10:30 AM',
      duration: '60-75 min',
      category: 'POI',
      persons: ['rafa', 'aurelia', 'helen'],
      primaryPerson: 'rafa',
      pitch: 'Rafa\'s stop. Art studio where he paints with watercolors, Very Hungry Caterpillar everywhere, reading library. Current exhibit CLICK! Photographers Make Picture Books — Mo Willems, William Wegman, Walter Wick turning cameras into stories. Aurelia gets real visual art framed for her taste level. Helen gets picture book illustration treated as serious art in a beautiful 40,000 sq ft building.',
      hours: 'Fri 10 AM–4 PM',
      cost: '$9 adult / $6 youth (1-18)',
      vegNotes: 'No on-site restaurant. Café area for snacks only.',
      phone: '413-559-6300',
      website: 'https://carlemuseum.org',
      notes: 'Open during MA April vacation week (Mon-Fri). Walk-ins welcome. Gift shop is excellent.',
    },
    {
      id: 'art-omi',
      name: 'Art Omi Sculpture & Architecture Park',
      address: '1405 County Route 22, Ghent, NY 12075',
      arrival: '1:15 PM',
      duration: '60-90 min',
      category: 'POI',
      persons: ['helen', 'aurelia', 'jonathan', 'rafa'],
      primaryPerson: 'helen',
      pitch: 'Helen\'s stop. 120 acres, 60+ large-scale contemporary sculptures in rolling hills. Tschabalala Self and Nayland Blake opening this season. Aurelia: genuinely photogenic, walk-through installations. Rafa: giant colorful objects + open fields = paradise. Free.',
      hours: 'Fri 9 AM–5 PM (park open dawn to dusk)',
      cost: 'Free (donations accepted)',
      phone: '518-392-4747',
      website: 'https://artomi.org',
      notes: 'REGISTER ONLINE IN ADVANCE — one registration per vehicle. Pre-register today so it\'s not a parking-lot-on-your-phone situation.',
      flex: true,
      flexNote: 'Skip if the car is done after Eric Carle. Go straight to lunch in Hudson or groceries in Catskill.',
    },
    {
      id: 'lunch-hudson',
      name: 'Swoon Kitchenbar',
      address: '340 Warren St, Hudson, NY 12534',
      arrival: '2:30 PM',
      duration: '45-60 min',
      category: 'Food',
      persons: ['helen', 'aurelia', 'jonathan', 'rafa'],
      primaryPerson: 'helen',
      pitch: 'Farm-to-table on Hudson\'s best street. Strong vegetarian options — not a "we have a garden burger" situation. Kid-friendly enough for Rafa without being a kids\' restaurant.',
      vegNotes: 'Excellent vegetarian options. Farm-to-table ethos.',
      hours: 'Check current hours — Hudson restaurants can be seasonal',
      flex: true,
      flexNote: 'Backup: Café Joust in Catskill — low-key coffee shop with solid vegan/GF options.',
    },
    {
      id: 'groceries-catskill',
      name: 'Hannaford Supermarket',
      address: 'Catskill, NY (Route 23)',
      arrival: '3:15 PM',
      duration: '30 min',
      category: 'Gas',
      persons: ['everyone'],
      pitch: 'Stock up for dinner. No restaurants at Postcard Cabins — dinner is whatever you grill on your fire pit. Grab firewood, hot dogs, s\'mores supplies, portobello caps and halloumi for Helen, good bread.',
      notes: '10 min from Postcard Cabins. Last real grocery before the woods.',
    },
    {
      id: 'postcard-cabins',
      name: 'Postcard Cabins Eastern Catskills',
      address: '282 Cairo Junction Rd, Catskill, NY 12414',
      arrival: '4:00 PM',
      category: 'Lodging',
      persons: ['everyone'],
      pitch: 'Check in. Two cabins — bunk bed (#92285479) and queen (#92289948). Neighboring cabin request submitted, not guaranteed. Contactless check-in, details sent by text. Fire pit, grill grate, forest views, 60 wooded acres.',
      hours: 'Check-in 4:00 PM / Check-out 11:00 AM',
      phone: '888-236-2427',
      notes: 'Cell service exists but is spotty. Landline in each cabin for emergencies. Cell phone lockbox provided if you want to disconnect.',
    },
  ],
}
```

### Driving segments for Friday:
```javascript
{
  day: 'fri17',
  segments: [
    {
      from: 'Belmont, MA',
      to: 'Eric Carle Museum, Amherst, MA',
      duration: '~90 min',
      route: 'I-90 West to I-91 North',
      depart: '9:00 AM',
    },
    {
      from: 'Eric Carle Museum',
      to: 'Art Omi, Ghent, NY',
      duration: '~90 min',
      route: 'I-91 South to I-90 West to NY-66 South',
    },
    {
      from: 'Art Omi / Hudson',
      to: 'Postcard Cabins, Catskill, NY',
      duration: '~25 min',
      route: 'Route 9H South to Route 23 West',
    },
  ],
}
```

---

## 3. TONIGHT CARD UPDATE — FRIDAY

Update Friday night lodging card (if "Tonight" cards from previous change order are implemented):

```javascript
{
  day: 'fri17',
  lodging: 'Postcard Cabins Eastern Catskills',
  address: '282 Cairo Junction Rd, Catskill, NY 12414',
  checkIn: '4:00 PM',
  checkOut: '11:00 AM',
  confirmations: ['#92285479 (bunk)', '#92289948 (queen)'],
  hostContact: '888-236-2427',
  wifiPassword: null,
  notes: 'Neighboring cabin request submitted — not guaranteed. No restaurants on-site. Bring groceries. Each cabin has fire pit + grill grate. Contactless check-in via text.',
}
```

---

## IMPLEMENTATION NOTES

- The Navigation Bar is the highest-priority item here. It transforms the app from "reference guide you scroll through" to "co-pilot that tells you where to go next."
- Quick-search buttons should feel like physical dashboard buttons — chunky, tappable, obvious. Nobody wants to parse UI when they need an emergency room.
- The Friday itinerary data can be merged into the existing stops array. Eric Carle Museum is new data; Art Omi should already exist in the spec.
- The `flex` flag on stops means the UI can display them with a lighter visual treatment or a "skip?" toggle — they're good-to-have, not must-do.
