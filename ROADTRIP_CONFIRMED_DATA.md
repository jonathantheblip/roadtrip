# Road Trip PWA v2 — Confirmed Data Updates
## For Claude Code · April 12, 2026

Read all prior specs first. This document fills in TBDs, corrects data, and captures all confirmed details from booking research.

---

## 1. FLIGHT HOME CARD (Fri Apr 24)

Replace all TBD flight fields with:

```javascript
{
  flight: 'B6 932',
  confirmation: 'LONGQI',
  date: 'Fri Apr 24, 2026',
  departure: {
    airport: 'IAH',
    terminal: 'A',
    city: 'Houston, TX',
    time: '1:17 PM'
  },
  arrival: {
    airport: 'BOS',
    terminal: 'C',
    city: 'Boston, MA',
    time: '6:06 PM'
  },
  travelers: [
    { name: 'Helen Hemley', seat: '19D' },
    { name: 'Jonathan Jackson', seat: '19E' },
    { name: 'Rafael Jackson', seat: '13E' },
    { name: 'Aurelia Jackson', seat: '13F' }
  ],
  notes: 'Seating plan: one parent sits with each kid. Swap at the gate — Jonathan or Helen moves to row 13, one kid moves to row 19.',
  reminders: [
    'Return rental car by 11:00 AM (Terminal A area)',
    'Check in on JetBlue app morning of',
    'Pack kids\' iPads, chargers, headphones, and snacks in carry-on — NOT checked bags',
    'Rafa and Aurelia in row 13 (window + middle). Parents in row 19 (window + middle). Rearrange at gate.'
  ]
}
```

### Houston Friday schedule impact
The 1:17 PM departure means the family needs to be at IAH by ~11:15 AM (security + buffer), and return the rental car by ~10:45 AM. This makes **Option B (Axiom morning, art afternoon) impossible** — there's no afternoon. 

**Option A is the only viable schedule:**
- 9:00 AM: Walk to Rothko Chapel (opens 10am — arrive early, sit outside with coffee)
- 10:00 AM: Rothko Chapel
- 10:30 AM: Walk to Menil Collection + Cy Twombly Gallery
- 11:00-11:30 AM: Menil/Twombly (abbreviated visit — Helen prioritizes Twombly)
- 11:30 AM: Drive to IAH (~35 min from Montrose)
- 12:00 PM: Arrive IAH, return car, check in
- 1:17 PM: Depart

**Axiom Space tour must happen Thu Apr 23** — either morning (before arriving in Houston) or late afternoon after arriving. Coordinate with Chris. This resolves the Option A/B toggle — remove Option B from the app entirely and show only the confirmed schedule.

**Rice University campus visit moves to Thu Apr 23** as well — pair with Axiom if timing works, or skip if the day is too full after the DFW-to-Houston drive.

---

## 2. TONIGHT CARDS — CONFIRMED DATA

### Fri Apr 17 — Catskills NY
```javascript
{
  day: 'fri17',
  lodging: 'Cozy Rustic Farmhouse With Wood Stove',
  host: 'Olivia',
  hostConfirmed: true,
  address: 'TBD — get from Airbnb app listing page',
  checkIn: '3:00 PM',
  checkOut: 'Sat 11:00 AM',
  checkInMethod: 'TBD — message Olivia for details',
  guests: '3 adults, 1 child',
  wifiPassword: null,
  notes: 'Host confirmed — "looking forward to hosting you and your family." This was the 1-night exception to 3-night minimum — it worked.'
}
```

### Sat Apr 18 — Elizabethton TN
```javascript
{
  day: 'sat18',
  lodging: 'The Cottage on Cottage',
  host: 'Daphanie',
  hostPhone: '(423) 895-3020',
  address: '317 E Cottage Ave, Elizabethton, TN 37643',
  checkIn: '3:00 PM',
  checkOut: 'Sun 10:00 AM',
  checkInMethod: 'Self check-in with keypad',
  reservationCode: 'HM3RQZHCM4',
  cost: '$320',
  guests: '3 adults, 1 child',
  wifiPassword: null,
  notes: 'Jonathan alone for ashes ceremony. Privacy, porch, views. Keypad entry — no host coordination needed.'
}
```

