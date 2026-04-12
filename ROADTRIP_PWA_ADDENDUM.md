# Road Trip PWA v2 — Addendum
## Practical Features, Updated Podcasts, and Road-Ready Details
## April 11, 2026

This addendum supplements ROADTRIP_REACT_REBUILD_SPEC.md. Everything here is additive — nothing in the main spec changes unless explicitly noted.

---

## 1. RESTAURANT CARD ENHANCEMENTS

Many stops in the data already have `menuUrl` and `photosUrl` fields. These should render as tappable buttons on each stop card when the data exists:

- **"Menu"** button — opens menuUrl in Safari
- **"Photos"** button — opens photosUrl (typically Yelp) in Safari
- Style them as secondary buttons (outlined, not filled) below the nav button
- Helen's theme: these buttons should feel editorial — thin border, sage accent
- Rafa's theme: these buttons can be bolder — filled secondary color

If a stop has `vegNotes`, always show them expanded (not behind a tap) on Helen's view. She needs to see vegetarian options at a glance, not hunt for them.

---

## 2. "TONIGHT" CARD — CHECK-IN DETAILS

Add a sticky/prominent card at the top of each day's Itinerary view showing overnight logistics. These only appear on days where the family is sleeping somewhere new.

### Data structure:
```javascript
{
  day: 'fri17',
  lodging: 'Catskills farmhouse',
  address: 'TBD — awaiting host confirmation',
  checkIn: 'TBD',
  hostContact: 'TBD',
  wifiPassword: null,
  notes: 'One-night exception request pending. Backup: Poconos property.',
}
```

### Nights to include:

**Fri Apr 17 — Catskills NY**
- Lodging: Delaware County farmhouse (pending host response)
- Address: TBD
- Check-in: TBD
- Notes: Asked for 1-night exception to 3-night minimum. Backup is Poconos property.

**Sat Apr 18 — Elizabethton TN**
- Lodging: Airbnb
- Address: 317 E Cottage Ave, Elizabethton, TN
- Check-in: TBD (check Airbnb app)
- Notes: Jonathan alone for ashes ceremony. Needs privacy, porch, views.

**Sun Apr 19 — McComb MS**
- Lodging: Grandma's house
- Address: 1064 Quin Lane, McComb, MS 39648
- Check-in: N/A — family home
- Notes: No booking needed.

