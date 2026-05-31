// No-secret-in-bundle scan — QA_COVERAGE_SYSTEM_SPEC.md §5, build-list item 6.
//
// HOME (design decision): this runs as the app's `postbuild` npm hook, so it
// fires on every `npm run build` — locally AND in CI (deploy-client.yml runs
// `npm run build`, which triggers `postbuild` automatically). A non-zero exit
// fails the build, which blocks the deploy. Chosen over an inline workflow step
// because it is fully committable (no GitHub web-UI edit), runs locally before
// a push can leak, and is version-controlled alongside its proof. The existing
// inline "built sync-disabled" guard in deploy-client.yml is left as-is.
//
// WHAT IT GUARDS: a backend secret (Google Places, Anthropic, OpenAI,
// Cloudflare, calendar-import token) reaching the client bundle in ../docs.
//
// TWO DETECTION LAYERS:
//   1. Prefix-anchored patterns (always on, env-independent) — catch the
//      distinctive key shapes even when the secret isn't in this machine's env
//      (the CI case: CI's client build env carries only VITE_* vars).
//   2. Exact-value scan from the local env / .env — catches the REAL secret
//      value regardless of shape (this is how Cloudflare-style tokens, which
//      have no distinctive prefix, are covered without a false-positive-prone
//      blind length match).
//
// ALLOW-SET (the whitelist, and why it must exist): VITE_* values are inlined
// into the bundle BY DESIGN (vite.config forwards VITE_-prefixed vars) —
// VITE_WORKER_URL and the four VITE_FAMILY_TOKEN_* (32-char, high-entropy:
// they LOOK like secrets). The exact-value scan WOULD flag them (present in
// both env and bundle), so VITE_* values are partitioned as ALLOW and never
// fail the scan. This whitelist is load-bearing — see the non-vacuous proof
// in the commit that adds this file.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, extname } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url)) // app/scripts
const DOCS = resolve(HERE, '../../docs') // repo-root/docs (vite build.outDir)
const ENV_FILES = [resolve(HERE, '../../.env'), resolve(HERE, '../.env')] // root + app

// Prefix-anchored deny patterns. Distinctive enough not to collide with the
// public 32-char VITE_FAMILY_TOKEN_* values (which carry no AIza/sk- prefix).
const DENY_PATTERNS = [
  { name: 'Google API key (AIza…)', re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'Anthropic key (sk-ant-…)', re: /sk-ant-[0-9A-Za-z_-]{20,}/g },
  { name: 'OpenAI key (sk-…)', re: /sk-(proj-)?[A-Za-z0-9]{24,}/g },
]

// Backend secret env-var names whose exact values must never appear in docs/.
const BACKEND_SECRET_VARS = [
  'GOOGLE_PLACES_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_TOKEN',
  'CALENDAR_IMPORT_TOKEN',
]

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.txt', '.map', '.svg', '.webmanifest', ''])

function parseEnvFile(path) {
  const out = {}
  if (!existsSync(path)) return out
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (key && val) out[key] = val
  }
  return out
}

// Merge .env files + process.env (CI passes secrets via env, not files).
function collectEnv() {
  const merged = {}
  for (const f of ENV_FILES) Object.assign(merged, parseEnvFile(f))
  Object.assign(merged, process.env)
  return merged
}

function listTextFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) files.push(...listTextFiles(full))
    else if (TEXT_EXT.has(extname(entry).toLowerCase())) files.push(full)
  }
  return files
}

function redact(s) {
  if (!s) return '(empty)'
  if (s.length <= 8) return s[0] + '…'
  return s.slice(0, 4) + '…' + s.slice(-2) + ` (len ${s.length})`
}

function main() {
  if (!existsSync(DOCS)) {
    console.error(`[check-no-secrets] build output not found at ${DOCS} — run the build first.`)
    process.exit(2)
  }
  const env = collectEnv()
  // ALLOW: every VITE_* value is client-public by design.
  const allowValues = new Set(
    Object.entries(env)
      .filter(([k, v]) => k.startsWith('VITE_') && v)
      .map(([, v]) => v)
  )
  // DENY (exact): backend secret values present in this env.
  const denyValues = BACKEND_SECRET_VARS
    .filter((k) => env[k])
    .map((k) => ({ name: k, value: env[k] }))
    .filter(({ value }) => !allowValues.has(value)) // never deny a public value

  const files = listTextFiles(DOCS)
  const violations = []
  const allowedSeen = new Set()

  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    // Layer 1 — prefix patterns.
    for (const { name, re } of DENY_PATTERNS) {
      for (const m of content.matchAll(re)) {
        const hit = m[0]
        if (allowValues.has(hit)) {
          allowedSeen.add(hit)
          continue // whitelisted public value
        }
        violations.push({ file, name, sample: redact(hit) })
      }
    }
    // Layer 2 — exact backend secret values.
    for (const { name, value } of denyValues) {
      if (content.includes(value)) {
        violations.push({ file, name: `${name} (exact value)`, sample: redact(value) })
      }
    }
    // Whitelist observability: record which public values are present so the
    // allow-path is visibly exercised (and the non-vacuous proof is legible).
    for (const v of allowValues) {
      if (v.length >= 12 && content.includes(v)) allowedSeen.add(v)
    }
  }

  const rel = (f) => f.replace(DOCS + '/', 'docs/')
  if (allowedSeen.size > 0) {
    console.log(
      `[check-no-secrets] ${allowedSeen.size} client-public VITE_* value(s) present in bundle and ALLOWED (whitelist active): ` +
        [...allowedSeen].map(redact).join(', ')
    )
  }
  if (violations.length > 0) {
    console.error(`\n[check-no-secrets] FAIL — ${violations.length} possible secret(s) in the built bundle:`)
    for (const v of violations) console.error(`  • ${v.name} in ${rel(v.file)} → ${v.sample}`)
    console.error('\nBackend secrets must never ship in docs/. Remove the leak; VITE_* values are the only client-public constants.')
    process.exit(1)
  }
  console.log(`[check-no-secrets] OK — scanned ${files.length} bundle file(s); no backend secrets found.`)
}

main()
