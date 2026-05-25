// Simulator-gate runner. Single entrypoint for
// `npm run test:simulator`:
//   1. Boot the dev server on 5181 (unless already up)
//   2. Wait for the port to listen
//   3. Run `node --test` against tests/simulator/*.test.mjs
//   4. Tear down the dev server on exit
//
// safaridriver lifecycle is handled per-test inside _driver.mjs;
// the simulator itself must already be booted (precondition
// printed when not).

import { spawn } from 'node:child_process'

const PORT = 5181
const URL = `http://localhost:${PORT}`

async function isUp() {
  try {
    const r = await fetch(URL, { signal: AbortSignal.timeout(500) })
    return r.ok || r.status === 304
  } catch {
    return false
  }
}

async function waitForUp(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isUp()) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

let vite = null

async function ensureDevServer() {
  if (await isUp()) {
    console.log(`[runner] dev server already up on :${PORT}`)
    return null
  }
  console.log(`[runner] starting dev server on :${PORT}…`)
  vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: false,
  })
  if (!(await waitForUp())) {
    console.error('[runner] dev server failed to start in 20s')
    process.exit(1)
  }
  console.log('[runner] dev server up')
  return vite
}

function cleanup() {
  if (vite) {
    try {
      vite.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })

await ensureDevServer()

// Hand off to node:test against the simulator specs.
// Node's --test expects glob patterns, not a bare directory.
// --test-concurrency=1 forces serial execution: each test owns the
// shared safaridriver instance via _driver.mjs's `pkill` reset, so
// parallel runs (the default) would race and kill each other.
const tests = spawn(
  'sh',
  ['-c', 'node --test --test-concurrency=1 tests/simulator/*.test.mjs'],
  { stdio: 'inherit' }
)
tests.on('exit', (code) => {
  cleanup()
  process.exit(code ?? 1)
})
