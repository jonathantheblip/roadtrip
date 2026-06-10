// Share-out (Slice 1) — minting a public link + resolving it, driven through the
// REAL worker against a REAL (miniflare) D1 binding.
//
// NON-VACUOUS (the "no vacuous green" rule): the security cases each prove a
// LEAK would happen without the guard —
//   · mint refuses an unrevealed surprise (409): without isShareable at mint, a
//     secret memory would get a public token.
//   · resolve RE-derives from the live row: a memory minted while public, then
//     turned into a secret (or deleted), returns 410 — the link goes dark. Drop
//     the resolve-time re-check and the secret leaks through the old token.
//   · the resolved view is an ALLOWLIST: a reaction / internal field present on
//     the row is NOT in the public JSON.
// The happy path is the working-path guard (G5): a plain shared memory resolves
// to its real photo + caption + place + author.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'

const TOKENS = { jonathan: 'tok-j', helen: 'tok-h', aurelia: 'tok-a', rafa: 'tok-r' }
function authEnv() {
  return {
    ...env,
    DB: env.DB,
    FAMILY_TOKEN_JONATHAN: TOKENS.jonathan,
    FAMILY_TOKEN_HELEN: TOKENS.helen,
    FAMILY_TOKEN_AURELIA: TOKENS.aurelia,
    FAMILY_TOKEN_RAFA: TOKENS.rafa,
  }
}

async function call(path, { method = 'GET', token, body, origin = 'http://localhost:5173' } = {}) {
  const headers = { Origin: origin }
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

const SECRET_CAPTION = 'A walk down Fifth Avenue — the floor piano'

async function seedTrip() {
  await env.DB.prepare(
    'INSERT INTO trips (id, title, data_json, updated_at) VALUES (?, ?, ?, ?)'
  ).bind(
    't1',
    'New England',
    JSON.stringify({
      id: 't1', title: 'New England', dateRange: 'June 2026',
      days: [{ isoDate: '2026-06-03', stops: [{ id: 's1', name: 'Mystic Seaport' }] }],
    }),
    1000,
  ).run()
}

// A plain, shareable photo memory (author Aurelia, shared).
async function savePhoto(over = {}) {
  return call('/memories', {
    method: 'POST', token: TOKENS.aurelia,
    body: {
      id: 'm-photo', tripId: 't1', stopId: 's1', authorTraveler: 'aurelia',
      visibility: 'shared', kind: 'photo', caption: 'Rafa met a real tall ship',
      photoRefs: [{ storage: 'r2', key: 'aurelia/m-photo/photo-abc', mime: 'image/jpeg', capturedAt: '2026-06-03T14:00:00.000Z' }],
      reactions: [{ traveler: 'helen', emoji: '❤️' }],
      ...over,
    },
  })
}

async function mint(memoryId, token = TOKENS.aurelia) {
  return call('/share', { method: 'POST', token, body: { memoryId } })
}

describe('share-out — mint + resolve, and the masking is enforced', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM memories').run()
    await env.DB.prepare('DELETE FROM trips').run()
    await env.DB.prepare('DELETE FROM shares').run()
    await seedTrip()
  })

  it('mints a link and resolves it to the safe public view (working path)', async () => {
    await savePhoto()
    const res = await mint('m-photo')
    expect(res.status).toBe(200)
    const { token, url } = await res.json()
    expect(token).toMatch(/^[0-9a-f]{16}/) // 64-bit random head
    expect(url).toContain(`/m/${token}`)

    // PUBLIC resolve — no bearer token. ?format=json returns the view-model.
    const page = await call(`/m/${token}?format=json`)
    expect(page.status).toBe(200)
    const view = await page.json()
    expect(view.caption).toBe('Rafa met a real tall ship')
    expect(view.photos).toHaveLength(1)
    expect(view.photos[0].url).toContain('/assets/aurelia/m-photo/photo-abc')
    expect(view.place).toBe('Mystic Seaport')
    expect(view.date).toBe('2026-06-03T14:00:00.000Z')
    expect(view.authorName).toBe('Aurelia')
    expect(view.tripName).toBe('New England')
  })

  it('ALLOWLIST: the public view never carries reactions or internal fields', async () => {
    await savePhoto()
    const { token } = await (await mint('m-photo')).json()
    const raw = await (await call(`/m/${token}?format=json`)).text()
    expect(raw).not.toContain('reactions')
    expect(raw).not.toContain('hideFrom')
    expect(raw).not.toContain('updatedAt')
  })

  it('renders an HTML page (default) with the real fields + an og:image', async () => {
    await savePhoto()
    const { token } = await (await mint('m-photo')).json()
    const res = await call(`/m/${token}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('Rafa met a real tall ship') // caption
    expect(html).toContain('from <b>Aurelia</b>') // attribution
    expect(html).toContain('Mystic Seaport') // place
    expect(html).toContain('Family Trips') // footer
    expect(html).toContain('og:image') // raw photo unfurl
    expect(html).toContain('/assets/aurelia/m-photo/photo-abc')
  })

  it('XSS: user text is HTML-escaped in the rendered page', async () => {
    await savePhoto({ id: 'm-xss', caption: '<script>alert(1)</script>' })
    const { token } = await (await mint('m-xss')).json()
    const html = await (await call(`/m/${token}`)).text()
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;') // escaped form is present
  })

  it('GATE: mint REFUSES an unrevealed surprise (no public token for a secret)', async () => {
    await savePhoto({ id: 'm-secret', hideFrom: ['rafa'], conceal: 'teaser', caption: SECRET_CAPTION, surprise: { what: 'A photo', title: SECRET_CAPTION } })
    const res = await mint('m-secret', TOKENS.aurelia)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('not-shareable')
  })

  it('RE-CHECK: a memory that BECOMES a secret after minting stops resolving (410)', async () => {
    await savePhoto()
    const { token } = await (await mint('m-photo')).json()
    // It resolves now…
    expect((await call(`/m/${token}`)).status).toBe(200)
    // …then the author hides it (turns it into a surprise on the live row).
    await env.DB.prepare(
      `UPDATE memories SET hide_from_json = '["rafa"]', conceal = 'teaser' WHERE id = 'm-photo'`
    ).run()
    const page = await call(`/m/${token}`)
    expect(page.status).toBe(410)
    expect(await page.text()).not.toContain('tall ship')
  })

  it('RE-CHECK: a deleted memory stops resolving (410)', async () => {
    await savePhoto()
    const { token } = await (await mint('m-photo')).json()
    await call('/memories/m-photo', { method: 'DELETE', token: TOKENS.aurelia })
    expect((await call(`/m/${token}`)).status).toBe(410)
  })

  it('a REVEALED surprise is shareable (mint + resolve both succeed)', async () => {
    await savePhoto({ id: 'm-rev', hideFrom: ['rafa'], conceal: 'teaser', revealed: '2026-06-15T00:00:00.000Z', surprise: { what: 'A photo', title: 'x' } })
    const res = await mint('m-rev')
    expect(res.status).toBe(200)
    const { token } = await res.json()
    expect((await call(`/m/${token}`)).status).toBe(200)
  })

  it('an unknown token 404s', async () => {
    expect((await call('/m/deadbeefdeadbeef-nope')).status).toBe(404)
  })

  it('AUTH: mint needs a bearer; the public page does NOT', async () => {
    await savePhoto()
    expect((await call('/share', { method: 'POST', body: { memoryId: 'm-photo' } })).status).toBe(401)
    const { token } = await (await mint('m-photo')).json()
    // No token on the resolve — still 200 (public).
    expect((await call(`/m/${token}`)).status).toBe(200)
  })
})
