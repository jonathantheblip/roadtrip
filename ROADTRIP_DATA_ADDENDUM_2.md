# Road Trip PWA v2 — Data Addendum #2
## Restaurant Links, Viral Stops, Energy-Burn Stops, and Weather Filtering
## For Claude Code · April 11, 2026

This addendum adds three categories of new data to the app and one new filter feature. Read the existing specs (ROADTRIP_PWA_BUILD_SPEC.md, ROADTRIP_REACT_REBUILD_SPEC.md, ROADTRIP_PWA_ADDENDUM.md) first — this layers on top.

---

## 1. RESTAURANT MENU & PHOTO LINKS

Add `menuUrl` and `photosUrl` to every restaurant stop that has them. Render as tappable secondary buttons on each stop card ("Menu" and "Photos") when the data exists. If a field is null, don't render the button.

On Helen's view, always show `vegNotes` expanded (not behind a tap). She needs to see vegetarian options at a glance.

### Link data per restaurant:

| Restaurant | City/State | menuUrl | photosUrl |
|---|---|---|---|
| Pond House Cafe | West Hartford, CT | https://pondhousecafe.com/brunch-lunch/ | https://www.yelp.com/biz_photos/pond-house-cafe-west-hartford-3 |
| Zohara Mediterranean Kitchen | West Hartford, CT | https://www.zoharact.com/menus/view/dinner | https://www.yelp.com/biz_photos/zohara-west-hartford |
| Mel the Bakery | Hudson, NY | null (no online menu — rotating daily) | https://www.yelp.com/biz_photos/mel-hudson |
| The Millworks | Harrisburg, PA | https://millworksharrisburg.com/menu/ | https://www.yelp.com/biz_photos/the-millworks-harrisburg |
| Red Meze | Johnson City, TN | https://www.redmezedowntown.com/menu | https://www.yelp.com/biz_photos/red-meze-downtown-johnson-city-2 |
| OvenBird | Birmingham, AL | https://www.ovenbirdrestaurant.com/menu-1 | https://www.yelp.com/biz_photos/ovenbird-birmingham |
| 10 South Rooftop | Vicksburg, MS | https://www.10southrooftop.com/#menu | https://www.yelp.com/biz_photos/10-south-rooftop-bar-and-grill-vicksburg |
| Don Artemio | Fort Worth, TX | https://www.donartemio.us/menus/ | https://www.yelp.com/biz_photos/don-artemio-fort-worth |
| Meso Maya | Dallas, TX | https://www.mesomaya.com/menu-downtown-dallas | https://www.yelp.com/biz_photos/meso-maya-comida-y-copas-dallas-4 |
| Cafecito FW | Fort Worth, TX | https://cafecitofw.com/food-menu | https://www.yelp.com/biz_photos/cafecito-fort-worth-2 |
| El Palote Panaderia | Dallas, TX | https://elpalote.com/order | https://www.yelp.com/biz_photos/el-palote-panaderia-dallas |
| Rodeo Goat | Fort Worth, TX | https://www.rodeogoat.com/fort-worth/ | https://www.yelp.com/biz_photos/rodeo-goat-fort-worth |
| HG Sply Co | Fort Worth, TX | https://www.hgsplyco.com/ordernow | https://www.yelp.com/biz_photos/hg-sply-fort-worth-10 |
| Le Rêve Gelato | Dallas, TX | null (rotating — see @lerevegp on Instagram) | https://www.yelp.com/biz_photos/le-r%C3%AAve-gelato-and-p%C3%A2tisserie-dallas |
| SomiSomi | Carrollton, TX | https://somisomi.com/taiyaki | https://www.yelp.com/biz_photos/somisomi-carrollton-3 |
| Amorino Gelato | Dallas, TX | https://www.amorino.com/en-us/category/flavors | https://www.yelp.com/biz_photos/amorino-dallas-2 |
| Samad's Cafe | Dallas, TX | null (no website — cash-only, one-man kitchen) | https://www.yelp.com/biz_photos/samad-cafe-dallas |
| Brunchaholics | DeSoto, TX | https://bh-229917.square.site/ | https://www.yelp.com/biz_photos/brunchaholics-desoto |
| Catrina Grill | Dallas, TX | null (Instagram @catrina_grill only) | https://www.yelp.com/biz_photos/catrina-grill-dallas-dallas |
| Hugo's | Houston, TX | https://www.hugosrestaurant.net/menu/vegan-vegetarian-menu/ | https://www.yelp.com/biz_photos/hugos-houston |
| Candente | Houston, TX | https://www.candentehtx.com/s/Main-Food-Menu.pdf | https://www.yelp.com/biz_photos/candente-museum-district-houston |
| El Tiempo Cantina | Houston, TX | https://www.eltiempocantina.com/menu | https://www.yelp.com/biz_photos/el-tiempo-cantina-richmond-houston-2 |
| Common Bond | Houston, TX | https://www.commonbondcafe.com/bistro-and-bakery-menu/ | https://www.yelp.com/biz_photos/common-bond-bistro-and-bakery-montrose-houston |
| Suzie's Pastry Shoppe | Houston, TX | https://www.suziespastryshoppe.com/category/all-products | https://www.yelp.com/biz_photos/suzies-pastry-shoppe-houston |
| Collin Street Bakery | Corsicana, TX | https://cafe.collinstreet.com/order/collin-street-bakery-downtown-corsicana-401-w-7th-ave | https://www.yelp.com/biz_photos/collin-street-bakery-corsicana |
| Sam's Original | Fairfield, TX | null (buffet — no real menu online) | https://www.yelp.com/biz_photos/sams-original-restaurant-fairfield-2 |

