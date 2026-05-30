// Worker test runtime — miniflare via @cloudflare/vitest-pool-workers.
//
// TEST_STRATEGY_SPEC Unit 1. miniflare is chosen over a lighter
// node:test + fetch-monkeypatch harness deliberately: it emulates the
// real Workers runtime with REAL D1 bindings, so worker-layer tests
// (Unit 2/4) and the D1 integration leg (Unit 6) assert against
// something close to production rather than mocks.
//
// Config API note: pool-workers 0.16.x (the vitest 4 line) replaced the
// old `defineWorkersConfig`/`defineWorkersProject` from
// `@cloudflare/vitest-pool-workers/config` with a `cloudflareTest()`
// Vitest plugin used inside a plain `defineConfig`. (The `/config`
// subpath no longer exists in this version.)
//
// All bindings, vars, the compatibility date, and the CompiledWasm
// module rule (for @cf-wasm/photon) are read straight from wrangler.toml
// via `wrangler.configPath`, so the test runtime stays byte-aligned with
// what deploys. The real D1 `database_id` in wrangler.toml is ignored
// under miniflare — D1 is emulated locally, so no production database is
// ever touched by tests.
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
    }),
  ],
})
