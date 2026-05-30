#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// ONE-TIME live capture of canonical, MODEL-AUTHORED Claude responses
// for the Unit 3 browser-layer record/replay harness.
// (TEST_STRATEGY_SPEC.md §3 — Unit 3.)
//
// This is NOT part of the test suite and is never run by `npm test`. It
// hits the LIVE Anthropic model once. The replay tests
// (app/tests/e2e/claude-card-replay.spec.js) consume the saved fixtures
// with NO key and NO network.
//
// FIDELITY — why this matches production reality:
//   • System prompt: built by the REAL worker function
//     `buildClaudeSystemPrompt` (imported from ../src/index.js), with the
//     SAME family profiles (migration 006 seed) and the SAME open trip
//     (app/tests/e2e/_fixtures/withTrip.js FIXTURE_TRIP) the client renders
//     against in Phase B — so the stopIds the model emits (vb2-3, vb3-4,
//     vb1-3) resolve against the seeded trip.
//   • Request shape: identical to `postClaudeChat` — model = chatModel(env)
//     (claude-sonnet-4-6 default), max_tokens = 8192, stream: true,
//     system + messages: [{ role:'user', content: message }].
//   • Translation: the native Anthropic SSE is folded into the client-facing
//     3-type dialect (text_delta / done) EXACTLY as the worker's
//     /claude/chat handler does, so the saved .sse bytes are byte-faithful
//     to what the browser receives in production.
//
// OPSEC — the Anthropic key is read from the macOS Keychain into a local
// variable for THIS PROCESS ONLY. It is never logged, echoed, or written to
// disk. Same pattern as the Cloudflare token handling.
//
// Usage:  cd worker && node scripts/capture-card-fixtures.mjs
// Re-run only to refresh fixtures (model or prompt change). Fixtures are
// committed; capturing again should be a deliberate act.
// ─────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  buildClaudeSystemPrompt,
  chatModel,
  anthropicMessagesUrl,
} from '../src/index.js'
// Single source of truth for the trip context — the SAME fixture the Phase B
// replay tests seed into the client cache. Importing it (rather than copying)
// guarantees the capture's trip and the test's trip can never drift apart.
import { FIXTURE_TRIP } from '../../app/tests/e2e/_fixtures/withTrip.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(
  __dirname,
  '..',
  '..',
  'app',
  'tests',
  'e2e',
  '_fixtures',
  'claude-cards'
)

// Mirrors the worker constant CLAUDE_CHAT_MAX_TOKENS (worker/src/index.js).
// Not exported there; kept in sync here by hand (8192 = the 8K ceiling).
const MAX_TOKENS = 8192

// The reader. Helen is the user (DEV_ENVIRONMENT.md); the card specs drive
// the app as ?person=helen. Her profile shapes the "## Who is talking to
// you right now" block.
const READER = 'helen'

// ── Family profiles: the EXACT migration 006 seed (worker/migrations/
// 006_claude_conversations.sql). loadFamilyProfiles() reads these columns. ──
const FAMILY_PROFILES = [
  {
    user_id: 'jonathan',
    display_name: 'Jonathan',
    age: 'Dad',
    role: 'ops',
    dietary: null,
    interests: 'Driving logistics, podcasts, dad-paced city exploring.',
    tolerances: 'Family driving limit ~2:30 per leg; both adults share driving.',
    notes: 'Plans the operational layer (drives, parking, fuel, timing).',
  },
  {
    user_id: 'helen',
    display_name: 'Helen',
    age: 'Mom',
    role: 'archive',
    dietary: null,
    interests: 'Photography, food/restaurants, museums, family memory-keeping.',
    tolerances: 'Prefers no plans past 9 PM with Rafa.',
    notes: 'Owns the archive; writes most of the trip narrative.',
  },
  {
    user_id: 'aurelia',
    display_name: 'Aurelia',
    age: '13',
    role: 'her stuff',
    dietary: null,
    interests: 'Photography, teen-photogenic content, food, volleyball.',
    tolerances: null,
    notes:
      'Plays competitive volleyball; tournament weekends are non-negotiable anchors.',
  },
  {
    user_id: 'rafa',
    display_name: 'Rafa',
    age: '4',
    role: 'mission',
    dietary: null,
    interests: 'Monster trucks, hands-on exhibits, levers and buttons.',
    tolerances: 'No plans past 9 PM; needs snack + bathroom cadence.',
    notes: 'Five years old this spring; the day rhythm bends around him.',
  },
]

// The trips-table row loadTrip() expects: top-level columns + data_json blob.
const TRIP_ROW = {
  id: FIXTURE_TRIP.id,
  title: FIXTURE_TRIP.title,
  date_range_start: FIXTURE_TRIP.dateRangeStart,
  date_range_end: FIXTURE_TRIP.dateRangeEnd,
  end_city: FIXTURE_TRIP.endCity,
  data_json: JSON.stringify(FIXTURE_TRIP),
}

