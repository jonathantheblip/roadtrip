// Helen's route-matched podcast episodes. No true crime.
//
// Each episode ties to a specific stop or region on the drive. Organized
// chronologically by route segment. Apple Podcasts URLs open the
// Podcasts app on iOS via Universal Links; on Android / desktop they
// land in Safari.
//
// Data contract per episode:
//   id, show, episode, region (region key), state, matchedStops,
//   duration, pitch, applePodcastsUrl, isSeries?, episodeCount?,
//   totalDuration?
//
// Source of truth: ROADTRIP_REACT_REBUILD_SPEC.md (base list) +
// ROADTRIP_PWA_ADDENDUM.md (Birmingham / Mississippi / Houston replaces)
// + compass_artifact_wf-10ba729f research on the Deep South leg.

export const PODCAST_REGIONS = [
  { key: 'hudson_valley', title: 'Hudson Valley, NY', blurb: 'Art and architecture of the Hudson River School country.' },
  { key: 'ne_pa', title: 'Northeastern Pennsylvania', blurb: 'Anthracite coal country — labor, design, and resistance.' },
  { key: 'virginia', title: 'Virginia', blurb: 'Landscape and history through the Shenandoah and Blue Ridge.' },
  { key: 'east_tn', title: 'East Tennessee', blurb: 'Jonesborough, Appalachia, and the cultural question of belonging.' },
  { key: 'chattanooga', title: 'Chattanooga', blurb: 'Pre-war Chattanooga, Confederate symbols, and their reclamation.' },
  { key: 'birmingham', title: 'Birmingham, Alabama', blurb: 'The movement, the furnaces, and the city reckoning with itself.' },
  { key: 'mississippi', title: 'Mississippi', blurb: 'McComb through Jackson, the Delta, Parchman, and the land underneath.' },
  { key: 'dfw', title: 'Fort Worth / Dallas', blurb: 'Louis Kahn, the Kimbell, and the Texas immigrant food story.' },
  { key: 'houston', title: 'Houston', blurb: 'Immigrant city, art as infrastructure, water as everything.' },
]

