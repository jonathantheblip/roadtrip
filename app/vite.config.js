import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

// Relative base so the same build works at the repo root and under /roadtrip
// on GitHub Pages without needing to hard-code a path.
//
// /openai-proxy/* is a dev-only proxy (spec §7) — Vite injects the
// OPENAI_API_KEY from the repo-root .env (server-side, never bundled
// into the client) and forwards to api.openai.com. In production,
// VITE_WHISPER_PROXY points at a Cloudflare Worker that does the same
// key injection.
export default defineConfig(({ mode }) => {
  // loadEnv reads from the repo root (one level up from app/) so the
  // existing .env at the project root is honored.
  const env = loadEnv(mode, process.cwd() + '/..', '')
  const openaiKey = env.OPENAI_API_KEY || ''
  // Forward VITE_-prefixed vars from the repo-root .env into the client
  // bundle. Keeps a single .env at the repo root (already .gitignored)
  // instead of mirroring it into app/.
  const clientDefine = Object.fromEntries(
    Object.entries(env)
      .filter(([k]) => k.startsWith('VITE_'))
      .map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)])
  )

  // ── Content-Security-Policy (Build W4 slice 4a — faces pre-promotion
  // hygiene). Injected as a <meta> ONLY in the production build (apply:
  // 'build') — the dev server relies on inline HMR scripts a strict CSP would
  // block. The point: on the page that (once faces flip on) decodes family
  // photos + runs the on-device model, NO external JavaScript may execute
  // (script-src 'self' 'wasm-unsafe-eval' — the WASM engine needs the latter).
  // Every OTHER directive is the tightest allow-list of the origins the app
  // actually loads, derived from a grounded inventory — a wrong one silently
  // breaks the map/photos/fonts, so this is verified in a real prod build
  // across all 4 lenses before it ships. The worker/whisper origins are baked
  // from build env so it stays correct per-environment.
  const originOf = (u) => { try { return new URL(u).origin } catch { return '' } }
  const worker = originOf(env.VITE_WORKER_URL)
  const whisper = originOf(env.VITE_WHISPER_PROXY)
  const infra = [worker, whisper].filter(Boolean).join(' ')
  // Slice 4b: the ONNX runtime WASM + the face models are now SELF-HOSTED
  // same-origin (see ortWasmPlugin below + public/models/), so NO external
  // face-engine origin (jsdelivr / huggingface) remains in connect-src — the
  // page can fetch code + model data ONLY from 'self'. This is what actually
  // closes the "external code executes on the photo page" gap: 4a's CSP alone
  // still allowed jsdelivr WASM via connect-src ('wasm-unsafe-eval' instantiates
  // fetched bytes regardless of origin).
  // script-src forbids ALL external + injected JS. The app's OWN inline scripts
  // (the pre-React person/theme bootstrap in index.html — it MUST stay inline +
  // zero-latency to set the theme before first paint, else an installed PWA
  // flashes the wrong person/tint for a frame) are admitted by their sha256
  // hash, computed from the FINAL built HTML at inject time so it never drifts.
  const cspFor = (scriptSrc) => [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: https://*.basemaps.cartocdn.com ${infra}`.trim(),
    `media-src 'self' blob: data: ${infra}`.trim(),
    `connect-src 'self' https://nominatim.openstreetmap.org ${infra}`.trim(),
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "manifest-src 'self'",
    "form-action 'self'",
  ].join('; ')
  const cspPlugin = {
    name: 'inject-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post', // run last so we hash the inline scripts as actually served
      handler(html) {
        const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
        const hashes = inline.map((s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`)
        const scriptSrc = ["script-src 'self' 'wasm-unsafe-eval'", ...hashes].join(' ')
        return {
          html,
          tags: [{
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: cspFor(scriptSrc) },
            injectTo: 'head-prepend',
          }],
        }
      },
    },
  }

  // ── Self-host the onnxruntime-web WASM (Build W4 slice 4b). The face engine
  // uses the "external wasm" build variant (see resolve.conditions below): the
  // multi-MB .wasm + its emscripten .mjs glue are fetched at RUNTIME from
  // env.wasm.wasmPaths rather than bundled. We copy them from node_modules into
  // <outDir>/ort/ at build so they are served SAME-ORIGIN (in lockstep with the
  // installed package — never committed, never a stale CDN copy). faceModel.js
  // points wasmPaths at ort/ (absolutized against document.baseURI at runtime,
  // so the .mjs dynamic import() resolves to site-root /ort/ where these emit —
  // NOT module-relative to the ORT chunk in /assets/).
  //
  // The variant is DERIVED from the emitted webgpu chunk (which .mjs it actually
  // references) rather than hardcoded — a hardcoded 'jsep' was the wrong file
  // (the /webgpu entry uses 'asyncify') and 404'd silently. Auto-deriving keeps
  // it correct across ORT upgrades and FAILS the build loudly if the referenced
  // glue is missing from node_modules.
  let resolvedOutDir = ''
  const ortWasmPlugin = {
    name: 'self-host-ort-wasm',
    apply: 'build',
    configResolved(cfg) { resolvedOutDir = cfg.build.outDir },
    closeBundle() {
      const dist = resolve(process.cwd(), 'node_modules/onnxruntime-web/dist')
      const assetsDir = resolve(resolvedOutDir, 'assets')
      const outOrt = resolve(resolvedOutDir, 'ort')
      // Which ORT wasm glue does the built bundle actually request?
      const referenced = new Set()
      // Scan ALL js chunks for the very specific ort-wasm-*.mjs literal rather
      // than guessing the ORT chunk's (hashed) filename — robust to chunk-naming.
      const chunks = existsSync(assetsDir)
        ? readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
        : []
      for (const c of chunks) {
        const txt = readFileSync(resolve(assetsDir, c), 'utf8')
        for (const m of txt.matchAll(/ort-wasm-[a-z0-9.-]+\.mjs/g)) referenced.add(m[0])
      }
      if (!referenced.size) {
        this.error('self-host-ort-wasm: no ort wasm glue referenced in the build — the ORT entry may have changed; refusing to ship a faces engine that would 404')
        return
      }
      mkdirSync(outOrt, { recursive: true })
      for (const mjs of referenced) {
        for (const f of [mjs, mjs.replace(/\.mjs$/, '.wasm')]) {
          const src = resolve(dist, f)
          if (existsSync(src)) copyFileSync(src, resolve(outOrt, f))
          else this.error(`self-host-ort-wasm: ${f} (referenced by the build) missing in node_modules — faces engine would 404`)
        }
      }
    },
  }

  return {
    plugins: [react(), cspPlugin, ortWasmPlugin],
    base: './',
    define: clientDefine,
    resolve: {
      // onnxruntime-web (the face recognizer's embedding engine) ships an
      // "external wasm" build variant behind this export condition. Selecting
      // it makes ORT fetch its multi-MB .wasm from env.wasm.wasmPaths (a CDN,
      // or a self-hosted copy later) at runtime instead of Vite emitting a
      // ~24MB copy into the bundle. The condition name is ORT-specific, so it
      // does not affect any other dependency. Defaults are preserved.
      conditions: [
        'onnxruntime-web-use-extern-wasm',
        'module',
        'browser',
        'development|production',
      ],
    },
    // Force pre-bundling of react-markdown's unified/mdast/micromark/rehype
    // tree at startup. Without this, the first request that imports
    // ClaudeChat.jsx triggers a ~34s cold bundle that blows past
    // Playwright's 30s page.goto budget. Pre-bundling moves the cost
    // into vite startup so test runs are deterministic.
    optimizeDeps: {
      include: [
        'react-markdown',
        'remark-gfm',
        'remark-breaks',
        'rehype-external-links',
      ],
    },
    build: {
      outDir: '../docs',
      emptyOutDir: true,
      sourcemap: false,
    },
    server: {
      // Vite's default FS-allow check rejects any request whose URL
      // looks like a path-traversal — including innocent query strings
      // with lots of `%2F`-encoded slashes (which the Share-In flow
      // produces when `?url=https%3A%2F%2F…` is passed at boot). Turning
      // off strict mode only relaxes dev-server behavior; production
      // builds don't go through this middleware.
      fs: { strict: false },
      proxy: {
        '/openai-proxy': {
          target: 'https://api.openai.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/openai-proxy/, '/v1'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (openaiKey) {
                proxyReq.setHeader('Authorization', `Bearer ${openaiKey}`)
              }
            })
          },
        },
      },
    },
  }
})
