import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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
  // Face-engine CDNs — allowed here so faces would work if flipped on; slice
  // 4b self-hosts the runtime + models and DROPS these from connect-src.
  const faceEngine = 'https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://cdn-lfs.huggingface.co'
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: https://*.basemaps.cartocdn.com ${infra}`.trim(),
    `media-src 'self' blob: data: ${infra}`.trim(),
    `connect-src 'self' https://nominatim.openstreetmap.org ${faceEngine} ${infra}`.trim(),
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
    transformIndexHtml() {
      return [{
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
        injectTo: 'head-prepend',
      }]
    },
  }

  return {
    plugins: [react(), cspPlugin],
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