### IMPORTANT: Remove Surreal Creamery from the app entirely — it is permanently closed in Dallas. Replace with Amorino Gelato (Dallas or Plano location) as the viral dessert stop.

---

## 2. VIRAL STOPS — add as Discover POIs with type "viral"

Add these as browse-and-discover stops. Set `category: 'discover'`, `types: ['viral']` (add 'photo' and/or 'food' where noted). Set `day: null` unless noted otherwise. Include person tags and pitches for each.

### New York
```javascript
{
  name: 'Storm King Art Center',
  state: 'NY',
  address: '1 Museum Rd, New Windsor, NY 12553',
  types: ['viral', 'photo', 'poi'],
  persons: ['helen', 'aurelia', 'rafa', 'everyone'],
  pitch: {
    aurelia: 'Giant sculptures across 500 acres of rolling hills — Charli XCX held her Brat listening party here. 140K Instagram followers for a reason ✨',
    helen: 'World-class outdoor sculpture collection — Calder, Serra, Maya Lin — across a landscape that earns every photograph.',
    rafa: 'HUGE metal sculptures bigger than a HOUSE across giant green fields! Bike rides and tram rides! 🔥',
    jonathan: 'Book parking in advance on weekends — it sells out. Tram available if walking is too much for Rafa.'
  },
  details: 'Varies seasonally — typically Wed-Mon 10am-5:30pm, April-November. Book parking online for weekends.',
  star: true
}
```

### Pennsylvania
```javascript
{
  name: 'Haines Shoe House',
  state: 'PA',
  address: '197 Shoe House Rd, Hellam, PA 17406',
  types: ['viral', 'photo'],
  persons: ['aurelia', 'rafa', 'everyone'],
  pitch: {
    aurelia: 'A five-story house shaped like a work boot, built by a shoe magnate in 1948. The living room is in the toe. Moriah Elizabeth coded 📸',
    rafa: 'IT IS A GIANT SHOE! A HOUSE MADE OF A SHOE! 🔥',
    helen: 'Genuine Americana folk art. Charming in a "you cannot make this up" way.',
    jonathan: 'Right off Route 30 near I-83. Easy I-81 detour. Exterior viewable anytime; interior tours by booking.'
  },
  details: 'Exterior viewable anytime. Interior tours and Airbnb by booking ($269/night). Off Route 30 near I-83.'
}
```

