# Road Trip PWA v2 — React Rebuild Spec
## For Claude Code · April 11, 2026

---

## WHAT THIS IS

This spec replaces the current vanilla HTML/CSS/JS road trip PWA with a React-based app. The existing `ROADTRIP_PWA_BUILD_SPEC.md` remains the source of truth for ALL content data (stops, restaurants, addresses, pitches, person tags, YouTube channels, theme colors, etc.). This document only covers what's CHANGING architecturally and in UX. If something isn't mentioned here, carry it forward from the original spec unchanged.

---

## ARCHITECTURE CHANGE

**From:** Single `index.html` with inline JS and CSS, no build tools
**To:** React app (Vite + React), built to static files, deployed to same GitHub Pages repo

### Build & Deploy
- Use Vite as the build tool (`npm create vite@latest -- --template react`)
- Output to `docs/` folder (GitHub Pages can serve from `docs/` on main branch)
- All data remains inline in JS (no external API calls) — same offline-first approach
- Service worker still caches the built assets for offline use
- Same manifest.json, same Add to Home Screen behavior
- The repo URL and GitHub Pages URL stay the same

### File Structure
```
/src
  /components
    App.jsx
    Navigation.jsx        — person selector + tab bar
    ItineraryView.jsx     — day-by-day stops
    MediaView.jsx         — YouTube (kids) + Podcasts (Helen)
    DiscoverView.jsx      — browse-by-state POIs
    StopCard.jsx          — individual stop card component
    KennedaleDay.jsx      — structured team-split day cards
    HoustonFriday.jsx     — Option A / Option B toggle
    PodcastCard.jsx       — podcast episode matched to a stop/region
    YouTubeSection.jsx    — categorized YouTube links
    FilterBar.jsx         — day/state/type pill filters
    PersonSelector.jsx    — four theme-switching buttons
  /data
    stops.js              — all planned stops (from original spec)
    discover.js           — browse-and-discover POIs by state
    podcasts.js           — Helen's route-matched podcast episodes (see PODCAST DATA below)
    youtube.js            — Rafa + Aurelia YouTube content
    themes.js             — four theme objects with all colors/fonts
  /styles
    themes.css            — CSS custom properties per theme
  index.html
  main.jsx
/public
  manifest.json
  sw.js
```

---

## UX CHANGES

### 1. Tabbed Navigation (replaces infinite scroll)

Three tabs below the person selector:

**ITINERARY** — The day-by-day trip plan. Stop cards, drive segments, Kennedale structured days, Houston Friday options. This is the current main view, but now it's one tab instead of everything.

**MEDIA** — Person-specific content:
- **Rafa's view:** "WATCH ON THE ROAD 🦖🕷🔥" — YouTube categories from the original spec (Monster Fights, Size Comparisons, Spider-Verse, Favorite Channels, Space Stuff for Axiom)
- **Aurelia's view:** "watch list ✨" — YouTube categories from the original spec (faves, for the drive, the hills). NOTE: Do NOT include any text suggesting The Hills is staged, scripted, or fake. Just list it as a show she's watching.
- **Helen's view:** "Listen" — Route-matched podcast episodes (see PODCAST DATA section below). Organized by route segment, not a generic recommendation list. Each episode is tied to a specific stop or region.
- **Jonathan's view:** This tab is EMPTY or HIDDEN for Jonathan. He doesn't need media recommendations.

**DISCOVER** — Browse-by-state POIs. Shows when user selects a state. Same content as the original spec's browse-and-discover section, but now in its own tab with a state selector as the primary navigation.

