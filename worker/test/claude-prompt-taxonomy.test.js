// Worker-layer unit — the confirmation-card action taxonomy in the
// Claude system prompt. This guards the trip-settings card type: the
// model must be TOLD that trip-level edits (rename, destination, dates)
// emit a `trip-settings` card, NOT an `add`/`move` that would corrupt
// the trip with a junk stop. The client applier (applySettings) is the
// other half; this proves the worker actually instructs the model.
//
// We call the real exported buildClaudeSystemPrompt against the miniflare
// env (schema applied so loadFamilyProfiles / loadTripsSummary resolve)
// and assert the rendered prompt string. The taxonomy + rules text is
// emitted unconditionally, so a null tripId (trips-list surface) is enough.
import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'
import { buildClaudeSystemPrompt } from '../src/index.js'
import { applySchema } from './helpers/schema.js'

describe('claude system prompt — trip-settings taxonomy', () => {
  beforeAll(async () => {
    await applySchema(env.DB)
  })

  it('lists trip-settings in the action enum alongside the four stop actions', async () => {
    const prompt = await buildClaudeSystemPrompt(env, { readerUserId: 'helen', tripId: null })
    // The existing four are preserved, and trip-settings is appended.
    expect(prompt).toContain('"add" | "move" | "cancel" | "multi" | "trip-settings"')
  })

  it('instructs the model to route trip-level edits through trip-settings, not add/move', async () => {
    const prompt = await buildClaudeSystemPrompt(env, { readerUserId: 'helen', tripId: null })
    expect(prompt).toContain('## Trip settings (action "trip-settings")')
    expect(prompt).toContain('edits the TRIP RECORD itself')
    // It must steer trip-level edits away from add (the corruption path).
    expect(prompt).toMatch(/NEVER `add`\/`move`/)
  })

  it('teaches create_trip to stamp trip.shape, categorizing loose language (chill/lazy → stay)', async () => {
    const prompt = await buildClaudeSystemPrompt(env, { readerUserId: 'helen', tripId: null })
    expect(prompt).toContain('TRIP SHAPE')
    expect(prompt).toContain('`trip.shape`')
    // The two actionable categories + the safe fallback are spelled out.
    expect(prompt).toMatch(/"stay"/)
    expect(prompt).toMatch(/"route"/)
    expect(prompt).toMatch(/OMIT `shape`/)
    // Loose wording is explicitly in scope (the whole point of the fix).
    expect(prompt).toMatch(/chill/i)
    expect(prompt).toMatch(/lazy/i)
  })

  it('documents the exact editable trip-level field names the applier reads', async () => {
    const prompt = await buildClaudeSystemPrompt(env, { readerUserId: 'helen', tripId: null })
    for (const name of [
      '`title`',
      '`subtitle`',
      '`endCity`',
      '`startCity`',
      '`dateRangeStart`',
      '`dateRangeEnd`',
      '`locationLabel`',
    ]) {
      expect(prompt).toContain(name)
    }
    // The `destination` alias the applier accepts is mentioned.
    expect(prompt).toContain('destination')
  })

  // Regression guard for the "Helen's notes vanish on Save" bug: durable stop
  // commentary must be a `note` FIELD (which the applier writes to stop.note and
  // the detail view renders), distinct from the card-level `note`, which is a
  // transient confirm-time heads-up the apply path deliberately discards. Before
  // this, the model was only ever shown the card-level note and stranded
  // commentary there, so it never reached the stop.
  it('teaches the model that a durable stop note is a FIELD, distinct from the transient card-level note', async () => {
    const prompt = await buildClaudeSystemPrompt(env, { readerUserId: 'helen', tripId: null })
    // A concrete `note` field template exists in the fields example.
    expect(prompt).toContain('"name": "note"')
    // The card-level note is explicitly flagged as transient / not saved.
    expect(prompt).toMatch(/DISCARDED on Save/)
    // The model is told an "add a note" request lands in the field, not the card note.
    expect(prompt).toMatch(/note FIELD/)
  })
})
