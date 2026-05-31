// Security tier — CHECK 3, structural half. QA_COVERAGE_SYSTEM_SPEC.md §5.
//
// Guards the markdown render path: it must stay react-markdown@9 with NO
// raw-HTML escape hatch. The historically XSS-capable path — marked + DOMPurify
// + dangerouslySetInnerHTML, and `rehype-raw`/`rehype-sanitize`, which would
// un-escape model-supplied HTML inside react-markdown — must never come back.
//
// This guard lives in the SECURITY tier on purpose; per the carryover, the
// later dead-code/static-scan build item must NOT duplicate it.
//
// Picked up by `npm test` (app) = `node --test scripts/__tests__/*.test.mjs`.
//
// NON-VACUOUS: adding any banned lib (a package.json dep OR an app/src import)
// reds this — proven by planting `rehype-raw` in the commit that adds this file.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, extname } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url)) // app/scripts/__tests__
const APP = resolve(HERE, '../..') // app/
const SRC = resolve(APP, 'src')
const PKG = JSON.parse(readFileSync(resolve(APP, 'package.json'), 'utf8'))

// Libraries that re-introduce the raw-HTML / sanitize-then-inject XSS path.
const BANNED = ['marked', 'dompurify', 'rehype-raw', 'rehype-sanitize']

function allDeps(pkg) {
  return { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
}

function srcFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...srcFiles(full))
    else if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(extname(entry))) out.push(full)
  }
  return out
}

test('markdown path: react-markdown IS a dependency (the locked renderer)', () => {
  assert.ok(allDeps(PKG)['react-markdown'], 'react-markdown must be a dependency')
})

test('markdown path: no XSS-capable libs in package.json', () => {
  const deps = allDeps(PKG)
  for (const b of BANNED) {
    assert.ok(!deps[b], `${b} must NOT be a dependency — it re-opens the raw-HTML XSS path`)
  }
})

test('markdown path: no XSS-capable imports anywhere in app/src', () => {
  const importRe = new RegExp(
    `from\\s+['"](?:${BANNED.join('|')})['"]|require\\(\\s*['"](?:${BANNED.join('|')})['"]`
  )
  const offenders = srcFiles(SRC)
    .filter((f) => importRe.test(readFileSync(f, 'utf8')))
    .map((f) => f.replace(APP + '/', ''))
  assert.deepEqual(offenders, [], `XSS-capable import(s) found: ${offenders.join(', ')}`)
})

test('markdown path: react-markdown is actually imported in app/src', () => {
  const found = srcFiles(SRC).some((f) =>
    /from\s+['"]react-markdown['"]/.test(readFileSync(f, 'utf8'))
  )
  assert.ok(found, 'react-markdown must be imported in app/src (the locked render path must exist)')
})
