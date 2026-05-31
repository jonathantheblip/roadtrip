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
})
