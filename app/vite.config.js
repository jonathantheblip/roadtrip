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

  return {
    plugins: [react()],
    base: './',
    define: clientDefine,
    build: {
      outDir: '../docs',
      emptyOutDir: true,
      sourcemap: false,
    },
    server: {
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
