# Road Trip PWA v2 — UX Polish Spec
## For Claude Code · April 11, 2026

---

## WHAT THIS IS

Five interaction features that reduce friction and make the app feel alive during the trip. These layer on top of the existing app — no structural changes to tabs, themes, or data. Read after all prior specs.

---

## 1. RIGHT NOW AWARENESS

The app should know what day it is and act accordingly.

### Auto-detect today
- On load, check the current date against the trip dates (Apr 17–24, 2026)
- If today falls within the trip, automatically set the day filter to today
- If today is before Apr 17, default to "All Days" (planning mode)
- If today is after Apr 24, default to "All Days" (memory mode)

### "Next Up" card
When a day is active (either auto-detected or manually selected), show a **persistent "Next Up" card** pinned to the top of the Itinerary tab, above the regular stop list.

The "Next Up" card shows the next unvisited planned stop for today (see "Mark as Visited" in section 4). It contains:
- Stop name (large, themed heading)
- Estimated arrival or time window if the stop has one (from the itinerary data)
- One-tap navigation button (Waze for Jonathan, Apple Maps for everyone else)
- Person tags
- The pitch for the active person
- A subtle "Skip →" button that advances to the next stop (marks this one as visited)

If all of today's stops are marked visited, the "Next Up" card shows the overnight destination (Tonight card data) with the lodging address and a nav button.

If today has no planned stops (e.g., a Kennedale rest day), the "Next Up" card shows the day's structure instead: "Divide & Conquer — Team Helen leaves at 10am for the Kimbell."

### Map integration
When "Right Now" is active, the map should:
- Auto-zoom to show today's stops (not the full route)
- Highlight the "Next Up" stop's pin with a pulse animation
- Dim already-visited stop pins (reduced opacity)

### Before the trip (planning mode)
Before Apr 17, the app works exactly as it does now — no auto-detection, no "Next Up" card, all filters manual. The trip hasn't started yet; the user is browsing and planning.

---

## 2. SWIPE BETWEEN DAYS

### Gesture
On the Itinerary tab, swipe left to advance to the next day, swipe right to go back a day. The content transitions with a horizontal slide animation (200ms ease-out).

### Implementation
- Use touch events (`touchstart`, `touchmove`, `touchend`) on the content area below the filter bar
- Minimum swipe distance: 50px horizontally with less than 30px vertical movement (to distinguish from scrolling)
- The day filter pills update to reflect the new active day
- The map (if visible) re-zooms to the new day's stops
- On the last day (Fri 24), swiping left does nothing. On the first day (Fri 17), swiping right does nothing.
- "All Days" is not part of the swipe sequence — it's only accessible by tapping the "All" pill directly

### Visual feedback
- During the swipe, the content moves with the finger (parallax follow at 0.3x speed — subtle, not 1:1)
- If the swipe doesn't reach the threshold, the content snaps back
- Day pill indicator updates with the same slide direction

### Scope
- Swipe only works on the Itinerary tab
- Discover and Media tabs don't swipe between days (they have their own navigation)
- Swipe does NOT conflict with map panning — the swipe gesture area is the list/card area below the map, not the map itself

---

## 3. EMERGENCY STOP BUTTON

### The button
A floating action button (FAB) positioned in the bottom-right corner of the screen, above the bottom tab bar. Visible on ALL tabs during the trip (Apr 17–24). Hidden before and after the trip.

- Icon: ⚡ on Rafa's theme, 🚻 on other themes (bathroom is the universal emergency)
- Size: 56px diameter (iOS touch target)
- Background: theme accent color
- Shadow: elevated, feels tappable
- Slight bounce animation on first appearance each session (draws attention once, then stays still)

### What it does
Tap the FAB → a bottom sheet slides up showing two sections:

**🚻 NEAREST BATHROOM**
Shows the next 2 planned stops on today's route that have bathrooms (gas stations, Buc-ee's, restaurants, parks with noted bathroom facilities). Each entry shows:
- Stop name
- Approximate distance along the route from the previous stop (not GPS — use the sequence position: "2 stops ahead")
- One-tap nav button
- Whether it's a "real" bathroom or a gas station

**⚡ NEAREST ENERGY BURN**
Shows the next 2 energy-burn stops on today's route (type: 'energy'). Each entry shows:
- Stop name
- Indoor/outdoor tag
- One-tap nav button
- What's there for Rafa specifically

### How "nearest" works without GPS
Since we're not using GPS, "nearest" means "next in the sequence on today's route that hasn't been marked as visited." The app assumes you're progressing through the day in order. If you've marked stops 1-3 as visited, the "nearest" bathroom is the first one at or after stop 4.

This is imperfect but functional. It answers "what's coming up" not "what's closest to my current GPS coordinates" — and for a road trip on a fixed route, those are usually the same thing.

### Dismiss
Tap outside the bottom sheet or swipe it down to dismiss. The FAB stays visible.