### Virginia
```javascript
{
  name: 'Natural Bridge State Park',
  state: 'VA',
  address: '15 Appledore Ln, Natural Bridge, VA 24578',
  types: ['viral', 'photo', 'energy'],
  persons: ['aurelia', 'rafa', 'helen', 'everyone'],
  pitch: {
    aurelia: 'A 215-foot natural limestone arch — one of the most viral Virginia spots on TikTok (2.1M views). Thomas Jefferson once owned this ✨',
    rafa: 'GIANT ROCK ARCH! WATERFALL! 137 stairs to climb! 🦖',
    helen: 'A National Historic Landmark with genuine geological grandeur. The Cedar Creek trail to Lace Falls is beautiful.',
    jonathan: '$9 adults, $6 kids 6-12, under 6 free. Open 9am-dusk. Free parking. Off I-81 Exit 175.'
  },
  details: '$9 adults, $6 kids 6-12, under 6 free. Open 9am-dusk. Free parking. Wear good shoes for the 137 stairs.'
}

{
  name: 'Virginia Safari Park',
  state: 'VA',
  address: '229 Safari Ln, Natural Bridge, VA 24578',
  types: ['viral', 'energy'],
  persons: ['rafa', 'aurelia', 'helen', 'everyone'],
  pitch: {
    rafa: 'ANIMALS COME RIGHT UP TO YOUR CAR WINDOW! Zebras! Camels! Ostriches! GIRAFFES! ⚡🦖',
    aurelia: 'Feed a giraffe from a tower and walk through a kangaroo enclosure. Peak Instagram ✨',
    helen: 'A genuine 180-acre drive-through zoo. The giraffe feeding tower is the highlight. Expect your car to get messy.',
    jonathan: '$27.95 adults, $20.95 kids 2-12, under 2 free. Buy multiple feed buckets ($5 each). Go early when animals are hungriest.'
  },
  details: 'Adults $27.95, kids 2-12 $20.95, under 2 free. Feed buckets $5 each. Open mid-March through late November. Go early.'
}

{
  name: 'White Oak Lavender Farm',
  state: 'VA',
  address: '3810 Cross Keys Rd, Harrisonburg, VA 22801',
  types: ['viral', 'photo'],
  persons: ['aurelia', 'helen', 'everyone'],
  pitch: {
    aurelia: 'U-pick lavender fields, lavender ice cream, lavender lemonade slushies, and alpacas. Core aesthetic ✨',
    helen: 'Wine tasting at a lavender farm with alpacas and goats. Your Pinterest board made real.',
    rafa: 'Goats and miniature horses! 🐐',
    jonathan: 'Off I-81 Exit 245. Open 7 days. U-pick $8 for 50 stems. Peak bloom June-July but farm is open year-round.'
  },
  details: 'Open 7 days year-round. Lavender shop 10am-6pm (April-Nov). U-pick $8 for 50 stems. Off I-81 Exit 245.'
}

{
  name: 'Route 11 Potato Chips Factory',
  state: 'VA',
  address: '11 Edwards Way, Mount Jackson, VA 22842',
  types: ['viral', 'food'],
  persons: ['aurelia', 'rafa', 'everyone'],
  pitch: {
    aurelia: 'Watch hand-cooked kettle chips get made through big windows. Free samples of every flavor 🤤',
    rafa: 'Watch chips fry in GIANT KETTLES! Free chips! ⚡',
    helen: 'A real artisan producer, not corporate. The Mama Zuma Revenge flavor is a TikTok challenge staple.',
    jonathan: 'Off I-81 Exit 269. Mon-Sat 9am-5pm. Frying happens Tue-Fri — call 800-249-SPUD to confirm.'
  },
  details: 'Mon-Sat 9am-5pm. Frying Tue-Fri — call 800-249-SPUD to confirm production. Free samples. Off I-81 Exit 269.'
}
```

