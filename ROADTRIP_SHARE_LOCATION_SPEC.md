# Road Trip PWA v2 — Share + Live Location Spec
## For Claude Code · April 12, 2026

---

## 1. SHARE BUTTON (Aurelia's view primarily, available to all)

### What it does
A share button on every stop card that lets the user share the stop to iMessage, Instagram Stories, or copy a link. On Aurelia's theme, it's prominent. On other themes, it's subtle.

### Interaction
- Button appears on every stop card (planned and discover), in the action button row alongside Nav/Menu/Photos
- Icon: share icon (↗ or the standard iOS share icon)
- Tap opens the **Web Share API** (`navigator.share()`), which triggers the native iOS share sheet

### Implementation
```javascript
async function shareStop(stop, person) {
  const text = person === 'aurelia'
    ? `${stop.name} ✨ ${stop.pitch.aurelia}`
    : `${stop.name} — ${stop.pitch[person] || stop.pitch.jonathan}`;
  
  const shareData = {
    title: stop.name,
    text: text,
    // No URL since this is a PWA without individual stop pages
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      // Fallback: copy text to clipboard
      await navigator.clipboard.writeText(text);
      // Show toast: "Copied to clipboard"
    }
  } catch (err) {
    // User cancelled share — do nothing
  }
}
```

### Web Share API support
- Works on iOS Safari and PWAs added to Home Screen — which is exactly your deployment target
- The native share sheet lets Aurelia send to iMessage, Instagram, TikTok, Snapchat, or anywhere else without you building integrations for each
- On desktop browsers that don't support `navigator.share`, fall back to copying text to clipboard with a toast notification

### Per-theme styling

**Aurelia:**
- Share button is PROMINENT — same visual weight as the Nav button
- Deep rose filled button with share icon
- Text: "Share ✨"
- This is her feature. She's the one who will use it 50 times.

**Helen:**
- Subtle outline button, sage border, share icon only (no text)
- She might share a restaurant to a friend — it should be available but not loud

**Jonathan:**
- Minimal — small icon button, copper tint, no text
- He's not sharing stops to Instagram

**Rafa:**
- Share button present but styled down — a 4-year-old isn't sharing to social media
- If he taps it, it works (the parent might use his device to share), but it's not prominent

### Map card slide-up
Share button also appears in the card slide-up when a pin is tapped on the map. Same position, same behavior.

