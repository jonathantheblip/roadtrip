// D5 audit-fix proofs (copy / honesty / friendly errors).
//
// The helpers under test live INSIDE .jsx view/component files (scope-locked —
// they can't be hoisted into lib/ here). plain `node --test` can't import JSX +
// react/lucide, so we esbuild-transform each real source file, externalizing
// every import, and dynamically import the resulting pure JS. That means we
// exercise the ACTUAL shipped helper bodies — not a copy — so these assertions
// are non-vacuous: edit the helper and the test moves with it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, writeFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../../src')

// Transform a real source file to a standalone ESM module with every bare/relative
// import externalized (we only call the pure exports), then import it.
async function loadExports(relPath) {
  const out = await build({
    entryPoints: [resolve(SRC, relPath)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    // Stub every non-entry import (react, lucide-react, ../data/*, ../lib/* …)
    // to an empty module so the bundle has ZERO unresolved bare imports — we
    // only ever call the module's own pure string/guard helpers, which don't
    // touch any of those imports at runtime.
    plugins: [
      {
        name: 'stub-all-imports',
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) => {
            if (args.kind === 'entry-point') return null
            return { path: args.path, namespace: 'stub' }
          })
          // CJS stub: esbuild's interop lets ANY named import (useState, X,
          // TRAVELERS, computeLeaveWhen, jsx, …) resolve to a property of the
          // Proxy, so there are no "no matching export" errors and nothing is
          // actually invoked by the pure helpers we test.
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: 'module.exports = new Proxy(function(){}, { get: () => function(){} });',
            loader: 'js',
          }))
        },
      },
    ],
  })
  const code = out.outputFiles[0].text
  const dir = mkdtempSync(resolve(tmpdir(), 'd5-'))
  const file = resolve(dir, 'mod.mjs')
  writeFileSync(file, code)
  return import(file)
}

test('activitiesSubtitle: no trip → generic copy, never "tournament"', async () => {
  const { activitiesSubtitle } = await loadExports('views/ActivitiesView.jsx')
  const generic = activitiesSubtitle(null)
  assert.equal(generic, 'Things nearby — filter by who needs what.')
  assert.doesNotMatch(generic, /tournament/i)
})

test('activitiesSubtitle: street-address home base stays generic (the volleyball trip)', async () => {
  const { activitiesSubtitle } = await loadExports('views/ActivitiesView.jsx')
  // Mirrors trips.js: a full street address must NOT become "Around 41 Lower Boulevard…".
  const line = activitiesSubtitle({ homeBase: { label: '41 Lower Boulevard, New London, CT' } })
  assert.equal(line, 'Things nearby — filter by who needs what.')
})

test('activitiesSubtitle: a real destination / clean city upgrades to "Around X"', async () => {
  const { activitiesSubtitle } = await loadExports('views/ActivitiesView.jsx')
  assert.equal(activitiesSubtitle({ destination: 'New York' }), 'Around New York — filter by who needs what.')
  // A clean single-token home-base label (no digits, no comma) is allowed.
  assert.equal(activitiesSubtitle({ homeBase: { label: 'Montreal' } }), 'Around Montreal — filter by who needs what.')
})

test('isAppInstalled: false in a non-browser (no window) context, never throws', async () => {
  const { isAppInstalled } = await loadExports('views/InstallIdentity.jsx')
  // node has no window/navigator.standalone — the guard must return false cleanly.
  assert.equal(isAppInstalled(), false)
})

test('friendlyLeaveWhenError: hides raw worker errors, maps by status', async () => {
  const { friendlyLeaveWhenError } = await loadExports('components/LeaveWhenModal.jsx')
  const raw = Object.assign(new Error('worker 500: {"error":"places upstream barf"}'), { status: 500 })
  const msg = friendlyLeaveWhenError(raw)
  assert.doesNotMatch(msg, /worker 500|barf|\{/) // no raw text / JSON / "500" leaking
  assert.match(msg, /re-check/i)
  assert.match(friendlyLeaveWhenError({ status: 429 }), /few seconds/i)
  assert.match(friendlyLeaveWhenError({ message: 'worker not configured' }), /available/i)
  // Unknown/network error still yields friendly copy, not undefined.
  assert.match(friendlyLeaveWhenError(new Error('Failed to fetch')), /connection/i)
})

test('friendlyNearbyError: hides raw worker errors, maps by status', async () => {
  const { friendlyNearbyError } = await loadExports('components/NearbyResultsModal.jsx')
  const raw = Object.assign(new Error('worker 503: upstream'), { status: 503 })
  const msg = friendlyNearbyError(raw)
  assert.doesNotMatch(msg, /worker 503|upstream/)
  assert.match(msg, /try again/i)
  assert.match(friendlyNearbyError({ status: 403 }), /try again in a moment/i)
  assert.match(friendlyNearbyError(new Error('NetworkError')), /connection/i)
})