// A minimal D1 shim satisfying the .prepare(sql).bind(...).all()/.first()
// surface that loadFamilyProfiles() and loadTrip() use. The prompt-building
// LOGIC is the real worker code; only the data source is local. With a trip
// open, loadTripsSummary() is never reached.
function makeDbShim() {
  const resultFor = (sql) => {
    if (/family_profiles/.test(sql)) return { results: FAMILY_PROFILES }
    if (/FROM\s+trips/i.test(sql)) return { results: [TRIP_ROW] }
    return { results: [] }
  }
  const stmt = (sql) => ({
    bind: () => stmt(sql),
    all: async () => resultFor(sql),
    first: async () => resultFor(sql).results[0] || null,
  })
  return { prepare: (sql) => stmt(sql) }
}

// ── The canonical request set (TEST_STRATEGY_SPEC §3 Unit 3). Phrasings are
// adapted to FIXTURE_TRIP's actual stops so the targets are unambiguous:
//   vb2-3 = Sat (Day 2) match, 3:45 PM, Court 1 Mohegan Sun
//   vb3-4 = Sun (Day 3) match, 4:00 PM, Court 3 Mohegan Sun
//   vb1-3 = Fri (Day 1) Beach Bungalow lodging
const REQUESTS = [
  {
    name: 'single-move',
    kind: 'single move',
    message: "Move Aurelia's Saturday match to 11 AM on court 3.",
  },
  {
    name: 'single-cancel',
    kind: 'single cancel',
    message: "Cancel Sunday's match.",
  },
  {
    name: 'single-add',
    kind: 'single add',
    message: 'Add a 7 PM dinner on Saturday.',
  },
  {
    name: 'multi-change',
    kind: 'multi-change',
    message:
      "Move Saturday's match to 11 AM, cancel Sunday's match, and add a 7 PM dinner on Saturday.",
  },
  {
    name: 'guidance',
    kind: 'guidance (non-card)',
    message: 'What do you think we should do Saturday morning before Aurelia’s match?',
  },
]

// Read the Anthropic key from the macOS Keychain. execFileSync (argv form, no
// shell) keeps the key off any command line. Returned value lives only here.
function readAnthropicKey() {
  const key = execFileSync(
    'security',
    ['find-generic-password', '-s', 'anthropic-roadtrip', '-a', 'jonathantheblip', '-w'],
    { encoding: 'utf8' }
  ).trim()
  if (!key) throw new Error('Anthropic key not found in Keychain (anthropic-roadtrip)')
  return key
}

// Fold native Anthropic SSE → the client-facing 3-type dialect, mirroring the
// worker IIFE in postClaudeChat. Returns { frames, assembled, usage, stopReason }.
// `frames` are the verbatim `data: {...}\n\n` strings the browser receives.
async function translateStream(resp) {
  const frames = []
  let assembled = ''
  const usage = { input_tokens: null, output_tokens: null }
  let stopReason = null

  const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const dataStr = line.slice(5).trim()
      if (!dataStr) continue
      let event
      try {
        event = JSON.parse(dataStr)
      } catch {
        continue
      }
      if (
        event.type === 'content_block_delta' &&
        event.delta?.type === 'text_delta' &&
        typeof event.delta.text === 'string'
      ) {
        assembled += event.delta.text
        frames.push(
          `data: ${JSON.stringify({ type: 'text_delta', text: event.delta.text })}\n\n`
        )
      } else if (event.type === 'message_delta') {
        if (event.usage && typeof event.usage.output_tokens === 'number') {
          usage.output_tokens = event.usage.output_tokens
        }
        if (event.usage && typeof event.usage.input_tokens === 'number') {
          usage.input_tokens = event.usage.input_tokens
        }
        // Captured for the report only — the worker does NOT surface
        // stop_reason today (that gap is Unit 4's to close), so it does
        // NOT go into the client `done` frame here. Staying faithful to
        // current production output.
        if (event.delta && typeof event.delta.stop_reason === 'string') {
          stopReason = event.delta.stop_reason
        }
      } else if (event.type === 'message_start' && event.message?.usage) {
        if (typeof event.message.usage.input_tokens === 'number') {
          usage.input_tokens = event.message.usage.input_tokens
        }
      }
    }
  }
  // Terminal done frame — exactly the worker's shape.
  frames.push(`data: ${JSON.stringify({ type: 'done', usage })}\n\n`)
  return { frames, assembled, usage, stopReason }
}

