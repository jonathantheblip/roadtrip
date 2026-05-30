// Unit 1 trivial test — the scaffold's proof of life.
//
// Hits the real Worker (its `main` entry) through the miniflare pool via
// the SELF service binding. This is the meaningful trivial assertion: a
// CORS preflight (OPTIONS) returns 204. To answer it, the pool must
// bundle and instantiate the entire Worker module — including the
// top-level `@cf-wasm/photon` WASM import that initializes synchronously
// on load. So a green here proves the miniflare runtime can load this
// Worker (wasm and all), without exercising D1, secrets, or the network.
import { SELF } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'

describe('worker smoke (miniflare scaffold)', () => {
  it('responds 204 to a CORS preflight OPTIONS', async () => {
    const res = await SELF.fetch('https://worker.test/', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS')
    // localhost origin is echoed back (corsHeaders trusts any localhost port)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
  })
})