### 2. Tab behavior
- Tabs persist per person (if Helen was on Media tab and you switch to Rafa, Rafa's Media tab loads)
- Tab selection is stored in state, not localStorage (it's fine to reset on refresh)
- Active tab has a clear visual indicator that matches the current theme
- Smooth transitions between tabs — a simple fade or slide, nothing elaborate but not a hard cut

### 3. Person Selector stays at the top, always visible
- Same four buttons: Jonathan, Helen, Aurelia, Rafa
- Switches theme AND filters content (same behavior as current app)
- Persists in localStorage (same as current)
- Below the person selector: the tab bar
- Below the tab bar: filters (day/state/type pills) — only visible on the Itinerary tab

### 4. Filters only appear on Itinerary tab
- Day filter, State filter, Type filter — same as current spec
- Hidden on Media and Discover tabs (those have their own navigation)
- Discover tab has its own state selector

---

## PODCAST DATA (Helen only)

These are route-matched podcast episodes. Each one ties to a specific stop or region on the itinerary. They appear in the Media tab when Helen is selected, organized by route segment.

### Data structure for each podcast:
```javascript
{
  id: 'podcast_unique_id',
  show: 'Podcast Name',
  episode: 'Episode Title',
  region: 'Hudson Valley NY',        // route segment
  matchedStop: 'Art Omi / Dia Beacon', // which stop(s) it connects to
  state: 'NY',
  duration: '64 min',
  pitch: 'One or two sentences on why Helen specifically will love this.',
  applePodcastsUrl: 'https://podcasts.apple.com/...',
  isSeries: false,                   // true for multi-episode series
  episodeCount: null,                // number of episodes if series
  totalDuration: null,               // total listen time if series
}
```

### Episodes to include (organized by route segment):

**HUDSON VALLEY, NY**
1. The Bowery Boys #388: "The Hudson River School: An American Art Revolution" — 64 min. Traces Thomas Cole and Frederic Church in the Hudson Valley. Contextualizes why this valley became an art magnet. Apple: https://podcasts.apple.com/cy/podcast/388-the-hudson-river-school-an-american-art-revolution/id258530615?i=1000562694911
   - Pitch: "Deeply researched cultural history connecting 19th-century painting to the contemporary sculpture parks you're about to visit."
   - Match: Art Omi, Dia Beacon, Storm King

2. Modern Art Notes Podcast #134: "Carl Andre" — ~70 min. Discusses the Andre retrospective at Dia Beacon and how the 160,000 sq ft industrial space shapes the experience of minimalist floor sculptures.
   - Pitch: "Gallery-level art criticism at a scholar's pace — perfect preparation for Dia Beacon's permanent collection and architecture."
   - Match: Dia Beacon

**NORTHEASTERN PENNSYLVANIA**
3. 99% Invisible #275: "Coal Hogs Work Safe" — ~25 min. Coal miner stickers as design objects — reflective safety markers that evolved into identity tokens and underground currency. Apple: https://podcasts.apple.com/lt/podcast/275-coal-hogs-work-safe/id394775318?i=1000392177444
   - Pitch: "Classic 99PI — finds the hidden design story inside a life-or-death workplace, treating miners' culture with genuine curiosity."
   - Match: Steamtown / Scranton area

4. In The Past Lane #196: "The Molly Maguires" — ~45 min. 1870s Irish American coal miners, Pinkerton infiltration, 20 hangings on questionable evidence. Labor, ethnicity, criminal justice. Apple: https://podcasts.apple.com/us/podcast/196-the-molly-maguires/id1079096124?i=1000479141515
   - Pitch: "Centers marginalized immigrant laborers against institutional power, with the investigative rigor of the best true crime applied to historical injustice."
   - Match: Steamtown / PA coal country

**VIRGINIA**
5. 1619 (NYT) Episode 1: "The Fight for a True Democracy" — ~40 min. Nikole Hannah-Jones traces enslaved Africans' arrival in Virginia (1619) and how Black Americans' fight for freedom expanded democracy for all. Apple: https://podcasts.apple.com/us/podcast/1619/id1476928106
   - Pitch: "Entering Virginia with this episode transforms the landscape — every historic marker carries the weight of what Hannah-Jones documents."
   - Match: Shenandoah Valley / Virginia generally

6. 99% Invisible #548-549: "Trail Mix" (Parts 1 & 2) — ~35 min each. Appalachian Trail design philosophy, Benton MacKaye's radical origins, how trail-building is architecture.
   - Pitch: "Design thinking applied to landscape — treating the AT as a built environment shaped by ideology, labor, and evolving philosophy."
   - Match: Shenandoah / Blue Ridge

**EAST TENNESSEE**
7. Dolly Parton's America Episode 6: "Hillbilly" — ~50 min. University of Tennessee students debate Southern shame, hillbilly stereotypes, and whether Dolly helps or hurts their identity. WNYC/Radiolab production. Apple: https://podcasts.apple.com/us/podcast/dolly-partons-america/id1481398762
   - Pitch: "Produced at Radiolab standards with the emotional intelligence of the best oral history. Centers young Appalachians speaking for themselves."
   - Match: Jonesborough / Appalachian culture

8. Dolly Parton's America Episode 2: "Tennessee Mountain Home" — ~45 min. Dollywood, childhood cabin replica, questions of authenticity and Appalachian belonging.
   - Pitch: "Asks the architectural and cultural question you care about: what happens when a place becomes its own monument?"
   - Match: East Tennessee generally

**CHATTANOOGA**
9. Uncivil — "The Song" — ~35 min. Peabody Award-winning episode tracing the contested history of "Dixie" — featuring the Carolina Chocolate Drops performing it as reclamation. Apple: https://podcasts.apple.com/gb/podcast/uncivil/id1275078406
   - Pitch: "Centers Black voices reclaiming a Confederate symbol — exactly the kind of untold history you value, delivered with intellectual rigor."
   - Match: Chattanooga / pre-Civil War battlefield listening

10. Dolly Parton's America Episode 7: "Dixie Disappearance" — ~55 min. The controversy over Dolly's "Dixie Stampede" dinner theater — Confederate-themed entertainment, monument debates, Southern identity.
    - Pitch: "Sophisticated cultural criticism that refuses easy answers — how even beloved figures are implicated in historical erasure."
    - Match: Chattanooga / Tennessee-Alabama transition

**BIRMINGHAM, ALABAMA**
11. S-Town — Full 7-episode series. ~7 hours total. Brian Reed's portrait of John B. McLemore in Woodstock, Alabama. Murder investigation becomes meditation on isolation, queer life in the rural South, time. 80+ million downloads.
    - Pitch: "Treats its subject — a complicated man in a place the world ignores — with relentless curiosity and ultimate compassion. Zero sensationalism."
    - Match: Birmingham / Alabama
    - isSeries: true, episodeCount: 7, totalDuration: "~7 hours"

12. White Lies (NPR) — Full 7-episode series. ~4.5 hours total. 1965 murder of Rev. James Reeb during Selma voting rights campaign. How an entire community conspired in cover-up for 50 years. Pulitzer finalist.
    - Pitch: "Investigative journalism at its most patient and devastating. The reporters' Alabama roots give them access outsider journalists couldn't achieve."
    - Match: Birmingham / Alabama civil rights
    - isSeries: true, episodeCount: 7, totalDuration: "~4.5 hours"

13. Gravy — "JJ's Sandwich Shop" — ~20 min. A glatt kosher deli on wheels operated by Birmingham's oldest Orthodox Jewish congregation.
    - Pitch: "Finds a completely unexpected marginalized community within Birmingham, told with the SFA's signature warmth."
    - Match: Birmingham

**MISSISSIPPI**
14. In the Dark Season 2 — Full season. ~12 hours. Curtis Flowers, tried six times for the same murder in Winona, MS. Systematic racial bias in jury selection. George Polk Award winner. Baran's reporting contributed to Flowers' freedom. Apple: https://podcasts.apple.com/us/podcast/in-the-dark/id1148175292
    - Pitch: "The podcast closest in spirit to Casefile — meticulous, evidence-driven, zero theatrics. The definitive audio document of criminal justice in the Deep South."
    - Match: McComb through Jackson, MS
    - isSeries: true, episodeCount: ~18, totalDuration: "~12 hours"

15. Scene on Radio "Seeing White" — Season 2, 14 episodes. ~10 hours. John Biewen and Chenjerai Kumanyika trace the invention of whiteness from colonial Virginia to modern America. Two-time Peabody nominee. Apple: https://podcasts.apple.com/us/podcast/scene-on-radio/id1036276968
    - Pitch: "Academic rigor delivered as compelling narrative. Essential companion for the entire Southern portion of the route."
    - Match: Birmingham through Mississippi (spans multiple states)
    - isSeries: true, episodeCount: 14, totalDuration: "~10 hours"

16. 1619 Episode 2: "The Economy That Slavery Built" — ~40 min. Features Jesmyn Ward. How cotton plantations created the financial instruments that became American capitalism. Mississippi Delta is central.
    - Pitch: "Transforms the Mississippi landscape into an economic text — every field visible from the highway carries the history this episode documents."
    - Match: Jackson / Mississippi generally

17. Gravy — "The Pastrami at Olde Tyme Deli" — ~20 min. Jewish Southern identity during the civil rights era through a Jackson, MS pastrami sandwich.
    - Pitch: "Another hidden community within the larger civil rights narrative, told with the SFA's characteristic respect for both food and the people who make it."
    - Match: Jackson, MS

18. History Unplugged — "How the Vicksburg Siege May Have Turned the Tide of the Civil War" — ~45 min. 47-day siege, Grant's campaign, Mississippi River strategy.
    - Pitch: "Scholarly and evidence-based — contextualizes the battlefield you're about to walk through without romanticizing either side."
    - Match: Vicksburg NMP

**FORT WORTH / DALLAS**
19. New Books in Architecture — "Louis Kahn: Architecture as Philosophy" — ~60 min. Kahn scholar John Lobell on the Kimbell's cycloid vaults and most beautiful natural lighting in any museum. Apple: https://podcasts.apple.com/ie/podcast/john-lobell-louis-kahn-architecture-as-philosophy-monacelli/id425210498?i=1000496212635
    - Pitch: "Genuine architectural criticism at book-length depth. Essential before standing inside the Kimbell."
    - Match: Kimbell Art Museum

20. 99% Invisible — "The Mind of an Architect" — ~25 min. A 1958 study of 40 leading architects including Louis Kahn, Philip Johnson, Eero Saarinen — gathered at Berkeley to be studied for what makes creative minds work.
    - Pitch: "Multiple architects relevant to your trip — Kahn (Kimbell), Philip Johnson (Rothko Chapel) — caught in an intimate, unguarded research setting."
    - Match: Kimbell / Rothko Chapel (bridges DFW and Houston)

21. Gravy — "Czech Out Texas Kolaches" — ~20 min. Czech-Texan bakers, immigration patterns, cultural survival embedded in a pastry.
    - Pitch: "A small, perfect SFA story about immigrant food heritage in Texas — the kind of marginalized cultural history that enriches a road trip."
    - Match: DFW / Texas generally

**HOUSTON**
22. The Lonely Palette — "Rothko's Untitled (Black on Gray)" — ~30 min. Rothko's late dark paintings — the same canvases defining the Chapel. Interviews museum visitors about what they feel. Apple: https://podcasts.apple.com/us/podcast/the-lonely-palette/id1159154533
    - Pitch: "Rigorous art history delivered with emotional honesty — treating ordinary viewers' responses with as much respect as expert analysis."
    - Match: Rothko Chapel

23. ArtCurious #72: "Art Auction Audacity: Rothko's No. 6" — ~35 min. The $186M Rothko sale, the Bouvier Affair, Rothko's relationship with the de Menil family who commissioned the Chapel.
    - Pitch: "Combines art history, investigative journalism, and ethical questions about the art market — three of your interests in one episode."
    - Match: Rothko Chapel / Menil Collection

24. ArtCurious #112: "Modern Love — Rauschenberg, Cy Twombly, and Jasper Johns" — ~35 min. Love affairs and artistic relationships that shaped modern art. Essential for the Cy Twombly Gallery.
    - Pitch: "Centers a queer love story within canonical art history, showing how personal lives shape artistic legacy."
    - Match: Cy Twombly Gallery / Menil

25. Criminal #18: "695BGK" — ~20 min. Robbie Tolan, shot by police in his own driveway in Bellaire (Houston metro) over a mistyped license plate. Case went to Supreme Court.
    - Pitch: "Phoebe Judge at her most devastating — restrained, precise, letting the facts speak. A story about race and policing in the city you're visiting."
    - Match: Houston generally

26. Gravy — "In Houston, Three Tastes of West Africa" — ~20 min. West African food culture in Houston through three restaurants. 145+ languages spoken in the city.
    - Pitch: "Houston beyond the art museums. Centers immigrant voices and cultural survival through food."
    - Match: Houston / Montrose area

---

## REMOVED FEATURES

1. **Jonathan's podcast section** — Remove entirely. He uses Overcast and will find his own stuff.
2. **"The Emotional Arc" section** — Remove entirely. Strip it from the bottom of the itinerary.
3. **Generic podcast recommendation list** — The old spec had a list of shows (Casefile, Bear Brook, In the Dark, Criminal, 99% Invisible, Atlas Obscura) as general recommendations. Replace ALL of that with the route-matched episodes above. Helen doesn't need a list of shows — she needs episodes matched to where she is.

---

## DESIGN DIRECTION

Carry forward ALL theme specifications from the original spec (colors, fonts, emoji rules, nav app links, person color tags, card styling). But execute them with more commitment:

### Card Design
- Rounded corners (14px)
- Subtle shadow that varies by theme (warm shadow for Helen, cool blue for Rafa, etc.)
- Left border accent (4px) color-coded by primary person the stop serves
- Star/featured stops get a subtle glow or badge treatment
- Buc-ee's stops get warm yellow tint and left border
- Cards should feel like they have WEIGHT — not flat rectangles floating in space

### Typography Hierarchy
- Jonathan: DM Serif Display headings, DM Sans body. Understated, information-dense.
- Helen: Playfair Display headings with brass/gold (#b8956a) accents, DM Sans body. Editorial, refined. Section dividers should feel like magazine layout.
- Aurelia: DM Sans throughout, slightly rounded weight. Headers playful but not childish. Warm pink palette with deep rose accents.
- Rafa: Bold chunky DM Sans at 700+ weight. Headers LARGE and UPPERCASE. High contrast. This kid's view should feel like a command center, not a website.

### Transitions
- Tab switches: simple crossfade (200-300ms)
- Card expansion: smooth height animation
- Theme switches: background and color transition (400ms ease)
- Nothing fancy, nothing janky. Smooth > clever.

### Podcast Cards (Helen's Media tab)
- Show artwork placeholder (colored circle with show initials if no image)
- Episode title prominent
- Duration badge
- Route match indicator: "📍 Rothko Chapel" or "📍 Birmingham, AL"
- Apple Podcasts button that opens the link
- Series badge for multi-episode series with episode count and total duration
- Pitch text in Helen's editorial voice

### YouTube Cards (Kids' Media tab)
- Channel name prominent
- Category grouping with themed headers
- Rafa's categories get emoji and uppercase treatment
- Aurelia's categories get her curated aesthetic
- Links open YouTube app directly

---

## WHAT STAYS THE SAME

- GitHub Pages deployment (just change the source to `docs/` folder in repo settings)
- Same URL
- PWA / Add to Home Screen behavior
- Offline support via service worker
- localStorage for person/theme persistence
- All stop data, addresses, pitches, person tags, veg notes, hours from original spec
- All Tex-Mex restaurants from original spec
- All YouTube content from original spec
- Kennedale structured day format
- Houston Friday Option A / Option B
- TikTok deep link behavior (tiktok:// with web fallback)
- Waze links for Jonathan, Apple Maps for everyone else
- All browse-and-discover POIs from original spec

---

## BUILD ORDER

1. Scaffold Vite + React project, get it deploying to GitHub Pages from `docs/`
2. Implement theme system (CSS custom properties, person selector, localStorage)
3. Build Itinerary tab with stop cards, day headers, filters
4. Build Kennedale structured days and Houston Friday options
5. Build Media tab — YouTube sections for Rafa and Aurelia
6. Build Media tab — Podcast section for Helen with all 26 episodes
7. Build Discover tab with state selector and POI cards
8. Polish: transitions, typography, card shadows, responsive layout
9. Service worker and offline support
10. Test all four themes, all tabs, all device sizes

Push after each major step so it can be checked live.

---

## REFERENCES

- `ROADTRIP_PWA_BUILD_SPEC.md` — original spec, source of truth for all content data
- `Jackson_Family_Road_Trip_April_2026.md` — master itinerary
- Current `index.html` in repo — has all existing stop data
- This document — architecture, UX changes, podcast data, and what to remove
