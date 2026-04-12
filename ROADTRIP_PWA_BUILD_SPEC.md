# Jackson Family Road Trip PWA — Build Spec
## For Claude Code · April 10, 2026

---

## PROJECT OVERVIEW

Rebuild a Progressive Web App for a family road trip from Belmont, MA to Kennedale, TX to Houston, TX, April 17–24, 2026. Four family members, four themed interfaces, one shared data layer. The app is hosted on GitHub Pages and installed on iPhones (3 phones + 1 iPad Pro) via Add to Home Screen. It must work offline in areas with no cell service (rural Mississippi, Louisiana, Virginia mountains).

**Current repo:** Already on GitHub Pages. Contains three files: `index.html`, `sw.js`, `manifest.json`. The current version works but needs a major rebuild with new content and features.

**Target devices:**
- Jonathan: iPhone (Waze navigation links)
- Helen: iPhone (Apple Maps navigation links)  
- Aurelia: iPhone (TikTok search links + Apple Maps)
- Rafa: iPad Pro (YouTube app links + Apple Maps) — design should take advantage of the larger screen

---

## ARCHITECTURE

Single-page app. All data inline in the HTML file (no external API calls). Three files total:

1. `index.html` — the entire app (HTML + CSS + JS + data)
2. `sw.js` — service worker for offline caching
3. `manifest.json` — PWA manifest for Add to Home Screen

No build tools, no frameworks, no npm. Vanilla HTML/CSS/JS only. Everything must work from a static file server (GitHub Pages).

---

## THE FOUR THEMES

Each person gets a complete visual theme that transforms the entire app. Selected via buttons at the top. Persisted in localStorage.

### Jonathan (default, dark mode)
- **Background:** #1a1714 (warm near-black)
- **Card:** #2c2620
- **Text:** #e8e0d4
- **Accent:** #c0734a (warm copper)
- **Font feel:** Clean, understated, DM Sans + DM Serif Display
- **No emoji in UI text**
- **Navigation links open Waze** (`https://waze.com/ul?ll={lat},{lng}&navigate=yes`)
- **Vibe:** Control panel. The dad's view. Information-dense, zero decoration.

