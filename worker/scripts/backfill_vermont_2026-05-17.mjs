// Change order 2026-05-17 §5 — backfill the upcoming Vermont trip.
//
// Goes through the canonical write path (Worker POST /trips, the same
// endpoint pushTrip uses) rather than a raw D1 UPDATE, so the change is
// consistent with app writes and lands in the request log — the spirit
// of §2's "from within the codebase, not the Dashboard, so it's in the
// audit trail."
//
// NON-DESTRUCTIVE. Three upserts keyed by existing ids; zero deletes.
// The two duplicates are only flagged draft:true so they (a) leave the
// themed views immediately and (b) appear in Settings → Drafts where
// Jonathan can delete the ones he doesn't want. Which to keep is his
// call (change order §1.5 / §2) — this script does not delete.
//
// Run from repo root:  node worker/scripts/backfill_vermont_2026-05-17.mjs

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// .env is gitignored and lives at the repo root. Depending on where
// this runs (main checkout vs a git worktree, which won't contain the
// ignored file), the root differs — walk up from both the script dir
// and the cwd until a .env is found.
function findEnv() {
  for (const base of [here, process.cwd()]) {
    let dir = base
    for (let i = 0; i < 6; i++) {
      const p = resolve(dir, '.env')
      if (existsSync(p)) return p
      const up = dirname(dir)
      if (up === dir) break
      dir = up
    }
  }
  return null
}

function loadEnv(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const envPath = findEnv()
if (!envPath) {
  console.error('Could not locate .env (looked from script dir and cwd up to repo root).')
  process.exit(1)
}
const env = loadEnv(envPath)
const WORKER = (env.VITE_WORKER_URL || '').replace(/\/+$/, '')
// Helen authored these records; use her token so the write is
// attributed to her in the audit trail.
const TOKEN = env.VITE_FAMILY_TOKEN_HELEN || env.VITE_FAMILY_TOKEN_JONATHAN
if (!WORKER || !TOKEN) {
  console.error('Missing VITE_WORKER_URL or family token in .env')
  process.exit(1)
}

// ── The surviving record (change order §1.5 recommended keep) ──────────
// Fields the change order marks `// TBD` are left empty on purpose —
// Helen completes them in the editor; the publish gate will flag them.
const SUMMARY =
  'Three nights in a Vermont cabin over Juneteenth weekend, drawn from a ' +
  'five-day allocation won at the Cambridge Preschool of the Arts (POTA) ' +
  'silent auction in February 2026. Hosts: Jessica and Yoav. Yoav: ' +
  '781-530-7888. Address and check-in details pending host confirmation.'

const survivor = {
  id: 'trip-mp2vndah',
  draft: true,
  status: 'planning',
  title: 'Vermont — Juneteenth Weekend',
  subtitle: 'Juneteenth and Father’s Day', // Helen's words, preserved
  epigraph: '',
  dateRange: 'Jun 19 – 21, 2026 (Fri–Sun)',
  dateRangeStart: '2026-06-19',
  dateRangeEnd: '2026-06-21',
  startCity: 'Belmont, MA',
  endCity: '', // TBD — cabin location pending host confirmation
  miles: 0,
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  overview: SUMMARY,
  sharedAlbumURL: '',
  coverPhotoUrl: '',
  lodging: {
    name: '',
    address: '',
    checkIn: '',
    checkOut: '',
    notes:
      'Hosts: Jessica and Yoav. Yoav: 781-530-7888. Address and check-in ' +
      'details pending host confirmation.',
    portalUrl: '',
  },
  days: [
    {
      n: 1,
      isoDate: '2026-06-19',
      date: 'Fri Jun 19',
      title: 'Drive up',
      drive: { from: 'Belmont, MA', to: '', hours: '', miles: 0 },
      lodging: '',
      stops: [], // TBD — depends on cabin location
    },
    {
      n: 2,
      isoDate: '2026-06-20',
      date: 'Sat Jun 20',
      title: '', // TBD
      drive: { from: '', to: '', hours: '', miles: 0 },
      lodging: '',
      stops: [], // TBD
    },
    {
      n: 3,
      isoDate: '2026-06-21',
      date: 'Sun Jun 21',
      title: 'Drive home',
      drive: { from: '', to: 'Belmont, MA', hours: '', miles: 0 },
      lodging: '',
      stops: [], // TBD
    },
  ],
}

// ── The two duplicates: preserve content, only flag draft ─────────────
// (Content captured from D1 on 2026-05-17. Not rewritten — Jonathan
// decides which to delete in Settings → Drafts.)
const dupeBase = {
  status: 'planning',
  title: 'Vermont Cabin',
  subtitle: 'Juneteenth and Fathers',
  epigraph: '',
  dateRange: 'TBD',
  dateRangeStart: null,
  dateRangeEnd: null,
  startCity: '',
  endCity: '',
  miles: 0,
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  overview: '',
  sharedAlbumURL: '',
  days: [],
}
const dupes = [
  { ...dupeBase, id: 'trip-mp2vhreu', draft: true },
  { ...dupeBase, id: 'trip-mp2vhrir', draft: true },
]

async function put(trip) {
  const r = await fetch(`${WORKER}/trips`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(trip),
  })
  const body = await r.text()
  return { id: trip.id, status: r.status, ok: r.ok, body }
}

const results = []
for (const t of [survivor, ...dupes]) {
  results.push(await put(t))
}
let failed = false
for (const res of results) {
  console.log(`${res.ok ? 'OK ' : 'ERR'}  ${res.id}  HTTP ${res.status}  ${res.body}`)
  if (!res.ok) failed = true
}
process.exit(failed ? 1 : 0)
