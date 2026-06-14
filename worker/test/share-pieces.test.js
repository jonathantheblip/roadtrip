// Share-out E4 — an ordered heterogeneous "moment" (photos + voice + note slips)
// round-trips through the REAL worker (miniflare D1) and renders in the collage.
//
// NON-VACUOUS:
//  · the ordered pieces survive POST /memories → rowToMemory → /m/:token (order +
//    kind + note text + voice url), proving the photo_r2_keys_json kind-carrier
//    works WITHOUT a migration. Drop the rowToMemory `kind` branch and notes/voice
//    vanish (treated as photo refs with no url).
//  · a NOTE slip's text is HTML-escaped on the page (author input).
//  · a plain photo album still carries NO `pieces` (E4 is additive — back-compat).
//  · a composed moment turned secret stops resolving (410) — its note text never
//    leaks; and the in-app teaser stub strips pieces (the §6 masking guard).
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { maskMemoryForViewer } from '../src/surprises.js'

const TOKENS = { aurelia: 'tok-a', rafa: 'tok-r' }
function authEnv() {
  return { ...env, DB: env.DB, FAMILY_TOKEN_AURELIA: TOKENS.aurelia, FAMILY_TOKEN_RAFA: TOKENS.rafa }
}
async function call(path, { method = 'GET', token, body } = {}) {
  const req = new Request(`https://w.example${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}
async function seedTrip() {
  await env.DB.prepare('INSERT INTO trips (id, title, data_json, updated_at) VALUES (?, ?, ?, ?)').bind(
    't1', 'New England',
    JSON.stringify({ id: 't1', title: 'New England', dateRange: 'June 2026', days: [{ isoDate: '2026-06-03', stops: [{ id: 's1', name: 'Mystic Seaport' }] }] }),
    1000,
  ).run()
}
const NOTE = 'The captain let him ring the bell.'
async function saveMoment(over = {}) {
  return call('/memories', {
    method: 'POST', token: TOKENS.aurelia,
    body: {
      id: 'm-moment', tripId: 't1', stopId: 's1', authorTraveler: 'aurelia', visibility: 'shared', kind: 'photo',
      caption: 'A whole afternoon at the seaport',
      pieces: [
        { kind: 'photo', key: 'aurelia/m-moment/p1', mime: 'image/jpeg', capturedAt: '2026-06-03T14:00:00.000Z' },
        { kind: 'note', text: NOTE },
        { kind: 'voice', key: 'aurelia/m-moment/v1', mime: 'audio/mp4', durationSeconds: 12 },
      ],
      ...over,
    },
  })
}
const mint = (memoryId, token = TOKENS.aurelia) => call('/share', { method: 'POST', token, body: { memoryId } })

describe('share-out E4 — heterogeneous pieces round-trip + render', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM memories').run()
    await env.DB.prepare('DELETE FROM trips').run()
    await env.DB.prepare('DELETE FROM shares').run()
    await seedTrip()
  })

  it('ordered photo+note+voice survive the round-trip and reach the public view IN ORDER', async () => {
    await saveMoment()
    const { token } = await (await mint('m-moment')).json()
    const view = await (await call(`/m/${token}?format=json`)).json()

    expect(view.pieces).toHaveLength(3)
    expect(view.pieces.map((p) => p.kind)).toEqual(['photo', 'note', 'voice'])
    expect(view.pieces[0].url).toContain('/assets/aurelia/m-moment/p1')
    expect(view.pieces[1].text).toBe(NOTE)
    expect(view.pieces[2].url).toContain('/assets/aurelia/m-moment/v1')
    expect(view.pieces[2].durationSeconds).toBe(12)
    // photoRefs subset still derived (so in-app photo surfaces render the photo).
    expect(view.photos).toHaveLength(1)
    expect(view.photos[0].url).toContain('/assets/aurelia/m-moment/p1')
  })

  it('renders the note slip + voice tile + photo on the public page', async () => {
    await saveMoment()
    const { token } = await (await mint('m-moment')).json()
    const html = await (await call(`/m/${token}`)).text()
    expect(html).toContain(NOTE) // the note slip
    expect(html).toContain('wt-note') // the note-slip tile renderer
    expect(html).toContain('wt-voice') // the voice tile renderer
    expect(html).toContain('/assets/aurelia/m-moment/p1') // the photo
    // the voice tile is a real tap-to-play button carrying the r2 audio url
    expect(html).toContain('data-audio="')
    expect(html).toContain('/assets/aurelia/m-moment/v1')
  })

  it('XSS: a note slip is HTML-escaped on the page', async () => {
    await saveMoment({ id: 'm-xss', pieces: [{ kind: 'note', text: '<script>alert(1)</script>' }] })
    const { token } = await (await mint('m-xss')).json()
    const html = await (await call(`/m/${token}`)).text()
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('back-compat: a plain photo album carries NO pieces field (E4 is additive)', async () => {
    await call('/memories', {
      method: 'POST', token: TOKENS.aurelia,
      body: { id: 'm-album', tripId: 't1', stopId: 's1', authorTraveler: 'aurelia', visibility: 'shared', kind: 'photo', caption: 'just photos',
        photoRefs: [
          { storage: 'r2', key: 'aurelia/m-album/a', mime: 'image/jpeg' },
          { storage: 'r2', key: 'aurelia/m-album/b', mime: 'image/jpeg' },
        ] },
    })
    const { token } = await (await mint('m-album')).json()
    const raw = await (await call(`/m/${token}?format=json`)).text()
    expect(raw).not.toContain('"pieces"')
    const view = JSON.parse(raw)
    expect(view.photos).toHaveLength(2)
  })

  it('RE-CHECK: a composed moment turned secret stops resolving (410); the note never leaks', async () => {
    await saveMoment()
    const { token } = await (await mint('m-moment')).json()
    expect((await call(`/m/${token}`)).status).toBe(200)
    await env.DB.prepare(`UPDATE memories SET hide_from_json = '["rafa"]', conceal = 'teaser' WHERE id = 'm-moment'`).run()
    const page = await call(`/m/${token}`)
    expect(page.status).toBe(410)
    expect(await page.text()).not.toContain(NOTE)
  })

  it('CLOBBER GUARD: a photoRefs-only re-save does NOT erase stored voice/notes', async () => {
    await saveMoment() // photo + note + voice
    // A version-skew / photo-subset re-save of the SAME id with ONLY photoRefs.
    await call('/memories', {
      method: 'POST', token: TOKENS.aurelia,
      body: { id: 'm-moment', tripId: 't1', stopId: 's1', authorTraveler: 'aurelia', visibility: 'shared', kind: 'photo', caption: 'edited',
        photoRefs: [{ storage: 'r2', key: 'aurelia/m-moment/p1', mime: 'image/jpeg' }] },
    })
    const view = await (await call(`/m/${(await (await mint('m-moment')).json()).token}?format=json`)).json()
    // the note + voice survived the photo-only re-save (the COALESCE guard held).
    expect(view.pieces.map((p) => p.kind)).toEqual(['photo', 'note', 'voice'])
    expect(view.pieces[1].text).toBe(NOTE)
  })

  it('RESILIENCE: one malformed (keyless) piece is dropped, not the whole moment', async () => {
    await call('/memories', {
      method: 'POST', token: TOKENS.aurelia,
      body: { id: 'm-bad', tripId: 't1', stopId: 's1', authorTraveler: 'aurelia', visibility: 'shared', kind: 'photo', caption: 'mixed',
        pieces: [
          { kind: 'photo', key: 'aurelia/m-bad/p1', mime: 'image/jpeg' },
          { kind: 'voice', mime: 'audio/mp4' }, // NO key — malformed
          { kind: 'note', text: 'still here' },
        ] },
    })
    const view = await (await call(`/m/${(await (await mint('m-bad')).json()).token}?format=json`)).json()
    // before the fix, the keyless voice threw and nuked EVERYTHING; now just it is dropped.
    expect(view.pieces.some((p) => p.kind === 'photo')).toBe(true)
    expect(view.pieces.some((p) => p.kind === 'note' && p.text === 'still here')).toBe(true)
    expect(view.pieces.some((p) => p.kind === 'voice')).toBe(false)
    expect(view.photos).toHaveLength(1)
  })

  it('MASKING: the in-app teaser stub of a pieces moment carries no note text or pieces', () => {
    const moment = {
      id: 'm', tripId: 't1', authorTraveler: 'aurelia', visibility: 'shared',
      hideFrom: ['rafa'], conceal: 'teaser', surprise: { what: 'A moment', title: NOTE },
      pieces: [{ kind: 'note', text: NOTE }, { kind: 'photo', key: 'k', url: 'u' }],
      caption: NOTE,
    }
    const stub = maskMemoryForViewer(moment, 'rafa')
    expect(stub.masked).toBe(true)
    expect(stub.pieces).toBeUndefined()
    expect(JSON.stringify(stub)).not.toContain(NOTE)
  })
})
