# Share-In: iCloud Shortcut for iPhone

The Web Share Target in the PWA manifest registers the app in Android
share sheets automatically. iOS Safari doesn't yet honor that field,
so we ship an iCloud Shortcut as a one-time install per family iPhone.
After it's installed, "Add Activity to Road Trip" appears in the Share
sheet of Maps, Safari, Messages, anywhere a URL is shareable.

## What it does

Takes a shared URL (Google or Apple Maps), opens the PWA at
`https://jonathantheblip.github.io/roadtrip/?url=<encoded>` in Safari,
and the SPA shell dispatches into the Share-In flow on mount.

## Build the Shortcut on an iPhone

The exact steps a family member follows on their own phone:

1. Open the **Shortcuts** app (built into iOS).
2. Tap **+** in the top-right to create a new shortcut.
3. Tap the shortcut name field at the top and rename to
   `Add Activity to Road Trip`.
4. Add the first action:
   - Tap **Add Action**.
   - Search **"URL Encode"** (under Scripting → Text).
   - The action should read: `URL Encode {Shortcut Input}`. If the
     `{Shortcut Input}` magic variable doesn't auto-attach, tap the
     placeholder and select **Shortcut Input** from the variables
     panel.
5. Add the second action:
   - Tap **+** below the first action.
   - Search **"URL"** (under Web → URLs).
   - Type:
     `https://jonathantheblip.github.io/roadtrip/?url=`
   - Then tap the end of the URL string and tap the variable chip from
     the URL Encode output. The full URL field should now read:
     `https://jonathantheblip.github.io/roadtrip/?url={URL Encoded Text}`.
6. Add the third action:
   - Tap **+**.
   - Search **"Open URLs"** (under Web → URLs).
   - The action should read `Open {URL}` automatically, pulling from
     the URL action above it.
7. Open the **Shortcut Settings** (the small `(i)` icon at the bottom
   of the editor, or the share icon → Show in Share Sheet).
   - Toggle **Show in Share Sheet** ON.
   - Under **Share Sheet Types**, leave the defaults (URLs + Text).
   - Tap **Done**.
8. Tap **Done** to save the shortcut.

## Test it

1. Open **Maps** on the same iPhone.
2. Search for a place (e.g. "Sift Bake Shop, Mystic CT").
3. Tap the place to open its details.
4. Tap **Share**.
5. Scroll down in the share sheet and tap **Add Activity to Road Trip**.
6. Safari opens with the PWA. The Import view should load with the
   place's name + coords pre-filled. The user picks a category, taps
   Save, and the activity lands on the trip's Things to do list within
   ~2 seconds.

## Distribute the Shortcut

iOS doesn't let you share a Shortcut as a "build instructions" link —
each phone has to install it. Two options:

- **Have each family member build it themselves.** The steps above
  take ~3 minutes. Helen and Aurelia can follow them from this doc.
- **Export an iCloud share link.** Once Jonathan has the Shortcut
  built and working on his phone:
  1. In the Shortcuts app, long-press the shortcut → **Share** →
     **iCloud Link**.
  2. iOS uploads it and returns a `www.icloud.com/shortcuts/<token>`
     URL.
  3. Text that link to Helen and Aurelia. Tapping it opens the
     Shortcuts app with **Add Shortcut** at the bottom. One tap
     installs.

The iCloud Link expires only when Jonathan deletes his copy of the
shortcut, so the link is durable across the family.

## Troubleshooting

- **"Add Activity to Road Trip" doesn't appear in the share sheet.**
  Open Shortcuts → tap the shortcut → tap `(i)` → confirm **Show in
  Share Sheet** is on.
- **Safari opens but the Import view shows "Could not read that
  link."** The PWA's URL parser couldn't make sense of the shared
  URL. Check what Maps actually shared — sometimes it's a `data:` URL
  or a deeplink, not an `https://` URL. Open the share sheet again
  and pick the URL share format rather than the Maps Place format
  if the option is there.
- **The Import view loads but the name and coordinates are empty.**
  The link was a `maps.app.goo.gl` short link that the Worker's
  `/resolve` endpoint couldn't follow. The user can paste the full
  long-form URL into the Link field at the top of the Import view
  and the form re-resolves. If this happens repeatedly,
  `wrangler tail` on the Worker will show the resolve failure.

## What the Shortcut does NOT do

- It does NOT save the activity silently. Every Share-In ends in the
  user-editable confirmation card; nothing lands on the trip until
  the user taps Save.
- It does NOT pass the shared image / preview / metadata — only the
  URL. Hero images and per-traveler descriptions come from the
  Worker `/draft` enrichment step on the receiving side, not from
  the Shortcut.