---

## 4. MARK AS VISITED

### Interaction
On any planned stop card (in the list or in the map card slide-up), show a subtle circle/checkbox in the top-right corner. Tap to mark as visited.

- Unvisited: empty circle, themed border color
- Visited: filled circle with a checkmark, theme accent color
- Tap toggles between states (mistakes happen)

### Visual effect when marked visited
- The card dims slightly (opacity 0.6)
- A thin strikethrough line appears on the stop name (subtle, not aggressive)
- The card moves to the bottom of its day section (below unvisited stops)
- On the map, the pin gets a checkmark ring and reduced opacity
- Transition: 300ms ease-out, the card slides down in the list smoothly

### Effect on other features
- "Next Up" card advances to the next unvisited stop
- Emergency stop button skips visited stops when finding "nearest"
- Day progress: show a small progress indicator next to the day label — "3/7 stops" in muted text

### Persistence
Store visited state in localStorage keyed by stop ID:
```javascript
localStorage.setItem('visited', JSON.stringify(['stop_id_1', 'stop_id_2']))
```

Survives app closes and reopens. Does NOT need to sync across devices — each family member's phone tracks their own visited state independently.

### Reset
Long-press (500ms) on a day header to get an option: "Reset all visited for this day." Confirmation required ("Reset 5 visited stops for Sat 18?"). This handles the "I accidentally marked everything" case.

---

## 5. MARK AS "NOT INTERESTED"

### Where it appears
Only on **Discover** stops (browse-and-discover POIs), NOT on planned itinerary stops. Planned stops are the itinerary — you don't dismiss your own plan. Discover stops are suggestions — dismissing them is the whole point of browsing.

### Interaction
On any Discover stop card (in the list or map card slide-up), show a small "✕" button in the top-right corner (opposite side from the visited checkmark, which doesn't appear on Discover cards).

Tap the ✕:
- The card fades out (200ms) and collapses (height animates to 0)
- On the map, the pin fades out
- The stop is hidden from all views for this person
- A brief toast appears at the bottom: "Hidden. Undo?" with a 5-second countdown. Tap "Undo" to restore.

### Persistence
Store dismissed stops in localStorage keyed by person + stop ID:
```javascript
localStorage.setItem('dismissed_helen', JSON.stringify(['discover_stop_1', 'discover_stop_4']))
```

Each person's dismissals are independent — Helen hiding a stop doesn't hide it from Aurelia's view.

### Effect on the app
- Dismissed stops don't appear in any view (list, map, or filters) for that person
- They don't count toward state totals ("12 stops in Virginia" becomes "10 stops in Virginia")
- The emergency stop button never suggests dismissed stops

### Recovery
In the Discover tab, add a small text link at the bottom of each state's section: "Show N hidden stops" (only appears if any are hidden). Tap to reveal all dismissed stops for that state, grayed out, with a "Restore" button on each.

### Why only Discover
Planned stops are commitments — the family agreed to them. Dismissing a planned stop is a conversation ("should we skip Millworks?"), not a swipe. Discover stops are suggestions — "not interested" is a natural response to a suggestion. Keeping this distinction clear prevents the app from becoming a to-do list where items disappear without discussion.

---

## THEME BEHAVIOR FOR ALL FEATURES

### "Next Up" card
- Jonathan: dark card with copper left border, Waze nav button
- Helen: white card with brass accent line above, Apple Maps button, Playfair heading
- Aurelia: white card with rose left border, Apple Maps + TikTok buttons, ✨ after stop name
- Rafa: dark card with red left border, UPPERCASE heading, Apple Maps button, larger font sizes

### FAB (emergency button)
- Jonathan: copper background, dark icon
- Helen: sage background, white icon
- Aurelia: deep rose background, white icon
- Rafa: red background, yellow ⚡ icon, slightly larger (64px)

### Visited checkmark
- Uses theme accent color when filled
- Border uses theme muted text color when empty

### Dismiss "✕"
- Uses theme muted text color
- Toast uses theme card background with theme text

---

## BUILD ORDER

1. Right Now: auto-detect today, set day filter
2. Right Now: "Next Up" card with nav button and skip
3. Swipe between days with slide animation
4. Mark as visited: checkbox, dimming, reordering, localStorage
5. Wire visited state into "Next Up" advancement
6. Emergency stop button: FAB + bottom sheet
7. Wire visited state into emergency button ("nearest unvisited")
8. Mark as "not interested": dismiss, toast/undo, localStorage
9. Recovery: "Show N hidden stops" link
10. Polish: progress indicators, animations, theme consistency

Push after steps 3, 6, 8, and 10.

---

## WHAT NOT TO BUILD

- No GPS tracking or live location
- No shared state across devices
- No push notifications or reminders
- No gamification (badges, streaks, points)
- No social features
- No automatic "mark as visited" based on time or location — always manual
