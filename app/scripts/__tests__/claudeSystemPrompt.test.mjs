// Unit tests for the Worker-side `buildClaudeSystemPrompt`. Imported
// out of the Cloudflare Worker bundle directly — the function is
// exported alongside the default fetch handler. It only reads from
// env.DB via .prepare(...).bind(...).all(), so we can fake the
// binding with a tiny stub instead of spinning miniflare.

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildClaudeSystemPrompt } from '../../../worker/src/index.js'

// Tiny D1 stub that lets each test set up canned responses keyed by
// the substring it expects in the SQL. The Worker code uses
// `env.DB.prepare(sql).bind(...).all()` — we replay the bind args back
// to the caller so a custom matcher can do per-id branching.
function makeDb(responder) {
  return {
    prepare(sql) {
      return {
        _sql: sql,
        bind(...args) {
          return {
            all: async () => responder({ sql, args }),
          }
        },
        all: async () => responder({ sql, args: [] }),
      }
    },
  }
}

function profilesRow() {
  return [
    {
      user_id: 'helen',
      display_name: 'Helen',
      age: 'Mom',
      role: 'archive',
      dietary: null,
      interests: 'Photography, museums.',
      tolerances: 'Prefers no plans past 9 PM with Rafa.',
      notes: 'Owns the archive.',
    },
    {
      user_id: 'jonathan',
      display_name: 'Jonathan',
      age: 'Dad',
      role: 'ops',
      dietary: null,
      interests: 'Driving, podcasts.',
      tolerances: 'Family driving limit ~2:30 per leg.',
      notes: null,
    },
    {
      user_id: 'aurelia',
      display_name: 'Aurelia',
      age: '13',
      role: 'her stuff',
      dietary: null,
      interests: 'Volleyball.',
      tolerances: null,
      notes: null,
    },
    {
      user_id: 'rafa',
      display_name: 'Rafa',
      age: '4',
      role: 'mission',
      dietary: null,
      interests: 'Monster trucks.',
      tolerances: 'No plans past 9 PM.',
      notes: null,
    },
  ]
}

function tripRow() {
  return [
    {
      id: 'volleyball-2026',
      title: 'Fun @ the Sun',
      date_range_start: '2026-05-22',
      date_range_end: '2026-05-25',
      end_city: 'Uncasville, CT',
      data_json: JSON.stringify({
        id: 'volleyball-2026',
        title: 'Fun @ the Sun',
        days: [
          {
            n: 1,
            date: 'Fri May 22',
            name: 'Pickups and the drive down',
            stops: [
              { id: 's1', time: '4:00 PM', kind: 'LOGISTICS', title: 'Aurelia pickup' },
              { id: 's2', time: 'Evening', kind: 'LODGING', title: 'Beach Bungalow' },
            ],
          },
          {
            n: 2,
            date: 'Sat May 23',
            name: 'Court 3 Mohegan',
            stops: [{ id: 's3', time: '9:00 AM', kind: 'TOURNEY', title: 'Pool play matches' }],
          },
        ],
      }),
    },
  ]
}

test('system prompt — reader identity loads from profiles', async () => {
  const db = makeDb(({ sql }) => {
    if (sql.includes('FROM family_profiles')) return { results: profilesRow() }
    if (sql.includes('FROM trips')) return { results: [] }
    return { results: [] }
  })
  const prompt = await buildClaudeSystemPrompt({ DB: db }, {
    readerUserId: 'helen',
    tripId: null,
  })
  assert.ok(prompt.includes('## Who is talking to you right now'))
  assert.ok(prompt.includes('Helen'))
  assert.ok(prompt.includes('archive'))
  // Reader-specific tolerance surfaced under the reader heading.
  assert.ok(prompt.includes('no plans past 9 PM with Rafa'))
})

test('system prompt — family section lists all four members', async () => {
  const db = makeDb(({ sql }) => {
    if (sql.includes('FROM family_profiles')) return { results: profilesRow() }
    return { results: [] }
  })
  const prompt = await buildClaudeSystemPrompt({ DB: db }, {
    readerUserId: 'jonathan',
    tripId: null,
  })
  assert.ok(prompt.includes('## The family'))
  for (const name of ['Jonathan', 'Helen', 'Aurelia', 'Rafa']) {
    assert.ok(prompt.includes(name), `expected family section to mention ${name}`)
  }
})