### Texas — DFW
```javascript
{
  name: 'Samad\'s Cafe',
  state: 'TX',
  address: 'Near Manor Way, Dallas, TX (near Love Field)',
  types: ['viral', 'food'],
  persons: ['helen', 'jonathan', 'everyone'],
  pitch: {
    helen: 'An 84-year-old Persian man has cooked here alone since 1989. When TikTok raised $3,000 for him, he declined — he saves tips to help people with medical bills.',
    jonathan: 'The TikTok video hit 13 million views. The lamb shank is the star. Cash only. 6-item menu.',
    aurelia: 'The most wholesome viral story on TikTok — 13M views. The food is incredible Persian home cooking ✨',
    rafa: 'A tiny restaurant run by one nice old man! 🔥'
  },
  details: 'Cash preferred. Mon-Fri 11:30am-4pm, Sat 11:30am-3pm. Closed Sunday. Expect waits since going viral.',
  star: true
}

{
  name: 'Brunchaholics',
  state: 'TX',
  address: '211 N Hampton Rd, DeSoto, TX 75115',
  types: ['viral', 'food'],
  persons: ['helen', 'jonathan', 'aurelia', 'everyone'],
  pitch: {
    aurelia: 'Keith Lee (16M TikTok followers) reviewed this and left a $2,000 tip. The Soul Food Burrito has fried catfish, mac and cheese, yams, and collard greens in a jalapeño tortilla ✨',
    helen: 'Cajun-Creole brunch from a Black-owned restaurant that went from unknown to legendary overnight. The food is genuinely incredible.',
    jonathan: 'Keith Lee video got 662K+ likes. Go early — very busy since the review.',
    rafa: 'Big burritos! Mac and cheese! 🔥'
  },
  details: 'Wed-Sat 11am-8pm, Sun 12-5pm. Closed Mon-Tue. Can be very busy — go early.',
  star: true
}

{
  name: 'Fort Worth Water Gardens',
  state: 'TX',
  address: '1502 Commerce St, Fort Worth, TX 76102',
  types: ['viral', 'photo', 'energy'],
  persons: ['aurelia', 'helen', 'rafa', 'everyone'],
  pitch: {
    aurelia: 'Walk 40 feet down terraced steps into a cascading water pool surrounded by rushing water. Multiple viral TikToks ✨',
    helen: 'Philip Johnson-designed brutalist architecture. Stunning.',
    rafa: '⚠️ HOLD HIS HAND TIGHTLY. Steps are wet, water is loud. He will love it but needs close supervision. ⚡',
    jonathan: 'Free. Open dawn to dusk. Best on weekday mornings. Non-slip shoes recommended.'
  },
  details: 'Free. Open daily dawn to dusk. Philip Johnson design. Non-slip shoes strongly recommended — steps are wet.',
  star: true
}

{
  name: 'Deep Ellum Murals',
  state: 'TX',
  address: 'Between Commerce St and Elm St, Dallas, TX',
  types: ['viral', 'photo'],
  persons: ['aurelia', 'helen', 'everyone'],
  pitch: {
    aurelia: '130+ murals in one neighborhood — the Deep Ellumphants, the Traveling Man robot sculptures, and an 8,500 sq ft Tristan Eaton mural. Instagram walking tour ✨',
    helen: 'Street art with genuine artistic credibility — Tristan Eaton is internationally known. The Traveling Man sculptures are scrap-metal art along the DART rail.',
    rafa: 'GIANT ROBOT sculptures! Giant elephant mural! Big colorful walls! 🔥',
    jonathan: 'Weekday mornings for fewer crowds and better light. Free, always accessible. Between Good Latimer Expwy and S Walton St.'
  },
  details: 'Free, always accessible. Key walls: Deep Ellumphants (3601 Main), Tribute to Texas (2700 Commerce), Traveling Man along DART rail. Best weekday mornings.'
}

{
  name: 'Giant Eyeball',
  state: 'TX',
  address: '1601 Main St, Dallas, TX 75201',
  types: ['viral', 'photo'],
  persons: ['aurelia', 'rafa', 'everyone'],
  pitch: {
    aurelia: 'A 30-foot hyper-realistic fiberglass eyeball by artist Tony Tasset. One TikTok has 319K+ likes. Bizarre and striking ✨',
    rafa: 'GIANT EYEBALL! BIGGER THAN A CAR! 🔥👁',
    helen: 'Legitimate contemporary art installation in the garden of The Joule Hotel.',
    jonathan: 'Visible 24/7 from the street. Close-up access limited to hotel guests. Free. 5-minute photo stop.'
  },
  details: 'Visible 24/7 from the street. In the garden of The Joule Hotel. Free. 5-minute stop.'
}

{
  name: 'Catrina Grill',
  state: 'TX',
  address: '3250 N Buckner Blvd, Dallas, TX 75228',
  types: ['viral', 'food'],
  persons: ['helen', 'aurelia', 'everyone'],
  pitch: {
    aurelia: 'A family-owned restaurant that nearly went out of business until the owner\'s daughter Katia posted a TikTok plea. It went viral, both locations sold out the next day ✨',
    helen: 'Family-owned, authentic Mexican, great food. The birria tacos, choco-flan, and churros with dulce de leche are the draws.',
    jonathan: 'Also a Lewisville location (383 Huffines Blvd). Birria tacos $10.99.',
    rafa: 'Churros! 🔥'
  },
  details: 'Also at 383 Huffines Blvd, Lewisville. Birria tacos $10.99. Churros with dulce de leche.',
  vegNotes: 'Limited vegetarian — cheese quesadillas, rice and beans, churros.'
}
```