export const PODCASTS = [
  // ===== HUDSON VALLEY, NY =====
  {
    id: 'p_bowery_hudson',
    show: 'The Bowery Boys',
    episode: '#388: The Hudson River School — An American Art Revolution',
    region: 'hudson_valley',
    state: 'NY',
    matchedStops: 'Art Omi · Dia Beacon · Storm King · Olana',
    duration: '64 min',
    pitch:
      "Deeply researched cultural history connecting 19th-century painting to the contemporary sculpture parks you're about to visit.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/388-the-hudson-river-school-an-american-art-revolution/id258530615?i=1000562694911',
  },
  {
    id: 'p_modern_art_notes_andre',
    show: 'Modern Art Notes',
    episode: '#134: Carl Andre',
    region: 'hudson_valley',
    state: 'NY',
    matchedStops: 'Dia Beacon',
    duration: '70 min',
    pitch:
      "Gallery-level art criticism at a scholar's pace — perfect preparation for Dia Beacon's permanent collection and architecture.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/the-modern-art-notes-podcast/id380593660',
  },

  // ===== NORTHEASTERN PENNSYLVANIA =====
  {
    id: 'p_99pi_coal_hogs',
    show: '99% Invisible',
    episode: '#275: Coal Hogs Work Safe',
    region: 'ne_pa',
    state: 'PA',
    matchedStops: 'Steamtown / Scranton area',
    duration: '25 min',
    pitch:
      "Classic 99PI — finds the hidden design story inside a life-or-death workplace, treating miners' culture with genuine curiosity.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/275-coal-hogs-work-safe/id394775318?i=1000392177444',
  },
  {
    id: 'p_past_lane_molly',
    show: 'In The Past Lane',
    episode: '#196: The Molly Maguires',
    region: 'ne_pa',
    state: 'PA',
    matchedStops: 'Steamtown / PA coal country',
    duration: '45 min',
    pitch:
      '1870s Irish American coal miners, Pinkerton infiltration, and 20 hangings on questionable evidence. Meticulous labor history about ethnicity and institutional power.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/196-the-molly-maguires/id1079096124?i=1000479141515',
  },

  // ===== VIRGINIA =====
  {
    id: 'p_1619_ep1',
    show: '1619 (The New York Times)',
    episode: 'Episode 1: The Fight for a True Democracy',
    region: 'virginia',
    state: 'VA',
    matchedStops: 'Shenandoah Valley / Virginia generally',
    duration: '40 min',
    pitch:
      'Entering Virginia with this episode transforms the landscape — every historic marker carries the weight of what Nikole Hannah-Jones documents.',
    applePodcastsUrl: 'https://podcasts.apple.com/us/podcast/1619/id1476928106',
  },
  {
    id: 'p_99pi_trail_mix',
    show: '99% Invisible',
    episode: '#548–549: Trail Mix (Parts 1 & 2)',
    region: 'virginia',
    state: 'VA',
    matchedStops: 'Shenandoah / Blue Ridge Parkway',
    duration: '~70 min (2 parts)',
    pitch:
      "Design thinking applied to landscape — treating the Appalachian Trail as a built environment shaped by ideology, labor, and evolving philosophy.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/99-invisible/id394775318',
  },

  // ===== EAST TENNESSEE =====
  {
    id: 'p_dolly_hillbilly',
    show: "Dolly Parton's America",
    episode: 'Episode 6: Hillbilly',
    region: 'east_tn',
    state: 'TN',
    matchedStops: 'Jonesborough / Appalachian culture',
    duration: '50 min',
    pitch:
      'Produced at Radiolab standards with the emotional intelligence of the best oral history. Centers young Appalachians speaking for themselves.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/dolly-partons-america/id1481398762',
  },
  {
    id: 'p_dolly_mountain_home',
    show: "Dolly Parton's America",
    episode: 'Episode 2: Tennessee Mountain Home',
    region: 'east_tn',
    state: 'TN',
    matchedStops: 'East Tennessee generally',
    duration: '45 min',
    pitch:
      'Asks the architectural and cultural question you care about: what happens when a place becomes its own monument?',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/dolly-partons-america/id1481398762',
  },

  // ===== CHATTANOOGA =====
  {
    id: 'p_uncivil_song',
    show: 'Uncivil',
    episode: 'The Song',
    region: 'chattanooga',
    state: 'TN',
    matchedStops: 'Chattanooga · pre-Civil War battlefield listening',
    duration: '35 min',
    pitch:
      'Peabody-winning episode tracing the contested history of "Dixie" — featuring the Carolina Chocolate Drops performing it as reclamation. Centers Black voices reclaiming a Confederate symbol with intellectual rigor.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/uncivil/id1275078406',
  },
  {
    id: 'p_dolly_dixie_disappearance',
    show: "Dolly Parton's America",
    episode: 'Episode 7: Dixie Disappearance',
    region: 'chattanooga',
    state: 'TN',
    matchedStops: 'Chattanooga · Tennessee–Alabama transition',
    duration: '55 min',
    pitch:
      "Sophisticated cultural criticism that refuses easy answers — how even beloved figures are implicated in historical erasure.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/dolly-partons-america/id1481398762',
  },

  // ===== BIRMINGHAM, ALABAMA =====
  {
    id: 'p_uncivil_series',
    show: 'Uncivil (Gimlet)',
    episode: 'Full series — especially "The Spin" and "The Raid"',
    region: 'birmingham',
    state: 'AL',
    matchedStops: 'Birmingham and the broader Alabama corridor',
    duration: '~30 min per episode',
    pitch:
      'Peabody Award-winning series that dismantles the official Civil War story through resistance, mutiny, and erasure — then connects it to present-day Southern politics. Co-hosted by Jack Hitt and Chenjerai Kumanyika.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/uncivil/id1275078406',
    isSeries: true,
    episodeCount: 12,
    totalDuration: '~6 hours',
  },
  {
    id: 'p_codeswitch_birmingham',
    show: 'Code Switch (NPR)',
    episode: "Live From Birmingham…It's Code Switch!",
    region: 'birmingham',
    state: 'AL',
    matchedStops: 'Birmingham',
    duration: '45 min',
    pitch:
      'Recorded live at UAB — Mayor Woodfin on growing up in the shadow of civil rights legacy, poet Ashley M. Jones on learning to love her hometown.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/code-switch/id1112190608',
  },
  {
    id: 'p_points_south_civil_rights',
    show: 'Points South (Oxford American)',
    episode: "Stories of the South's Civil Rights Sites",
    region: 'birmingham',
    state: 'AL',
    matchedStops: 'Birmingham Civil Rights landmarks',
    duration: '30 min',
    pitch:
      'Oxford American production examining who narrates civil rights landmarks, what gets preserved, and what gets softened. Literary and rigorous.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/search?term=Points+South+Oxford+American',
  },
  {
    id: 'p_codeswitch_mine_mill',
    show: 'Code Switch (NPR)',
    episode: 'The Story of Mine Mill',
    region: 'birmingham',
    state: 'AL',
    matchedStops: 'Sloss Furnaces · Birmingham industrial history',
    duration: '35 min',
    pitch:
      "The Sloss Furnaces episode — an interracial miners' union in Birmingham's steel industry, organized across racial lines in the Jim Crow South, then destroyed. Perfect companion for a Sloss visit.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/code-switch/id1112190608',
  },
  {
    id: 'p_seizing_freedom',
    show: 'Seizing Freedom (VPM)',
    episode: 'Full series',
    region: 'birmingham',
    state: 'AL',
    matchedStops: 'Alabama corridor',
    duration: '~25–30 min per episode',
    pitch:
      "Historian Dr. Kidada E. Williams reconstructs how Black people seized their own freedom, using first-person accounts performed by voice actors. Impeccable scholarship.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/seizing-freedom/id1520070952',
    isSeries: true,
    episodeCount: 28,
    totalDuration: '~13 hours',
  },
  {
    id: 'p_gravy_jjs_sandwich',
    show: 'Gravy (Southern Foodways Alliance)',
    episode: "JJ's Sandwich Shop",
    region: 'birmingham',
    state: 'AL',
    matchedStops: 'Birmingham',
    duration: '20 min',
    pitch:
      "A glatt kosher deli on wheels operated by Birmingham's oldest Orthodox Jewish congregation. Finds a completely unexpected marginalized community within Birmingham, told with the SFA's signature warmth.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/gravy/id892362799',
  },

  // ===== MISSISSIPPI =====
  {
    id: 'p_radiolab_flag_fury',
    show: 'Radiolab (WNYC)',
    episode: 'The Flag and the Fury',
    region: 'mississippi',
    state: 'MS',
    matchedStops: 'Jackson · statewide',
    duration: '50 min',
    pitch:
      "duPont Award-winning reporting on Mississippi's Confederate flag — 126 years of political maneuvering ending in 2020. Patient, layered, extraordinary.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/radiolab/id152249110',
  },
  {
    id: 'p_points_south_hamer',
    show: 'Points South (Oxford American)',
    episode: "Fannie Lou Hamer's Freedom Farm",
    region: 'mississippi',
    state: 'MS',
    matchedStops: 'Mississippi Delta / Sunflower County',
    duration: '30 min',
    pitch:
      "Hamer's radical cooperative farming initiative — food sovereignty for Black Delta communities locked out of the economy they built.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/search?term=Points+South+Oxford+American',
  },
  {
    id: 'p_99pi_last_top_model',
    show: '99% Invisible',
    episode: "America's Last Top Model",
    region: 'mississippi',
    state: 'MS',
    matchedStops: 'Jackson, MS',
    duration: '25 min',
    pitch:
      'A 200-acre physical model of the entire Mississippi River Basin in Jackson, built using German POW labor. Now abandoned. Classic 99PI.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/99-invisible/id394775318',
  },
  {
    id: 'p_fresh_air_ward',
    show: 'Fresh Air (NPR)',
    episode: 'Jesmyn Ward on Sing, Unburied, Sing',
    region: 'mississippi',
    state: 'MS',
    matchedStops: 'Mississippi Gulf Coast · DeLisle · Parchman',
    duration: '35 min',
    pitch:
      "Ward on Parchman, being a Black writer in Mississippi, and why she stays. One of Terry Gross's finest late-career conversations.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/fresh-air/id214089682',
  },
  {
    id: 'p_constitutional_fair_punishment',
    show: "Washington Post Constitutional",
    episode: 'Episode 9: Fair Punishment',
    region: 'mississippi',
    state: 'MS',
    matchedStops: 'Parchman, Mississippi',
    duration: '40 min',
    pitch:
      "Parchman Farm, Gates v. Collier, and Alan Lomax's field recordings of inmate work songs. History through law and music.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/constitutional/id1341954199',
  },
  {
    id: 'p_gravy_catfish_dream',
    show: 'Gravy (Southern Foodways Alliance)',
    episode: 'Catfish Dream',
    region: 'mississippi',
    state: 'MS',
    matchedStops: 'Mississippi Delta',
    duration: '20 min',
    pitch:
      'Ed Scott opened the first Black-owned catfish processing plant in the Delta — a radical act where Black farmers grew the fish but white companies controlled all the profit.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/gravy/id892362799',
  },
  {
    id: 'p_1619_land_of_fathers',
    show: '1619 (The New York Times)',
    episode: 'Episode 5: The Land of Our Fathers',
    region: 'mississippi',
    state: 'MS',
    matchedStops: 'Mississippi',
    duration: '35 min',
    pitch:
      "Black land loss in Mississippi — how families who acquired land after emancipation were systematically dispossessed. This is about the specific dirt you're driving over.",
    applePodcastsUrl: 'https://podcasts.apple.com/us/podcast/1619/id1476928106',
  },
  {
    id: 'p_scene_seeing_white',
    show: 'Scene on Radio',
    episode: 'Seeing White (Season 2) — Part 6 is Mississippi-focused',
    region: 'mississippi',
    state: 'MS',
    matchedStops: 'Mississippi and the broader Deep South',
    duration: '~40–50 min per episode',
    pitch:
      "John Biewen and Chenjerai Kumanyika trace the invention of whiteness from colonial Virginia to modern America. Two-time Peabody nominee. Essential companion for the entire Southern portion of the route.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/scene-on-radio/id1036276968',
    isSeries: true,
    episodeCount: 14,
    totalDuration: '~10 hours',
  },
  {
    id: 'p_1619_ep2_economy',
    show: '1619 (The New York Times)',
    episode: 'Episode 2: The Economy That Slavery Built',
    region: 'mississippi',
    state: 'MS',
    matchedStops: 'Alabama / Mississippi black belt',
    duration: '40 min',
    pitch:
      'Hannah-Jones and Matthew Desmond trace how cotton plantations invented the financial instruments that became American capitalism. Transforms the Mississippi landscape into an economic text.',
    applePodcastsUrl: 'https://podcasts.apple.com/us/podcast/1619/id1476928106',
  },
  {
    id: 'p_gravy_pastrami',
    show: 'Gravy (Southern Foodways Alliance)',
    episode: 'The Pastrami at Olde Tyme Deli',
    region: 'mississippi',
    state: 'MS',
    matchedStops: 'Jackson, MS',
    duration: '20 min',
    pitch:
      "Jewish Southern identity during the civil rights era through a Jackson pastrami sandwich. Another hidden community within the larger civil rights narrative.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/gravy/id892362799',
  },
  {
    id: 'p_history_unplugged_vicksburg',
    show: 'History Unplugged',
    episode: 'How the Vicksburg Siege May Have Turned the Tide of the Civil War',
    region: 'mississippi',
    state: 'MS',
    matchedStops: 'Vicksburg National Military Park',
    duration: '45 min',
    pitch:
      'Scholarly and evidence-based — contextualizes the battlefield without romanticizing either side. 47-day siege, Grant\u2019s campaign, Mississippi River strategy.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/history-unplugged-podcast/id1314530213',
  },

  // ===== FORT WORTH / DALLAS =====
  {
    id: 'p_nba_kahn',
    show: 'New Books in Architecture',
    episode: 'Louis Kahn: Architecture as Philosophy',
    region: 'dfw',
    state: 'TX',
    matchedStops: 'Kimbell Art Museum',
    duration: '60 min',
    pitch:
      "Kahn scholar John Lobell on the Kimbell's cycloid vaults and the most beautiful natural lighting in any museum. Essential before standing inside the Kimbell.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/john-lobell-louis-kahn-architecture-as-philosophy-monacelli/id425210498?i=1000496212635',
  },
  {
    id: 'p_99pi_mind_architect',
    show: '99% Invisible',
    episode: 'The Mind of an Architect',
    region: 'dfw',
    state: 'TX',
    matchedStops: 'Kimbell · Rothko Chapel (bridges DFW and Houston)',
    duration: '25 min',
    pitch:
      'A 1958 study of 40 leading architects including Kahn, Philip Johnson, and Saarinen — gathered at Berkeley and studied for what makes creative minds work.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/99-invisible/id394775318',
  },
  {
    id: 'p_gravy_kolaches',
    show: 'Gravy (Southern Foodways Alliance)',
    episode: 'Czech Out Texas Kolaches',
    region: 'dfw',
    state: 'TX',
    matchedStops: 'DFW / Texas generally',
    duration: '20 min',
    pitch:
      'A small, perfect SFA story about immigrant food heritage in Texas — the kind of marginalized cultural history that enriches a road trip.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/gravy/id892362799',
  },

  // ===== HOUSTON =====
  {
    id: 'p_lonely_palette_rothko',
    show: 'The Lonely Palette',
    episode: "Rothko's Untitled (Black on Gray)",
    region: 'houston',
    state: 'TX',
    matchedStops: 'Rothko Chapel',
    duration: '30 min',
    pitch:
      "Rigorous art history delivered with emotional honesty — treating ordinary viewers' responses with as much respect as expert analysis.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/the-lonely-palette/id1159154533',
  },
  {
    id: 'p_artcurious_rothko_auction',
    show: 'ArtCurious',
    episode: "#72: Art Auction Audacity — Rothko's No. 6",
    region: 'houston',
    state: 'TX',
    matchedStops: 'Rothko Chapel · Menil Collection',
    duration: '35 min',
    pitch:
      'The $186M Rothko sale, the Bouvier Affair, and Rothko\u2019s relationship with the de Menil family who commissioned the Chapel.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/the-artcurious-podcast/id1188484683',
  },
  {
    id: 'p_artcurious_twombly',
    show: 'ArtCurious',
    episode: '#112: Modern Love — Rauschenberg, Cy Twombly, and Jasper Johns',
    region: 'houston',
    state: 'TX',
    matchedStops: 'Cy Twombly Gallery · Menil Collection',
    duration: '35 min',
    pitch:
      'Centers a queer love story within canonical art history, showing how personal lives shape artistic legacy.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/the-artcurious-podcast/id1188484683',
  },
  {
    id: 'p_gravy_west_africa',
    show: 'Gravy (Southern Foodways Alliance)',
    episode: 'In Houston, Three Tastes of West Africa',
    region: 'houston',
    state: 'TX',
    matchedStops: 'Houston · Montrose area',
    duration: '25 min',
    pitch:
      "Three West African food establishments in Houston contextualized within the 1965 Immigration Act and Nigerian Civil War patterns. Centers immigrant voices and cultural survival through food.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/gravy/id892362799',
  },
  {
    id: 'p_gravy_brisket_pho',
    show: 'Gravy (Southern Foodways Alliance)',
    episode: 'Brisket Pho, A Viet Tex Story',
    region: 'houston',
    state: 'TX',
    matchedStops: 'Houston',
    duration: '25 min',
    pitch:
      'How 140,000 Vietnamese Houstonians transformed Texas barbecue and crawfish culture. Centers immigrant creativity, never exoticizes.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/gravy/id892362799',
  },
  {
    id: 'p_99pi_missing_bus',
    show: '99% Invisible',
    episode: 'Missing the Bus',
    region: 'houston',
    state: 'TX',
    matchedStops: 'Houston',
    duration: '25 min',
    pitch:
      'Houston scrapped its entire bus network and redesigned it from scratch. Design-systems thinking about why the city moves the way it does.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/99-invisible/id394775318',
  },
  {
    id: 'p_houston_matters_project_row',
    show: 'Houston Matters (KUHF)',
    episode: 'Museum Visits: Project Row Houses',
    region: 'houston',
    state: 'TX',
    matchedStops: 'Houston · Third Ward',
    duration: '20 min',
    pitch:
      "Art as community infrastructure — how Black artists transformed abandoned shotgun houses in Third Ward into installations, housing, and programs.",
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/houston-matters/id296926019',
  },
  {
    id: 'p_below_waterlines',
    show: 'Below the Waterlines (Houston Public Media)',
    episode: 'Full series — Houston after Hurricane Harvey',
    region: 'houston',
    state: 'TX',
    matchedStops: 'Houston · Buffalo Bayou',
    duration: '~25–35 min per episode',
    pitch:
      'Houston five years after Harvey — who recovered and who didn\u2019t, told with the structural rigor you demand. Essential for understanding Buffalo Bayou as a living system.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/search?term=Below+the+Waterlines+Houston',
    isSeries: true,
    episodeCount: 6,
    totalDuration: '~3 hours',
  },
  {
    id: 'p_floodlines',
    show: 'Floodlines (The Atlantic)',
    episode: 'Full 8-episode series',
    region: 'houston',
    state: 'TX',
    matchedStops: 'Gulf South corridor · Mississippi → Houston',
    duration: '~35–45 min per episode',
    pitch:
      'Arguably the finest podcast ever made about an American disaster. Vann R. Newkirk II frames Katrina as a story of abandonment, resilience, and the political construction of \u201cnatural\u201d disasters. Essential Gulf South listening.',
    applePodcastsUrl:
      'https://podcasts.apple.com/us/podcast/floodlines/id1501433969',
    isSeries: true,
    episodeCount: 8,
    totalDuration: '~5 hours',
  },
]
