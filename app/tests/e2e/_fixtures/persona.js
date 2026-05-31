// Single source of truth for the test-persona parameter, shared by BOTH
// harnesses — the Playwright e2e suite AND the iOS Simulator gate. This is
// the keystone of Phase 2 build-list item 1: the additive knob that lets any
// surface be walked as any of the four travelers, which the cross-persona
// theme cells (and Aurelia/Rafa, zero coverage today) depend on.
//
// MECHANISM: the active persona is chosen by the RT_PERSONA env var. When it
// is unset (or not one of the four travelers), each call site keeps its own
// historical default, so existing specs and committed visual baselines are
// byte-for-byte unchanged. Defaults preserved when RT_PERSONA is unset:
//   - e2e  → 'jonathan'  (the withTrip.js localStorage seed)
//   - sim  → 'helen'     (the simulator specs' seed + ?person= URL)
//
// USAGE:
//   RT_PERSONA=aurelia npx playwright test photos-lazy-load   # e2e as Aurelia
//   RT_PERSONA=jonathan npm run test:simulator                # sim as Jonathan
//   for p in jonathan helen aurelia rafa; do RT_PERSONA=$p npm run test:e2e; done
//
// resolvePersona() is ALWAYS called in Node (fixture body / spec module
// scope), never inside a browser/addInitScript/execute callback — process.env
// does not exist in the page context. Node callers pass the resolved string
// into the page.

export const TRAVELERS = ['jonathan', 'helen', 'aurelia', 'rafa']

// Resolve the active test persona. `fallback` is the call site's historical
// default — pass 'jonathan' from the e2e fixture, 'helen' from the sim specs.
export function resolvePersona(fallback = 'jonathan') {
  const raw = (typeof process !== 'undefined' && process.env && process.env.RT_PERSONA) || ''
  const p = String(raw).trim().toLowerCase()
  return TRAVELERS.includes(p) ? p : fallback
}

// Convenience for the authoritative e2e URL channel: returns the `person=...`
// query fragment so Phase 3 walk specs can do
// `page.goto(\`/?${personaParam('helen')}&trip=...\`)` and have RT_PERSONA
// drive it while preserving the spec's pinned default when unset.
export function personaParam(fallback = 'jonathan') {
  return `person=${resolvePersona(fallback)}`
}