### Texas — Houston
```javascript
{
  name: 'Biscuit Paint Wall',
  state: 'TX',
  address: '1435 Westheimer Rd, Houston, TX 77006',
  types: ['viral', 'photo'],
  persons: ['aurelia', 'helen', 'everyone'],
  pitch: {
    aurelia: 'Houston\'s most photographed mural — a colorful paint-pour illusion by French artist Mr. D. Named part of the most Instagrammable neighborhood in the US by Time Out ✨',
    helen: 'Walk east along Westheimer from here to catch the 90s Cartoon Wall and the Pride Mural. Montrose\'s visual signature.',
    jonathan: 'Mid-afternoon on a weekday for the best shot without cars. Walking distance from the Airbnb.'
  },
  details: 'Free, always accessible. Best mid-afternoon weekday. Walking distance from 1301 Marshall St Airbnb.'
}

{
  name: 'Suzie\'s Pastry Shoppe',
  state: 'TX',
  address: '8619 Richmond Ave, Houston, TX 77063',
  types: ['viral', 'food'],
  persons: ['aurelia', 'helen', 'rafa', 'everyone'],
  pitch: {
    aurelia: 'Realistic fruit-shaped pastries that crack open to reveal mousse and ganache — 5+ million TikTok views. The cutting-open reveal is peak satisfying content ✨',
    helen: 'They are genuinely beautiful and taste excellent. Mediterranean and European pastry traditions.',
    rafa: 'Colorful fruit that is actually CAKE! MAGIC! 🔥',
    jonathan: 'Not in Montrose — 8619 Richmond Ave, about 15 min drive. Call ahead: (832) 831-0516.'
  },
  details: 'Call ahead: (832) 831-0516. Not walkable from Airbnb — 15 min drive. 5M+ TikTok views on fruit pastry reveals.',
  star: true
}

{
  name: 'Beer Can House',
  state: 'TX',
  address: '222 Malone St, Houston, TX 77007',
  types: ['viral', 'photo', 'poi'],
  persons: ['aurelia', 'helen', 'rafa', 'everyone'],
  pitch: {
    aurelia: 'A house covered in 50,000+ recycled beer cans — one man started in 1968 and never stopped. When wind blows, the can curtains tinkle ✨',
    helen: 'Real outsider art with a remarkable backstory. Named one of America\'s top 50 roadside attractions by Time.',
    rafa: 'Shiny! Noisy! Strange! 🔥',
    jonathan: 'Wed-Sun 10am-4pm. $5 adults, free for kids under 12. Self-guided tour ~30 minutes. Near Rice Military.'
  },
  details: 'Wed-Sun 10am-4pm. $5 adults, free under 12. Self-guided ~30 min. 222 Malone St (Rice Military area).'
}
```

---

## 3. ENERGY-BURN STOPS — add as stops with type "energy"

Add these as planned or discover stops depending on whether they're on a specific driving day. Set `types: ['energy']`. Add `indoor: true` or `indoor: false` to each stop's data — this is critical for the weather filter (see section 4).

I have a full researched list of 40+ energy-burn stops organized by driving day. The data is long — here are the star picks to prioritize for each day. Add these first, then backfill with the complete list:

### Day 1 (Fri 17): Belmont to Catskills
- **Bushnell Park** (Hartford CT) — outdoor, carousel + playground. 1 Jewell St, Hartford, CT 06103. Free (carousel $2).
- **Connecticut Science Center** (Hartford CT) — INDOOR. 250 Columbus Blvd, Hartford, CT 06103. ~$28 adult/$20 child.
- **Mid-Hudson Children's Museum** (Poughkeepsie NY) — INDOOR. 75 N Water St, Poughkeepsie, NY 12601. $14.50/person.