**Mon Apr 20 — Kennedale TX**
- Lodging: Aunt Donna's house
- Address: TBD (fill in Donna's address)
- Check-in: N/A — family home
- Notes: Staying 3 nights (Mon-Wed). Donna recently retired, flexible schedule.

**Thu Apr 23 — Houston TX**
- Lodging: Airbnb
- Address: 1301 Marshall St, Houston, TX
- Check-in: TBD (check Airbnb app)
- Notes: 3BR, walking distance to Rothko Chapel and Menil Collection.
- WiFi: TBD

### Card styling:
- Visually distinct from stop cards — use a subtle border or background tint
- Show a 🏠 or 🛏 icon (themes that allow emoji) or just "TONIGHT" label
- Include a one-tap navigation button to the address
- Collapse after that day passes (or move to bottom)

---

## 3. FLIGHT HOME CARD

On **Fri Apr 24** (the last day), show a prominent card at the TOP of the itinerary:

```
FLIGHT HOME
B6 932 · IAH → BOS
[Departure time TBD — fill in when confirmed]
Terminal: TBD
Car rental return: [National/Enterprise location at IAH — TBD]

Reminders:
- Return rental car 2 hrs before departure
- Check in on JetBlue app morning of
- Pack kids' iPads in carry-on, not checked bags
```

Style this card with urgency but not alarm — a distinct accent color or top border. It should be impossible to miss.

---

## 4. DOWNLOAD REMINDERS / "PREP FOR TOMORROW" 

At the bottom of each day's Itinerary view, add a "PREP FOR TOMORROW" section. This appears the evening before each driving day when the family is on WiFi.

### Content per day:

**Thu night (prep for Fri 17 — Belmont to Catskills):**
- Helen: Download Bowery Boys "Hudson River School" + Modern Art Notes "Carl Andre" in Apple Podcasts
- Aurelia: Download latest from Mia Maples and Moriah Elizabeth on YouTube
- Rafa: Download Godzilla fight compilations + GrayStillPlays on YouTube

**Fri night (prep for Sat 18 — Catskills to Elizabethton):**
- Helen: Download 99PI "Coal Hogs Work Safe" + In The Past Lane "Molly Maguires" + Dolly Parton's America Ep 6 "Hillbilly"
- Aurelia: Download YouTube content for long drive day
- Rafa: Download Spider-Verse clips + BeckBros + size comparison videos
- Pack: Water shoes for Rafa (Paluxy River dinosaur footprints on Tue)

**Sat night (prep for Sun 19 — Elizabethton to McComb):**
- Helen: Download Uncivil "The Song" + S-Town replacement episodes for Alabama
- Aurelia + Rafa: Download YouTube content
- Notes: Long drive day — have snacks and entertainment fully loaded
- Jonathan is alone tonight — other prep TBD by Helen

**Sun night at Grandma's (prep for Mon 20 — McComb to Kennedale):**
- Helen: Download In the Dark replacement episodes for Mississippi + Radiolab "Flag and the Fury"
- Aurelia + Rafa: Top up YouTube downloads
- Notes: Another long drive day through Mississippi and Louisiana into Texas

**Tue night at Donna's (prep for Wed 22 — Six Flags):**
- Pack: Comfortable shoes, change of clothes for Rafa, sunscreen
- Charge all devices fully — long day at the park
- No podcast/YouTube prep needed — it's a park day

**Wed night at Donna's (prep for Thu 23 — Kennedale to Houston):**
- Helen: Download New Books in Architecture "Louis Kahn" + 99PI "Mind of an Architect" + Gravy "Czech Out Texas Kolaches"
- Rafa: Download Axiom Space YouTube videos (prep for Chris's tour)
- Pack: Start consolidating luggage — only 1 more night after tonight

**Thu night in Houston (prep for Fri 24 — Houston + fly home):**
- DO NOT CHECK BAGS WITH: kids' iPads, chargers, snacks, headphones
- Confirm car rental return location and time
- Check in on JetBlue app
- Helen: Download Lonely Palette "Rothko" + ArtCurious "Rothko No. 6" for morning listening before the Chapel

### Styling:
- Collapsible section — don't clutter the day view
- Subtle, not urgent — this is a helpful nudge, not an alarm
- Checkbox style so items can be tapped off (state doesn't need to persist — just satisfying to tap)

---

## 5. PACKING PROMPTS PER DAY

Add a small "BRING" note to specific day headers or stop cards where gear matters:

| Day | Stop | Bring |
|-----|------|-------|
| Fri 17 | Art Omi | Sunscreen, packed lunch (no food on site), comfortable shoes |
| Sat 18 | Steamtown | Layers — indoor/outdoor, can be cool in rail yards |
| Tue 21 | Dinosaur Valley | Water shoes (Paluxy River), sunscreen, towel, water bottles, bug spray |
| Tue 21 | Fossil Rim | Stay in the car — no special gear, but bring binoculars if you have them |
| Wed 22 | Six Flags | Comfortable shoes, change of clothes for Rafa, sunscreen, ponchos if rain |
| Fri 24 | Rothko Chapel | Quiet voices. No photography inside. |

These can render as a small tag or expandable note on the relevant stop card. Don't create a separate packing list view — keep it contextual.

---

## 6. EMERGENCY / PRACTICAL CARD PER STATE

Add a collapsible "ESSENTIALS" card at the top of each state's Discover view. Not prominent — just findable if needed.

### Per state:

**MA:** Starting point — no card needed.

**CT:** 
- Emergency: 911
- Nearest major hospital (en route): Hartford Hospital, 80 Seymour St, Hartford

**NY:**
- Nearest major hospital (Hudson Valley): Vassar Brothers Medical Center, Poughkeepsie
- Cell coverage note: Spotty in western Catskills valleys

**PA:**
- Nearest major hospital (Scranton): Geisinger Community Medical Center
- Nearest major hospital (Harrisburg): Penn State Health Holy Spirit
- Cell coverage note: Gaps on I-81 through mountains

**VA:**
- Nearest major hospital: Augusta Health, Fishersville (near Shenandoah)
- Cell coverage note: DEAD ZONES on Skyline Drive and through mountain passes. Download everything before entering.

**TN:**
- Nearest major hospital (Chattanooga): Erlanger Medical Center
- Nearest major hospital (Jonesborough area): Johnson City Medical Center
- Cell coverage note: Generally OK on I-81 and I-75 corridors

**AL:**
- Nearest major hospital (Birmingham): UAB Hospital
- Cell coverage note: Gaps on US-280 east of Birmingham

**MS:**
- Nearest major hospital (Jackson): University of Mississippi Medical Center
- Nearest major hospital (McComb): Southwest Mississippi Regional Medical Center
- Cell coverage note: SIGNIFICANT DEAD ZONES between McComb and Jackson on US-51. Also gaps on back roads between Vicksburg and I-20. Download everything before entering Mississippi.

**LA:**
- Only passing through briefly (I-20 corridor)
- Nearest major hospital (Monroe/Ruston area): St. Francis Medical Center, Monroe

**TX:**
- Nearest major hospital (DFW): Baylor Scott & White, Dallas / Cook Children's, Fort Worth
- Nearest major hospital (Houston): Texas Children's Hospital / Houston Methodist
- Car rental breakdown: National/Enterprise roadside — [phone number TBD, check rental agreement]
- Cell coverage note: Generally good on I-45 and I-35. Gaps possible on rural county roads.

---

## 7. GAS SPACING WARNINGS

Flag any driving stretch over 60 miles between planned stops where gas is available. Add a subtle "⛽ 80 miles between stops" warning to the drive info on those segments.

Key stretches to flag:
- Catskills to Scranton: ~100 miles, gas available but worth topping off before leaving the Catskills
- Rural Mississippi (McComb to Jackson via US-51): ~80 miles, limited stations
- Vicksburg to Terrell TX (via I-20): Long haul, but Buc-ee's and truck stops are plentiful on I-20
- Review all segments and flag any over 60 miles

---

## 8. PODCAST UPDATES

### Helen's podcast list — REVISED (no true crime)

**REMOVE these episodes from the spec entirely:**
- S-Town (full series)
- White Lies (full series)  
- In the Dark Season 2 (full series)
- Criminal #18 "695BGK"

**ADD these replacements:**

For Birmingham, AL:
- Uncivil — full series, especially "The Spin" and "The Raid" (~30 min each, 12 episodes). Apple: https://podcasts.apple.com/us/podcast/uncivil/id1275078406. Pitch: "Peabody Award-winning series that dismantles the official Civil War story through resistance, mutiny, and erasure — then connects it to present-day Southern politics."
- Code Switch — "Live From Birmingham…It's Code Switch!" (~45 min). Pitch: "Recorded live in Birmingham — Mayor Woodfin on growing up in the shadow of civil rights legacy, poet Ashley M. Jones on learning to love her hometown."
- Points South — "Stories of the South's Civil Rights Sites" (~30 min). Apple: search "Points South". Pitch: "Oxford American production examining who narrates civil rights landmarks, what gets preserved, and what gets softened."
- Code Switch — "The Story of Mine Mill" (~35 min). Pitch: "The Sloss Furnaces episode — an interracial miners' union in Birmingham's steel industry, organized across racial lines in the Jim Crow South, then destroyed."
- Seizing Freedom — full series (~25-30 min per episode, 28 episodes). Apple: https://podcasts.apple.com/us/podcast/seizing-freedom/id1520070952. Pitch: "Historian Dr. Kidada E. Williams reconstructs how Black people seized their own freedom, using first-person accounts performed by voice actors. Impeccable scholarship."

For Mississippi:
- Radiolab — "The Flag and the Fury" (~50 min). Pitch: "duPont Award-winning reporting on Mississippi's Confederate flag — 126 years of political maneuvering ending in 2020. Patient, layered, extraordinary."
- Points South — "Fannie Lou Hamer's Freedom Farm" (~30 min). Pitch: "Hamer's radical cooperative farming initiative — food sovereignty for Black Delta communities locked out of the economy they built."
- 99% Invisible — "America's Last Top Model" (~25 min). Pitch: "A 200-acre physical model of the entire Mississippi River Basin in Jackson, built using German POW labor. Now abandoned. Classic 99PI."
- Fresh Air — Jesmyn Ward interview on Sing, Unburied, Sing (~35 min). Pitch: "Ward on Parchman Prison, being a Black writer in Mississippi, and why she stays. One of Terry Gross's finest late-career conversations."
- Washington Post "Constitutional" — "Fair Punishment" (~40 min). Pitch: "Parchman Farm, Gates v. Collier, and Alan Lomax's field recordings of inmate work songs. History through law and music, not crime."
- Gravy — "Catfish Dream" (~20 min). Pitch: "Ed Scott opened the first Black-owned catfish processing plant in the Delta — a radical act where Black farmers grew the fish but white companies controlled all the profit."
- 1619 — "The Land of Our Fathers" (~35 min). Pitch: "Black land loss in Mississippi — how families who acquired land after emancipation were systematically dispossessed. This is about the specific dirt you're driving over."

For Houston:
- Gravy — "Brisket Pho, A Viet Tex Story" (~25 min). Pitch: "How 140,000 Vietnamese Houstonians transformed Texas barbecue and crawfish culture. Centers immigrant creativity, never exoticizes."
- 99% Invisible — "Missing the Bus" (~25 min). Pitch: "Houston scrapped its entire bus network and redesigned it from scratch. Design-systems thinking about why the city moves the way it does."
- Houston Matters — "Project Row Houses" (~15-20 min). Pitch: "Art as community infrastructure — how Black artists transformed abandoned shotgun houses in Third Ward into installations, housing, and programs."
- Below the Waterlines (Houston Public Media) — full series (~25-35 min each). Apple: search "Below the Waterlines". Pitch: "Houston five years after Harvey — who recovered and who didn't, told with the structural rigor you demand."
- Floodlines (The Atlantic) — full 8-episode series (~35-45 min each). Apple: https://podcasts.apple.com/us/podcast/floodlines/id1501433969. Pitch: "Arguably the finest podcast ever made about an American disaster. Essential Gulf South listening for the Mississippi-to-Houston stretch."

Keep all the non-true-crime episodes from the original spec (Bowery Boys, Modern Art Notes, 99PI Coal Hogs, Molly Maguires, 1619 episodes, Trail Mix, Dolly Parton's America, Uncivil "The Song", Dolly "Dixie Disappearance", Gravy "JJ's Sandwich Shop", Scene on Radio "Seeing White", Gravy "Pastrami at Olde Tyme Deli", History Unplugged Vicksburg, New Books in Architecture Kahn, 99PI "Mind of an Architect", Gravy "Czech Out Texas Kolaches", Lonely Palette Rothko, ArtCurious Rothko No. 6, ArtCurious Rauschenberg/Twombly/Johns, Gravy "Three Tastes of West Africa").

### Jonathan's podcast list

**[PLACEHOLDER — Jonathan is building his own list. When he provides it, add it here. Format: show name, episode if specific, Apple Podcasts or Overcast link, one-line pitch. His list is NOT tied to route locations — just a general listening queue. Show in his Media tab only.]**

---

## 9. WHAT NOT TO BUILD

To keep scope manageable:
- No weather integration (use the phone's weather app)
- No real-time traffic (Waze handles this)
- No shared family chat or photo features (group text exists)
- No expense tracking
- No countdown timer to departure
- No gamification or achievement badges
- No integration with Airbnb or JetBlue APIs — just display the info statically
