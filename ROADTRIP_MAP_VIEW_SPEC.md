# Road Trip PWA v2 — Map View Spec
## For Claude Code · April 11, 2026

---

## WHAT THIS IS

Add an interactive map as the primary visual element across three tabs (Itinerary, Discover, Helen's Media). One shared map component, three data layers. Graceful offline fallback via pre-rendered SVG route diagram.

This spec supplements the existing rebuild specs. All stop data, person tags, pitches, themes, and filters remain the same — the map is a new way to display the same data.

---

## ARCHITECTURE

### One component: `<RouteMap />`

Props:
- `mode`: 'itinerary' | 'discover' | 'media'
- `stops`: array of stop objects to display as pins
- `activeDay`: current day filter (itinerary mode)
- `activeState`: current state filter (discover mode)
- `activePerson`: current person/theme
- `onStopSelect`: callback when a pin is tapped — triggers the card slide-up

The component handles its own online/offline detection internally. Parent tabs don't need to know which renderer is active.

### Library: Leaflet.js + react-leaflet

```
npm install leaflet react-leaflet
```

Tiles: OpenStreetMap (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`)

No API keys needed. Free. Works in React. Lightweight.

---

## ONLINE MODE: Interactive Leaflet Map

### Map appearance
- Tiles: OpenStreetMap, but styled to feel less "default" — use a muted/grayscale tile layer that lets the route and pins pop. Options:
  - CartoDB Positron (light, clean): `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`
  - CartoDB Dark Matter (for Jonathan/Rafa dark themes): `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
- Switch tile style based on active theme:
  - Jonathan: Dark Matter tiles
  - Helen: Positron (light) tiles
  - Aurelia: Positron tiles with pink-tinted UI overlay
  - Rafa: Dark Matter tiles

### Route line
- Draw the full route as a polyline from Belmont, MA to Houston, TX
- Waypoints (in order): Belmont MA → Hartford CT → Catskills NY → Scranton PA → Harrisburg PA → Shenandoah Valley VA → Jonesborough TN → Elizabethton TN → Chattanooga TN → Birmingham AL → McComb MS → Jackson MS → Vicksburg MS → Monroe LA → Shreveport LA → Dallas TX → Fort Worth TX → Kennedale TX → Houston TX
- Line style: 3px solid, theme accent color, slight opacity (0.7)
- Don't use a routing API — just connect the waypoints as straight-line segments or gentle curves. This is a visual representation, not turn-by-turn directions.

### Route coordinates (approximate, for polyline):
```javascript
const ROUTE_WAYPOINTS = [
  [42.396, -71.178],   // Belmont MA
  [41.764, -72.682],   // Hartford CT
  [42.130, -74.560],   // Catskills NY (approximate)
  [41.409, -75.662],   // Scranton PA
  [40.264, -76.884],   // Harrisburg PA
  [38.150, -79.072],   // Staunton VA (Shenandoah)
  [37.271, -79.941],   // Roanoke VA
  [36.920, -81.858],   // Abingdon VA
  [36.313, -82.353],   // Jonesborough/Johnson City TN
  [36.315, -82.174],   // Elizabethton TN
  [35.046, -85.310],   // Chattanooga TN
  [33.521, -86.802],   // Birmingham AL
  [31.244, -90.454],   // McComb MS
  [32.299, -90.185],   // Jackson MS
  [32.353, -90.878],   // Vicksburg MS
  [32.509, -92.119],   // Monroe LA
  [32.525, -93.750],   // Shreveport LA
  [32.460, -96.637],   // Kennedale/DFW TX
  [29.760, -95.370],   // Houston TX
];
```

### Pins
- Custom circular markers, not default Leaflet pins
- Color-coded by TYPE:
  - Food: #d4772c (warm orange)
  - Energy: #2d8a4e (green)
  - Photo: #7c3aed (purple)
  - POI: #1565c0 (blue)
  - Gas: #6b7280 (gray)
  - Viral: #e91e63 (pink)
- Size: 12px diameter default, 16px for star/featured stops
- Star stops get a subtle outer glow ring in the type color
- Buc-ee's stops get a yellow (#fdd835) pin with a slightly larger size
- When a pin is tapped/selected, it scales up to 20px with a bounce animation

### Pin filtering
- In **Itinerary mode**: show only stops matching the active day filter. "All Days" shows all planned stops.
- In **Discover mode**: show only discover POIs matching active state and type filters.
- In **Media mode** (Helen only): show podcast episode locations as headphone icons along the route.
- Person filter always applies — show stops tagged for the active person + "everyone."
- Pins animate in/out when filters change (simple fade, 200ms).

### Card slide-up
When a pin is tapped:
1. Map smoothly pans to center the selected pin
2. A card slides up from the bottom of the screen (like Apple Maps or Eater)
3. Card shows:
   - Stop name (themed heading)
   - Person tags
   - Type tags
   - Pitch for the active person
   - Veg notes (always visible on Helen's view)
   - Details (hours, admission, tips)
   - Action buttons: Nav (Waze/Apple Maps), Menu (if menuUrl exists), Photos (if photosUrl exists), TikTok (Aurelia only)
   - For podcasts (Media mode): show name, episode title, duration, route match indicator (📍), Apple Podcasts button
4. Card height: roughly 40% of screen height. Map is visible above.
5. Swipe down or tap outside to dismiss the card.
6. Card styling follows the active theme — same card design as the rest of the app.

### Map interaction
- Pinch to zoom, drag to pan (standard Leaflet)
- `overscroll-behavior: none` on the map container to prevent page bouncing
- Disable scroll-zoom on mobile (use pinch only) — prevents the "trying to scroll the page but zooming the map instead" problem. Set `scrollWheelZoom: false` on mobile.
- On initial load, fit the map bounds to show the full route
- When a day filter is active, zoom to fit just that day's stops
- When a state filter is active, zoom to fit that state's stops

---

## OFFLINE MODE: Pre-rendered SVG Route Diagram

### Detection
```javascript
// Check online status
const isOnline = () => navigator.onLine;

// Also try loading a single tile as a canary
const checkTileAccess = async () => {
  try {
    const resp = await fetch('https://a.basemaps.cartocdn.com/light_all/0/0/0.png', {
      mode: 'no-cors',
      cache: 'no-store'
    });
    return true;
  } catch {
    return false;
  }
};
```

If offline, render the SVG map instead of Leaflet. When connection returns (listen to `window.addEventListener('online', ...)`), swap back to Leaflet automatically.

### SVG design

A **stylized schematic route diagram** — NOT a geographic map. Think London Tube map or national park trail map. The route is a clean, readable line with stops as dots. States are labeled but not drawn as shapes.

#### Layout
- Vertical orientation (scrollable on mobile)
- Route drawn as a single line from top (Belmont) to bottom (Houston)
- The line can bend and zigzag to create visual segments for each state
- State labels appear as section headers along the route
- Stop dots positioned along the line at their relative positions

#### Per-theme styling
The SVG uses CSS custom properties so it transforms with the theme:

- **Jonathan**: Near-black background, copper (#c0734a) route line, warm gray labels, copper stop dots
- **Helen**: Linen (#f5f1ec) background, sage (#6b8f8f) route line, brass (#b8956a) stop dots and labels, Playfair Display state labels
- **Aurelia**: Blush (#fdf0f4) background, deep rose (#c2185b) route line, rose stop dots, soft labels
- **Rafa**: Deep space (#0a0e1a) background, red (#d32f2f) route line, electric blue (#1565c0) stop dots, UPPERCASE bold state labels, larger dots

#### Stop dots on SVG
- Same color-coding as online pins (by type)
- Tappable — same card slide-up behavior as online mode
- Star stops get a slightly larger dot with a ring
- Active filter highlights matching dots and dims non-matching ones (opacity 0.2)

#### SVG data
The SVG is generated at build time from the stop data — not hand-drawn. A build script or component that:
1. Takes the ordered list of route waypoints
2. Maps them to SVG coordinates (top-to-bottom, with state groupings)
3. Places stop dots at their relative positions
4. Adds state labels and day markers
5. Outputs a styled SVG that can be rendered inline in React

This means the SVG updates automatically when stop data changes — no manual illustration needed.

---

## TAB-SPECIFIC BEHAVIOR

### Itinerary tab
- Map shows at the top of the tab, taking ~50% of screen height
- Stop list remains below the map (scrollable)
- Map and list are synced: tapping a pin scrolls to the card in the list, tapping a card in the list highlights the pin on the map
- Day filter controls what appears on both map and list simultaneously
- The map effectively replaces the day headers as the spatial organizer

### Discover tab
- Map takes the full screen (minus the tab bar and state selector)
- No list below — the map IS the interface
- State selector pills appear as a floating overlay at the top of the map
- Selecting a state zooms the map to that state and shows its discover POIs
- Type filter pills float below the state selector
- Card slide-up is the only way to see stop details
- This is the "Eater app" experience — browse the map, tap what looks interesting

### Helen's Media tab (podcasts)
- Map shows at the top (~50% of screen height)
- Pins are headphone icons (🎧) instead of circles, positioned at the route segment each episode matches
- Episodes organized by route segment in the list below
- Tapping a headphone pin slides up a podcast card with:
  - Show name
  - Episode title
  - Duration badge
  - Route match indicator: "📍 Birmingham, AL"
  - Pitch text
  - Apple Podcasts button
  - Series badge if multi-episode (with episode count and total duration)
- Color of headphone icons: theme accent color (sage for Helen, since this is her tab)

### Other Media tabs (Aurelia YouTube, Rafa YouTube)
- No map. YouTube content is not location-based. These tabs stay as-is.

### Jonathan's Media tab
- If his podcast list is provided, show the map with his episodes. If not, this tab remains empty/hidden for Jonathan as specced.

---

## RESPONSIVE / DEVICE BEHAVIOR

### iPhone (375px width)
- Map height: 50% of viewport in Itinerary and Media modes, 100% (minus tab bar) in Discover mode
- Card slide-up covers bottom 45% of screen
- Pins: 12px default, 16px starred
- Touch targets for pins: invisible hit area of at least 44x44px (iOS guideline) even though the visible pin is smaller

### iPad Pro (1024px+ width, Rafa's device)
- Map height: 60% of viewport
- Card slide-up can be wider (max 500px) and positioned to the side on landscape
- Pins: 16px default, 20px starred
- Touch targets: 56x56px minimum
- In Discover mode, map can show card as a sidebar (left 35% card, right 65% map) instead of bottom slide-up

---

## PERFORMANCE

### Tile caching
- Service worker should cache loaded map tiles opportunistically — once a tile is fetched, keep it in cache
- Add a "Cache tiles for tomorrow" button or automatic behavior: when on WiFi, pre-fetch tiles at zoom levels 6-12 for the next day's route corridor
- Cache strategy: cache-first for tiles (they don't change), network-first for stop data (in case of updates)

### SVG performance
- The SVG route diagram should be lightweight (<50KB)
- All stop dots should be rendered as `<circle>` elements with data attributes for filtering (not separate SVG files)
- Filter animations use CSS opacity transitions, not re-renders

### Map initialization
- Lazy-load Leaflet — don't include it in the initial bundle. Load it when the user first navigates to a tab that shows the map.
- Show a skeleton/placeholder while Leaflet loads (a simple themed rectangle with "Loading map..." in the theme's muted text color)

---

## BUILD ORDER

1. Create the `<RouteMap />` component with Leaflet, route polyline, and basic pins
2. Implement pin filtering (day/state/type/person)
3. Build the card slide-up panel
4. Wire up to Itinerary tab (map + list sync)
5. Wire up to Discover tab (full-map mode with floating filters)
6. Wire up to Helen's Media tab (headphone icons + podcast cards)
7. Build the SVG offline fallback
8. Implement online/offline detection and automatic switching
9. Add tile caching to service worker
10. Theme the map tiles (light/dark per person)
11. Test on iPhone and iPad Pro

Push after steps 3, 6, 8, and 11.

---

## WHAT NOT TO BUILD

- No turn-by-turn directions (Waze/Apple Maps handles this)
- No GPS tracking / "where am I" dot (battery drain, complexity, not worth it)
- No routing API calls (just connect waypoints with straight lines)
- No custom map tile server
- No geofencing or push notifications
- No "you are here" dot — this is a planning tool, not a nav app
