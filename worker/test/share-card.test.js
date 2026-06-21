// Share-out Card A — the 1200×630 link-preview image (GET /m/:token/card.png).
//
// The real render goes through Browser Rendering (headless Chromium), which the
// miniflare test runtime has no binding for — so these tests cover everything
// AROUND the screenshot: the pure HTML build, the masking re-check (a surprise
// yields NO card — same §6 contract as the page), and the GRACEFUL FALLBACK when
// Browser Rendering is unavailable (env.BROWSER undefined in tests): a photo
// memory 302-redirects to the raw photo, a text memory 404s — i.e. exactly the
// pre-card unfurl, never a broken one. The actual screenshot is deploy-validated.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { renderShareCard } from '../src/sharePage.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

const TOKENS = { jonathan: 'tok-j', helen: 'tok-h', aurelia: 'tok-a', rafa: 'tok-r' }
function authEnv() {
  const e = {
    ...env, DB: env.DB,
    FAMILY_TOKEN_JONATHAN: TOKENS.jonathan, FAMILY_TOKEN_HELEN: TOKENS.helen,
    FAMILY_TOKEN_AURELIA: TOKENS.aurelia, FAMILY_TOKEN_RAFA: TOKENS.rafa,
  }
  // The miniflare test runtime fulfils a [browser] binding by launching a REAL
  // local Chromium (which it can't download here). The real render is
  // deploy-validated; strip the binding so these tests exercise the graceful
  // fallback path (the `if (!env.BROWSER)` branch), not a 10s browser launch.
  delete e.BROWSER
  return e
}
async function call(path, { method = 'GET', token, body } = {}) {
  const headers = { Origin: 'http://localhost:5173' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const req = new Request('https://worker.test' + path, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
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
async function savePhoto(over = {}) {
  return call('/memories', {
    method: 'POST', token: TOKENS.aurelia,
    body: {
      id: 'm-photo', tripId: 't1', stopId: 's1', authorTraveler: 'aurelia',
      visibility: 'shared', kind: 'photo', caption: 'Rafa met a real tall ship',
      photoRefs: [{ storage: 'r2', key: 'aurelia/m-photo/photo-abc', mime: 'image/jpeg' }],
      ...over,
    },
  })
}
const mint = (memoryId, token = TOKENS.aurelia) => call('/share', { method: 'POST', token, body: { memoryId } })

describe('renderShareCard (pure HTML build)', () => {
  it('photo memory → split card: title, photo, author, place, wordmark', () => {
    const html = renderShareCard({
      kind: 'photo', caption: 'Rafa met a real tall ship', place: 'Mystic Seaport',
      authorName: 'Aurelia', tripName: 'New England',
      photos: [{ url: 'https://w.test/assets/aurelia/m-photo/photo-abc' }],
    })
    expect(html).toContain('card-photo')
    expect(html).toContain('Rafa met a real tall ship')
    expect(html).toContain('https://w.test/assets/aurelia/m-photo/photo-abc')
    expect(html).toContain('from <b>Aurelia</b>')
    expect(html).toContain('Mystic Seaport')
    expect(html).toContain('Family Trips')
    expect(html).toContain('1200px') // fixed card size
  })
  it('text memory → centered note card with the quote', () => {
    const html = renderShareCard({ kind: 'text', note: 'All four of us under one roof.', authorName: 'Helen', tripName: 'New England', photos: [] })
    expect(html).toContain('card-note')
    expect(html).toContain('All four of us under one roof.')
    expect(html).toContain('from <b>Helen</b>')
  })
  it('XSS: user text is HTML-escaped', () => {
    const html = renderShareCard({ kind: 'text', note: '<script>alert(1)</script>', authorName: 'Helen', photos: [] })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('GET /m/:token/card.png — masking + graceful fallback', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOKENS.aurelia, 'aurelia')
    await seedSession(env.DB, TOKENS.helen, 'helen')
    await env.DB.prepare('DELETE FROM memories').run()
    await env.DB.prepare('DELETE FROM trips').run()
    await env.DB.prepare('DELETE FROM shares').run()
    await seedTrip()
  })

  it('photo memory → 302 to the raw photo when Browser Rendering is unavailable', async () => {
    await savePhoto()
    const { token } = await (await mint('m-photo')).json()
    const res = await call(`/m/${token}/card.png`)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/assets/aurelia/m-photo/photo-abc')
  })

  it('text memory → 404 fallback (no photo to fall back to)', async () => {
    await call('/memories', {
      method: 'POST', token: TOKENS.helen,
      body: { id: 'm-text', tripId: 't1', stopId: 's1', authorTraveler: 'helen', visibility: 'shared', kind: 'text', text: 'a note' },
    })
    const { token } = await (await mint('m-text', TOKENS.helen)).json()
    expect((await call(`/m/${token}/card.png`)).status).toBe(404)
  })

  it('GATE: a memory that became a secret yields NO card (404, not a leak)', async () => {
    await savePhoto()
    const { token } = await (await mint('m-photo')).json()
    await env.DB.prepare(`UPDATE memories SET hide_from_json = '["rafa"]', conceal = 'teaser' WHERE id = 'm-photo'`).run()
    expect((await call(`/m/${token}/card.png`)).status).toBe(404)
  })

  it('an unknown / revoked token 404s', async () => {
    expect((await call('/m/deadbeefdeadbeef-nope/card.png')).status).toBe(404)
  })
})
