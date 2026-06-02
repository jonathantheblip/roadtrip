// Shared axe-core a11y helper for the Playwright tier.
// QA_COVERAGE_SYSTEM_SPEC.md §4, build-list item 2.
//
// SEVERITY THRESHOLD: serious + critical only (axe impact levels are
// minor / moderate / serious / critical). Rationale: the first wiring should
// catch the high-signal WCAG failures the spec names — insufficient color
// contrast (serious), unlabeled controls / buttons without a discernible name
// (serious|critical), and keyboard/focus dead-ends — without drowning the run
// in minor/moderate best-practice noise (landmark/region hints, heading-order)
// that would make the tier easy to ignore on day one. Phase 3 can ratchet down
// to `moderate` once the serious/critical floor is clean across the matrix.
//
// This OVERLAPS the navigation axis by design: a focus-trap / keyboard
// dead-end is an exit bug — the same class as the missing-cancel finding.
//
// Usage:
//   import { expectNoSeriousA11y } from './_fixtures/axe.js'
//   await expectNoSeriousA11y(page, { label: 'trips index' })
//   await expectNoSeriousA11y(page, { include: '[role="dialog"]', label: 'claude panel' })
//
// Persona-aware: the CALLER drives the persona via the RT_PERSONA channel
// (resolvePersona → `?person=`), so the same scan runs on any traveler's theme
// — contrast is exactly where a wrong-persona theme could fail WCAG.

import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'

export const BLOCKING_IMPACTS = ['serious', 'critical']

// WCAG 2.0 + 2.1, levels A + AA — the conformance target. Excludes axe's
// "best-practice" rules (not WCAG-required) to keep the threshold meaningful.
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

export async function runAxe(page, { include } = {}) {
  // Settle entrance animations/transitions before scanning. The themed views
  // use a `.fade-up` opacity entrance; axe scanning mid-fade reads a blended
  // fg≈bg and reports transient color-contrast artifacts (ratio ~1.01) that
  // don't exist in the settled UI — a flaky gate. Collapsing animation/
  // transition durations + a short settle makes the scan read final-state
  // colors, so a contrast violation reported here is a REAL one.
  await page
    .addStyleTag({
      content:
        '*,*::before,*::after{animation-duration:0.001s!important;animation-delay:0s!important;transition-duration:0.001s!important;transition-delay:0s!important;}',
    })
    .catch(() => {})
  await page.waitForTimeout(200)
  let builder = new AxeBuilder({ page }).withTags(WCAG_AA_TAGS)
  if (include) builder = builder.include(include)
  return builder.analyze()
}

export function blockingViolations(results) {
  return results.violations.filter((v) => BLOCKING_IMPACTS.includes(v.impact))
}

// Human-readable one-liner per violation, for the failure message + CI log.
export function summarize(violations) {
  if (violations.length === 0) return '(none)'
  return violations
    .map(
      (v) =>
        `  • [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node(s))\n    ${v.helpUrl}`
    )
    .join('\n')
}

// Assert no serious/critical violations on the (optionally scoped) surface.
// `allow` is an escape hatch for KNOWN, recorded findings (rule ids) that are
// tracked elsewhere (e.g. KNOWN_BUGS) and deliberately not failing the gate yet
// — pass them so the tier stays green while the finding is documented, never to
// silently bury a fresh one.
// `only` SCOPES the gate to specific rule ids (e.g. ['color-contrast']) — use
// when a gate's purpose is one dimension (the C2 S2 trip-view gate is a CONTRAST
// gate; other serious/critical rules on S2, like a pre-existing unlabeled control,
// are separate findings tracked elsewhere, not this gate's job).
export async function expectNoSeriousA11y(page, { include, label = 'surface', allow = [], only = null } = {}) {
  const results = await runAxe(page, { include })
  let blocking = blockingViolations(results).filter((v) => !allow.includes(v.id))
  if (only) blocking = blocking.filter((v) => only.includes(v.id))
  expect(
    blocking,
    `axe found ${blocking.length} serious/critical a11y violation(s) on ${label}:\n${summarize(blocking)}`
  ).toEqual([])
  return results
}