test('system prompt — trip context renders days and stops when trip_id is provided', async () => {
  const db = makeDb(({ sql }) => {
    if (sql.includes('FROM family_profiles')) return { results: profilesRow() }
    if (sql.includes('FROM trips')) return { results: tripRow() }
    return { results: [] }
  })
  const prompt = await buildClaudeSystemPrompt({ DB: db }, {
    readerUserId: 'helen',
    tripId: 'volleyball-2026',
  })
  assert.ok(prompt.includes('## The trip currently open in the app'))
  assert.ok(prompt.includes('Fun @ the Sun'))
  assert.ok(prompt.includes('2026-05-22'))
  assert.ok(prompt.includes('Day 1'))
  assert.ok(prompt.includes('Aurelia pickup'))
  assert.ok(prompt.includes('Pool play matches'))
})

test('system prompt — no trip provided falls back to "trips list" framing', async () => {
  const db = makeDb(({ sql }) => {
    if (sql.includes('FROM family_profiles')) return { results: profilesRow() }
    return { results: [] }
  })
  const prompt = await buildClaudeSystemPrompt({ DB: db }, {
    readerUserId: 'helen',
    tripId: null,
  })
  // No-trip framing should not also claim an open trip is loaded.
  assert.ok(!prompt.includes('## The trip currently open in the app'))
  // It should signal the trips-list context one way or another so
  // Sonnet doesn't speak as if a specific trip is open.
  assert.ok(
    prompt.includes('no specific trip is currently open') ||
      prompt.includes('No specific trip is currently open') ||
      prompt.toLowerCase().includes('on the trips list')
  )
})

test('system prompt — no trip + trips in DB injects cross-trip summaries', async () => {
  // Date-relative fixtures so the test stays green as the clock moves
  // — derive a "future" trip (+30 days) and a "past" trip (−30 days)
  // from today, then verify status flips from the date math.
  const todayIso = new Date().toISOString().slice(0, 10)
  function offsetIso(days) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const futureStart = offsetIso(30)
  const futureEnd = offsetIso(32)
  const pastStart = offsetIso(-30)
  const pastEnd = offsetIso(-27)

  const db = makeDb(({ sql }) => {
    if (sql.includes('FROM family_profiles')) return { results: profilesRow() }
    if (sql.includes('FROM trips')) {
      return {
        results: [
          {
            id: 'trip-future',
            title: 'Vermont — Juneteenth Weekend',
            date_range_start: futureStart,
            date_range_end: futureEnd,
            end_city: 'Burlington, VT',
            data_json: JSON.stringify({
              title: 'Vermont — Juneteenth Weekend',
              dateRangeStart: futureStart,
              dateRangeEnd: futureEnd,
              subtitle: 'Juneteenth and Father’s Day',
              days: [{ n: 1 }, { n: 2 }, { n: 3 }],
            }),
          },
          {
            id: 'trip-past',
            title: 'Fun @ the Sun',
            date_range_start: pastStart,
            date_range_end: pastEnd,
            end_city: 'New London, CT',
            data_json: JSON.stringify({
              title: 'Fun @ the Sun',
              dateRangeStart: pastStart,
              dateRangeEnd: pastEnd,
              days: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }],
            }),
          },
        ],
      }
    }
    if (sql.includes('FROM memories')) {
      return {
        results: [{ trip_id: 'trip-past', n: 19 }],
      }
    }
    return { results: [] }
  })
  const prompt = await buildClaudeSystemPrompt({ DB: db }, {
    readerUserId: 'helen',
    tripId: null,
  })
  // Trip ids and titles surface so Sonnet can answer cross-trip questions.
  assert.ok(prompt.includes('trip-future'))
  assert.ok(prompt.includes('Vermont — Juneteenth Weekend'))
  assert.ok(prompt.includes('trip-past'))
  assert.ok(prompt.includes('Fun @ the Sun'))
  // Memory count surfaces.
  assert.ok(prompt.includes('19 memories'))
  // Both date endpoints surface.
  assert.ok(prompt.includes(futureStart))
  assert.ok(prompt.includes(pastStart))
  // Status is derived from dates — the past trip is completed,
  // the future trip is planning, today is neither.
  assert.ok(prompt.includes('planning'))
  assert.ok(prompt.includes('completed'))
  // Should NOT emit the in-trip card section header — no trip is open.
  assert.ok(!prompt.includes('## The trip currently open in the app'))
  // Trip creation is enabled on the index: the create_trip section,
  // the card type, and the category vocabulary must all be present.
  assert.ok(prompt.includes('## Trip creation'))
  assert.ok(prompt.includes('create_trip'))
  assert.ok(prompt.includes('LODGING'))
  // The hybrid contract must be unambiguous: MUST emit a card on the
  // first turn, and never reply with only questions (FIX 1 — Claude
  // was asking three questions and never emitting a card).
  assert.ok(prompt.includes('MUST emit a create_trip card in your first response'))
  assert.ok(prompt.includes('Never respond to a trip-planning request with only questions and no card'))
  assert.ok(prompt.includes('ONE short clarifying question'))
  // Prose is capped so the card is the response, not an essay (the
  // verbose preamble also ate the token budget before the JSON).
  assert.ok(prompt.includes('Keep your prose to ONE or TWO sentences'))
  // Drive-vs-fly must be explicit + worked: the model drove a ~16h
  // Belmont→Asheville trip when the rule says >6h flies.
  assert.ok(prompt.includes('DRIVE VS FLY'))
  assert.ok(prompt.includes('6 hours or less = drive'))
  assert.ok(prompt.includes('Asheville'))
  // No invented family facts (the model called Helen a photographer).
  assert.ok(prompt.includes('Helen is not a photographer'))
})

