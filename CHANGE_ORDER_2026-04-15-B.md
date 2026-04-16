# CHANGE ORDER — 2026-04-15-B (Schedule Update)

Amends the Friday itinerary data in CHANGE_ORDER_2026-04-15.md. The nav bar spec in that order is unchanged.

---

## FRIDAY APRIL 17 — REVISED SCHEDULE

### What changed since the previous order:
- Swoon Kitchenbar sit-down lunch is **cut**. Rafa cannot eat lunch at 2:30 PM.
- Lunch is fast food grabbed on the road between Eric Carle and Art Omi (I-91/I-90 corridor). No specific stop — driver's choice, whatever's off the highway.
- Art Omi remains a flex stop — skip if the car is done after Eric Carle.
- Hannaford grocery stop unchanged but list is refined.

### Revised Friday stops (in order):

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
      pitch: 'Rafa\'s stop. Art studio, watercolors, Very Hungry Caterpillar everywhere, reading library. Current exhibit: CLICK! Photographers Make Picture Books (Mo Willems, William Wegman, Walter Wick). Aurelia gets real visual art at her taste level. Helen gets picture book illustration treated as serious art.',
      hours: 'Fri 10 AM–4 PM (open Mon-Fri during MA April vacation week)',
      cost: '$9 adult / $6 youth (1-18)',
      vegNotes: 'No on-site restaurant. Café area for snacks only.',
      phone: '413-559-6300',
      website: 'https://carlemuseum.org',
      notes: 'Walk-ins welcome. Gift shop is excellent.',
    },
    {
      id: 'road-lunch',
      name: 'Fast food lunch (driver\'s choice)',
      address: null,
      arrival: '~12:00 PM',
      duration: '20-30 min',
      category: 'Food',
      persons: ['everyone'],
      primaryPerson: 'rafa',
      pitch: 'Feed the preschooler. Whatever\'s off the highway on I-91 or I-90. This is not a culinary moment.',
      notes: 'Between Amherst and Ghent. Do not attempt to delay this.',
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
      pitch: 'Helen\'s stop. 120 acres, 60+ large-scale contemporary sculptures. Tschabalala Self and Nayland Blake this season. Aurelia: photogenic walk-through installations. Rafa: giant colorful objects + open fields. Free.',
      hours: 'Fri 9 AM–5 PM (park open dawn to dusk)',
      cost: 'Free (donations accepted)',
      phone: '518-392-4747',
      website: 'https://artomi.org',
      registrationId: '#53020',
      notes: 'Registered. Check in at Benenson Visitor Center. Carry-in carry-out — no trash cans in the park. Do not touch or climb artwork.',
      flex: true,
      flexNote: 'Skip if the car is done after Eric Carle. Go straight to Hannaford.',
    },
    {
      id: 'groceries-catskill',
      name: 'Hannaford Supermarket',
      address: 'Catskill, NY (Route 23)',
      arrival: '~3:00 PM',
      duration: '30 min',
      category: 'Gas',
      persons: ['everyone'],
      pitch: 'Stock up. No restaurants at Postcard Cabins.',
      notes: '10 min from cabins. Last real grocery before the woods. THE LIST: firewood, s\'mores kit, breakfast supplies for Sat AM, Annie\'s organic white cheddar shells (Aurelia, non-negotiable), portobello caps + halloumi + good bread (Helen), hot dogs (Rafa), snacks for Sat drive south.',
    },
    {
      id: 'postcard-cabins',
      name: 'Postcard Cabins Eastern Catskills',
      address: '282 Cairo Junction Rd, Catskill, NY 12414',
      arrival: '4:00 PM',
      category: 'Lodging',
      persons: ['everyone'],
      pitch: 'Two cabins on 60 wooded acres. Bunk bed cabin (#92285479), queen cabin (#92289948). Neighboring cabin request submitted — not guaranteed.',
      hours: 'Check-in 4:00 PM / Check-out 11:00 AM',
      phone: '888-236-2427',
      notes: 'Contactless check-in via text. COOKING: two-burner stove + cookware + dishware inside each cabin. Fire pit + grill grate outside (wood fire, build it yourself). Mini-fridge. Cell service spotty. Landline in each cabin.',
    },
  ],
}
```

### Revised driving segments:
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
      to: 'Art Omi, Ghent, NY (with fast food stop en route)',
      duration: '~2 hrs including lunch stop',
      route: 'I-91 South to I-90 West to NY-66 South',
    },
    {
      from: 'Art Omi / Ghent',
      to: 'Hannaford → Postcard Cabins, Catskill, NY',
      duration: '~25 min',
      route: 'Route 9H South to Route 23 West',
    },
  ],
}
```

### REMOVED from previous order:
- ~~Swoon Kitchenbar~~ — cut. Lunch is highway fast food.

---

## TONIGHT CARD — FRIDAY (unchanged from previous order)

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
  notes: 'Neighboring cabin request submitted — not guaranteed. No restaurants on-site. Bring groceries. Each cabin: two-burner stove, cookware, mini-fridge, fire pit + grill grate (bring firewood). Contactless check-in via text.',
}
```
