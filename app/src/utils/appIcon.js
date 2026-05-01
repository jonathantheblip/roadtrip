// App icon — single shared suitcase image for all travelers.
//
// We previously generated per-person SVGs with the traveler's initial
// rasterised through Canvas. The shared suitcase replaces that: same
// home-screen icon for everyone, same tab favicon. The per-person color
// theming inside the app continues to work via data-theme.
//
// Function signatures are preserved so useTheme can keep calling them
// without conditional logic.

const ICON_HREF = './icon-512.png'

export const PERSON_APP_TITLE = {
  jonathan: 'Road Trip',
  helen: 'Road Trip',
  aurelia: 'Road Trip',
  rafa: 'Road Trip',
}

export function appIconSvgDataUri() {
  return ICON_HREF
}

export function appIconPngDataUri() {
  return Promise.resolve(ICON_HREF)
}