### Helen (light mode, inspired by her Pinterest)
- **Background:** #f5f1ec (warm linen)
- **Card:** #ffffff
- **Accent:** #6b8f8f (sage teal, like her bathroom tile)
- **Secondary accent:** Brass/gold (#b8956a) for borders, icons, small details
- **Font feel:** Playfair Display for headings, DM Sans for body. Refined, editorial.
- **No emoji in UI text**
- **Navigation links open Apple Maps** (`https://maps.apple.com/?daddr={encoded_address}`)
- **Podcast section:** Links to Apple Podcasts
- **Vibe:** Walking into a room she designed. Soft teal tile, brass fixtures, white beadboard, collected objects. Her Pinterest board made functional. Think: the Rothko Chapel welcome house, not a website.

### Aurelia (warm pink, curated teen aesthetic)
- **Background:** #fdf0f4 (soft blush)
- **Card:** #ffffff
- **Accent:** #c2185b (deep rose, not bubblegum)
- **Secondary accent:** #e91e80 for interactive elements
- **Font feel:** DM Sans with slightly rounded weight. Headers can be playful but not childish.
- **Emoji welcome but tasteful** — 🏐✨💅 not 🤪🎉😍
- **Navigation: TikTok search first, Apple Maps second**
  - TikTok: `window.open('https://www.tiktok.com/search?q=' + encodeURIComponent(name), '_blank')` — this forces Safari, which triggers Universal Links to the TikTok app
  - Apple Maps: `https://maps.apple.com/?daddr={encoded_address}`
- **YouTube section:** Links open YouTube app directly (`https://www.youtube.com/watch?v=ID` or `https://www.youtube.com/@channel`)
- **Vibe:** A curated Notion board, not a corporate app. The kind of interface a 13-year-old with genuine taste would design for herself. Warm, personal, not try-hard.

### Rafa (bold, dramatic, monster-scale)
- **Background:** #0a0e1a (deep space blue-black)
- **Card:** #141e30
- **Text:** #e0e8ff
- **Primary accent:** #d32f2f (Spidey red / Godzilla fire)
- **Secondary accent:** #1565c0 (electric blue / Spider-Verse)
- **Tertiary:** #fdd835 (warning yellow, used sparingly)
- **Font feel:** Bold, chunky. DM Sans at 700+ weight. Headers can be large — this is on an iPad Pro.
- **Emoji encouraged** — 🦖🕷🔥⚡
- **Navigation links open Apple Maps** (parent will be driving)
- **YouTube section:** Links open YouTube app (`youtube://` URL scheme, fallback to `https://www.youtube.com/`)
- **Vibe:** A monster-fight command center. Not cute, not babied. This kid watches GrayStillPlays and vintage Godzilla. The design should feel like something MASSIVE is about to happen. Big buttons, high contrast, dramatic. Think: the Barber Museum motorcycle wall — five stories of awesome, stacked to the ceiling.
- **iPad Pro optimization:** Larger touch targets, use the extra screen width for side-by-side content where it makes sense. Cards can be wider. Font sizes can be larger.

---

## FILTERS & NAVIGATION

### Top-level navigation
1. **Person selector** — four buttons (Jonathan, Helen, Aurelia, Rafa). Switches theme AND filters content. Persists in localStorage.
2. **Day filter** — horizontal scrollable pills: All Days, Fri 17, Sat 18, Sun 19, Mon 20, Tue 21, Wed 22, Thu 23, Fri 24
3. **State filter** — horizontal scrollable pills: All States, MA, CT, NY, PA, VA, TN, AL, MS, LA, TX
4. **Type filter** — horizontal scrollable pills: All Types, Food, Energy, Photo, POI, Gas, Viral

### Filter logic
- Selecting a **person** filters to stops tagged for that person + stops tagged "everyone." Also switches the visual theme.
- Selecting a **day** shows only that day's stops and scheduled events.
- Selecting a **state** shows all stops in that state (planned + browse-and-discover).
- Selecting a **type** filters by stop category.
- Filters are combinable (e.g., Helen + Texas + Food = Tex-Mex restaurants Helen would like in Texas).
- Selecting "All" in any filter removes that filter.

### Content sections
When no filters are active (default view), the app shows the full itinerary in chronological order:
- Day headers with drive info
- Planned stops as cards
- Kennedale days (Tue/Wed) in their structured team-split format
- Houston day (Fri 24) with Menil/Rothko schedule
- "The Emotional Arc" section at the bottom

When state filter is active, show:
- Any planned stops in that state (from the itinerary)
- "Discover" section with browse-and-discover POIs for that state, filtered by selected person

---

## DATA STRUCTURE

Every stop/POI is a JavaScript object:

```javascript
{
  id: 'unique_id',
  name: 'Stop Name',
  day: 'fri17',           // null for browse-and-discover stops
  dayLabel: 'Fri Apr 17',
  state: 'TX',
  types: ['food', 'poi'], // food, energy, photo, poi, gas, viral
  persons: ['helen', 'jonathan', 'everyone'],
  address: '123 Main St, City, ST 12345',
  lat: 32.123,
  lng: -96.456,
  hours: 'Mon-Sat 10am-6pm',
  star: true,             // featured/recommended
  bucees: false,          // Buc-ee's special styling
  cluster: '2hr: Hartford CT',
  pitch: {
    helen: 'Two sentences in language she responds to.',
    aurelia: 'Two sentences in language she responds to.',
    rafa: 'Two sentences in language he responds to.',
    jonathan: 'Two sentences in language he responds to.'
  },
  details: 'Practical details — hours, admission, tips.',
  vegNotes: 'Specific vegetarian options for Helen.',
  menuUrl: 'https://...',        // optional: link to online menu
  photosUrl: 'https://...',      // optional: link to Yelp photos page
  category: 'planned'            // 'planned' or 'discover'
}
```

---

## PLANNED STOPS DATA

Include all stops from the existing app (see current index.html in the repo), PLUS the following additions:

### New Tex-Mex restaurants (add to Texas stops)

**DFW area (available Tue-Thu, Apr 21-23):**

1. Don Artemio
   - 3268 W 7th St, Fort Worth, TX 76107
   - persons: ['helen', 'jonathan', 'everyone']
   - types: ['food']
   - state: 'TX', day: null (flexible — date night option)
   - pitch.helen: "James Beard-nominated interior Mexican — the Chile Hojaldrado is cream cheese and pecan-stuffed poblano in puff pastry that's unlike anything you've had at a Mexican restaurant."
   - pitch.jonathan: "The best restaurant in Fort Worth according to basically everyone. Tomahawk steaks and cabrito alongside some of the most inventive Mexican cooking in Texas."
   - vegNotes: "Chile Hojaldrado, Chilaquiles Rojos con Burrata, Ensalada de Nopales, squash enchiladas (ask for vegan — pumpkin/squash/carrot sauce)"
   - hours: "Mon-Thu 11am-9pm, Fri-Sat 11am-10pm, Sun 10am-8pm"
   - star: true
   - menuUrl: "https://www.donartemio.us/menus/"

2. Meso Maya Comida y Copas
   - 1611 McKinney Ave, Dallas, TX 75202
   - persons: ['helen', 'everyone']
   - types: ['food']
   - state: 'TX', day: null (the current Tue dinner option)
   - pitch.helen: "Interior Mexican — Oaxaca, Yucatán, Michoacán — with veggie blue corn tacos, budín azteca, and plantain dishes that treat plants as the star, not the understudy."
   - pitch.jonathan: "Generous portions, famous margaritas, and mole dishes made with the seriousness they deserve."
   - vegNotes: "Veggie blue corn tacos, budín azteca, queso poblano, plantain dishes, Brussels sprouts, substantial salads"
   - hours: "Mon-Thu 11am-10pm, Fri-Sat 11am-midnight, Sun 11am-10pm"

3. Cafecito FW
   - 401 W Magnolia Ave, Fort Worth, TX 76104
   - persons: ['aurelia', 'helen']
   - types: ['food', 'photo']
   - state: 'TX', day: null (morning/brunch option)
   - pitch.aurelia: "Pink corn tortillas, pink ceiling, paper flowers, and lanterns on the patio — this place was designed for your camera. The café de olla and marzapan latte are unlike any coffee you've had."
   - pitch.helen: "A family-owned café where the tortillas are handmade and pink, the horchata latte is art, and the papas a la Mexicana feel like someone's abuela made them for you."
   - vegNotes: "Papas a la Mexicana, molletes, nopales salad (limited but genuine)"
   - hours: "Mon-Wed 6:30am-2pm, THU CLOSED, Fri-Sun 7am-8pm"
   - star: true

4. El Palote Panaderia
   - 2537 S Buckner Blvd, Dallas, TX 75227
   - persons: ['helen', 'everyone']
   - types: ['food']
   - state: 'TX', day: null
   - pitch.helen: "A 100% vegan Mexican bakery and restaurant that's so good Guy Fieri featured it on Diners, Drive-Ins & Dives. Every Tex-Mex staple — birria, barbacoa, al pastor — done plant-based and done right."
   - pitch.jonathan: "I know what you're thinking. But the reviews are unanimous: meat-eaters are won over. The pan dulce alone is worth the drive to Pleasant Grove."
   - vegNotes: "Entire menu is vegan — birria tacos, barbacoa, al pastor, enchiladas, flautas, tamales, loaded fries, pan dulce bakery"
   - hours: "Wed-Sun 11am-8pm, CLOSED Mon-Tue"

**Houston (evening Apr 23 or morning Apr 24):**

5. Hugo's
   - 1600 Westheimer Rd, Houston, TX 77006
   - persons: ['helen', 'jonathan', 'everyone']
   - types: ['food']
   - state: 'TX', day: 'thu23'
   - pitch.helen: "A dedicated 14-item Vegan & Vegetarian menu from a James Beard Award-winning chef — empanadas de plátano, quesadillas de huitlacoche, enchiladas placeras. This is not an afterthought."
   - pitch.jonathan: "Hugo Ortega is the real deal — regional Mexican from a chef who trained in Puebla, Ciudad de México, and Oaxaca. In a 1925 building that feels festive without trying."
   - vegNotes: "14-item dedicated menu: Empanadas de Plátano ($16), Quesadillas de Huitlacoche ($18), Chile Relleno ($20), Huarache with wild mushrooms ($18), Enchiladas Placeras ($20)"
   - hours: "CLOSED MON, Tue-Wed 3-9pm, Thu 11:30am-9pm, Fri 11:30am-11pm, Sat 11am-11pm, Sun 10am-9pm"
   - star: true
   - menuUrl: "https://www.hugosrestaurant.net/menu/vegan-vegetarian-menu/"

6. Candente
   - 4306 Yoakum Blvd Ste 120, Houston, TX 77006
   - persons: ['jonathan', 'everyone']
   - types: ['food']
   - state: 'TX', day: null
   - pitch.jonathan: "MICHELIN Guide-listed handcrafted Tex-Mex from The Pit Room team. The brisket enchiladas are legendary and it's practically walking distance from your Airbnb."
   - pitch.helen: "The tortilla soup alone could be a meal, and the sprawling Montrose patio makes it feel like a neighborhood spot, not a restaurant."
   - vegNotes: "Cheese enchiladas, queso, tortilla soup, sides — less dedicated than Hugo's but vibes are excellent"
   - hours: "Mon-Thu 11am-9pm, Fri 11am-10pm, Sat-Sun 10am-9pm"

7. El Tiempo Cantina
   - 3130 Richmond Ave, Houston, TX 77098
   - persons: ['helen', 'jonathan', 'everyone']
   - types: ['food']
   - state: 'TX', day: null
   - pitch.helen: "The vegetable fajitas — grilled in olive oil on a dedicated pan, not the meat grill — are the best fajitas a Houston food blogger has ever had. 75 years of Laurenzo family cooking."
   - pitch.jonathan: "This is the Laurenzo family — the lineage that includes the original Ninfa's. The chips with tomatillo sauce, the margaritas, and the fajitas are Houston canon."
   - vegNotes: "Veggie fajitas (dedicated iron pan, olive oil — NOT cooked on meat grill), cheese enchiladas, sides"
   - hours: "Sun-Thu 11am-10pm, Fri-Sat 11am-11pm"

### New Houston stops

8. Rice University Campus
   - 6100 Main St, Houston, TX 77005
   - persons: ['aurelia', 'jonathan', 'helen', 'everyone']
   - types: ['poi', 'photo']
   - state: 'TX', day: 'thu23' or 'fri24' (flexible — opposite of Axiom)
   - pitch.aurelia: "Your dad and Uncle Chris both went here. The oak-lined paths, Mediterranean Revival architecture, and the Academic Quadrangle are gorgeous — and you might want to go here too someday."
   - pitch.jonathan: "Your campus, redesigned. The Academic Quad got a complete Nelson Byrd Woltz overhaul in 2024. Lovett Hall still stands. The Sallyport still echoes."
   - pitch.helen: "Ralph Adams Cram's 1912 Mediterranean Revival campus with 4,300 trees, 100+ public artworks, and the kind of proportions that make you understand why Jonathan fell in love with architecture here."
   - details: "Park at Greenbriar Lot ($4/day flat rate, credit card only). Walk the Sallyport through Lovett Hall. See the redesigned Academic Quad. Herzstein Hall has whispering niches Rafa will love. Campus is 2-3 miles from Menil (10 min drive). NOTE: Turrell Skyspace is CLOSED until summer 2026 for renovation."
   - star: true

9. Axiom Space (Chris's tour)
   - 1290 Hercules Ave, Houston, TX 77058 (or Spaceport facility)
   - persons: ['rafa', 'aurelia', 'jonathan', 'everyone']
   - types: ['poi']
   - state: 'TX', day: 'thu23' or 'fri24' (flexible — opposite of Rice/Menil)
   - pitch.rafa: "Uncle Chris works where they BUILD SPACESHIPS. You're going to see a REAL Mission Control Center with REAL screens showing the International Space Station — and the ACTUAL moon suits astronauts will wear on the Moon!"
   - pitch.aurelia: "Your uncle works at the company building the replacement for the International Space Station. You'll see a real Mission Control Center — not a museum replica — and the spacesuits designed with Prada for moon missions."
   - pitch.jonathan: "Chris is giving you a private tour of the facility building the world's first commercial space station. Axiom has sent four crewed missions to the ISS and is designing the AxEMU suits for Artemis. This is the real thing."
   - details: "PRIVATE TOUR — not open to public. Chris will pre-register visitors. Adults need government photo ID. Photography may be restricted. Plan 60-90 min. Located near Johnson Space Center / Space Center Houston. Pair with Space Center Houston public exhibits if time allows."
   - star: true

### McComb address update

All references to McComb, MS should use: **1064 Quin Lane, McComb, MS 39648** (Grandma's house — staying overnight Sunday Apr 19).

---

## YOUTUBE CONTENT SECTIONS

### Rafa's YouTube Section

Title: "WATCH ON THE ROAD 🦖🕷🔥"

Organize into categories with direct YouTube app links. Format: `https://www.youtube.com/@channelname` for channels, `https://www.youtube.com/watch?v=ID` for specific videos. These open the YouTube app on iPad.

**Categories and channels:**

1. **MONSTER FIGHTS** 🔥
   - Godzilla vs King Ghidorah compilation videos (search: "Godzilla vs King Ghidorah fight scenes")
   - MonsterVerse fight compilations
   - Note to parent: "Rafa likes the parts where Godzilla is fighting. Fast-forward available."

2. **SIZE COMPARISONS** 📏
   - Channels that do size/speed/strength comparisons of dinosaurs, planets, vehicles
   - Search: "dinosaur size comparison," "planet gravity comparison," "animal speed comparison"

3. **SPIDER-VERSE** 🕷
   - Spider-Man: Into the Spider-Verse clips
   - Tom Holland Spider-Man scenes
   - Spidey and His Amazing Friends (Disney+/YouTube)

4. **FAVORITE CHANNELS** ⚡
   - @GrayStillPlays — chaos gaming
   - @BeckBroJack (BeckBros — the guy with the backwards hat)
   - Fast Friends (Sonic and Knuckles reaction videos)
   - @CrazyFrogOfficial — Crazy Frog music videos  
   - @LeonPicaron
   - Survival Stickman content
   - @KLTspace (or whatever the correct handle is) — space videos

5. **SPACE STUFF FOR AXIOM** 🚀
   - Axiom Space official YouTube: @AxiomSpace
   - "Axiom Mission 4" launch and highlights
   - ISS live feed / spacewalk compilations
   - KLT space videos
   - "How do astronauts eat/sleep/go to the bathroom in space" videos

### Aurelia's YouTube Section

Title: "watch list ✨"

**Categories:**

1. **faves** 🎀
   - @MiaMaples
   - @MoriahElizabeth
   - @HangwithHope (Hang with Hope)
   - @hopescope (HopeScope)
   - @SerenaNeel (Serena Neel)

2. **for the drive** 🎧
   - Recent uploads from the above creators (link to channel pages so she can browse latest)

3. **the hills** 📺
   - Note: "Currently streaming on [service]. Helen introduced her to it. (She doesn't know it's fake yet.)"

### Helen's Podcast Section

Title: "Listen"

Format: Apple Podcasts links (`https://podcasts.apple.com/us/podcast/...`)

**Curated recommendations:**

1. **Casefile True Crime** — her gold standard. Anonymous Australian host, meticulous research, treats victims with dignity. Perfect for long drives when she has headphones in.
   - Apple Podcasts: https://podcasts.apple.com/us/podcast/casefile-true-crime/id998568017

2. **Bear Brook** — a deeply researched 7-episode limited series about four bodies found in barrels in New Hampshire. Won a Peabody Award. The forensic genealogy work is groundbreaking. Perfect for a single driving day.
   - Apple Podcasts: https://podcasts.apple.com/us/podcast/bear-brook/id1441837695

3. **In the Dark** — Pulitzer Prize-winning investigative journalism. Season 1 (Jacob Wetterling) and Season 2 (Curtis Flowers) are both masterful, meticulous, and never sensational.
   - Apple Podcasts: https://podcasts.apple.com/us/podcast/in-the-dark/id1148175292

4. **Criminal** — Phoebe Judge's calm, elegant storytelling. Short episodes (20-30 min), wide range of topics from historic to bizarre. The tone is curious, not lurid.
   - Apple Podcasts: https://podcasts.apple.com/us/podcast/criminal/id809264944

5. **99% Invisible** — not true crime, but architecture and design stories told with the same meticulousness Helen values. Given the house project, episodes about buildings and places will resonate.
   - Apple Podcasts: https://podcasts.apple.com/us/podcast/99-invisible/id394775318

6. **Atlas Obscura** — the world's most unusual and interesting places, told with wonder and research. Perfect for a road trip.
   - Search Apple Podcasts for current feed

### Jonathan's Podcast Section

Title: "Listen"

Format: Overcast links (`https://overcast.fm/...`) — or if those are hard to construct dynamically, use Apple Podcasts links with a note "(opens in Overcast if installed)"

- Same podcast list as Helen's works — they may share taste here
- Add any history/strategy podcasts if space permits

---

## BROWSE-AND-DISCOVER POIS BY STATE

These are NOT on the day-by-day itinerary. They appear when a user selects a state in the state filter. They're for browsing — "we're in Virginia and Helen is bored, what's interesting near us?"

Set `category: 'discover'` and `day: null` for all of these.

**Include all POIs from the research report** (see the companion document "Family Road Trip: DFW, Houston, and the Route Down" — it has 5-8 POIs per state for CT, NY, PA, VA, TN, AL, MS, LA, TX with addresses, person tags, and two-sentence pitches).

Key ones to prioritize:
- CT: Wadsworth Atheneum (Helen), Weir Farm National Historical Park (Helen)
- NY: Dia Beacon (Helen), Storm King Art Center (both), Olana (Helen), Walkway Over the Hudson (Aurelia)
- PA: Longwood Gardens (Helen), Brandywine River Museum (Helen), Lancaster Central Market (both)
- VA: Shenandoah/Skyline Drive (both), Luray Caverns (Aurelia), Natural Bridge (both), Monticello (Helen)
- TN: Hunter Museum of American Art (Helen), Lookout Mountain/Ruby Falls (Aurelia), Nashville murals (Aurelia)
- AL: Birmingham Museum of Art (Helen), Vulcan Park (Aurelia), Sloss Furnaces (both)
- MS: Natchez antebellum homes (Helen), Ground Zero Blues Club (Aurelia), Vicksburg NMP (both)
- LA: R.W. Norton Art Gallery (Helen), Shreveport Municipal Auditorium (Aurelia)
- TX: Kimbell Art Museum (Helen), Modern Art Museum (Helen), Fort Worth Stockyards (Aurelia), Montrose street art (Aurelia), Space Center Houston (both)

---

## TIKTOK LINK FIX

The current `<a href="https://www.tiktok.com/search?q=..." target="_blank">` opens to a blank screen from the PWA's internal WebKit view.

**Fix:** Use `window.open()` instead of anchor tags for TikTok links. This forces Safari to open, which properly triggers Universal Links to hand off to the TikTok app.

```javascript
function openTikTokSearch(query) {
  window.open('https://www.tiktok.com/search?q=' + encodeURIComponent(query), '_blank');
}
```

Render TikTok buttons as `<button onclick="openTikTokSearch('Rothko Chapel Houston')">TikTok</button>` rather than `<a>` tags.

---

## KENNEDALE DAYS (Tue-Wed, Apr 21-22)

These days keep their structured format — NOT the stop-card format used for driving days. They render as expandable day cards with team-split layouts and schedule tables.

### Tuesday, April 21 — Divide & Conquer (ft. Aunt Donna + Aunt Debra)

**Team Helen + Aurelia + Aunt Donna:**
- 10:00am: Kimbell Art Museum, Fort Worth
- 11:30am: Modern Art Museum of Fort Worth  
- 12:30pm: Lunch at HG Sply Co
- 2:00pm: Bishop Arts District or NorthPark Center (Aurelia's choice)
- 3:30pm: Le Rêve Gelato & Patisserie

**Team Jonathan + Rafa:**
- 9:30am: Drive to Dinosaur Valley State Park, Glen Rose
- 10:30am-12:30pm: Paluxy River dinosaur footprints (bring water shoes)
- 12:30pm: Lunch in Glen Rose
- 1:30pm: Fossil Rim Wildlife Center (drive-through safari)
- 3:30pm: Head back to Kennedale

**Evening (everyone):**
- 5:30pm: Regroup at Aunt Donna's
- 6:30pm: Dinner at Meso Maya (or Don Artemio for date night). Invite Aunt Debra.

### Wednesday, April 22 — Six Flags + Viral Treats

- 9:30am: Six Flags Over Texas, Arlington
- Morning: Jonathan + Aurelia → big coasters. Helen + Rafa → Bugs Bunny Boomtown. Donna: Rafa partner if she comes (frees Helen to ride with Aurelia)
- 12:30pm: Regroup for lunch
- 3:30pm: Leave before meltdown
- 4:00pm: SomiSomi or Amorino Gelato (viral dessert stop)
- 6:00pm: Dinner at Rodeo Goat

### Thursday, April 23 — Goodbye + Houston Drive

- Morning: Relax with Aunt Donna. Both aunts if Debra can flex. Late breakfast.
- Optional 10am: Fort Worth Stockyards cattle drive (11:30am)
- 12:00pm: Lunch with aunts
- 1:30pm: Depart for Houston (Jonathan drives so Helen can gawk)
- Stops: Collin Street Bakery (Corsicana), Sam's Original (Fairfield), Buc-ee's (Madisonville), Sam Houston Statue (Huntsville)
- 6:00pm: Arrive 1301 Marshall St, Houston
- 7:00pm: Dinner with Chris & Yvonne — Hugo's recommended

### Friday, April 24 — Houston morning + fly home

Two possible schedules depending on when Chris's Axiom tour happens:

**Option A: Art morning, Axiom afternoon (if Chris is available early PM)**
- 9:30am: Walk to Rothko Chapel
- 10:00am: Rothko Chapel (everyone)
- 10:30-11:00am: Walk to Menil Collection
- 11:00am: Helen + Aurelia in the Menil. Jonathan + Rafa on the grounds.
- 11:30am: Helen → Cy Twombly Gallery
- 12:00pm: Regroup → drive to Rice for campus walk
- 1:00pm: Rice University campus tour
- 2:00pm: Drive to Axiom Space (Clear Lake, ~35 min)
- 2:30-4:00pm: Axiom tour with Chris
- 4:30pm: Drop rental car at IAH
- Flight: B6 932 IAH → BOS

**Option B: Axiom morning, art afternoon (if Chris is available morning)**
- 8:30am: Drive to Axiom Space
- 9:00-10:30am: Axiom tour with Chris
- 11:00am: Drive to Rice University
- 11:30am-12:30pm: Rice campus walk + lunch at Rice Village
- 1:00pm: Drive to Menil area
- 1:30pm: Rothko Chapel
- 2:00pm: Menil Collection + Cy Twombly Gallery
- 3:00pm: Head to IAH
- Flight: B6 932 IAH → BOS

**Note:** The exact schedule depends on Chris's availability and the B6 932 departure time. Build both options as selectable/visible.

---

## PWA / OFFLINE REQUIREMENTS

### Service Worker (sw.js)
- Cache `./`, `./index.html`, `./manifest.json`
- Cache Google Fonts on first load
- Serve from cache when offline
- Update cache when online (network-first for HTML, cache-first for fonts)
- Version the cache name so updates propagate

### Manifest (manifest.json)
- `"start_url": "./"` (relative — works regardless of repo name)
- `"display": "standalone"`
- `"background_color"` and `"theme_color"` should match Jonathan's theme (default)
- App icon: simple SVG data URI (a "J" in copper on dark background, or similar)

### Meta tags in HTML
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#1a1714">
```

The theme-color meta tag should update dynamically when the person/theme changes.

---

## DESIGN GUIDELINES

### Typography
- **Headings:** DM Serif Display (Jonathan, Helen) or bold DM Sans (Aurelia, Rafa)
- **Body:** DM Sans 400/500
- **Helen headings:** Can use Playfair Display for an editorial feel
- **Load fonts from Google Fonts CDN, cache in service worker**

### Cards
- Rounded corners (12-14px)
- Subtle border (1px solid theme border color)
- Left border accent (4px) color-coded by primary person the stop serves
- Star/featured stops get a slightly different treatment (gold accent or badge)
- Buc-ee's stops get a yellow left border and warm yellow tint

### Person color tags
- Helen: #2d8a4e (forest green)
- Aurelia: #c2185b (deep rose)
- Rafa: #e65100 (vivid orange)
- Jonathan: #1565c0 (blue)
- Everyone: #5e35b1 (purple)

These colors are used for tags, pitch labels, and card accents regardless of which theme is active.

### Responsive
- Mobile-first (375px iPhone width)
- iPad Pro (1024px+): wider cards, optional 2-column layout for stop cards, larger font sizes for Rafa's theme
- Print-friendly: all content visible, action buttons hidden

---

## DEPLOYMENT

The app is already on GitHub Pages. Claude Code should:
1. Clone or pull the existing repo
2. Replace `index.html`, `sw.js`, and `manifest.json` with updated versions
3. Commit and push
4. GitHub Pages auto-deploys within 1-2 minutes

The URL will remain the same. Family members who have already added it to their home screens will get the updated version on next open (service worker handles cache refresh).

---

## TESTING CHECKLIST

Before pushing:
- [ ] All four themes render correctly
- [ ] Person selector switches theme AND filters content
- [ ] Day/state/type filters work independently and in combination
- [ ] TikTok links open Safari (not blank screen) via window.open
- [ ] Waze links work (Jonathan theme)
- [ ] Apple Maps links work (Helen/Aurelia/Rafa themes)
- [ ] YouTube links open YouTube app
- [ ] Apple Podcasts links open Podcasts app
- [ ] Offline: disconnect network, app still loads and displays all content
- [ ] Add to Home Screen works on iPhone (standalone mode, no browser chrome)
- [ ] iPad Pro: Rafa's theme uses screen width well
- [ ] All Tex-Mex restaurants appear in Texas state filter
- [ ] Axiom Space and Rice University appear as stops
- [ ] McComb address is 1064 Quin Lane
- [ ] Browse-and-discover POIs appear when state is filtered
- [ ] Kennedale days render in structured format (not stop cards)
- [ ] Both Houston Friday schedule options are visible

---

## FILES TO REFERENCE

The following files in this Claude.ai project contain all the research, restaurant details, POI data, and trip structure:

1. **Jackson_Family_Road_Trip_April_2026.md** — the master itinerary
2. **Jackson_Family_Road_Trip_Complete.html** — the previous full HTML version (good for structure reference)
3. **The research reports** — contain all POI data, restaurant details, addresses, hours, and pitches for every state

The current deployed files on GitHub are the starting point. This spec describes what needs to change.

---

## PRIORITIES (if time is short)

1. **Fix TikTok links** (5 min — window.open fix)
2. **Add Tex-Mex restaurants** (30 min — data entry)
3. **Add Rice + Axiom stops** (15 min)
4. **Add YouTube sections for both kids** (30 min)
5. **Add Helen's podcast section** (15 min)
6. **Update themes based on personality research** (1-2 hours)
7. **Add browse-and-discover POIs by state** (1-2 hours)
8. **iPad Pro optimization for Rafa** (30 min)
9. **Houston Friday schedule options** (30 min)

Total estimate: 4-6 hours of Claude Code work.
