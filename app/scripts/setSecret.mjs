#!/usr/bin/env node
// Secure secret bootstrap for app/.env.
//
// Usage (from inside app/):
//   npm run set-secret GOOGLE_PLACES_API_KEY
// Or directly:
//   node app/scripts/setSecret.mjs GOOGLE_PLACES_API_KEY
//
// Reads the secret value from the terminal with input masked (no echo,
// no chars in scrollback). Persists to app/.env at mode 0600. Replaces
// the line if the key already exists, otherwise appends.
//
// Design notes:
// - TTY raw mode + manual char handling so nothing about the value
//   reaches stdout or the shell history.
// - Confirmation prints only the key name and a character count —
//   never the value, never a partial value, never a hash.
// - Refuses to read a secret from a non-TTY stdin (e.g. a pipe) because
//   the caller can't have confirmed it's safe to leak a value into the
//   pipe's source. If the user really needs scripted seeding, they can
//   edit app/.env by hand.

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(__dirname, '..')
const ENV_PATH = join(APP_ROOT, '.env')

// --- input ---------------------------------------------------------
function readMaskedLine(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('stdin is not a TTY — refusing to read a secret without echo control'))
      return
    }

    process.stdout.write(prompt)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    let buf = ''

    const cleanup = () => {
      process.stdin.removeListener('data', onData)
      process.stdin.setRawMode(false)
      process.stdin.pause()
    }

    const onData = (chunk) => {
      // chunk may contain multiple bytes (e.g. paste).
      for (const ch of chunk) {
        // Ctrl-C → cancel
        if (ch === '') {
          cleanup()
          process.stdout.write('\n')
          reject(new Error('cancelled'))
          return
        }
        // Enter (CR or LF) → submit
        if (ch === '\r' || ch === '\n') {
          cleanup()
          process.stdout.write('\n')
          resolve(buf)
          return
        }
        // Backspace (DEL 0x7f or BS 0x08) → trim last
        if (ch === '' || ch === '\b') {
          if (buf.length > 0) buf = buf.slice(0, -1)
          continue
        }
        // Ctrl-U → clear line
        if (ch === '') {
          buf = ''
          continue
        }
        // Skip any other control character (ESC sequences, arrow keys, etc.)
        if (ch < ' ') continue
        buf += ch
      }
    }

    process.stdin.on('data', onData)
  })
}

// --- env file mutation --------------------------------------------
// Replace `KEY=...` line if present, otherwise append. Preserves all
// other lines (comments, other secrets) verbatim. Quotes the value if
// it contains characters that the dotenv parsers we care about treat
// specially (whitespace, #, =, $).
export function quoteIfNeeded(value) {
  if (/^[A-Za-z0-9_\-./]+$/.test(value)) return value
  // Escape backslashes and double quotes, wrap in double quotes.
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}"`
}

export function upsertEnvKey(envContent, key, value) {
  const literal = quoteIfNeeded(value)
  const newLine = `${key}=${literal}`
  const keyRe = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=`)
  const lines = envContent.split('\n')
  let replaced = false
  const next = lines.map((line) => {
    if (keyRe.test(line)) {
      replaced = true
      return newLine
    }
    return line
  })
  if (!replaced) {
    // Append. Ensure the file ends with a newline before adding.
    if (next.length === 0 || next[next.length - 1] !== '') next.push('')
    next.splice(next.length - 1, 0, newLine)
  }
  return next.join('\n')
}

// --- main ---------------------------------------------------------
async function main() {
  const key = process.argv[2]
  if (!key) {
    console.error('Usage: node app/scripts/setSecret.mjs <KEY_NAME>')
    console.error('       npm run set-secret <KEY_NAME>      (from inside app/)')
    process.exit(2)
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
    console.error(`Refusing key "${key}" — use SCREAMING_SNAKE_CASE.`)
    process.exit(2)
  }

  let value
  try {
    value = await readMaskedLine(`Enter ${key} (input hidden): `)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
  value = value.trim()
  if (!value) {
    console.error('Empty value — nothing saved.')
    process.exit(1)
  }

  const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : ''
  const next = upsertEnvKey(existing, key, value)

  // Write with restrictive perms. writeFileSync's `mode` option only
  // applies if we're creating the file, so chmod unconditionally.
  writeFileSync(ENV_PATH, next, { mode: 0o600 })
  chmodSync(ENV_PATH, 0o600)

  console.log(`Saved ${key} to app/.env (${value.length} chars)`)
}

// Only run the CLI when this file is invoked directly (not when
// imported for unit tests).
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