### Sun Apr 19 — McComb MS
```javascript
{
  day: 'sun19',
  lodging: 'Grandma\'s house',
  host: 'Grandma',
  address: '1064 Quin Lane, McComb, MS 39648',
  checkIn: 'N/A — family home',
  checkOut: 'N/A',
  checkInMethod: 'N/A',
  guests: 'Family',
  notes: 'No booking needed. Staying overnight.'
}
```

### Mon Apr 20 through Wed Apr 22 — Kennedale TX (3 nights)
```javascript
{
  day: 'mon20',
  lodging: 'Aunt Donna\'s house',
  host: 'Aunt Donna',
  address: 'TBD — get Donna\'s address from Jonathan',
  checkIn: 'N/A — family home',
  checkOut: 'N/A',
  checkInMethod: 'N/A',
  guests: 'Family',
  notes: 'Staying 3 nights (Mon-Wed). Donna recently retired, flexible schedule. Aunt Debra joins for dinners (still working).'
}
```

### Thu Apr 23 — Houston TX
```javascript
{
  day: 'thu23',
  lodging: 'Montrose Clásica Mansion A',
  host: 'Phillip',
  coHost: 'Michelle (Phillips Assistant)',
  address: 'Confirm 1301 Marshall St matches Airbnb listing — get exact address from app',
  checkIn: '6:00 PM',
  checkOut: 'Fri 10:00 AM',
  checkInMethod: 'TBD — check Airbnb app for instructions',
  guests: '3 adults, 1 child',
  wifiPassword: null,
  notes: 'Strict rules: no loud noise, no smoking inside, no parties. Standard corporate Airbnb boilerplate but worth noting. Walking distance to Rothko Chapel and Menil Collection.'
}
```

---

## 3. CORRECTIONS AND REMOVALS

### Remove Houston Friday Option B
The 1:17 PM flight makes Option B (Axiom morning, art afternoon) impossible. Remove the Option A/B toggle entirely. Show only the confirmed morning schedule ending at IAH by noon.

### Remove Surreal Creamery
Permanently closed in Dallas. Already flagged in Data Addendum 2 but confirm it's gone from all data.

### Remove The Hills spoiler
Already flagged — confirm Aurelia's YouTube section has NO text suggesting The Hills is staged, scripted, or fake.

### Correct Houston Airbnb name
The spec says "1301 Marshall St" — the Airbnb listing name is "Montrose Clásica Mansion A | Downtown, MedCenter." Update the Tonight card to use both: the listing name and the street address.

---

## 4. OUTSTANDING TBDs (Jonathan needs to resolve)

These cannot be filled in by Claude Code — Jonathan needs to provide the data:

- [ ] Catskills farmhouse address (get from Airbnb app listing page)
- [ ] Houston Airbnb — confirm 1301 Marshall St is correct address
- [ ] Aunt Donna's address in Kennedale
- [ ] Chris's Axiom Space tour timing (must be Thu Apr 23 now, not Fri)
- [ ] Car rental company and pickup/return details (National Emerald Club status match approved but not showing in app yet)
- [ ] Houston Airbnb check-in instructions (keypad code? lockbox?)
- [ ] Catskills farmhouse check-in instructions (message Olivia)

When Jonathan provides these, update the corresponding Tonight cards and stop data.

---

## 5. NATIONAL CAR RENTAL

Status match from Marriott Gold to National Emerald Club: **approved** but not yet appearing in the National app/website. Jonathan has 89K Marriott points available. Car rental details (pickup location, vehicle class, confirmation number) are TBD — update the flight card's rental return instructions once confirmed.

For now, the flight card should say:
- "Return rental car at IAH by 11:00 AM"
- "Rental company: National (Emerald Club) — confirmation TBD"
