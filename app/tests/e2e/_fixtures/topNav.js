// Top-bar overflow (⋯) helper.
//
// Replay / Map / Book / Settings moved into a tap-to-open ⋯ menu so the trip
// top bar stays uncrowded + pressable on a phone (Modify-with-Claude and the
// ✦ Weave button stay visible). This opens the menu and clicks an item.

export async function openTopMenuItem(page, name) {
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name }).click()
}

// The menu item for a label, after opening the ⋯ menu — for presence/absence
// assertions (e.g. the Book item only exists once a trip has kept pages).
export async function openTopMenu(page) {
  await page.getByRole('button', { name: 'More' }).click()
}