### Day 2 (Sat 18): Catskills to Elizabethton
- **Gypsy Hill Park** (Staunton VA) — outdoor, 214 acres, duck pond, mini-train. 600 Churchville Ave, Staunton, VA 24401. Free. ⭐ Best park on I-81.
- **Mill Mountain Park** (Roanoke VA) — outdoor + indoor Discovery Center. 2000 Mill Mountain Spur, Roanoke, VA 24014. Free (zoo $12-14).
- **Kids Square Children's Museum** (Roanoke VA) — INDOOR. 1 Market Square SE, Roanoke, VA 24011. $9/person.
- **Hands On! Discovery Center** (Gray TN) — INDOOR. 1212 Suncrest Dr, Gray, TN 37615. $11/person. Fossil dig site!

### Day 3 (Sun 19): Elizabethton to McComb
- **Splasheville / Pack Square Park** (Asheville NC) — outdoor splash pad. 121 College St, Asheville, NC 28801. Free. Check if splash pad is running in April.
- **PlayPalz Indoor Playground** (Cleveland TN) — INDOOR. 820 25th St NW, Suite 3, Cleveland, TN 37312. Sun 1-5pm.
- **Noccalula Falls Park** (Gadsden AL) — outdoor, 90-ft waterfall + train + petting zoo. 1500 Noccalula Rd, Gadsden, AL 35904. Adults $8, kids 4-12 $6, under 4 free. ⭐
- **Mississippi Children's Museum Meridian** — INDOOR + outdoor. 403 22nd Ave, Meridian, MS 39301. $10/person. Sun 1-6pm. ⭐
- **Optimist Park** (Hattiesburg MS) — outdoor, GATED PLAYGROUND with single entry/exit. 345 Hegwood Rd, Hattiesburg, MS 39402. Free. ⭐

### Day 4 (Mon 20): McComb to Kennedale
- **Catfish Row Children's Art Park** (Vicksburg MS) — outdoor, riverboat playground on Mississippi River. 1200 Levee St, Vicksburg, MS 39183. Free. ⭐
- **Louisiana Purchase Gardens & Zoo** (Monroe LA) — outdoor, 80-acre zoo + splash pad + train. 1405 Bernstein Park Rd, Monroe, LA 71202. Adults $10, kids $7. ⭐ Best stop on the Louisiana stretch.
- **KidsView Playground** (Longview TX) — outdoor, castle-themed + splash pad. 100 H.G. Mosley Pkwy, Longview, TX 75602. Free.

### Day 5 (Thu 23): Kennedale to Houston
- **Bear Branch Park** (The Woodlands TX) — outdoor, inclusive playground + sprayground. 5200 Research Forest Dr, The Woodlands, TX 77381. Free. ⭐
- **Kanga's Indoor Playcenter** (Oak Ridge North TX) — INDOOR. 26803 Hanna Rd, Bldg 6, Suite 601-604, Oak Ridge North, TX 77385. Daily 9am-6pm. Rated 4.7/5. ⭐

---

## 4. WEATHER-AWARE FILTERING

Add an `indoor` boolean field to every energy-burn stop:
- `indoor: true` — works in rain
- `indoor: false` — outdoor only

In the Itinerary and Discover tabs, add a toggle or filter pill: "☔ Rainy Day" / "☀️ Any Weather"

When "Rainy Day" is active:
- Energy stops filter to show only `indoor: true` options
- Food stops are unaffected (restaurants are always indoors)
- POI stops that are outdoor-only get a small "outdoor" tag so the user knows

This should be a simple boolean filter, not a weather API integration. The family checks weather on their phones — this filter just helps them quickly find what works when it's raining.

---

## 5. NOTES

- **Surreal Creamery is permanently closed** in Dallas. Remove it from all data. Replace references with Amorino Gelato.
- The complete energy-burn stop list (40+ stops with full addresses) is available in the research — the star picks above are the priority. If time permits, add the full list as discover POIs by state with `types: ['energy']`.
- Every energy-burn stop should be tagged for Rafa (`persons: ['rafa', 'everyone']`) since he's the primary user. Indoor options can also be tagged for Aurelia if they're age-appropriate (children's museums, etc.).

Push after adding restaurant links, then viral stops, then energy stops, then the weather filter. Each section is independently useful.