### What gets shared
The share text includes:
- Stop name
- The pitch for the active person (so Aurelia shares Aurelia-voice text, Helen shares Helen-voice text)
- No link (the PWA doesn't have shareable URLs per stop)
- No image (we don't have stop images embedded in the app)

If you want to add an image in the future, the Web Share API supports sharing files — but that requires having images in the app data, which is a larger scope change.

---

## 2. LIVE LOCATION TRACKING

### What it does
Shows the family's current position on the map as a blue dot. The Itinerary tab auto-advances to show where you are on today's route. Works when GPS is available, degrades gracefully when it's not.

### How it works

**Getting location:**
```javascript
// Request permission and watch position
const watchId = navigator.geolocation.watchPosition(
  (position) => {
    const { latitude, longitude, accuracy } = position.coords;
    updateLocationDot(latitude, longitude, accuracy);
  },
  (error) => {
    // Permission denied, unavailable, or timeout
    handleLocationUnavailable(error);
  },
  {
    enableHighAccuracy: false,  // Save battery — road-level accuracy is fine
    maximumAge: 30000,          // Accept positions up to 30 seconds old
    timeout: 10000              // Give up after 10 seconds
  }
);
```

**Permission flow:**
- On first use, the browser/PWA prompts "Allow location access?"
- If granted: blue dot appears on map, features activate
- If denied: everything works exactly as before, no blue dot, no auto-advance. No nagging. Show a small muted text at the bottom of the map: "Location off — tap to enable" that links to a brief explainer on how to enable it in Settings.
- If the user never sees the prompt (some browsers): same as denied, everything works without it

### The blue dot

**On the Leaflet map (online):**
- Standard blue circle marker with a semi-transparent accuracy ring
- Pulsing animation (subtle, like Apple Maps)
- The dot updates every 30 seconds (not real-time — save battery)
- If accuracy is worse than 500m, show a larger, more transparent accuracy ring so the user knows the position is approximate
- The map does NOT auto-follow the dot (that would fight with manual panning). Instead, a small "recenter" button (◉) appears in the bottom-left when the dot is off-screen. Tap to pan back to current location.

**On the SVG map (offline):**
- Show the dot at the last known position before going offline
- Add a small "Last updated: 2:34 PM" label below the dot
- The dot stays static until signal returns
- If no position was ever obtained, don't show a dot at all — the SVG map works fine without it

### Auto-advance features

**"Next Up" card (from UX Polish spec):**
When live location is available, "Next Up" becomes smarter:
- Instead of relying only on "mark as visited" to advance, it also checks: is the user's current position past the current stop?
- "Past" means: the user's latitude/longitude is closer to the NEXT stop than to the current stop (simple nearest-waypoint calculation using the route waypoints array)
- If the user is past a stop but hasn't marked it visited, show a subtle prompt on the "Next Up" card: "Looks like you passed [stop name]. Mark as visited?" with a one-tap button
- This does NOT auto-mark anything — always manual confirmation

**Day auto-detection (from UX Polish spec):**
Already handled by date, not location. No change needed.

**Emergency stop button (from UX Polish spec):**
When live location is available, "nearest" becomes truly nearest:
- Instead of "next in sequence after last visited," calculate actual distance from current position to each upcoming stop
- Sort by distance, show the closest 2 bathroom and closest 2 energy stops
- If location is unavailable, fall back to the sequence-based method (already specced)

### Graceful degradation tiers

**Tier 1 — Full GPS available (highway, suburbs, cities):**
- Blue dot on map, real-time position
- Smart "Next Up" advancement suggestions
- Distance-based emergency stop sorting
- Everything works

**Tier 2 — GPS available but inaccurate (mountain valleys, rural areas):**
- Blue dot on map with large accuracy ring
- Position updates may be slow or jumpy
- App still functions — just less precise
- No change in behavior, just visual indication of uncertainty

**Tier 3 — GPS unavailable (tunnels, dead zones, signal lost):**
- Blue dot freezes at last known position
- Small "Location unavailable" indicator (muted text, not alarming)
- "Next Up" falls back to manual visited-state tracking
- Emergency button falls back to sequence-based ordering
- All other app features work normally — filters, cards, themes, offline SVG map

**Tier 4 — GPS permission denied or never granted:**
- No blue dot anywhere
- No location-based features
- App works exactly as specced before this document
- Zero degradation in core functionality
- Small unobtrusive "Enable location" link available but not pushy

### Battery considerations
- Use `enableHighAccuracy: false` — road-level is fine, no need for GPS chip
- Update interval: every 30 seconds via `watchPosition` (the browser manages this efficiently)
- When the app is in the background (screen off or switched to another app), `watchPosition` automatically pauses on iOS — no extra code needed
- If battery is a concern, the user can deny location permission and the app works without it

### Privacy
- Location data stays on the device — never sent to any server
- No location history is stored — only the current position is held in React state
- When the app closes, the position is gone
- This is explicitly NOT a family tracking feature — each phone shows only its own position

---

## BUILD ORDER

1. Add share button to stop cards with Web Share API + clipboard fallback
2. Style share button per theme (prominent for Aurelia, subtle for others)
3. Add share button to map card slide-up
4. Request geolocation permission and display blue dot on Leaflet map
5. Add accuracy ring and pulse animation
6. Add "recenter" button when dot is off-screen
7. Wire location into "Next Up" — suggest mark-as-visited when user passes a stop
8. Wire location into emergency button — sort by actual distance when available
9. Add blue dot to SVG offline map (last known position)
10. Test all four degradation tiers
11. Test battery impact over a 30-minute session

Push after steps 3, 6, 9, and 11.

---

## WHAT NOT TO BUILD

- No family tracking (showing other family members' locations)
- No location history or breadcrumb trail
- No speed or ETA calculations (Waze does this)
- No geofencing alerts ("you're near a stop!")
- No background location tracking
- No server-side location storage