test('system prompt — trip-creation section is absent when a trip IS open', async () => {
  const db = makeDb(({ sql }) => {
    if (sql.includes('FROM family_profiles')) return { results: profilesRow() }
    if (sql.includes('FROM trips')) {
      return {
        results: [
          {
            id: 'jackson-2026',
            title: 'The Jackson Family Drive',
            date_range_start: '2026-04-17',
            date_range_end: '2026-04-24',
            end_city: 'Houston, TX',
            data_json: JSON.stringify({ title: 'The Jackson Family Drive', days: [] }),
          },
        ],
      }
    }
    return { results: [] }
  })
  const prompt = await buildClaudeSystemPrompt({ DB: db }, {
    readerUserId: 'helen',
    tripId: 'jackson-2026',
  })
  // In-trip surface: the create_trip section belongs only to the index.
  assert.ok(prompt.includes('## The trip currently open in the app'))
  assert.ok(!prompt.includes('## Trip creation'))
})

test('system prompt — style block forbids gendered driving framing', async () => {
  const db = makeDb(({ sql }) => {
    if (sql.includes('FROM family_profiles')) return { results: profilesRow() }
    return { results: [] }
  })
  const prompt = await buildClaudeSystemPrompt({ DB: db }, {
    readerUserId: 'helen',
    tripId: null,
  })
  // The instruction itself must be present.
  assert.ok(prompt.includes('Both adults drive'))
  assert.ok(prompt.toLowerCase().includes('do not call jonathan "the driver"'))
})

test('system prompt — missing family_profiles table falls back to inline seed without throwing', async () => {
  const db = makeDb(({ sql }) => {
    if (sql.includes('FROM family_profiles')) {
      throw new Error('no such table: family_profiles')
    }
    return { results: [] }
  })
  const prompt = await buildClaudeSystemPrompt({ DB: db }, {
    readerUserId: 'helen',
    tripId: null,
  })
  // The fallback names every family member but with sparse fields.
  assert.ok(prompt.includes('Helen'))
  assert.ok(prompt.includes('Jonathan'))
  assert.ok(prompt.includes('Aurelia'))
  assert.ok(prompt.includes('Rafa'))
})

test('system prompt — never-invent-specifics rule is in the system message', async () => {
  const db = makeDb(({ sql }) => {
    if (sql.includes('FROM family_profiles')) return { results: profilesRow() }
    return { results: [] }
  })
  const prompt = await buildClaudeSystemPrompt({ DB: db }, {
    readerUserId: 'helen',
    tripId: null,
  })
  // The rule shifted to a tool-backed framing (call find_places rather than name
  // a venue from memory) — same intent, current wording (worker index.js ~4082).
  assert.ok(
    /Do NOT invent a venue, its hours, or its address/i.test(prompt),
    'the chat prompt must forbid inventing venue specifics'
  )
})