// Count fenced ```card blocks and the action of each — the capture-time
// self-check that answers Unit 3's question (one card vs many).
function inspectCards(assembled) {
  const blocks = []
  const re = /```card\s*\n([\s\S]*?)```/g
  let m
  while ((m = re.exec(assembled)) !== null) {
    const raw = m[1].trim()
    let action = '(unparseable)'
    try {
      const parsed = JSON.parse(raw)
      action = parsed.type === 'create_trip' ? 'create_trip' : parsed.action || '(no action)'
    } catch {
      /* leave as unparseable */
    }
    blocks.push(action)
  }
  return blocks
}

async function main() {
  const KEY = readAnthropicKey()
  const env = { DB: makeDbShim(), ANTHROPIC_API_KEY: KEY }
  // CLAUDE_CHAT_MODEL unset → chatModel() === 'claude-sonnet-4-6'.
  // ANTHROPIC_BASE_URL unset → anthropicMessagesUrl() === live api.anthropic.com.
  const model = chatModel(env)
  const url = anthropicMessagesUrl(env)

  const systemPrompt = await buildClaudeSystemPrompt(env, {
    readerUserId: READER,
    tripId: FIXTURE_TRIP.id,
  })

  // Dry run: validate plumbing (Keychain read, real prompt build, trip
  // context) WITHOUT calling the live model or writing fixtures.
  if (process.argv.includes('--dry')) {
    const markers = {
      'one-card-per-turn rule': systemPrompt.includes('One card per turn'),
      'card fence shape': systemPrompt.includes('```card'),
      'trip open header': systemPrompt.includes('The trip currently open'),
      'stop vb2-3 with id': systemPrompt.includes('[vb2-3]'),
      'stop vb3-4 with id': systemPrompt.includes('[vb3-4]'),
      'reader Helen': systemPrompt.includes('Name: Helen'),
    }
    console.log(`[dry] key length: ${KEY.length} (not printed)`)
    console.log(`[dry] model: ${model}`)
    console.log(`[dry] anthropic url: ${url}`)
    console.log(`[dry] system prompt: ${systemPrompt.length} chars`)
    for (const [k, v] of Object.entries(markers)) {
      console.log(`[dry] ${v ? '✓' : '✗ MISSING'} ${k}`)
    }
    const ok = Object.values(markers).every(Boolean)
    console.log(`[dry] ${ok ? 'ALL MARKERS PRESENT — safe to capture' : 'MARKERS MISSING — do not capture'}`)
    process.exit(ok ? 0 : 1)
  }

  mkdirSync(FIXTURE_DIR, { recursive: true })
  const capturedAt = new Date().toISOString()
  const manifest = []

  console.log(`Capturing ${REQUESTS.length} canonical responses`)
  console.log(`  model: ${model}`)
  console.log(`  reader: ${READER} · trip: ${FIXTURE_TRIP.id}`)
  console.log(`  system prompt: ${systemPrompt.length} chars`)
  console.log('')

  for (const req of REQUESTS) {
    process.stdout.write(`• ${req.name} … `)
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: req.message }],
      }),
    })
    if (!resp.ok || !resp.body) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`Anthropic ${resp.status} for ${req.name}: ${errText.slice(0, 300)}`)
    }

    const { frames, assembled, usage, stopReason } = await translateStream(resp)
    const sse = frames.join('')
    const cardActions = inspectCards(assembled)

    writeFileSync(join(FIXTURE_DIR, `${req.name}.sse`), sse, 'utf8')

    manifest.push({
      name: req.name,
      kind: req.kind,
      file: `${req.name}.sse`,
      requestMessage: req.message,
      model,
      reader: READER,
      tripId: FIXTURE_TRIP.id,
      capturedAt,
      stopReason,
      usage,
      assembledChars: assembled.length,
      cardBlockCount: cardActions.length,
      cardActions,
    })

    const flag = stopReason && stopReason !== 'end_turn' ? ` ⚠ stop_reason=${stopReason}` : ''
    console.log(`${cardActions.length} card(s) [${cardActions.join(', ') || 'none'}]${flag}`)
  }

  writeFileSync(
    join(FIXTURE_DIR, 'manifest.json'),
    JSON.stringify(
      {
        note:
          'Canonical, MODEL-AUTHORED Claude responses captured ONCE against the live model '
          + 'via scripts/capture-card-fixtures.mjs (worker). Replayed by '
          + 'app/tests/e2e/claude-card-replay.spec.js with no key and no network. '
          + 'Card shape here is decided by the model, not a mock.',
        model,
        reader: READER,
        tripId: FIXTURE_TRIP.id,
        maxTokens: MAX_TOKENS,
        capturedAt,
        systemPromptChars: systemPrompt.length,
        fixtures: manifest,
      },
      null,
      2
    ) + '\n',
    'utf8'
  )

  console.log('')
  console.log(`Wrote ${manifest.length} fixtures + manifest.json to`)
  console.log(`  ${FIXTURE_DIR}`)
}

main().catch((e) => {
  // Never let a key reach stderr — only the message.
  console.error('Capture failed:', e?.message || String(e))
  process.exit(1)
})
