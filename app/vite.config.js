import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the same build works at the repo root and under /roadtrip
// on GitHub Pages without needing to hard-code a path.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../docs',
    emptyOutDir: true,
    sourcemap: false,
  },
})
